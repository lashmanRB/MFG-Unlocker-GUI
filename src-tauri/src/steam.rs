use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};

use winreg::enums::{KEY_READ, KEY_WOW64_32KEY};
use winreg::{RegKey, HKCU, HKLM};

#[derive(Clone, Debug)]
pub struct SteamApp {
    pub app_id: u32,
    pub name: String,
    pub install_dir: PathBuf,
    pub size_on_disk: u64,
}

const REDIST_APP_ID: u32 = 228980;
const DEFAULT_STEAM: &str = r"C:\Program Files (x86)\Steam";

pub fn find_steam() -> Result<PathBuf, String> {
    let candidates = [
        (&HKCU, r"Software\Valve\Steam", "SteamPath", KEY_READ),
        (
            &HKLM,
            r"SOFTWARE\WOW6432Node\Valve\Steam",
            "InstallPath",
            KEY_READ,
        ),
        (&HKLM, r"SOFTWARE\Valve\Steam", "InstallPath", KEY_READ),
        (
            &HKLM,
            r"SOFTWARE\Valve\Steam",
            "InstallPath",
            KEY_READ | KEY_WOW64_32KEY,
        ),
    ];

    for (root, subkey, value, flags) in candidates {
        if let Some(path) = reg_path(root, subkey, value, flags) {
            if path.is_dir() {
                return Ok(path);
            }
        }
    }

    let fallback = default_steam_path();
    if fallback.is_dir() {
        return Ok(fallback);
    }

    Err("Steam install not found on this PC".to_string())
}

fn reg_path(root: &RegKey, subkey: &str, value: &str, flags: u32) -> Option<PathBuf> {
    let key = root.open_subkey_with_flags(subkey, flags).ok()?;
    let raw: String = key.get_value(value).ok()?;
    let cleaned = raw.trim().trim_matches('"').replace('/', "\\");
    if cleaned.is_empty() {
        None
    } else {
        Some(PathBuf::from(cleaned))
    }
}

fn default_steam_path() -> PathBuf {
    match env::var("ProgramFiles(x86)") {
        Ok(dir) if !dir.trim().is_empty() => PathBuf::from(dir).join("Steam"),
        _ => PathBuf::from(DEFAULT_STEAM),
    }
}

pub fn libraries(steam: &Path) -> Result<Vec<PathBuf>, String> {
    if !steam.is_dir() {
        return Err(format!("Steam folder not found: {}", steam.display()));
    }

    let mut found = Vec::new();
    add_library(&mut found, steam.to_path_buf());

    let vdf = steam.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = fs::read_to_string(&vdf) {
        for path in parse_library_folders(&text) {
            add_library(&mut found, path);
        }
    }

    Ok(found)
}

fn add_library(found: &mut Vec<PathBuf>, path: PathBuf) {
    if !path.is_dir() || found.iter().any(|known| same_path(known, &path)) {
        return;
    }
    found.push(path);
}

fn same_path(a: &Path, b: &Path) -> bool {
    path_key(a) == path_key(b)
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn parse_library_folders(text: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut key: Option<String> = None;

    for token in tokenize(text) {
        match token {
            Tok::Open => stack.push(key.take().unwrap_or_default()),
            Tok::Close => {
                stack.pop();
                key = None;
            }
            Tok::Str(value) => {
                let Some(name) = key.take() else {
                    key = Some(value);
                    continue;
                };
                // modern files nest a "path" under each numbered library block,
                // the old ones just put the path straight on the number
                let numbered = stack.len() == 1
                    && !name.is_empty()
                    && name.bytes().all(|b| b.is_ascii_digit());
                if name.eq_ignore_ascii_case("path") || numbered {
                    paths.push(PathBuf::from(value.replace('/', "\\")));
                }
            }
        }
    }

    paths
}

struct Manifest {
    app_id: u32,
    name: String,
    install_dir: String,
    size_on_disk: u64,
    state_flags: u32,
}

fn parse_manifest(text: &str) -> Option<Manifest> {
    let pairs = vdf_pairs(text);
    let pick = |wanted: &str| {
        pairs
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(wanted))
            .map(|(_, value)| value.trim().to_string())
    };

    let app_id = pick("appid")?.parse::<u32>().ok()?;
    let name = pick("name")?;
    let install_dir = pick("installdir")?;
    if name.is_empty() || install_dir.is_empty() {
        return None;
    }

    Some(Manifest {
        app_id,
        name,
        install_dir,
        size_on_disk: pick("SizeOnDisk").and_then(|v| v.parse().ok()).unwrap_or(0),
        state_flags: pick("StateFlags").and_then(|v| v.parse().ok()).unwrap_or(0),
    })
}

pub fn installed_apps(libraries: &[PathBuf]) -> Vec<SteamApp> {
    let mut apps = Vec::new();

    for library in libraries {
        let steamapps = library.join("steamapps");
        let entries = match fs::read_dir(&steamapps) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if !file.starts_with("appmanifest_") || !file.ends_with(".acf") {
                continue;
            }
            let text = match fs::read_to_string(entry.path()) {
                Ok(text) => text,
                Err(_) => continue,
            };
            let Some(manifest) = parse_manifest(&text) else {
                continue;
            };
            // bit 2 (value 4) means the app is fully installed, not still updating
            if manifest.state_flags & 4 == 0 || manifest.app_id == REDIST_APP_ID {
                continue;
            }
            let install_dir = steamapps.join("common").join(&manifest.install_dir);
            if !install_dir.is_dir() {
                continue;
            }
            apps.push(SteamApp {
                app_id: manifest.app_id,
                name: manifest.name,
                install_dir,
                size_on_disk: manifest.size_on_disk,
            });
        }
    }

    apps
}

