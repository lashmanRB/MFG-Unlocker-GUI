use crate::model::{ApplyResult, GameSettings, CONTROL_FILE, UI_INI};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

// The version the mod writes into its own control file; the parser ignores it.
const CONTROL_VERSION: u32 = 13;

pub fn read(game_dir: &Path) -> Result<GameSettings, String> {
    let control_path = game_dir.join(CONTROL_FILE);
    let ini_path = game_dir.join(UI_INI);

    let mut settings = GameSettings::default();
    settings.has_control_file = control_path.is_file();
    settings.has_ini_file = ini_path.is_file();

    if settings.has_control_file {
        let text = std::fs::read_to_string(&control_path)
            .map_err(|error| format!("cannot read {CONTROL_FILE}: {error}"))?;
        let document: Value = serde_json::from_str(&text)
            .map_err(|error| format!("{CONTROL_FILE} is not valid JSON: {error}"))?;
        let object = document
            .as_object()
            .ok_or_else(|| format!("{CONTROL_FILE} does not hold a JSON object"))?;
        read_control(object, &mut settings);
    }

    if settings.has_ini_file {
        let bytes = std::fs::read(&ini_path)
            .map_err(|error| format!("cannot read {UI_INI}: {error}"))?;
        let (text, _) = decode_text(&bytes);
        read_preferences(&text, &mut settings);
    }

    Ok(settings)
}

pub fn write(game_dir: &Path, settings: &GameSettings) -> Result<ApplyResult, String> {
    if !game_dir.is_dir() {
        return Err(format!("The game folder {} does not exist.", game_dir.display()));
    }

    let mut warnings = Vec::new();

    let control_ok = match write_control(game_dir, settings) {
        Ok(warning) => {
            warnings.extend(warning);
            true
        }
        Err(message) => {
            warnings.push(message);
            false
        }
    };

    let ini_path = game_dir.join(UI_INI);
    let ini_ok = match merge_preferences(&ini_path, settings) {
        Ok(warning) => {
            warnings.extend(warning);
            true
        }
        Err(message) => {
            warnings.push(message);
            false
        }
    };

    Ok(ApplyResult {
        ok: control_ok && ini_ok,
        warnings,
    })
}

fn read_control(object: &Map<String, Value>, settings: &mut GameSettings) {
    let follow_game = object.get("followGame").and_then(Value::as_bool);
    let text_mode = object.get("mode").and_then(Value::as_str);
    settings.mode = match (text_mode, follow_game) {
        (Some("dynamic"), _) => "dynamic",
        (Some("fixed"), _) => "fixed",
        // The mod only honours "follow" when followGame is set with it.
        (Some("follow"), Some(false)) => "fixed",
        (Some("follow"), _) => "follow",
        _ => match follow_game {
            Some(true) => "follow",
            _ => "fixed",
        },
    }
    .to_string();

    if let Some(multiplier) = integer(object, "multiplier") {
        if (1..=6).contains(&multiplier) {
            settings.multiplier = multiplier;
        }
    }

    if let Some(target) = integer(object, "dynamicTargetFrameRate") {
        if target <= 1000 {
            settings.dynamic_target_frame_rate = target;
            settings.dynamic_lock_to_refresh_rate = target == 0;
            settings.dynamic_custom_target_frame_rate = if target == 0 { 120 } else { target };
        }
    }

    if let Some(preset) = integer(object, "dlssgPreset") {
        if preset <= 3 {
            settings.dlssg_preset = preset;
        }
    }
    if let Some(preset) = integer(object, "dlssSrPreset") {
        settings.dlss_sr_preset = valid_preset(preset, &[0, 10, 11, 12, 13]);
    }
    if let Some(preset) = integer(object, "dlssRrPreset") {
        settings.dlss_rr_preset = valid_preset(preset, &[0, 4, 5, 6]);
    }
    if let Some(mode) = integer(object, "vsyncMode") {
        if mode <= 2 {
            settings.vsync_mode = mode;
        }
    }
    if let Some(limit) = integer(object, "reflexFrameLimitFps") {
        if limit <= 1000 {
            settings.reflex_frame_limit_fps = limit;
        }
    }

    settings.generated_only_debug = flag(object, "generatedOnlyDebug");
    settings.interval_logging = flag(object, "intervalLogging");
}

