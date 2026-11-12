// DLSS 5 share codes and the preset store. A preset is the DLSS 5 tab's look under a name, written as a
// "DLSS5-" Crockford base32 code players paste to each other. Ported from the mod's dlss5_presets.h and
// dlss5_policy.h at v1.7.1; the record ids and ranges there are the contract, so keep them in sync.

use crate::model::CONTROL_FILE;
use crate::settings::update_control;
use serde_json::{Map, Value};
use std::path::Path;

const STORE_FILE: &str = "RTXMFG-Dlss5Presets.txt";
const PREFIX: &str = "DLSS5-";
const FORMAT: u8 = 1;
const MAX_NAME: usize = 48;
const MAX_PRESETS: usize = 64;
// The longest body we will read; a full preset with the longest name is about 190 characters.
const MAX_CODE_LENGTH: usize = 512;

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Bool,
    Choice,
    Real,
}

#[derive(Clone, Copy)]
enum Val {
    Bool(bool),
    Choice(u32),
    Real(f32),
}

struct Field {
    key: &'static str,
    kind: Kind,
    min: f32,
    max: f32,
    read: fn(&Settings) -> Val,
    write: fn(&mut Settings, Val),
}

macro_rules! field_type {
    (Bool) => {
        bool
    };
    (Choice) => {
        u32
    };
    (Real) => {
        f32
    };
}

// One list drives the struct, its defaults and the field table, the way kFields does in the header.
macro_rules! dlss5_settings {
    ($($key:literal, $kind:ident, $name:ident, $min:expr, $max:expr, $default:expr;)*) => {
        #[derive(Clone, Debug, PartialEq)]
        struct Settings {
            $($name: field_type!($kind),)*
        }

        impl Default for Settings {
            fn default() -> Self {
                Settings { $($name: $default,)* }
            }
        }

        const FIELDS: &[Field] = &[
            $(Field {
                key: $key,
                kind: Kind::$kind,
                min: $min,
                max: $max,
                read: |s| Val::$kind(s.$name),
                write: |s, v| if let Val::$kind(x) = v { s.$name = x; },
            },)*
        ];
    };
}

dlss5_settings! {
    "dlss5", Bool, enabled, 0.0, 1.0, false;
    "dlss5HookStage", Choice, stage, 0.0, 3.0, 0;
    "dlss5UseDlssResources", Choice, resources, 0.0, 2.0, 1;
    "dlss5UiCorrection", Choice, ui_correction, 0.0, 2.0, 0;
    "dlss5Encoding", Choice, encoding, 0.0, 5.0, 0;
    "dlss5DiffuseWhite", Real, diffuse_white, 48.0, 500.0, 100.0;
    "dlss5DiffuseWhiteOverride", Bool, diffuse_white_override, 0.0, 1.0, false;
    "dlss5OverallIntensity", Real, intensity, 0.0, 1.0, 1.0;
    "dlss5Model", Choice, model, 0.0, 2.0, 0;
    "dlss5StructureIntensity", Real, structure, 0.0, 2.0, 1.0;
    "dlss5ToneIntensity", Real, tone, 0.0, 2.0, 1.0;
    "dlss5CharacterMask", Bool, character_mask, 0.0, 1.0, true;
    "dlss5CharacterIntensity", Real, character, -1.0, 2.0, -1.0;
    "dlss5ResolutionScale", Real, scale, 0.0, 200.0, 100.0;
    "dlss5ResolutionScaleAuto", Bool, scale_auto, 0.0, 1.0, false;
    "dlss5ScalingDomain", Choice, domain, 0.0, 2.0, 0;
    "dlss5DownsampleFilter", Choice, downsample, 0.0, 2.0, 0;
    "dlss5UpsampleFilter", Choice, upsample, 0.0, 3.0, 0;
    "dlss5ScaleReconstruction", Choice, reconstruction, 0.0, 2.0, 0;
    "dlss5Preset", Choice, preset, 0.0, 2.0, 0;
    "dlss5PassCount", Choice, passes, 1.0, 10.0, 1;
    "dlss5SignalEncoding", Choice, signal, 0.0, 2.0, 0;
    "dlss5BlockHudless", Bool, block_hudless, 0.0, 1.0, true;
    "dlss5Exposure", Real, exposure, 0.0, 100.0, 1.0;
    "dlss5UseExposureValue", Choice, exposure_mode, 0.0, 2.0, 1;
    "dlss5AdaptiveExposure", Bool, adaptive_exposure, 0.0, 1.0, false;
    "dlss5Boost", Bool, boost, 0.0, 1.0, false;
    "dlss5CompareSplitView", Bool, compare, 0.0, 1.0, false;
    "dlss5CompareSplit", Real, compare_split, 5.0, 95.0, 50.0;
    "dlss5CompareKey", Choice, compare_key, 0.0, 254.0, 0;
    "dlss5LaterPassesCustom", Bool, later_custom, 0.0, 1.0, false;
    "dlss5LaterModel", Choice, later_model, 0.0, 2.0, 0;
    "dlss5LaterIntensity", Real, later_intensity, 0.0, 1.0, 1.0;
    "dlss5LaterStructure", Real, later_structure, 0.0, 2.0, 1.0;
    "dlss5LaterTone", Real, later_tone, 0.0, 2.0, 1.0;
    "dlss5LaterCharacter", Real, later_character, -1.0, 2.0, -1.0;
    "dlss5BlendStrength", Real, blend, 0.0, 2.0, 1.0;
    "dlss5ColorStrength", Real, color, 0.0, 2.0, 1.0;
    "dlss5HighlightGuard", Bool, highlight_guard, 0.0, 1.0, false;
    "dlss5HighlightLimit", Real, highlight_limit, 1.0, 8.0, 2.0;
    "dlss5HaloDark", Real, halo_dark, 0.0, 1.0, 0.0;
    "dlss5HaloBright", Real, halo_bright, 0.0, 1.0, 0.0;
    "dlss5HaloRadius", Choice, halo_radius, 1.0, 4.0, 2;
    "dlss5SupersampleFilter", Choice, supersample, 0.0, 1.0, 0;
    "dlss5HdrKnee", Real, knee, 0.5, 0.95, 0.8;
    "dlss5AdaptiveTarget", Real, adaptive_target, 0.05, 0.5, 0.18;
    "dlss5BoostTolerance", Choice, boost_tolerance, 0.0, 2.0, 1;
    "dlss5DebugView", Choice, debug_view, 0.0, 3.0, 0;
    "dlss5CompareSwap", Bool, compare_swap, 0.0, 1.0, false;
    "dlss5DefaultsVersion", Choice, defaults_version, 0.0, 65535.0, 3;
}

