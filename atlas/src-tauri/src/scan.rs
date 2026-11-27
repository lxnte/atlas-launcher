//! Finding non-Steam games on disk and matching them to the official Steam catalogue.

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;

const GROUPS: [&str; 24] = [
    "codex", "fitgirl", "dodi", "empress", "plaza", "skidrow", "rune", "tenoke", "elamigos", "gog",
    "razor1911", "flt", "cpy", "hoodlum", "reloaded", "repack", "kaos", "darksiders", "prophet",
    "goldberg", "online-fix", "p2p", "rg", "steamrip",
];

/// "Elden.Ring.v1.02-CODEX" -> "Elden Ring"
pub fn clean_name(raw: &str) -> String {
    let mut s = raw.to_string();
    // drop bracketed parts
    for (o, c) in [('[', ']'), ('(', ')'), ('{', '}')] {
        while let (Some(a), Some(b)) = (s.find(o), s.find(c)) {
            if b <= a {
                break;
            }
            s.replace_range(a..=b, " ");
        }
    }
    // "-CODEX" style suffix
    if let Some(i) = s.rfind('-') {
        let tail = s[i + 1..].trim().to_lowercase();
        if GROUPS.iter().any(|g| tail.starts_with(g)) {
            s.truncate(i);
        }
    }
    let s = s.replace(['.', '_'], " ");
    let mut words = Vec::new();
    for w in s.split_whitespace() {
        let l = w.to_lowercase();
        let ver = l.starts_with('v') && l[1..].chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false);
        if ver
            || GROUPS.contains(&l.as_str())
            || ["build", "update", "x64", "x86", "win64", "win32", "multi", "repack"].iter().any(|k| l.starts_with(k))
        {
            break;
        }
        words.push(w.to_string());
    }
    let out = words.join(" ").trim_matches(|c: char| c == '-' || c.is_whitespace()).to_string();
    if out.is_empty() { raw.trim().to_string() } else { out }
}

const BAD_EXE: [&str; 24] = [
    "unins", "setup", "redist", "dxsetup", "crashhandler", "crashreport", "crashpad", "prereq",
    "easyanticheat", "battleye", "physx", "vcredist", "vc_redist", "updater", "cefsharp", "notification_helper",
    "errorreporter", "uninst", "dxwebsetup", "oalinst", "quicksfv", "dotnet", "touchup", "cleanup",
];
const BAD_DIRS: [&str; 9] = [
    "_commonredist", "commonredist", "redist", "_redist", "directx", "support", "thirdparty", "__installer", "prereqs",
];

fn walk(dir: &Path, depth: u32, out: &mut Vec<(PathBuf, u64, u32)>) {
    if depth > 5 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_lowercase();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            if !BAD_DIRS.contains(&name.as_str()) {
                walk(&p, depth + 1, out);
            }
        } else if name.ends_with(".exe") && !BAD_EXE.iter().any(|b| name.contains(b)) {
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            out.push((p, size, depth));
        }
    }
}

fn alnum(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase()
}

pub fn find_main_exe(folder: &Path) -> Option<PathBuf> {
    let mut exes = Vec::new();
    walk(folder, 0, &mut exes);
    let fname = alnum(&folder.file_name()?.to_string_lossy());
    exes.sort_by_key(|(p, size, depth)| {
        let b = alnum(&p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default());
        let matches = b.len() >= 3 && fname.len() >= 3 && (b.contains(&fname) || fname.contains(&b));
        (if matches { 0 } else { 1 }, std::cmp::Reverse(*size), *depth)
    });
    exes.into_iter().next().map(|(p, _, _)| p)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoreHit {
    pub app_id: String,
    pub name: String,
    pub image: Option<String>,
}

/// Searches the official Steam store catalogue.
pub fn steam_search(term: &str) -> Vec<StoreHit> {
    let term = term.trim();
    if term.is_empty() {
        return vec![];
    }
    let Ok(resp) = ureq::get("https://store.steampowered.com/api/storesearch/")
        .query("term", term)
        .query("l", "english")
        .query("cc", "US")
        .timeout(Duration::from_secs(8))
        .call()
    else {
        return vec![];
    };
    let Ok(v) = resp.into_json::<Value>() else { return vec![] };
    v.get("items")
        .and_then(|i| i.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|it| {
                    Some(StoreHit {
                        app_id: it.get("id")?.as_u64()?.to_string(),
                        name: it.get("name")?.as_str()?.to_string(),
                        image: it.get("tiny_image").and_then(|x| x.as_str()).map(|s| s.to_string()),
                    })
                })
                .take(12)
                .collect()
        })
        .unwrap_or_default()
}

