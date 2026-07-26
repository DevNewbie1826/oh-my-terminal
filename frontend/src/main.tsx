import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@xterm/xterm/css/xterm.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/terminal-header.css";
import "./styles/app-empty.css";
import "./styles/terminal-pane.css";
import "./styles/file-browser.css";
import "./styles/file-editor.css";
import "./styles/split-view.css";
import "./styles/system-stats.css";
import "./styles/mobile-input.css";
import "./styles/sidebar.css";
import "./styles/settings-menu.css";
import "./styles/sidebar-footer.css";
import "./styles/icon-button.css";
import "./styles/workspace-add-button.css";
import "./styles/sidebar-toggle.css";
import "./styles/session-tree.css";
import "./styles/mobile-drawer.css";
import "./styles/modal-dialog.css";
import "./styles/wizard.css";
import "./styles/form-controls.css";
import "./styles/workspace-wizard-steps.css";
import "./styles/login.css";
import "./styles/confirm-dialog.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
