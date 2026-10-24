use crate::compat;
use crate::gamedir;
use crate::install;
use crate::model::{
    normalize_path, ApplyResult, AutoUpdateReport, ExeCandidate, GameEntry, GameSettings,
    InstallInfo, LogFile, ReleaseInfo, ScanResult, StatusSummary, SteamLibrary, SteamScan,
    StoredGame, Store, UpdatedGame, LOG_PREFIX,
};
use crate::portable;
use crate::release;
use crate::settings;
use crate::status;
use crate::steam;
use crate::store;
use std::path::{Path, PathBuf};

const WORKERS: usize = 6;
const MAX_EXES: usize = 24;

fn game_id_for(install_dir: &Path) -> String {
    format!("game:{}", normalize_path(&install_dir.to_string_lossy()))
}

fn header_url(app_id: Option<u32>) -> Option<String> {
    app_id.map(|id| format!("https://cdn.akamai.steamstatic.com/steam/apps/{id}/header.jpg"))
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn exe_dir_of(exe_path: Option<&str>) -> Option<PathBuf> {
    let path = Path::new(exe_path?);
    let parent = path.parent()?;
    parent.exists().then(|| parent.to_path_buf())
}

fn make_entry(
    name: &str,
    source: &str,
    app_id: Option<u32>,
    install_dir: &Path,
    size: Option<u64>,
    library: Option<String>,
    stored: Option<&StoredGame>,
) -> GameEntry {
    let candidates = gamedir::find_executables(install_dir, MAX_EXES);
    let stored_exe = stored
        .and_then(|record| record.exe_path.clone())
        .filter(|path| Path::new(path).exists());
    let picked = stored_exe.or_else(|| {
        gamedir::pick_default_exe(&candidates, name, &folder_name(install_dir))
            .map(|found| found.path.to_string_lossy().to_string())
    });
    let exe_dir = exe_dir_of(picked.as_deref());
    let report = compat::classify(install_dir, exe_dir.as_deref());
    let work_dir = exe_dir
        .clone()
        .unwrap_or_else(|| install_dir.to_path_buf());

    GameEntry {
        id: game_id_for(install_dir),
        name: name.to_string(),
        source: source.to_string(),
        app_id,
        install_dir: install_dir.to_string_lossy().to_string(),
        work_dir: work_dir.to_string_lossy().to_string(),
        exe_path: picked,
        exe_candidates: candidates
            .into_iter()
            .map(|found| ExeCandidate {
                path: found.path.to_string_lossy().to_string(),
                name: found.name,
                size_bytes: found.size,
            })
            .collect(),
        compat: report,
        install: stored.and_then(StoredGame::install_info),
        header_url: header_url(app_id),
        size_on_disk: size,
        library_path: library,
    }
}

fn record_from_entry(entry: &GameEntry, previous: Option<&StoredGame>) -> StoredGame {
    let mut record = StoredGame {
        id: entry.id.clone(),
        name: entry.name.clone(),
        source: entry.source.clone(),
        app_id: entry.app_id,
        install_dir: entry.install_dir.clone(),
        exe_path: entry.exe_path.clone(),
        size_on_disk: entry.size_on_disk,
        library_path: entry.library_path.clone(),
        ..StoredGame::default()
    };
    if let Some(old) = previous {
        record.dll_name = old.dll_name.clone();
        record.version = old.version.clone();
        record.sha256 = old.sha256.clone();
        record.bink_backup = old.bink_backup.clone();
        record.installed_at = old.installed_at;
        record.previous = old.previous.clone();
    }
    record
}

fn find_record(store: &Store, id: &str) -> Result<StoredGame, String> {
    store
        .games
        .iter()
        .find(|record| record.id == id)
        .cloned()
        .ok_or_else(|| "Unknown game. Run a rescan.".to_string())
}

fn existing_dir(record: &StoredGame) -> Result<PathBuf, String> {
    let dir = PathBuf::from(&record.install_dir);
    if !dir.is_dir() {
        return Err(format!("The folder {} is gone.", dir.display()));
    }
    Ok(dir)
}

fn install_dir_of(record: &StoredGame) -> PathBuf {
    PathBuf::from(&record.install_dir)
}

fn run_parallel<T, R, F>(items: &[T], workers: usize, work: F) -> Vec<R>
where
    T: Sync,
    R: Send,
    F: Fn(&T) -> R + Sync,
{
    if items.is_empty() {
        return Vec::new();
    }
    let workers = workers.clamp(1, items.len());
    let chunk = items.len().div_ceil(workers);
    std::thread::scope(|scope| {
        let handles: Vec<_> = items
            .chunks(chunk)
            .map(|slice| scope.spawn(|| slice.iter().map(&work).collect::<Vec<R>>()))
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap_or_default())
            .collect()
    })
}