// Record ids, the index here. Append only: never reorder, remove or reuse an id, or shared codes change meaning.
const KEYS: [&str; 43] = [
    "dlss5HookStage",
    "dlss5UseDlssResources",
    "dlss5UiCorrection",
    "dlss5Encoding",
    "dlss5DiffuseWhite",
    "dlss5DiffuseWhiteOverride",
    "dlss5OverallIntensity",
    "dlss5Model",
    "dlss5StructureIntensity",
    "dlss5ToneIntensity",
    "dlss5CharacterMask",
    "dlss5CharacterIntensity",
    "dlss5ResolutionScale",
    "dlss5ResolutionScaleAuto",
    "dlss5ScalingDomain",
    "dlss5DownsampleFilter",
    "dlss5UpsampleFilter",
    "dlss5ScaleReconstruction",
    "dlss5Preset",
    "dlss5PassCount",
    "dlss5SignalEncoding",
    "dlss5BlockHudless",
    "dlss5Exposure",
    "dlss5UseExposureValue",
    "dlss5AdaptiveExposure",
    "dlss5Boost",
    "dlss5LaterPassesCustom",
    "dlss5LaterModel",
    "dlss5LaterIntensity",
    "dlss5LaterStructure",
    "dlss5LaterTone",
    "dlss5LaterCharacter",
    "dlss5BlendStrength",
    "dlss5ColorStrength",
    "dlss5HighlightGuard",
    "dlss5HighlightLimit",
    "dlss5HaloDark",
    "dlss5HaloBright",
    "dlss5HaloRadius",
    "dlss5SupersampleFilter",
    "dlss5HdrKnee",
    "dlss5AdaptiveTarget",
    "dlss5BoostTolerance",
];

fn field_for(key: &str) -> &'static Field {
    FIELDS
        .iter()
        .find(|field| field.key == key)
        .expect("a preset id is a dlss5 field")
}

fn compare_key_allowed(key: u32) -> bool {
    key == 0 || ((0x05..=0xFE).contains(&key) && key != 0x1B && key != 0x5B && key != 0x5C)
}

// Every number back in its range: a non-finite real or an out-of-range choice takes the default, a finite real is
// clamped. Pass count, the compare key and halo radius follow their own rules; the defaults generation stays put.
fn sanitize(mut settings: Settings) -> Settings {
    let defaults = Settings::default();
    for field in FIELDS {
        if matches!(
            field.key,
            "dlss5PassCount" | "dlss5CompareKey" | "dlss5HaloRadius" | "dlss5DefaultsVersion"
        ) {
            continue;
        }
        let fixed = match ((field.read)(&settings), (field.read)(&defaults)) {
            (Val::Real(value), Val::Real(fallback)) => Val::Real(if value.is_finite() {
                value.clamp(field.min, field.max)
            } else {
                fallback
            }),
            (Val::Choice(value), fallback @ Val::Choice(_))
                if value < field.min as u32 || value > field.max as u32 =>
            {
                fallback
            }
            (value, _) => value,
        };
        (field.write)(&mut settings, fixed);
    }
    // Faces & skin is -1 (follows Structure) or 0 and above.
    if settings.character < 0.0 {
        settings.character = -1.0;
    }
    if settings.later_character < 0.0 {
        settings.later_character = -1.0;
    }
    if settings.reconstruction > 1 {
        settings.reconstruction = defaults.reconstruction;
    }
    settings.passes = settings.passes.clamp(1, 10);
    if !compare_key_allowed(settings.compare_key) {
        settings.compare_key = defaults.compare_key;
    }
    settings.halo_radius = settings.halo_radius.clamp(1, 4);
    settings
}

impl Settings {
    fn from_control(map: &Map<String, Value>) -> Settings {
        let mut settings = Settings::default();
        for field in FIELDS {
            let Some(value) = map.get(field.key) else {
                continue;
            };
            let read = match field.kind {
                Kind::Bool => value.as_bool().map(Val::Bool),
                Kind::Choice => value
                    .as_u64()
                    .map(|number| number as u32)
                    .or_else(|| value.as_f64().map(|number| number.max(0.0) as u32))
                    .map(Val::Choice),
                Kind::Real => value.as_f64().map(|number| Val::Real(number as f32)),
            };
            if let Some(read) = read {
                (field.write)(&mut settings, read);
            }
        }
        sanitize(settings)
    }

