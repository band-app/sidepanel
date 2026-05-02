//! User-facing macOS dialog commands: folder picker, "reveal in Finder",
//! checking installed apps, and `open -a` launching.
//!
//! Lifted from `apps/dashboard/src-tauri/src/commands/ide.rs`. `install_cli`
//! is intentionally not ported — the side panel does not ship a CLI.

#[tauri::command]
pub fn pick_folder() -> Result<Option<String>, String> {
    let output = std::process::Command::new("osascript")
        .args([
            "-e",
            r#"set theFolder to choose folder with prompt "Select a git repository"
return POSIX path of theFolder"#,
        ])
        .output()
        .map_err(|e| format!("Failed to open folder picker: {e}"))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .output()
        .map_err(|e| format!("Failed to open Finder: {e}"))?;
    Ok(())
}

/// Check whether a macOS application is installed by looking in common
/// locations (`/Applications`, `/System/Applications`, `~/Applications`)
/// and falling back to `which` for CLI tools.
#[tauri::command]
pub fn check_app_exists(app_name: String) -> bool {
    let mut locations = vec![
        format!("/Applications/{app_name}.app"),
        format!("/System/Applications/{app_name}.app"),
    ];

    if let Ok(home) = std::env::var("HOME") {
        locations.push(format!("{home}/Applications/{app_name}.app"));
    }

    for location in &locations {
        if std::path::Path::new(location).exists() {
            return true;
        }
    }

    std::process::Command::new("which")
        .arg(&app_name)
        .output()
        .is_ok_and(|output| output.status.success())
}

/// Open a path with a specific macOS application (`open -a`).
#[tauri::command]
pub fn open_with_app(path: String, app_name: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-a")
        .arg(&app_name)
        .arg(&path)
        .output()
        .map_err(|e| format!("Failed to open with {app_name}: {e}"))?;
    Ok(())
}
