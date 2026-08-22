import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  ChromeProvider,
  HostLifecycleProvider,
  ShellUpdateProvider,
} from "./shell";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ChromeProvider>
      <HostLifecycleProvider>
        <ShellUpdateProvider>
          <App />
        </ShellUpdateProvider>
      </HostLifecycleProvider>
    </ChromeProvider>
  </React.StrictMode>,
);
