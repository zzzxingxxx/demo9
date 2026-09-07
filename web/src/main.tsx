import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { parseTheme } from "@wb/shared";
import { App } from "./App";
import { applyTheme } from "./pages/SettingsPage";
import "./monacoEnv";
import "./styles.css";

applyTheme(parseTheme(localStorage.getItem("wb.theme")));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
