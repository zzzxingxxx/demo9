import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { getDb } from "./lib/db/index.js";
import { readListenHost, readListenPort } from "./lib/env.js";
import { tickScheduledTasks } from "./lib/schedule.js";
import { loadProviderSettings } from "./lib/providerSettings.js";
import { closeProjectTerminals } from "./lib/terminalSessions.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../");
config({ path: resolve(root, ".env") });
process.env.REPO_ROOT = root;
await loadProviderSettings(await getDb());
process.on("exit", () => closeProjectTerminals());
process.on("SIGINT", () => {
  closeProjectTerminals();
  process.exit(0);
});
process.on("SIGTERM", () => {
  closeProjectTerminals();
  process.exit(0);
});

const hostname = readListenHost(process.env);
const port = readListenPort(process.env);

if (hostname !== "127.0.0.1") {
  throw new Error(`拒绝监听 ${hostname}，只允许 127.0.0.1`);
}

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`server http://${info.address}:${info.port}`);
});

setInterval(() => {
  getDb()
    .then((db) => tickScheduledTasks(db))
    .catch(() => undefined);
}, 30_000);
