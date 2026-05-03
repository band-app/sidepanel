import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SettingsWindow } from "./SettingsWindow";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root element in index.html");
}

const isSettingsWindow = getCurrentWindow().label === "settings";

createRoot(root).render(<StrictMode>{isSettingsWindow ? <SettingsWindow /> : <App />}</StrictMode>);
