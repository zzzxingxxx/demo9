import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path"),
  description: text("description").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  parentId: text("parent_id"),
  branchFrom: text("branch_from"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull()
});

export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;

export const knowledge = sqliteTable("knowledge", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  tags: text("tags").notNull().default(""),
  sourceName: text("source_name").notNull(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull()
});

export type KnowledgeDoc = typeof knowledge.$inferSelect;

export const customSkills = sqliteTable("custom_skills", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  name: text("name").notNull(),
  persona: text("persona").notNull().default(""),
  defaultRefs: text("default_refs").notNull().default(""),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at").notNull()
});

export type CustomSkillRow = typeof customSkills.$inferSelect;

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  kind: text("kind").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  createdAt: integer("created_at").notNull()
});

export type UsageEvent = typeof usageEvents.$inferSelect;

export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  createdAt: integer("created_at").notNull()
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  command: text("command").notNull(),
  argsJson: text("args_json").notNull().default("[]"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull()
});

export type McpServerRow = typeof mcpServers.$inferSelect;

export const scheduledTasks = sqliteTable("scheduled_tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  intervalMs: integer("interval_ms").notNull(),
  nextRun: integer("next_run").notNull(),
  lastRun: integer("last_run"),
  action: text("action").notNull(),
  payload: text("payload").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull()
});

export type ScheduledTaskRow = typeof scheduledTasks.$inferSelect;

export const knowledgeVectors = sqliteTable("knowledge_vectors", {
  id: text("id").primaryKey(),
  docId: text("doc_id").notNull(),
  projectId: text("project_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  vectorJson: text("vector_json").notNull()
});

export type KnowledgeVectorRow = typeof knowledgeVectors.$inferSelect;

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});
