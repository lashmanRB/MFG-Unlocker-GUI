use crate::gamedir;
use crate::model::{CompatReport, GpuInfo};
use std::path::Path;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
use winreg::RegKey;

const GPU_CLASS: &str = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

pub fn classify(game_dir: &Path, exe_dir: Option<&Path>) -> CompatReport {
    let work_dir = exe_dir.unwrap_or(game_dir);
    let probe = gamedir::probe_dlls(work_dir);
    let mut notes = Vec::new();

    let state = match (probe.frame_gen, probe.streamline) {
        (true, true) => "supported",
        (true, false) => {
            notes.push("Frame generation files are present but no Streamline interposer was found. The mod usually still attaches.".into());
            "likely"
        }
        (false, true) => {
            notes.push("Streamline is present without a DLSS frame generation plug-in. Frame Generation has to come from the game or from an NVIDIA app override.".into());
            "no-frame-gen"
        }
        (false, false) => {
            notes.push("No DLSS files beside the executable. The game may still receive Frame Generation through an NVIDIA app override.".into());
            "unknown"
        }
    };

    if probe.super_res && !probe.frame_gen {
        notes.push("DLSS Super Resolution files found, Frame Generation was not.".into());
    }
    if probe.optiscaler {
        notes.push("OptiScaler is installed here. Install MFG Unlocker as an OptiScaler plug-in (MFGUnlocker.asi) instead of a proxy DLL.".into());
    }
    if probe.vulkan {
        notes.push("A Vulkan runtime file sits beside the executable. Vulkan games may not load DirectX proxy DLL names.".into());
    }

    CompatReport {
        state: state.to_string(),
        has_frame_gen: probe.frame_gen,
        has_streamline: probe.streamline,
        has_super_res: probe.super_res,
        has_vulkan: probe.vulkan,
        has_opti_scaler: probe.optiscaler,
        notes,
    }
}

pub fn gpu() -> GpuInfo {
    let names = registry_gpu_names();
    let chosen = names
        .iter()
        .find(|name| name.to_ascii_uppercase().contains("NVIDIA"))
        .or_else(|| names.first());

    match chosen {
        Some(name) => describe_gpu(name),
        None => describe_gpu(""),
    }
}

fn describe_gpu(name: &str) -> GpuInfo {
    let upper = name.to_ascii_uppercase();
    let (family, max_multiplier) = if upper.contains("RTX 50") {
        ("blackwell", 6)
    } else if upper.contains("RTX 40") {
        ("ada", 6)
    } else if upper.contains("RTX 30") {
        ("ampere", 6)
    } else if upper.contains("RTX 20") {
        ("turing", 6)
    } else if upper.contains("NVIDIA") {
        ("other", 0)
    } else if name.is_empty() {
        ("unknown", 0)
    } else {
        ("other", 0)
    };

    GpuInfo {
        name: name.to_string(),
        family: family.to_string(),
        max_multiplier,
    }
}

fn registry_gpu_names() -> Vec<String> {
    let mut names = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(class) = hklm.open_subkey_with_flags(GPU_CLASS, KEY_READ | KEY_WOW64_64KEY) else {
        return names;
    };

    for index in class.enum_keys().flatten() {
        if index.len() != 4 || !index.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let Ok(sub) = class.open_subkey_with_flags(&index, KEY_READ | KEY_WOW64_64KEY) else {
            continue;
        };
        let Ok(desc) = sub.get_value::<String, _>("DriverDesc") else {
            continue;
        };
        if desc.trim().is_empty() {
            continue;
        }
        names.push(desc);
    }

    names
}

#[cfg(test)]
mod tests {
    use super::describe_gpu;

    #[test]
    fn families_follow_the_card_name() {
        assert_eq!(describe_gpu("NVIDIA GeForce RTX 4080").family, "ada");
        assert_eq!(describe_gpu("NVIDIA GeForce RTX 3080 Ti").family, "ampere");
        assert_eq!(describe_gpu("NVIDIA GeForce RTX 2080").family, "turing");
        assert_eq!(describe_gpu("NVIDIA GeForce RTX 5090").family, "blackwell");
        assert_eq!(describe_gpu("AMD Radeon RX 7900 XTX").family, "other");
        assert_eq!(describe_gpu("").family, "unknown");
    }

    #[test]
    fn only_dlss_capable_cards_report_a_multiplier() {
        assert_eq!(describe_gpu("NVIDIA GeForce RTX 4070").max_multiplier, 6);
        assert_eq!(describe_gpu("AMD Radeon RX 7800 XT").max_multiplier, 0);
    }
}
