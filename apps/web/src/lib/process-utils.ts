import { execFile } from "node:child_process";

import { enrichPath, shellPathProbeArgs, whichCommand } from "./platform";

let cachedShellPath: string | null = null;

export async function shellPath(): Promise<string> {
  if (cachedShellPath) return cachedShellPath;

  const probeArgs = shellPathProbeArgs();
  if (probeArgs) {
    const [shell, args] = probeArgs;
    try {
      const result = await new Promise<string>((resolve, reject) => {
        execFile(shell, args, { timeout: 5000 }, (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stdout.trim());
        });
      });
      if (result) {
        cachedShellPath = result;
        return result;
      }
    } catch {
      // Fall through to default
    }
  }

  const fallback = enrichPath();
  cachedShellPath = fallback;
  return fallback;
}

export async function whichBinary(name: string): Promise<string | null> {
  const resolvedPath = await shellPath();
  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile(
        whichCommand,
        [name],
        { env: { ...process.env, PATH: resolvedPath } },
        (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stdout.trim());
        },
      );
    });
    // On Windows, `where` may return multiple lines — take the first
    const firstLine = result.split("\n")[0]?.trim() || null;
    return firstLine || null;
  } catch {
    return null;
  }
}

export async function checkPrereqs(): Promise<{ cloudflared: boolean }> {
  const cloudflared = await whichBinary("cloudflared");
  return { cloudflared: cloudflared !== null };
}
