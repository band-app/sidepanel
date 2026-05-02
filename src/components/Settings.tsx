import { useEffect, useState } from "react";
import { api, type WindowSettings } from "../api/tauri";

interface Props {
  initial: WindowSettings;
  onSettingsChanged: (next: WindowSettings) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;

export function Settings({ initial, onSettingsChanged, onError, onClose }: Props) {
  const [edge, setEdge] = useState(initial.edge);
  const [width, setWidth] = useState(initial.width);
  const [focusPolling, setFocusPolling] = useState(initial.focusPolling);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Keep local state synced if the parent re-fetches.
  useEffect(() => {
    setEdge(initial.edge);
    setWidth(initial.width);
    setFocusPolling(initial.focusPolling);
  }, [initial.edge, initial.width, initial.focusPolling]);

  const persist = async (field: string, patch: Partial<WindowSettings>, optimistic: () => void) => {
    setSavingField(field);
    optimistic();
    try {
      const next = await api.updateSettings(patch);
      onSettingsChanged(next.window);
    } catch (e) {
      onError(`update_settings(${field}): ${String(e)}`);
    } finally {
      setSavingField(null);
    }
  };

  return (
    <section className="settings card">
      <header className="settings-header">
        <h2>Settings</h2>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </header>

      <fieldset disabled={savingField !== null}>
        <div className="field" role="group" aria-labelledby="edge-label">
          <span id="edge-label">Screen edge</span>
          <div className="segmented">
            {(["left", "right"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={edge === value ? "selected" : ""}
                onClick={() => persist("edge", { edge: value }, () => setEdge(value))}
                aria-pressed={edge === value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>
            Width <span className="muted">({Math.round(width)}px)</span>
          </span>
          <input
            type="range"
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            step={10}
            value={Math.round(width)}
            onChange={(e) => setWidth(Number(e.currentTarget.value))}
            onPointerUp={() => {
              if (width !== initial.width) {
                persist("width", { width }, () => undefined);
              }
            }}
          />
        </label>

        <label className="field row">
          <input
            type="checkbox"
            checked={focusPolling}
            onChange={(e) => {
              const next = e.currentTarget.checked;
              persist("focusPolling", { focusPolling: next }, () => setFocusPolling(next));
            }}
          />
          <span>
            <strong>Focus polling</strong>
            <small className="muted block">
              Watch the frontmost window and highlight the matching worktree. Disable to stop the
              background thread.
            </small>
          </span>
        </label>
      </fieldset>
    </section>
  );
}
