import { useState } from "react";
import { api, type Project } from "../api/tauri";
import { toWorkspaceId, WorktreeList } from "./WorktreeList";

interface Props {
  projects: Project[];
  activeWorkspace: string | null;
  onProjectsChanged: () => void;
  onError: (msg: string) => void;
}

export function ProjectList({ projects, activeWorkspace, onProjectsChanged, onError }: Props) {
  // Auto-expand a project that owns the active workspace so the user always
  // sees what's currently focused without having to click.
  const initiallyExpanded = activeWorkspace
    ? projects.find((p) => activeWorkspace.startsWith(`${p.name}-`))?.id
    : undefined;
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initiallyExpanded ? [initiallyExpanded] : []),
  );

  if (projects.length === 0) {
    return <p className="muted">No projects yet. Click "Add project" below to choose one.</p>;
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const remove = async (id: string, name: string) => {
    if (
      !window.confirm(`Remove "${name}" from the side panel?\n\nThe project files are untouched.`)
    ) {
      return;
    }
    try {
      await api.removeProject(id);
      onProjectsChanged();
    } catch (e) {
      onError(`remove_project(${id}): ${String(e)}`);
    }
  };

  return (
    <ul className="project-list">
      {projects.map((p) => {
        const isOpen = expanded.has(p.id);
        const ownsActive = activeWorkspace?.startsWith(`${p.name}-`);
        return (
          <li key={p.id} className="project">
            <div className={`project-row${ownsActive ? " owns-active" : ""}`}>
              <button
                type="button"
                className="project-toggle"
                onClick={() => toggle(p.id)}
                aria-expanded={isOpen}
                title={p.path}
              >
                <span className={`chevron${isOpen ? " open" : ""}`} aria-hidden="true">
                  ▸
                </span>
                <span className="project-name">{p.name}</span>
              </button>
              <button
                type="button"
                className="project-remove"
                onClick={() => remove(p.id, p.name)}
                aria-label={`Remove ${p.name}`}
                title="Remove from side panel"
              >
                ×
              </button>
            </div>
            {isOpen ? (
              <WorktreeList
                projectId={p.id}
                projectName={p.name}
                activeWorkspace={activeWorkspace}
                onError={onError}
              />
            ) : ownsActive && activeWorkspace ? (
              // Compact preview when collapsed but holds the active workspace.
              <p className="indent muted active-hint">
                active: <code>{deriveBranch(p.name, activeWorkspace)}</code>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// Reverse the workspace-id construction used by the Rust side. Best-effort —
// branches with hyphens are ambiguous, so we just trim the project prefix.
function deriveBranch(projectName: string, workspaceId: string): string {
  const prefix = `${projectName}-`;
  return workspaceId.startsWith(prefix) ? workspaceId.slice(prefix.length) : workspaceId;
}

// Re-export so App.tsx doesn't need to import from WorktreeList directly.
export { toWorkspaceId };
