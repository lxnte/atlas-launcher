//! One-file backup of everything Atlas knows about you: profile (with its pictures), play time,
//! collections, notes and settings. Games themselves are never part of it.

use crate::store;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

/// Pictures that live inside Atlas' data folder (avatar, profile background).
fn own_files(config: &Value) -> Vec<PathBuf> {
    let dir = store::data_dir();
    ["avatar", "banner"]
        .iter()
        .filter_map(|k| config.pointer(&format!("/profile/{k}")).and_then(|v| v.as_str()).map(PathBuf::from))
        .filter(|p| p.starts_with(&dir) && p.is_file())
        .collect()
}

pub fn export(to: &Path) -> Result<(), String> {
    let config = store::load_config();
    let mut files = serde_json::Map::new();
    for p in own_files(&config) {
        if let (Some(name), Ok(bytes)) = (p.file_name(), fs::read(&p)) {
            files.insert(name.to_string_lossy().into_owned(), json!(B64.encode(bytes)));
        }
    }
    let doc = json!({
        "atlas": "backup",
        "version": 1,
        "created": store::now_ms(),
        "config": config,
        "stats": store::load_stats(),
        "files": files,
    });
    fs::write(to, serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?).map_err(|e| format!("Could not write the backup: {e}"))
}

/// Restores a backup. The current data is kept next to it first, just in case.
pub fn import(from: &Path) -> Result<Value, String> {
    let text = fs::read(from).map_err(|e| format!("Could not read that file: {e}"))?;
    let doc: Value = serde_json::from_slice(&text).map_err(|_| "That file isn't an Atlas backup.".to_string())?;
    if doc["atlas"] != "backup" {
        return Err("That file isn't an Atlas backup.".into());
    }
    let dir = store::data_dir();
    let stamp = store::now_ms();
    for f in ["config.json", "stats.json"] {
        let p = dir.join(f);
        if p.exists() {
            let _ = fs::copy(&p, dir.join(format!("{f}.before-import-{stamp}")));
        }
    }
    // pictures back into this PC's data folder, then point the profile at them
    let mut config = doc["config"].clone();
    if let Some(files) = doc["files"].as_object() {
        for (name, data) in files {
            let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')).collect();
            if let Some(bytes) = data.as_str().and_then(|s| B64.decode(s).ok()) {
                let _ = fs::write(dir.join(&safe), bytes);
            }
        }
    }
    for k in ["avatar", "banner"] {
        if let Some(old) = config.pointer(&format!("/profile/{k}")).and_then(|v| v.as_str()).map(String::from) {
            if let Some(name) = Path::new(&old).file_name() {
                let local = dir.join(name);
                config["profile"][k] = if local.is_file() { json!(local) } else { Value::Null };
            }
        }
    }
    store::save_config(&config).map_err(|e| e.to_string())?;
    fs::write(dir.join("stats.json"), serde_json::to_vec_pretty(&doc["stats"]).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(config)
}
