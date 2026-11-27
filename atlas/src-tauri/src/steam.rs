//! Reads the local Steam install: libraries, installed games, owned games,
//! playtime (from localconfig.vdf), names/icons (from appinfo.vdf) and cached artwork.

use crate::vdf::{self, Vdf};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Assets {
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub header: Option<String>,
    pub icon: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SteamGame {
    pub app_id: String,
    pub name: String,
    pub installed: bool,
    pub install_dir: Option<String>,
    pub size_on_disk: u64,
    pub playtime_min: u64,
    pub last_played: u64,
    pub icon_url: Option<String>,
    pub assets: Assets,
    pub logo_pos: Option<LogoPos>,
}

/// Where Steam pins the logo on the hero banner (from appinfo library_assets).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogoPos {
    pub pin: String,
    pub w: f32,
    pub h: f32,
}

// ---------------- friends (official Steam Web API, user's own key) ----------------

/// SteamID64 of the account last signed in to Steam on this PC.
pub fn my_steamid() -> Option<String> {
    let sp = steam_path()?;
    let root = read_vdf(&sp.join("config").join("loginusers.vdf"))?;
    let users = root.get("users")?;
    let mut best: Option<(String, u64)> = None;
    for (id, u) in users.entries() {
        let score = if u.get_str("MostRecent") == Some("1") { u64::MAX } else { u.get_str("Timestamp").and_then(|s| s.parse().ok()).unwrap_or(0) };
        if best.as_ref().map(|b| score > b.1).unwrap_or(true) {
            best = Some((id.clone(), score));
        }
    }
    best.map(|b| b.0)
}

/// Friends with their status and current game. Needs the user's own Web API key and a
/// friends list that is visible (Steam privacy: Friends List = Public).
pub fn friends(key: &str) -> Result<Vec<serde_json::Value>, String> {
    use serde_json::{json, Value};
    let me = my_steamid().ok_or("Couldn't find your Steam account on this PC.")?;
    let get = |url: &str, q: &[(&str, &str)]| -> Result<Value, String> {
        let mut r = ureq::get(url).timeout(std::time::Duration::from_secs(10));
        for (k, v) in q {
            r = r.query(k, v);
        }
        match r.call() {
            Ok(resp) => resp.into_json::<Value>().map_err(|e| e.to_string()),
            Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
                Err("Steam refused the request. Check that the API key is right and that your Friends List is public in Steam's privacy settings.".into())
            }
            Err(e) => Err(format!("Couldn't reach Steam: {e}")),
        }
    };
    let list = get("https://api.steampowered.com/ISteamUser/GetFriendList/v1/", &[("key", key), ("steamid", &me), ("relationship", "friend")])?;
    let ids: Vec<String> = list["friendslist"]["friends"]
        .as_array()
        .map(|a| a.iter().filter_map(|f| f["steamid"].as_str().map(String::from)).collect())
        .unwrap_or_default();
    let mut out = Vec::new();
    for chunk in ids.chunks(100) {
        let joined = chunk.join(",");
        let s = get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/", &[("key", key), ("steamids", &joined)])?;
        for p in s["response"]["players"].as_array().cloned().unwrap_or_default() {
            out.push(json!({
                "id": p["steamid"], "name": p["personaname"], "avatar": p["avatarmedium"],
                "state": p["personastate"].as_u64().unwrap_or(0),
                "game": p["gameextrainfo"], "gameId": p["gameid"],
                "lastOnline": p["lastlogoff"].as_u64().unwrap_or(0) * 1000,
            }));
        }
    }
    Ok(out)
}

// ---------------- downloads ----------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub app_id: String,
    pub name: String,
    /// "downloading" | "paused" | "queued" | "installing"
    pub state: &'static str,
    pub done: u64,
    pub total: u64,
}

fn dir_size(d: &Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![d.to_path_buf()];
    while let Some(p) = stack.pop() {
        let Ok(rd) = fs::read_dir(&p) else { continue };
        for e in rd.flatten() {
            match e.file_type() {
                Ok(t) if t.is_dir() => stack.push(e.path()),
                Ok(_) => total += e.metadata().map(|m| m.len()).unwrap_or(0),
                _ => {}
            }
        }
    }
    total
}

