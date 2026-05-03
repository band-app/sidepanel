//! Worktree discovery — runs `git worktree list --porcelain` for a project.
//!
//! No caching at this layer; the focus-polling thread caches the resulting
//! `AppState` separately. Each call shells out to git.

use std::path::PathBuf;

use crate::git::git_cmd;
use crate::state::WorktreeState;

/// List all worktrees of the repository at `project_path`.
///
/// Returns one entry per `git worktree list --porcelain` block. Bare and
/// detached worktrees are skipped.
pub fn list(project_path: &str) -> Result<Vec<WorktreeState>, String> {
    let path = PathBuf::from(project_path);
    if !path.exists() {
        return Err(format!("project path does not exist: {project_path}"));
    }

    let output = git_cmd()
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse(&stdout))
}

fn parse(porcelain: &str) -> Vec<WorktreeState> {
    let mut out = Vec::new();
    let mut cur_path: Option<String> = None;
    let mut cur_head: Option<String> = None;
    let mut cur_branch: Option<String> = None;
    let mut detached = false;

    for line in porcelain.lines() {
        if line.is_empty() {
            // Block separator. Emit if we have a branch + path and not detached.
            if let (Some(path), Some(branch)) = (cur_path.take(), cur_branch.take()) {
                if !detached {
                    out.push(WorktreeState {
                        branch,
                        path,
                        head: cur_head.take(),
                    });
                }
            }
            cur_head = None;
            detached = false;
            continue;
        }
        if let Some(rest) = line.strip_prefix("worktree ") {
            cur_path = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("HEAD ") {
            cur_head = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("branch ") {
            // `branch refs/heads/foo` -> `foo`
            let branch = rest.strip_prefix("refs/heads/").unwrap_or(rest).to_string();
            cur_branch = Some(branch);
        } else if line == "detached" {
            detached = true;
        } else if line == "bare" {
            detached = true; // skip bare worktrees too
        }
    }

    // Trailing block (porcelain output may not end with a blank line).
    if let (Some(path), Some(branch)) = (cur_path, cur_branch) {
        if !detached {
            out.push(WorktreeState {
                branch,
                path,
                head: cur_head,
            });
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_porcelain() {
        let s = "\
worktree /home/u/proj
HEAD abc123
branch refs/heads/main

worktree /home/u/proj/wt/foo
HEAD def456
branch refs/heads/feature/foo

worktree /home/u/proj/wt/detached
HEAD 000000
detached
";
        let wts = parse(s);
        assert_eq!(wts.len(), 2);
        assert_eq!(wts[0].branch, "main");
        assert_eq!(wts[0].path, "/home/u/proj");
        assert_eq!(wts[1].branch, "feature/foo");
    }
}
