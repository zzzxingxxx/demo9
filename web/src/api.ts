export type Project = {
  id: string;
  name: string;
  rootPath: string | null;
  description: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RulesPayload = {
  projectId: string;
  rootPath: string | null;
  file: string | null;
  content: string;
};

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return body;
}

export function apiGet<T>(url: string): Promise<T> {
  return fetch(url).then((res) => parse<T>(res));
}

export function apiSend<T>(url: string, method: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then((res) => parse<T>(res));
}