/// Installs and updates Steam is working on right now, read from the app manifests
/// (StateFlags + byte counters) and the size of steamapps\downloading\<appid>.
pub fn downloads() -> Vec<Download> {
    const UPDATE_REQUIRED: u64 = 2;
    const UPDATE_RUNNING: u64 = 256;
    const UPDATE_PAUSED: u64 = 512;
    const UPDATE_STARTED: u64 = 1024;
    const PREALLOCATING: u64 = 524288;
    const DOWNLOADING: u64 = 1048576;
    const STAGING: u64 = 2097152;
    const COMMITTING: u64 = 4194304;
    let Some(sp) = steam_path() else { return vec![] };
    let mut out = Vec::new();
    for lib in libraries(&sp) {
        let dir = lib.join("steamapps");
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let fname = e.file_name().to_string_lossy().to_lowercase();
            if !(fname.starts_with("appmanifest_") && fname.ends_with(".acf")) {
                continue;
            }
            let Some(root) = read_vdf(&e.path()) else { continue };
            let Some(st) = root.get("AppState") else { continue };
            let flags: u64 = st.get_str("StateFlags").and_then(|s| s.parse().ok()).unwrap_or(0);
            let num = |k: &str| st.get_str(k).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let (mut done, total) = (num("BytesDownloaded"), num("BytesToDownload"));
            let busy = flags & (UPDATE_RUNNING | UPDATE_STARTED | DOWNLOADING | STAGING | COMMITTING | PREALLOCATING) != 0;
            let state = if flags & UPDATE_PAUSED != 0 {
                "paused"
            } else if flags & (STAGING | COMMITTING) != 0 {
                "installing"
            } else if busy {
                "downloading"
            } else if flags & UPDATE_REQUIRED != 0 && total > done {
                "queued"
            } else {
                continue;
            };
            let id = st.get_str("appid").unwrap_or("").to_string();
            // Steam only writes the counters every so often: the download folder grows live
            let live = dir_size(&dir.join("downloading").join(&id));
            if live > done && live <= total.max(live) {
                done = live.min(total.max(live));
            }
            out.push(Download { app_id: id, name: st.get_str("name").unwrap_or("").to_string(), state, done, total });
        }
    }
    out
}

