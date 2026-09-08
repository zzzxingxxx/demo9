import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { appSettings } from "./db/schema.js";

export async function getSettingsMap(db: Db): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (existing[0]) {
    await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value });
  }
}