fn scan_blocking() -> Result<ScanResult, String> {
    let dir = portable::data_dir()?;
    let mut store = store::load(&dir);
    let mut errors = Vec::new();
    let mut libraries = Vec::new();
    let mut apps = Vec::new();
    let mut steam_path = None;

    match steam::find_steam() {
        Ok(found) => {
            match steam::libraries(&found) {
                Ok(found_libraries) => libraries = found_libraries,
                Err(message) => {
                    errors.push(message);
                    libraries = vec![found.clone()];
                }
            }
            if libraries.is_empty() {
                libraries = vec![found.clone()];
            }
            apps = steam::installed_apps(&libraries);
            steam_path = Some(found.to_string_lossy().to_string());
        }
        Err(message) => errors.push(message),
    }

    let root = steam_path
        .as_deref()
        .map(normalize_path)
        .unwrap_or_default();
    let labels: Vec<SteamLibrary> = libraries
        .iter()
        .map(|path| {
            let text = path.to_string_lossy().to_string();
            let label = if normalize_path(&text) == root {
                "Steam".to_string()
            } else {
                steam::library_label(path)
            };
            SteamLibrary { path: text, label }
        })
        .collect();

    let jobs: Vec<(steam::SteamApp, Option<StoredGame>)> = apps
        .iter()
        .map(|steam_app| {
            let previous = store
                .games
                .iter()
                .find(|record| {
                    normalize_path(&record.install_dir)
                        == normalize_path(&steam_app.install_dir.to_string_lossy())
                })
                .cloned();
            (steam_app.clone(), previous)
        })
        .collect();

    let steam_entries = run_parallel(&jobs, WORKERS, |(steam_app, previous)| {
        let library = libraries
            .iter()
            .filter(|root| steam_app.install_dir.starts_with(root))
            .max_by_key(|root| root.components().count())
            .map(|root| root.to_string_lossy().to_string());
        make_entry(
            &steam_app.name,
            "steam",
            Some(steam_app.app_id),
            &steam_app.install_dir,
            Some(steam_app.size_on_disk),
            library,
            previous.as_ref(),
        )
    });

    // A folder the user added and then moved away should leave the list with it.
    let manual_records: Vec<StoredGame> = store
        .games
        .iter()
        .filter(|record| record.source == "manual" && Path::new(&record.install_dir).is_dir())
        .cloned()
        .collect();
    let manual_entries = run_parallel(&manual_records, WORKERS, |record| {
        let install_dir = PathBuf::from(&record.install_dir);
        make_entry(
            &record.name,
            "manual",
            None,
            &install_dir,
            record.size_on_disk,
            record.library_path.clone(),
            Some(record),
        )
    });

    let mut next = Store {
        cached_release_dir: store.cached_release_dir.clone(),
        cached_release_tag: store.cached_release_tag.clone(),
        games: Vec::new(),
    };
    for entry in &steam_entries {
        let previous = store.games.iter().find(|record| record.id == entry.id);
        next.games.push(record_from_entry(entry, previous));
    }
    for entry in &manual_entries {
        let previous = store.games.iter().find(|record| record.id == entry.id);
        next.games.push(record_from_entry(entry, previous));
    }
    // Keep install metadata for games that dropped out of the Steam scan but are still on disk,
    // otherwise an uninstall would forget which file to remove.
    for record in &store.games {
        let known = next.games.iter().any(|kept| kept.id == record.id);
        let installed = record.dll_name.is_some();
        if !known && installed && Path::new(&record.install_dir).is_dir() {
            next.games.push(record.clone());
        }
    }
    next.games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    store = next;
    if let Err(message) = store::save(&dir, &store) {
        errors.push(message);
    }

    let mut games = steam_entries;
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(ScanResult {
        scan: SteamScan {
            steam_path,
            libraries: labels,
            games,
            errors,
        },
        manual: manual_entries,
        gpu: compat::gpu(),
    })
}

