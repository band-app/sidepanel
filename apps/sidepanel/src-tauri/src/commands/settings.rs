//! Settings read/write commands. Mirror the JSON shape on disk, minus the
//! `extra` flatten field, so the frontend gets a stable schema.

use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::state::FocusManagementState;
use crate::store::{self, WindowSettings};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicSettings {
    pub window: WindowSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSettingsPatch {
    pub edge: Option<String>,
    pub width: Option<f64>,
    pub focus_polling: Option<bool>,
}

#[tauri::command]
pub fn get_settings() -> Result<PublicSettings, String> {
    let s = store::load();
    Ok(PublicSettings { window: s.window })
}

#[tauri::command]
pub fn update_settings(
    window: WindowSettingsPatch,
    focus_state: tauri::State<'_, FocusManagementState>,
) -> Result<PublicSettings, String> {
    let s = store::update(|s| {
        if let Some(edge) = window.edge {
            s.window.edge = edge;
        }
        if let Some(width) = window.width {
            s.window.width = width;
        }
        if let Some(fp) = window.focus_polling {
            s.window.focus_polling = fp;
            focus_state.0.store(fp, Ordering::SeqCst);
        }
    })?;
    Ok(PublicSettings { window: s.window })
}
