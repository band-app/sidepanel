//! Project CRUD — backed by `~/.band-sidepanel/settings.json`.

use std::path::Path;

use crate::store::{self, Project};

#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    Ok(store::load().projects)
}

/// Add a project by absolute path. Generates a stable ID from the path.
/// Idempotent: re-adding the same path returns the existing project.
#[tauri::command]
pub fn add_project(path: String) -> Result<Project, String> {
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Err(format!("path must be absolute: {path}"));
    }
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    if !p.join(".git").exists() {
        return Err(format!("not a git repository: {path}"));
    }

    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project")
        .to_string();
    let id = project_id_from_path(&path);

    let settings = store::update(|s| {
        if !s.projects.iter().any(|p| p.id == id) {
            s.projects.push(Project {
                id: id.clone(),
                name: name.clone(),
                path: path.clone(),
            });
        }
    })?;

    settings
        .projects
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "project disappeared after save".to_string())
}

#[tauri::command]
pub fn remove_project(id: String) -> Result<(), String> {
    store::update(|s| {
        s.projects.retain(|p| p.id != id);
    })?;
    Ok(())
}

/// Stable, filesystem-derived project ID. Lower-cased, with non-alphanum
/// characters mapped to `-`. Collisions are theoretically possible but
/// rare for sane project layouts; the side panel doesn't need cryptographic
/// uniqueness.
fn project_id_from_path(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    let last = trimmed.rsplit('/').next().unwrap_or(trimmed);
    let slug: String = last
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let hash = simple_hash(path);
    format!("{slug}-{hash:x}")
}

fn simple_hash(s: &str) -> u32 {
    // FNV-1a; not cryptographic, just for ID disambiguation.
    let mut h: u32 = 0x811c_9dc5;
    for b in s.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}
