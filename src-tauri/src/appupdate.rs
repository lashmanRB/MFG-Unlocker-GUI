use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

const LATEST_URL: &str = "https://api.github.com/repos/lashmanRB/MFG-Unlocker-GUI/releases/latest";
const STAGE_DIR: &str = "update";
const OLD_SUFFIX: &str = "exe.old";
const NOTES_LIMIT: usize = 2000;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdate {
    pub available: bool,
    pub current: String,
    pub latest: String,
    pub tag: String,
    pub name: String,
    pub notes: String,
    pub published_at: String,
    pub asset_name: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub download_url: String,
    pub page_url: String,
}

pub fn check() -> Result<AppUpdate, String> {
    let body = fetch_latest()?;
    let text = |key: &str| {
        body.get(key)
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string()
    };

    let tag = text("tag_name");
    if tag.is_empty() {
        return Err("GitHub sent a release without a tag".to_string());
    }
    let latest = tag.trim_start_matches(['v', 'V']).to_string();
    let current = env!("CARGO_PKG_VERSION").to_string();

    let asset = body
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .and_then(|assets| {
            assets.iter().find(|asset| {
                asset
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .map(|name| name.to_ascii_lowercase().ends_with(".exe"))
                    .unwrap_or(false)
            })
        })
        .ok_or_else(|| "the newest release has no exe download".to_string())?;

    let asset_name = asset
        .get("name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    let download_url = asset
        .get("browser_download_url")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    if download_url.is_empty() {
        return Err(format!("the release asset {asset_name} has no download link"));
    }

    let notes = text("body");
    let notes = if notes.chars().count() > NOTES_LIMIT {
        notes.chars().take(NOTES_LIMIT).collect()
    } else {
        notes
    };

    Ok(AppUpdate {
        available: is_newer(&latest, &current),
        current,
        latest,
        tag,
        name: text("name"),
        notes,
        published_at: text("published_at"),
        asset_name,
        size_bytes: asset
            .get("size")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0),
        sha256: asset
            .get("digest")
            .and_then(serde_json::Value::as_str)
            .and_then(|digest| digest.strip_prefix("sha256:"))
            .map(|digest| digest.to_ascii_lowercase()),
        download_url,
        page_url: text("html_url"),
    })
}

// Downloads the new exe next to the app, moves the running one aside and puts
// the download in its place. The caller spawns the new file and exits; Windows
// allows renaming a running exe, just not overwriting or deleting it.
pub fn prepare(data_dir: &Path, update: &AppUpdate, exe: &Path) -> Result<PathBuf, String> {
    let name = update
        .asset_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("app.exe");
    let stage_dir = data_dir.join(STAGE_DIR);
    fs::create_dir_all(&stage_dir)
        .map_err(|error| format!("cannot create {}: {error}", stage_dir.display()))?;
    let staged = stage_dir.join(name);

    fetch_exe(update, &staged)?;
    if let Some(expected) = &update.sha256 {
        let actual = sha256_file(&staged)?;
        if !expected.eq_ignore_ascii_case(&actual) {
            let _ = fs::remove_file(&staged);
            return Err("the download does not match the published SHA-256, so it was thrown away"
                .to_string());
        }
    }

    let old = exe.with_extension(OLD_SUFFIX);
    let _ = fs::remove_file(&old);
    fs::rename(exe, &old)
        .map_err(|error| format!("cannot move the running app aside, is the folder writable? {error}"))?;
    if let Err(error) = fs::rename(&staged, exe) {
        let _ = fs::rename(&old, exe);
        return Err(format!("cannot put the new version in place: {error}"));
    }
    Ok(exe.to_path_buf())
}

// The new instance has to start after this process is gone: two of them at once
// would fight over the WebView2 folder. A short lived hidden PowerShell waits for
// this pid and then starts the file that is now in place.
pub fn relaunch(exe: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let pid = std::process::id();
    let quoted = exe.display().to_string().replace('\'', "''");
    let script = format!(
        "Wait-Process -Id {pid} -Timeout 30 -ErrorAction SilentlyContinue; Start-Process -FilePath '{quoted}'"
    );
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("the new version is in place but the restart failed: {error}"))?;
    Ok(())
}

// A leftover from the update that started this process. Deleting it is best
// effort: the old process may still hold it for a moment.
pub fn cleanup_old() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let old = exe.with_extension(OLD_SUFFIX);
    if old.is_file() {
        let _ = fs::remove_file(&old);
    }
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (version_key(latest), version_key(current)) {
        (Some(latest), Some(current)) => latest > current,
        // An unreadable tag is worth offering: the user can always decline.
        _ => !latest.trim().is_empty() && latest.trim() != current.trim(),
    }
}

