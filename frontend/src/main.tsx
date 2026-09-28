import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

// Self-hosted so the first paint needs no external request, which matters on a phone
// and keeps the app working offline.
import "@fontsource-variable/cairo";
import "./styles/index.css";

const container = document.getElementById("root");

if (!container) {
  // A hard failure here would otherwise be a blank page with no explanation.
  throw new Error('Root element "#root" is missing from index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
