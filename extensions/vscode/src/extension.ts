import * as vscode from "vscode";
import {
  getBandWorktreeIdentity,
  getGitMainWorktreePath,
  loadConfig,
  loadEffectiveConfig,
} from "./config";
import { setupWorkspace } from "./workspace-setup";

let log: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  log = vscode.window.createOutputChannel("Sidepanel");
  log.appendLine("Sidepanel extension activating...");

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sidepanel.setupWorkspace", async () => {
      await runSetup();
    }),
  );

  // Auto-setup if config exists or workspace is a Sidepanel worktree.
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspacePath = workspaceFolders[0].uri.fsPath;
    const hasProjectConfig = (await loadConfig(workspacePath)) !== null;
    const identity = await getBandWorktreeIdentity(workspacePath);

    // Resolve the project root: from settings.json, or by asking git for the main worktree.
    const projectPath = identity?.projectPath ?? (await getGitMainWorktreePath(workspacePath));

    if (hasProjectConfig || identity || projectPath) {
      const effective = await loadEffectiveConfig(workspacePath, projectPath ?? undefined);
      if (effective) {
        log.appendLine("Effective config loaded, setting up workspace...");
        await setupWorkspace(effective);
        vscode.window.showInformationMessage("Sidepanel workspace setup complete");
      } else {
        log.appendLine("No effective config resolved");
      }

      if (identity) {
        log.appendLine(`Sidepanel worktree identified: ${identity.workspaceId}`);
      }
    } else {
      log.appendLine("No config found and not a Sidepanel worktree");
    }
  } else {
    log.appendLine("No workspace folders");
  }
}

async function runSetup() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open");
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const identity = await getBandWorktreeIdentity(workspacePath);
  const projectPath = identity?.projectPath ?? (await getGitMainWorktreePath(workspacePath));
  const effective = await loadEffectiveConfig(workspacePath, projectPath ?? undefined);
  if (effective) {
    await setupWorkspace(effective);
    vscode.window.showInformationMessage("Sidepanel workspace setup complete");
    return;
  }

  vscode.window.showErrorMessage(
    `No .sidepanel/config.json found. Checked: ${workspacePath}/.sidepanel/config.json${projectPath ? ` and ${projectPath}/.sidepanel/config.json` : ""}`,
  );
}

export function deactivate() {}
