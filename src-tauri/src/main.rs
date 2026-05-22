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
                spawn_sidecar(app);
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(debug_assertions))]
fn spawn_sidecar(app: &tauri::App) {
    use std::path::PathBuf;

    let mut log = String::new();
    log.push_str("--- sidecar spawn attempt ---\n");

    // Collect candidate locations where the sidecar might live, depending on
    // installer (NSIS vs MSI vs Portable) and Tauri's resource_dir behavior.
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(rd) = app.path().resource_dir() {
        log.push_str(&format!("resource_dir: {}\n", rd.display()));
        candidates.push(rd.join("sidecar").join("index.js"));
        candidates.push(rd.join("resources").join("sidecar").join("index.js"));
        candidates.push(rd.join("_up_").join("sidecar").join("index.js"));
    }

    if let Ok(exe) = std::env::current_exe() {
        log.push_str(&format!("current_exe: {}\n", exe.display()));
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("sidecar").join("index.js"));
            candidates.push(parent.join("resources").join("sidecar").join("index.js"));
        }
    }

    let chosen = candidates.iter().find(|p| p.exists()).cloned().map(|p| {
        // Strip Windows verbatim path prefix `\\?\` because Node.js ESM
        // module resolution doesn't handle it well.
        let s = p.to_string_lossy().to_string();
        let cleaned = s.strip_prefix(r"\\?\").map(|x| x.to_string()).unwrap_or(s);
        PathBuf::from(cleaned)
    });

    let log_path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .map(|p| p.join("sidecar-spawn.log"));

    let sidecar_js = match chosen {
        Some(p) => {
            log.push_str(&format!("found: {}\n", p.display()));
            p
        }
        None => {
            log.push_str("NO sidecar/index.js found in any candidate location\n");
            for c in &candidates {
                log.push_str(&format!("  tried: {}\n", c.display()));
            }
            if let Some(lp) = log_path {
                let _ = std::fs::write(&lp, log);
            }
            return;
        }
    };

    let mut cmd = std::process::Command::new("node");
    cmd.arg(&sidecar_js);

    // Spawn with cwd set to the sidecar dir so node_modules resolution works.
    // Strip verbatim prefix here too — some node versions choke on `\\?\` cwd.
    if let Some(parent) = sidecar_js.parent() {
        let parent_str = parent.to_string_lossy().to_string();
        let cleaned_parent = parent_str
            .strip_prefix(r"\\?\")
            .map(|x| x.to_string())
            .unwrap_or(parent_str);
        cmd.current_dir(&cleaned_parent);
        log.push_str(&format!("cwd: {}\n", cleaned_parent));
    }

    // Hide the console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            log.push_str(&format!("spawn OK, pid={}\n", child.id()));
        }
        Err(e) => {
            log.push_str(&format!("spawn ERR: {}\n", e));
            log.push_str("hint: ensure Node.js is installed and on PATH\n");
        }
    }

    if let Some(lp) = log_path {
        let _ = std::fs::write(&lp, log);
    }
}
