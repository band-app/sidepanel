import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api, type PublicSettings } from "./api/tauri";

// PR 1 placeholder: just verifies that the webview boots, IPC works, and the
// `active-workspace` event from the focus-polling thread is received.
// PR 2 replaces this with the real ProjectList / WorktreeList / Settings UI.

export function App() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(`getSettings: ${String(e)}`));
    api
      .listProjects()
      .then((projects) => setProjectCount(projects.length))
      .catch((e) => setError(`listProjects: ${String(e)}`));
    api
      .getActiveWorkspace()
      .then(setActiveWorkspace)
      .catch(() => undefined);

    const unlisten = listen<string>("active-workspace", (event) => {
      setActiveWorkspace(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <main className="panel">
      <header className="header">
        <h1>Band Side Panel</h1>
        <p className="subtitle">PR 1 placeholder — IPC smoke test</p>
      </header>

      <section className="card">
        <h2>Settings</h2>
        {settings ? (
          <pre>{JSON.stringify(settings, null, 2)}</pre>
        ) : (
          <p className="muted">loading…</p>
        )}
      </section>

      <section className="card">
        <h2>Projects</h2>
        <p>
          {projectCount === null
            ? "loading…"
            : `${projectCount} project${projectCount === 1 ? "" : "s"} configured`}
        </p>
      </section>

      <section className="card">
        <h2>Active workspace</h2>
        <p>
          <code>{activeWorkspace ?? "—"}</code>
        </p>
      </section>

      {error ? <pre className="error">{error}</pre> : null}
    </main>
  );
}
