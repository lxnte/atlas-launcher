#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod discord;
mod optimize;
mod scan;
mod steam;
mod store;
mod vdf;
mod winproc;

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, WebviewWindow};

struct SteamCache(Mutex<Option<(Instant, Vec<steam::SteamGame>)>>);

fn is_digits(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())
}

/// Games running right now: non-Steam ones from Atlas' tracker, Steam ones straight from Steam.
fn running_now() -> Value {
    let mut r = store::running();
    if let (Some(id), Some(m)) = (steam::running_app(), r.as_object_mut()) {
        m.entry(format!("s{id}")).or_insert(json!(0));
    }
    r
}

#[tauri::command]
async fn get_library(cache: tauri::State<'_, SteamCache>, force: bool) -> Result<Value, String> {
    let games = {
        let mut c = cache.0.lock().map_err(|e| e.to_string())?;
        let fresh = matches!(&*c, Some((t, _)) if !force && t.elapsed() < Duration::from_secs(45));
        if !fresh {
            *c = Some((Instant::now(), steam::library()));
        }
        c.as_ref().map(|x| x.1.clone()).unwrap_or_default()
    };
    Ok(json!({
        "steam": games,
        "steamFound": steam::steam_path().is_some(),
        "config": store::load_config(),
        "stats": store::load_stats(),
        "running": running_now(),
        "dataDir": store::data_dir(),
    }))
}

#[tauri::command]
fn get_status() -> Value {
    json!({ "stats": store::load_stats(), "running": running_now() })
}