    fn into_map(&self, map: &mut Map<String, Value>) {
        for field in FIELDS {
            let value = match (field.read)(self) {
                Val::Bool(flag) => Value::Bool(flag),
                Val::Choice(number) => Value::from(number),
                Val::Real(number) => Value::from(number),
            };
            map.insert(field.key.to_string(), value);
        }
    }
}

// IEEE half float, rounded to nearest even. The ranges here (-1 to 500) are exact to about 0.05 %.
fn to_half(value: f32) -> u16 {
    let bits = value.to_bits();
    let sign = (bits >> 16) & 0x8000;
    let biased = (bits >> 23) & 0xFF;
    let mut mantissa = bits & 0x7FFFFF;
    if biased == 0xFF {
        return (sign | 0x7C00 | if mantissa != 0 { 0x200 } else { 0 }) as u16;
    }
    let exponent = biased as i32 - 127 + 15;
    if exponent >= 31 {
        return (sign | 0x7C00) as u16;
    }
    if exponent <= 0 {
        if exponent < -10 {
            return sign as u16;
        }
        mantissa |= 0x800000;
        let shift = (14 - exponent) as u32;
        let mut half = mantissa >> shift;
        let rest = mantissa & ((1u32 << shift) - 1);
        let halfway = 1u32 << (shift - 1);
        if rest > halfway || (rest == halfway && half & 1 != 0) {
            half += 1;
        }
        return (sign | half) as u16;
    }
    let mut half = ((exponent as u32) << 10) | (mantissa >> 13);
    let rest = mantissa & 0x1FFF;
    // A carry out of the mantissa raises the exponent, which is the correct rounding.
    if rest > 0x1000 || (rest == 0x1000 && half & 1 != 0) {
        half += 1;
    }
    (sign | half) as u16
}

fn from_half(half: u16) -> f32 {
    let sign = ((half & 0x8000) as u32) << 16;
    let exponent = (half >> 10) & 0x1F;
    let mut mantissa = (half & 0x3FF) as u32;
    let mut bits = sign;
    if exponent == 0x1F {
        bits |= 0x7F800000 | (mantissa << 13);
    } else if exponent != 0 {
        bits |= ((exponent as u32 + 112) << 23) | (mantissa << 13);
    } else if mantissa != 0 {
        let mut biased = 113u32;
        while mantissa & 0x400 == 0 {
            mantissa <<= 1;
            biased -= 1;
        }
        bits |= (biased << 23) | ((mantissa & 0x3FF) << 13);
    }
    f32::from_bits(bits)
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xEDB8_8320 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    !crc
}

// Crockford base32: digits and capitals without I, L, O and U.
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