// ---------------- news ----------------

fn first_image(c: &str) -> Option<String> {
    if let Some(i) = c.find("{STEAM_CLAN_IMAGE}") {
        let rest = &c[i + "{STEAM_CLAN_IMAGE}".len()..];
        let end = rest.find(|ch: char| ch.is_whitespace() || ch == '[' || ch == '"' || ch == '<').unwrap_or(rest.len());
        return Some(format!("https://clan.akamai.steamstatic.com/images{}", &rest[..end]));
    }
    if let Some(i) = c.find("[img]") {
        let rest = &c[i + 5..];
        if let Some(e) = rest.find("[/img]") {
            let u = rest[..e].trim();
            if u.starts_with("http") { return Some(u.to_string()); }
        }
    }
    if let Some(i) = c.find("<img") {
        let rest = &c[i..];
        if let Some(s) = rest.find("src=\"") {
            let r2 = &rest[s + 5..];
            if let Some(e) = r2.find('"') { return Some(r2[..e].to_string()); }
        }
    }
    None
}

/// Plain-text preview: drops [bbcode] and <html> tags and collapses whitespace.
fn snippet(c: &str, max: usize) -> String {
    let mut out = String::new();
    let mut skip: Option<char> = None;
    for ch in c.chars() {
        match (skip, ch) {
            (None, '[') => skip = Some(']'),
            (None, '<') => skip = Some('>'),
            (Some(e), x) if x == e => { skip = None; out.push(' '); }
            (Some(_), _) => {}
            (None, x) => out.push(x),
        }
    }
    let flat = out.replace("{STEAM_CLAN_IMAGE}", "").replace('\\', "").split_whitespace().collect::<Vec<_>>().join(" ");
    let flat = flat.split_whitespace().filter(|w| !w.starts_with("http")).collect::<Vec<_>>().join(" ");
    if flat.chars().count() > max { format!("{}…", flat.chars().take(max).collect::<String>().trim_end()) } else { flat }
}

/// Latest news / patch notes for a Steam app (public API, no key needed).
pub fn news(app_id: &str) -> Vec<Value> {
    // the developer's own announcements first (like Steam does); any feed only as a fallback
    let fetch = |official: bool| -> Option<Value> {
        let mut q = ureq::get("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/")
            .query("appid", app_id).query("count", "8").query("maxlength", "0")
            .timeout(Duration::from_secs(10));
        if official { q = q.query("feeds", "steam_community_announcements"); }
        q.call().ok()?.into_json::<Value>().ok()
    };
    let has = |v: &Option<Value>| v.as_ref().and_then(|v| v["appnews"]["newsitems"].as_array().map(|a| a.len())).unwrap_or(0) >= 2;
    let mut v = fetch(true);
    if !has(&v) { v = fetch(false); }
    let Some(v) = v else { return vec![] };
    v["appnews"]["newsitems"].as_array().map(|items| items.iter().map(|it| {
        let c = it["contents"].as_str().unwrap_or("");
        let gid = it["gid"].as_str().unwrap_or("");
        let url = it["url"].as_str().unwrap_or("");
        let link = if url.contains("store.steampowered.com") || url.contains("steamcommunity.com") { url.to_string() }
                   else { format!("https://store.steampowered.com/news/app/{app_id}/view/{gid}") };
        serde_json::json!({
            "title": it["title"].as_str().unwrap_or(""),
            "date": it["date"].as_u64().unwrap_or(0) * 1000,
            "feed": it["feedlabel"].as_str().unwrap_or(""),
            "image": first_image(c),
            "snippet": snippet(c, 230),
            "url": link,
        })
    }).collect()).unwrap_or_default()
}

// ---------------- moved / deleted games ----------------

