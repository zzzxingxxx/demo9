import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type Db = LibSQLDatabase<typeof schema>;

let singleton: Db | null = null;
let singletonClient: Client | null = null;

const CREATE_SQL = [
  `CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT,
  description TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`
];

export function sqliteUrlFromPath(filePath: string): string {
  const abs = path.resolve(filePath).replaceAll("\\", "/");
  return `file:${abs}`;
}

export async function openDb(filePath: string): Promise<{ db: Db; close: () => void }> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const client = createClient({ url: sqliteUrlFromPath(filePath) });
  for (const sql of CREATE_SQL) await client.execute(sql);
  return {
    db: drizzle(client, { schema }),
    close: () => client.close()
  };
}

export async function getDb(): Promise<Db> {
  if (singleton) return singleton;
  const raw = process.env.DATABASE_URL?.replace(/^file:/, "") || "./data/app.db";
  const base = process.env.REPO_ROOT || process.cwd();
  const filePath = path.isAbsolute(raw) ? raw : path.resolve(base, raw);
  const opened = await openDb(filePath);
  singleton = opened.db;
  singletonClient = null;
  return singleton;
}

export function resetDbForTests(): void {
  singleton = null;
  singletonClient?.close();
  singletonClient = null;
}
