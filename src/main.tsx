import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  ChromeProvider,
  HostLifecycleProvider,
  LocaleProvider,
  ShellUpdateProvider,
} from "./shell";

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
