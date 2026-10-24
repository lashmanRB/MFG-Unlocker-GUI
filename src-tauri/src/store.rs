use crate::model::{Store, StoredGame};
use std::path::{Path, PathBuf};

const STORE_FILE: &str = "store.json";

pub fn load(data_dir: &Path) -> Store {
    let Ok(text) = std::fs::read_to_string(store_path(data_dir)) else {
        return Store::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save(data_dir: &Path, store: &Store) -> Result<(), String> {
    let text = serde_json::to_string_pretty(store)
        .map_err(|error| format!("cannot write the app state: {error}"))?;
    std::fs::create_dir_all(data_dir)
        .map_err(|error| format!("cannot create {}: {error}", data_dir.display()))?;

    let path = store_path(data_dir);
    let temporary = data_dir.join(format!("{STORE_FILE}.tmp"));
    std::fs::write(&temporary, text)
        .map_err(|error| format!("cannot write {}: {error}", temporary.display()))?;
    std::fs::rename(&temporary, &path).map_err(|error| {
        let _ = std::fs::remove_file(&temporary);
        format!("cannot write {}: {error}", path.display())
    })
}

pub fn upsert(store: &mut Store, game: StoredGame) {
    match store.games.iter_mut().find(|held| held.id == game.id) {
        Some(held) => *held = game,
        None => store.games.push(game),
    }
}

pub fn remove(store: &mut Store, id: &str) -> bool {
    let before = store.games.len();
    store.games.retain(|game| game.id != id);
    store.games.len() != before
}

fn store_path(data_dir: &Path) -> PathBuf {
    data_dir.join(STORE_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn game(id: &str, dir: &str) -> StoredGame {
        StoredGame {
            id: id.to_string(),
            name: format!("Game {id}"),
            source: "steam".to_string(),
            install_dir: dir.to_string(),
            ..StoredGame::default()
        }
    }

    #[test]
    fn a_missing_or_broken_file_loads_empty() {
        let data = scratch("empty");
        let store = load(&data);
        assert!(store.games.is_empty());
        assert_eq!(store.cached_release_tag, None);

        std::fs::write(data.join(STORE_FILE), "{ this is not json").unwrap();
        assert!(load(&data).games.is_empty());
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn saving_keeps_the_installed_games() {
        let data = scratch("save");
        let mut store = Store {
            cached_release_tag: Some("v1.6.1".to_string()),
            ..Store::default()
        };
        let mut installed = game("game:one", "C:/Games/One");
        installed.dll_name = Some("version.dll".to_string());
        installed.sha256 = Some("a".repeat(64));
        installed.installed_at = Some(42);
        upsert(&mut store, installed);

        save(&data, &store).unwrap();
        let loaded = load(&data);
        assert_eq!(loaded.games.len(), 1);
        assert_eq!(loaded.cached_release_tag.as_deref(), Some("v1.6.1"));
        let info = loaded.games[0].install_info().unwrap();
        assert_eq!(info.dll_name, "version.dll");
        assert_eq!(info.installed_at, 42);
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn upsert_replaces_by_id_and_pushes_new_ones() {
        let mut store = Store::default();
        upsert(&mut store, game("a", "C:\\Games\\A"));
        upsert(&mut store, game("b", "C:\\Games\\B"));
        assert_eq!(store.games.len(), 2);

        let mut changed = game("a", "C:\\Games\\A");
        changed.name = "Renamed".to_string();
        upsert(&mut store, changed);
        assert_eq!(store.games.len(), 2);
        assert_eq!(store.games[0].name, "Renamed");
    }

    #[test]
    fn remove_reports_whether_it_had_the_id() {
        let mut store = Store::default();
        upsert(&mut store, game("a", "C:\\Games\\A"));
        assert!(remove(&mut store, "a"));
        assert!(store.games.is_empty());
        assert!(!remove(&mut store, "a"));
    }
}
