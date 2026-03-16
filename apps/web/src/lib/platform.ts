/**
 * Central platform utilities for cross-platform compatibility.
 * All platform-specific logic should go through these helpers.
 */

export const isWindows = process.platform === "win32";

/**
 * The platform's null device path.
 * - Unix: /dev/null
 * - Windows: NUL
 */
export const nullDevice = isWindows ? "NUL" : "/dev/null";

/**
 * Returns the default shell for the current platform.
 * - Unix: $SHELL or /bin/zsh
 * - Windows: $COMSPEC or cmd.exe
 */
export function defaultShell(): string {
  if (isWindows) {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/zsh";
}

/**
 * Returns the arguments needed to execute a command string in the platform shell.
 * - Unix: ["-c", command]
 * - Windows cmd.exe: ["/c", command]
 * - Windows PowerShell: ["-Command", command]
 */
export function shellExecArgs(command: string): [string, string[]] {
  if (isWindows) {
    const shell = defaultShell();
    if (shell.toLowerCase().includes("powershell") || shell.toLowerCase().includes("pwsh")) {
      return [shell, ["-Command", command]];
    }
    return [shell, ["/c", command]];
  }
  const shell = defaultShell();
  return [shell, ["-c", command]];
}

/**
 * Returns the shell arguments for an interactive login shell PATH probe.
 * - Unix: ["-li", "-c", "echo $PATH"]
 * - Windows: not needed (PATH is already available in the environment)
 */
export function shellPathProbeArgs(): [string, string[]] | null {
  if (isWindows) {
    // Windows doesn't need a login shell to resolve PATH
    return null;
  }
  const shell = defaultShell();
  return [shell, ["-li", "-c", "echo $PATH"]];
}

/**
 * Extra directories to prepend to PATH on Unix to pick up Homebrew, etc.
 * Returns empty array on Windows where these paths don't exist.
 */
export function extraPathDirs(): string[] {
  if (isWindows) {
    return [];
  }
  return ["/opt/homebrew/bin", "/usr/local/bin"];
}

/**
 * Build an enriched PATH string by prepending platform-specific directories.
 */
export function enrichPath(basePath?: string): string {
  const dirs = extraPathDirs();
  const base = basePath || process.env.PATH || "";
  if (dirs.length === 0) return base;
  return [...dirs, base].join(pathSeparator);
}

/**
 * Build an enriched env object with platform-specific PATH.
 */
export function enrichedEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...(base || process.env) };
  if (env.PATH) {
    env.PATH = enrichPath(env.PATH);
  }
  return env;
}

/**
 * The name of the "which" command for finding binaries.
 * - Unix: "which"
 * - Windows: "where"
 */
export const whichCommand = isWindows ? "where" : "which";

/**
 * The default CLI install path.
 * - Unix: /usr/local/bin/band
 * - Windows: %LOCALAPPDATA%\Band\band.exe (user-writable, no admin needed)
 */
export function cliInstallDir(): string {
  if (isWindows) {
    return `${process.env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local"}\\Band`;
  }
  return "/usr/local/bin";
}

/**
 * The full path to the installed CLI binary.
 */
export function cliInstallPath(): string {
  if (isWindows) {
    return `${cliInstallDir()}\\band.exe`;
  }
  return "/usr/local/bin/band";
}

/**
 * The binary extension for executables on the current platform.
 */
export const executableExtension = isWindows ? ".exe" : "";

/**
 * PATH separator for the current platform.
 * - Unix: ":"
 * - Windows: ";"
 */
export const pathSeparator = isWindows ? ";" : ":";
