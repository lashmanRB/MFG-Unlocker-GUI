use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;

const OVERRIDES_URL: &str = "https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/nvidia-rtx-games-engines-apps/dlss-rt-games-apps-overrides.json";
const CACHE_FILE: &str = "nvidia-overrides.json";
const META_FILE: &str = "nvidia-overrides.meta.json";
const OK_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
const FAIL_TTL_SECONDS: u64 = 60 * 60;

// NVIDIA publishes the per title DLSS overrides the mod reads through the NVIDIA
// app profile: the MFG cell ("NV, 6X" / "NV, 4X") is their ceiling for the title.
// A title with Frame Generation but no MFG cell still works, just at the
// wrapper's own capacity.
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub name: String,
    pub key: String,
    pub tier: u8,
}

#[derive(Clone, Debug, Default)]
pub struct Index {
    pub entries: Vec<Entry>,
    pub fetched_at: Option<u64>,
}

impl Index {
    pub fn tier_for(&self, game_name: &str) -> Option<&Entry> {
        let wanted = normalize(game_name);
        if wanted.is_empty() {
            return None;
        }

        let mut best: Option<&Entry> = None;
        for entry in &self.entries {
            if entry.key.is_empty() {
                continue;
            }
            let exact = entry.key == wanted;
            // Editions and subtitles hang off the end of the store name, so a
            // short extra tail still counts as the same title. A number or a
            // roman numeral is a different game though: "Red Dead Redemption 2"
            // must not borrow the row of "Red Dead Redemption".
            let tail = wanted.strip_prefix(entry.key.as_str()).unwrap_or_default();
            let edition_tail = !tail.is_empty()
                && !tail.starts_with(|character: char| character.is_ascii_digit())
                && !tail
                    .chars()
                    .all(|character| "ivxlcdm".contains(character));
            let tail_matches = entry.key.len() >= 4 && edition_tail && tail.len() <= 14;
            if !exact && !tail_matches {
                continue;
            }
            let better = match best {
                None => true,
                Some(current) => {
                    exact && current.key != wanted || current.key.len() < entry.key.len()
                }
            };
            if better {
                best = Some(entry);
            }
        }
        best
    }
}

pub fn tier_label(tier: u8) -> &'static str {
    match tier {
        6 => "6X MFG",
        4 => "4X MFG",
        2 => "Frame Generation, no MFG override",
        _ => "not listed",
    }
}

pub fn normalize(name: &str) -> String {
    name.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

#[derive(Deserialize, serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Meta {
    fetched_at: u64,
    ok: bool,
}

fn cache_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CACHE_FILE)
}

fn meta_path(data_dir: &Path) -> PathBuf {
    data_dir.join(META_FILE)
}

// Fetches past the cache and writes it, so a manual refresh shows up in the
// next scan without waiting for the weekly check.
pub fn refresh(data_dir: &Path) -> Result<Index, String> {
    let text = fetch()?;
    let entries = parse(&text).ok_or_else(|| "NVIDIA's game list could not be read".to_string())?;
    if entries.is_empty() {
        return Err("NVIDIA's game list was empty".to_string());
    }
    write_cache(data_dir, &text, &entries);
    Ok(Index {
        entries,
        fetched_at: Some(crate::release::unix_now()),
    })
}

pub fn load(data_dir: &Path, allow_network: bool) -> Index {
    let meta = read_meta(data_dir);
    let fresh = meta
        .as_ref()
        .map(|meta| {
            let ttl = if meta.ok { OK_TTL_SECONDS } else { FAIL_TTL_SECONDS };
            crate::release::unix_now().saturating_sub(meta.fetched_at) < ttl
        })
        .unwrap_or(false);

    if !fresh && allow_network {
        if let Ok(index) = refresh(data_dir) {
            return index;
        }
        write_meta(
            data_dir,
            &Meta {
                fetched_at: crate::release::unix_now(),
                ok: false,
            },
        );
    }

    let entries = std::fs::read_to_string(cache_path(data_dir))
        .ok()
        .and_then(|text| parse(&text))
        .unwrap_or_default();
    Index {
        entries,
        fetched_at: meta.map(|meta| meta.fetched_at),
    }
}

fn fetch() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(format!("mfg-unlocker-gui/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(OVERRIDES_URL)
        .send()
        .map_err(|error| format!("could not fetch NVIDIA's game list: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "NVIDIA's game list answered {}",
            response.status().as_u16()
        ));
    }
    response
        .text()
        .map_err(|error| format!("could not read NVIDIA's game list: {error}"))
}

