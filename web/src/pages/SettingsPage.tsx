import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MODEL_OPTIONS, parseTheme, SHORTCUTS, type ThemeName } from "@wb/shared";
import { apiGet, apiSend } from "../api";

type SettingsPayload = {
  model: string;
  keyConfigured: boolean;
  keyError: { code: string; error: string } | null;
  requestLog?: boolean;
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
  const [requestLog, setRequestLog] = useState(false);
  const [usage, setUsage] = useState<string>("");
  const [skillName, setSkillName] = useState("");
  const [skillPersona, setSkillPersona] = useState("");
  const [skillRefs, setSkillRefs] = useState("");
  const [skillPrompt, setSkillPrompt] = useState("");
  const [customSkills, setCustomSkills] = useState<Array<{ id: string; name: string; builtin?: boolean }>>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        const body = (await res.json()) as SettingsPayload;
        setData(body);
        setRequestLog(Boolean(body.requestLog));
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "无法读取设置");
      });
  }, []);

  useEffect(() => {
    apiGet<{ summary: { count: number; tokensIn: number; tokensOut: number; perDay: Array<{ day: string; count: number; tokens: number }> } }>(
      "/api/usage"
    )
      .then((d) => {
        const days = d.summary.perDay.map((x) => `${x.day} ${x.count}次/${x.tokens}tok`).join("；");
        setUsage(`次数 ${d.summary.count} · in ${d.summary.tokensIn} · out ${d.summary.tokensOut}${days ? ` · ${days}` : ""}`);
      })
      .catch(() => undefined);
    apiGet<{ skills: Array<{ id: string; name: string; builtin?: boolean }> }>("/api/skills")
      .then((d) => setCustomSkills(d.skills.filter((s) => !s.builtin)))
      .catch(() => undefined);
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
      <h2>用量</h2>
      <p className="hint">{usage || "暂无用量"}</p>
      <label className="hint">
        <input
          type="checkbox"
          checked={requestLog}
          onChange={async (e) => {
            const next = e.target.checked;
            setRequestLog(next);
            await apiSend("/api/settings", "PATCH", { requestLog: next });
          }}
        />{" "}
        记录请求日志
      </label>
      <h2>自定义技能</h2>
      <form
        className="stack"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          await apiSend("/api/skills", "POST", {
            name: skillName,
            persona: skillPersona,
            defaultRefs: skillRefs,
            prompt: skillPrompt
          });
          setSkillName("");
          setSkillPersona("");
          setSkillRefs("");
          setSkillPrompt("");
          const d = await apiGet<{ skills: Array<{ id: string; name: string; builtin?: boolean }> }>("/api/skills");
          setCustomSkills(d.skills.filter((s) => !s.builtin));
        }}
      >
        <input value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder="技能名称" required />
        <input value={skillPersona} onChange={(e) => setSkillPersona(e.target.value)} placeholder="人设" />
        <input value={skillRefs} onChange={(e) => setSkillRefs(e.target.value)} placeholder="默认引用" />
        <input value={skillPrompt} onChange={(e) => setSkillPrompt(e.target.value)} placeholder="提示词" required />
        <button className="btn btn-primary" type="submit">
          新增技能
        </button>
      </form>
      {customSkills.map((s) => (
        <div key={s.id} className="hint">
          {s.name}{" "}
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await apiSend(`/api/skills/${s.id}`, "DELETE");
              setCustomSkills((prev) => prev.filter((x) => x.id !== s.id));
            }}
          >
            删除
          </button>
        </div>
      ))}
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
