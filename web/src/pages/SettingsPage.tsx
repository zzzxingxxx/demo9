import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Command,
  Cpu,
  LoaderCircle,
  Moon,
  Palette,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Sun,
  Trash2,
  X
} from "lucide-react";
import {
  MODEL_OPTIONS,
  parseFontSize,
  parseTheme,
  type ThemeName
} from "@wb/shared";
import { apiGet, apiSend } from "../api";
import { useWorkbench } from "../store";

type SettingsPayload = {
  model: string;
  keyConfigured: boolean;
  keyError: { code: string; error: string } | null;
  requestLog?: boolean;
  embedding?: {
    configured: boolean;
    baseUrl: string;
    model: string;
    keyConfigured: boolean;
  };
};

type UsageSummary = {
  count: number;
  tokensIn: number;
  tokensOut: number;
  perDay: Array<{ day: string; count: number; tokens: number }>;
};

type Skill = {
  id: string;
  name: string;
  builtin?: boolean;
  persona?: string;
  defaultRefs?: string;
  prompt?: string;
};
const MODEL_KEY = "wb.model";
const THEME_KEY = "wb.theme";

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
}

export function applyFontSize(size: number) {
  document.documentElement.style.setProperty(
    "--app-font-size",
    `${parseFontSize(size)}px`
  );
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(
    localStorage.getItem(MODEL_KEY) || "grok-4.5"
  );
  const [theme, setTheme] = useState<ThemeName>(
    parseTheme(localStorage.getItem(THEME_KEY))
  );
  const fontSize = useWorkbench((s) => s.fontSize);
  const setFontSize = useWorkbench((s) => s.setFontSize);
  const [requestLog, setRequestLog] = useState(false);
  const [savingLog, setSavingLog] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillPersona, setSkillPersona] = useState("");
  const [skillRefs, setSkillRefs] = useState("");
  const [skillPrompt, setSkillPrompt] = useState("");
  const [customSkills, setCustomSkills] = useState<Skill[]>([]);
  const [savingSkill, setSavingSkill] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [xaiKey, setXaiKey] = useState("");
  const [embeddingUrl, setEmbeddingUrl] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [embeddingKey, setEmbeddingKey] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<SettingsPayload>("/api/settings")
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setRequestLog(Boolean(body.requestLog));
        setEmbeddingUrl(body.embedding?.baseUrl || "");
        setEmbeddingModel(body.embedding?.model || "");
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "无法读取设置");
      });
    apiGet<{ summary: UsageSummary }>("/api/usage")
      .then((result) => {
        if (!cancelled) setUsage(result.summary);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "无法读取用量");
      });
    apiGet<{ skills: Skill[] }>("/api/skills")
      .then((result) => {
        if (!cancelled)
          setCustomSkills(result.skills.filter((skill) => !skill.builtin));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "无法读取技能");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  async function changeRequestLog(next: boolean) {
    if (savingLog) return;
    const previous = requestLog;
    setSavingLog(true);
    setRequestLog(next);
    setError(null);
    try {
      await apiSend("/api/settings", "PATCH", { requestLog: next });
    } catch (err) {
      setRequestLog(previous);
      setError(err instanceof Error ? err.message : "无法保存设置");
    } finally {
      setSavingLog(false);
    }
  }

  async function createSkill(event: FormEvent) {
    event.preventDefault();
    if (savingSkill || !skillName.trim() || !skillPrompt.trim()) return;
    setSavingSkill(true);
    setError(null);
    try {
      await apiSend(
        editingSkill ? `/api/skills/${editingSkill}` : "/api/skills",
        editingSkill ? "PATCH" : "POST",
        {
          name: skillName.trim(),
          persona: skillPersona,
          defaultRefs: skillRefs,
          prompt: skillPrompt
        }
      );
      setSkillName("");
      setEditingSkill(null);
      setSkillPersona("");
      setSkillRefs("");
      setSkillPrompt("");
      const result = await apiGet<{ skills: Skill[] }>("/api/skills");
      setCustomSkills(result.skills.filter((skill) => !skill.builtin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法新增技能");
    } finally {
      setSavingSkill(false);
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <Link
          to="/"
          className="gpt-icon"
          title="返回工作台"
          aria-label="返回工作台"
        >
          <ArrowLeft size={18} />
        </Link>
        <Command size={18} />
        <Link to="/">工作台</Link>
        <span>偏好设置</span>
      </header>
      <div className="settings-inner">
        <div className="settings-header">
          <h1>设置</h1>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <section className="settings-section" aria-labelledby="general-title">
          <h2 id="general-title">
            <Cpu size={18} />
            模型与连接
          </h2>
          <div className="settings-row">
            <span>API 连接</span>
            <span
              className={`connection-status ${data ? (data.keyConfigured ? "ok" : "warn") : ""}`}
              title={data?.keyError?.error}
            >
              {data ? (
                data.keyConfigured ? (
                  <>
                    <CheckCircle2 />
                    已配置
                  </>
                ) : (
                  <>
                    <CircleAlert />
                    未配置 API Key
                  </>
                )
              ) : (
                <>
                  <LoaderCircle className="spin" />
                  正在读取
                </>
              )}
            </span>
          </div>
          <div className="settings-row">
            <label htmlFor="default-model">默认模型</label>
            <select
              id="default-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.replace("grok-", "Grok ")}
                </option>
              ))}
            </select>
          </div>
          <form
            className="stack provider-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingProvider(true);
              setError(null);
              try {
                await apiSend("/api/providers", "PATCH", {
                  xaiApiKey: xaiKey || undefined,
                  embeddingBaseUrl: embeddingUrl,
                  embeddingModel,
                  embeddingApiKey: embeddingKey || undefined
                });
                setXaiKey("");
                setEmbeddingKey("");
                setData(await apiGet<SettingsPayload>("/api/settings"));
              } catch (err) {
                setError(err instanceof Error ? err.message : "配置保存失败");
              } finally {
                setSavingProvider(false);
              }
            }}
          >
            <label>
              xAI API Key
              <input
                type="password"
                autoComplete="off"
                value={xaiKey}
                onChange={(e) => setXaiKey(e.target.value)}
                placeholder={data?.keyConfigured ? "已配置" : "xai-..."}
              />
            </label>
            <label>
              语义检索服务地址
              <input
                value={embeddingUrl}
                onChange={(e) => setEmbeddingUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label>
              Embedding 模型
              <input
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                placeholder="text-embedding-3-small"
              />
            </label>
            <label>
              Embedding API Key
              <input
                type="password"
                autoComplete="off"
                value={embeddingKey}
                onChange={(e) => setEmbeddingKey(e.target.value)}
                placeholder={data?.embedding?.keyConfigured ? "已配置" : "可选"}
              />
            </label>
            <div className="row-actions">
              <button className="btn btn-primary" disabled={savingProvider}>
                <Save size={15} />
                保存连接
              </button>
              <span className="hint">
                语义检索：{data?.embedding?.configured ? "已配置" : "未配置"}
              </span>
            </div>
          </form>
        </section>
        <section
          className="settings-section"
          aria-labelledby="appearance-title"
        >
          <h2 id="appearance-title">
            <Palette size={18} />
            外观
          </h2>
          <div className="settings-row">
            <span>主题</span>
            <div className="theme-control" role="group" aria-label="主题">
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                <Sun size={15} />
                浅色
              </button>
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                <Moon size={15} />
                深色
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label htmlFor="font-size">字号</label>
            <input
              id="font-size"
              type="number"
              min={12}
              max={22}
              step={1}
              value={fontSize}
              onChange={(event) =>
                setFontSize(parseFontSize(event.target.value))
              }
            />
          </div>
        </section>
        <section className="settings-section" aria-labelledby="usage-title">
          <h2 id="usage-title">
            <Activity size={18} />
            用量
          </h2>
          <div className="usage-metrics">
            <div>
              <span>请求次数</span>
              <strong>{usage?.count.toLocaleString() ?? "--"}</strong>
            </div>
            <div>
              <span>输入 Token</span>
              <strong>{usage?.tokensIn.toLocaleString() ?? "--"}</strong>
            </div>
            <div>
              <span>输出 Token</span>
              <strong>{usage?.tokensOut.toLocaleString() ?? "--"}</strong>
            </div>
          </div>
          {usage && usage.perDay.length > 0 && (
            <table className="usage-history">
              <thead>
                <tr>
                  <th scope="col">日期</th>
                  <th scope="col">请求次数</th>
                  <th scope="col">Token</th>
                </tr>
              </thead>
              <tbody>
                {usage.perDay.map((day) => (
                  <tr key={day.day}>
                    <td>{day.day}</td>
                    <td>{day.count.toLocaleString()}</td>
                    <td>{day.tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="settings-row">
            <label htmlFor="request-log">记录请求日志</label>
            <label className="toggle">
              <input
                id="request-log"
                type="checkbox"
                checked={requestLog}
                disabled={!data || savingLog}
                onChange={(event) =>
                  void changeRequestLog(event.target.checked)
                }
              />
              <span className="toggle-track" />
            </label>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="skills-title">
          <h2 id="skills-title">
            <Sparkles size={18} />
            自定义技能
          </h2>
          {customSkills.map((skill) => (
            <div key={skill.id} className="custom-skill-row">
              <Sparkles size={16} />
              <span>{skill.name}</span>
              <button
                type="button"
                className="gpt-icon"
                title={`编辑 ${skill.name}`}
                aria-label={`编辑 ${skill.name}`}
                onClick={() => {
                  setEditingSkill(skill.id);
                  setSkillName(skill.name);
                  setSkillPersona(skill.persona || "");
                  setSkillRefs(skill.defaultRefs || "");
                  setSkillPrompt(skill.prompt || "");
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="gpt-icon btn-danger"
                title={`删除 ${skill.name}`}
                aria-label={`删除 ${skill.name}`}
                disabled={deletingSkill !== null}
                onClick={async () => {
                  setDeletingSkill(skill.id);
                  setError(null);
                  try {
                    await apiSend(`/api/skills/${skill.id}`, "DELETE");
                    setCustomSkills((previous) =>
                      previous.filter((item) => item.id !== skill.id)
                    );
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "无法删除技能"
                    );
                  } finally {
                    setDeletingSkill(null);
                  }
                }}
              >
                {deletingSkill === skill.id ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Trash2 size={15} />
                )}
              </button>
            </div>
          ))}
          <form
            className="stack skill-form"
            onSubmit={(event) => void createSkill(event)}
          >
            <label>
              技能名称
              <input
                value={skillName}
                onChange={(event) => setSkillName(event.target.value)}
                placeholder="例如：代码审查"
                required
              />
            </label>
            <label>
              角色
              <input
                value={skillPersona}
                onChange={(event) => setSkillPersona(event.target.value)}
                placeholder="例如：资深工程师"
              />
            </label>
            <label className="full-width">
              默认引用
              <input
                value={skillRefs}
                onChange={(event) => setSkillRefs(event.target.value)}
                placeholder="@规则"
              />
            </label>
            <label className="full-width">
              提示词
              <textarea
                value={skillPrompt}
                onChange={(event) => setSkillPrompt(event.target.value)}
                placeholder="输入技能提示词"
                required
              />
            </label>
            <button
              className="btn btn-primary full-width"
              type="submit"
              disabled={savingSkill || !skillName.trim() || !skillPrompt.trim()}
            >
              {savingSkill ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Plus size={15} />
              )}
              {savingSkill
                ? "正在保存"
                : editingSkill
                  ? "保存技能"
                  : "新增技能"}
            </button>
            {editingSkill && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditingSkill(null);
                  setSkillName("");
                  setSkillPersona("");
                  setSkillRefs("");
                  setSkillPrompt("");
                }}
              >
                <X size={15} />
                取消编辑
              </button>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
