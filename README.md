# Band Side Panel

A macOS launcher for projects and their git worktrees, with IDE-window
focus management.

The side panel pins to the left or right edge of your screen at full
height. Click a project to expand its worktrees; click a worktree to
focus the IDE windows configured for it. The currently-focused worktree
is highlighted automatically — the panel watches the frontmost macOS
window in the background.

## Requirements

- macOS 13+ (Apple Silicon or Intel)
- Node.js 22+ + pnpm 10+
- Rust toolchain (rustfmt, clippy)

## Develop

```sh
pnpm install
pnpm tauri:dev          # spawns vite + tauri
```

## Build

```sh
pnpm tauri:build        # produces a .app + .dmg under src-tauri/target/release/bundle/
```

## Layout

```
/
├── src-tauri/                     # Rust crate (Tauri 2, macOS-only)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs / lib.rs
│       ├── store.rs               # JSON-backed ~/.band-sidepanel/settings.json
│       ├── window_pinning.rs      # snap-to-edge geometry
│       ├── worktrees.rs           # git worktree list --porcelain
│       └── commands/              # Tauri command handlers
│           ├── window_focus.rs    # workspace detection + polling
│           ├── window_dialogs.rs  # pick_folder, reveal_in_finder, ...
│           ├── ax_windows.rs      # macOS Accessibility FFI
│           ├── window_manager.rs  # IDE-window registry
│           ├── apps/mod.rs        # IDE preset registry + layout engine
│           ├── projects.rs        # list/add/remove project
│           ├── worktrees.rs       # list_worktrees command
│           └── settings.rs        # get/update_settings
├── src/                           # React frontend
│   ├── App.tsx / main.tsx / styles.css
│   ├── api/tauri.ts               # typed invoke() wrapper
│   └── components/                # ProjectList, WorktreeList, AddProjectButton, Settings
├── extensions/vscode/             # VS Code / Cursor companion extension
│   ├── package.json               # manifest only — deps live at the root
│   ├── tsconfig.json
│   └── src/                       # config.ts, extension.ts, workspace-setup.ts
├── index.html
├── package.json / vite.config.ts / tsconfig.json
└── .github/workflows/             # mac-only build + release
```

## Settings

`~/.band-sidepanel/settings.json` is the source of truth:

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

Worktrees are **not** persisted — they're discovered live by running
`git worktree list --porcelain` against each project's path.

## VS Code companion extension

`extensions/vscode/` is a companion extension that auto-creates terminals
defined in `.band/config.json` when a worktree opens in VS Code or Cursor.
It's bundled into the .app via `src-tauri/tauri.conf.json#bundle.resources`,
so it ships with the side panel and doesn't need a separate install.

```sh
pnpm build:extension     # esbuild → extensions/vscode/dist/extension.js
pnpm tauri:build         # runs build:extension first, then tauri build
```

## License

MIT — see [LICENSE](./LICENSE).
