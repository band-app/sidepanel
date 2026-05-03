import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Settings as SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type Project } from "@/api/tauri";
import { AddProjectButton } from "@/components/AddProjectButton";
import { ProjectList } from "@/components/ProjectList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(`list_projects: ${String(e)}`));
  }, []);

  useEffect(() => {
    loadProjects();

    api
      .getActiveWorkspace()
      .then(setActiveWorkspace)
      .catch(() => undefined);

    const unlistenPromise = listen<string>("active-workspace", (event) => {
      setActiveWorkspace(event.payload);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [loadProjects]);

  const openSettings = async () => {
    try {
      const win = await WebviewWindow.getByLabel("settings");
      if (win) {
        await win.show();
        await win.setFocus();
      }
    } catch (e) {
      setError(`open settings window: ${String(e)}`);
    }
  };

  return (
    <main className="flex flex-col gap-2.5 h-full overflow-hidden pt-12 px-3 pb-3">
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-12 border-b-2 border-border pointer-events-none"
      />
      <div className="absolute top-1 right-2 z-10 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
          className="text-muted-foreground"
        >
          <SettingsIcon className="size-5" />
        </Button>
        <AddProjectButton onAdded={loadProjects} onError={setError} />
      </div>

      <section className="flex-1 overflow-y-auto -mx-1 px-1">
        {projects === null ? (
          <p className="text-muted-foreground text-xs">loading projects…</p>
        ) : (
          <ProjectList
            projects={projects}
            activeWorkspace={activeWorkspace}
            onProjectsChanged={loadProjects}
            onError={setError}
          />
        )}
      </section>

      {error ? (
        <Alert
          variant="destructive"
          className="cursor-pointer shrink-0 py-2 px-3"
          onClick={() => setError(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setError(null);
            }
          }}
        >
          <AlertDescription className="gap-0.5">
            <pre className="m-0 whitespace-pre-wrap break-all text-[11px] font-mono text-destructive">
              {error}
            </pre>
            <small className="text-muted-foreground text-[10px]">click to dismiss</small>
          </AlertDescription>
        </Alert>
      ) : null}
    </main>
  );
}