/// Launch options the user already set inside Steam for this game (Properties > General).
pub fn launch_options(app_id: u32) -> String {
    let Some(sp) = steam_path() else { return String::new() };
    let Some(ud) = user_dir(&sp) else { return String::new() };
    read_vdf(&ud.join("config").join("localconfig.vdf"))
        .and_then(|v| {
            v.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps", &app_id.to_string(), "LaunchOptions"])
                .and_then(|x| x.str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default()
}

/// Splits "-novid +fps_max 0 -foo \"a b\"" into arguments, keeping quoted parts together.
pub fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in s.chars() {
        match c {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Starts a Steam game through Steam with extra launch options (no Steam dialog, no file changes).
pub fn launch_with_options(app_id: &str, options: &str) -> bool {
    let Some(sp) = steam_path() else { return false };
    std::process::Command::new(sp.join("steam.exe"))
        .arg("-applaunch")
        .arg(app_id)
        .args(split_args(options))
        .spawn()
        .is_ok()
}

/// The Steam game running right now. Steam itself keeps this in the registry,
/// so Atlas knows without watching any process.
pub fn running_app() -> Option<u32> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let k = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam").ok()?;
    let id: u32 = k.get_value("RunningAppID").ok()?;
    (id != 0).then_some(id)
}

fn is_steam_dir(p: &Path) -> bool {
    p.join("steam.exe").is_file() || (p.join("steamapps").is_dir() && p.join("config").is_dir())
}

/// Every fixed drive letter that exists (C:\, D:\, ...).
pub fn drives() -> Vec<PathBuf> {
    (b'C'..=b'Z')
        .map(|c| PathBuf::from(format!("{}:\\", c as char)))
        .filter(|p| p.exists())
        .collect()
}

fn registry_candidates() -> Vec<PathBuf> {
    use winreg::{enums::*, RegKey};
    let mut v = Vec::new();
    let clean = |s: String| PathBuf::from(s.trim().trim_matches('"').replace('/', "\\"));
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(k) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(p) = k.get_value::<String, _>("SteamPath") { v.push(clean(p)); }
        if let Ok(p) = k.get_value::<String, _>("SteamExe") { if let Some(d) = clean(p).parent() { v.push(d.to_path_buf()); } }
    }
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for key in ["SOFTWARE\\WOW6432Node\\Valve\\Steam", "SOFTWARE\\Valve\\Steam"] {
        if let Ok(k) = hklm.open_subkey(key) {
            if let Ok(p) = k.get_value::<String, _>("InstallPath") { v.push(clean(p)); }
        }
    }
    // whoever handles steam:// links: "D:\Steam\steam.exe" -- "%1"
    if let Ok(k) = RegKey::predef(HKEY_CLASSES_ROOT).open_subkey("steam\\Shell\\Open\\Command") {
        if let Ok(cmd) = k.get_value::<String, _>("") {
            let exe = cmd.trim().trim_start_matches('"').split('"').next().unwrap_or("").to_string();
            if let Some(d) = Path::new(&exe).parent() { v.push(d.to_path_buf()); }
        }
    }
    v
}

const COMMON_STEAM: [&str; 7] = [
    "Program Files (x86)\\Steam", "Program Files\\Steam", "Steam", "Games\\Steam",
    "Jocuri\\Steam", "Program Files (x86)\\Valve\\Steam", "Apps\\Steam",
];

/// Finds the Steam install wherever it is: user override, registry, link handler, then every drive.
pub fn steam_path() -> Option<PathBuf> {
    if let Some(p) = crate::store::load_config().pointer("/settings/steamPath").and_then(|v| v.as_str()) {
        let p = PathBuf::from(p);
        if is_steam_dir(&p) {
            return Some(p);
        }
    }
    if let Some(p) = registry_candidates().into_iter().find(|p| is_steam_dir(p)) {
        return Some(p);
    }
    for d in drives() {
        for c in COMMON_STEAM {
            let p = d.join(c);
            if is_steam_dir(&p) {
                return Some(p);
            }
        }
    }
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibInfo {
    pub path: String,
    pub games: usize,
}

/// Steam folder + every library folder with how many games it holds (for Settings).
pub fn info() -> serde_json::Value {
    let Some(sp) = steam_path() else { return serde_json::json!({ "path": null, "libraries": [] }) };
    let libs: Vec<LibInfo> = libraries(&sp)
        .into_iter()
        .map(|l| {
            let games = fs::read_dir(l.join("steamapps"))
                .map(|rd| rd.flatten().filter(|e| e.file_name().to_string_lossy().to_lowercase().starts_with("appmanifest_")).count())
                .unwrap_or(0);
            LibInfo { path: l.to_string_lossy().into_owned(), games }
        })
        .collect();
    let manual = crate::store::load_config().pointer("/settings/steamPath").and_then(|v| v.as_str()).is_some();
    serde_json::json!({ "path": sp, "libraries": libs, "manual": manual })
}

pub fn is_valid_steam(p: &Path) -> bool {
    is_steam_dir(p)
}

fn read_vdf(p: &Path) -> Option<Vdf> {
    let bytes = fs::read(p).ok()?;
    Some(vdf::parse(&String::from_utf8_lossy(&bytes)))
}

fn libraries(sp: &Path) -> Vec<PathBuf> {
    let mut v = vec![sp.to_path_buf()];
    let mut add = |pb: PathBuf| {
        let s = pb.to_string_lossy().trim_end_matches('\\').to_lowercase();
        if pb.join("steamapps").is_dir() && !v.iter().any(|x| x.to_string_lossy().trim_end_matches('\\').to_lowercase() == s) {
            v.push(pb);
        }
    };
    // what Steam itself knows about (older Steam versions used numbered keys holding the path)
    for f in ["libraryfolders.vdf"] {
        for base in [sp.join("steamapps"), sp.join("config")] {
            if let Some(root) = read_vdf(&base.join(f)) {
                if let Some(lf) = root.get("libraryfolders").or_else(|| root.get("LibraryFolders")) {
                    for (k, e) in lf.entries() {
                        if let Some(p) = e.get_str("path") {
                            add(PathBuf::from(p));
                        } else if let (true, Some(p)) = (k.chars().all(|c| c.is_ascii_digit()), e.str()) {
                            add(PathBuf::from(p));
                        }
                    }
                }
            }
        }
    }
    // plus the usual library folder names on every drive, in case Steam's list is stale
    for d in drives() {
        for c in ["SteamLibrary", "Steam", "Games\\SteamLibrary", "Jocuri\\SteamLibrary", "Program Files (x86)\\Steam", "Program Files\\Steam"] {
            add(d.join(c));
        }
    }
    v
}

struct Installed {
    name: String,
    dir: PathBuf,
    size: u64,
}

fn installed(libs: &[PathBuf]) -> HashMap<u32, Installed> {
    let mut out = HashMap::new();
    for lib in libs {
        let dir = lib.join("steamapps");
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let fname = e.file_name().to_string_lossy().to_lowercase();
            if !(fname.starts_with("appmanifest_") && fname.ends_with(".acf")) {
                continue;
            }
            let Some(root) = read_vdf(&e.path()) else { continue };
            let Some(st) = root.get("AppState") else { continue };
            let Some(id) = st.get_str("appid").and_then(|s| s.parse::<u32>().ok()) else { continue };
            out.insert(
                id,
                Installed {
                    name: st.get_str("name").unwrap_or("").to_string(),
                    dir: dir.join("common").join(st.get_str("installdir").unwrap_or("")),
                    size: st.get_str("SizeOnDisk").and_then(|s| s.parse().ok()).unwrap_or(0),
                },
            );
        }
    }
    out
}

/// userdata/<accountid> of the most recently logged-in user.
pub fn user_dir(sp: &Path) -> Option<PathBuf> {
    const BASE: u64 = 76561197960265728;
    let ud = sp.join("userdata");
    if let Some(root) = read_vdf(&sp.join("config").join("loginusers.vdf")) {
        if let Some(users) = root.get("users") {
            let mut best: Option<(u64, u64)> = None; // (accountid, timestamp)
            for (id64, u) in users.entries() {
                let Ok(id) = id64.parse::<u64>() else { continue };
                if id < BASE {
                    continue;
                }
                let recent = u.get_str("MostRecent") == Some("1");
                let ts: u64 = u.get_str("Timestamp").and_then(|s| s.parse().ok()).unwrap_or(0);
                let score = if recent { u64::MAX } else { ts };
                if best.map(|b| score > b.1).unwrap_or(true) {
                    best = Some((id - BASE, score));
                }
            }
            if let Some((acc, _)) = best {
                let p = ud.join(acc.to_string());
                if p.join("config").join("localconfig.vdf").exists() {
                    return Some(p);
                }
            }
        }
    }
    // fallback: newest localconfig
    fs::read_dir(&ud)
        .ok()?
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let m = fs::metadata(p.join("config").join("localconfig.vdf")).ok()?.modified().ok()?;
            Some((m, p))
        })
        .max_by_key(|(m, _)| *m)
        .map(|(_, p)| p)
}

/// appid -> (minutes played, last played unix seconds)
fn playtimes(user: &Path) -> HashMap<u32, (u64, u64)> {
    let mut out = HashMap::new();
    let Some(root) = read_vdf(&user.join("config").join("localconfig.vdf")) else { return out };
    let Some(apps) = root.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]) else {
        return out;
    };
    for (k, e) in apps.entries() {
        let Ok(id) = k.parse::<u32>() else { continue };
        let pt = e.get_str("Playtime").and_then(|s| s.parse().ok()).unwrap_or(0);
        let lp = e.get_str("LastPlayed").and_then(|s| s.parse().ok()).unwrap_or(0);
        out.insert(id, (pt, lp));
    }
    out
}

