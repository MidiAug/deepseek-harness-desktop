import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ChromeProvider } from "./shell";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ChromeProvider>
      <App />
    </ChromeProvider>
  </React.StrictMode>,
);
