import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type SettingsPayload = {
  model: string;
  keyConfigured: boolean;
  keyError: { code: string; error: string } | null;
};

export function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="settings">
      <h1>设置</h1>
      <p>
        <Link to="/">返回工作台</Link>
      </p>
      {loadError ? <p className="warn">{loadError}</p> : null}
      {data ? (
        <div className="kv">
          <span>默认模型</span>
          <span>{data.model}</span>
          <span>API Key</span>
          <span className={data.keyConfigured ? undefined : "warn"}>
            {data.keyConfigured ? "已配置（仅服务端）" : data.keyError?.error}
          </span>
        </div>
      ) : null}
    </div>
  );
}