/// Apps that the Steam client has library artwork cached for (= the games in your library).
fn cache_ids(sp: &Path) -> HashSet<u32> {
    let mut s = HashSet::new();
    if let Ok(rd) = fs::read_dir(sp.join("appcache").join("librarycache")) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            let digits: String = n.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(id) = digits.parse::<u32>() {
                if digits.len() == n.len() || n[digits.len()..].starts_with('_') {
                    s.insert(id);
                }
            }
        }
    }
    s
}

// ---------------- appinfo.vdf (binary) ----------------

pub struct Meta {
    pub name: String,
    pub typ: String,
    pub icon: Option<String>,
    pub logo_pos: Option<LogoPos>,
}

struct Cur<'a> {
    d: &'a [u8],
    p: usize,
}
impl<'a> Cur<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.d.get(self.p..self.p.checked_add(n)?)?;
        self.p += n;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }
    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }
    fn u64(&mut self) -> Option<u64> {
        Some(u64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }
    fn cstr(&mut self) -> Option<String> {
        let rest = self.d.get(self.p..)?;
        let end = rest.iter().position(|&b| b == 0)?;
        let s = String::from_utf8_lossy(&rest[..end]).into_owned();
        self.p += end + 1;
        Some(s)
    }
}

enum B {
    S(String),
    O(Vec<(String, B)>),
    F(f32),
    N,
}
impl B {
    fn get(&self, k: &str) -> Option<&B> {
        match self {
            B::O(v) => v.iter().find(|(kk, _)| kk.eq_ignore_ascii_case(k)).map(|(_, v)| v),
            _ => None,
        }
    }
    fn s(&self) -> Option<&str> {
        match self {
            B::S(s) => Some(s),
            _ => None,
        }
    }
    fn f(&self) -> Option<f32> {
        match self {
            B::F(f) => Some(*f),
            B::S(s) => s.trim().parse().ok(),
            _ => None,
        }
    }
}

