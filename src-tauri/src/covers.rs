use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

const ENDPOINT: &str = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const ASSET_ROOT: &str = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/";
const CACHE_FILE: &str = "steam-covers.json";
const TTL_SECONDS: u64 = 30 * 24 * 60 * 60;
const BATCH: usize = 100;

// Older titles serve their 460x215 header from steam/apps/<id>/header.jpg, but new
// and unreleased ones keep it under a hash directory that only the store API knows,
// so the plain path 404s. Resolve it once per app id and cache it.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    #[serde(default)]
    pub fetched_at: u64,
    #[serde(default)]
    pub covers: BTreeMap<u32, String>,
}

impl Catalog {
    pub fn url_for(&self, app_id: u32) -> Option<&String> {
        self.covers.get(&app_id)
    }
}

fn cache_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CACHE_FILE)
}

pub fn load(data_dir: &Path) -> Catalog {
    std::fs::read_to_string(cache_path(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(data_dir: &Path, catalog: &Catalog) {
    if let Ok(text) = serde_json::to_string_pretty(catalog) {
        let _ = std::fs::write(cache_path(data_dir), text);
    }
}

fn stale(catalog: &Catalog, now: u64) -> bool {
    catalog.fetched_at == 0 || now.saturating_sub(catalog.fetched_at) > TTL_SECONDS
}

pub fn ensure(data_dir: &Path, app_ids: &[u32], allow_network: bool, force: bool) -> Catalog {
    let mut catalog = load(data_dir);
    let now = crate::release::unix_now();
    let missing: Vec<u32> = app_ids
        .iter()
        .copied()
        .filter(|id| !catalog.covers.contains_key(id))
        .collect();

    if !allow_network || (missing.is_empty() && !stale(&catalog, now) && !force) {
        return catalog;
    }

    let wanted = if stale(&catalog, now) || force {
        app_ids.to_vec()
    } else {
        missing
    };
    if wanted.is_empty() {
        return catalog;
    }

    let mut answered = 0;
    for chunk in wanted.chunks(BATCH) {
        match fetch(chunk) {
            Ok(found) => {
                answered += 1;
                catalog.covers.extend(found);
            }
            Err(_) => break,
        }
    }
    if answered > 0 {
        catalog.fetched_at = now;
        save(data_dir, &catalog);
    }
    catalog
}

fn fetch(ids: &[u32]) -> Result<BTreeMap<u32, String>, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(format!("mfg-unlocker-gui/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let body = json!({
        "context": { "language": "english", "country_code": "US" },
        "data_request": { "include_assets": true },
        "ids": ids.iter().map(|id| json!({ "appid": id })).collect::<Vec<_>>(),
    });
    let response = client
        .get(ENDPOINT)
        .query(&[("input_json", body.to_string())])
        .send()
        .map_err(|error| format!("could not ask Steam for cover art: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Steam's store answered {}",
            response.status().as_u16()
        ));
    }
    let text = response
        .text()
        .map_err(|error| format!("could not read Steam's answer: {error}"))?;
    parse(&text)
}

fn parse(text: &str) -> Result<BTreeMap<u32, String>, String> {
    let document: Value = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let items = document
        .get("response")
        .and_then(|response| response.get("store_items"))
        .and_then(Value::as_array)
        .ok_or_else(|| "Steam's answer had no store items".to_string())?;

    let mut found = BTreeMap::new();
    for item in items {
        let Some(app_id) = item.get("appid").and_then(Value::as_u64) else {
            continue;
        };
        let Some(header) = item
            .get("assets")
            .and_then(|assets| assets.get("header"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        if header.trim().is_empty() {
            continue;
        }
        let url = format!(
            "{ASSET_ROOT}{}/{}",
            app_id,
            header.trim_start_matches('/')
        );
        found.insert(app_id as u32, url);
    }
    if found.is_empty() {
        return Err("Steam returned no cover art".to_string());
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"response":{"store_items":[
      {"appid":3751950,"assets":{"header":"9b046115b1663a4be2b252712328e4f6c162da68/header.jpg"}},
      {"appid":1091500,"assets":{"header":"48a93d6445a67520ea49833c93dae8f2e68fc540/header_alt_assets_9.jpg"}},
      {"appid":9999999,"assets":null}
    ]}}"#;

    #[test]
    fn builds_the_hashed_asset_url() {
        let found = parse(SAMPLE).unwrap();
        assert_eq!(
            found.get(&3751950).map(String::as_str),
            Some("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3751950/9b046115b1663a4be2b252712328e4f6c162da68/header.jpg")
        );
        assert!(found.get(&1091500).unwrap().ends_with("header_alt_assets_9.jpg"));
        assert!(found.get(&9999999).is_none());
    }

    #[test]
    fn an_empty_answer_is_an_error() {
        let empty = r#"{"response":{"store_items":[]}}"#;
        assert!(parse(empty).is_err());
        assert!(parse("not json").is_err());
    }

    #[test]
    fn a_saved_catalog_answers_without_the_network() {
        let dir = std::env::temp_dir().join(format!("mfg-covers-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut catalog = Catalog {
            fetched_at: crate::release::unix_now(),
            covers: BTreeMap::new(),
        };
        catalog.covers.insert(
            3751950,
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3751950/hash/header.jpg"
                .to_string(),
        );
        save(&dir, &catalog);

        let read = ensure(&dir, &[3751950], false, false);
        assert_eq!(read.url_for(3751950).map(String::as_str), Some(catalog.covers[&3751950].as_str()));
        assert!(read.url_for(1091500).is_none());
        assert!(!stale(&read, crate::release::unix_now()));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