fn read_preferences(text: &str, settings: &mut GameSettings) {
    let entries = ini_entries(text);

    if let Some(value) = ini_value(&entries, "Overlay", "Language") {
        settings.language = read_language(value);
    }
    if let Some(value) = ini_value(&entries, "Overlay", "ToggleKey") {
        settings.toggle_key = value.to_string();
    }
    if let Some(value) = ini_value(&entries, "Overlay", "PinnedFps") {
        settings.pinned_fps = read_bool(value).unwrap_or(false);
    }
    if let Some(value) = ini_value(&entries, "Overlay", "LayoutScale") {
        settings.layout_scale = value.to_string();
    }
    // An unreadable flip-metering value follows the mod's default, which is the
    // same state as the key not being set at all.
    if let Some(value) = ini_value(&entries, "Compatibility", "Rtx30FlipMetering") {
        settings.rtx30_flip_metering = read_bool(value);
    }
    if let Some(value) = ini_value(&entries, "Compatibility", "GpuNameOverride") {
        settings.gpu_name_override = read_bool(value).unwrap_or(false);
    }
}

fn write_control(game_dir: &Path, settings: &GameSettings) -> Result<Option<String>, String> {
    let path = game_dir.join(CONTROL_FILE);
    replace_file(&path, control_json(&path, settings).as_bytes())
}

// The mod keeps keys this app has no business throwing away (xessModel,
// optiScalerUi and whatever a later build adds), so the saved file is edited,
// not replaced. Only the keys below are ours.
fn control_json(path: &Path, settings: &GameSettings) -> String {
    let mut control = existing_control(path);
    let (follow_game, mode) = match settings.mode.as_str() {
        "dynamic" => (false, "dynamic"),
        "fixed" => (false, "fixed"),
        _ => (true, "follow"),
    };
    let ours = [
        ("followGame", Value::Bool(follow_game)),
        ("mode", Value::String(mode.to_string())),
        ("multiplier", Value::from(settings.multiplier.clamp(1, 6))),
        ("dynamicTargetFrameRate", Value::from(target_frame_rate(settings))),
        ("dlssgPreset", Value::from(settings.dlssg_preset.min(3))),
        (
            "dlssSrPreset",
            Value::from(valid_preset(settings.dlss_sr_preset, &[0, 10, 11, 12, 13])),
        ),
        (
            "dlssRrPreset",
            Value::from(valid_preset(settings.dlss_rr_preset, &[0, 4, 5, 6])),
        ),
        ("vsyncMode", Value::from(settings.vsync_mode.min(2))),
        (
            "reflexFrameLimitFps",
            Value::from(settings.reflex_frame_limit_fps.min(1000)),
        ),
        ("generatedOnlyDebug", Value::Bool(settings.generated_only_debug)),
        ("intervalLogging", Value::Bool(settings.interval_logging)),
        ("version", Value::from(CONTROL_VERSION)),
    ];
    for (key, value) in ours {
        control.insert(key.to_string(), value);
    }

    let mut text = serde_json::to_string_pretty(&Value::Object(control)).unwrap_or_default();
    text.push('\n');
    text
}

fn existing_control(path: &Path) -> Map<String, Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|document| document.as_object().cloned())
        .unwrap_or_default()
}

// The control file has a single number: 0 locks to the display refresh rate.
fn target_frame_rate(settings: &GameSettings) -> u32 {
    if settings.dynamic_lock_to_refresh_rate {
        0
    } else {
        settings.dynamic_custom_target_frame_rate.min(1000)
    }
}

