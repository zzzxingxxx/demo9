import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MODEL_OPTIONS, parseTheme, SHORTCUTS, type ThemeName } from "@wb/shared";

type SettingsPayload = {
  model: string;
  keyConfigured: boolean;
  keyError: { code: string; error: string } | null;
};

const MODEL_KEY = "wb.model";
const THEME_KEY = "wb.theme";

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [model, setModel] = useState(localStorage.getItem(MODEL_KEY) || "grok-4.5");
  const [theme, setTheme] = useState<ThemeName>(parseTheme(localStorage.getItem(THEME_KEY)));

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        const body = (await res.json()) as SettingsPayload;
        setData(body);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "无法读取设置");
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="settings">
      <h1>设置</h1>
      <p>
        <Link to="/">返回工作台</Link>
      </p>
      {loadError ? <p className="warn">{loadError}</p> : null}
      {data ? (
        <div className="kv">
          <span>API Key</span>
          <span className={data.keyConfigured ? undefined : "warn"}>
            {data.keyConfigured ? "已配置（仅服务端）" : data.keyError?.error}
          </span>
          <span>默认模型</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="默认模型">
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span>主题</span>
          <select
            value={theme}
            onChange={(e) => setTheme(parseTheme(e.target.value))}
            aria-label="主题"
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      ) : null}
      <h2>快捷键</h2>
      <div className="kv">
        {SHORTCUTS.map((s) => (
          <span key={s.keys} style={{ display: "contents" }}>
            <span>{s.keys}</span>
            <span>{s.action}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