#[tauri::command]
fn save_config(config: Value) -> Result<(), String> {
    store::save_config(&config).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchReq {
    id: String,
    name: Option<String>,
    steam_app_id: Option<String>,
    store_app_id: Option<String>,
    exe: Option<String>,
    args: Option<String>,
    work_dir: Option<String>,
    /// small image for Discord
    art: Option<String>,
}

#[tauri::command]
fn launch(app: AppHandle, window: WebviewWindow, req: LaunchReq) -> Result<(), String> {
    let name = req.name.clone().unwrap_or_default();
    if let Some(appid) = req.steam_app_id.as_deref().filter(|s| !s.is_empty()) {
        if !is_digits(appid) {
            return Err("Invalid AppID".into());
        }
        // launch options set in Atlas go through Steam itself (steam.exe -applaunch), on top of Steam's own
        let extra = req.args.as_deref().map(str::trim).unwrap_or("");
        if extra.is_empty() || !steam::launch_with_options(appid, extra) {
            winproc::open(&format!("steam://rungameid/{appid}"));
        }
        // Steam tracks its own hours and Discord already shows Steam games. The only helper is Game Boost\n        // (if enabled): it keeps Steam's interface asleep while the game runs, then exits.
        store::touch_played(&req.id, &name, Some(appid));
        if optimize::boost_enabled() {
            optimize::spawn_boost(appid);
        }
    } else {
        let exe = req.exe.clone().unwrap_or_default();
        if exe.is_empty() || !Path::new(&exe).exists() {
            return Err(format!("Game file not found:\n{exe}"));
        }
        let dir = req
            .work_dir
            .clone()
            .filter(|s| !s.is_empty())
            .or_else(|| Path::new(&exe).parent().map(|p| p.to_string_lossy().into_owned()))
            .unwrap_or_default();
        let pid = winproc::shell_launch(&exe, req.args.as_deref().unwrap_or(""), &dir)?;
        store::touch_played(&req.id, &name, req.store_app_id.as_deref());
        let td = winproc::track_dir(&exe);
        // play time tracking can be switched off in Settings: then nothing runs in the background at all
        let track = store::load_config().pointer("/settings/trackPlaytime").and_then(|v| v.as_bool()).unwrap_or(true);
        if track {
            winproc::spawn_tracker(winproc::TrackInfo { id: &req.id, pid, dir: td.as_deref(), name: &name, art: req.art.as_deref() });
        }
    }
    discord::clear_app_status(); // non-Steam: the tracker shows the game; Steam: Discord detects it itself
    match store::on_launch_mode().as_str() {
        "minimize" => {
            let _ = window.minimize();
        }
        "none" => {}
        _ => {
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(900));
                app.exit(0);
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn steam_action(action: String, app_id: String) -> Result<(), String> {
    if !is_digits(&app_id) {
        return Err("Invalid AppID".into());
    }
    let has_steam = steam::steam_path().is_some();
    let url = match action.as_str() {
        "install" => format!("steam://install/{app_id}"),
        "uninstall" => format!("steam://uninstall/{app_id}"),
        "store" if has_steam => format!("steam://store/{app_id}"),
        "store" => format!("https://store.steampowered.com/app/{app_id}"),
        "hub" => format!("https://steamcommunity.com/app/{app_id}"),
        "discussions" => format!("https://steamcommunity.com/app/{app_id}/discussions/"),
        "guides" => format!("https://steamcommunity.com/app/{app_id}/guides/"),
        "achievements" => format!("https://steamcommunity.com/stats/{app_id}/achievements"),
        "properties" => format!("steam://gameproperties/{app_id}"),
        _ => return Err("Unknown action".into()),
    };
    winproc::open(&url);
    Ok(())
}

#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    if path.is_empty() || !Path::new(&path).exists() {
        return Err("That folder no longer exists.".into());
    }
    winproc::reveal(&path);
    Ok(())
}

#[tauri::command]
async fn folder_size(path: String) -> u64 {
    let p = Path::new(&path);
    let dir = if p.is_file() { p.parent().unwrap_or(p) } else { p };
    if dir.components().count() < 3 {
        return 0;
    }
    winproc::folder_size(dir)
}

#[tauri::command]
async fn pick_exe(window: WebviewWindow) -> Option<Value> {
    let f = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("Choose the game executable")
        .add_filter("Games", &["exe", "lnk", "bat", "url"])
        .add_filter("All files", &["*"])
        .pick_file()?;
    let parent = f.parent().and_then(|p| p.file_name()).map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let generic = ["bin", "binaries", "win64", "win32", "x64", "game", "shipping"];
    let guess = if generic.contains(&parent.to_lowercase().as_str()) {
        f.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
    } else {
        parent
    };
    Some(json!({ "path": f, "guess": scan::clean_name(&guess) }))
}

#[tauri::command]
async fn pick_image(window: WebviewWindow) -> Option<String> {
    rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("Choose an image")
        .add_filter("Images", &["jpg", "jpeg", "png", "webp", "gif", "bmp"])
        .pick_file()
        .map(|p| p.to_string_lossy().into_owned())
}

/// Copies the chosen picture into the Atlas data folder so the profile keeps it.
#[tauri::command]
async fn pick_avatar(window: WebviewWindow, kind: Option<String>) -> Option<String> {
    let src = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("Choose a picture")
        .add_filter("Images", &["jpg", "jpeg", "png", "webp", "gif", "bmp"])
        .pick_file()?;
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "png".into());
    let prefix = if kind.as_deref() == Some("banner") { "banner" } else { "avatar" };
    let dst = store::data_dir().join(format!("{prefix}-{}.{ext}", store::now_ms()));
    std::fs::copy(&src, &dst).ok()?;
    Some(dst.to_string_lossy().into_owned())
}

#[tauri::command]
async fn scan_folder(window: WebviewWindow) -> Option<Value> {
    let dir = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("Choose the folder that holds your games (one game per subfolder)")
        .pick_folder()?;
    Some(json!({ "folder": dir, "games": scan::scan_folder(&dir) }))
}

// ---------------- uninstall ----------------

/// The NSIS uninstaller sits next to atlas.exe in an installed copy.
fn uninstaller() -> Option<std::path::PathBuf> {
    let p = std::env::current_exe().ok()?.parent()?.join("uninstall.exe");
    p.is_file().then_some(p)
}

#[tauri::command]
fn uninstall_info() -> Value {
    json!({ "installed": uninstaller().is_some(), "dataDir": store::data_dir() })
}

