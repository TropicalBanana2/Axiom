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

// ----- panel schema + editable layout ---------------------------------
// The served panel schema is assembled from two layers (see
// schemaBuilder.js): the code-shipped feature LIBRARY + SCRIPTS, and a
// user-editable LAYOUT (tabs/sections/feature order) stored in the DB.
// New scripts ship via code; the user's arrangement survives updates.
const { assemble, libraryView, defaultLayout, sanitizeLayout, controllers } = require("./schemaBuilder");
const LAYOUT_KEY = "panelLayout";
// Bumped on every layout change so the in-game panel can cheaply poll for
// "something changed, re-fetch" — that's the "changeable on the fly" path.
let panelRev = Date.now();

function currentLayout() {
  try { return schemaGet(LAYOUT_KEY) || defaultLayout(); } catch { return defaultLayout(); }
}

// Served panel schema (library + layout). Public read — the modded client
// fetches it before login.
app.get("/api/schema", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(assemble(currentLayout()));
});
// Lightweight revision probe for live updates.
app.get("/api/panel/rev", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ rev: panelRev });
});
// The full feature library (every draggable feature) + the multi-session
// controllers catalogue, for the Builder.
app.get("/api/panel/library", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ features: libraryView(), controllers: controllers() });
});
// The current editable layout.
app.get("/api/panel/layout", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(currentLayout());
});
// Save a layout (auth). Sanitised before storing; bumps the revision so
// open panels pick it up on their next poll.
app.put("/api/panel/layout", authMiddleware, (req, res) => {
  const clean = sanitizeLayout(req.body);
  if (!clean) return res.status(400).json({ error: "invalid layout" });
  schemaSet(LAYOUT_KEY, clean);
  panelRev = Date.now();
  res.json({ ok: true, rev: panelRev, layout: clean });
});
// Reset to the code default layout (auth).
app.post("/api/panel/layout/reset", authMiddleware, (_req, res) => {
  const fresh = defaultLayout();
  schemaSet(LAYOUT_KEY, fresh);
  panelRev = Date.now();
  res.json({ ok: true, rev: panelRev, layout: fresh });
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

// ----- ideal farm + base spot finder ----------------------------------
// Ranks the best places to set up — a tight tree+stone farm pair beside a
// large open area, far from enemy bases. Only works where the server's
// spots are EXPOSED (a non-empty atlas); otherwise returns exposed:false.
const { findSpots } = require("./spotFinder");
const SCANNER_STASHES = "http://95.111.234.133/api/stashes?serverId=";
const stashCache = new Map();   // serverId -> { t, bases }
async function enemyBases(serverId) {
  const c = stashCache.get(serverId);
  if (c && Date.now() - c.t < 60000) return c.bases;
  try {
    const r = await fetch(SCANNER_STASHES + encodeURIComponent(serverId), { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    const bases = (Array.isArray(d) ? d : [])
      .map((b) => b.position).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    stashCache.set(serverId, { t: Date.now(), bases });
    return bases;
  } catch { return (c && c.bases) || []; }
}
app.get("/api/spotfinder/:serverId", async (req, res) => {
  const serverId = String(req.params.serverId || "");
  if (!/^v\d{1,6}$/.test(serverId)) return res.status(400).json({ error: "bad server" });
  res.set("Cache-Control", "no-store");
  const spots = Object.values(getAtlas(serverId));
  if (spots.length === 0) {
    return res.json({
      exposed: false, count: 0, candidates: [],
      note: "No resource spots known for this server yet. Farm here with World Resources on (or import a dataset) so the atlas fills in.",
    });
  }
  const bases = await enemyBases(serverId);
  res.json({ exposed: true, count: spots.length, bases: bases.length, candidates: findSpots(spots, bases) });
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
