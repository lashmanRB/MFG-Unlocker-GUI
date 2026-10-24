mod commands;
mod compat;
mod gamedir;
mod install;
mod model;
mod nvidia;
mod portable;
mod release;
mod settings;
mod status;
mod steam;
mod store;
mod winstate;

use std::sync::Mutex;
use tauri::{Manager, Theme, WebviewUrl, WebviewWindowBuilder, WindowEvent};

// The last normal (not maximized) window rectangle, so restoring a maximized
// window still knows which size to come back to.
struct Geometry(Mutex<Option<winstate::WindowState>>);

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Geometry(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            app_version,
            commands::scan_all,
            commands::rescan_game,
            commands::add_manual_game,
            commands::forget_game,
            commands::set_game_exe,
            commands::install_mod,
            commands::uninstall_mod,
            commands::release_info,
            commands::auto_update,
            commands::read_settings,
            commands::write_settings,
            commands::read_status,
            commands::list_logs,
            commands::read_log,
            commands::launch_game,
            commands::open_path,
        ])
        .setup(|app| {
            let data_dir = portable::data_dir().ok();
            let saved = data_dir
                .as_deref()
                .and_then(winstate::load)
                .filter(|state| winstate::on_some_monitor(&app.handle(), state));

            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("MFG Unlocker GUI")
                .inner_size(1200.0, 780.0)
                .min_inner_size(960.0, 620.0)
                .theme(Some(Theme::Dark));

            if let Some(dir) = portable::webview_dir() {
                builder = builder.data_directory(dir);
            }

            match &saved {
                Some(state) => {
                    builder = builder
                        .position(state.x as f64, state.y as f64)
                        .inner_size(state.width as f64, state.height as f64);
                }
                None => builder = builder.center(),
            }

            let window = builder.build()?;
            if let Some(state) = &saved {
                *app.state::<Geometry>()
                    .0
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(state.clone());
                if state.maximized {
                    let _ = window.maximize();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            let geometry = window.state::<Geometry>();
            let mut slot = geometry
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    if !window.is_maximized().unwrap_or(false) {
                        if let Some(state) = winstate::read_geometry(window) {
                            if winstate::looks_unmaximized(window, &state) {
                                *slot = Some(state);
                            }
                        }
                    }
                }
                WindowEvent::CloseRequested { .. } => {
                    let maximized = window.is_maximized().unwrap_or(false);
                    // A maximized close keeps the last normal rectangle, which the
                    // resize events above have been collecting.
                    let state = if maximized {
                        slot.clone().map(|mut state| {
                            state.maximized = true;
                            state
                        })
                    } else {
                        winstate::read_geometry(window)
                    };
                    if let Some(state) = state {
                        if let Ok(dir) = portable::data_dir() {
                            let _ = winstate::save(&dir, &state);
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
