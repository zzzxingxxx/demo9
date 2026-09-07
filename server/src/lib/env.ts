import { DEFAULT_MODEL, MISSING_API_KEY_CODE, type ApiErrorBody } from "@wb/shared";

export type AppEnv = {
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  APP_HOST?: string;
  SERVER_PORT?: string;
};

export function getMissingKeyError(
  env: Record<string, string | undefined> = process.env
): ApiErrorBody | null {
  const key = env.XAI_API_KEY?.trim();
  if (key) return null;
  return {
    code: MISSING_API_KEY_CODE,
    error: "未配置 XAI_API_KEY。请在仓库根目录的 .env 中填写，然后重启服务。"
  };
}

export function readListenHost(env: Record<string, string | undefined> = process.env): string {
  return env.APP_HOST?.trim() || "127.0.0.1";
}

export function readListenPort(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SERVER_PORT);
  return Number.isFinite(n) && n > 0 ? n : 3001;
}

export function readModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_MODEL?.trim() || DEFAULT_MODEL;
}

export function publicError(error: unknown): ApiErrorBody {
  if (error && typeof error === "object" && "code" in error && "error" in error) {
    const body = error as ApiErrorBody;
    if (typeof body.code === "string" && typeof body.error === "string") {
      return { code: body.code, error: body.error };
    }
  }
  if (error instanceof Error && error.message && !error.message.includes("\n")) {
    return { code: "INTERNAL", error: error.message };
  }
  return { code: "INTERNAL", error: "服务异常" };
}
