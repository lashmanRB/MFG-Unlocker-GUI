use crate::model::{ReleaseInfo, MOD_DLL_NAME};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const LATEST_URL: &str = "https://api.github.com/repos/dashdogy/MFG-Unlocker/releases/latest";
const CACHE_FILE: &str = "latest.json";
const META_FILE: &str = "meta.json";
const CACHE_SECONDS: u64 = 6 * 60 * 60;

#[derive(Clone, Debug)]
pub struct CachedRelease {
    pub tag: String,
    pub dll_path: PathBuf,
    pub sha256: String,
}

// The subset of the release answer the app uses, kept apart from ReleaseInfo so
// it can go to the cache file without the fields that only make sense at runtime.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Latest {
    tag: String,
    name: String,
    published_at: String,
    asset_name: String,
    size_bytes: u64,
    sha256: Option<String>,
    download_url: String,
    page_url: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LatestCache {
    fetched_at: u64,
    #[serde(flatten)]
    latest: Latest,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    tag: String,
    dll_sha256: String,
    zip_sha256: String,
    extracted_at: u64,
}

pub fn latest_info(data_dir: &Path, refresh: bool) -> Result<ReleaseInfo, String> {
    let cache_path = release_root(data_dir).join(CACHE_FILE);
    let cached = read_cache(&cache_path);
    if !refresh {
        if let Some(cache) = &cached {
            if unix_now().saturating_sub(cache.fetched_at) < CACHE_SECONDS {
                return Ok(info_for(data_dir, &cache.latest));
            }
        }
    }

    match fetch_latest() {
        Ok(latest) => {
            let cache = LatestCache {
                fetched_at: unix_now(),
                latest,
            };
            if let Ok(text) = serde_json::to_string_pretty(&cache) {
                let _ = fs::create_dir_all(release_root(data_dir));
                let _ = fs::write(&cache_path, text);
            }
            Ok(info_for(data_dir, &cache.latest))
        }
        // Being offline must not hide the release the user already has.
        Err(error) => match cached {
            Some(cache) => Ok(info_for(data_dir, &cache.latest)),
            None => Err(error),
        },
    }
}

pub fn ensure_dll(data_dir: &Path, force: bool) -> Result<CachedRelease, String> {
    let latest = match latest_info(data_dir, false) {
        Ok(latest) => latest,
        Err(error) => {
            if force {
                return Err(error);
            }
            return cached_release(data_dir).ok_or(error);
        }
    };

    let folder = release_root(data_dir).join(folder_name(&latest.tag)?);
    if !force {
        if let Some(cached) = extracted(&folder, &latest.tag) {
            return Ok(cached);
        }
    }
    download(&latest, &folder)
}

pub fn cached_release(data_dir: &Path) -> Option<CachedRelease> {
    let entries = fs::read_dir(release_root(data_dir)).ok()?;
    let mut found: Vec<(u64, CachedRelease)> = Vec::new();
    for entry in entries.flatten() {
        let folder = entry.path();
        if !folder.is_dir() {
            continue;
        }
        let meta = read_meta(&folder);
        let tag = match &meta {
            Some(meta) if !meta.tag.is_empty() => meta.tag.clone(),
            _ => folder
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default(),
        };
        let Some(cached) = extracted(&folder, &tag) else {
            continue;
        };
        let stamp = match &meta {
            Some(meta) => meta.extracted_at,
            None => modified_at(&folder),
        };
        found.push((stamp, cached));
    }
    found.sort_by_key(|(stamp, _)| *stamp);
    found.pop().map(|(_, cached)| cached)
}

// install.rs hashes the copy it makes in the game folder, so the helper lives
// here next to the verification of the download.
pub(crate) fn sha256_file(path: &Path) -> Result<String, String> {
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
    Ok(hex(&hasher.finalize()[..]))
}

pub(crate) fn sha256_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex(&hasher.finalize()[..])
}

pub(crate) fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|delta| delta.as_secs())
        .unwrap_or(0)
}

fn release_root(data_dir: &Path) -> PathBuf {
    data_dir.join("release")
}

fn info_for(data_dir: &Path, latest: &Latest) -> ReleaseInfo {
    let cached = cached_release(data_dir);
    ReleaseInfo {
        tag: latest.tag.clone(),
        name: latest.name.clone(),
        published_at: latest.published_at.clone(),
        asset_name: latest.asset_name.clone(),
        size_bytes: latest.size_bytes,
        sha256: latest.sha256.clone(),
        download_url: latest.download_url.clone(),
        page_url: latest.page_url.clone(),
        cached_version: cached.as_ref().map(|cached| cached.tag.clone()),
        cached_dll_path: cached.map(|cached| cached.dll_path.to_string_lossy().to_string()),
    }
}