// A missing value removes the key, which is how the UI says "use the mod's
// default" for a setting that has a real unset state.
fn ini_values(settings: &GameSettings) -> Vec<(&'static str, &'static str, Option<String>)> {
    let language = settings.language.trim();
    let language = if language.is_empty() { "auto" } else { language };
    let mut values = vec![("Overlay", "Language", Some(language.to_string()))];

    let toggle = settings.toggle_key.trim();
    values.push((
        "Overlay",
        "ToggleKey",
        (!toggle.is_empty()).then(|| toggle.to_string()),
    ));
    values.push(("Overlay", "PinnedFps", Some(on_off(settings.pinned_fps))));

    let layout = settings.layout_scale.trim();
    values.push((
        "Overlay",
        "LayoutScale",
        (!layout.is_empty()).then(|| layout.to_string()),
    ));

    values.push((
        "Compatibility",
        "Rtx30FlipMetering",
        settings.rtx30_flip_metering.map(on_off),
    ));
    values.push((
        "Compatibility",
        "GpuNameOverride",
        Some(on_off(settings.gpu_name_override)),
    ));
    values
}

fn merge_preferences(path: &Path, settings: &GameSettings) -> Result<Option<String>, String> {
    let (text, encoding) = match std::fs::read(path) {
        Ok(bytes) => decode_text(&bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (String::new(), IniEncoding::Utf8),
        Err(error) => return Err(format!("cannot read {UI_INI}: {error}")),
    };
    let merged = merge_ini(&text, &ini_values(settings));
    replace_file(path, &encode_text(&merged, encoding))
}

fn replace_file(path: &Path, bytes: &[u8]) -> Result<Option<String>, String> {
    let temporary = temporary_beside(path);
    if let Err(error) = std::fs::write(&temporary, bytes) {
        let _ = std::fs::remove_file(&temporary);
        return Err(format!("cannot write {}: {error}", path.display()));
    }

    match std::fs::rename(&temporary, path) {
        Ok(()) => Ok(None),
        Err(_) => {
            // A game holding the file open blocks the rename but not a direct
            // overwrite, so try that before giving up.
            let _ = std::fs::remove_file(&temporary);
            std::fs::write(path, bytes)
                .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            Ok(Some(format!("{name} was in use; it was overwritten in place.")))
        }
    }
}

fn temporary_beside(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_default();
    // Not ".tmp": the mod saves its own control file through that exact name.
    name.push(".gui.tmp");
    path.with_file_name(name)
}

// The mod writes its preferences with the Windows profile API, which keeps a
// file it created itself in UTF-16; reading and writing both encodings keeps
// the language name and the layout scale intact.
#[derive(Clone, Copy)]
enum IniEncoding {
    Utf8,
    Utf16,
}

fn decode_text(bytes: &[u8]) -> (String, IniEncoding) {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        return (String::from_utf16_lossy(&units), IniEncoding::Utf16);
    }
    let text = String::from_utf8_lossy(bytes);
    (
        text.trim_start_matches('\u{feff}').to_string(),
        IniEncoding::Utf8,
    )
}

fn encode_text(text: &str, encoding: IniEncoding) -> Vec<u8> {
    match encoding {
        IniEncoding::Utf8 => text.as_bytes().to_vec(),
        IniEncoding::Utf16 => {
            let mut bytes = vec![0xFF, 0xFE];
            for unit in text.encode_utf16() {
                bytes.extend_from_slice(&unit.to_le_bytes());
            }
            bytes
        }
    }
}

