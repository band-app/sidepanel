import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/tauri";
import { Button } from "@/components/ui/button";

interface Props {
  onAdded: () => void;
  onError: (msg: string) => void;
}

export function AddProjectButton({ onAdded, onError }: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const path = await api.pickFolder();
      if (path === null) {
        return; // user cancelled
      }
      await api.addProject(path);
      onAdded();
    } catch (e) {
      onError(`add_project: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={onClick}
      disabled={busy}
      aria-label="Add project"
      title="Add project"
      className="text-muted-foreground"
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
    </Button>
  );
}
