import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { api, type WindowSettings } from "@/api/tauri";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  initial: WindowSettings;
  onSettingsChanged: (next: WindowSettings) => void;
  onError: (msg: string) => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;

export function Settings({ initial, onSettingsChanged, onError }: Props) {
  const [edge, setEdge] = useState(initial.edge);
  const [width, setWidth] = useState(initial.width);
  const [focusPolling, setFocusPolling] = useState(initial.focusPolling);
  const [savingField, setSavingField] = useState<string | null>(null);

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

  const disabled = savingField !== null;

  return (
    <fieldset disabled={disabled} className="border-0 p-0 m-0 disabled:opacity-60">
      <h2 className="text-lg font-semibold mb-4">General</h2>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <SettingsRow
          title="Screen edge"
          description="Which side of the screen the panel docks to."
        >
          <ToggleGroup
            type="single"
            value={edge}
            onValueChange={(value) => {
              if (value === "left" || value === "right") {
                persist("edge", { edge: value }, () => setEdge(value));
              }
            }}
            variant="default"
            size="sm"
            aria-label="Screen edge"
            className="bg-muted/40 rounded-md p-0.5"
          >
            <ToggleGroupItem value="left" className="capitalize text-sm px-4">
              Left
            </ToggleGroupItem>
            <ToggleGroupItem value="right" className="capitalize text-sm px-4">
              Right
            </ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>

        <SettingsRow
          title="Width"
          description="Panel width in pixels."
          htmlFor="width-slider"
        >
          <div className="flex items-center gap-3 min-w-[220px]">
            <Slider
              id="width-slider"
              min={MIN_WIDTH}
              max={MAX_WIDTH}
              step={10}
              value={[Math.round(width)]}
              onValueChange={(values) => setWidth(values[0])}
              onValueCommit={(values) => {
                const next = values[0];
                if (next !== initial.width) {
                  persist("width", { width: next }, () => undefined);
                }
              }}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground tabular-nums w-14 text-right">
              {Math.round(width)}px
            </span>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Focus polling"
          description="Watch the frontmost window and highlight the matching worktree."
          htmlFor="focus-polling"
          last
        >
          <Switch
            id="focus-polling"
            checked={focusPolling}
            onCheckedChange={(next) => {
              persist("focusPolling", { focusPolling: next }, () => setFocusPolling(next));
            }}
          />
        </SettingsRow>
      </div>
    </fieldset>
  );
}

interface SettingsRowProps {
  title: string;
  description: string;
  htmlFor?: string;
  last?: boolean;
  children: ReactNode;
}

function SettingsRow({ title, description, htmlFor, last, children }: SettingsRowProps) {
  const heading = htmlFor ? (
    <Label htmlFor={htmlFor} className="text-base font-medium cursor-pointer">
      {title}
    </Label>
  ) : (
    <span className="text-base font-medium">{title}</span>
  );

  return (
    <div
      className={`flex items-center justify-between gap-6 px-5 py-4 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <div className="flex flex-col gap-1 min-w-0">
        {heading}
        <p className="text-sm text-muted-foreground m-0">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
