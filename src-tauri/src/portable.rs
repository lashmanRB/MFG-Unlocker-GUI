use std::path::PathBuf;

// The app keeps everything next to its own executable so a folder copy carries
// the whole state along. Nothing is written to AppData or the registry.
pub fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| format!("cannot find the app folder: {error}"))?;
    exe.parent()
        .map(|folder| folder.to_path_buf())
        .ok_or_else(|| "the app has no folder".to_string())
}

pub fn data_dir() -> Result<PathBuf, String> {
    let dir = exe_dir()?.join("data");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    Ok(dir)
}

pub fn webview_dir() -> Option<PathBuf> {
    let dir = exe_dir().ok()?.join("data").join("webview");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_sits_in_the_app_folder() {
        let exe = exe_dir().expect("an app folder");
        let data = data_dir().expect("a data folder");
        assert_eq!(data, exe.join("data"));
        assert!(data.is_dir());
    }
}
