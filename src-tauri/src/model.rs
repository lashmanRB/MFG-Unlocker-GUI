use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExeCandidate {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompatReport {
    pub state: String,
    pub has_frame_gen: bool,
    pub has_streamline: bool,
    pub has_super_res: bool,
    pub has_vulkan: bool,
    pub has_opti_scaler: bool,
    pub has_dlss5: bool,
    pub notes: Vec<String>,
    // NVIDIA's published per title entry: 0 not listed, 2 Frame Generation without
    // an MFG override, 4 and 6 their MFG ceiling.
    pub nvidia_tier: u8,
    pub nvidia_name: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub family: String,
    pub max_multiplier: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviousInstall {
    pub version: Option<String>,
    pub sha256: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallInfo {
    pub dll_name: String,
    pub version: Option<String>,
    pub sha256: String,
    pub bink_backup: Option<String>,
    pub installed_at: u64,
    // The mod build this install replaced, kept aside so an undo can put it back.
    pub previous: Option<PreviousInstall>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameEntry {
    pub id: String,
    pub name: String,
    pub source: String,
    pub app_id: Option<u32>,
    pub install_dir: String,
    pub work_dir: String,
    pub exe_path: Option<String>,
    pub exe_candidates: Vec<ExeCandidate>,
    pub compat: CompatReport,
    pub install: Option<InstallInfo>,
    // Cover art candidates in the order the UI should try them. Newer titles often
    // have no header.jpg, only the hero art.
    pub cover_urls: Vec<String>,
    pub size_on_disk: Option<u64>,
    pub library_path: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SteamLibrary {
    pub path: String,
    pub label: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SteamScan {
    pub steam_path: Option<String>,
    pub libraries: Vec<SteamLibrary>,
    pub games: Vec<GameEntry>,
    pub errors: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub scan: SteamScan,
    pub manual: Vec<GameEntry>,
    pub gpu: GpuInfo,
    // Unix seconds of the NVIDIA game list the reports were matched against.
    pub nvidia_fetched_at: Option<u64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag: String,
    pub name: String,
    pub published_at: String,
    pub asset_name: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub download_url: String,
    pub page_url: String,
    pub cached_version: Option<String>,
    pub cached_dll_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameSettings {
    pub mode: String,
    pub multiplier: u32,
    pub dynamic_target_frame_rate: u32,
    pub dynamic_lock_to_refresh_rate: bool,
    pub dynamic_custom_target_frame_rate: u32,
    pub dlssg_preset: u32,
    pub dlss_sr_preset: u32,
    pub dlss_rr_preset: u32,
    pub vsync_mode: u32,
    pub reflex_frame_limit_fps: u32,
    pub generated_only_debug: bool,
    pub interval_logging: bool,
    pub language: String,
    pub toggle_key: String,
    pub pinned_fps: bool,
    pub layout_scale: String,
    pub rtx30_flip_metering: Option<bool>,
    pub gpu_name_override: bool,
    pub write_log_file: bool,
    pub pinned_latency: bool,
    pub latency_monitor: bool,
    pub latency_probe: bool,
    pub show_note: bool,
    pub keybinds: BTreeMap<String, String>,
    pub opti_scaler_ui: Option<String>,
    pub xemfg_standalone: bool,
    pub xemfg_frames: u32,
    pub xemfg_dynamic: bool,
    pub xemfg_target_fps: u32,
    pub xemfg_rounding: u32,
    pub xemfg_allow1x: bool,
    pub xemfg_target_as_cap: bool,
    pub xemfg_flip_queue: u32,
    pub latency_pacing: u32,
    pub dlss5: bool,
    pub dlss5_hook_stage: u32,
    pub dlss5_model: u32,
    pub dlss5_overall_intensity: f32,
    pub dlss5_structure_intensity: f32,
    pub dlss5_tone_intensity: f32,
    pub dlss5_character_intensity: f32,
    pub dlss5_resolution_scale: f32,
    pub dlss5_resolution_scale_auto: bool,
    pub dlss5_boost: bool,
    pub dlss5_pass_count: u32,
    pub has_control_file: bool,
    pub has_ini_file: bool,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            mode: "follow".into(),
            multiplier: 2,
            dynamic_target_frame_rate: 0,
            dynamic_lock_to_refresh_rate: true,
            dynamic_custom_target_frame_rate: 120,
            dlssg_preset: 0,
            dlss_sr_preset: 0,
            dlss_rr_preset: 0,
            vsync_mode: 0,
            reflex_frame_limit_fps: 0,
            generated_only_debug: false,
            interval_logging: false,
            language: "auto".into(),
            toggle_key: String::new(),
            pinned_fps: false,
            layout_scale: String::new(),
            rtx30_flip_metering: None,
            gpu_name_override: false,
            write_log_file: true,
            pinned_latency: false,
            latency_monitor: true,
            latency_probe: false,
            show_note: true,
            keybinds: BTreeMap::new(),
            opti_scaler_ui: None,
            xemfg_standalone: false,
            xemfg_frames: 2,
            xemfg_dynamic: false,
            xemfg_target_fps: 0,
            xemfg_rounding: 1,
            xemfg_allow1x: false,
            xemfg_target_as_cap: false,
            xemfg_flip_queue: 0,
            latency_pacing: 0,
            dlss5: false,
            dlss5_hook_stage: 0,
            dlss5_model: 0,
            dlss5_overall_intensity: 1.0,
            dlss5_structure_intensity: 1.0,
            dlss5_tone_intensity: 1.0,
            dlss5_character_intensity: -1.0,
            dlss5_resolution_scale: 100.0,
            dlss5_resolution_scale_auto: false,
            dlss5_boost: false,
            dlss5_pass_count: 1,
            has_control_file: false,
            has_ini_file: false,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusSummary {
    pub age_seconds: u64,
    pub pid: u32,
    pub protocol_version: u32,
    pub gpu_family: u32,
    pub graphics_api: u32,
    pub bridge_ready: bool,
    pub game_frame_generation_on: bool,
    pub applied_frame_generation_on: bool,
    pub desired_multiplier: u32,
    pub applied_multiplier: u32,
    pub dynamic_mode: bool,
    pub safe_maximum_multiplier: u32,
    pub nvidia_profile_name: String,
    pub nvidia_tier: u32,
    pub real_fps: f32,
    pub dlss_fps: f32,
    pub last_set_options_result: i32,
    pub patch_route: String,
    pub latency_available: bool,
    pub latency_state: u32,
    pub latency_mean_us: u64,
    pub latency_p99_us: u64,
    pub latency_real_us: u64,
    pub latency_game_us: u64,
    pub latency_fg_us: u64,
    pub latency_display_us: u64,
    pub latency_age_ms: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub modified: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProxyOption {
    pub name: String,
    // free, ours (this app installed it) or bink (the game's own DLL takes the
    // name, so it is moved to "<name>Hooked.dll" and the proxy loads it).
    pub state: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdatedGame {
    pub game_id: String,
    pub name: String,
    pub from: Option<String>,
    pub to: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoUpdateReport {
    pub release: Option<ReleaseInfo>,
    pub downloaded: bool,
    pub updated: Vec<UpdatedGame>,
    pub failed: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub ok: bool,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredGame {
    pub id: String,
    pub name: String,
    pub source: String,
    pub app_id: Option<u32>,
    pub install_dir: String,
    pub exe_path: Option<String>,
    pub dll_name: Option<String>,
    pub version: Option<String>,
    pub sha256: Option<String>,
    pub bink_backup: Option<String>,
    pub installed_at: Option<u64>,
    pub size_on_disk: Option<u64>,
    pub library_path: Option<String>,
    pub previous: Option<PreviousInstall>,
}

impl StoredGame {
    pub fn install_info(&self) -> Option<InstallInfo> {
        let dll_name = self.dll_name.clone()?;
        Some(InstallInfo {
            dll_name,
            version: self.version.clone(),
            sha256: self.sha256.clone().unwrap_or_default(),
            bink_backup: self.bink_backup.clone(),
            installed_at: self.installed_at.unwrap_or(0),
            previous: self.previous.clone(),
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub games: Vec<StoredGame>,
    pub cached_release_dir: Option<String>,
    pub cached_release_tag: Option<String>,
}

pub fn normalize_path(path: &str) -> String {
    path.replace('/', "\\").to_ascii_lowercase()
}

pub const CONTROL_FILE: &str = "RTXMFG-Universal.json";
pub const STATUS_FILE: &str = "RTXMFG-Universal.status.json";
pub const UI_INI: &str = "RTX40MFG-UI.ini";
pub const MOD_DLL_NAME: &str = "MFGUnlocker.dll";
pub const LOG_PREFIX: &str = "RTXMFG";
