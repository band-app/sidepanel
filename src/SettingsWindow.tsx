import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { api, type PublicSettings, type WindowSettings } from "@/api/tauri";
import { Settings } from "@/components/Settings";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SettingsWindow() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(`get_settings: ${String(e)}`));
  }, []);

  // Hide on close instead of destroying — keeps the pre-declared window
  // available so the side panel can re-show it via getByLabel("settings").
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onCloseRequested((event) => {
      event.preventDefault();
      void win.hide();
    });
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => undefined);
    };
  }, []);

  const onSettingsChanged = useCallback((window: WindowSettings) => {
    setSettings({ window });
  }, []);

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {settings === null ? (
          <p className="text-base text-muted-foreground">loading settings…</p>
        ) : (
          <Settings
            initial={settings.window}
            onSettingsChanged={onSettingsChanged}
            onError={setError}
          />
        )}

        {error ? (
          <Alert
            variant="destructive"
            className="cursor-pointer mt-4 py-2 px-3"
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
      </div>
    </main>
  );
}
