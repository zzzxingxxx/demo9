import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { readListenHost, readListenPort } from "./lib/env.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../");
config({ path: resolve(root, ".env") });

const hostname = readListenHost(process.env);
const port = readListenPort(process.env);

if (hostname !== "127.0.0.1") {
  throw new Error(`拒绝监听 ${hostname}，只允许 127.0.0.1`);
}

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`server http://${info.address}:${info.port}`);
});