fn write_cache(data_dir: &Path, text: &str, entries: &[Entry]) {
    if std::fs::write(cache_path(data_dir), text).is_err() {
        return;
    }
    write_meta(
        data_dir,
        &Meta {
            fetched_at: crate::release::unix_now(),
            ok: !entries.is_empty(),
        },
    );
}

fn write_meta(data_dir: &Path, meta: &Meta) {
    if let Ok(text) = serde_json::to_string_pretty(meta) {
        let _ = std::fs::write(meta_path(data_dir), text);
    }
}

fn read_meta(data_dir: &Path) -> Option<Meta> {
    let text = std::fs::read_to_string(meta_path(data_dir)).ok()?;
    serde_json::from_str(&text).ok()
}

fn parse(text: &str) -> Option<Vec<Entry>> {
    let document: Value = serde_json::from_str(text).ok()?;
    let rows = document.get("data")?.as_array()?;
    let mut entries = Vec::new();

    for row in rows {
        let Some(name) = row.get("name").and_then(Value::as_str) else {
            continue;
        };
        if name.trim().is_empty() {
            continue;
        }
        let mfg = row
            .get("dlss multi frame generation")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_ascii_uppercase();
        let frame_gen = row
            .get("dlss frame generation")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let tier = if mfg.contains("6X") {
            6
        } else if mfg.contains("4X") {
            4
        } else if !frame_gen.trim().is_empty() {
            2
        } else {
            continue;
        };
        entries.push(Entry {
            name: name.to_string(),
            key: normalize(name),
            tier,
        });
    }

    Some(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "data": [
        {"name": "Alan Wake 2", "dlss multi frame generation": "NV, 6X", "dlss frame generation": "NV, U"},
        {"name": "Lies of P", "dlss multi frame generation": "NV, 4X", "dlss frame generation": "Yes"},
        {"name": "A Plague Tale: Requiem", "dlss multi frame generation": "", "dlss frame generation": "NV, U"},
        {"name": "Baldur's Gate 3", "dlss multi frame generation": "", "dlss frame generation": ""},
        {"name": "007 First Light", "dlss multi frame generation": "NV, 6X", "dlss frame generation": "NV, U"}
      ]
    }"#;

    fn index() -> Index {
        Index {
            entries: parse(SAMPLE).expect("sample parses"),
            fetched_at: None,
        }
    }

    #[test]
    fn reads_the_three_tiers() {
        let entries = parse(SAMPLE).unwrap();
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].tier, 6);
        assert_eq!(entries[1].tier, 4);
        assert_eq!(entries[2].tier, 2);
        assert!(entries.iter().all(|entry| entry.name != "Baldur's Gate 3"));
    }

    #[test]
    fn matches_store_names_and_editions() {
        let index = index();
        assert_eq!(index.tier_for("Alan Wake 2").map(|entry| entry.tier), Some(6));
        assert_eq!(index.tier_for("007 First Light").map(|entry| entry.tier), Some(6));
        assert_eq!(
            index.tier_for("Lies of P: Overture").map(|entry| entry.tier),
            Some(4)
        );
        assert_eq!(
            index.tier_for("A Plague Tale: Requiem").map(|entry| entry.tier),
            Some(2)
        );
        assert!(index.tier_for("Baldur's Gate 3").is_none());
        assert!(index.tier_for("").is_none());
    }

    #[test]
    fn a_sequel_does_not_borrow_the_predecessors_entry() {
        let sample = r#"{"data": [
          {"name": "Red Dead Redemption", "dlss multi frame generation": "", "dlss frame generation": "Yes"},
          {"name": "Lies of P", "dlss multi frame generation": "NV, 4X", "dlss frame generation": "Yes"}
        ]}"#;
        let index = Index {
            entries: parse(sample).unwrap(),
            fetched_at: None,
        };
        assert_eq!(
            index.tier_for("Red Dead Redemption").map(|entry| entry.tier),
            Some(2)
        );
        assert!(index.tier_for("Red Dead Redemption 2").is_none());
        assert!(index.tier_for("Red Dead Redemption II").is_none());
        assert_eq!(
            index.tier_for("Lies of P: Overture").map(|entry| entry.tier),
            Some(4)
        );
    }

    #[test]
    fn a_cached_list_answers_without_the_network() {
        let dir = std::env::temp_dir().join(format!("mfg-nvidia-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(cache_path(&dir), SAMPLE).unwrap();
        write_meta(
            &dir,
            &Meta {
                fetched_at: crate::release::unix_now(),
                ok: true,
            },
        );

        let index = load(&dir, false);
        assert_eq!(index.entries.len(), 4);
        assert_eq!(index.tier_for("Alan Wake 2").map(|entry| entry.tier), Some(6));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