fn version_key(text: &str) -> Option<(u64, u64, u64)> {
    let trimmed = text.trim().trim_start_matches(['v', 'V']);
    let core = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    Some((major, minor, patch))
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(format!("mfg-unlocker-gui/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("could not start the download: {error}"))
}

fn fetch_latest() -> Result<serde_json::Value, String> {
    let response = client()?
        .get(LATEST_URL)
        .send()
        .map_err(|error| format!("could not reach GitHub: {error}"))?;
    if !response.status().is_success() {
        let code = response.status().as_u16();
        return Err(match code {
            403 | 429 => "GitHub is rate limiting the app right now, try again later.".to_string(),
            404 => "the app has no published releases yet".to_string(),
            _ => format!("GitHub answered {code} for the latest release"),
        });
    }
    response
        .json()
        .map_err(|error| format!("could not read GitHub's answer: {error}"))
}

fn fetch_exe(update: &AppUpdate, path: &Path) -> Result<(), String> {
    let mut response = client()?
        .get(&update.download_url)
        .send()
        .map_err(|error| format!("could not download {}: {error}", update.asset_name))?;
    if !response.status().is_success() {
        return Err(format!(
            "downloading {} failed with {}",
            update.asset_name,
            response.status().as_u16()
        ));
    }

    let mut file =
        File::create(path).map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("the download of {} stopped early: {error}", update.asset_name))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    }
    file.flush()
        .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_higher_tag_is_newer() {
        assert!(is_newer("1.0.5", "1.0.4"));
        assert!(is_newer("v1.1.0", "1.0.4"));
        assert!(is_newer("v2.0.0", "1.9.9"));
        assert!(!is_newer("v1.0.4", "1.0.4"));
        assert!(!is_newer("v1.0.3", "1.0.4"));
    }

    // Talks to GitHub, so it stays out of the normal run: cargo test -- --ignored
    #[test]
    #[ignore]
    fn the_live_release_answers() {
        let update = check().expect("GitHub should answer with the latest release");
        assert!(!update.latest.is_empty());
        assert!(update.download_url.to_ascii_lowercase().ends_with(".exe"));
        assert!(!update.tag.is_empty());
    }

    #[test]
    fn tag_shapes_parse_the_same() {
        assert_eq!(version_key("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(version_key("1.2"), Some((1, 2, 0)));
        assert_eq!(version_key("1"), Some((1, 0, 0)));
        assert_eq!(version_key("v1.2.3-beta.1"), Some((1, 2, 3)));
        assert_eq!(version_key("nightly"), None);
    }

    #[test]
    fn prepare_swaps_the_exe_and_keeps_a_copy() {
        let dir = scratch("swap");
        let exe = dir.join("app.exe");
        fs::write(&exe, b"old build").unwrap();
        let payload = b"new build".to_vec();
        let url = serve_once(&payload);
        let update = update_for(&url, Some(sha256_bytes(&payload)));

        let placed = prepare(&dir.join("data"), &update, &exe).expect("the update lands");

        assert_eq!(placed, exe);
        assert_eq!(fs::read(&exe).unwrap(), payload);
        assert_eq!(fs::read(exe.with_extension(OLD_SUFFIX)).unwrap(), b"old build");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_wrong_hash_leaves_the_running_app_alone() {
        let dir = scratch("hash");
        let exe = dir.join("app.exe");
        fs::write(&exe, b"old build").unwrap();
        let url = serve_once(b"new build");
        let update = update_for(&url, Some("0".repeat(64)));

        let error = prepare(&dir.join("data"), &update, &exe).expect_err("the hash is checked");

        assert!(error.contains("SHA-256"), "{error}");
        assert_eq!(fs::read(&exe).unwrap(), b"old build");
        assert!(!exe.with_extension(OLD_SUFFIX).exists());
        assert!(!dir.join("data").join(STAGE_DIR).join("app.exe").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mfg-appupdate-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn update_for(url: &str, sha256: Option<String>) -> AppUpdate {
        AppUpdate {
            available: true,
            current: "1.0.4".to_string(),
            latest: "9.9.9".to_string(),
            tag: "v9.9.9".to_string(),
            name: "test".to_string(),
            notes: String::new(),
            published_at: String::new(),
            asset_name: "app.exe".to_string(),
            size_bytes: 0,
            sha256,
            download_url: url.to_string(),
            page_url: String::new(),
        }
    }

    fn sha256_bytes(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    // One request, one answer, then the listener goes away with the thread.
    fn serve_once(payload: &[u8]) -> String {
        use std::io::{Read as _, Write as _};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").expect("a free test port");
        let port = listener.local_addr().unwrap().port();
        let body = payload.to_vec();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut head = [0u8; 2048];
                let _ = stream.read(&mut head);
                let mut answer = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .into_bytes();
                answer.extend_from_slice(&body);
                let _ = stream.write_all(&answer);
            }
        });
        format!("http://127.0.0.1:{port}/app.exe")
    }
}