import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Search, Settings } from "lucide-react";
import { CommandPalette } from "./components/CommandPalette";
import { Workbench } from "./pages/Workbench";
import { SettingsPage } from "./pages/SettingsPage";
import { useWorkbench } from "./store";

export function App() {
  const setPaletteOpen = useWorkbench((s) => s.setPaletteOpen);
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          AI 工作台
        </Link>
        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label="命令面板" onClick={() => setPaletteOpen(true)}>
            <Search size={14} />
            Ctrl+K
          </button>
          <Link to="/settings" className="icon-btn" aria-label="设置">
            <Settings size={14} />
            设置
          </Link>
        </div>
      </header>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<Workbench />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
