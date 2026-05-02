# Band Side Panel

A macOS launcher for projects and their git worktrees, with IDE-window
focus management. Single Tauri app — no monorepo.

## Repo layout

```
/
├── src-tauri/                     # Rust crate (Tauri 2, macOS-only)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs / lib.rs
│       ├── store.rs               # ~/.band-sidepanel/settings.json
│       ├── window_pinning.rs      # snap-to-edge geometry
│       ├── worktrees.rs           # git worktree list --porcelain
│       └── commands/              # Tauri command handlers
├── src/                           # React frontend
│   ├── App.tsx / main.tsx / styles.css
│   ├── api/tauri.ts               # typed invoke() wrapper
│   └── components/                # ProjectList, WorktreeList, Settings, ...
├── index.html
├── package.json / vite.config.ts / tsconfig.json
└── .github/workflows/             # mac-only build + release
```

## Testing strategy

The repo uses **integration tests over the real Tauri binary / real
filesystem**. No unit tests with mocked dependencies.

### Rules

- **Never modify production code to make a test pass.** No test-only
  branches, no exporting internals, no `NODE_ENV` checks in business logic.
- **Black-box.** Test through public interfaces: Tauri invoke commands,
  CLI binaries, file system outputs.
- **Real infrastructure.** Use temp dirs for the JSON store, real `git`
  for worktree discovery, real macOS APIs for window detection.
- **Rust built-in test runner.** Use `cargo test`. The existing
  `worktrees::tests::parses_basic_porcelain` is a model.

## Git Hooks

`.husky/pre-push` runs `biome check`, `cargo fmt --check`,
`cargo clippy -D warnings`, and `cargo test` against `src-tauri/`.
**Never bypass git hooks** — no `--no-verify`. If a hook fails, fix the
underlying issue.

## Settings

`~/.band-sidepanel/settings.json` is the source of truth for the user's
project list and window preferences. Worktrees are discovered live via
`git worktree list --porcelain`, never persisted.

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

## Architectural constraint: macOS-only, no web server

The side panel is a desktop launcher. It **does not** run a Node.js
server, host an HTTP API, or open any sockets. Window management
(focus polling, snap-to-edge, IDE-window raising) is the Tauri app's
responsibility — there is no other process.
