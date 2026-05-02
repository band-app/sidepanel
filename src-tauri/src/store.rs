//! JSON-backed settings store at `~/.band-sidepanel/settings.json`.
//!
//! Schema:
//! ```json
//! {
//!   "projects": [{ "id": "...", "name": "...", "path": "..." }],
//!   "window": { "edge": "right", "width": 320, "focusPolling": true }
//! }
//! ```
//!
//! The store is the source of truth for the user's project list and window
//! preferences. Worktrees are *not* persisted — they're discovered live via
//! `git worktree list --porcelain` whenever the frontend asks or the focus
//! polling thread refreshes.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::state::band_home;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSettings {
    /// Which screen edge the panel is pinned to. `"left"` or `"right"`.
    #[serde(default = "default_edge")]
    pub edge: String,
    /// Persisted panel width in logical pixels.
    #[serde(default = "default_width")]
    pub width: f64,
    /// Whether the background focus-polling thread should run.
    #[serde(default = "default_focus_polling")]
    pub focus_polling: bool,
}

fn default_edge() -> String {
    "right".to_string()
}

fn default_width() -> f64 {
    320.0
}

fn default_focus_polling() -> bool {
    true
}

impl Default for WindowSettings {
    fn default() -> Self {
        Self {
            edge: default_edge(),
            width: default_width(),
            focus_polling: default_focus_polling(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub window: WindowSettings,
    /// Extra fields not explicitly modeled (e.g. user-defined app definitions
    /// under `apps.definitions`, consumed by `commands::apps`).
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn settings_file() -> PathBuf {
    band_home().join("settings.json")
}

/// Load settings from disk, returning defaults if the file doesn't exist.
pub fn load() -> Settings {
    let path = settings_file();
    if !path.exists() {
        return Settings::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

/// Persist settings to disk, creating `~/.band-sidepanel/` if needed.
pub fn save(settings: &Settings) -> Result<(), String> {
    let dir = band_home();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    let data = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(settings_file(), format!("{data}\n"))
        .map_err(|e| format!("Failed to write settings: {e}"))?;
    Ok(())
}

/// Mutate settings via a closure, then persist.
pub fn update<F>(f: F) -> Result<Settings, String>
where
    F: FnOnce(&mut Settings),
{
    let mut s = load();
    f(&mut s);
    save(&s)?;
    Ok(s)
}
