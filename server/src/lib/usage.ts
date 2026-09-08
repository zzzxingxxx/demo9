import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { requestLogs, usageEvents } from "./db/schema.js";

export type UsageRow = {
  kind: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: number;
};

export type UsageSummary = {
  count: number;
  tokensIn: number;
  tokensOut: number;
  perDay: Array<{ day: string; count: number; tokens: number }>;
};

export async function recordUsage(
  db: Db,
  input: { projectId?: string | null; kind: string; tokensIn?: number; tokensOut?: number }
): Promise<void> {
  await db.insert(usageEvents).values({
    id: randomUUID(),
    projectId: input.projectId ?? null,
    kind: input.kind,
    tokensIn: input.tokensIn ?? 0,
    tokensOut: input.tokensOut ?? 0,
    createdAt: Date.now()
  });
}

export async function recordRequestLog(
  db: Db,
  input: { method: string; path: string; status: number }
): Promise<void> {
  await db.insert(requestLogs).values({
    id: randomUUID(),
    method: input.method,
    path: input.path,
    status: input.status,
    createdAt: Date.now()
  });
}

export function summarizeUsage(events: UsageRow[], now = Date.now()): UsageSummary {
  const perDayMap = new Map<string, { count: number; tokens: number }>();
  let tokensIn = 0;
  let tokensOut = 0;
  for (const e of events) {
    tokensIn += e.tokensIn;
    tokensOut += e.tokensOut;
    const day = new Date(e.createdAt || now).toISOString().slice(0, 10);
    const cur = perDayMap.get(day) ?? { count: 0, tokens: 0 };
    cur.count += 1;
    cur.tokens += e.tokensIn + e.tokensOut;
    perDayMap.set(day, cur);
  }
  const perDay = [...perDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, count: v.count, tokens: v.tokens }));
  return { count: events.length, tokensIn, tokensOut, perDay };
}
