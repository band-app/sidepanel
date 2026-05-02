import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, type Project, type PublicSettings, type WindowSettings } from "./api/tauri";
import { AddProjectButton } from "./components/AddProjectButton";
import { ProjectList } from "./components/ProjectList";
import { Settings } from "./components/Settings";

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(`list_projects: ${String(e)}`));
  }, []);

  // Initial load + active-workspace event subscription.
  useEffect(() => {
    loadProjects();

    api
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(`get_settings: ${String(e)}`));

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

  const onSettingsChanged = useCallback((window: WindowSettings) => {
    setSettings({ window });
  }, []);

  return (
    <main className="panel">
      <header className="header">
        <h1>Band</h1>
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Toggle settings"
          aria-pressed={showSettings}
          title="Settings"
        >
          ⚙
        </button>
      </header>

      {showSettings && settings ? (
        <Settings
          initial={settings.window}
          onSettingsChanged={onSettingsChanged}
          onError={setError}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      <section className="projects-section">
        {projects === null ? (
          <p className="muted">loading projects…</p>
        ) : (
          <ProjectList
            projects={projects}
            activeWorkspace={activeWorkspace}
            onProjectsChanged={loadProjects}
            onError={setError}
          />
        )}
      </section>

      <footer className="footer">
        <AddProjectButton onAdded={loadProjects} onError={setError} />
      </footer>

      {error ? (
        <div
          className="error"
          role="alert"
          onClick={() => setError(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setError(null);
            }
          }}
        >
          <pre>{error}</pre>
          <small className="muted">click to dismiss</small>
        </div>
      ) : null}
    </main>
  );
}