fn read_bin(c: &mut Cur, table: Option<&[String]>, depth: u32) -> Option<Vec<(String, B)>> {
    if depth > 64 {
        return None;
    }
    let mut v = Vec::new();
    loop {
        let t = c.u8()?;
        if t == 0x08 {
            break;
        }
        let key = match table {
            Some(tb) => tb.get(c.u32()? as usize)?.clone(),
            None => c.cstr()?,
        };
        let val = match t {
            0x00 => B::O(read_bin(c, table, depth + 1)?),
            0x01 => B::S(c.cstr()?),
            0x03 => B::F(f32::from_le_bytes(c.take(4)?.try_into().ok()?)),
            0x02 | 0x04 | 0x06 => {
                c.take(4)?;
                B::N
            }
            0x07 | 0x0A => {
                c.take(8)?;
                B::N
            }
            _ => return None,
        };
        v.push((key, val));
    }
    Some(v)
}

fn appinfo(sp: &Path, wanted: &HashSet<u32>) -> HashMap<u32, Meta> {
    let mut out = HashMap::new();
    let Ok(data) = fs::read(sp.join("appcache").join("appinfo.vdf")) else { return out };
    let mut c = Cur { d: &data, p: 0 };
    let Some(magic) = c.u32() else { return out };
    if c.u32().is_none() {
        return out;
    }
    let v29 = magic == 0x0756_4429;
    let bin_sha = magic == 0x0756_4428 || v29;
    let mut table: Option<Vec<String>> = None;
    let mut limit = data.len();
    if v29 {
        let Some(off) = c.u64() else { return out };
        let off = off as usize;
        let mut t = Cur { d: &data, p: off };
        if let Some(n) = t.u32() {
            let mut v = Vec::with_capacity(n as usize);
            for _ in 0..n {
                match t.cstr() {
                    Some(s) => v.push(s),
                    None => break,
                }
            }
            table = Some(v);
            limit = off;
        }
    }
    let skip = 4 + 4 + 8 + 20 + 4 + if bin_sha { 20 } else { 0 };
    while c.p + 8 <= limit {
        let Some(appid) = c.u32() else { break };
        if appid == 0 {
            break;
        }
        let Some(size) = c.u32() else { break };
        let end = c.p + size as usize;
        if end > limit {
            break;
        }
        if wanted.contains(&appid) {
            let mut k = Cur { d: &data[..end], p: c.p + skip };
            if let Some(root) = read_bin(&mut k, table.as_deref(), 0) {
                let root = B::O(root);
                if let Some(common) = root.get("appinfo").and_then(|a| a.get("common")) {
                    out.insert(
                        appid,
                        Meta {
                            name: common.get("name").and_then(|x| x.s()).unwrap_or("").to_string(),
                            typ: common.get("type").and_then(|x| x.s()).unwrap_or("").to_lowercase(),
                            icon: common.get("icon").and_then(|x| x.s()).map(|s| s.to_string()),
                            logo_pos: common
                                .get("library_assets")
                                .and_then(|l| l.get("logo_position"))
                                .and_then(|p| {
                                    Some(LogoPos {
                                        pin: p.get("pinned_position")?.s()?.to_string(),
                                        w: p.get("width_pct").and_then(|x| x.f()).unwrap_or(50.0),
                                        h: p.get("height_pct").and_then(|x| x.f()).unwrap_or(50.0),
                                    })
                                }),
                        },
                    );
                }
            }
        }
        c.p = end;
    }
    out
}

