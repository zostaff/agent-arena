import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("no #root element");
createRoot(el).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
