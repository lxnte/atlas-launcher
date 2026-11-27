//! Windows process helpers: launching games (ShellExecuteEx, handles UAC / .lnk / .bat),
//! and the tiny background tracker that counts playtime after Atlas closes.

use std::os::windows::process::CommandExt;
use std::path::Path;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, GetProcessId, OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject, INFINITE,
};
use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const SYNCHRONIZE: u32 = 0x0010_0000;
const STILL_ACTIVE: u32 = 259;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Opens a URL / protocol (steam://...) or folder with the default handler.
pub fn open(target: &str) {
    let _ = std::process::Command::new("explorer.exe").arg(target).spawn();
}

pub fn reveal(path: &str) {
    let p = Path::new(path);
    if p.is_dir() {
        let _ = std::process::Command::new("explorer.exe").arg(path).spawn();
    } else {
        let _ = std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{path}\"")).spawn();
    }
}

/// Starts a file the way double-clicking it would. Returns the PID (0 if unknown).
pub fn shell_launch(file: &str, args: &str, dir: &str) -> Result<u32, String> {
    unsafe {
        let f = wide(file);
        let a = wide(args);
        let d = wide(dir);
        let verb = wide("open");
        let mut sei: SHELLEXECUTEINFOW = std::mem::zeroed();
        sei.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.lpVerb = verb.as_ptr();
        sei.lpFile = f.as_ptr();
        sei.lpParameters = if args.is_empty() { std::ptr::null() } else { a.as_ptr() };
        sei.lpDirectory = d.as_ptr();
        sei.nShow = SW_SHOWNORMAL;
        if ShellExecuteExW(&mut sei) == 0 {
            return Err(format!("Could not start the game: {}", std::io::Error::last_os_error()));
        }
        let mut pid = 0;
        if !sei.hProcess.is_null() {
            pid = GetProcessId(sei.hProcess);
            CloseHandle(sei.hProcess);
        }
        Ok(pid)
    }
}

pub fn is_alive(pid: u32) -> bool {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return false;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(h, &mut code) != 0;
        CloseHandle(h);
        ok && code == STILL_ACTIVE
    }
}

fn wait_pid(pid: u32) {
    unsafe {
        let h = OpenProcess(SYNCHRONIZE, 0, pid);
        if h.is_null() {
            return;
        }
        WaitForSingleObject(h, INFINITE);
        CloseHandle(h);
    }
}

fn image_path(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(h);
        ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// First running process whose executable lives inside `dir`.
fn find_in_dir(dir: &str) -> Option<u32> {
    let dir = dir.to_lowercase();
    let me = std::process::id();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE || snap.is_null() {
            return None;
        }
        let mut pe: PROCESSENTRY32W = std::mem::zeroed();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut found = None;
        if Process32FirstW(snap, &mut pe) != 0 {
            loop {
                let pid = pe.th32ProcessID;
                if pid != 0 && pid != me {
                    if let Some(p) = image_path(pid) {
                        if p.to_lowercase().starts_with(&dir) {
                            found = Some(pid);
                            break;
                        }
                    }
                }
                if Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
        found
    }
}

/// PIDs of every running process with this exe name (case-insensitive), e.g. "steamwebhelper.exe".
pub fn pids_named(exe: &str) -> Vec<u32> {
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE || snap.is_null() {
            return out;
        }
        let mut pe: PROCESSENTRY32W = std::mem::zeroed();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut pe) != 0 {
            loop {
                let len = pe.szExeFile.iter().position(|&c| c == 0).unwrap_or(pe.szExeFile.len());
                if String::from_utf16_lossy(&pe.szExeFile[..len]).eq_ignore_ascii_case(exe) {
                    out.push(pe.th32ProcessID);
                }
                if Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

/// Folder used to follow "launcher -> real game" handoffs. None for shallow/system folders.
pub fn track_dir(exe: &str) -> Option<String> {
    let p = Path::new(exe);
    if !p.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) {
        return None;
    }
    let dir = p.parent()?.to_string_lossy().trim_end_matches('\\').to_string() + "\\";
    let depth = dir.split('\\').filter(|s| !s.is_empty()).count();
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into()).to_lowercase();
    if depth < 3 || dir.to_lowercase().starts_with(&windir) {
        return None;
    }
    Some(dir)
}

pub struct TrackInfo<'a> {
    pub id: &'a str,
    pub pid: u32,
    pub dir: Option<&'a str>,
    pub name: &'a str,
    pub art: Option<&'a str>,
}

/// Only used for non-Steam games — Steam keeps its own play time.
pub fn spawn_tracker(t: TrackInfo) {
    if let Ok(me) = std::env::current_exe() {
        let _ = std::process::Command::new(me)
            .args(["--track", t.id, &t.pid.to_string(), t.dir.unwrap_or("-"), t.name, t.art.unwrap_or("-")])
            .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
            .spawn();
    }
}

/// `atlas.exe --track <id> <pid> <dir|-> <name> <art|->`
/// No window, ~1 MB RAM. Counts play time for a non-Steam game, shows it on Discord,
/// and exits as soon as the game closes.
pub fn run_tracker(a: &[String]) {
    let (Some(id), Some(pid)) = (a.first(), a.get(1).and_then(|p| p.parse::<u32>().ok())) else { return };
    let dir = a.get(2).filter(|d| d.as_str() != "-").cloned();
    let name = a.get(3).cloned().unwrap_or_default();
    let art = a.get(4).filter(|d| d.as_str() != "-").cloned();

    let start = Instant::now();
    let start_unix = crate::store::now_ms() / 1000;
    crate::store::set_running(id, std::process::id());
    if !name.is_empty() {
        crate::discord::show_in_background(name, art, start_unix);
    }
    if pid != 0 {
        wait_pid(pid);
    }
    let mut grace = Duration::ZERO;
    if let Some(d) = &dir {
        let mut misses = 0;
        let mut miss_start: Option<Instant> = None;
        while misses < 6 {
            match find_in_dir(d) {
                Some(p) => {
                    misses = 0;
                    miss_start = None;
                    wait_pid(p);
                }
                None => {
                    misses += 1;
                    miss_start.get_or_insert_with(Instant::now);
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        }
        grace = miss_start.map(|m| m.elapsed()).unwrap_or_default();
    }
    let secs = start.elapsed().saturating_sub(grace).as_secs_f64();
    if secs >= 5.0 {
        crate::store::add_playtime(id, secs / 60.0);
    }
    crate::store::clear_running(id);
}

/// Total size of a folder in bytes (for non-Steam games).
pub fn folder_size(dir: &Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                stack.push(e.path());
            } else if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
}
