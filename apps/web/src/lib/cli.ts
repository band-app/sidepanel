import {
  accessSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { cliInstallDir, cliInstallPath, executableExtension, isWindows } from "./platform";

export type CliStatus =
  | "Installed"
  | "NotInstalled"
  | "ConflictingBinary"
  | "DirNotFound"
  | "NotWritable";

const INSTALL_PATH = cliInstallPath();

/** Find the CLI binary by trying multiple resolution strategies. */
function findCliBinary(): string | null {
  const binaryName = `band${executableExtension}`;
  const strategies = [
    // cwd = apps/web/ (Vite dev and production server)
    resolve(process.cwd(), ".."),
    // cwd = project root (fallback)
    resolve(process.cwd(), "apps"),
    // From this source file (apps/web/src/lib/ → apps/)
    resolve(import.meta.dirname, "..", "..", ".."),
  ];

  for (const appsDir of strategies) {
    for (const profile of ["release", "debug"]) {
      const p = join(appsDir, "cli", "target", profile, binaryName);
      try {
        lstatSync(p);
        return p;
      } catch {
        // Continue
      }
    }
  }
  return null;
}

export async function checkCli(): Promise<CliStatus> {
  try {
    const s = lstatSync(INSTALL_PATH);
    if (isWindows) {
      // On Windows we copy the binary — just check it's a file
      if (!s.isFile()) {
        return "ConflictingBinary";
      }
      return "Installed";
    }
    if (!s.isSymbolicLink()) {
      return "ConflictingBinary";
    }
    // Check if the symlink points to our CLI binary
    const target = realpathSync(INSTALL_PATH);
    if (!target.includes(join("apps", "cli", "target"))) {
      return "ConflictingBinary";
    }
    return "Installed";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Check if install directory exists
      const dir = cliInstallDir();
      try {
        lstatSync(dir);
        return "NotInstalled";
      } catch {
        return "DirNotFound";
      }
    }
    if (code === "EACCES") {
      return "NotWritable";
    }
    return "NotInstalled";
  }
}

/** Check if the current process can write to a directory. */
function isDirWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function installCli(): Promise<void> {
  const binaryPath = findCliBinary();
  if (!binaryPath) {
    throw new Error(
      "Could not find band CLI binary. Build it first with: cargo build --release -p band-cli",
    );
  }

  const dir = dirname(INSTALL_PATH);

  if (isWindows) {
    // On Windows: create the directory and copy the binary
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Directory may already exist
    }
    if (isDirWritable(dir)) {
      copyFileSync(binaryPath, INSTALL_PATH);
    } else {
      throw new Error(
        `Cannot write to ${dir}. Copy manually: copy "${binaryPath}" "${INSTALL_PATH}"`,
      );
    }
    return;
  }

  // Unix: use symlinks
  if (isDirWritable(dir)) {
    // Directory is writable — do it directly
    try {
      lstatSync(INSTALL_PATH);
      unlinkSync(INSTALL_PATH);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    symlinkSync(binaryPath, INSTALL_PATH);
  } else {
    throw new Error(`Run: sudo ln -sf "${binaryPath}" "${INSTALL_PATH}"`);
  }
}
