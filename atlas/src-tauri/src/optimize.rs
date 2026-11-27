//! Steam optimizer.
//!
//! Steam is two things: a small core (steam.exe — licences, anti-cheat, multiplayer, cloud saves)
//! and a big interface (steamwebhelper.exe, a full Chromium browser, ~600 MB). Games only need
//! the core. Atlas keeps the core untouched and makes the interface as cheap as possible:
//!   * lighter Steam settings (no start with Windows, no overlay, no GPU-accelerated interface)
//!   * Game Boost: while a Steam game runs, the interface gets idle priority, its memory is handed
//!     back to Windows, and (optionally) it is paused completely. Everything is restored afterwards.

use crate::{steam, store, winproc};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::Threading::OpenProcess;

#[repr(C)]
struct MemCounters {
    cb: u32,
    page_fault_count: u32,
    peak_working_set: usize,
    working_set: usize,
    quota_peak_paged_pool: usize,
    quota_paged_pool: usize,
    quota_peak_non_paged_pool: usize,
    quota_non_paged_pool: usize,
    pagefile_usage: usize,
    peak_pagefile_usage: usize,
}

#[link(name = "ntdll")]
extern "system" {
    fn NtSuspendProcess(h: HANDLE) -> i32;
    fn NtResumeProcess(h: HANDLE) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn K32EmptyWorkingSet(h: HANDLE) -> i32;
    fn K32GetProcessMemoryInfo(h: HANDLE, c: *mut MemCounters, cb: u32) -> i32;
    fn SetPriorityClass(h: HANDLE, class: u32) -> i32;
}

const ACCESS: u32 = 0x0800 | 0x0200 | 0x0100 | 0x0400 | 0x0010; // suspend/resume, set info, set quota, query, vm read
const IDLE: u32 = 0x40;
const NORMAL: u32 = 0x20;
const UI: &str = "steamwebhelper.exe";

fn with_process(pid: u32, f: impl FnOnce(HANDLE)) {
    unsafe {
        let h = OpenProcess(ACCESS, 0, pid);
        if !h.is_null() {
            f(h);
            CloseHandle(h);
        }
    }
}

/// RAM used by Steam's interface right now, in bytes.
pub fn ui_memory() -> u64 {
    let mut total = 0u64;
    for pid in winproc::pids_named(UI) {
        with_process(pid, |h| unsafe {
            let mut m: MemCounters = std::mem::zeroed();
            m.cb = std::mem::size_of::<MemCounters>() as u32;
            if K32GetProcessMemoryInfo(h, &mut m, m.cb) != 0 {
                total += m.working_set as u64;
            }
        });
    }
    total
}

/// Undo any Game Boost (used at Atlas start in case a boost was interrupted).
pub fn wake_ui() {
    for pid in winproc::pids_named(UI) {
        with_process(pid, |h| unsafe {
            NtResumeProcess(h);
            SetPriorityClass(h, NORMAL);
        });
    }
}

fn setting(key: &str, default: bool) -> bool {
    store::load_config().pointer(&format!("/settings/{key}")).and_then(|v| v.as_bool()).unwrap_or(default)
}

pub fn boost_enabled() -> bool {
    setting("gameBoost", true)
}

/// `atlas.exe --boost <appid>`: runs only while that Steam game is running.
pub fn run_boost(a: &[String]) {
    let Some(appid) = a.first().and_then(|s| s.parse::<u32>().ok()) else { return };
    let pause = setting("boostPause", false);
    // Steam may still be starting, updating or showing a launcher
    let t0 = Instant::now();
    while steam::running_app() != Some(appid) {
        if t0.elapsed() > Duration::from_secs(180) {
            return;
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    store::set_running("boost", std::process::id());
    let mut paused: HashSet<u32> = HashSet::new();
    let mut last_trim = Instant::now();
    let mut first = true;
    while steam::running_app() == Some(appid) {
        let retrim = first || last_trim.elapsed() > Duration::from_secs(30);
        for pid in winproc::pids_named(UI) {
            let new = !paused.contains(&pid);
            if new || retrim {
                with_process(pid, |h| unsafe {
                    SetPriorityClass(h, IDLE);
                    K32EmptyWorkingSet(h);
                    if pause && new {
                        NtSuspendProcess(h);
                    }
                });
                paused.insert(pid);
            }
        }
        if retrim {
            last_trim = Instant::now();
        }
        first = false;
        std::thread::sleep(Duration::from_secs(3));
    }
    for pid in winproc::pids_named(UI) {
        with_process(pid, |h| unsafe {
            if pause && paused.contains(&pid) {
                NtResumeProcess(h);
            }
            SetPriorityClass(h, NORMAL);
        });
    }
    store::clear_running("boost");
}

pub fn spawn_boost(appid: &str) {
    use std::os::windows::process::CommandExt;
    if let Ok(me) = std::env::current_exe() {
        let _ = std::process::Command::new(me)
            .args(["--boost", appid])
            .creation_flags(0x0000_0008 | 0x0800_0000 | 0x0000_0200)
            .spawn();
    }
}

// ---------------- lighter Steam settings ----------------

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

fn starts_with_windows() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER).open_subkey(RUN_KEY).and_then(|k| k.get_value::<String, _>("Steam")).is_ok()
}

fn gpu_interface() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .and_then(|k| k.get_value::<u32, _>("GPUAccelWebViewsV3"))
        .map(|v| v != 0)
        .unwrap_or(true) // Steam's default is on
}

