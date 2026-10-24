use crate::model::{InstallInfo, PreviousInstall, MOD_DLL_NAME};
use crate::release;
use std::path::{Path, PathBuf};

// A mod DLL is a few megabytes; a scan bigger than this is a different file.
const MARKER_SCAN_LIMIT: u64 = 16 * 1024 * 1024;
// Below this, two files of nearly the same size say nothing about either of them.
const SIMILAR_SIZE_FLOOR: u64 = 256 * 1024;

pub fn install(data_dir: &Path, game_dir: &Path, dll_name: &str) -> Result<InstallInfo, String> {
    let name = checked_name(dll_name)?;
    if !game_dir.is_dir() {
        return Err(format!("The game folder {} does not exist.", game_dir.display()));
    }

    let cached = release::ensure_dll(data_dir, false)?;

    // A Bink name belongs to the game's own DLL: move that one aside first so the
    // mod's proxy can load it back under the Hooked name.
    let bink_backup = preserve_bink(game_dir, &name)?;

    let target = game_dir.join(&name);
    if target.is_file() && !is_ours(&target, &cached) {
        return Err(format!(
            "{name} is already in the game folder and is not MFG Unlocker. Pick another name."
        ));
    }

    // Updating an older build of the mod keeps it here, so undo can go back to it.
    let previous = stash_previous(data_dir, game_dir, &target, &name, &cached);

    std::fs::copy(&cached.dll_path, &target).map_err(|error| {
        restore_bink(game_dir, &name, bink_backup.as_deref());
        restore_previous(&target, previous.as_ref());
        format!("cannot copy {MOD_DLL_NAME} into the game folder: {error}")
    })?;

    let sha256 = release::sha256_file(&target)?;
    if !sha256.eq_ignore_ascii_case(&cached.sha256) {
        let _ = std::fs::remove_file(&target);
        restore_bink(game_dir, &name, bink_backup.as_deref());
        restore_previous(&target, previous.as_ref());
        return Err(format!("The copy of {name} did not match the download, so it was removed."));
    }

    Ok(InstallInfo {
        dll_name: name,
        version: Some(cached.tag),
        sha256,
        bink_backup,
        installed_at: release::unix_now(),
        previous,
    })
}

fn stash_previous(
    data_dir: &Path,
    game_dir: &Path,
    target: &Path,
    name: &str,
    cached: &release::CachedRelease,
) -> Option<PreviousInstall> {
    if !target.is_file() {
        return None;
    }
    let sha256 = release::sha256_file(target).ok()?;
    if sha256.eq_ignore_ascii_case(&cached.sha256) {
        // Same build, nothing worth keeping.
        return None;
    }
    let backup = backup_path(data_dir, game_dir, name);
    if let Some(parent) = backup.parent() {
        std::fs::create_dir_all(parent).ok()?;
    }
    // Copy, not rename: the game usually sits on a different volume than the app data.
    std::fs::copy(target, &backup).ok()?;
    std::fs::remove_file(target).ok()?;
    Some(PreviousInstall {
        version: None,
        sha256,
        path: backup.to_string_lossy().to_string(),
    })
}

fn backup_path(data_dir: &Path, game_dir: &Path, name: &str) -> PathBuf {
    let key = release::sha256_text(&game_dir.to_string_lossy().to_ascii_lowercase());
    data_dir
        .join("backups")
        .join(&key[..16])
        .join(name)
}

fn restore_previous(target: &Path, previous: Option<&PreviousInstall>) {
    let Some(previous) = previous else { return };
    if !target.exists() {
        let _ = std::fs::copy(&previous.path, target);
    }
}

pub fn uninstall(game_dir: &Path, info: &InstallInfo) -> Result<(), String> {
    let target = game_dir.join(&info.dll_name);
    if target.is_file() {
        std::fs::remove_file(&target)
            .map_err(|error| format!("cannot remove {}: {error}", target.display()))?;
    }

    // Put back the build this install replaced, if there was one.
    let mut restored = false;
    if let Some(previous) = &info.previous {
        let kept = Path::new(&previous.path);
        if kept.is_file() {
            std::fs::copy(kept, &target).map_err(|error| {
                format!("cannot put the older {MOD_DLL_NAME} back: {error}")
            })?;
            let _ = std::fs::remove_file(kept);
            if let Some(folder) = kept.parent() {
                let _ = std::fs::remove_dir(folder);
            }
            restored = true;
        }
    }

    if let Some(backup_name) = &info.bink_backup {
        let backup = game_dir.join(backup_name);
        if backup.is_file() && !restored {
            std::fs::rename(&backup, game_dir.join(&info.dll_name)).map_err(|error| {
                format!("cannot put the game's {backup_name} back: {error}")
            })?;
        }
    }
    Ok(())
}