fn merge_ini(text: &str, values: &[(&str, &str, Option<String>)]) -> String {
    let newline = if text.contains("\r\n") || text.is_empty() { "\r\n" } else { "\n" };
    let mut lines: Vec<String> = if text.is_empty() {
        Vec::new()
    } else {
        text.split('\n')
            .map(|line| line.trim_end_matches('\r').to_string())
            .collect()
    };
    if text.ends_with('\n') && !lines.is_empty() {
        lines.pop();
    }

    let sections = ini_sections(&lines);
    let mut missing: Vec<usize> = Vec::new();
    let mut remove: Vec<usize> = Vec::new();
    for (value_index, (section, key, value)) in values.iter().enumerate() {
        let (section, key) = (*section, *key);
        let mut found = false;
        if let Some((_, start, end)) = sections
            .iter()
            .find(|(name, _, _)| name.eq_ignore_ascii_case(section))
        {
            for index in start + 1..*end {
                let Some((line_key, _)) = lines[index].split_once('=') else {
                    continue;
                };
                if !line_key.trim().eq_ignore_ascii_case(key) {
                    continue;
                }
                found = true;
                match value {
                    Some(value) => lines[index] = format!("{line_key}={value}"),
                    None => remove.push(index),
                }
                break;
            }
        }
        if !found && value.is_some() {
            missing.push(value_index);
        }
    }

    // Removing shifts everything after the line, so the insert positions below
    // are worked out once the keys are gone.
    remove.sort_unstable_by(|left, right| right.cmp(left));
    for index in remove {
        lines.remove(index);
    }

    let sections = ini_sections(&lines);
    let mut inserts: Vec<(usize, Vec<String>)> = Vec::new();
    let mut new_sections: Vec<(&str, Vec<String>)> = Vec::new();
    for value_index in missing {
        let (section, key) = (values[value_index].0, values[value_index].1);
        let Some(value) = &values[value_index].2 else {
            continue;
        };
        let line = format!("{key}={value}");
        if let Some((_, start, end)) = sections
            .iter()
            .find(|(name, _, _)| name.eq_ignore_ascii_case(section))
        {
            let mut at = *end;
            while at > start + 1 && lines[at - 1].trim().is_empty() {
                at -= 1;
            }
            match inserts.iter_mut().find(|(position, _)| *position == at) {
                Some((_, group)) => group.push(line),
                None => inserts.push((at, vec![line])),
            }
        } else {
            match new_sections.iter_mut().find(|(name, _)| name.eq_ignore_ascii_case(section)) {
                Some((_, group)) => group.push(line),
                None => new_sections.push((section, vec![line])),
            }
        }
    }

    inserts.sort_by(|left, right| right.0.cmp(&left.0));
    for (at, group) in inserts {
        for (offset, line) in group.into_iter().enumerate() {
            lines.insert(at + offset, line);
        }
    }

    for (section, group) in new_sections {
        let blank = lines
            .iter()
            .any(|line| !line.trim().is_empty())
            && !lines.last().map(|line| line.trim().is_empty()).unwrap_or(true);
        if blank {
            lines.push(String::new());
        }
        lines.push(format!("[{section}]"));
        lines.extend(group);
    }

    let mut output = lines.join(newline);
    if !output.is_empty() {
        output.push_str(newline);
    }
    output
}

fn ini_sections(lines: &[String]) -> Vec<(String, usize, usize)> {
    let mut sections: Vec<(String, usize, usize)> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if let Some(name) = ini_section_name(line) {
            if let Some(previous) = sections.last_mut() {
                previous.2 = index;
            }
            sections.push((name, index, lines.len()));
        }
    }
    sections
}

fn ini_section_name(line: &str) -> Option<String> {
    let rest = line.trim().strip_prefix('[')?;
    let (name, _) = rest.split_once(']')?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    Some(name.to_ascii_lowercase())
}

fn ini_entries(text: &str) -> Vec<(String, String, String)> {
    let mut section = String::new();
    let mut entries = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if let Some(name) = ini_section_name(line) {
            section = name;
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            entries.push((
                section.clone(),
                key.trim().to_ascii_lowercase(),
                value.trim().to_string(),
            ));
        }
    }
    entries
}

fn ini_value<'a>(
    entries: &'a [(String, String, String)],
    section: &str,
    key: &str,
) -> Option<&'a str> {
    entries
        .iter()
        .find(|(entry_section, entry_key, _)| {
            entry_section.eq_ignore_ascii_case(section) && entry_key.eq_ignore_ascii_case(key)
        })
        .map(|(_, _, value)| value.as_str())
}

fn read_language(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("auto") {
        "auto".to_string()
    } else if value.eq_ignore_ascii_case("en") {
        "en".to_string()
    } else {
        value.to_string()
    }
}

