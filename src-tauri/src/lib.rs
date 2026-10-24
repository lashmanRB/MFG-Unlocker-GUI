mod commands;
mod compat;
mod gamedir;
mod install;
mod model;
mod release;
mod settings;
mod status;
mod steam;
mod store;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            commands::read_settings,
            commands::write_settings,
            commands::read_status,
            commands::list_logs,
            commands::read_log,
            commands::launch_game,
            commands::open_path,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
