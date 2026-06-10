// localhost.js — Axiom HTTP host on :80.
//
// Serves the modded zombs.io page from public/, hands out a local-user
// token (no-login mode), proxies the zombs.io leaderboard, and serves the
// active schema (which the in-game panel pulls on boot).

const path = require("path");
const fs = require("fs");
const express = require("express");
const { stmts } = require("./db");
const { registerUser, verifyToken, issueToken } = require("./auth");
const { schemaGet, schemaSet } = require("./db");
const crypto = require("crypto");

// No-login mode: the entire install is single-user. We ensure a
// canonical "local" user exists at boot and hand out a token to anyone
// who asks. The JWT plumbing stays intact (so existing
// authMiddleware / WS auth keep working), we just remove the password
// gate. If you ever want multi-user back, drop this block and the
// /api/auth/local route.
const { stmts: _stmts } = require("./db");
let _localUser = _stmts.findUserByUsername.get("local");
if (!_localUser) {
  registerUser("local", crypto.randomBytes(24).toString("hex"));
  _localUser = _stmts.findUserByUsername.get("local");
  console.log(`[auth] created local user id=${_localUser.id}`);
}

const PORT = parseInt(process.env.AXIOM_HTTP_PORT || "80", 10);
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ----- auth ------------------------------------------------------------
// No-login mode: the only entry point is GET /api/auth/local (below),
// which hands out a token for the canonical "local" user.
// The old POST /api/login and /api/register were removed because Axiom
// is single-device by design. If you ever want multi-user back, restore
// them from git history.

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const decoded = token && verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "unauthorized" });
  req.userId = decoded.uid;
  req.username = decoded.u;
  next();
}

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ id: req.userId, username: req.username });
});

// No-login token issuer — any caller gets a token for the local user.
// Self-hosted single-device install only; do NOT expose this server on
// a public IP without re-enabling password auth.
app.get("/api/auth/local", (_req, res) => {
  res.json({
    token: issueToken(_localUser.id, _localUser.username),
    user: { id: _localUser.id, username: _localUser.username },
  });
});

// ----- schema (Axiom UI tree) ------------------------------------------
const { defaultSchema } = require("./defaultSchema");
// Auto-migrate: if the schema baked into the JS bundle has a higher
// schemaVersion than what's in the DB, reseed. This lets us ship
// updated default scripts (e.g. fixed chatspam channel) without
// asking users to manually wipe their install.
const _stored = schemaGet("schema");
const _bundled = defaultSchema();
let seededSchema;
if (!_stored || (_bundled.schemaVersion || 0) > (_stored.schemaVersion || 0)) {
  console.log(`[schema] reseeding to v${_bundled.schemaVersion} (was v${_stored?.schemaVersion || "none"})`);
  schemaSet("schema", _bundled);
  seededSchema = _bundled;
} else {
  seededSchema = _stored;
}

// Schema is readable without auth (the modded client needs it before
// the user logs in). Write requires auth.
app.get("/api/schema", (_req, res) => {
  res.json(schemaGet("schema") || seededSchema);
});

// ----- per-user persisted data -----------------------------------------
app.get("/api/state", authMiddleware, (req, res) => {
  const sessions = stmts.listSessions.all(req.userId);
  const flags = stmts.listFlags.all(req.userId);
  const keys = stmts.listKeys.all(req.userId);
  res.json({ sessions, flags, keys });
});

// ----- zombs.io leaderboard proxy --------------------------------------
const lbCache = new Map();
app.get("/zombs-leaderboard", async (req, res) => {
  const category = ["wave", "score"].includes(req.query.category) ? req.query.category : "wave";
  const time = ["24h", "7d", "all"].includes(req.query.time) ? req.query.time : "7d";
  const cacheKey = `${category}:${time}`;
  const cached = lbCache.get(cacheKey);
  res.set("Cache-Control", "no-store");
  if (cached && Date.now() - cached.t < 60000) return res.json(cached.data);
  try {
    const r = await fetch(
      `https://zombs.io/leaderboard/data?category=${category}&time=${time}`,
      { headers: { Accept: "application/json", "User-Agent": "axiom" } }
    );
    if (!r.ok) return res.status(r.status).json({ status: "error", parties: [] });
    const data = await r.json();
    lbCache.set(cacheKey, { t: Date.now(), data });
    res.json(data);
  } catch {
    res.status(502).json({ status: "error", parties: [] });
  }
});

// ----- server populations (community scanner proxy) ---------------------
// The Banshee scanner VPS tracks per-server populations + leaderboards
// (same API the old client's intro screen used). Proxied with a short
// cache so every picker can label servers without hammering the scanner,
// and so an outage degrades to stale data instead of broken UI.
const SCANNER_URL = "http://95.111.234.133/api/servers";
let popsCache = { t: 0, data: null };
app.get("/api/server-pops", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (popsCache.data && Date.now() - popsCache.t < 60000) return res.json(popsCache.data);
  try {
    const r = await fetch(SCANNER_URL, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const raw = await r.json();
    const data = (Array.isArray(raw) ? raw : []).map((s) => ({
      serverId: s.serverId,
      population: s.population | 0,
      lastScanned: s.lastScanned | 0,
    }));
    popsCache = { t: Date.now(), data };
    res.json(data);
  } catch {
    res.json(popsCache.data || []);   // stale-if-error
  }
});

// ----- world resource atlas --------------------------------------------
// Trees / stones / camps the fleet has seen on a server (static spots,
// captured by sessions.js → worldSpots). Consumed by the in-game
// "World Resources" overlay, which injects them as client entities.
const { getAtlas } = require("./worldSpots");
app.get("/api/spots/:serverId", (req, res) => {
  const serverId = String(req.params.serverId || "");
  if (!/^v\d{1,6}$/.test(serverId)) return res.status(400).json({ spots: {} });
  const spots = getAtlas(serverId);
  res.set("Cache-Control", "no-store");
  res.json({ serverId, count: Object.keys(spots).length, spots });
});

// ----- asset manifest (for the modded client preloader) ---------------
const picturesRoot = path.join(__dirname, "..", "public", "asset", "pictures");
function walkAssets(dir = picturesRoot) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkAssets(p));
    else if (/\.(svg|png|ico)$/i.test(ent.name)) {
      const rel = path.relative(path.join(__dirname, "..", "public"), p).replace(/\\/g, "/");
      out.push(`./${rel}`);
    }
  }
  return out;
}
app.get("/asset-manifest.json", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(walkAssets());
});

// ----- routing ---------------------------------------------------------
// `/`     → landing page (marketing-style intro)
// `/app`  → dashboard (sessions manager, behaviours, server toggles)
// `/play` → modded zombs.io client
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html"))
);
app.get("/app", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "app.html"))
);
app.get("/play", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "client.html"))
);

const server = app.listen(PORT, () => {
  console.log(`[axiom-localhost] listening on :${PORT}`);
  console.log(`  visit  http://localhost:${PORT}`);
});
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `[axiom-localhost] port ${PORT} is already in use — another axiom-localhost ` +
      `instance is probably running (or set AXIOM_HTTP_PORT to a free port). ` +
      `Not starting a duplicate.`);
    process.exit(0);
  }
  console.error(`[axiom-localhost] server error:`, err);
  process.exit(1);
});
