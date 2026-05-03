use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

/// `~/.band-sidepanel/` — settings, debug log, window registry all live here.
pub fn band_home() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".band-sidepanel")
}

// --- Project / worktree types used by the focus-management code path. ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub worktrees: Vec<WorktreeState>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorktreeState {
    pub branch: String,
    pub path: String,
    #[serde(default)]
    pub head: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppState {
    pub projects: Vec<ProjectState>,
}

// --- Focus management state (shared flag for runtime mode toggling). ---

/// Tracks whether focus management (polling, window raising) is enabled.
pub struct FocusManagementState(pub Arc<AtomicBool>);

impl FocusManagementState {
    pub fn new(enabled: bool) -> Self {
        Self(Arc::new(AtomicBool::new(enabled)))
    }
}

// --- In-memory active workspace state. ---

pub struct ActiveWorkspaceState(pub Arc<Mutex<Option<String>>>);

impl ActiveWorkspaceState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

// --- Cached project state (refreshed from the JSON store + live `git worktree list`). ---

pub struct CachedState {
    pub app_state: AppState,
}

#[derive(Clone)]
pub struct ProjectCache(Arc<Mutex<Option<CachedState>>>);

impl ProjectCache {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    /// Get a copy of the current cached state, if available.
    pub fn get(&self) -> Option<AppState> {
        self.0.lock().ok()?.as_ref().map(|c| c.app_state.clone())
    }

    /// Update the cached state.
    pub fn set(&self, state: AppState) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = Some(CachedState { app_state: state });
        }
    }
}