fn base32(bytes: &[u8]) -> String {
    let mut text = String::with_capacity((bytes.len() * 8 + 4) / 5);
    let mut buffer = 0u32;
    let mut bits = 0;
    for &byte in bytes {
        buffer = (buffer << 8) | byte as u32;
        bits += 8;
        while bits >= 5 {
            text.push(ALPHABET[((buffer >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        text.push(ALPHABET[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    text
}

// A character's base32 value, -1 for none. Lower case reads as upper case; O reads as 0, I and L as 1.
fn base32_value(mut character: u8) -> i32 {
    if character.is_ascii_lowercase() {
        character -= b'a' - b'A';
    }
    if character == b'O' {
        return 0;
    }
    if character == b'I' || character == b'L' {
        return 1;
    }
    ALPHABET
        .iter()
        .position(|&letter| letter == character)
        .map(|index| index as i32)
        .unwrap_or(-1)
}

// None for a character outside the alphabet, or for bits left over that a whole code never has.
fn from_base32(text: &str) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0;
    for &character in text.as_bytes() {
        if character == b'-' {
            continue;
        }
        let value = base32_value(character);
        if value < 0 {
            return None;
        }
        buffer = (buffer << 5) | value as u32;
        bits += 5;
        if bits >= 8 {
            bytes.push((buffer >> (bits - 8)) as u8);
            bits -= 8;
        }
    }
    if bits >= 5 || buffer & ((1u32 << bits) - 1) != 0 {
        return None;
    }
    Some(bytes)
}

// A name as presets keep it: valid UTF-8 without control characters, spaces trimmed, at most MAX_NAME bytes (cut on
// a character boundary). "##" becomes "#": ImGui would hide the rest of a label after it.
fn clean_name(name: &str) -> String {
    let bytes = name.as_bytes();
    let mut clean: Vec<u8> = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'#' && clean.last() == Some(&b'#') {
            at += 1;
            continue;
        }
        let lead = bytes[at];
        let length = if lead < 0x80 {
            1
        } else if (0xC2..=0xDF).contains(&lead) {
            2
        } else if (0xE0..=0xEF).contains(&lead) {
            3
        } else if (0xF0..=0xF4).contains(&lead) {
            4
        } else {
            0
        };
        let mut valid = length != 0 && at + length <= bytes.len();
        for next in 1..length {
            if valid && bytes[at + next] & 0xC0 != 0x80 {
                valid = false;
            }
        }
        if !valid {
            at += 1;
            continue;
        }
        if length == 1 && (lead < 0x20 || lead == 0x7F) {
            at += 1;
            continue;
        }
        if clean.len() + length > MAX_NAME {
            break;
        }
        clean.extend_from_slice(&bytes[at..at + length]);
        at += length;
    }
    String::from_utf8(clean)
        .unwrap_or_default()
        .trim_matches(' ')
        .to_string()
}

// The records of a look (no format, name or checksum): equal records are the same preset. Diffed against the
// generation 3 defaults, frozen so every code keeps its meaning.
fn records(input: &Settings) -> Vec<u8> {
    let settings = sanitize(input.clone());
    let baseline = Settings::default();
    let mut out = Vec::new();
    for (id, key) in KEYS.iter().enumerate() {
        let field = field_for(key);
        match ((field.read)(&settings), (field.read)(&baseline)) {
            (Val::Bool(value), Val::Bool(base)) => {
                if value != base {
                    out.push(id as u8 | if value { 0x40 } else { 0x00 });
                }
            }
            (Val::Choice(value), Val::Choice(base)) => {
                if value != base {
                    out.push(id as u8 | 0x80);
                    out.push(value as u8);
                }
            }
            (Val::Real(value), Val::Real(base)) => {
                let half = to_half(value);
                if half != to_half(base) {
                    out.push(id as u8 | 0xC0);
                    out.extend_from_slice(&half.to_le_bytes());
                }
            }
            _ => {}
        }
    }
    out
}

fn encode(settings: &Settings, name: &str) -> String {
    let clean = clean_name(name);
    let body = records(settings);
    let mut bytes = Vec::with_capacity(2 + clean.len() + body.len() + 4);
    bytes.push(FORMAT);
    bytes.push(clean.len() as u8);
    bytes.extend_from_slice(clean.as_bytes());
    bytes.extend_from_slice(&body);
    let crc = crc32(&bytes);
    bytes.extend_from_slice(&crc.to_le_bytes());
    format!("{PREFIX}{}", base32(&bytes))
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum DecodeError {
    NoCode,
    Damaged,
    Newer,
}

#[derive(Clone, Debug, PartialEq)]
struct Preset {
    name: String,
    // The code in its canonical spelling (encode's).
    code: String,
    settings: Settings,
    // Records this build does not know (from a newer MFG Unlocker), skipped.
    skipped: u32,
}

// One code: the characters after the prefix.
fn decode_body(body: &str) -> Result<Preset, DecodeError> {
    if body.is_empty() || body.len() > MAX_CODE_LENGTH {
        return Err(DecodeError::Damaged);
    }
    let bytes = from_base32(body).ok_or(DecodeError::Damaged)?;
    if bytes.len() < 2 + 4 {
        return Err(DecodeError::Damaged);
    }
    let end = bytes.len() - 4;
    let crc = u32::from_le_bytes([bytes[end], bytes[end + 1], bytes[end + 2], bytes[end + 3]]);
    if crc != crc32(&bytes[..end]) {
        return Err(DecodeError::Damaged);
    }
    if bytes[0] != FORMAT {
        return Err(if bytes[0] > FORMAT {
            DecodeError::Newer
        } else {
            DecodeError::Damaged
        });
    }
    let name_length = bytes[1] as usize;
    if name_length > MAX_NAME || 2 + name_length > end {
        return Err(DecodeError::Damaged);
    }
    let name = std::str::from_utf8(&bytes[2..2 + name_length]).map_err(|_| DecodeError::Damaged)?;
    if clean_name(name) != name {
        return Err(DecodeError::Damaged);
    }
    let mut settings = Settings::default();
    let mut skipped = 0u32;
    let mut seen = 0u64;
    let mut at = 2 + name_length;
    while at < end {
        let tag = bytes[at];
        at += 1;
        let id = (tag & 63) as usize;
        let kind = tag >> 6;
        let length = match kind {
            2 => 1,
            3 => 2,
            _ => 0,
        };
        if at + length > end {
            return Err(DecodeError::Damaged);
        }
        if seen & (1u64 << id) != 0 {
            return Err(DecodeError::Damaged);
        }
        seen |= 1u64 << id;
        if id >= KEYS.len() {
            skipped += 1;
            at += length;
            continue;
        }
        let field = field_for(KEYS[id]);
        match field.kind {
            Kind::Bool => {
                if kind > 1 {
                    return Err(DecodeError::Damaged);
                }
                (field.write)(&mut settings, Val::Bool(kind == 1));
            }
            Kind::Choice => {
                if kind != 2 {
                    return Err(DecodeError::Damaged);
                }
                (field.write)(&mut settings, Val::Choice(bytes[at] as u32));
            }
            Kind::Real => {
                if kind != 3 {
                    return Err(DecodeError::Damaged);
                }
                let value = from_half(u16::from_le_bytes([bytes[at], bytes[at + 1]]));
                if !value.is_finite() {
                    return Err(DecodeError::Damaged);
                }
                (field.write)(&mut settings, Val::Real(value));
            }
        }
        at += length;
    }
    // A newer build's wider ranges come back into ours, as a saved file's would.
    let settings = sanitize(settings);
    let code = encode(&settings, name);
    Ok(Preset {
        name: name.to_string(),
        code,
        settings,
        skipped,
    })
}

// The first code in the text, which may hold more: a chat message, quotes or a code block around it. Codes end at
// the first character outside the alphabet and "-". Newer or Damaged when every code found is so.
fn decode(text: &str) -> Result<Preset, DecodeError> {
    let bytes = text.as_bytes();
    let prefix = PREFIX.as_bytes();
    let mut result = DecodeError::NoCode;
    let mut at = 0;
    while at + prefix.len() <= bytes.len() {
        let mut matched = true;
        for (index, &want) in prefix.iter().enumerate() {
            let mut character = bytes[at + index];
            if character.is_ascii_lowercase() {
                character -= b'a' - b'A';
            }
            if character != want {
                matched = false;
                break;
            }
        }
        if !matched {
            at += 1;
            continue;
        }
        let mut end = at + prefix.len();
        while end < bytes.len() && (bytes[end] == b'-' || base32_value(bytes[end]) >= 0) {
            end += 1;
        }
        match decode_body(&text[at + prefix.len()..end]) {
            Ok(preset) => return Ok(preset),
            Err(error) => {
                if result != DecodeError::Newer {
                    result = error;
                }
            }
        }
        at = end;
    }
    Err(result)
}

fn decode_message(error: DecodeError) -> String {
    match error {
        DecodeError::NoCode => "no DLSS5- share code in that text".to_string(),
        DecodeError::Damaged => "the share code is damaged".to_string(),
        DecodeError::Newer => "a newer MFG Unlocker wrote this code".to_string(),
    }
}

// The current look with a preset's settings: the preset's look and how it runs, DLSS 5 on. Compare and Inspect stay.
fn apply(current: &Settings, preset: &Settings) -> Settings {
    let mut result = current.clone();
    for key in KEYS {
        let field = field_for(key);
        (field.write)(&mut result, (field.read)(preset));
    }
    result.enabled = true;
    sanitize(result)
}

// The saved presets file: one code per line; lines starting with '#' are comments. Lines that are not a readable
// code (a newer format, a hand edit) are kept as they are, so a rewrite never loses them.
struct Entry {
    preset: Option<Preset>,
    raw: Vec<u8>,
}

fn trim_line(line: &[u8]) -> &[u8] {
    let mut start = 0;
    let mut end = line.len();
    while start < end && matches!(line[start], b' ' | b'\t') {
        start += 1;
    }
    while end > start && matches!(line[end - 1], b'\r' | b' ' | b'\t') {
        end -= 1;
    }
    &line[start..end]
}

fn parse_store(content: &[u8]) -> Vec<Entry> {
    let mut entries: Vec<Entry> = Vec::new();
    for line in content.split(|&byte| byte == b'\n') {
        let line = trim_line(line);
        // A UTF-8 byte order mark from a text editor.
        let line = if entries.is_empty() {
            line.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(line)
        } else {
            line
        };
        if line.is_empty() || line[0] == b'#' {
            continue;
        }
        let preset = std::str::from_utf8(line)
            .ok()
            .and_then(|text| decode(text).ok());
        let raw = if preset.is_none() {
            line[..line.len().min(MAX_CODE_LENGTH * 2)].to_vec()
        } else {
            Vec::new()
        };
        entries.push(Entry { preset, raw });
        if entries.len() >= MAX_PRESETS * 2 {
            break;
        }
    }
    entries
}

fn write_store(entries: &[Entry]) -> Vec<u8> {
    let mut content = b"# MFG Unlocker DLSS 5 presets: one code per line, in the menu's order.\r\n\
        # Share a line with others; they import it under DLSS 5, Presets.\r\n"
        .to_vec();
    for entry in entries {
        match &entry.preset {
            Some(preset) => content.extend_from_slice(preset.code.as_bytes()),
            None => content.extend_from_slice(&entry.raw),
        }
        content.extend_from_slice(b"\r\n");
    }
    content
}

fn readable_count(entries: &[Entry]) -> usize {
    entries.iter().filter(|entry| entry.preset.is_some()).count()
}

// ASCII letters compare without case, so "Night" and "night" are one name.
fn find_name(entries: &[Entry], name: &str) -> Option<usize> {
    entries.iter().position(|entry| {
        entry
            .preset
            .as_ref()
            .is_some_and(|preset| preset.name.eq_ignore_ascii_case(name))
    })
}

// The name, or "name (2)", "name (3)"... when it is taken.
fn unique_name(entries: &[Entry], name: &str) -> String {
    let base = clean_name(name);
    if find_name(entries, &base).is_none() {
        return base;
    }
    let mut number = 2u32;
    loop {
        let suffix = format!(" ({number})");
        let mut cut = MAX_NAME.saturating_sub(suffix.len()).min(base.len());
        while !base.is_char_boundary(cut) {
            cut -= 1;
        }
        // CleanName cut on a character boundary; trim again in case that left a trailing space.
        let mut candidate = clean_name(&base[..cut]);
        candidate = clean_name(&candidate);
        candidate.push_str(&suffix);
        if find_name(entries, &candidate).is_none() {
            return candidate;
        }
        number += 1;
    }
}

fn load_store(game_dir: &Path) -> Result<Vec<Entry>, String> {
    match std::fs::read(game_dir.join(STORE_FILE)) {
        Ok(bytes) => Ok(parse_store(&bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("cannot read {STORE_FILE}: {error}")),
    }
}

fn save_store(game_dir: &Path, entries: &[Entry]) -> Result<(), String> {
    std::fs::write(game_dir.join(STORE_FILE), write_store(entries))
        .map_err(|error| format!("cannot write {STORE_FILE}: {error}"))
}

fn current_settings(game_dir: &Path) -> Settings {
    let map = std::fs::read_to_string(game_dir.join(CONTROL_FILE))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|document| document.as_object().cloned())
        .unwrap_or_default();
    Settings::from_control(&map)
}

fn full_list() -> String {
    format!("the preset list is full ({MAX_PRESETS} presets); delete one to make room")
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct PresetInfo {
    pub name: String,
    pub code: String,
}

pub fn presets(game_dir: &Path) -> Result<Vec<PresetInfo>, String> {
    let entries = load_store(game_dir)?;
    Ok(entries
        .iter()
        .filter_map(|entry| {
            entry.preset.as_ref().map(|preset| PresetInfo {
                name: preset.name.clone(),
                code: preset.code.clone(),
            })
        })
        .collect())
}

pub fn save_preset(game_dir: &Path, name: &str) -> Result<PresetInfo, String> {
    let mut entries = load_store(game_dir)?;
    if readable_count(&entries) >= MAX_PRESETS {
        return Err(full_list());
    }
    let settings = current_settings(game_dir);
    let name = unique_name(&entries, name);
    let code = encode(&settings, &name);
    entries.push(Entry {
        preset: Some(Preset {
            name: name.clone(),
            code: code.clone(),
            settings,
            skipped: 0,
        }),
        raw: Vec::new(),
    });
    save_store(game_dir, &entries)?;
    Ok(PresetInfo { name, code })
}

pub fn import(game_dir: &Path, text: &str) -> Result<PresetInfo, String> {
    let preset = decode(text).map_err(decode_message)?;
    let mut entries = load_store(game_dir)?;
    if readable_count(&entries) >= MAX_PRESETS {
        return Err(full_list());
    }
    let applied = apply(&current_settings(game_dir), &preset.settings);
    update_control(game_dir, |map| applied.into_map(map))?;
    let name = unique_name(&entries, &preset.name);
    let code = encode(&applied, &name);
    entries.push(Entry {
        preset: Some(Preset {
            name: name.clone(),
            code: code.clone(),
            settings: applied,
            skipped: preset.skipped,
        }),
        raw: Vec::new(),
    });
    save_store(game_dir, &entries)?;
    Ok(PresetInfo { name, code })
}

pub fn delete_preset(game_dir: &Path, name: &str) -> Result<(), String> {
    let mut entries = load_store(game_dir)?;
    let Some(index) = find_name(&entries, name) else {
        return Err(format!("no preset named \"{name}\""));
    };
    entries.remove(index);
    save_store(game_dir, &entries)
}

pub fn export_code(game_dir: &Path) -> Result<String, String> {
    Ok(encode(&current_settings(game_dir), ""))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-dlss5-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn code_from_records(name: &str, body: &[u8]) -> String {
        let mut bytes = vec![FORMAT, name.len() as u8];
        bytes.extend_from_slice(name.as_bytes());
        bytes.extend_from_slice(body);
        let crc = crc32(&bytes);
        bytes.extend_from_slice(&crc.to_le_bytes());
        format!("{PREFIX}{}", base32(&bytes))
    }

    fn entry_named(name: &str) -> Entry {
        let settings = Settings::default();
        let code = encode(&settings, name);
        Entry {
            preset: Some(Preset {
                name: name.to_string(),
                code,
                settings,
                skipped: 0,
            }),
            raw: Vec::new(),
        }
    }

    fn sample_look() -> Settings {
        let mut settings = Settings::default();
        settings.enabled = true;
        settings.stage = 2;
        settings.intensity = 0.5;
        settings.structure = 1.5;
        settings.tone = 1.25;
        settings.character = 0.75;
        settings.model = 1;
        settings.character_mask = false;
        settings.scale = 75.0;
        settings.passes = 3;
        settings.blend = 0.5;
        settings.knee = 0.9;
        settings
    }

    #[test]
    fn a_code_round_trips_a_look_and_a_name() {
        let settings = sample_look();
        let code = encode(&settings, "Night look");
        assert!(code.starts_with("DLSS5-"));

        let preset = decode(&code).unwrap();
        assert_eq!(preset.name, "Night look");
        assert_eq!(preset.code, code);
        assert_eq!(preset.skipped, 0);

        // enabled is not a record; apply turns it on and keeps the look.
        let applied = apply(&Settings::default(), &preset.settings);
        assert!(applied.enabled);
        assert_eq!(applied.stage, 2);
        assert_eq!(applied.intensity, 0.5);
        assert_eq!(applied.structure, 1.5);
        assert_eq!(applied.tone, 1.25);
        assert_eq!(applied.character, 0.75);
        assert_eq!(applied.model, 1);
        assert!(!applied.character_mask);
        assert_eq!(applied.scale, 75.0);
        assert_eq!(applied.passes, 3);
        assert_eq!(applied.blend, 0.5);
        // Reals ride a half float, so compare against the quantized value.
        assert_eq!(applied.knee, from_half(to_half(0.9)));

        // A chat paste: lower case, surrounded by words, still reads.
        let pasted = format!("hey try {} thanks", code.to_lowercase());
        assert_eq!(decode(&pasted).unwrap().code, code);
    }

    #[test]
    fn a_damaged_checksum_is_rejected() {
        let code = encode(&Settings::default(), "x");
        let mut bytes = from_base32(&code[PREFIX.len()..]).unwrap();
        let middle = bytes.len() / 2;
        bytes[middle] ^= 0xFF;
        let damaged = format!("{PREFIX}{}", base32(&bytes));
        assert_eq!(decode(&damaged), Err(DecodeError::Damaged));

        // Cut short and a stray character are damaged too.
        assert_eq!(decode(&code[..code.len() - 3]), Err(DecodeError::Damaged));
        assert_eq!(decode("DLSS5-!!!"), Err(DecodeError::Damaged));
        assert_eq!(decode("no code here"), Err(DecodeError::NoCode));
    }

    #[test]
    fn an_unknown_record_id_is_skipped_not_fatal() {
        // stage = 2, then two ids this build does not know (a byte and a half float).
        let body = [0x80u8, 2, 60 | 0x80, 7, 61 | 0xC0, 0x00, 0x3C];
        let preset = decode(&code_from_records("", &body)).unwrap();
        assert_eq!(preset.skipped, 2);
        assert_eq!(preset.settings.stage, 2);
    }

    #[test]
    fn a_duplicate_record_id_is_rejected() {
        assert_eq!(
            decode(&code_from_records("", &[0x80, 2, 0x80, 3])),
            Err(DecodeError::Damaged)
        );
        // Even a repeated unknown id is a duplicate.
        assert_eq!(
            decode(&code_from_records("", &[60 | 0x80, 7, 60 | 0x80, 8])),
            Err(DecodeError::Damaged)
        );
    }

    #[test]
    fn a_record_kind_that_does_not_match_the_field_is_rejected() {
        // stage is a choice but arrives as a half float; a bool arrives as a byte; a real arrives as a byte.
        for body in [
            vec![0xC0u8, 0x00, 0x3C],
            vec![5u8 | 0x80, 1],
            vec![4u8 | 0x80, 100],
        ] {
            assert_eq!(
                decode(&code_from_records("", &body)),
                Err(DecodeError::Damaged),
                "{body:?}"
            );
        }
        // A non-finite half float is refused.
        assert_eq!(
            decode(&code_from_records("", &[4 | 0xC0, 0x00, 0x7C])),
            Err(DecodeError::Damaged)
        );
    }

    #[test]
    fn a_newer_format_is_reported_as_newer() {
        let mut bytes = vec![FORMAT + 1, 0];
        let crc = crc32(&bytes);
        bytes.extend_from_slice(&crc.to_le_bytes());
        let code = format!("{PREFIX}{}", base32(&bytes));
        assert_eq!(decode(&code), Err(DecodeError::Newer));
    }

    #[test]
    fn half_floats_round_to_nearest_even() {
        let cases = [
            (1.0f32, 0x3C00u16),
            (0.5, 0x3800),
            (2.0, 0x4000),
            (-1.0, 0xBC00),
            (0.0, 0x0000),
            (-0.0, 0x8000),
            // Halfway ties go to the even mantissa.
            (1.00048828125, 0x3C00),
            (1.00146484375, 0x3C02),
            (65504.0, 0x7BFF),
            (65536.0, 0x7C00),
            (f32::INFINITY, 0x7C00),
            (f32::NAN, 0x7E00),
        ];
        for (value, half) in cases {
            assert_eq!(to_half(value), half, "to_half({value})");
        }
        assert_eq!(to_half(2.0f32.powi(-25)), 0x0000);
        assert_eq!(to_half(3.0 * 2.0f32.powi(-26)), 0x0001);
        assert_eq!(from_half(0x3C00), 1.0);
        assert_eq!(from_half(0x0001), 2.0f32.powi(-24));
        assert!(from_half(0x7C00).is_infinite());
        assert!(from_half(0x7E00).is_nan());

        // Every non-NaN half survives a round trip through f32 unchanged.
        for half in 0u16..=0xFFFF {
            if half & 0x7C00 == 0x7C00 {
                continue;
            }
            assert_eq!(to_half(from_half(half)), half, "half {half:#06x}");
        }
    }

    #[test]
    fn base32_rejects_leftover_bits_and_stray_characters() {
        assert_eq!(from_base32("00"), Some(vec![0]));
        assert_eq!(from_base32("0-0"), Some(vec![0]));
        // "01" leaves a non-zero remainder; "000" leaves five bits, a whole code never does.
        assert_eq!(from_base32("01"), None);
        assert_eq!(from_base32("000"), None);
        assert_eq!(from_base32("U"), None);
        assert_eq!(base32_value(b'O'), 0);
        assert_eq!(base32_value(b'I'), 1);
        assert_eq!(base32_value(b'L'), 1);
        assert_eq!(base32_value(b'o'), 0);
        assert_eq!(base32_value(b'l'), 1);
        assert_eq!(from_base32("OO"), from_base32("00"));

        for bytes in [vec![], vec![0], vec![255], vec![1, 2, 3, 4, 5], vec![0xAB; 40]] {
            assert_eq!(from_base32(&base32(&bytes)), Some(bytes.clone()));
        }
    }

    #[test]
    fn clean_name_collapses_trims_and_cuts_on_a_boundary() {
        assert_eq!(clean_name("  Night  look  "), "Night  look");
        assert_eq!(clean_name("a##b"), "a#b");
        assert_eq!(clean_name("a###b"), "a#b");
        assert_eq!(clean_name("a\x01b\x7Fc"), "abc");
        assert_eq!(clean_name("   "), "");
        assert_eq!(clean_name(&"a".repeat(60)), "a".repeat(48));
        // A two-byte character is cut whole, not in half.
        let wide = "\u{e9}".repeat(30);
        let clean = clean_name(&wide);
        assert_eq!(clean.len(), 48);
        assert_eq!(clean.chars().count(), 24);
    }

    #[test]
    fn the_store_keeps_unreadable_lines_and_header_comments() {
        let good = encode(&Settings::default(), "keep");
        let content = format!("# user note\r\n\r\n{good}\r\nDLSS5-!!!\r\nplain junk\r\n");
        let entries = parse_store(content.as_bytes());
        // The readable code plus the two unreadable lines; comments and blanks are not entries.
        assert_eq!(entries.len(), 3);
        assert_eq!(readable_count(&entries), 1);

        let text = String::from_utf8(write_store(&entries)).unwrap();
        assert!(text.starts_with(
            "# MFG Unlocker DLSS 5 presets: one code per line, in the menu's order.\r\n"
        ));
        assert!(text.contains("# Share a line with others; they import it under DLSS 5, Presets.\r\n"));
        assert!(text.contains(&format!("{good}\r\n")));
        assert!(text.contains("DLSS5-!!!\r\n"));
        assert!(text.contains("plain junk\r\n"));
        assert_eq!(text.matches('\n').count(), text.matches("\r\n").count());
    }

    #[test]
    fn unique_name_adds_suffixes() {
        let mut entries = Vec::new();
        assert_eq!(unique_name(&entries, "Night"), "Night");
        entries.push(entry_named("Night"));
        assert_eq!(unique_name(&entries, "Night"), "Night (2)");
        entries.push(entry_named("Night (2)"));
        assert_eq!(unique_name(&entries, "Night"), "Night (3)");
        // Case does not make a new name; the suffix keeps the case that was typed.
        assert_eq!(unique_name(&entries, "night"), "night (3)");

        // A full-length name is shortened to fit the suffix.
        let long = "a".repeat(48);
        let entries = vec![entry_named(&long)];
        let candidate = unique_name(&entries, &long);
        assert_eq!(candidate.len(), 48);
        assert!(candidate.ends_with(" (2)"));
    }

    #[test]
    fn sanitize_clamps_out_of_range_and_non_finite_values() {
        let mut settings = Settings::default();
        settings.intensity = 5.0;
        settings.structure = -3.0;
        settings.diffuse_white = f32::NAN;
        settings.scale = f32::INFINITY;
        settings.encoding = 9;
        settings.stage = 7;
        settings.passes = 99;
        settings.halo_radius = 9;
        settings.compare_key = 0x1B;
        settings.reconstruction = 2;
        settings.character = -5.0;
        settings.knee = 0.1;
        settings.adaptive_target = 9.0;
        settings.defaults_version = 9;
        let fixed = sanitize(settings);
        assert_eq!(fixed.intensity, 1.0);
        assert_eq!(fixed.structure, 0.0);
        assert_eq!(fixed.diffuse_white, 100.0);
        assert_eq!(fixed.scale, 100.0);
        assert_eq!(fixed.encoding, 0);
        assert_eq!(fixed.stage, 0);
        assert_eq!(fixed.passes, 10);
        assert_eq!(fixed.halo_radius, 4);
        assert_eq!(fixed.compare_key, 0);
        assert_eq!(fixed.reconstruction, 0);
        assert_eq!(fixed.character, -1.0);
        assert_eq!(fixed.knee, 0.5);
        assert_eq!(fixed.adaptive_target, 0.5);
        // The defaults generation is left as it is.
        assert_eq!(fixed.defaults_version, 9);

        let mut low = Settings::default();
        low.passes = 0;
        low.halo_radius = 0;
        let fixed = sanitize(low);
        assert_eq!(fixed.passes, 1);
        assert_eq!(fixed.halo_radius, 1);
    }

    #[test]
    fn import_applies_enables_and_saves_a_line() {
        let game = scratch("import");
        std::fs::write(
            game.join(CONTROL_FILE),
            "{\"multiplier\":3,\"dlss5\":false}",
        )
        .unwrap();

        let code = encode(&sample_look(), "Shared");
        let info = import(&game, &format!("try this {code} cheers")).unwrap();
        assert_eq!(info.name, "Shared");

        let text = std::fs::read_to_string(game.join(CONTROL_FILE)).unwrap();
        let control: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(control["dlss5"], true);
        assert_eq!(control["dlss5HookStage"], 2);
        assert_eq!(control["dlss5OverallIntensity"].as_f64(), Some(0.5));
        assert_eq!(control["dlss5StructureIntensity"].as_f64(), Some(1.5));
        assert_eq!(control["multiplier"], 3);

        let listed = presets(&game).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Shared");
        assert_eq!(listed[0].code, info.code);
        let store = std::fs::read_to_string(game.join(STORE_FILE)).unwrap();
        assert!(store.contains(&info.code));
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn save_delete_and_export_use_the_store() {
        let game = scratch("store");
        std::fs::write(
            game.join(CONTROL_FILE),
            "{\"dlss5\":true,\"dlss5OverallIntensity\":0.5}",
        )
        .unwrap();

        let first = save_preset(&game, "Night").unwrap();
        let second = save_preset(&game, "night").unwrap();
        assert_eq!(first.name, "Night");
        assert_eq!(second.name, "night (2)");
        assert_eq!(presets(&game).unwrap().len(), 2);

        // Export carries the current look with an empty name.
        let exported = export_code(&game).unwrap();
        let preset = decode(&exported).unwrap();
        assert_eq!(preset.name, "");
        assert_eq!(preset.settings.intensity, 0.5);

        delete_preset(&game, "NIGHT").unwrap();
        let listed = presets(&game).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "night (2)");
        assert!(delete_preset(&game, "gone").is_err());
        let _ = std::fs::remove_dir_all(&game);
    }

    #[test]
    fn a_full_store_refuses_more_presets() {
        let game = scratch("full");
        let mut entries = Vec::new();
        for index in 0..MAX_PRESETS {
            entries.push(entry_named(&format!("p{index}")));
        }
        save_store(&game, &entries).unwrap();
        assert!(save_preset(&game, "one more").is_err());
        assert!(import(&game, &encode(&Settings::default(), "x")).is_err());
        let _ = std::fs::remove_dir_all(&game);
    }
}
