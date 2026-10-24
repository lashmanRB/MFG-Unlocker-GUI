use crate::model::{StatusSummary, STATUS_FILE};
use serde_json::{Map, Value};
use std::path::Path;

pub fn read(game_dir: &Path) -> Option<StatusSummary> {
    let json = std::fs::read_to_string(game_dir.join(STATUS_FILE)).ok()?;
    let document: Value = serde_json::from_str(&json).ok()?;
    let object = document.as_object()?;

    let heartbeat = integer(object, &["heartbeat"]);
    Some(StatusSummary {
        // A stale or future heartbeat is still shown, the UI marks it stale.
        age_seconds: crate::release::unix_now().saturating_sub(heartbeat),
        pid: integer(object, &["pid"]) as u32,
        protocol_version: integer(object, &["version"]) as u32,
        gpu_family: integer(object, &["gpuFamily"]) as u32,
        graphics_api: integer(object, &["graphicsApi"]) as u32,
        bridge_ready: flag(object, &["bridgeReady"]),
        game_frame_generation_on: flag(object, &["gameFrameGenerationOn"]),
        applied_frame_generation_on: flag(object, &["appliedFrameGenerationOn"]),
        desired_multiplier: integer(object, &["multiplier", "desiredMultiplier"]) as u32,
        applied_multiplier: integer(object, &["appliedMultiplier"]) as u32,
        dynamic_mode: dynamic(object),
        safe_maximum_multiplier: integer(object, &["safeMaximumMultiplier"]) as u32,
        nvidia_profile_name: text(object, &["nvidiaProfileName"]),
        nvidia_tier: integer(object, &["nvidiaCompatibilityTier"]) as u32,
        real_fps: integer(object, &["realFpsMilli"]) as f32 / 1000.0,
        dlss_fps: integer(object, &["dlssFpsMilli"]) as f32 / 1000.0,
        last_set_options_result: signed(object, &["setOptionsResult", "lastSetOptionsResult"]) as i32,
        patch_route: text(object, &["route", "patchRoute"]),
    })
}

// The status names the requested mode, not a boolean; appliedMode is the
// fallback for a snapshot that only reported what the game ended up with.
fn dynamic(object: &Map<String, Value>) -> bool {
    if let Some(value) = object.get("dynamicMode").and_then(Value::as_bool) {
        return value;
    }
    let mode = text(object, &["mode"]);
    if !mode.is_empty() {
        return mode == "dynamic";
    }
    text(object, &["appliedMode"]) == "dynamic"
}

fn pick<'a>(object: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| object.get(*key))
}

fn integer(object: &Map<String, Value>, keys: &[&str]) -> u64 {
    let Some(value) = pick(object, keys) else {
        return 0;
    };
    if let Some(number) = value.as_u64() {
        return number;
    }
    if let Some(number) = value.as_f64() {
        return number.max(0.0) as u64;
    }
    value
        .as_str()
        .and_then(|text| text.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

fn signed(object: &Map<String, Value>, keys: &[&str]) -> i64 {
    let Some(value) = pick(object, keys) else {
        return 0;
    };
    if let Some(number) = value.as_i64() {
        return number;
    }
    if let Some(number) = value.as_f64() {
        return number as i64;
    }
    value
        .as_str()
        .and_then(|text| text.trim().parse::<i64>().ok())
        .unwrap_or(0)
}

fn flag(object: &Map<String, Value>, keys: &[&str]) -> bool {
    match pick(object, keys) {
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(number)) => number.as_u64().unwrap_or(0) != 0,
        Some(Value::String(text)) => matches!(text.trim(), "1" | "true" | "on"),
        _ => false,
    }
}

fn text(object: &Map<String, Value>, keys: &[&str]) -> String {
    match pick(object, keys) {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-status-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn sample(heartbeat: u64) -> String {
        format!(
            "{{\"version\":40,\"pid\":12345,\"processBirth\":638000000000000000,\
             \"heartbeat\":{heartbeat},\"route\":\"provider\",\"bridgeReady\":true,\
             \"loaderCoreImported\":true,\"nvidiaCompatibilityResolved\":true,\
             \"nvidiaProfileStatus\":0,\"nvidiaProfileName\":\"Cyberpunk 2077\",\
             \"nvidiaCompatibilityTier\":4,\"compatibilityFallback\":false,\
             \"safeMaximumMultiplier\":6,\"followGame\":false,\"mode\":\"fixed\",\
             \"multiplier\":4,\"dynamicTargetFrameRate\":0,\
             \"gameFrameGenerationOn\":true,\"appliedFrameGenerationOn\":true,\
             \"appliedMode\":\"fixed\",\"appliedMultiplier\":4,\
             \"realFpsMilli\":61250,\"dlssFpsMilli\":245000,\"setOptionsResult\":0,\
             \"product\":\"RTXMFG\",\"gpuFamily\":1,\"graphicsApi\":1}}"
        )
    }

    #[test]
    fn a_running_game_reads_as_a_full_summary() {
        let game = scratch("full");
        let now = crate::release::unix_now();
        std::fs::write(game.join(STATUS_FILE), sample(now)).unwrap();

        let status = read(&game).expect("a status summary");
        assert!(status.age_seconds < 5, "age {}", status.age_seconds);
        assert_eq!(status.pid, 12345);
        assert_eq!(status.protocol_version, 40);
        assert_eq!(status.gpu_family, 1);
        assert_eq!(status.graphics_api, 1);
        assert!(status.bridge_ready);
        assert!(status.game_frame_generation_on);
        assert!(status.applied_frame_generation_on);
        assert_eq!(status.desired_multiplier, 4);
        assert_eq!(status.applied_multiplier, 4);
        assert!(!status.dynamic_mode);
        assert_eq!(status.safe_maximum_multiplier, 6);
        assert_eq!(status.nvidia_profile_name, "Cyberpunk 2077");
        assert_eq!(status.nvidia_tier, 4);
        assert_eq!(status.real_fps, 61.25);
        assert_eq!(status.dlss_fps, 245.0);
        assert_eq!(status.last_set_options_result, 0);
        assert_eq!(status.patch_route, "provider");
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn a_stale_heartbeat_is_still_reported() {
        let game = scratch("stale");
        std::fs::write(game.join(STATUS_FILE), sample(1000)).unwrap();
        let status = read(&game).expect("a stale summary is still shown");
        assert!(status.age_seconds > 120);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn a_heartbeat_in_the_future_does_not_underflow() {
        let game = scratch("future");
        std::fs::write(game.join(STATUS_FILE), sample(crate::release::unix_now() + 600)).unwrap();
        let status = read(&game).expect("a future summary is still shown");
        assert_eq!(status.age_seconds, 0);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn missing_fields_fall_back_to_zero() {
        let game = scratch("sparse");
        std::fs::write(game.join(STATUS_FILE), "{\"pid\":9,\"dynamicMode\":true}").unwrap();
        let status = read(&game).expect("a sparse summary is still shown");
        assert_eq!(status.pid, 9);
        assert!(status.dynamic_mode);
        assert_eq!(status.protocol_version, 0);
        assert_eq!(status.real_fps, 0.0);
        assert_eq!(status.patch_route, "");
        assert!(!status.bridge_ready);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn a_missing_or_odd_file_gives_none() {
        let game = scratch("odd");
        assert!(read(&game).is_none());

        std::fs::write(game.join(STATUS_FILE), "[1,2,3]").unwrap();
        assert!(read(&game).is_none());

        std::fs::write(game.join(STATUS_FILE), "not json").unwrap();
        assert!(read(&game).is_none());
        let _ = std::fs::remove_dir_all(&game);
    }
}
