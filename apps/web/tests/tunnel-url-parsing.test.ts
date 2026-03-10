import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROJECT_ROOT = join(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ServerHandle {
  url: string;
  home: string;
  close: () => Promise<void>;
}

function createTmpHome(): string {
  const tmp = mkdtempSync(join(tmpdir(), "band-test-"));
  const bandDir = join(tmp, ".band");
  mkdirSync(bandDir, { recursive: true });
  mkdirSync(join(bandDir, "status"), { recursive: true });
  return tmp;
}

function seedState(tmpHome: string, state: object): void {
  writeFileSync(join(tmpHome, ".band", "state.json"), JSON.stringify(state));
}

function seedSettings(tmpHome: string, settings: object): void {
  writeFileSync(join(tmpHome, ".band", "settings.json"), JSON.stringify(settings));
}

function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function createDefaultState(tmpHome: string) {
  const repoDir = join(tmpHome, "repo");
  mkdirSync(repoDir, { recursive: true });
  return {
    projects: [
      {
        name: "testproject",
        path: repoDir,
        defaultBranch: "main",
        worktrees: [{ branch: "main", path: repoDir }],
      },
    ],
  };
}

/**
 * Create a fake instatunnel script that prints output matching the real CLI
 * format (with emoji prefixes) then sleeps so the process stays alive.
 */
function createFakeInstatunnel(binDir: string, subdomain: string): void {
  const script = `#!/bin/sh
PORT="$1"
echo "Using config file: /tmp/fake.yaml"
echo "🚀 Starting tunnel for localhost:$PORT..."
echo "🚀 Your app is now live at https://${subdomain}.instatunnel.my"
echo "📋 URL copied to clipboard!"
echo "🔗 Forwarding https://${subdomain}.instatunnel.my -> localhost:$PORT"
echo "⚡ Ready to receive requests! Press Ctrl+C to stop"
# Keep running until killed
while true; do sleep 1; done
`;
  const scriptPath = join(binDir, "instatunnel");
  writeFileSync(scriptPath, script);
  chmodSync(scriptPath, 0o755);
}

/**
 * Create a fake instatunnel that exits with "subdomain already taken" error.
 */
function createFakeInstatunnelSubdomainTaken(binDir: string): void {
  const script = `#!/bin/sh
echo "Using config file: /tmp/fake.yaml"
echo "🚀 Starting tunnel for localhost:$1..."
echo 'Error: failed to create tunnel: {"error":"subdomain already taken"}' >&2
exit 1
`;
  const scriptPath = join(binDir, "instatunnel");
  writeFileSync(scriptPath, script);
  chmodSync(scriptPath, 0o755);
}

async function startServer(
  opts: { tmpHome?: string; env?: Record<string, string> } = {},
): Promise<ServerHandle> {
  const home = opts.tmpHome || createTmpHome();
  const port = await getRandomPort();

  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/start-server.mjs"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        HOME: home,
        PORT: String(port),
        NODE_ENV: "production",
        ...opts.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdout!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("listening") && !settled) {
        settled = true;
        resolve({
          url: `http://127.0.0.1:${port}`,
          home,
          close: () =>
            new Promise<void>((r) => {
              child.on("exit", () => r());
              child.kill("SIGTERM");
            }),
        });
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Server exited with code ${code} before listening.\nstderr: ${stderr}`));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Server did not start within 15 s.\nstderr: ${stderr}`));
      }
    }, 15_000);
  });
}

// ---------------------------------------------------------------------------
// tRPC helpers
// ---------------------------------------------------------------------------

async function trpcQuery(serverUrl: string, procedure: string) {
  return fetch(`${serverUrl}/trpc/${procedure}`);
}

async function trpcMutate(serverUrl: string, procedure: string, input?: unknown) {
  return fetch(`${serverUrl}/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: input !== undefined ? JSON.stringify(input) : "{}",
  });
}

async function trpcData<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { result: { data: T } };
  return body.result.data;
}

async function waitFor(
  fn: () => Promise<boolean>,
  { timeout = 10_000, interval = 100 } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await fn()) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Timed out");
}

// ---------------------------------------------------------------------------
// Tests: tunnel URL parsing with emoji-prefixed output
// ---------------------------------------------------------------------------

describe("tunnel.start — parses URL from emoji-prefixed instatunnel output", () => {
  let server: ServerHandle;
  let tmpHome: string;

  beforeAll(async () => {
    tmpHome = createTmpHome();
    seedState(tmpHome, createDefaultState(tmpHome));
    seedSettings(tmpHome, {});

    const binDir = join(tmpHome, "bin");
    mkdirSync(binDir, { recursive: true });
    createFakeInstatunnel(binDir, "test123");

    server = await startServer({
      tmpHome,
      env: {
        PATH: `${binDir}:${process.env.PATH}`,
        SHELL: "/bin/sh",
      },
    });
  });

  afterAll(async () => {
    // Stop tunnel first so the fake process is cleaned up
    await trpcMutate(server.url, "tunnel.stop").catch(() => {});
    await server.close();
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("starts tunnel and extracts URL with subdomain", async () => {
    const res = await trpcMutate(server.url, "tunnel.start", {});
    expect(res.status).toBe(200);

    // Wait for tunnel status to report running with URL
    await waitFor(async () => {
      const statusRes = await trpcQuery(server.url, "tunnel.status");
      const status = await trpcData<{ running: boolean; url: string | null }>(statusRes);
      return status.running && status.url !== null;
    });

    const statusRes = await trpcQuery(server.url, "tunnel.status");
    const status = await trpcData<{ running: boolean; url: string | null }>(statusRes);

    expect(status.running).toBe(true);
    expect(status.url).toContain("https://test123.instatunnel.my");
  });
});

// ---------------------------------------------------------------------------
// Tests: subdomain taken does not throw TRPCClientError
// ---------------------------------------------------------------------------

describe("tunnel.start — subdomain taken resolves without error", () => {
  let server: ServerHandle;
  let tmpHome: string;

  beforeAll(async () => {
    tmpHome = createTmpHome();
    seedState(tmpHome, createDefaultState(tmpHome));
    seedSettings(tmpHome, {});

    const binDir = join(tmpHome, "bin");
    mkdirSync(binDir, { recursive: true });
    createFakeInstatunnelSubdomainTaken(binDir);

    server = await startServer({
      tmpHome,
      env: {
        PATH: `${binDir}:${process.env.PATH}`,
        SHELL: "/bin/sh",
      },
    });
  });

  afterAll(async () => {
    await server.close();
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns 200 when subdomain is taken (does not throw)", async () => {
    const res = await trpcMutate(server.url, "tunnel.start", { subdomain: "taken-sub" });
    expect(res.status).toBe(200);
  });
});