fn localconfig() -> Option<PathBuf> {
    let p = steam::user_dir(&steam::steam_path()?)?.join("config").join("localconfig.vdf");
    p.is_file().then_some(p)
}

fn overlay_on() -> bool {
    let Some(p) = localconfig() else { return false };
    let Ok(t) = fs::read(&p) else { return false };
    let v = crate::vdf::parse(&String::from_utf8_lossy(&t));
    v.path(&["UserLocalConfigStore", "system", "EnableGameOverlay"]).and_then(|x| x.str()).map(|s| s != "0").unwrap_or(true)
}

pub fn steam_running() -> bool {
    !winproc::pids_named("steam.exe").is_empty()
}

pub fn status() -> Value {
    json!({
        "found": steam::steam_path().is_some(),
        "running": steam_running(),
        "startup": starts_with_windows(),
        "gpu": gpu_interface(),
        "overlay": overlay_on(),
        "uiMemory": ui_memory(),
    })
}

/// Writes "EnableGameOverlay" "0"/"1" into localconfig.vdf (the first time, a backup is kept next to it).
fn overlay_write(p: &Path, on: bool) -> std::io::Result<bool> {
    let t = fs::read_to_string(p)?;
    let backup = p.with_extension("vdf.atlas-backup");
    if !backup.exists() {
        fs::copy(p, &backup)?;
    }
    let key = "\"EnableGameOverlay\"";
    let val = if on { "1" } else { "0" };
    let out = if let Some(i) = t.find(key) {
        let end = t[i..].find('\n').map(|e| i + e).unwrap_or(t.len());
        let cr = if t[i..end].ends_with('\r') { "\r" } else { "" };
        format!("{}{}\t\t\"{}\"{}{}", &t[..i], key, val, cr, &t[end..])
    } else if let Some(s) = t.find("\"system\"") {
        let Some(b) = t[s..].find('{').map(|b| s + b + 1) else { return Ok(false) };
        format!("{}\n\t\t\t{}\t\t\"{}\"{}", &t[..b], key, val, &t[b..])
    } else {
        return Ok(false);
    };
    fs::write(p, out)?;
    Ok(true)
}

/// Asks Steam to quit and waits for it (up to 30 s).
fn close_steam() -> bool {
    let Some(sp) = steam::steam_path() else { return false };
    let _ = std::process::Command::new(sp.join("steam.exe")).arg("-shutdown").spawn();
    let t0 = Instant::now();
    while steam_running() {
        if t0.elapsed() > Duration::from_secs(30) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    std::thread::sleep(Duration::from_millis(800));
    true
}

/// Where Atlas remembers Steam's own startup entry, so turning it back on restores it exactly.
fn startup_backup() -> PathBuf {
    store::data_dir().join("steam-startup.txt")
}

/// Turns one optimization on (`optimized = true`) or back off. Every change is reversible.
/// The overlay lives in a file Steam rewrites when it exits, so it only changes while Steam is
/// closed: with `close` Atlas closes Steam first, otherwise the change waits ("pending").
pub fn set(key: &str, optimized: bool, close: bool) -> Value {
    use winreg::{enums::*, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut ok = false;
    let mut pending = false;
    match key {
        "startup" => {
            let run = hkcu.create_subkey(RUN_KEY).map(|(k, _)| k);
            if let Ok(k) = run {
                if optimized {
                    if let Ok(v) = k.get_value::<String, _>("Steam") {
                        let _ = fs::write(startup_backup(), &v);
                        ok = k.delete_value("Steam").is_ok();
                    } else {
                        ok = true;
                    }
                } else {
                    let cmd = fs::read_to_string(startup_backup()).ok().filter(|s| !s.trim().is_empty()).or_else(|| {
                        steam::steam_path().map(|p| format!("\"{}\" -silent", p.join("steam.exe").display()))
                    });
                    if let Some(cmd) = cmd {
                        ok = k.set_value("Steam", &cmd).is_ok();
                    }
                }
            }
        }
        "gpu" => {
            if let Ok((k, _)) = hkcu.create_subkey("Software\\Valve\\Steam") {
                ok = k.set_value("GPUAccelWebViewsV3", &(if optimized { 0u32 } else { 1u32 })).is_ok();
            }
        }
        "overlay" => {
            if steam_running() && close {
                close_steam();
            }
            if steam_running() {
                pending = true;
            } else if let Some(p) = localconfig() {
                ok = overlay_write(&p, !optimized).unwrap_or(false);
            }
        }
        _ => {}
    }
    json!({ "ok": ok, "pending": pending, "status": status() })
}

/// First-run setup: applies the chosen optimizations (only the ones not already in place).
pub fn apply(startup: bool, gpu: bool, overlay: bool, close: bool) -> Value {
    let mut done = Vec::new();
    let mut pending = false;
    if startup && starts_with_windows() && set("startup", true, false)["ok"] == true {
        done.push("startup");
    }
    if gpu && gpu_interface() && set("gpu", true, false)["ok"] == true {
        done.push("gpu");
    }
    if overlay && overlay_on() {
        let r = set("overlay", true, close);
        if r["pending"] == true {
            pending = true;
        } else if r["ok"] == true {
            done.push("overlay");
        }
    }
    json!({ "done": done, "overlayPending": pending, "status": status() })
}