/// Deletes profile, play time, collections and settings (%APPDATA%\Atlas).
#[tauri::command]
async fn uninstall_remove_data() -> Result<(), String> {
    let d = store::data_dir();
    std::fs::remove_dir_all(&d).map_err(|e| format!("Could not delete your data: {e}"))
}

/// Closes Atlas, then runs the uninstaller silently (it can't delete a running exe),
/// and optionally restarts the PC afterwards.
#[tauri::command]
fn uninstall_finish(app: AppHandle, restart: bool, wipe: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let un = uninstaller().ok_or("This copy of Atlas isn't installed, so there's nothing to uninstall.")?;
    let mut script = format!("ping -n 3 127.0.0.1 >nul & \"{}\" /S", un.display());
    if wipe {
        // the window's own browser cache, only removable once Atlas has closed
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            script.push_str(&format!(" & rmdir /s /q \"{local}\\app.atlas.launcher\""));
        }
    }
    if restart {
        script.push_str(" & shutdown /r /t 10 /c \"Restarting to finish removing Atlas.\"");
    }
    std::process::Command::new("cmd.exe")
        .raw_arg(format!("/C \"{script}\""))
        .creation_flags(0x0800_0000 | 0x0000_0008) // no window, detached
        .spawn()
        .map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        app.exit(0);
    });
    Ok(())
}

// ---------------- auto-update (signed releases on GitHub) ----------------

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<Value>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let up = app.updater().map_err(|e| e.to_string())?;
    match up.check().await {
        Ok(Some(u)) => Ok(Some(json!({
            "version": u.version,
            "current": u.current_version,
            "notes": u.body,
            "date": u.date.map(|d| d.unix_timestamp() * 1000),
        }))),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Downloads the signed installer, runs it quietly and restarts into the new version.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let up = app.updater().map_err(|e| e.to_string())?;
    let Some(u) = up.check().await.map_err(|e| e.to_string())? else {
        return Err("You're already on the latest version.".into());
    };
    // stream progress to the UI: { done, total } while downloading, then { installing: true }
    use tauri::Emitter;
    let (a1, a2) = (app.clone(), app.clone());
    let mut done: u64 = 0;
    u.download_and_install(
        move |chunk, total| {
            done += chunk as u64;
            let _ = a1.emit("update-progress", json!({ "done": done, "total": total }));
        },
        move || {
            let _ = a2.emit("update-progress", json!({ "installing": true }));
        },
    )
    .await
    .map_err(|e| format!("Update failed: {e}"))?;
    app.restart();
}

// ---------------- Steam optimizer ----------------

#[tauri::command]
async fn steam_opt_status() -> Value {
    optimize::status()
}

#[derive(Deserialize)]
struct OptReq {
    startup: bool,
    gpu: bool,
    overlay: bool,
    close: bool,
}

/// Refresh rate of the main monitor (Hz), used to suggest -refresh for games. 0 if unknown.
#[tauri::command]
fn display_hz() -> u32 {
    use windows_sys::Win32::Graphics::Gdi::{EnumDisplaySettingsW, DEVMODEW, ENUM_CURRENT_SETTINGS};
    unsafe {
        let mut dm: DEVMODEW = std::mem::zeroed();
        dm.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
        if EnumDisplaySettingsW(std::ptr::null(), ENUM_CURRENT_SETTINGS, &mut dm) != 0 { dm.dmDisplayFrequency } else { 0 }
    }
}

/// Launch options already set inside Steam for a game.
#[tauri::command]
fn steam_launch_options(app_id: String) -> String {
    app_id.parse::<u32>().map(steam::launch_options).unwrap_or_default()
}

/// Turns a single Steam optimization on or off.
#[tauri::command]
async fn steam_opt_set(key: String, optimized: bool, close: bool) -> Value {
    optimize::set(&key, optimized, close)
}

#[tauri::command]
async fn steam_opt_apply(o: OptReq) -> Value {
    optimize::apply(o.startup, o.gpu, o.overlay, o.close)
}

