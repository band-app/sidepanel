import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileStatus } from "@band/dashboard-core";
import { createFileRoute } from "@tanstack/react-router";
import { execGit } from "../../lib/git";
import { resolveWorkspace } from "../../lib/workspace";

export const Route = createFileRoute("/api/workspace/$workspaceId/diff")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const workspaceId = decodeURIComponent(params.workspaceId);
        const workspace = resolveWorkspace(workspaceId);
        if (!workspace) {
          return Response.json({ error: "Workspace not found" }, { status: 404 });
        }

        const cwd = workspace.worktree.path;
        const defaultBranch = workspace.project.defaultBranch;

        try {
          const headBranch = (await execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();

          let mergeBase: string;
          try {
            mergeBase = (await execGit(["merge-base", defaultBranch, "HEAD"], cwd)).trim();
          } catch {
            // If merge-base fails (e.g. no common ancestor), diff against empty tree
            mergeBase = (await execGit(["hash-object", "-t", "tree", "/dev/null"], cwd)).trim();
          }

          // Diff merge-base against working tree (includes uncommitted changes)
          let diff = await execGit(["diff", mergeBase], cwd);

          const statOutput = await execGit(["diff", "--stat", mergeBase], cwd);
          const statLines = statOutput.trim().split("\n");
          const summaryLine = statLines[statLines.length - 1] || "";

          let filesChanged = 0;
          let insertions = 0;
          let deletions = 0;

          const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
          const insertMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
          const deleteMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);

          if (filesMatch) filesChanged = Number.parseInt(filesMatch[1], 10);
          if (insertMatch) insertions = Number.parseInt(insertMatch[1], 10);
          if (deleteMatch) deletions = Number.parseInt(deleteMatch[1], 10);

          // Compute per-file statuses
          const fileStatuses: Record<string, FileStatus> = {};
          const nameStatusOutput = await execGit(["diff", "--name-status", mergeBase], cwd);
          for (const line of nameStatusOutput.trim().split("\n").filter(Boolean)) {
            const parts = line.split("\t");
            const statusCode = parts[0][0]; // First char handles R100 -> R
            if (statusCode === "R" && parts[2]) {
              fileStatuses[parts[2]] = "R";
            } else if (parts[1]) {
              fileStatuses[parts[1]] = statusCode as FileStatus;
            }
          }

          // Include untracked files in the diff
          const untrackedOutput = await execGit(
            ["ls-files", "--others", "--exclude-standard"],
            cwd,
          );
          const untrackedFiles = untrackedOutput.trim().split("\n").filter(Boolean);

          for (const file of untrackedFiles) {
            try {
              const content = await readFile(join(cwd, file), "utf-8");
              const lines = content.split("\n");
              // Remove trailing empty line from final newline
              if (lines.length > 0 && lines[lines.length - 1] === "") {
                lines.pop();
              }
              diff += `diff --git a/${file} b/${file}\n`;
              diff += "new file mode 100644\n";
              diff += "--- /dev/null\n";
              diff += `+++ b/${file}\n`;
              diff += `@@ -0,0 +1,${lines.length} @@\n`;
              diff += lines.map((l) => `+${l}`).join("\n");
              diff += "\n";
              filesChanged++;
              insertions += lines.length;
              fileStatuses[file] = "U";
            } catch {
              // Skip binary or unreadable files
            }
          }

          return Response.json({
            diff,
            stats: { filesChanged, insertions, deletions },
            baseBranch: defaultBranch,
            headBranch,
            fileStatuses,
          });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Failed to compute diff" },
            { status: 500 },
          );
        }
      },
    },
  },
});
