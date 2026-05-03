//! Settings read/write commands. Mirror the JSON shape on disk, minus the
//! `extra` flatten field, so the frontend gets a stable schema.

use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::state::FocusManagementState;
use crate::store::{self, WindowSettings};
use crate::window_pinning;

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
    app_handle: tauri::AppHandle,
    focus_state: tauri::State<'_, FocusManagementState>,
) -> Result<PublicSettings, String> {
    let edge_changed = window.edge.is_some();
    let width_changed = window.width.is_some();

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

    // Re-pin only when the geometry actually changed. The pinning helper
    // clamps width to MIN_WIDTH; if clamping kicked in, persist the clamped
    // value so the store and the actual window agree.
    if edge_changed || width_changed {
        if let Some(applied_width) =
            window_pinning::pin_main(&app_handle, &s.window.edge, s.window.width)
        {
            if (applied_width - s.window.width).abs() > f64::EPSILON {
                let s2 = store::update(|s| {
                    s.window.width = applied_width;
                })?;
                return Ok(PublicSettings { window: s2.window });
            }
        }
    }

    Ok(PublicSettings { window: s.window })
}
