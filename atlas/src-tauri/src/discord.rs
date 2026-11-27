//! Minimal Discord Rich Presence over the local IPC pipe (\\.\pipe\discord-ipc-N).
//! Shows "Playing Atlas" with the Atlas logo as the main image and the game as the small one.

use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::time::Duration;

/// Discord application ID for "Atlas" (from discord.com/developers). Empty = presence off.
/// Can also be overridden with settings.discordAppId in config.json.
pub const APP_ID: &str = "1575826364794282025";

pub fn app_id() -> Option<String> {
    let cfg = crate::store::load_config();
    if cfg.pointer("/settings/discord").and_then(|v| v.as_bool()) == Some(false) {
        return None;
    }
    let id = cfg.pointer("/settings/discordAppId").and_then(|v| v.as_str()).unwrap_or(APP_ID).trim().to_string();
    (!id.is_empty() && id.chars().all(|c| c.is_ascii_digit())).then_some(id)
}

pub struct Rpc {
    pipe: File,
}

impl Rpc {
    pub fn connect(client_id: &str) -> Option<Rpc> {
        for i in 0..10 {
            let Ok(f) = OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\discord-ipc-{i}")) else { continue };
            let mut r = Rpc { pipe: f };
            if r.send(0, &json!({ "v": 1, "client_id": client_id })).is_ok() && r.recv().is_some() {
                return Some(r);
            }
        }
        None
    }
    fn send(&mut self, op: u32, v: &Value) -> std::io::Result<()> {
        let s = v.to_string();
        let mut b = Vec::with_capacity(8 + s.len());
        b.extend_from_slice(&op.to_le_bytes());
        b.extend_from_slice(&(s.len() as u32).to_le_bytes());
        b.extend_from_slice(s.as_bytes());
        self.pipe.write_all(&b)?;
        self.pipe.flush()
    }
    fn recv(&mut self) -> Option<Value> {
        let mut h = [0u8; 8];
        self.pipe.read_exact(&mut h).ok()?;
        let len = u32::from_le_bytes(h[4..8].try_into().ok()?) as usize;
        let mut d = vec![0u8; len];
        self.pipe.read_exact(&mut d).ok()?;
        serde_json::from_slice(&d).ok()
    }
    pub fn set_activity(&mut self, activity: Value) -> bool {
        let msg = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": activity },
            "nonce": crate::store::now_ms().to_string(),
        });
        self.send(1, &msg).is_ok() && self.recv().is_some()
    }
}

// ---------- while Atlas itself is open ("Browsing the library", "Looking at X") ----------

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

static APP_ACTIVITY: Mutex<Option<Value>> = Mutex::new(None);
static APP_VERSION: AtomicU64 = AtomicU64::new(0);
static APP_STARTED: std::sync::Once = std::sync::Once::new();

/// Called by the UI when the screen changes. Starts the presence thread on first use.
pub fn set_app_status(details: String, state: Option<String>, small_image: Option<String>, small_text: Option<String>) {
    let Some(id) = app_id() else { return };
    let started = crate::store::now_ms() / 1000;
    let mut assets = json!({ "large_image": "atlas", "large_text": "Atlas — every game in one place" });
    if let Some(img) = small_image {
        assets["small_image"] = json!(img);
        assets["small_text"] = json!(small_text.unwrap_or_default());
    }
    let mut act = json!({ "type": 0, "details": details, "assets": assets });
    if let Some(s) = state.filter(|s| !s.is_empty()) {
        act["state"] = json!(s);
    }
    {
        let mut cur = APP_ACTIVITY.lock().unwrap();
        // keep the "elapsed" timer from when Atlas opened
        let ts = cur.as_ref().and_then(|c| c.get("timestamps").cloned()).unwrap_or(json!({ "start": started }));
        act["timestamps"] = ts;
        *cur = Some(act);
    }
    APP_VERSION.fetch_add(1, Ordering::SeqCst);
    APP_STARTED.call_once(move || {
        std::thread::spawn(move || loop {
            if let Some(mut rpc) = Rpc::connect(&id) {
                let mut sent = 0;
                loop {
                    let v = APP_VERSION.load(Ordering::SeqCst);
                    if v != sent {
                        let a = APP_ACTIVITY.lock().unwrap().clone().unwrap_or(Value::Null);
                        if !rpc.set_activity(a) { break; }
                        sent = v;
                    }
                    std::thread::sleep(Duration::from_millis(800));
                }
            }
            std::thread::sleep(Duration::from_secs(15));
        });
    });
}

/// Hands Discord over to the game tracker (or hides Atlas when the user turns presence off).
pub fn clear_app_status() {
    *APP_ACTIVITY.lock().unwrap() = None;
    APP_VERSION.fetch_add(1, Ordering::SeqCst);
}

/// Runs in the background tracker: keeps trying until Discord is open, then shows the game
/// for as long as this process lives (the presence disappears when the tracker exits).
pub fn show_in_background(name: String, small_image: Option<String>, start_secs: u64) {
    let Some(id) = app_id() else { return };
    std::thread::spawn(move || {
        let activity = json!({
            "type": 0,
            "details": name,
            "state": "via Atlas",
            "timestamps": { "start": start_secs },
            "assets": {
                "large_image": "atlas",
                "large_text": "Atlas — every game in one place",
                "small_image": small_image.unwrap_or_else(|| "atlas".into()),
                "small_text": name,
            },
        });
        loop {
            if let Some(mut rpc) = Rpc::connect(&id) {
                if rpc.set_activity(activity.clone()) {
                    // stay connected; if Discord restarts, the read fails and we reconnect
                    while rpc.recv().is_some() {}
                }
            }
            std::thread::sleep(Duration::from_secs(15));
        }
    });
}
