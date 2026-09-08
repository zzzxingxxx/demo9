import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { Workbench } from "./pages/Workbench";
import { applyFontSize, SettingsPage } from "./pages/SettingsPage";
import { useWorkbench } from "./store";

export function App() {
  const fontSize = useWorkbench((s) => s.fontSize);
  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);
  return (
    <div className="app">
      <CommandPalette />
      <Routes>
        <Route path="/" element={<Workbench />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
