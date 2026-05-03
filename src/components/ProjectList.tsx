import { ChevronRight, MoreVertical, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Project } from "@/api/tauri";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toWorkspaceId, WorktreeList } from "./WorktreeList";

interface Props {
  projects: Project[];
  activeWorkspace: string | null;
  onProjectsChanged: () => void;
  onError: (msg: string) => void;
}

export function ProjectList({ projects, activeWorkspace, onProjectsChanged, onError }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(projects.map((p) => p.id)));

  // Newly added projects should also start expanded.
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const p of projects) {
        if (!next.has(p.id)) {
          next.add(p.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projects]);

  if (projects.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No projects yet. Click "Add project" below to choose one.
      </p>
    );
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
    <ul className="list-none m-0 p-0">
      {projects.map((p) => {
        const isOpen = expanded.has(p.id);
        const ownsActive = activeWorkspace?.startsWith(`${p.name}-`) ?? false;
        return (
          <li key={p.id} className="mb-0.5">
            <div className="group flex items-center gap-1 rounded-md">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggle(p.id)}
                aria-expanded={isOpen}
                title={p.path}
                className="h-9 flex-1 min-w-0 justify-start gap-1.5 px-2 py-1.5 font-medium text-foreground hover:bg-accent/60"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform duration-100",
                    isOpen && "rotate-90",
                  )}
                  aria-hidden="true"
                />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap min-w-0 text-[15px]">
                  {p.name}
                </span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More actions for ${p.name}`}
                    title="More actions"
                    className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => remove(p.id, p.name)}
                    className="text-[14px] py-2 px-3 gap-2.5"
                  >
                    <Trash2 className="size-[18px]" />
                    Remove project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <p className="pl-[26px] mt-0.5 text-[12px] text-neutral-400">
                active:{" "}
                <code className="font-mono text-[13px]">
                  {deriveBranch(p.name, activeWorkspace)}
                </code>
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
