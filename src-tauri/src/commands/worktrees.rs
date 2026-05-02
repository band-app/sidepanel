//! `list_worktrees` Tauri command — runs `git worktree list --porcelain`
//! against the project's path. No caching at this layer.

use crate::state::WorktreeState;
use crate::store;
use crate::worktrees;

#[tauri::command]
pub fn list_worktrees(project_id: String) -> Result<Vec<WorktreeState>, String> {
    let project = store::load()
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("project not found: {project_id}"))?;
    worktrees::list(&project.path)
}
