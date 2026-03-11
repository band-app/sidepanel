import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createLogger } from "@band/logger";
import { getToken } from "./auth-token";
import { shellPath } from "./process-utils";
import { emit } from "./watcher";

const log = createLogger("tunnel");

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelSubdomain: string | null = null;
let tunnelRemoteHost: string | null = null;
let startInProgress: Promise<void> | null = null;

function extractUrl(text: string): string | null {
  const match = text.match(/https:\/\/[^\s]+\.instatunnel\.my/);
  return match ? match[0] : null;
}

function extractSubdomain(url: string): string | null {
  const match = url.match(/^https:\/\/(.+)\.instatunnel\.my/);
  if (!match) return null;
  const sub = match[1];
  if (sub === "api") return null;
  return sub;
}

function appendToken(baseUrl: string, token: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}token=${token}`;
}

async function killRemoteTunnel(subdomain: string): Promise<void> {
  const resolvedPath = await shellPath();
  log.debug("killing remote tunnel: %s", subdomain);
  await new Promise<void>((resolve) => {
    execFile(
      "instatunnel",
      ["--kill", subdomain],
      { env: { ...process.env, PATH: resolvedPath }, timeout: 10_000 },
      (err) => {
        if (err) {
          log.debug("kill remote result: error: %s", err.message);
        } else {
          log.debug("kill remote result: ok");
        }
        resolve();
      },
    );
  });
  // Give the server a moment to release the subdomain
  await new Promise((r) => setTimeout(r, 1000));
}

function spawnTunnel(
  options: { port: number; subdomain?: string; skipSubdomain?: boolean },
  resolvedPath: string,
): Promise<{ subdomainTaken: boolean }> {
  const args = [String(options.port)];
  if (options.subdomain && !options.skipSubdomain) {
    args.push("--subdomain", options.subdomain);
  }

  log.debug("spawning instatunnel %s", args.join(" "));

  return new Promise((resolve, reject) => {
    const child = spawn("instatunnel", args, {
      env: { ...process.env, PATH: resolvedPath },
      stdio: ["ignore", "pipe", "pipe"],
    });

    tunnelProcess = child;
    let settled = false;
    let subdomainTaken = false;
    const stderrChunks: string[] = [];

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        log.debug("output: %s", trimmed);

        const url = extractUrl(trimmed);
        if (url) {
          const sub = extractSubdomain(url);
          if (sub) {
            tunnelSubdomain = sub;
            const token = getToken();
            tunnelUrl = appendToken(url, token);

            log.debug("detected URL: %s", tunnelUrl);
            emit({ kind: "tunnel-url", url: tunnelUrl });

            if (!settled) {
              settled = true;
              resolve({ subdomainTaken: false });
            }
          }
        } else if (trimmed.includes("subdomain") && trimmed.toLowerCase().includes("taken")) {
          log.debug("subdomain taken");
          subdomainTaken = true;
        } else if (trimmed.includes("remote host:")) {
          const host = trimmed.split("remote host:")[1]?.trim();
          if (host) {
            log.debug("remote host: %s", host);
            tunnelRemoteHost = host;
            emit({ kind: "tunnel-remote-host", remoteHost: host });
          }
        }
      }
    };

    child.stdout?.on("data", handleOutput);
    child.stderr?.on("data", (data: Buffer) => {
      stderrChunks.push(data.toString());
      handleOutput(data);
    });

    child.on("error", (err) => {
      log.debug("process error: %s", err.message);
      tunnelProcess = null;
      tunnelUrl = null;
      tunnelSubdomain = null;
      tunnelRemoteHost = null;
      emit({ kind: "tunnel-error", error: err.message });
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on("exit", (code) => {
      log.debug("process exited with code: %d", code);
      tunnelProcess = null;
      tunnelUrl = null;
      const sub = tunnelSubdomain;
      tunnelSubdomain = null;
      tunnelRemoteHost = null;
      if (!settled) {
        settled = true;
        if (subdomainTaken) {
          resolve({ subdomainTaken: true });
        } else if (code !== 0) {
          reject(
            new Error(`instatunnel exited with code ${code}: ${stderrChunks.join("").trim()}`),
          );
        } else {
          resolve({ subdomainTaken: false });
        }
      }
      if (sub) {
        // Already exited, no more events
      }
    });

    // Timeout: if URL not detected within 30s, resolve anyway
    setTimeout(() => {
      if (!settled) {
        log.debug("30s timeout reached, resolving without URL");
        settled = true;
        resolve({ subdomainTaken: false });
      }
    }, 30_000);
  });
}

export async function startTunnel(options: {
  port: number;
  subdomain?: string;
  skipSubdomain?: boolean;
}): Promise<void> {
  // If a start is already in progress, wait for it
  if (startInProgress) {
    log.debug("startTunnel: start already in progress, waiting...");
    await startInProgress;
    return;
  }

  if (tunnelProcess) {
    log.debug("startTunnel: already running, re-emitting URL");
    if (tunnelUrl) {
      emit({ kind: "tunnel-url", url: tunnelUrl });
    }
    return;
  }

  const doStart = async () => {
    const resolvedPath = await shellPath();

    const result = await spawnTunnel(options, resolvedPath);

    // If subdomain was taken, kill the stale remote reservation and retry once
    if (result.subdomainTaken && options.subdomain && !options.skipSubdomain) {
      log.debug("subdomain taken, killing stale reservation and retrying...");
      await killRemoteTunnel(options.subdomain);
      const retry = await spawnTunnel(options, resolvedPath);
      if (retry.subdomainTaken) {
        // Still taken after kill — emit event so UI can offer fallback
        log.debug("subdomain still taken after retry");
        emit({ kind: "tunnel-subdomain-taken", subdomain: options.subdomain });
      }
    }
  };

  startInProgress = doStart();
  try {
    await startInProgress;
  } finally {
    startInProgress = null;
  }
}

export async function stopTunnel(): Promise<void> {
  const sub = tunnelSubdomain;
  if (tunnelProcess) {
    tunnelProcess.kill("SIGTERM");
    tunnelProcess = null;
  }
  tunnelUrl = null;
  tunnelSubdomain = null;
  tunnelRemoteHost = null;

  // Also run instatunnel --kill to clean up remote
  if (sub) {
    await killRemoteTunnel(sub);
  }
}

export function getTunnelStatus(): {
  running: boolean;
  url: string | null;
  remoteHost: string | null;
} {
  return {
    running: tunnelProcess !== null,
    url: tunnelUrl,
    remoteHost: tunnelRemoteHost,
  };
}

export async function checkTunnelAuth(): Promise<boolean> {
  const resolvedPath = await shellPath();
  return new Promise((resolve) => {
    execFile(
      "instatunnel",
      ["auth", "show-key"],
      { env: { ...process.env, PATH: resolvedPath }, timeout: 10_000 },
      (err) => {
        resolve(!err);
      },
    );
  });
}

export async function checkTunnelHealth(
  subdomain: string,
  token: string,
): Promise<{ healthy: boolean; remoteHost?: string }> {
  const maskedUrl = `https://${subdomain}.instatunnel.my/api/health?token=***`;
  log.debug("checkTunnelHealth: fetching %s", maskedUrl);
  const url = `https://${subdomain}.instatunnel.my/api/health?token=${token}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    log.debug("checkTunnelHealth: status %d %s", response.status, response.statusText);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      log.debug("checkTunnelHealth: non-ok body: %s", text.slice(0, 200));
      return { healthy: false };
    }
    const body = (await response.json()) as { status?: string; hostname?: string };
    log.debug({ body }, "checkTunnelHealth: response body");
    return {
      healthy: body.status === "ok",
      remoteHost: body.hostname,
    };
  } catch (e) {
    log.debug("checkTunnelHealth: fetch error: %s", e);
    return { healthy: false };
  }
}