// ---------------- artwork ----------------

fn collect(dir: &Path, depth: u32, found: &mut HashMap<String, PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < 2 {
                collect(&p, depth + 1, found);
            }
        } else {
            let n = e.file_name().to_string_lossy().to_lowercase();
            found.entry(n).or_insert(p);
        }
    }
}

fn assets(sp: &Path, id: u32, icon: Option<&str>) -> Assets {
    let base = sp.join("appcache").join("librarycache");
    let mut found = HashMap::new();
    collect(&base.join(id.to_string()), 0, &mut found);
    let pick = |names: &[&str]| -> Option<String> {
        for n in names {
            if let Some(p) = found.get(*n) {
                return Some(p.to_string_lossy().into_owned());
            }
            let flat = base.join(format!("{id}_{n}"));
            if flat.exists() {
                return Some(flat.to_string_lossy().into_owned());
            }
        }
        None
    };
    Assets {
        cover: pick(&["library_600x900.jpg", "library_capsule.jpg", "library_600x900_2x.jpg"]),
        hero: pick(&["library_hero.jpg", "library_hero_2x.jpg"]),
        logo: pick(&["logo.png", "logo_2x.png"]),
        header: pick(&["header.jpg", "library_header.jpg"]),
        icon: icon.and_then(|h| {
            let n = format!("{}.jpg", h.to_lowercase());
            found.get(&n).map(|p| p.to_string_lossy().into_owned())
        }),
    }
}

/// Steam's logo placement for any app the local Steam client has metadata for.
pub fn logo_pos_for(id: u32) -> Option<LogoPos> {
    let sp = steam_path()?;
    let mut set = HashSet::new();
    set.insert(id);
    appinfo(&sp, &set).remove(&id)?.logo_pos
}

const JUNK: [&str; 7] = [
    "redistributable",
    "steamworks common",
    "proton",
    "steam linux runtime",
    "steamvr",
    "dedicated server",
    "sdk",
];

pub fn library() -> Vec<SteamGame> {
    let Some(sp) = steam_path() else { return vec![] };
    let libs = libraries(&sp);
    let inst = installed(&libs);
    let pts = user_dir(&sp).map(|u| playtimes(&u)).unwrap_or_default();
    let mut ids = cache_ids(&sp);
    ids.extend(inst.keys().copied());
    ids.extend(pts.iter().filter(|(_, v)| v.0 > 0).map(|(k, _)| *k));
    let meta = appinfo(&sp, &ids);
    let have_meta = !meta.is_empty();

    let mut out = Vec::new();
    for id in ids {
        let m = meta.get(&id);
        let ins = inst.get(&id);
        if have_meta {
            match m {
                Some(m) if m.typ == "game" || m.typ == "application" => {}
                _ => continue,
            }
        } else if ins.is_none() {
            continue;
        }
        let name = m
            .map(|m| m.name.clone())
            .filter(|n| !n.is_empty())
            .or_else(|| ins.map(|i| i.name.clone()))
            .unwrap_or_default();
        let lname = name.to_lowercase();
        if name.is_empty() || JUNK.iter().any(|j| lname.contains(j)) {
            continue;
        }
        let (pt, lp) = pts.get(&id).copied().unwrap_or((0, 0));
        let icon = m.and_then(|m| m.icon.clone());
        out.push(SteamGame {
            app_id: id.to_string(),
            name,
            installed: ins.is_some(),
            install_dir: ins.map(|i| i.dir.to_string_lossy().into_owned()),
            size_on_disk: ins.map(|i| i.size).unwrap_or(0),
            playtime_min: pt,
            last_played: lp * 1000,
            icon_url: icon.as_ref().map(|h| {
                format!("https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/{id}/{h}.jpg")
            }),
            assets: assets(&sp, id, icon.as_deref()),
            logo_pos: m.and_then(|m| m.logo_pos.clone()),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}