fn checked_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    let usable = name.to_ascii_lowercase().ends_with(".dll")
        && !name.contains('\\')
        && !name.contains('/')
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-'));
    if !usable {
        return Err("That file name cannot be used as a proxy DLL.".to_string());
    }
    Ok(name.to_string())
}

fn bink_backup_name(name: &str) -> Option<String> {
    let lower = name.to_ascii_lowercase();
    let stem = lower.strip_suffix(".dll")?;
    if stem != "binkw64" && stem != "bink2w64" {
        return None;
    }
    Some(format!("{stem}Hooked.dll"))
}

fn preserve_bink(game_dir: &Path, name: &str) -> Result<Option<String>, String> {
    let Some(backup_name) = bink_backup_name(name) else {
        return Ok(None);
    };
    let original = game_dir.join(name);
    let backup = game_dir.join(&backup_name);
    if original.is_file() && !backup.exists() {
        std::fs::rename(&original, &backup)
            .map_err(|error| format!("cannot rename {name} to {backup_name}: {error}"))?;
    }
    // Both files present means the game already runs the proxy and keeps its own
    // DLL in the Hooked file.
    Ok(backup.is_file().then_some(backup_name))
}

// A failed install must not leave the game without its Bink DLL.
fn restore_bink(game_dir: &Path, name: &str, backup: Option<&str>) {
    let Some(backup) = backup else { return };
    let original = game_dir.join(name);
    let hooked = game_dir.join(backup);
    if !original.exists() && hooked.is_file() {
        let _ = std::fs::rename(&hooked, &original);
    }
}

