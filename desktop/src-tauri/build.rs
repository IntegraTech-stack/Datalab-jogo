// The app's own commands are listed here so each window only gets the ones its capability grants
// (capabilities/game.json → the game page, capabilities/companion.json → the character window).
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            // game page (desktop.js)
            "desktop_hello",
            "desktop_set_look",
            "desktop_notify",
            "desktop_background",
            "desktop_quit",
            // character window (companion.js)
            "companion_state",
            "companion_open_game",
            "companion_answer",
        ]),
    ))
    .expect("failed to run tauri-build");
}
