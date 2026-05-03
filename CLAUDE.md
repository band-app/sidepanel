# Sidepanel

A macOS launcher for projects and their git worktrees, with IDE-window
focus management. Single Tauri app — no monorepo.

## Repo layout

```
/
├── src-tauri/                     # Rust crate (Tauri 2, macOS-only)
│   ├── Cargo.toml
│   ├── tauri.conf.json            # bundle.resources picks up the extension
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
├── extensions/vscode/             # VS Code companion extension
│   ├── package.json               # manifest only — deps live at root
│   ├── tsconfig.json
│   └── src/                       # config.ts, extension.ts, workspace-setup.ts
├── index.html
├── package.json / vite.config.ts / tsconfig.json
└── .github/workflows/             # mac-only build + release
```

## VS Code extension

`extensions/vscode/` is a companion extension that auto-creates terminals
from `.band-sidepanel/config.json` when a worktree opens in VS Code or Cursor. Build
deps (esbuild, @types/vscode, etc.) are declared at the **repo root** —
the extension's own `package.json` is a manifest only (no scripts, no
devDependencies). This keeps a single `node_modules` for the whole repo.

Build pipeline:

- `pnpm build:extension` — esbuild bundles `extensions/vscode/src/extension.ts`
  into `extensions/vscode/dist/extension.js`.
- `pnpm tauri:build` runs `build:extension` first, then `tauri build`.
- `src-tauri/tauri.conf.json#bundle.resources` ships
  `extensions/vscode/dist/extension.js` + `extensions/vscode/package.json`
  inside the .app bundle at `Contents/Resources/extensions/sidepanel/`.

The extension reads `~/.band-sidepanel/settings.json` for the project list
and the optional top-level `defaults` key (per-project app/terminal
defaults).

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
