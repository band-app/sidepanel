// Thin typed wrapper around `@tauri-apps/api`'s `invoke()`. Each function maps
// to a `#[tauri::command]` exported in `src-tauri/src/lib.rs`.
//
// The real UI (PR 2) replaces the placeholder `App.tsx` and uses these from
// the components. Keeping a single module makes future refactors / mocking
// easier.

import { invoke } from "@tauri-apps/api/core";

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface Worktree {
  branch: string;
  path: string;
  head: string | null;
}

export interface WindowSettings {
  edge: "left" | "right";
  width: number;
  focusPolling: boolean;
}

export interface PublicSettings {
  window: WindowSettings;
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  addProject: (path: string) => invoke<Project>("add_project", { path }),
  removeProject: (id: string) => invoke<void>("remove_project", { id }),
  listWorktrees: (projectId: string) => invoke<Worktree[]>("list_worktrees", { projectId }),
  getSettings: () => invoke<PublicSettings>("get_settings"),
  updateSettings: (window: Partial<WindowSettings>) =>
    invoke<PublicSettings>("update_settings", { window }),
  workspaceFocus: (workspaceId: string) => invoke<void>("workspace_focus", { workspaceId }),
  workspaceClose: (workspaceId: string) => invoke<void>("workspace_close", { workspaceId }),
  getActiveWorkspace: () => invoke<string | null>("get_active_workspace"),
  detectActiveWorkspace: () => invoke<string | null>("detect_active_workspace"),
  pickFolder: () => invoke<string | null>("pick_folder"),
  revealInFinder: (path: string) => invoke<void>("reveal_in_finder", { path }),
  checkAppExists: (appName: string) => invoke<boolean>("check_app_exists", { appName }),
  openWithApp: (path: string, appName: string) => invoke<void>("open_with_app", { path, appName }),
};