fn read_cache(path: &Path) -> Option<LatestCache> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn read_meta(folder: &Path) -> Option<Meta> {
    let text = fs::read_to_string(folder.join(META_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn extracted(folder: &Path, tag: &str) -> Option<CachedRelease> {
    let dll_path = folder.join(MOD_DLL_NAME);
    if !dll_path.is_file() {
        return None;
    }
    // A missing meta.json is not fatal: the hash is the only thing it is kept for.
    let sha256 = match read_meta(folder) {
        Some(meta) if meta.dll_sha256.len() == 64 => meta.dll_sha256,
        _ => sha256_file(&dll_path).ok()?,
    };
    Some(CachedRelease {
        tag: tag.to_string(),
        dll_path,
        sha256,
    })
}

fn folder_name(tag: &str) -> Result<String, String> {
    let bad = tag.is_empty() || tag.contains('/') || tag.contains('\\') || tag == "." || tag == "..";
    if bad {
        return Err(format!("the release tag {tag} cannot be used as a folder name"));
    }
    Ok(tag.to_string())
}

fn modified_at(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|delta| delta.as_secs())
        .unwrap_or(0)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(format!("mfg-unlocker-gui/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("could not start the download: {error}"))
}

fn fetch_latest() -> Result<Latest, String> {
    let response = client()?
        .get(LATEST_URL)
        .send()
        .map_err(|error| format!("could not reach GitHub: {error}"))?;
    if !response.status().is_success() {
        let code = response.status().as_u16();
        return Err(match code {
            403 | 429 => "GitHub is rate limiting the app right now, try again later.".to_string(),
            _ => format!("GitHub answered {code} for the latest release"),
        });
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|error| format!("could not read GitHub's answer: {error}"))?;

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

    let asset = body
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .and_then(|assets| {
            assets.iter().find(|asset| {
                asset
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .map(|name| name.to_ascii_lowercase().ends_with(".zip"))
                    .unwrap_or(false)
            })
        })
        .ok_or_else(|| "the latest release has no zip download".to_string())?;

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

    Ok(Latest {
        tag,
        name: text("name"),
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

fn download(latest: &ReleaseInfo, folder: &Path) -> Result<CachedRelease, String> {
    fs::create_dir_all(folder).map_err(|error| format!("cannot create {}: {error}", folder.display()))?;
    let zip_path = folder.join("MFGUnlocker.zip.part");
    let result = unpack(latest, folder, &zip_path);
    let _ = fs::remove_file(&zip_path);
    result
}

fn unpack(latest: &ReleaseInfo, folder: &Path, zip_path: &Path) -> Result<CachedRelease, String> {
    let zip_sha256 = fetch_zip(latest, zip_path)?;

    let archive_file = File::open(zip_path)
        .map_err(|error| format!("cannot open the downloaded zip: {error}"))?;
    let mut archive = zip::ZipArchive::new(archive_file)
        .map_err(|error| format!("the downloaded zip cannot be read: {error}"))?;

    let mut entry_index = None;
    for index in 0..archive.len() {
        let entry = match archive.by_index(index) {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry
            .name()
            .rsplit(|character| character == '/' || character == '\\')
            .next()
            .unwrap_or_default();
        if name.eq_ignore_ascii_case(MOD_DLL_NAME) {
            entry_index = Some(index);
            break;
        }
    }
    let Some(entry_index) = entry_index else {
        return Err(format!("the release zip has no {MOD_DLL_NAME} inside"));
    };

    // A .part file keeps a half written DLL out of the cache.
    let dll_path = folder.join(MOD_DLL_NAME);
    let part_path = folder.join(format!("{MOD_DLL_NAME}.part"));
    let mut part = File::create(&part_path)
        .map_err(|error| format!("cannot write {}: {error}", part_path.display()))?;
    {
        let mut entry = archive
            .by_index(entry_index)
            .map_err(|error| format!("cannot read {MOD_DLL_NAME} from the zip: {error}"))?;
        std::io::copy(&mut entry, &mut part)
            .map_err(|error| format!("cannot extract {MOD_DLL_NAME}: {error}"))?;
    }
    part.flush()
        .map_err(|error| format!("cannot write {}: {error}", part_path.display()))?;
    drop(part);

    let dll_sha256 = sha256_file(&part_path)?;
    if let Err(error) = fs::rename(&part_path, &dll_path) {
        let _ = fs::remove_file(&part_path);
        return Err(format!("cannot place {}: {error}", dll_path.display()));
    }

    let meta = Meta {
        tag: latest.tag.clone(),
        dll_sha256: dll_sha256.clone(),
        zip_sha256,
        extracted_at: unix_now(),
    };
    if let Ok(text) = serde_json::to_string_pretty(&meta) {
        let _ = fs::write(folder.join(META_FILE), text);
    }

    Ok(CachedRelease {
        tag: latest.tag.clone(),
        dll_path,
        sha256: dll_sha256,
    })
}

fn fetch_zip(latest: &ReleaseInfo, path: &Path) -> Result<String, String> {
    let mut response = client()?
        .get(&latest.download_url)
        .send()
        .map_err(|error| format!("could not download {}: {error}", latest.asset_name))?;
    if !response.status().is_success() {
        return Err(format!(
            "downloading {} failed with {}",
            latest.asset_name,
            response.status().as_u16()
        ));
    }

    let mut file =
        File::create(path).map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("the download of {} stopped early: {error}", latest.asset_name))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        file.write_all(&buffer[..read])
            .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    }
    file.flush()
        .map_err(|error| format!("cannot write {}: {error}", path.display()))?;

    let sha256 = hex(&hasher.finalize()[..]);
    if let Some(expected) = &latest.sha256 {
        if !expected.eq_ignore_ascii_case(&sha256) {
            return Err("the downloaded zip does not match the published SHA-256, so it was thrown away"
                .to_string());
        }
    }
    Ok(sha256)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!(
            "mfg-release-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn store_release(data_dir: &Path, tag: &str, dll: &[u8], stamp: u64) -> PathBuf {
        let folder = release_root(data_dir).join(tag);
        fs::create_dir_all(&folder).unwrap();
        let dll_path = folder.join(MOD_DLL_NAME);
        fs::write(&dll_path, dll).unwrap();
        let meta = Meta {
            tag: tag.to_string(),
            dll_sha256: sha256_file(&dll_path).unwrap(),
            zip_sha256: "0".repeat(64),
            extracted_at: stamp,
        };
        fs::write(folder.join(META_FILE), serde_json::to_string(&meta).unwrap()).unwrap();
        dll_path
    }

    #[test]
    fn no_release_on_disk_means_none() {
        let dir = scratch("empty");
        assert!(cached_release(&dir).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_newest_extracted_release_wins() {
        let dir = scratch("newest");
        store_release(&dir, "v1.0.0", b"old build", 1000);
        let newest = store_release(&dir, "v1.1.0", b"new build", 2000);

        let cached = cached_release(&dir).expect("a cached release");
        assert_eq!(cached.tag, "v1.1.0");
        assert_eq!(cached.dll_path, newest);
        assert_eq!(cached.sha256.len(), 64);
        assert_eq!(cached.sha256, sha256_file(&newest).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_release_without_meta_still_reads() {
        let dir = scratch("nometa");
        let folder = release_root(&dir).join("v1.2.0");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join(MOD_DLL_NAME), b"build").unwrap();

        let cached = cached_release(&dir).expect("a cached release");
        assert_eq!(cached.tag, "v1.2.0");
        assert_eq!(cached.sha256, sha256_file(&folder.join(MOD_DLL_NAME)).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_fresh_cache_answers_latest_info() {
        let dir = scratch("cache");
        let dll_path = store_release(&dir, "v9.9.9", b"cached build", 5000);
        let cache = LatestCache {
            fetched_at: unix_now(),
            latest: Latest {
                tag: "v9.9.9".to_string(),
                name: "Test release".to_string(),
                published_at: "2026-01-01T00:00:00Z".to_string(),
                asset_name: "MFGUnlocker-v9.9.9.zip".to_string(),
                size_bytes: 1234,
                sha256: Some("a".repeat(64)),
                download_url: "https://example.invalid/MFGUnlocker-v9.9.9.zip".to_string(),
                page_url: "https://example.invalid/releases/v9.9.9".to_string(),
            },
        };
        fs::write(
            release_root(&dir).join(CACHE_FILE),
            serde_json::to_string(&cache).unwrap(),
        )
        .unwrap();

        let info = latest_info(&dir, false).expect("the cache answers");
        assert_eq!(info.tag, "v9.9.9");
        assert_eq!(info.asset_name, "MFGUnlocker-v9.9.9.zip");
        assert_eq!(info.sha256, Some("a".repeat(64)));
        assert_eq!(info.cached_version, Some("v9.9.9".to_string()));
        assert_eq!(info.cached_dll_path, Some(dll_path.to_string_lossy().to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ensure_dll_uses_what_is_already_extracted() {
        let dir = scratch("ensure");
        store_release(&dir, "v9.9.9", b"cached build", 5000);
        let cache = LatestCache {
            fetched_at: unix_now(),
            latest: Latest {
                tag: "v9.9.9".to_string(),
                name: "Test release".to_string(),
                published_at: "2026-01-01T00:00:00Z".to_string(),
                asset_name: "MFGUnlocker-v9.9.9.zip".to_string(),
                size_bytes: 1234,
                sha256: None,
                download_url: String::new(),
                page_url: String::new(),
            },
        };
        fs::write(
            release_root(&dir).join(CACHE_FILE),
            serde_json::to_string(&cache).unwrap(),
        )
        .unwrap();

        let cached = ensure_dll(&dir, false).expect("the extracted release answers");
        assert_eq!(cached.tag, "v9.9.9");
        assert!(cached.dll_path.is_file());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_tag_cannot_escape_the_release_folder() {
        assert!(folder_name("v1.6.1").is_ok());
        assert!(folder_name("..").is_err());
        assert!(folder_name("a/b").is_err());
        assert!(folder_name("").is_err());
    }

    #[test]
    fn hex_is_lowercase_and_padded() {
        assert_eq!(hex(&[0x00, 0x0f, 0xff]), "000fff");
    }
}
