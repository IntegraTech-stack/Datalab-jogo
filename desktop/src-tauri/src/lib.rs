//! DataLab desktop shell (Tauri v2).
//!
//! Two windows:
//! - `main`: the game itself, loaded from the published site (or the local server in development,
//!   see `game_url`). The site's assets/js/desktop.js is the bridge: it sends the player's look and the
//!   game's notifications here, and keeps the simulation running while the window is hidden.
//! - `companion`: a small transparent window that stays on top in a corner of the screen with the
//!   player's character (desktop/companion). Notifications show up in a balloon over its head.
//!
//! Modes: Normal (game window in use) → Asking (the window was minimized: the character asks whether to
//! stay in the background) → Background (game window hidden, only the character on screen).
//! Closing the game window (red button, ⌘Q, tray "Sair") asks the game first, so it can save.

use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

/// The published game. DATALAB_URL overrides it (development: `npm run dev` points it at the local
/// server). Any other origin must also be listed in capabilities/game.json, or the bridge gets no IPC.
const GAME_URL: &str = "https://datalab-six.vercel.app/jogo.html";
/// The character window, in logical pixels (the character + room for the balloon over its head).
const COMPANION_W: f64 = 280.0;
const COMPANION_H: f64 = 300.0;
const COMPANION_MARGIN: f64 = 12.0;
/// If the game doesn't answer a close / quit request in time (page broken, offline…), quit anyway.
const QUIT_TIMEOUT: Duration = Duration::from_secs(12);
/// How often the game window's minimized state is checked.
const MINIMIZE_POLL: Duration = Duration::from_millis(400);

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Debug)]
#[serde(rename_all = "lowercase")]
enum Mode {
    Normal,
    Asking,
    Background,
}

/// What the player chose to do when minimizing ("Lembrar minha escolha"): saved in the app's config dir.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Debug)]
#[serde(rename_all = "lowercase")]
enum MinimizePref {
    Ask,
    Background,
    Minimize,
}

struct AppState {
    mode: Mutex<Mode>,
    look: Mutex<Value>,
    pref: Mutex<MinimizePref>,
    /// desktop.js said hello: the game can handle close / quit requests (save first)
    bridge: AtomicBool,
    /// a quit is on its way (the game is saving): don't ask again
    quitting: AtomicBool,
}

#[derive(Clone, Serialize)]
struct CompanionView {
    mode: Mode,
    look: Value,
}

#[derive(Clone, Serialize)]
struct Notice {
    tone: String,
    label: String,
    text: String,
}

/// Development builds only: what the shell is doing, on the terminal that ran `npm run dev`.
macro_rules! dev_log {
    ($($t:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!("[datalab] {}", format!($($t)*));
    };
}

/* ------------------------------------------------------------------ */
/* preferences                                                         */
/* ------------------------------------------------------------------ */

fn pref_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("desktop.json"))
}

fn load_pref(app: &AppHandle) -> MinimizePref {
    let Some(path) = pref_file(app) else { return MinimizePref::Ask };
    let Ok(text) = std::fs::read_to_string(path) else { return MinimizePref::Ask };
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    match v.get("minimize").and_then(Value::as_str) {
        Some("background") => MinimizePref::Background,
        Some("minimize") => MinimizePref::Minimize,
        _ => MinimizePref::Ask,
    }
}

