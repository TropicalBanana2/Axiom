import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildUserscript } from "./scripts/buildUserscript.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_SCHEMA_PATH = path.join(__dirname, ".axiom-dev.json");
const TEMPLATE_PATH   = path.join(__dirname, "..", "axiom.user.js");

function readDevSchema() {
  try { return JSON.parse(fs.readFileSync(DEV_SCHEMA_PATH, "utf8")); }
  catch { return null; }
}

// Dev plugin: serves /axiom.user.js generated from the current dev
// schema, accepts POSTs from the editor to update that schema, and
// broadcasts changes over an SSE channel so the running userscript
// can re-render in place without a Tampermonkey re-pull.
function axiomDevPlugin() {
  // Set of live SSE response streams. Each editor change fans out
  // to every connected client.
  const sseClients = new Set();
  function broadcastSchema(schema) {
    const payload = `event: schema\ndata: ${JSON.stringify(schema)}\n\n`;
    for (const client of sseClients) {
      try { client.write(payload); }
      catch { sseClients.delete(client); }
    }
  }
  // Keepalive — some proxies and browsers drop idle SSE connections.
  setInterval(() => {
    for (const client of sseClients) {
      try { client.write(`: keepalive\n\n`); }
      catch { sseClients.delete(client); }
    }
  }, 25000).unref?.();

  return {
    name: "axiom-dev",
    configureServer(server) {
      // GET /axiom.user.js — Tampermonkey pulls this on install + update.
      server.middlewares.use("/axiom.user.js", (req, res, next) => {
        if (req.method !== "GET") return next();
        const schema = readDevSchema();
        let body;
        try {
          body = buildUserscript({ templatePath: TEMPLATE_PATH, schema });
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain");
          res.end(`// Build failed: ${err.message}`);
          return;
        }
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      });

      // GET /__axiom/events — SSE channel that pushes schema updates
      // to every connected userscript. Origin is `*` so EventSource
      // works from the zombs.io HTTPS page (browsers exempt localhost
      // from mixed-content blocking).
      server.middlewares.use("/__axiom/events", (req, res, next) => {
        if (req.method !== "GET") return next();
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "X-Accel-Buffering": "no",
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
        // Send the current schema immediately so a fresh connection
        // doesn't have to wait for the next edit.
        const current = readDevSchema();
        if (current) res.write(`event: schema\ndata: ${JSON.stringify(current)}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
      });

      // POST /__axiom/dev-schema — editor pushes its current schema here
      // so the next /axiom.user.js fetch reflects it AND every live
      // userscript receives the update over SSE.
      server.middlewares.use("/__axiom/dev-schema", async (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          const schema = JSON.parse(raw);
          fs.writeFileSync(DEV_SCHEMA_PATH, JSON.stringify(schema, null, 2));
          broadcastSchema(schema);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, clients: sseClients.size }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end(String(err && err.message || err));
        }
      });

      // GET /__axiom/clients — small endpoint the editor polls to show
      // "N userscripts connected" in its bottom bar.
      server.middlewares.use("/__axiom/clients", (req, res, next) => {
        if (req.method !== "GET") return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ count: sseClients.size }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), axiomDevPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    // CORS so Tampermonkey's installation request is unblocked even
    // when zombs.io fetches the script via its own origin context.
    cors: true,
  },
});
