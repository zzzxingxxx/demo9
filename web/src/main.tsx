import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { parseFontSize, parseTheme } from "@wb/shared";
import { App } from "./App";
import { applyFontSize, applyTheme } from "./pages/SettingsPage";
import "./monacoEnv";
import "./styles.css";

applyTheme(parseTheme(localStorage.getItem("wb.theme")));
applyFontSize(parseFontSize(localStorage.getItem("wb.fontSize")));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
