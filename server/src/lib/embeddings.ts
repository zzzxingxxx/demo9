import { pathError } from "./paths.js";

export function embeddingConfig() {
  const baseUrl = process.env.EMBEDDING_BASE_URL?.trim();
  const model = process.env.EMBEDDING_MODEL?.trim();
  return baseUrl && model
    ? {
        baseUrl: baseUrl.replace(/\/$/, ""),
        model,
        apiKey: process.env.EMBEDDING_API_KEY?.trim()
      }
    : null;
}

export async function embedDocuments(
  texts: string[]
): Promise<{ model: string; vectors: number[][] }> {
  const config = embeddingConfig();
  if (!config)
    throw pathError("EMBEDDING_NOT_CONFIGURED", "尚未配置语义检索模型");
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
    },
    body: JSON.stringify({ model: config.model, input: texts })
  });
  if (!response.ok)
    throw pathError(
      "EMBEDDING_FAILED",
      `语义检索服务返回 HTTP ${response.status}`
    );
  const payload = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
  };
  const data = payload.data?.sort((a, b) => a.index - b.index);
  if (
    !data ||
    data.length !== texts.length ||
    data.some(
      (d, i) =>
        d.index !== i ||
        !Array.isArray(d.embedding) ||
        !d.embedding.length ||
        d.embedding.some((n) => typeof n !== "number" || !Number.isFinite(n))
    )
  )
    throw pathError("EMBEDDING_FAILED", "向量服务响应格式错误");
  if (data.some((d) => d.embedding.length !== data[0]!.embedding.length))
    throw pathError("EMBEDDING_FAILED", "向量维数不一致");
  return {
    model: `${config.baseUrl}|${config.model}`,
    vectors: data.map((d) => d.embedding)
  };
}
