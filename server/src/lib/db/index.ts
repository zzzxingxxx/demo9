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
  parent_id TEXT,
  branch_from TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  starred INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS custom_skills (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  default_refs TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  interval_ms INTEGER NOT NULL,
  next_run INTEGER NOT NULL,
  last_run INTEGER,
  action TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS knowledge_vectors (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  vector_json TEXT NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
    title, tags, body, project_id UNINDEXED, doc_id UNINDEXED
  );`
];

const ALTER_SQL = [
  "ALTER TABLE sessions ADD COLUMN parent_id TEXT",
  "ALTER TABLE sessions ADD COLUMN branch_from TEXT",
  "ALTER TABLE messages ADD COLUMN starred INTEGER NOT NULL DEFAULT 0"
];

export function sqliteUrlFromPath(filePath: string): string {
  const abs = path.resolve(filePath).replaceAll("\\", "/");
  return `file:${abs}`;
}

export async function openDb(filePath: string): Promise<{ db: Db; close: () => void }> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const client = createClient({ url: sqliteUrlFromPath(filePath) });
  for (const sql of CREATE_SQL) {
    try {
      await client.execute(sql);
    } catch {
      /* FTS5 may already exist or be unavailable; other tables use IF NOT EXISTS */
    }
  }
  for (const sql of ALTER_SQL) {
    try {
      await client.execute(sql);
    } catch {
      /* column already present on existing files */
    }
  }
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