fn is_ours(path: &Path, cached: &release::CachedRelease) -> bool {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if name.eq_ignore_ascii_case(MOD_DLL_NAME) {
        return true;
    }
    if let Ok(sha256) = release::sha256_file(path) {
        if sha256.eq_ignore_ascii_case(&cached.sha256) {
            return true;
        }
    }
    let size = file_size(path);
    if size >= SIMILAR_SIZE_FLOOR && size.abs_diff(file_size(&cached.dll_path)) <= 64 {
        return true;
    }
    // An older build of the mod keeps its own name inside.
    is_mod_image(path)
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

// The mod's own DLL carries its product and file names as plain and UTF-16
// strings, which tells it apart from a game file holding the same name.
fn is_mod_image(path: &Path) -> bool {
    if file_size(path) > MARKER_SCAN_LIMIT {
        return false;
    }
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    ["MFGUnlocker", "RTXMFG"].iter().any(|marker| {
        let narrow = marker.as_bytes().to_vec();
        let wide: Vec<u8> = narrow.iter().flat_map(|byte| [*byte, 0]).collect();
        contains(&bytes, &narrow) || contains(&bytes, &wide)
    })
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    const FAKE_DLL: &[u8] = b"MZ fake mod body with RTXMFG-Universal.json inside\n";

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-install-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    // A data dir that already holds the release, so nothing touches the network.
    fn data_dir(root: &Path, tag: &str) -> PathBuf {
        let data = root.join("data");
        let release_dir = data.join("release");
        let folder = release_dir.join(tag);
        fs::create_dir_all(&folder).unwrap();
        let dll = folder.join(MOD_DLL_NAME);
        fs::write(&dll, FAKE_DLL).unwrap();
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
        data
    }

    #[test]
    fn installs_then_removes_the_proxy() {
        let root = scratch("plain");
        let data = data_dir(&root, "v9.9.9");
        let game = root.join("game");
        fs::create_dir_all(&game).unwrap();

        let info = install(&data, &game, "version.dll").unwrap();
        assert_eq!(info.dll_name, "version.dll");
        assert_eq!(info.version.as_deref(), Some("v9.9.9"));
        assert_eq!(info.bink_backup, None);
        assert_eq!(fs::read(game.join("version.dll")).unwrap(), FAKE_DLL);
        assert_eq!(info.sha256, release::sha256_file(&game.join("version.dll")).unwrap());
        assert!(info.installed_at > 0);
        assert!(game.join("version.dll").is_file());

        uninstall(&game, &info).unwrap();
        assert!(!game.join("version.dll").exists());
        // Remove twice: a missing file is not an error.
        uninstall(&game, &info).unwrap();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_foreign_dll_is_left_alone() {
        let root = scratch("foreign");
        let data = data_dir(&root, "v9.9.9");
        let game = root.join("game");
        fs::create_dir_all(&game).unwrap();
        let other = b"a different proxy DLL, small on purpose".to_vec();
        fs::write(game.join("d3d11.dll"), &other).unwrap();

        let error = install(&data, &game, "d3d11.dll").unwrap_err();
        assert!(error.contains("d3d11.dll"), "message names the file: {error}");
        assert_eq!(fs::read(game.join("d3d11.dll")).unwrap(), other);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn bink_keeps_the_original_and_gives_it_back() {
        let root = scratch("bink");
        let data = data_dir(&root, "v9.9.9");
        let game = root.join("game");
        fs::create_dir_all(&game).unwrap();
        let original = b"the game's own bink DLL";
        fs::write(game.join("binkw64.dll"), original).unwrap();

        let info = install(&data, &game, "binkw64.dll").unwrap();
        assert_eq!(info.bink_backup.as_deref(), Some("binkw64Hooked.dll"));
        assert_eq!(fs::read(game.join("binkw64Hooked.dll")).unwrap(), original);
        assert_eq!(fs::read(game.join("binkw64.dll")).unwrap(), FAKE_DLL);

        uninstall(&game, &info).unwrap();
        assert!(!game.join("binkw64Hooked.dll").exists());
        assert_eq!(fs::read(game.join("binkw64.dll")).unwrap(), original);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_same_name_can_be_used_again_for_the_same_build() {
        let root = scratch("again");
        let data = data_dir(&root, "v9.9.9");
        let game = root.join("game");
        fs::create_dir_all(&game).unwrap();

        install(&data, &game, "dxgi.dll").unwrap();
        let info = install(&data, &game, "dxgi.dll").unwrap();
        assert_eq!(info.sha256, release::sha256_file(&game.join("dxgi.dll")).unwrap());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_name_outside_the_folder_is_refused() {
        let root = scratch("name");
        let data = data_dir(&root, "v9.9.9");
        let game = root.join("game");
        fs::create_dir_all(&game).unwrap();

        assert!(install(&data, &game, "../evil.dll").is_err());
        assert!(install(&data, &game, "version.txt").is_err());
        assert!(!root.join("evil.dll").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn markers_are_found_in_both_encodings() {
        let root = scratch("marker");
        let narrow = root.join("narrow.dll");
        fs::write(&narrow, FAKE_DLL).unwrap();
        assert!(is_mod_image(&narrow));

        let wide = root.join("wide.dll");
        let mut bytes = vec![0u8; 32];
        bytes.extend("RTXMFG".encode_utf16().flat_map(u16::to_le_bytes));
        fs::write(&wide, bytes).unwrap();
        assert!(is_mod_image(&wide));

        let other = root.join("other.dll");
        fs::write(&other, b"MZ nothing to see here").unwrap();
        assert!(!is_mod_image(&other));
        let _ = fs::remove_dir_all(&root);
    }

    fn publish_release(data: &Path, tag: &str, body: &[u8]) {
        let release_dir = data.join("release");
        let folder = release_dir.join(tag);
        fs::create_dir_all(&folder).unwrap();
        let dll = folder.join(MOD_DLL_NAME);
        fs::write(&dll, body).unwrap();
        fs::write(
            folder.join("meta.json"),
            format!(
                "{{\"tag\":\"{tag}\",\"dllSha256\":\"{}\",\"zipSha256\":\"{}\",\"extractedAt\":2000}}",
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

    #[test]
    fn undo_puts_the_replaced_build_back() {
        let root = scratch("undo");
        let data = data_dir(&root, "v1.0.0");
        let game = root.join("game");
        fs::create_dir_all(&game).unwrap();

        let first = install(&data, &game, "winmm.dll").unwrap();
        assert!(first.previous.is_none());
        assert_eq!(fs::read(game.join("winmm.dll")).unwrap(), FAKE_DLL);

        // A newer release replaces the build in the cache, so the next install is an update.
        let newer = b"MZ second build, RTXMFG markers included\n";
        publish_release(&data, "v2.0.0", newer);

        let second = install(&data, &game, "winmm.dll").unwrap();
        assert_eq!(second.version.as_deref(), Some("v2.0.0"));
        let previous = second.previous.clone().expect("the replaced build is kept");
        assert!(Path::new(&previous.path).is_file());
        assert_eq!(fs::read(game.join("winmm.dll")).unwrap(), newer);

        uninstall(&game, &second).unwrap();
        assert_eq!(fs::read(game.join("winmm.dll")).unwrap(), FAKE_DLL);
        assert!(!Path::new(&previous.path).exists());
        let _ = fs::remove_dir_all(&root);
    }
}