pub fn library_label(path: &Path) -> String {
    if same_path(path, &default_steam_path()) || same_path(path, Path::new(DEFAULT_STEAM)) {
        return "Steam".to_string();
    }

    let folder = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string());
    let drive = match path.components().next() {
        Some(Component::Prefix(prefix)) => Some(prefix.as_os_str().to_string_lossy().to_string()),
        _ => None,
    };

    match (drive, folder) {
        (Some(drive), Some(folder)) => format!("{}\\{}", drive, folder),
        (_, Some(folder)) => folder,
        (Some(drive), None) => drive,
        (None, None) => path
            .to_string_lossy()
            .trim_end_matches(|c| c == '\\' || c == '/')
            .to_string(),
    }
}

enum Tok {
    Open,
    Close,
    Str(String),
}

fn tokenize(text: &str) -> Vec<Tok> {
    let bytes = text.as_bytes();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < bytes.len() {
        match bytes[i] {
            b'{' => {
                tokens.push(Tok::Open);
                i += 1;
            }
            b'}' => {
                tokens.push(Tok::Close);
                i += 1;
            }
            b'"' => {
                let start = i + 1;
                let mut end = start;
                while end < bytes.len() && bytes[end] != b'"' {
                    if bytes[end] == b'\\' {
                        end += 2;
                    } else {
                        end += 1;
                    }
                }
                let end = end.min(bytes.len());
                tokens.push(Tok::Str(unescape(&text[start..end])));
                i = end + 1;
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'/' => {
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            c if c.is_ascii_whitespace() => i += 1,
            _ => {
                let start = i;
                while i < bytes.len()
                    && !bytes[i].is_ascii_whitespace()
                    && bytes[i] != b'{'
                    && bytes[i] != b'}'
                    && bytes[i] != b'"'
                {
                    i += 1;
                }
                tokens.push(Tok::Str(text[start..i].to_string()));
            }
        }
    }

    tokens
}

fn unescape(raw: &str) -> String {
    if !raw.contains('\\') {
        return raw.to_string();
    }

    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some(escaped @ ('\\' | '"')) => out.push(escaped),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

fn vdf_pairs(text: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let mut key: Option<String> = None;

    for token in tokenize(text) {
        match token {
            Tok::Open | Tok::Close => key = None,
            Tok::Str(value) => match key.take() {
                Some(name) => pairs.push((name, value)),
                None => key = Some(value),
            },
        }
    }

    pairs
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIBRARY_FOLDERS_MODERN: &str = r#"
"libraryfolders"
{
	"contentstatsid"		"-3171234567890123456"
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"contentid"		"1167232175619383210"
		"totalsize"		"0"
		"update_clean_bytes_tally"		"5318434231"
		"time_last_update_corrupts"		"0"
		"apps"
		{
			"1091500"		"77423581542"
			"228980"		"780473672"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"label"		""
		"contentid"		"3339445618112055678"
		"totalsize"		"2000398934016"
		"apps"
		{
			"292030"		"43980465111"
		}
	}
}
"#;

    const LIBRARY_FOLDERS_OLD: &str = r#"
"LibraryFolders"
{
	"TimeNextStatsReport"		"1600602095"
	"ContentStatsID"		"-3171234567890123456"
	"1"		"D:\\SteamLibrary"
	"2"		"E:\\Games\\Steam"
}
"#;

    const APPMANIFEST_CYBERPUNK: &str = r#""AppState"
{
	"appid"		"1091500"
	"Universe"		"1"
	"name"		"Cyberpunk 2077"
	"StateFlags"		"4"
	"installdir"		"Cyberpunk 2077"
	"LastUpdated"		"1740681543"
	"LastPlayed"		"1741098621"
	"SizeOnDisk"		"78917631946"
	"StagingPath"		"D:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077\\"
	"buildid"		"18353108"
	"UpdateResult"		"0"
	"SharedDepots"
	{
		"228988"		"228980"
	}
	"UserConfig"
	{
		"language"		"english"
	}
	"MountedDepots"
	{
		"1091501"		"8791960085497821858"
	}
}
"#;

    #[test]
    fn reads_modern_library_folders() {
        let paths = parse_library_folders(LIBRARY_FOLDERS_MODERN);
        assert_eq!(
            paths,
            vec![
                PathBuf::from(r"C:\Program Files (x86)\Steam"),
                PathBuf::from(r"D:\SteamLibrary"),
            ]
        );
    }

    #[test]
    fn reads_old_library_folders() {
        let paths = parse_library_folders(LIBRARY_FOLDERS_OLD);
        assert_eq!(
            paths,
            vec![
                PathBuf::from(r"D:\SteamLibrary"),
                PathBuf::from(r"E:\Games\Steam"),
            ]
        );
    }

    #[test]
    fn reads_appmanifest() {
        let manifest = parse_manifest(APPMANIFEST_CYBERPUNK).expect("manifest should parse");
        assert_eq!(manifest.app_id, 1091500);
        assert_eq!(manifest.name, "Cyberpunk 2077");
        assert_eq!(manifest.install_dir, "Cyberpunk 2077");
        assert_eq!(manifest.size_on_disk, 78917631946);
        assert_eq!(manifest.state_flags & 4, 4);
    }

    #[test]
    fn labels_libraries() {
        assert_eq!(library_label(Path::new(DEFAULT_STEAM)), "Steam");
        assert_eq!(
            library_label(Path::new(r"D:\SteamLibrary")),
            r"D:\SteamLibrary"
        );
        assert_eq!(
            library_label(Path::new("D:\\SteamLibrary\\")),
            r"D:\SteamLibrary"
        );
    }
}
