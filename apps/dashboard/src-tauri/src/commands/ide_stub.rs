//! Stub implementations of the IDE commands for non-macOS platforms.
//! The real implementation lives in `ide.rs` and uses macOS-specific APIs.
//! On Windows, `pick_folder` and `reveal_in_finder` use native commands.

use crate::state::{ActiveWorkspaceState, ProjectCache};

pub fn start_focus_polling(_app_handle: tauri::AppHandle) {}

pub fn raise_workspace_windows(_workspace_id: &str, _cache: &ProjectCache) {}

#[tauri::command]
pub fn workspace_focus(
    _workspace_id: String,
    _active_state: tauri::State<'_, ActiveWorkspaceState>,
    _project_cache: tauri::State<'_, ProjectCache>,
) -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

#[tauri::command]
pub fn workspace_close(
    _workspace_id: String,
    _project_cache: tauri::State<'_, ProjectCache>,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn get_active_workspace(
    _active_state: tauri::State<'_, ActiveWorkspaceState>,
) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub fn detect_active_workspace(
    _active_state: tauri::State<'_, ActiveWorkspaceState>,
    _project_cache: tauri::State<'_, ProjectCache>,
) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub fn pick_folder() -> Result<Option<String>, String> {
    // Use the Tauri dialog plugin via rfd (native file dialog) on non-macOS.
    // Since we can't use the async Tauri dialog API in a synchronous command,
    // fall back to a native command approach.
    #[cfg(target_os = "windows")]
    {
        // Use PowerShell to show a native folder picker dialog
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton = $true; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath } else { '' }",
            ])
            .output()
            .map_err(|e| format!("Failed to open folder dialog: {e}"))?;

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported on this platform".to_string())
    }
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Use explorer.exe to open the folder
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {e}"))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // Use xdg-open to open the folder
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = path;
        Err("Not supported on this platform".to_string())
    }
}