#[tauri::command]
async fn game_news(app_id: String) -> Vec<Value> {
    if !is_digits(&app_id) {
        return vec![];
    }
    scan::news(&app_id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    details: String,
    state: Option<String>,
    image: Option<String>,
    image_text: Option<String>,
    clear: Option<bool>,
}

/// What Atlas shows on Discord while it is open ("Browsing the library", "Looking at X").
#[tauri::command]
fn discord_status(s: AppStatus) {
    if s.clear.unwrap_or(false) {
        discord::clear_app_status();
    } else {
        discord::set_app_status(s.details, s.state, s.image, s.image_text);
    }
}

/// Finds non-Steam games that were moved to another folder/drive, or deleted.
#[tauri::command]
async fn relocate_games(games: Vec<scan::CheckReq>) -> Vec<scan::CheckRes> {
    scan::relocate(games)
}

#[tauri::command]
async fn steam_info() -> Value {
    steam::info()
}

/// Lets the user point Atlas at their Steam folder by hand. Returns the path if it really is Steam.
#[tauri::command]
async fn pick_steam_folder(window: WebviewWindow) -> Result<Option<String>, String> {
    let Some(dir) = rfd::FileDialog::new().set_parent(&window).set_title("Choose your Steam folder (the one with steam.exe)").pick_folder() else {
        return Ok(None);
    };
    if steam::is_valid_steam(&dir) {
        Ok(Some(dir.to_string_lossy().into_owned()))
    } else {
        Err("That folder doesn't look like a Steam install. Pick the folder that contains steam.exe.".into())
    }
}

#[tauri::command]
async fn search_steam(term: String) -> Vec<scan::StoreHit> {
    scan::steam_search(&term)
}

/// Extra art for games without Steam library artwork, plus Steam's logo placement.
#[tauri::command]
async fn store_art(app_id: String) -> Value {
    if !is_digits(&app_id) {
        return json!({});
    }
    let logo = app_id.parse::<u32>().ok().and_then(steam::logo_pos_for);
    let mut shots: Vec<String> = Vec::new();
    let mut background = None;
    if let Ok(r) = ureq::get("https://store.steampowered.com/api/appdetails")
        .query("appids", &app_id)
        .timeout(Duration::from_secs(8))
        .call()
    {
        if let Ok(v) = r.into_json::<Value>() {
            let d = &v[&app_id]["data"];
            if let Some(a) = d["screenshots"].as_array() {
                shots = a.iter().filter_map(|s| s["path_full"].as_str().map(String::from)).take(6).collect();
            }
            background = d["background_raw"].as_str().map(String::from);
        }
    }
    json!({ "logoPos": logo, "screenshots": shots, "background": background })
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if url.starts_with("https://store.steampowered.com/") || url.starts_with("https://steamcommunity.com/") {
        winproc::open(&url);
        Ok(())
    } else {
        Err("Link not allowed".into())
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(|s| s == "--track").unwrap_or(false) {
        winproc::run_tracker(&args[2..]);
        return;
    }
    if args.get(1).map(|s| s == "--boost").unwrap_or(false) {
        optimize::run_boost(&args[2..]);
        return;
    }
    // a Game Boost that was interrupted (crash, power loss) must never leave Steam asleep
    if !store::running().as_object().map(|m| m.contains_key("boost")).unwrap_or(false) {
        optimize::wake_ui();
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SteamCache(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_library,
            get_status,
            save_config,
            launch,
            steam_action,
            reveal,
            folder_size,
            pick_exe,
            pick_image,
            pick_avatar,
            scan_folder,
            search_steam,
            store_art,
            steam_info,
            pick_steam_folder,
            relocate_games,
            game_news,
            steam_opt_status,
            steam_opt_apply,
            steam_opt_set,
            steam_launch_options,
            display_hz,
            check_update,
            install_update,
            discord_status,
            uninstall_info,
            uninstall_remove_data,
            uninstall_finish,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("Atlas failed to start");
}