fn save_pref(app: &AppHandle, pref: MinimizePref) {
    let Some(path) = pref_file(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let name = match pref {
        MinimizePref::Ask => "ask",
        MinimizePref::Background => "background",
        MinimizePref::Minimize => "minimize",
    };
    let _ = std::fs::write(path, serde_json::json!({ "minimize": name }).to_string());
}

/* ------------------------------------------------------------------ */
/* windows                                                             */
/* ------------------------------------------------------------------ */

fn game_url() -> tauri::Url {
    let raw = std::env::var("DATALAB_URL").unwrap_or_else(|_| GAME_URL.to_string());
    raw.parse().unwrap_or_else(|_| GAME_URL.parse().expect("GAME_URL is a valid URL"))
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn companion_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("companion")
}

/// Bottom-right corner of the screen the game window is on, above the Dock / taskbar.
fn place_companion(app: &AppHandle) {
    let Some(comp) = companion_window(app) else { return };
    let monitor = main_window(app)
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| comp.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let w = (COMPANION_W * scale).round() as i32;
    let h = (COMPANION_H * scale).round() as i32;
    let m = (COMPANION_MARGIN * scale).round() as i32;
    let x = area.position.x + area.size.width as i32 - w - m;
    let y = area.position.y + area.size.height as i32 - h;
    // the character stands on the bottom edge (the Dock's top); the side margin keeps it off the corner
    let _ = comp.set_position(PhysicalPosition::new(x, y.max(area.position.y)));
}

fn set_mode(app: &AppHandle, mode: Mode) {
    let state = app.state::<AppState>();
    *state.mode.lock().unwrap() = mode;
    dev_log!("mode → {:?}", mode);
    let view = CompanionView { mode, look: state.look.lock().unwrap().clone() };
    let _ = app.emit_to("companion", "companion://state", view);
    let _ = app.emit_to("main", "desktop://background", mode == Mode::Background);
    update_tray(app, mode);
}

fn show_companion(app: &AppHandle) {
    let Some(comp) = companion_window(app) else { return };
    if !comp.is_visible().unwrap_or(false) {
        place_companion(app);
    }
    let _ = comp.show();
}

fn enter_background(app: &AppHandle) {
    set_mode(app, Mode::Background);
    show_companion(app);
    if let Some(main) = main_window(app) {
        // hidden as it is (a minimized window too: restoring it first would bring it back on screen once
        // the Dock animation ends, after the hide)
        let _ = main.hide();
    }
}

fn show_game(app: &AppHandle) {
    set_mode(app, Mode::Normal);
    if let Some(comp) = companion_window(app) {
        let _ = comp.hide();
    }
    if let Some(main) = main_window(app) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// The game window was minimized: do what the player chose before, or let the character ask.
fn on_minimized(app: &AppHandle) {
    let state = app.state::<AppState>();
    if *state.mode.lock().unwrap() != Mode::Normal {
        return;
    }
    let pref = *state.pref.lock().unwrap();
    match pref {
        MinimizePref::Minimize => {}
        MinimizePref::Background => enter_background(app),
        MinimizePref::Ask => {
            set_mode(app, Mode::Asking);
            show_companion(app);
        }
    }
}

/// macOS gives the app no "minimized" event (and none at all when the window wasn't focused, or for
/// ⌘M from the menu): a light watcher looks at the window's state a few times a second instead.
fn watch_minimize(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut was = false;
        loop {
            std::thread::sleep(MINIMIZE_POLL);
            let Some(main) = main_window(&app) else { return };
            let minimized = main.is_minimized().unwrap_or(false);
            let mode = *app.state::<AppState>().mode.lock().unwrap();
            // in the background the game window can only come back by the player's hand (its Dock tile,
            // Mission Control…): treat it as "back to the game"
            if mode == Mode::Background && !minimized && main.is_visible().unwrap_or(false) {
                was = false;
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || show_game(&app2));
                continue;
            }
            if minimized == was {
                continue;
            }
            was = minimized;
            let app2 = app.clone();
            if minimized && mode == Mode::Normal {
                let _ = app.run_on_main_thread(move || on_minimized(&app2));
            } else if !minimized && mode == Mode::Asking {
                // brought back from the Dock while the character was asking: forget the question
                let _ = app.run_on_main_thread(move || {
                    set_mode(&app2, Mode::Normal);
                    if let Some(comp) = companion_window(&app2) {
                        let _ = comp.hide();
                    }
                });
            }
        }
    });
}

/// Close / quit: the game saves first (desktop.js → desktop_quit). Without the bridge, quit right away.
fn request_quit(app: &AppHandle, reason: &str) {
    let state = app.state::<AppState>();
    if !state.bridge.load(Ordering::SeqCst) {
        app.exit(0);
        return;
    }
    if state.quitting.load(Ordering::SeqCst) {
        return;
    }
    // the game window must be on screen to show its "Sair / Segundo plano" dialog
    if reason == "close" {
        if let Some(main) = main_window(app) {
            let _ = main.show();
            let _ = main.set_focus();
        }
        let _ = app.emit_to("main", "desktop://close-requested", ());
    } else {
        state.quitting.store(true, Ordering::SeqCst);
        let _ = app.emit_to("main", "desktop://quit-requested", ());
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(QUIT_TIMEOUT);
            app.exit(0);
        });
    }
}

/* ------------------------------------------------------------------ */
/* tray (menu bar)                                                     */
/* ------------------------------------------------------------------ */

