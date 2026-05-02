import { useEffect, useState } from "react";
import { api, type Worktree } from "../api/tauri";

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
    return <p className="muted indent">loading worktrees…</p>;
  }

  if (worktrees.length === 0) {
    return <p className="muted indent">no worktrees</p>;
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
    <ul className="worktree-list">
      {worktrees.map((wt) => {
        const wsId = toWorkspaceId(projectName, wt.branch);
        const isActive = wsId === activeWorkspace;
        return (
          <li key={wt.path}>
            <button
              type="button"
              className={`worktree-row${isActive ? " active" : ""}`}
              onClick={() => onFocus(wsId)}
              disabled={busy === wsId}
              title={wt.path}
            >
              <span className="branch">{wt.branch}</span>
              {busy === wsId ? <span className="spinner" aria-hidden="true" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