#[tauri::command]
pub async fn scan_all() -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(scan_blocking)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn rescan_game(game_id: String) -> Result<GameEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = portable::data_dir()?;
        let current = store::load(&dir);
        let record = find_record(&current, &game_id)?;
        let install_dir = existing_dir(&record)?;
        Ok(make_entry(
            &record.name,
            &record.source,
            record.app_id,
            &install_dir,
            record.size_on_disk,
            record.library_path.clone(),
            Some(&record),
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn add_manual_game(path: String) -> Result<GameEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let install_dir = PathBuf::from(&path);
        if !install_dir.is_dir() {
            return Err("Pick a folder that exists.".to_string());
        }
        let name = folder_name(&install_dir);
        let entry = make_entry(&name, "manual", None, &install_dir, None, None, None);
        let dir = portable::data_dir()?;
        let mut current = store::load(&dir);
        let record = record_from_entry(&entry, None);
        store::upsert(&mut current, record);
        store::save(&dir, &current)?;
        Ok(entry)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(async)]
pub fn forget_game(game_id: String) -> Result<(), String> {
    let dir = portable::data_dir()?;
    let mut current = store::load(&dir);
    if !store::remove(&mut current, &game_id) {
        return Err("Unknown game.".to_string());
    }
    store::save(&dir, &current)
}

#[tauri::command]
pub async fn set_game_exe(game_id: String, exe_path: String) -> Result<GameEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !Path::new(&exe_path).is_file() {
            return Err("That executable does not exist.".to_string());
        }
        let dir = portable::data_dir()?;
        let mut current = store::load(&dir);
        let mut record = find_record(&current, &game_id)?;
        let install_dir = existing_dir(&record)?;
        let chosen = Path::new(&exe_path);
        if !chosen.starts_with(&install_dir) {
            return Err("The executable has to sit inside the game folder.".to_string());
        }
        record.exe_path = Some(exe_path);
        store::upsert(&mut current, record.clone());
        store::save(&dir, &current)?;
        Ok(make_entry(
            &record.name,
            &record.source,
            record.app_id,
            &install_dir,
            record.size_on_disk,
            record.library_path.clone(),
            Some(&record),
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn install_at(dir: &Path, game_id: &str, dll_name: &str, bink: bool) -> Result<InstallInfo, String> {
    let name = dll_name.trim().to_ascii_lowercase();
    let mut current = store::load(dir);
    let mut record = find_record(&current, game_id)?;
    let install_dir = existing_dir(&record)?;
    let work = PathBuf::from(&record.exe_path.clone().unwrap_or_default())
        .parent()
        .filter(|parent| parent.is_dir())
        .map(|parent| parent.to_path_buf())
        .unwrap_or(install_dir);

    if !gamedir::check_folder_writable(&work) {
        return Err(format!(
            "{} cannot be written to without administrator rights. Start the app as administrator, or pick a game folder you own.",
            work.display()
        ));
    }

    let mut info = install::install(dir, &work, &name, bink)?;
    let version = info
        .version
        .clone()
        .or_else(|| release::cached_release(dir).map(|cached| cached.tag));
    // The older build we just replaced belongs to the record being replaced.
    if let Some(previous) = info.previous.as_mut() {
        if previous.version.is_none() {
            previous.version = record.version.clone();
        }
    }
    record.dll_name = Some(info.dll_name.clone());
    record.sha256 = Some(info.sha256.clone());
    record.bink_backup = info.bink_backup.clone();
    record.installed_at = Some(info.installed_at);
    record.version = version.clone();
    record.previous = info.previous.clone();
    store::upsert(&mut current, record);
    store::save(dir, &current)?;

    Ok(InstallInfo { version, ..info })
}

fn uninstall_at(dir: &Path, game_id: &str) -> Result<(), String> {
    let mut current = store::load(dir);
    let mut record = find_record(&current, game_id)?;
    let Some(info) = record.install_info() else {
        return Err("Nothing is installed here.".to_string());
    };
    let install_dir = PathBuf::from(&record.install_dir);
    let work = PathBuf::from(&record.exe_path.clone().unwrap_or_default())
        .parent()
        .filter(|parent| parent.is_dir())
        .map(|parent| parent.to_path_buf())
        .unwrap_or(install_dir);
    install::uninstall(&work, &info)?;
    match info.previous.clone() {
        // Undo put the older mod build back, so the folder still holds a mod.
        Some(previous) => {
            record.dll_name = Some(info.dll_name.clone());
            record.sha256 = Some(previous.sha256.clone());
            record.version = previous.version.clone();
            record.installed_at = Some(release::unix_now());
            record.bink_backup = info.bink_backup.clone();
            record.previous = None;
        }
        None => {
            record.dll_name = None;
            record.version = None;
            record.sha256 = None;
            record.bink_backup = None;
            record.installed_at = None;
            record.previous = None;
        }
    }
    store::upsert(&mut current, record);
    store::save(dir, &current)
}

#[tauri::command]
pub async fn install_mod(
    game_id: String,
    dll_name: String,
    bink: bool,
) -> Result<InstallInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = portable::data_dir()?;
        install_at(&dir, &game_id, &dll_name, bink)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn uninstall_mod(game_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = portable::data_dir()?;
        uninstall_at(&dir, &game_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn release_info(refresh: bool) -> Result<ReleaseInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = portable::data_dir()?;
        release::latest_info(&dir, refresh)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn auto_update_at(dir: &Path, refresh: bool) -> AutoUpdateReport {
    let mut report = AutoUpdateReport::default();

    let latest = match release::latest_info(dir, refresh) {
        Ok(latest) => latest,
        Err(message) => {
            report.failed.push(message);
            return report;
        }
    };
    report.release = Some(latest.clone());

    let had_download = release::cached_release(dir).is_none();
    if let Err(message) = release::ensure_dll(dir, false) {
        report.failed.push(message);
        return report;
    }
    report.downloaded = had_download;

    let store = store::load(dir);
    let stale: Vec<(String, String, String, bool)> = store
        .games
        .iter()
        .filter(|record| record.dll_name.is_some())
        .filter(|record| record.version.as_deref() != Some(latest.tag.as_str()))
        .filter_map(|record| {
            let dll = record.dll_name.clone()?;
            let bink = matches!(dll.as_str(), "binkw64.dll" | "bink2w64.dll");
            Some((record.id.clone(), record.name.clone(), dll, bink))
        })
        .collect();

    for (game_id, name, dll, bink) in stale {
        let from = store
            .games
            .iter()
            .find(|record| record.id == game_id)
            .and_then(|record| record.version.clone());
        match install_at(dir, &game_id, &dll, bink) {
            Ok(_) => report.updated.push(UpdatedGame {
                game_id,
                name,
                from,
                to: latest.tag.clone(),
            }),
            // A running game holds the DLL open, so this waits for the next start.
            Err(message) => report.failed.push(format!("{name}: {message}")),
        }
    }

    report
}

#[tauri::command]
pub async fn auto_update(refresh: bool) -> Result<AutoUpdateReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = portable::data_dir()?;
        Ok(auto_update_at(&dir, refresh))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn work_dir_in(dir: &Path, game_id: &str) -> Result<PathBuf, String> {
    let current = store::load(dir);
    let record = find_record(&current, game_id)?;
    let install_dir = install_dir_of(&record);
    Ok(exe_dir_of(record.exe_path.as_deref()).unwrap_or(install_dir))
}

fn game_work_dir(game_id: &str) -> Result<PathBuf, String> {
    work_dir_in(&portable::data_dir()?, game_id)
}

#[tauri::command(async)]
pub fn read_settings(game_id: String) -> Result<GameSettings, String> {
    settings::read(&game_work_dir(&game_id)?)
}

#[tauri::command(async)]
pub fn write_settings(game_id: String, settings: GameSettings) -> Result<ApplyResult, String> {
    settings::write(&game_work_dir(&game_id)?, &settings)
}

#[tauri::command(async)]
pub fn read_status(game_id: String) -> Result<Option<StatusSummary>, String> {
    Ok(status::read(&game_work_dir(&game_id)?))
}

#[tauri::command(async)]
pub fn list_logs(game_id: String) -> Result<Vec<LogFile>, String> {
    let work = game_work_dir(&game_id)?;
    let mut logs = Vec::new();
    let Ok(entries) = std::fs::read_dir(&work) else {
        return Ok(logs);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        if !name.starts_with(LOG_PREFIX) || !name.to_ascii_lowercase().ends_with(".log") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|delta| delta.as_secs())
            .unwrap_or(0);
        logs.push(LogFile {
            path: path.to_string_lossy().to_string(),
            name,
            size_bytes: meta.len(),
            modified,
        });
    }
    logs.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(logs)
}

#[tauri::command(async)]
pub fn read_log(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let limit = max_bytes.unwrap_or(262_144).clamp(4096, 4_194_304) as usize;
    let bytes = std::fs::read(&path).map_err(|error| format!("cannot read the log: {error}"))?;
    let slice = if bytes.len() > limit {
        &bytes[bytes.len() - limit..]
    } else {
        &bytes[..]
    };
    Ok(String::from_utf8_lossy(slice).to_string())
}

#[tauri::command(async)]
pub fn launch_game(game_id: String) -> Result<(), String> {
    let dir = portable::data_dir()?;
    let current = store::load(&dir);
    let record = find_record(&current, &game_id)?;
    let exe = record
        .exe_path
        .clone()
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .ok_or_else(|| "Pick the game executable first.".to_string())?;
    let mut command = std::process::Command::new(&exe);
    if let Some(parent) = exe.parent() {
        command.current_dir(parent);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("cannot start {}: {error}", exe.display()))
}

#[tauri::command(async)]
pub fn open_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("That path does not exist.".to_string());
    }
    std::process::Command::new("explorer.exe")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("cannot open the folder: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-commands-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    // A data dir that already holds an extracted release, so nothing touches the network.
    fn seed_release(data: &Path, tag: &str, body: &[u8]) {
        let release_dir = data.join("release");
        let folder = release_dir.join(tag);
        fs::create_dir_all(&folder).unwrap();
        let dll = folder.join(crate::model::MOD_DLL_NAME);
        fs::write(&dll, body).unwrap();
        fs::write(
            folder.join("meta.json"),
            format!(
                "{{\"tag\":\"{tag}\",\"dllSha256\":\"{}\",\"zipSha256\":\"{}\",\"extractedAt\":1000}}",
                release::sha256_file(&dll).unwrap(),
                "0".repeat(64)
            ),
        )
        .unwrap();
        fs::write(
            release_dir.join("latest.json"),
            format!(
                "{{\"tag\":\"{tag}\",\"name\":\"Test release\",\"publishedAt\":\"2026-01-01T00:00:00Z\",\
                 \"assetName\":\"MFGUnlocker-{tag}.zip\",\"sizeBytes\":42,\"sha256\":null,\
                 \"downloadUrl\":\"https://example.invalid/{tag}.zip\",\
                 \"pageUrl\":\"https://example.invalid/{tag}\",\"fetchedAt\":{}}}",
                release::unix_now()
            ),
        )
        .unwrap();
    }

    // The exe sits in a subfolder, the way Unreal games are laid out.
    fn seed_game(data: &Path, game_dir: &Path) -> String {
        let bin = game_dir.join("Binaries");
        fs::create_dir_all(&bin).unwrap();
        let exe = bin.join("Game.exe");
        fs::write(&exe, vec![0u8; 1024]).unwrap();
        let id = game_id_for(game_dir);
        let mut current = store::load(data);
        store::upsert(
            &mut current,
            StoredGame {
                id: id.clone(),
                name: "Test game".into(),
                source: "manual".into(),
                install_dir: game_dir.to_string_lossy().to_string(),
                exe_path: Some(exe.to_string_lossy().to_string()),
                ..StoredGame::default()
            },
        );
        store::save(data, &current).unwrap();
        id
    }

    #[test]
    fn install_update_and_undo_move_through_the_store() {
        let root = scratch("install");
        let data = root.join("data");
        let game_dir = root.join("game");
        fs::create_dir_all(&data).unwrap();
        seed_release(&data, "v1.0.0", b"MZ first build RTXMFG\n");
        let id = seed_game(&data, &game_dir);

        let work = work_dir_in(&data, &id).unwrap();
        assert_eq!(work, game_dir.join("Binaries"));

        let info = install_at(&data, &id, "WINMM.DLL", false).unwrap();
        assert_eq!(info.dll_name, "winmm.dll");
        assert!(work.join("winmm.dll").is_file());
        assert_eq!(
            find_record(&store::load(&data), &id).unwrap().version.as_deref(),
            Some("v1.0.0")
        );

        seed_release(&data, "v2.0.0", b"MZ second build RTXMFG\n");
        let update = install_at(&data, &id, "winmm.dll", false).unwrap();
        assert_eq!(update.version.as_deref(), Some("v2.0.0"));
        assert!(update.previous.is_some());
        assert_eq!(
            find_record(&store::load(&data), &id).unwrap().version.as_deref(),
            Some("v2.0.0")
        );

        uninstall_at(&data, &id).unwrap();
        assert_eq!(
            fs::read(work.join("winmm.dll")).unwrap(),
            b"MZ first build RTXMFG\n".to_vec()
        );
        assert_eq!(
            find_record(&store::load(&data), &id).unwrap().version.as_deref(),
            Some("v1.0.0")
        );

        // undoing the restored build takes the mod out for good
        uninstall_at(&data, &id).unwrap();
        assert!(!work.join("winmm.dll").exists());
        assert!(find_record(&store::load(&data), &id).unwrap().dll_name.is_none());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn an_older_install_is_updated_to_the_newest_release() {
        let root = scratch("autoupdate");
        let data = root.join("data");
        let game_dir = root.join("game");
        fs::create_dir_all(&data).unwrap();
        seed_release(&data, "v2.0.0", b"MZ newest build RTXMFG\n");
        let id = seed_game(&data, &game_dir);
        let work = work_dir_in(&data, &id).unwrap();

        // an install left over from the previous release
        fs::write(work.join("winmm.dll"), b"MZ older build RTXMFG\n").unwrap();
        let mut current = store::load(&data);
        let mut record = find_record(&current, &id).unwrap();
        record.dll_name = Some("winmm.dll".into());
        record.version = Some("v1.0.0".into());
        record.sha256 = Some(release::sha256_file(&work.join("winmm.dll")).unwrap());
        record.installed_at = Some(1);
        record.previous = None;
        store::upsert(&mut current, record);
        store::save(&data, &current).unwrap();

        let report = auto_update_at(&data, false);
        assert!(report.failed.is_empty(), "no failures: {:?}", report.failed);
        assert_eq!(report.release.as_ref().map(|release| release.tag.as_str()), Some("v2.0.0"));
        assert!(!report.downloaded, "the release was already cached");
        assert_eq!(report.updated.len(), 1);
        assert_eq!(report.updated[0].game_id, id);
        assert_eq!(report.updated[0].from.as_deref(), Some("v1.0.0"));
        assert_eq!(
            fs::read(work.join("winmm.dll")).unwrap(),
            b"MZ newest build RTXMFG\n".to_vec()
        );
        let record = find_record(&store::load(&data), &id).unwrap();
        assert_eq!(record.version.as_deref(), Some("v2.0.0"));
        assert!(record.previous.is_some(), "the replaced build stays for undo");

        // a second pass finds nothing left to do
        let again = auto_update_at(&data, false);
        assert!(again.updated.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn settings_status_and_logs_live_in_the_work_folder() {
        let root = scratch("files");
        let data = root.join("data");
        let game_dir = root.join("game");
        fs::create_dir_all(&data).unwrap();
        let id = seed_game(&data, &game_dir);
        let work = work_dir_in(&data, &id).unwrap();

        let wanted = GameSettings {
            mode: "fixed".into(),
            multiplier: 5,
            dlssg_preset: 3,
            ..GameSettings::default()
        };
        assert!(settings::write(&work, &wanted).unwrap().ok);
        let read_back = settings::read(&work).unwrap();
        assert_eq!(read_back.multiplier, 5);
        assert_eq!(read_back.dlssg_preset, 3);

        fs::write(
            work.join(crate::model::STATUS_FILE),
            "{\"version\":40,\"pid\":1,\"heartbeat\":1,\"safeMaximumMultiplier\":6,\
             \"bridgeReady\":true,\"gameFrameGenerationOn\":true,\"appliedFrameGenerationOn\":true,\
             \"desiredMultiplier\":5,\"appliedMultiplier\":5,\
             \"realFpsMilli\":60000,\"dlssFpsMilli\":300000}",
        )
        .unwrap();
        let summary = status::read(&work).unwrap();
        assert_eq!(summary.applied_multiplier, 5);
        assert_eq!(summary.dlss_fps, 300.0);

        fs::write(work.join("RTXMFG-test-0123.log"), "line one\n").unwrap();
        fs::write(work.join("notes.txt"), "ignore me\n").unwrap();
        let names: Vec<String> = fs::read_dir(&work)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .filter(|name| name.starts_with(LOG_PREFIX) && name.to_ascii_lowercase().ends_with(".log"))
            .collect();
        assert_eq!(names, vec!["RTXMFG-test-0123.log".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }
}
