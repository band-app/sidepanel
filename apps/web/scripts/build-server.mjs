#!/usr/bin/env node

/**
 * Cross-platform build script for the Band web server.
 * Replaces build-server.sh so the build works on macOS, Linux, and Windows.
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { platform } from "node:os";

// ── 1. Bundle the server entry point ────────────────────────────────────────
execSync(
  [
    "esbuild",
    "start-server.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=dist/start-server.mjs`,
    "--external:./server/server.js",
    "--external:node-pty",
    "--external:better-sqlite3",
    `--banner:js="import{createRequire}from'module';import{fileURLToPath as __fu}from'url';import{dirname as __dn}from'path';const require=createRequire(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);"`,
  ].join(" "),
  { stdio: "inherit" },
);

// ── 2. Copy node-pty native module (only current platform prebuilds) ────────
const ptyDest = "dist/node_modules/node-pty";
mkdirSync(join(ptyDest, "prebuilds"), { recursive: true });

// Resolve symlinks to get real node-pty path (for hoisted node_modules)
const ptyPkg = resolve("node_modules/node-pty");
copyFileSync(join(ptyPkg, "package.json"), join(ptyDest, "package.json"));
cpSync(join(ptyPkg, "lib"), join(ptyDest, "lib"), { recursive: true, dereference: true });

// Detect platform for prebuild filtering
const os = platform();
let prebuildGlob;
switch (os) {
  case "darwin":
    prebuildGlob = "darwin-";
    break;
  case "linux":
    prebuildGlob = "linux-";
    break;
  case "win32":
    prebuildGlob = "win32-";
    break;
  default:
    prebuildGlob = "";
    break;
}

const prebuildsDir = join(ptyPkg, "prebuilds");
if (existsSync(prebuildsDir)) {
  for (const entry of readdirSync(prebuildsDir)) {
    if (prebuildGlob && !entry.startsWith(prebuildGlob)) continue;
    const srcDir = join(prebuildsDir, entry);
    if (!statSync(srcDir).isDirectory()) continue;

    const destDir = join(ptyDest, "prebuilds", entry);
    mkdirSync(destDir, { recursive: true });

    for (const file of readdirSync(srcDir)) {
      // Skip debug symbol files
      if (file.endsWith(".pdb")) continue;
      const srcFile = join(srcDir, file);
      if (statSync(srcFile).isFile()) {
        copyFileSync(srcFile, join(destDir, file));
      }
    }
  }
}

// On Unix, make spawn-helper executable
if (os !== "win32") {
  try {
    const spawnHelpers = join(ptyDest, "prebuilds");
    for (const dir of readdirSync(spawnHelpers)) {
      const helper = join(spawnHelpers, dir, "spawn-helper");
      if (existsSync(helper)) {
        execSync(`chmod +x "${helper}"`);
      }
    }
  } catch {
    // Non-fatal
  }
}

// ── 3. Copy better-sqlite3 native module and its dependencies ───────────────
const sqliteDest = "dist/node_modules/better-sqlite3";
mkdirSync(join(sqliteDest, "build", "Release"), { recursive: true });

const sqlitePkg = resolve("node_modules/better-sqlite3");
copyFileSync(join(sqlitePkg, "package.json"), join(sqliteDest, "package.json"));
cpSync(join(sqlitePkg, "lib"), join(sqliteDest, "lib"), { recursive: true });

const nativeModule = join(sqlitePkg, "build", "Release", "better_sqlite3.node");
copyFileSync(nativeModule, join(sqliteDest, "build", "Release", "better_sqlite3.node"));

// better-sqlite3 uses 'bindings' (+ file-uri-to-path) to locate .node at runtime.
// In pnpm, these are peers of better-sqlite3 inside the .pnpm store, not directly
// in node_modules/. Resolve from the real better-sqlite3 path's parent directory.
const sqliteRealDir = realpathSync(resolve("node_modules/better-sqlite3"));
const sqlitePeers = join(sqliteRealDir, "..");

function resolvePeerPkg(name) {
  const peerDir = join(sqlitePeers, name);
  if (existsSync(peerDir)) return realpathSync(peerDir);
  // Fallback: try local node_modules
  const localDir = resolve("node_modules", name);
  if (existsSync(localDir)) return realpathSync(localDir);
  throw new Error(`Cannot find package '${name}' as peer of better-sqlite3 or in node_modules`);
}

const bindingsReal = resolvePeerPkg("bindings");
mkdirSync("dist/node_modules/bindings", { recursive: true });
cpSync(bindingsReal, "dist/node_modules/bindings", { recursive: true, dereference: true });

// file-uri-to-path is a dep of bindings; resolve from bindings' peers
const bindingsPeers = join(realpathSync(join(sqlitePeers, "bindings")), "..");
const fileUriDir = join(bindingsPeers, "file-uri-to-path");
const fileUriReal = existsSync(fileUriDir) ? realpathSync(fileUriDir) : resolvePeerPkg("file-uri-to-path");
mkdirSync("dist/node_modules/file-uri-to-path", { recursive: true });
cpSync(fileUriReal, "dist/node_modules/file-uri-to-path", { recursive: true, dereference: true });

// ── 4. Copy Drizzle migrations ──────────────────────────────────────────────
if (existsSync("dist/migrations")) {
  rmSync("dist/migrations", { recursive: true });
}
cpSync("src/lib/db/migrations", "dist/migrations", { recursive: true });

console.log("✓ Server build complete");
