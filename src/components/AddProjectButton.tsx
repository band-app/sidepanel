import { useState } from "react";
import { api } from "../api/tauri";

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
    <button type="button" className="primary-button" onClick={onClick} disabled={busy}>
      {busy ? "Adding…" : "+ Add project"}
    </button>
  );
}
