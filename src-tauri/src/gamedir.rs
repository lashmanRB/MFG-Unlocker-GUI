use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
pub struct FoundExe {
    pub path: std::path::PathBuf,
    pub name: String,
    pub size: u64,
}

const MAX_DEPTH: usize = 4;
const MAX_DIRS: usize = 4000;
const MIN_EXE_BYTES: u64 = 512 * 1024;

const NOISE_DIRS: &[&str] = &[
    "content",
    "movies",
    "audio",
    "sound",
    "music",
    "videos",
    "redist",
    "redistributables",
    "_commonredist",
    "easyanticheat",
    "battleye",
    "support",
    "tools",
    "docs",
    "manual",
    "locales",
    "assets",
];

const NOISE_EXES: &[&str] = &[
    "crashhandler",
    "crashreport",
    "unins",
    "setup",
    "redist",
    "vcredist",
    "dxsetup",
    "dxwebsetup",
    "oalinst",
    "easyanticheat",
    "battleye",
    "unitycrashhandler",
];

pub fn find_executables(dir: &Path, limit: usize) -> Vec<FoundExe> {
    let mut found = Vec::new();
    let mut pending: Vec<(PathBuf, usize)> = vec![(dir.to_path_buf(), 0)];
    let mut visited = 0usize;

    while let Some((current, depth)) = pending.pop() {
        if visited >= MAX_DIRS {
            break;
        }
        visited += 1;

        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if file_type.is_dir() {
                if depth < MAX_DEPTH && !is_noise_dir(&name) {
                    pending.push((entry.path(), depth + 1));
                }
                continue;
            }

            if !is_game_exe(&name) {
                continue;
            }
            let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            if size < MIN_EXE_BYTES {
                continue;
            }
            found.push(FoundExe {
                path: entry.path(),
                name,
                size,
            });
        }
    }

    found.sort_by(|a, b| b.size.cmp(&a.size));
    found.truncate(limit);
    found
}

fn is_noise_dir(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    NOISE_DIRS.contains(&lower.as_str())
}

fn is_game_exe(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if !lower.ends_with(".exe") {
        return false;
    }
    !NOISE_EXES.iter().any(|noise| lower.contains(noise))
}

pub fn pick_default_exe(
    candidates: &[FoundExe],
    game_name: &str,
    dir_name: &str,
) -> Option<FoundExe> {
    let game = normalize_name(game_name);
    let folder = normalize_name(dir_name);

    let mut best: Option<(i64, &FoundExe)> = None;
    for candidate in candidates {
        let score = exe_score(candidate, &game, &folder);
        if best.map_or(true, |(best_score, _)| score > best_score) {
            best = Some((score, candidate));
        }
    }

    best.map(|(_, candidate)| candidate.clone())
}

fn exe_score(candidate: &FoundExe, game: &str, folder: &str) -> i64 {
    let name = candidate.name.to_ascii_lowercase();
    let stem = name.strip_suffix(".exe").unwrap_or(&name);
    let normalized = normalize_name(stem);

    let mut score = 0;
    if !folder.is_empty() && normalized == folder {
        score += 1000;
    }
    if !game.is_empty() && normalized == game {
        score += 900;
    }
    if name.contains("shipping") {
        score += 250;
    }
    if name.contains("win64") {
        score += 120;
    }
    if name.contains("launcher") {
        score -= 500;
    }

    // size only settles ties between similarly named binaries
    let mib = candidate.size / (1024 * 1024);
    score + mib.min(60) as i64
}

fn normalize_name(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

#[derive(Clone, Debug, Default)]
pub struct DllProbe {
    pub frame_gen: bool,
    pub streamline: bool,
    pub super_res: bool,
    pub vulkan: bool,
    pub optiscaler: bool,
}

impl DllProbe {
    fn complete(&self) -> bool {
        self.frame_gen && self.streamline && self.super_res && self.vulkan && self.optiscaler
    }
}

pub fn probe_dlls(exe_dir: &Path) -> DllProbe {
    let mut probe = DllProbe::default();
    let mut current = Some(exe_dir);

    // games often ship from bin\x64, so the DLLs can sit up to two levels up
    for _ in 0..3 {
        let Some(dir) = current else { break };
        scan_dlls(dir, &mut probe);
        scan_plugin_dlls(dir, &mut probe);
        if probe.complete() {
            break;
        }
        current = dir.parent();
    }

    probe
}

// Unreal games tuck DLSS and Streamline into Plugins\<name>\Binaries\ThirdParty\
// Win64 instead of beside the executable, like Deliver Us Mars and The Last
// Caretaker do.
fn scan_plugin_dlls(dir: &Path, probe: &mut DllProbe) {
    let Ok(plugins) = fs::read_dir(dir.join("Plugins")) else {
        return;
    };
    for plugin in plugins.flatten() {
        if !plugin.path().is_dir() {
            continue;
        }
        let third_party = plugin.path().join("Binaries").join("ThirdParty").join("Win64");
        scan_dlls(&third_party, probe);
    }
}

fn scan_dlls(dir: &Path, probe: &mut DllProbe) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        match name.as_str() {
            "nvngx_dlssg.dll" | "sl.dlss_g.dll" => probe.frame_gen = true,
            "sl.interposer.dll" | "sl.common.dll" => probe.streamline = true,
            "nvngx_dlss.dll" => probe.super_res = true,
            "vulkan-1.dll" => probe.vulkan = true,
            "optiscaler.ini" | "optiscaler.dll" => probe.optiscaler = true,
            "optiscaler" if is_dir => probe.optiscaler = true,
            _ => {}
        }
    }
}

