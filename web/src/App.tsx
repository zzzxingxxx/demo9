import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Settings } from "lucide-react";
import { Workbench } from "./pages/Workbench";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          AI 工作台
        </Link>
        <div className="top-actions">
          <Link to="/settings" className="icon-btn" aria-label="设置">
            <Settings size={14} />
            设置
          </Link>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Workbench />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
