//! First-run defaults — pick an installed IDE and seed
//! `~/.band-sidepanel/settings.json` with a minimal `defaults.apps` block so
//! the very first `workspace_focus` succeeds without the user having to write
//! a `.band-sidepanel/config.json` by hand.
//!
//! The seeding is idempotent: if the user has already set `defaults` (even to
//! an empty value), we leave it alone. Detection runs every startup but is
//! cheap (a handful of `stat()` calls) and the write only happens once.

use serde_json::json;

use crate::store;

use super::apps;

/// Ensure `settings.json#defaults.apps` is non-empty whenever we can detect an
/// installed editor on the user's machine.
///
/// Behavior:
/// - If `defaults` is already set in settings.json, do nothing — respects any
///   user customization, including an explicit `{ apps: [] }` to opt out.
/// - Otherwise, walk `apps::EDITOR_PRIORITY`, pick the first one that's
///   installed, and write `{ defaults: { apps: [{ type: <slug> }] } }`.
/// - If no known editor is installed, do nothing — `workspace_focus` will
///   still surface its existing "no apps configured" error and the user can
///   either install an editor or hand-write a config.
pub fn ensure_first_run_defaults() {
    let mut settings = store::load();

    if settings.extra.contains_key("defaults") {
        return;
    }

    let Some(editor) = apps::detect_default_editor() else {
        return;
    };

    settings.extra.insert(
        "defaults".to_string(),
        json!({
            "apps": [
                { "type": editor.app_type }
            ]
        }),
    );

    if let Err(e) = store::save(&settings) {
        eprintln!("[sidepanel] failed to seed first-run defaults: {e}");
    }
}
