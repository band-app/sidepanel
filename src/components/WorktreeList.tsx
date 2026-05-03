import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Worktree } from "@/api/tauri";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Workspace IDs are built the same way the Rust side does it (see
// `to_workspace_id` in window_focus.rs): "<projectName>-<branch with / -> ->".
// Keeping this on the client lets us highlight the active row without an extra
// IPC round-trip.
export function toWorkspaceId(projectName: string, branch: string): string {
  return `${projectName}-${branch.replaceAll("/", "-")}`;
}

interface Props {
  projectId: string;
  projectName: string;
  activeWorkspace: string | null;
  onError: (msg: string) => void;
}

export function WorktreeList({ projectId, projectName, activeWorkspace, onError }: Props) {
  const [worktrees, setWorktrees] = useState<Worktree[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listWorktrees(projectId)
      .then((wts) => {
        if (!cancelled) {
          setWorktrees(wts);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          onError(`list_worktrees(${projectId}): ${String(e)}`);
          setWorktrees([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // We intentionally re-fetch on activeWorkspace transitions too — a focus
    // event likely means the user switched contexts, and a new branch may
    // have appeared.
  }, [projectId, onError]);

  if (worktrees === null) {
    return (
      <p className="pl-[26px] mt-0.5 mb-1.5 text-[13px] text-muted-foreground">
        loading worktrees…
      </p>
    );
  }

  if (worktrees.length === 0) {
    return (
      <p className="pl-[26px] mt-0.5 mb-1.5 text-[13px] text-muted-foreground">no worktrees</p>
    );
  }

  const onFocus = async (workspaceId: string) => {
    setBusy(workspaceId);
    try {
      await api.workspaceFocus(workspaceId);
    } catch (e) {
      onError(`workspace_focus(${workspaceId}): ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="list-none m-0 mt-0.5 mb-1.5 ml-[14px] pl-[18px] border-l border-border/60">
      {worktrees.map((wt) => {
        const wsId = toWorkspaceId(projectName, wt.branch);
        const isActive = wsId === activeWorkspace;
        const isBusy = busy === wsId;
        return (
          <li key={wt.path} className="mb-px">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onFocus(wsId)}
              disabled={isBusy}
              title={wt.path}
              className={cn(
                "h-8 w-full justify-between px-2 py-1 text-[14px] font-normal text-foreground/80 hover:bg-accent/60",
                isActive && "border border-neutral-400 text-foreground",
                isBusy && "cursor-progress",
              )}
            >
              <span className="font-mono text-[13px] overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                {wt.branch}
              </span>
              {isBusy ? (
                <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
              ) : null}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
