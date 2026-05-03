import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface TerminalConfig {
  name: string;
  command: string;
  split?: "horizontal" | "vertical";
}

export interface AppConfig {
  type: string;
  size?: number;
  split?: "horizontal" | "vertical";
  terminals?: TerminalConfig[];
  commands?: { name?: string; command: string; split?: "horizontal" | "vertical" }[];
  url?: string;
}

export interface BandConfig {
  apps?: AppConfig[];
}

export function getConfigPath(workspacePath: string): string {
  return path.join(workspacePath, ".sidepanel", "config.json");
}

export async function loadConfig(workspacePath: string): Promise<BandConfig | null> {
  const configPath = getConfigPath(workspacePath);

  try {
    await fs.promises.access(configPath, fs.constants.R_OK);
    const content = await fs.promises.readFile(configPath, "utf-8");
    return JSON.parse(content) as BandConfig;
  } catch {
    return null;
  }
}

/**
 * Read user-level defaults from `~/.band-sidepanel/settings.json`.
 *
 * The side panel's settings file contains a flattened `extra` blob alongside
 * the structured `projects` / `window` keys; per-project defaults live under
 * the top-level `defaults` key (same shape as a `.sidepanel/config.json`).
 */
export async function loadUserDefaults(): Promise<BandConfig | null> {
  const settingsPath = path.join(os.homedir(), ".band-sidepanel", "settings.json");

  try {
    await fs.promises.access(settingsPath, fs.constants.R_OK);
    const content = await fs.promises.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);

    if (settings?.defaults) {
      return settings.defaults as BandConfig;
    }
    return null;
  } catch (err) {
    console.log("[Sidepanel] Failed to load user defaults:", err);
    return null;
  }
}

export function mergeConfigs(
  defaults: BandConfig | null,
  projectConfig: BandConfig | null,
): BandConfig | null {
  if (!defaults && !projectConfig) {
    return null;
  }
  if (!defaults) {
    return projectConfig;
  }
  if (!projectConfig) {
    return defaults;
  }

  // Project apps fully replace user default apps (not merged per-element).
  return {
    apps: projectConfig.apps ?? defaults.apps,
  };
}

export async function loadEffectiveConfig(
  workspacePath: string,
  projectPath?: string,
): Promise<BandConfig | null> {
  let projectConfig = await loadConfig(workspacePath);
  // Fall back to the main repo path when the worktree has no config
  // (e.g. .sidepanel/config.json is .gitignored so new worktrees don't contain it).
  if (!projectConfig && projectPath && projectPath !== workspacePath) {
    projectConfig = await loadConfig(projectPath);
  }
  const defaults = await loadUserDefaults();
  return mergeConfigs(defaults, projectConfig);
}

export interface WorkspaceIdentity {
  project: string;
  branch: string;
  workspaceId: string;
  projectPath: string;
}

/**
 * Identify the side-panel project + branch the current VS Code workspace
 * belongs to.
 *
 * The side panel does not persist worktree state to disk — only the project
 * list. So we compute identity from:
 *   1. Main worktree path via `git rev-parse --git-common-dir` (handles both
 *      main and linked worktrees).
 *   2. That path looked up in `~/.band-sidepanel/settings.json`'s `projects[]`.
 *   3. The workspace's current branch from `git`.
 *
 * Returns null if the workspace isn't tracked by the side panel.
 */
export async function getBandWorktreeIdentity(
  workspacePath: string,
): Promise<WorkspaceIdentity | null> {
  const mainPath = (await getGitMainWorktreePath(workspacePath)) ?? workspacePath;

  const settingsPath = path.join(os.homedir(), ".band-sidepanel", "settings.json");
  let projects: Array<{ id: string; name: string; path: string }> = [];
  try {
    const content = await fs.promises.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    if (settings && Array.isArray(settings.projects)) {
      projects = settings.projects;
    }
  } catch {
    return null;
  }

  const project = projects.find((p) => p.path === mainPath);
  if (!project) {
    return null;
  }

  let branch: string;
  try {
    branch = await new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: workspacePath, encoding: "utf-8" },
        (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
      );
    });
  } catch {
    return null;
  }

  if (!branch || branch === "HEAD") {
    return null;
  }

  return {
    project: project.name,
    branch,
    // Mirrors `to_workspace_id` in src-tauri/src/commands/window_focus.rs.
    workspaceId: `${project.name}-${branch.replaceAll("/", "-")}`,
    projectPath: project.path,
  };
}

/**
 * Find the main worktree (project root) for the given workspace via git.
 * Returns null if the workspace isn't inside a git repo or is itself the
 * main worktree.
 */
export async function getGitMainWorktreePath(workspacePath: string): Promise<string | null> {
  try {
    const gitCommonDir = await new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        { cwd: workspacePath, encoding: "utf-8" },
        (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
      );
    });

    const mainRepo = path.dirname(gitCommonDir);
    if (mainRepo === workspacePath) {
      return null;
    }
    return mainRepo;
  } catch {
    return null;
  }
}