pub fn check_folder_writable(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let probe = dir.join(format!(
        "mfg-write-probe-{}-{}.tmp",
        std::process::id(),
        stamp
    ));

    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exe(name: &str, size: u64) -> FoundExe {
        FoundExe {
            path: Path::new(r"C:\Games\Some Game").join(name),
            name: name.to_string(),
            size,
        }
    }

    #[test]
    fn finds_the_unreal_plugins_tree() {
        let root = std::env::temp_dir().join(format!("mfg-probe-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let exe_dir = root.join("Project").join("Binaries").join("Win64");
        let streamline = root
            .join("Project")
            .join("Plugins")
            .join("Streamline")
            .join("Binaries")
            .join("ThirdParty")
            .join("Win64");
        let dlss = root
            .join("Project")
            .join("Plugins")
            .join("DLSS")
            .join("Binaries")
            .join("ThirdParty")
            .join("Win64");
        fs::create_dir_all(&exe_dir).unwrap();
        fs::create_dir_all(&streamline).unwrap();
        fs::create_dir_all(&dlss).unwrap();
        fs::write(streamline.join("sl.dlss_g.dll"), b"x").unwrap();
        fs::write(streamline.join("sl.interposer.dll"), b"x").unwrap();
        fs::write(dlss.join("nvngx_dlss.dll"), b"x").unwrap();

        let probe = probe_dlls(&exe_dir);
        assert!(probe.frame_gen);
        assert!(probe.streamline);
        assert!(probe.super_res);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn filters_non_game_executables() {
        assert!(is_game_exe("Game.exe"));
        assert!(is_game_exe("Game-Win64-Shipping.exe"));
        assert!(is_game_exe("launcher.exe"));
        assert!(!is_game_exe("UnityCrashHandler64.exe"));
        assert!(!is_game_exe("unins000.exe"));
        assert!(!is_game_exe("vc_redist.x64.exe"));
        assert!(!is_game_exe("DXSETUP.exe"));
        assert!(!is_game_exe("EasyAntiCheat.exe"));
        assert!(!is_game_exe("steam_api64.dll"));
    }

    #[test]
    fn picks_game_exe_over_huge_launcher() {
        let candidates = vec![
            exe("Launcher.exe", 900 * 1024 * 1024),
            exe("Cyberpunk2077.exe", 42 * 1024 * 1024),
        ];
        let picked = pick_default_exe(&candidates, "Cyberpunk 2077", "Cyberpunk 2077")
            .expect("a candidate should win");
        assert_eq!(picked.name, "Cyberpunk2077.exe");
    }

    #[test]
    fn picks_unreal_shipping_binary() {
        let candidates = vec![
            exe("Launcher.exe", 4 * 1024 * 1024),
            exe("MyGame-Win64-Shipping.exe", 120 * 1024 * 1024),
        ];
        let picked =
            pick_default_exe(&candidates, "My Game", "MyGame").expect("a candidate should win");
        assert_eq!(picked.name, "MyGame-Win64-Shipping.exe");
    }

    #[test]
    fn launcher_still_wins_when_nothing_else_is_left() {
        let candidates = vec![exe("launcher.exe", 3 * 1024 * 1024)];
        let picked = pick_default_exe(&candidates, "Some Game", "SomeGame")
            .expect("a lone candidate should be picked");
        assert_eq!(picked.name, "launcher.exe");
    }

    #[test]
    fn no_candidates_pick_nothing() {
        assert!(pick_default_exe(&[], "Anything", "Anything").is_none());
    }
}