fn read_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "on" => Some(true),
        "0" | "false" | "off" => Some(false),
        _ => None,
    }
}

fn on_off(value: bool) -> String {
    (if value { "1" } else { "0" }).to_string()
}

fn valid_preset(value: u32, allowed: &[u32]) -> u32 {
    if allowed.contains(&value) {
        value
    } else {
        0
    }
}

fn integer(object: &Map<String, Value>, key: &str) -> Option<u32> {
    let value = object.get(key)?;
    if let Some(number) = value.as_u64() {
        return Some(number as u32);
    }
    value.as_f64().map(|number| number.max(0.0) as u32)
}

fn flag(object: &Map<String, Value>, key: &str) -> bool {
    object.get(key).and_then(Value::as_bool).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-settings-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn sample() -> GameSettings {
        GameSettings {
            mode: "dynamic".to_string(),
            multiplier: 4,
            dynamic_target_frame_rate: 144,
            dynamic_lock_to_refresh_rate: false,
            dynamic_custom_target_frame_rate: 144,
            dlssg_preset: 3,
            dlss_sr_preset: 13,
            dlss_rr_preset: 5,
            vsync_mode: 2,
            reflex_frame_limit_fps: 120,
            generated_only_debug: true,
            interval_logging: true,
            language: "zh-CN".to_string(),
            toggle_key: "9".to_string(),
            pinned_fps: true,
            layout_scale: "1.25".to_string(),
            rtx30_flip_metering: Some(false),
            gpu_name_override: true,
            ..GameSettings::default()
        }
    }

    #[test]
    fn the_control_file_round_trips() {
        let game = scratch("roundtrip");
        let settings = sample();

        let applied = write(&game, &settings).unwrap();
        assert!(applied.ok, "warnings: {:?}", applied.warnings);
        assert!(applied.warnings.is_empty(), "warnings: {:?}", applied.warnings);

        let read_back = read(&game).unwrap();
        assert!(read_back.has_control_file);
        assert!(read_back.has_ini_file);
        assert_eq!(read_back.mode, settings.mode);
        assert_eq!(read_back.multiplier, settings.multiplier);
        assert_eq!(read_back.dynamic_target_frame_rate, 144);
        assert_eq!(read_back.dynamic_lock_to_refresh_rate, false);
        assert_eq!(read_back.dynamic_custom_target_frame_rate, 144);
        assert_eq!(read_back.dlssg_preset, 3);
        assert_eq!(read_back.dlss_sr_preset, 13);
        assert_eq!(read_back.dlss_rr_preset, 5);
        assert_eq!(read_back.vsync_mode, 2);
        assert_eq!(read_back.reflex_frame_limit_fps, 120);
        assert_eq!(read_back.generated_only_debug, true);
        assert_eq!(read_back.interval_logging, true);
        assert_eq!(read_back.language, "zh-CN");
        assert_eq!(read_back.toggle_key, "9");
        assert_eq!(read_back.pinned_fps, true);
        assert_eq!(read_back.layout_scale, "1.25");
        assert_eq!(read_back.rtx30_flip_metering, Some(false));
        assert_eq!(read_back.gpu_name_override, true);

        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn follow_game_is_written_when_the_mode_is_follow() {
        let game = scratch("follow");
        let settings = GameSettings {
            mode: "follow".to_string(),
            multiplier: 3,
            ..GameSettings::default()
        };
        write(&game, &settings).unwrap();

        let text = std::fs::read_to_string(game.join(CONTROL_FILE)).unwrap();
        assert!(text.contains("\"followGame\": true"), "{text}");
        assert!(text.contains("\"mode\": \"follow\""), "{text}");
        let read_back = read(&game).unwrap();
        assert_eq!(read_back.mode, "follow");
        assert_eq!(read_back.multiplier, 3);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn missing_control_file_gives_the_defaults() {
        let game = scratch("empty");
        let settings = read(&game).unwrap();
        assert_eq!(settings.mode, "follow");
        assert_eq!(settings.multiplier, 2);
        assert_eq!(settings.language, "auto");
        assert_eq!(settings.rtx30_flip_metering, None);
        assert!(!settings.has_control_file);
        assert!(!settings.has_ini_file);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn mode_follows_follow_game_when_the_key_is_absent() {
        let game = scratch("legacy");
        std::fs::write(
            game.join(CONTROL_FILE),
            "{\"multiplier\":5,\"followGame\":true}",
        )
        .unwrap();
        assert_eq!(read(&game).unwrap().mode, "follow");

        std::fs::write(game.join(CONTROL_FILE), "{\"multiplier\":5}").unwrap();
        let settings = read(&game).unwrap();
        assert_eq!(settings.mode, "fixed");
        assert_eq!(settings.multiplier, 5);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn the_ini_merge_keeps_comments_and_unknown_keys() {
        let game = scratch("merge");
        let original = "; written by hand\r\n\
[Overlay]\r\n\
Language=auto\r\n\
ToggleKey=8\r\n\
FirstLaunchMenuShown=1\r\n\
\r\n\
[Other]\r\n\
Thing=7\r\n\
\r\n\
; trailing note\r\n";
        std::fs::write(game.join(UI_INI), original).unwrap();

        let settings = GameSettings {
            language: "en".to_string(),
            toggle_key: "8".to_string(),
            pinned_fps: true,
            layout_scale: "1.5".to_string(),
            rtx30_flip_metering: Some(true),
            ..GameSettings::default()
        };
        write(&game, &settings).unwrap();

        let text = std::fs::read_to_string(game.join(UI_INI)).unwrap();
        assert!(text.contains("; written by hand"), "{text}");
        assert!(text.contains("; trailing note"), "{text}");
        assert!(text.contains("FirstLaunchMenuShown=1"), "{text}");
        assert!(text.contains("Thing=7"), "{text}");
        assert!(text.contains("Language=en"), "{text}");
        assert!(text.contains("PinnedFps=1"), "{text}");
        assert!(text.contains("LayoutScale=1.5"), "{text}");
        assert!(text.contains("Rtx30FlipMetering=1"), "{text}");
        assert!(text.contains("[Compatibility]"), "{text}");
        assert!(!text.contains("Language=auto"), "{text}");
        // The file was CRLF before, so it stays CRLF.
        assert!(text.contains("\r\n"));

        let read_back = read(&game).unwrap();
        assert_eq!(read_back.language, "en");
        assert_eq!(read_back.toggle_key, "8");
        assert!(read_back.pinned_fps);
        assert_eq!(read_back.layout_scale, "1.5");
        assert_eq!(read_back.rtx30_flip_metering, Some(true));
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn unknown_control_keys_survive_a_save() {
        let game = scratch("carry");
        std::fs::write(
            game.join(CONTROL_FILE),
            "{\"multiplier\":2,\"followGame\":true,\"xessModel\":1,\
             \"optiScalerUi\":\"optiscaler\",\"futureKey\":{\"flag\":true}}",
        )
        .unwrap();

        let settings = GameSettings {
            mode: "fixed".to_string(),
            multiplier: 3,
            dlss_sr_preset: 12,
            dlss_rr_preset: 6,
            ..GameSettings::default()
        };
        write(&game, &settings).unwrap();

        let text = std::fs::read_to_string(game.join(CONTROL_FILE)).unwrap();
        let control: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(control["multiplier"], 3);
        assert_eq!(control["mode"], "fixed");
        assert_eq!(control["followGame"], false);
        assert_eq!(control["dlssSrPreset"], 12);
        assert_eq!(control["dlssRrPreset"], 6);
        assert_eq!(control["version"], 13);
        // The mod's own settings are none of the app's business.
        assert_eq!(control["xessModel"], 1);
        assert_eq!(control["optiScalerUi"], "optiscaler");
        assert_eq!(control["futureKey"]["flag"], true);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn unset_flip_metering_removes_the_key() {
        let game = scratch("unset");
        std::fs::write(
            game.join(UI_INI),
            "[Compatibility]\r\nRtx30FlipMetering=1\r\nGpuNameOverride=1\r\n",
        )
        .unwrap();
        assert_eq!(read(&game).unwrap().rtx30_flip_metering, Some(true));

        let settings = GameSettings {
            rtx30_flip_metering: None,
            ..GameSettings::default()
        };
        write(&game, &settings).unwrap();

        let text = std::fs::read_to_string(game.join(UI_INI)).unwrap();
        assert!(!text.contains("Rtx30FlipMetering"), "{text}");
        assert!(text.contains("GpuNameOverride=0"), "{text}");
        assert_eq!(read(&game).unwrap().rtx30_flip_metering, None);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn ini_booleans_take_the_words_the_mod_takes() {
        let game = scratch("bools");
        let cases = [
            ("1", Some(true)),
            ("TRUE", Some(true)),
            ("on", Some(true)),
            ("0", Some(false)),
            (" False ", Some(false)),
            ("off", Some(false)),
            ("maybe", None),
            ("", None),
        ];
        for (value, expected) in cases {
            std::fs::write(
                game.join(UI_INI),
                format!(
                    "[Overlay]\nPinnedFps={value}\n[Compatibility]\nRtx30FlipMetering={value}\nGpuNameOverride={value}\n"
                ),
            )
            .unwrap();
            let settings = read(&game).unwrap();
            assert_eq!(settings.rtx30_flip_metering, expected, "Rtx30FlipMetering={value}");
            assert_eq!(settings.pinned_fps, expected == Some(true), "PinnedFps={value}");
            assert_eq!(
                settings.gpu_name_override,
                expected == Some(true),
                "GpuNameOverride={value}"
            );
        }
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn an_unknown_section_does_not_supply_values() {
        let game = scratch("section");
        std::fs::write(
            game.join(UI_INI),
            "[Other]\nLanguage=en\nGpuNameOverride=1\n",
        )
        .unwrap();
        let settings = read(&game).unwrap();
        assert_eq!(settings.language, "auto");
        assert!(!settings.gpu_name_override);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn the_writer_clamps_what_the_mod_rejects() {
        let game = scratch("clamp");
        let settings = GameSettings {
            mode: "dynamic".to_string(),
            multiplier: 9,
            dynamic_lock_to_refresh_rate: false,
            dynamic_custom_target_frame_rate: 5000,
            dlssg_preset: 7,
            dlss_sr_preset: 7,
            dlss_rr_preset: 3,
            vsync_mode: 5,
            reflex_frame_limit_fps: 5000,
            ..GameSettings::default()
        };
        write(&game, &settings).unwrap();

        let text = std::fs::read_to_string(game.join(CONTROL_FILE)).unwrap();
        let control: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(control["multiplier"], 6);
        assert_eq!(control["dynamicTargetFrameRate"], 1000);
        assert_eq!(control["dlssgPreset"], 3);
        assert_eq!(control["dlssSrPreset"], 0);
        assert_eq!(control["dlssRrPreset"], 0);
        assert_eq!(control["vsyncMode"], 2);
        assert_eq!(control["reflexFrameLimitFps"], 1000);
        assert_eq!(control["version"], 13);
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn writing_needs_a_folder_that_exists() {
        let game = scratch("missing").join("gone");
        assert!(write(&game, &GameSettings::default()).is_err());
    }

    #[test]
    fn a_utf16_preference_file_stays_utf16() {
        let game = scratch("utf16");
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "[Overlay]\r\nLanguage=zh-CN\r\n".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        std::fs::write(game.join(UI_INI), bytes).unwrap();

        assert_eq!(read(&game).unwrap().language, "zh-CN");
        write(&game, &GameSettings::default()).unwrap();

        let bytes = std::fs::read(game.join(UI_INI)).unwrap();
        assert!(bytes.starts_with(&[0xFF, 0xFE]));
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        let text = String::from_utf16(&units).unwrap();
        assert!(text.contains("Language=auto"), "{text}");
        let _ = std::fs::remove_dir_all(&game);
    }
}

