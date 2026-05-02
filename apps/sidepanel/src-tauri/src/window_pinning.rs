//! Pin the side panel to a screen edge.
//!
//! The window stretches full screen height and is positioned flush against
//! either the left or right edge of the monitor it's currently on. The user's
//! preferred edge + width live in `~/.band-sidepanel/settings.json` and are
//! applied here.
//!
//! Manual drags by the user are tolerated — we don't fight them. The window
//! re-pins next time the edge/width changes via Settings or the app restarts.

use tauri::{LogicalPosition, LogicalSize, Manager, Position, Size, WebviewWindow};

/// Apply edge/width to the given window using its current monitor.
/// Returns the resolved logical width that was actually applied (after clamping).
pub fn pin(window: &WebviewWindow, edge: &str, width: f64) -> f64 {
    // Keep the floor in sync with `tauri.conf.json` -> `windows[0].minWidth`.
    const MIN_WIDTH: f64 = 240.0;
    let clamped_width = width.max(MIN_WIDTH);

    let Ok(Some(monitor)) = window.current_monitor() else {
        return clamped_width;
    };

    let physical_size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let screen_width = f64::from(physical_size.width) / scale_factor;
    let screen_height = f64::from(physical_size.height) / scale_factor;

    // Monitor position in logical coords (multi-monitor setups: the primary's
    // origin isn't always (0, 0)).
    let physical_origin = monitor.position();
    let origin_x = f64::from(physical_origin.x) / scale_factor;
    let origin_y = f64::from(physical_origin.y) / scale_factor;

    let x = match edge {
        "left" => origin_x,
        // "right" or anything we don't recognize falls back to right-pinned.
        _ => origin_x + screen_width - clamped_width,
    };

    let _ = window.set_size(Size::Logical(LogicalSize::new(
        clamped_width,
        screen_height,
    )));
    let _ = window.set_position(Position::Logical(LogicalPosition::new(x, origin_y)));

    clamped_width
}

/// Convenience: pin the `"main"` window of the app handle.
pub fn pin_main(app_handle: &tauri::AppHandle, edge: &str, width: f64) -> Option<f64> {
    app_handle
        .get_webview_window("main")
        .map(|w| pin(&w, edge, width))
}
