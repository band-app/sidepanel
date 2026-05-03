# Contributing to Sidepanel

Thanks for your interest in contributing!

## Getting Started

### 1. Fork the Repository

Click the **Fork** button on the [GitHub repo](https://github.com/band-app/sidepanel) to create your own copy.

### 2. Clone Your Fork

```bash
git clone https://github.com/<your-username>/sidepanel.git
cd sidepanel
```

### 3. Add the Upstream Remote

```bash
git remote add upstream https://github.com/band-app/sidepanel.git
```

### 4. Install Dependencies

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js dependencies
pnpm install
```

Prerequisites: macOS 13+, Node.js 22+, pnpm 10+, Rust toolchain.

## Making Changes

### 1. Create a Branch

```bash
git fetch upstream
git checkout -b my-feature upstream/main
```

### 2. Make Your Changes

Follow the existing code style — the project uses [Biome](https://biomejs.dev/) for JS/TS/CSS and `cargo fmt` / `cargo clippy` for Rust.

### 3. Run Checks Locally

```bash
pnpm check          # biome + cargo fmt --check + clippy -D warnings
pnpm test           # cargo test
```

### 4. Commit

Use clear, imperative-mood commit messages.

### 5. Push and Open a PR

```bash
git push origin my-feature
```

Open a Pull Request against `band-app/sidepanel:main` from your fork.

## Pull Request Guidelines

- **Keep PRs focused.** One logical change per PR.
- **Describe what and why.** The PR description should explain the change and link any related issues.
- **Include a test plan.** Steps to reproduce, expected behavior, screenshots if relevant.
- **No unrelated reformats.** Don't churn files you didn't actually change.

## Testing strategy

This repo uses **integration tests over the real Tauri binary / real
filesystem**. Don't add unit tests with mocked dependencies — see
`CLAUDE.md` for the full set of rules.

## License

By contributing, you agree your contributions will be licensed under the
project's [MIT License](./LICENSE).
