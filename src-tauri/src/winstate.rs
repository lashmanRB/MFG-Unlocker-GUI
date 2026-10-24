use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Window};

const STATE_FILE: &str = "window.json";
const MIN_WIDTH: u32 = 640;
const MIN_HEIGHT: u32 = 480;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

fn state_path(data_dir: &Path) -> PathBuf {
    data_dir.join(STATE_FILE)
}

pub fn load(data_dir: &Path) -> Option<WindowState> {
    let text = std::fs::read_to_string(state_path(data_dir)).ok()?;
    let state: WindowState = serde_json::from_str(&text).ok()?;
    if state.width < MIN_WIDTH || state.height < MIN_HEIGHT {
        return None;
    }
    Some(state)
}

pub fn save(data_dir: &Path, state: &WindowState) -> Result<(), String> {
    let text = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(state_path(data_dir), text)
        .map_err(|error| format!("cannot save the window state: {error}"))
}

// A saved corner only counts when it still lands on a monitor that is plugged in
// now, otherwise a laptop that lost its second screen would open off screen.
pub fn on_some_monitor(app: &AppHandle, state: &WindowState) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    for monitor in monitors {
        let scale = monitor.scale_factor();
        let origin = monitor.position().to_logical::<f64>(scale);
        let size = monitor.size().to_logical::<f64>(scale);
        let left = origin.x - 32.0;
        let top = origin.y - 8.0;
        let right = origin.x + size.width;
        let bottom = origin.y + size.height;
        let x = state.x as f64;
        let y = state.y as f64;
        if x >= left && y >= top && x + 160.0 <= right && y + 80.0 <= bottom {
            return true;
        }
    }
    false
}

pub fn read_geometry(window: &Window) -> Option<WindowState> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    if size.width < 1.0 || size.height < 1.0 {
        return None;
    }
    Some(WindowState {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
        width: size.width.round() as u32,
        height: size.height.round() as u32,
        maximized: window.is_maximized().unwrap_or(false),
    })
}

// Windows sends the resize before the window reports itself as maximized, so a
// size that fills its monitor is never the rectangle worth remembering.
pub fn looks_unmaximized(window: &Window, state: &WindowState) -> bool {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return true;
    };
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let wide = state.width as f64 > size.width * 0.92;
    let tall = state.height as f64 > size.height * 0.92;
    !(wide && tall)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("mfg-window-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn a_saved_state_comes_back() {
        let dir = scratch("roundtrip");
        let state = WindowState {
            x: 120,
            y: 80,
            width: 1400,
            height: 900,
            maximized: true,
        };
        save(&dir, &state).unwrap();
        let loaded = load(&dir).expect("state should load");
        assert_eq!(loaded.x, 120);
        assert_eq!(loaded.width, 1400);
        assert!(loaded.maximized);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_broken_or_tiny_state_is_ignored() {
        let dir = scratch("broken");
        std::fs::write(state_path(&dir), "not json").unwrap();
        assert!(load(&dir).is_none());
        std::fs::write(state_path(&dir), "{\"x\":0,\"y\":0,\"width\":100,\"height\":80,\"maximized\":false}").unwrap();
        assert!(load(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