#[derive(serde::Deserialize)]
pub struct CheckReq {
    pub id: String,
    pub exe: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckRes {
    pub id: String,
    /// "ok" | "moved" | "gone" | "offline"
    pub status: &'static str,
    pub exe: Option<String>,
}

const SKIP_DIRS: [&str; 12] = [
    "windows", "$recycle.bin", "system volume information", "appdata", "programdata", "recovery",
    "$windows.~bt", "$windows.~ws", "node_modules", ".git", "msocache", "perflogs",
];
/// File names too common to trust on their own.
const GENERIC: [&str; 10] = [
    "game.exe", "launcher.exe", "start.exe", "play.exe", "setup.exe", "run.exe", "app.exe", "client.exe", "main.exe", "unitycrashhandler64.exe",
];

fn walk_find(dir: &Path, depth: u32, names: &std::collections::HashSet<String>, out: &mut Vec<PathBuf>) {
    if depth > 7 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let Ok(ft) = e.file_type() else { continue };
        let n = e.file_name().to_string_lossy().to_lowercase();
        if ft.is_dir() {
            if !SKIP_DIRS.contains(&n.as_str()) && !ft.is_symlink() {
                walk_find(&e.path(), depth + 1, names, out);
            }
        } else if names.contains(&n) {
            out.push(e.path());
        }
    }
}

/// How many trailing folder names two paths share ("...\LEGO Movie\Bin\x.exe").
fn shared_tail(a: &Path, b: &Path) -> usize {
    let ca: Vec<String> = a.parent().map(|p| p.components().rev().map(|c| c.as_os_str().to_string_lossy().to_lowercase()).collect()).unwrap_or_default();
    let cb: Vec<String> = b.parent().map(|p| p.components().rev().map(|c| c.as_os_str().to_string_lossy().to_lowercase()).collect()).unwrap_or_default();
    ca.iter().zip(cb.iter()).take_while(|(x, y)| x == y && !x.ends_with(':') && !x.ends_with('\\')).count()
}

/// Checks every non-Steam game; looks on all drives for the ones whose exe disappeared.
pub fn relocate(games: Vec<CheckReq>) -> Vec<CheckRes> {
    let mut out = Vec::new();
    let mut missing = Vec::new();
    for g in games {
        let p = PathBuf::from(&g.exe);
        if p.is_file() {
            out.push(CheckRes { id: g.id, status: "ok", exe: None });
            continue;
        }
        // drive not plugged in (external HDD) -> don't touch it
        let root = p.components().next().map(|c| PathBuf::from(format!("{}\\", c.as_os_str().to_string_lossy())));
        if root.map(|r| !r.exists()).unwrap_or(true) {
            out.push(CheckRes { id: g.id, status: "offline", exe: None });
            continue;
        }
        missing.push((g, p));
    }
    if missing.is_empty() {
        return out;
    }
    let names: std::collections::HashSet<String> = missing
        .iter()
        .filter_map(|(_, p)| p.file_name().map(|n| n.to_string_lossy().to_lowercase()))
        .collect();
    // one thread per drive: an SSD and an HDD get searched at the same time
    let names = std::sync::Arc::new(names);
    let handles: Vec<_> = crate::steam::drives()
        .into_iter()
        .map(|d| {
            let names = names.clone();
            std::thread::spawn(move || {
                let mut v = Vec::new();
                walk_find(&d, 0, &names, &mut v);
                v
            })
        })
        .collect();
    let found: Vec<PathBuf> = handles.into_iter().filter_map(|h| h.join().ok()).flatten().collect();
    for (g, old) in missing {
        let fname = old.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
        let generic = GENERIC.contains(&fname.as_str());
        let best = found
            .iter()
            .filter(|c| c.file_name().map(|n| n.to_string_lossy().to_lowercase() == fname).unwrap_or(false))
            .map(|c| (shared_tail(&old, c), c))
            .filter(|(score, _)| *score >= 1 || !generic)
            .max_by_key(|(score, _)| *score);
        match best {
            Some((_, c)) => out.push(CheckRes { id: g.id, status: "moved", exe: Some(c.to_string_lossy().into_owned()) }),
            None => out.push(CheckRes { id: g.id, status: "gone", exe: None }),
        }
    }
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub name: String,
    pub exe: String,
    pub app_id: Option<String>,
}

pub fn scan_folder(dir: &Path) -> Vec<Found> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let Some(exe) = find_main_exe(&e.path()) else { continue };
        let guess = clean_name(&e.file_name().to_string_lossy());
        let hit = steam_search(&guess).into_iter().next();
        out.push(Found {
            name: hit.as_ref().map(|h| h.name.clone()).unwrap_or(guess),
            exe: exe.to_string_lossy().into_owned(),
            app_id: hit.map(|h| h.app_id),
        });
    }
    out
}
