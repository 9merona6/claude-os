#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // In release builds, spawn the bundled sidecar (Node.js script).
            // In dev mode, `npm run tauri dev` already starts the sidecar via
            // concurrently, so we skip spawning to avoid port conflicts.
            #[cfg(not(debug_assertions))]
            {
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("could not resolve resource_dir");
                let sidecar_js = resource_dir.join("sidecar").join("index.js");

                let mut cmd = std::process::Command::new("node");
                cmd.arg(&sidecar_js);

                // Hide the console window on Windows so users don't see a flicker
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                match cmd.spawn() {
                    Ok(_child) => {
                        eprintln!("[tauri] sidecar spawned from {}", sidecar_js.display());
                    }
                    Err(e) => {
                        eprintln!("[tauri] failed to spawn sidecar at {}: {}", sidecar_js.display(), e);
                        eprintln!("[tauri] ensure Node.js is installed and on PATH");
                    }
                }
            }

            // Auto-check for updates on startup is handled in the frontend
            // (UpdateBanner component). We could also do it here in Rust if we
            // wanted a Rust-driven update prompt, but the frontend UI gives a
            // better UX.
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