fn update_tray(app: &AppHandle, mode: Mode) {
    if let Some(tray) = app.tray_by_id("datalab") {
        let tip = match mode {
            Mode::Background => "DataLab · em segundo plano",
            _ => "DataLab",
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir o DataLab", true, None::<&str>)?;
    let bg = MenuItem::with_id(app, "background", "Deixar em segundo plano", true, None::<&str>)?;
    let ask = MenuItem::with_id(app, "ask", "Perguntar de novo ao minimizar", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do DataLab", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &bg, &ask, &sep, &quit])?;
    let mut tray = TrayIconBuilder::with_id("datalab")
        .tooltip("DataLab")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => show_game(app),
            "background" => enter_background(app),
            "ask" => {
                *app.state::<AppState>().pref.lock().unwrap() = MinimizePref::Ask;
                save_pref(app, MinimizePref::Ask);
            }
            "quit" => request_quit(app, "quit"),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            // Windows / Linux: a left click opens the game (macOS shows the menu)
            if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = ev {
                show_game(tray.app_handle());
            }
            let _ = MouseButtonState::Up;
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/* commands: the game page (desktop.js)                                */
/* ------------------------------------------------------------------ */

/// The bridge is up: the game can save before quitting. Returns the current mode.
#[tauri::command]
fn desktop_hello(state: State<'_, AppState>) -> Mode {
    state.bridge.store(true, Ordering::SeqCst);
    dev_log!("bridge: hello from the game page");
    *state.mode.lock().unwrap()
}

/// The player's look (crew.js lookOf + the pass extras): the character window draws the same skin.
#[tauri::command]
fn desktop_set_look(app: AppHandle, state: State<'_, AppState>, look: Value) -> Result<(), String> {
    if !look.is_object() || look.to_string().len() > 16_384 {
        return Err("look inválido".into());
    }
    dev_log!("look: {}", look);
    *state.look.lock().unwrap() = look;
    let mode = *state.mode.lock().unwrap();
    let view = CompanionView { mode, look: state.look.lock().unwrap().clone() };
    let _ = app.emit_to("companion", "companion://state", view);
    Ok(())
}

/// A game notification (toast): shown over the character's head while it's on screen.
#[tauri::command]
fn desktop_notify(app: AppHandle, state: State<'_, AppState>, tone: String, label: String, text: String) {
    if *state.mode.lock().unwrap() != Mode::Background {
        return;
    }
    let clip = |s: String, n: usize| s.chars().take(n).collect::<String>();
    let tone = match tone.as_str() {
        "warn" | "ok" | "info" => tone,
        _ => "info".into(),
    };
    dev_log!("notify [{}] {}: {}", tone, label, text);
    let _ = app.emit_to("companion", "companion://notify", Notice { tone, label: clip(label, 80), text: clip(text, 220) });
}

/// The in-game "Segundo plano" button / dialog.
#[tauri::command]
fn desktop_background(app: AppHandle) {
    enter_background(&app);
}

/// The game saved (or tried to): quit now.
#[tauri::command]
fn desktop_quit(app: AppHandle) {
    app.state::<AppState>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

/* ------------------------------------------------------------------ */
/* commands: the character window (companion.js)                       */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn companion_state(state: State<'_, AppState>) -> CompanionView {
    CompanionView { mode: *state.mode.lock().unwrap(), look: state.look.lock().unwrap().clone() }
}

#[tauri::command]
fn companion_open_game(app: AppHandle) {
    show_game(&app);
}

/// The answer to "Deixar o DataLab em segundo plano?": "background" or "minimize".
#[tauri::command]
fn companion_answer(app: AppHandle, state: State<'_, AppState>, choice: String, remember: bool) {
    let pref = if choice == "background" { MinimizePref::Background } else { MinimizePref::Minimize };
    if remember {
        *state.pref.lock().unwrap() = pref;
        save_pref(&app, pref);
    }
    if pref == MinimizePref::Background {
        enter_background(&app);
    } else {
        set_mode(&app, Mode::Normal);
        if let Some(comp) = companion_window(&app) {
            let _ = comp.hide();
        }
    }
}

/* ------------------------------------------------------------------ */
/* macOS: no App Nap                                                   */
/* ------------------------------------------------------------------ */

/// With the game window hidden, macOS would nap the app and slow its timers to a crawl: the game keeps
/// running in the background on purpose (the character's notifications come from it).
#[cfg(target_os = "macos")]
fn keep_awake() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    let info = NSProcessInfo::processInfo();
    let reason = NSString::from_str("O DataLab continua rodando em segundo plano");
    let token = info.beginActivityWithOptions_reason(NSActivityOptions::UserInitiatedAllowingIdleSystemSleep, &reason);
    // held for the whole run (dropping it would end the activity)
    std::mem::forget(token);
}

#[cfg(not(target_os = "macos"))]
fn keep_awake() {}

/* ------------------------------------------------------------------ */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppState {
            mode: Mutex::new(Mode::Normal),
            look: Mutex::new(Value::Null),
            pref: Mutex::new(MinimizePref::Ask),
            bridge: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            desktop_hello,
            desktop_set_look,
            desktop_notify,
            desktop_background,
            desktop_quit,
            companion_state,
            companion_open_game,
            companion_answer
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            *app.state::<AppState>().pref.lock().unwrap() = load_pref(&handle);
            keep_awake();

            let main = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(game_url()))
                .title("DataLab")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .center()
                .build()?;
            let h = handle.clone();
            main.on_window_event(move |ev| match ev {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    request_quit(&h, "close");
                }
                _ => {}
            });

            WebviewWindowBuilder::new(app, "companion", WebviewUrl::App("companion.html".into()))
                .title("DataLab")
                .inner_size(COMPANION_W, COMPANION_H)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible_on_all_workspaces(true)
                .accept_first_mouse(true)
                .focused(false)
                .visible(false)
                .build()?;

            build_tray(&handle)?;
            watch_minimize(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the DataLab desktop app");

    app.run(|app, ev| match ev {
        // ⌘Q / the app menu's "Quit": let the game save first
        RunEvent::ExitRequested { api, code: None, .. } => {
            let state = app.state::<AppState>();
            if state.bridge.load(Ordering::SeqCst) && !state.quitting.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_quit(app, "quit");
            }
        }
        // clicking the Dock icon while only the character is on screen
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => {
            if *app.state::<AppState>().mode.lock().unwrap() != Mode::Normal {
                show_game(app);
            }
        }
        _ => {}
    });
}
