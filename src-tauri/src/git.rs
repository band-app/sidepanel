use std::process::Command;

/// Build a `git` Command with PATH augmented for Homebrew so the binary
/// can find `git` when launched from Finder (where PATH is minimal).
pub fn git_cmd() -> Command {
    let mut cmd = Command::new("git");
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{path}"));
    }
    cmd
}
