use std::process::Command;

fn git_cmd() -> Command {
    let cmd = Command::new("git");
    // On Unix, prepend Homebrew paths to find git installed via Homebrew.
    // On Windows, PATH is already correct — no extra dirs needed.
    #[cfg(unix)]
    let cmd = {
        let mut c = cmd;
        if let Ok(path) = std::env::var("PATH") {
            c.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{path}"));
        }
        c
    };
    cmd
}

pub fn get_current_branch() -> Option<String> {
    let output = git_cmd()
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        None
    } else {
        Some(branch)
    }
}
