import React from "react";
import ReactDOM from "react-dom/client";
import { attachConsole } from "@tauri-apps/plugin-log";
import App from "./App";
import { ShellErrorBoundary } from "./components/chrome/ShellErrorBoundary";
import {
  bootstrapShellTheme,
  ChromeProvider,
  HostLifecycleProvider,
  LocaleProvider,
  ShellToastProvider,
  ShellUpdateProvider,
  shellLog,
  syncWebviewCanvasColor,
} from "./shell";

if (import.meta.env.DEV) {
  void attachConsole();
}
void shellLog.info("boot", "webview started");

syncWebviewCanvasColor(bootstrapShellTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <ShellToastProvider>
        <ChromeProvider>
          <ShellErrorBoundary>
            <HostLifecycleProvider>
              <ShellUpdateProvider>
                <App />
              </ShellUpdateProvider>
            </HostLifecycleProvider>
          </ShellErrorBoundary>
        </ChromeProvider>
      </ShellToastProvider>
    </LocaleProvider>
  </React.StrictMode>,
);
