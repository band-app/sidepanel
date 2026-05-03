//! Tauri command modules. The side panel is macOS-only (see top-level
//! `compile_error!` in `lib.rs`), so no cfg gating here.

pub mod apps;
pub mod ax_windows;
pub mod defaults;
pub mod projects;
pub mod settings;
pub mod window_dialogs;
pub mod window_focus;
pub mod window_manager;
pub mod worktrees;
