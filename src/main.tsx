import React from "react";
import ReactDOM from "react-dom/client";
import { attachConsole } from "@tauri-apps/plugin-log";
import App from "./App";
import {
  ChromeProvider,
  HostLifecycleProvider,
  LocaleProvider,
  ShellUpdateProvider,
  shellLog,
} from "./shell";

if (import.meta.env.DEV) {
  void attachConsole();
}
void shellLog.info("boot", "webview started");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <ChromeProvider>
        <HostLifecycleProvider>
          <ShellUpdateProvider>
            <App />
          </ShellUpdateProvider>
        </HostLifecycleProvider>
      </ChromeProvider>
    </LocaleProvider>
  </React.StrictMode>,
);
