//! Persistent data in %APPDATA%\Atlas:
//!   config.json  - written only by the UI (local games, collections, favorites, settings)
//!   stats.json   - playtime / first & last played of games launched from Atlas
//!   running\*.json - one file per game currently tracked

use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn data_dir() -> PathBuf {
    let d = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join("Atlas");
    let _ = fs::create_dir_all(&d);
    d
}

fn read_json(p: &PathBuf) -> Option<Value> {
    serde_json::from_slice(&fs::read(p).ok()?).ok()
}

fn write_json(p: &PathBuf, v: &Value) -> std::io::Result<()> {
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(v)?)?;
    fs::rename(&tmp, p)
}

pub fn load_config() -> Value {
    let mut v = read_json(&data_dir().join("config.json")).unwrap_or_else(|| json!({}));
    if !v.is_object() {
        v = json!({});
    }
    let o = v.as_object_mut().unwrap();
    o.entry("games").or_insert_with(|| json!([]));
    o.entry("meta").or_insert_with(|| json!({}));
    o.entry("collections").or_insert_with(|| json!([]));
    o.entry("settings").or_insert_with(|| json!({ "onLaunch": "close" }));
    v
}

pub fn save_config(v: &Value) -> std::io::Result<()> {
    write_json(&data_dir().join("config.json"), v)
}

pub fn on_launch_mode() -> String {
    load_config()
        .pointer("/settings/onLaunch")
        .and_then(|v| v.as_str())
        .unwrap_or("close")
        .to_string()
}

fn with_stats<F: FnOnce(&mut serde_json::Map<String, Value>)>(f: F) {
    let dir = data_dir();
    let lock = dir.join("stats.lock");
    let path = dir.join("stats.json");
    let mut got = false;
    for _ in 0..60 {
        if OpenOptions::new().write(true).create_new(true).open(&lock).is_ok() {
            got = true;
            break;
        }
        if let Ok(m) = fs::metadata(&lock).and_then(|m| m.modified()) {
            if m.elapsed().unwrap_or_default() > Duration::from_secs(10) {
                let _ = fs::remove_file(&lock);
                continue;
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let mut v = read_json(&path).filter(|v| v.is_object()).unwrap_or_else(|| json!({}));
    f(v.as_object_mut().unwrap());
    let _ = write_json(&path, &v);
    if got {
        let _ = fs::remove_file(&lock);
    }
}

pub fn load_stats() -> Value {
    read_json(&data_dir().join("stats.json")).unwrap_or_else(|| json!({}))
}

fn entry<'a>(m: &'a mut serde_json::Map<String, Value>, id: &str) -> &'a mut serde_json::Map<String, Value> {
    let e = m.entry(id.to_string()).or_insert_with(|| json!({}));
    if !e.is_object() {
        *e = json!({});
    }
    e.as_object_mut().unwrap()
}

/// Called when a game is started from Atlas. Name/appId are kept so the profile
/// history still shows the game after it is removed from the library.
pub fn touch_played(id: &str, name: &str, app_id: Option<&str>) {
    with_stats(|m| {
        let e = entry(m, id);
        if !name.is_empty() {
            e.insert("name".into(), json!(name));
        }
        if let Some(a) = app_id.filter(|a| !a.is_empty()) {
            e.insert("appId".into(), json!(a));
        }
        let now = now_ms();
        e.insert("lastPlayed".into(), json!(now));
        if e.get("firstPlayed").and_then(|v| v.as_u64()).unwrap_or(0) == 0 {
            e.insert("firstPlayed".into(), json!(now));
        }
        let n = e.get("launches").and_then(|v| v.as_u64()).unwrap_or(0);
        e.insert("launches".into(), json!(n + 1));
    });
}

pub fn add_playtime(id: &str, minutes: f64) {
    with_stats(|m| {
        let e = entry(m, id);
        let cur = e.get("minutes").and_then(|v| v.as_f64()).unwrap_or(0.0);
        e.insert("minutes".into(), json!(((cur + minutes) * 10.0).round() / 10.0));
        e.insert("lastPlayed".into(), json!(now_ms()));
        let longest = e.get("longest").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if minutes > longest {
            e.insert("longest".into(), json!((minutes * 10.0).round() / 10.0));
        }
    });
}

fn safe(id: &str) -> String {
    id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect()
}

fn running_dir() -> PathBuf {
    let d = data_dir().join("running");
    let _ = fs::create_dir_all(&d);
    d
}

pub fn set_running(id: &str, tracker_pid: u32) {
    let _ = write_json(
        &running_dir().join(format!("{}.json", safe(id))),
        &json!({ "id": id, "pid": tracker_pid, "start": now_ms() }),
    );
}

pub fn clear_running(id: &str) {
    let _ = fs::remove_file(running_dir().join(format!("{}.json", safe(id))));
}

/// { gameId: startMs } for games whose tracker is still alive.
pub fn running() -> Value {
    let mut out = serde_json::Map::new();
    if let Ok(rd) = fs::read_dir(running_dir()) {
        for e in rd.flatten() {
            let p = e.path();
            let Some(v) = read_json(&p) else { continue };
            let pid = v.get("pid").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            if pid != 0 && crate::winproc::is_alive(pid) && !id.is_empty() {
                out.insert(id, v.get("start").cloned().unwrap_or(json!(0)));
            } else {
                let _ = fs::remove_file(&p);
            }
        }
    }
    Value::Object(out)
}
