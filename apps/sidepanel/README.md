# Band Side Panel

macOS launcher for projects and their git worktrees, with IDE-window focus
management.

> **WIP — being lifted out of the band-app/band monorepo.**
> See `band-app/sidepanel#1` for the multi-PR plan; this directory will be
> moved to the repo root once the rest of the monorepo is deleted.

## Layout

- `src-tauri/` — Rust crate (Tauri 2). macOS-only.
  - `src/store.rs` — JSON-backed settings at `~/.band-sidepanel/settings.json`.
  - `src/commands/window_focus.rs` — workspace detection, focus polling,
    `workspace_focus` / `workspace_close`.
  - `src/commands/window_dialogs.rs` — folder picker, "reveal in Finder",
    `open -a` launching.
  - `src/commands/{ax_windows,window_manager,apps}` — macOS Accessibility
    APIs, IDE-window registry, app preset registry.
  - `src/commands/{projects,worktrees,settings}.rs` — the side panel's own
    Tauri commands.
- `src/` — React frontend (placeholder in PR 1; real UI lands in PR 2).

## Develop

```sh
pnpm install
pnpm tauri:dev          # spawns vite + tauri
```

## Build

```sh
pnpm tauri:build        # produces a .app + .dmg under src-tauri/target/release/bundle/
```

## Settings

`~/.band-sidepanel/settings.json`:

```json
{
  "projects": [
    { "id": "myproj-…", "name": "myproj", "path": "/Users/me/code/myproj" }
  ],
  "window": {
    "edge": "right",
    "width": 320,
    "focusPolling": true
  }
}
```

Worktrees are *not* persisted — they're discovered live by running
`git worktree list --porcelain` against each project's path.
