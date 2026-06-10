// worldSpots.js — per-server resource atlas (trees / stones / camps).
//
// zombs.io resource entities are STATIC with fixed uid ranges per server:
//   uid 1–400 Tree · 401–800 Stone · 801–825 NeutralCamp
// (the encoding Banshee's serverspots uses). AOI replication means any one
// client only ever sees the resources near it — but axiom's fleet roams
// the whole map farming, so we UNION every bot's view over time into a
// persistent per-server atlas (schema_kv, key "spots:<serverId>").
//
// Consumers:
//   • GET /api/spots/:serverId — the in-game "World Resources" overlay
//     injects the atlas client-side so ALL wood/stone renders on the map
//     (the modded client already refuses to remove Tree/Stone/NeutralCamp
//     entities, so injected ones stay put).
//   • pathfinder.buildObstacles — known off-AOI trees/stones become
//     obstacles, so long cross-map paths stop bumping through forests the
//     bot hasn't personally seen yet.

const { schemaGet, schemaSet } = require("./db");

const MAX_SPOT_UID = 825;
const MODELS = new Set(["Tree", "Stone", "NeutralCamp"]);
const KEY = (serverId) => "spots:" + serverId;

const atlases = new Map();   // serverId -> { uid: { x, y, m } }
const dirty = new Set();     // serverIds with unpersisted additions
const metas = new Map();     // serverId -> { tick, importHash }

const META_KEY = (serverId) => "spotsMeta:" + serverId;

function atlas(serverId) {
  let a = atlases.get(serverId);
  if (!a) {
    try { a = schemaGet(KEY(serverId)) || {}; } catch { a = {}; }
    atlases.set(serverId, a);
  }
  return a;
}

function meta(serverId) {
  let m = metas.get(serverId);
  if (!m) {
    try { m = schemaGet(META_KEY(serverId)) || {}; } catch { m = {}; }
    metas.set(serverId, m);
  }
  return m;
}
function saveMeta(serverId) {
  try { schemaSet(META_KEY(serverId), metas.get(serverId) || {}); } catch {}
}

// Cheap stable hash (djb2) for dataset dedupe.
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Drop everything we believe about a server's resource layout.
function wipeServer(serverId, reason) {
  atlases.set(serverId, {});
  dirty.add(serverId);
  flush();
  console.log(`[worldSpots] wiped atlas for ${serverId} (${reason})`);
}

// ── Server-reset detection ──────────────────────────────────────────
// zombs server ticks count up from 0 at 20/s since the last reset (the
// enter-world packet carries the current tick as startingTick). A tick
// LOWER than the highest we've ever seen for that server means the
// server restarted — which regenerates the whole resource layout, so
// every stored spot (fleet-captured AND imported) is garbage. Called by
// sessions.js on every bot enter-world.
const TICK_SLACK = 50000;   // ~40 min of ticks — tolerate clock noise
function noteServerTick(serverId, tick) {
  if (!serverId || !Number.isFinite(tick) || tick <= 0) return;
  const m = meta(serverId);
  if (Number.isFinite(m.tick) && tick < m.tick - TICK_SLACK) {
    wipeServer(serverId, `server reset detected: tick ${tick} < last seen ${m.tick}`);
  }
  if (!Number.isFinite(m.tick) || tick > m.tick || tick < m.tick - TICK_SLACK) {
    m.tick = tick;
    saveMeta(serverId);
  }
}

// Merge everything a bot can currently see into its server's atlas, and
// hand the bot a live reference so the pathfinder can use it. LIVE WINS:
// a stored spot whose live twin sits somewhere else gets corrected — the
// self-healing path for any staleness reset detection didn't catch.
function collectFromBot(bot) {
  if (!bot || !bot.entities || !bot.serverId) return;
  const a = atlas(bot.serverId);
  let changed = 0;
  for (const [uid, e] of bot.entities) {
    if (!(uid >= 1 && uid <= MAX_SPOT_UID)) continue;
    const t = e.targetTick;
    if (!t || !t.position || !MODELS.has(t.model)) continue;
    const x = Math.round(t.position.x), y = Math.round(t.position.y);
    const cur = a[uid];
    if (cur && cur.x === x && cur.y === y && cur.m === t.model) continue;
    a[uid] = { x, y, m: t.model };
    changed++;
  }
  if (changed) dirty.add(bot.serverId);
  bot._worldSpots = a;
}

// Persist atlases that grew since the last flush. ≤825 tiny records per
// server, so a whole-blob write is cheap.
function flush() {
  for (const serverId of dirty) {
    try { schemaSet(KEY(serverId), atlases.get(serverId)); } catch {}
  }
  dirty.clear();
}

function getAtlas(serverId) {
  return atlas(serverId);
}

// ── Upstream dataset (GitHub: AyuBloom/ZombsBuildingSandbox) ──────────
// The ZombsBuildingSandbox project maintains a current Banshee-format
// serverspots dataset for every live server. We treat it as the atlas's
// UPSTREAM: fetched at boot and daily, merged gap-fill-only — anything
// the fleet has observed live always wins over the dataset.
const UPSTREAM_URL =
  "https://raw.githubusercontent.com/AyuBloom/ZombsBuildingSandbox/main/src/app/serverspots.js";

// Decode a Banshee serverspots.js source string into
// { serverId: { uid: { x, y, m } } }. Banshee's exact packing: each
// entry is y*100*50000 + x (coords have ≤ 2 decimals, map is 24000²),
// the uid is the array position + 1, and the model follows the fixed
// uid ranges (1–400 Tree · 401–800 Stone · 801–825 NeutralCamp).
function decodeBansheeDataset(src) {
  // The dataset file is plain JS that writes onto `window` — run it
  // against a stub instead of parsing the 250KB literal by hand.
  const windowStub = {};
  new Function("window", src)(windowStub);
  const dataset = windowStub.serverspots || windowStub.serverSpots;
  const out = {};
  if (!dataset || typeof dataset !== "object") return out;
  const modelOf = (uid) => (uid <= 400 ? "Tree" : uid <= 800 ? "Stone" : "NeutralCamp");
  for (const [serverId, entry] of Object.entries(dataset)) {
    if (!/^v\d{1,6}$/.test(serverId) || !entry || !entry.spotEncoded) continue;
    let arr;
    try { arr = JSON.parse(entry.spotEncoded); } catch { continue; }
    const spots = {};
    for (let i = 0; i < Math.min(arr.length, MAX_SPOT_UID); i++) {
      const packed = arr[i];
      if (!packed) continue;
      const x = ((((packed * 100).toFixed(2) - "") % 5000000) | 0) / 100;
      const y = ((packed / 50000) | 0) / 100;
      if (!(x >= 0 && x <= 24000 && y >= 0 && y <= 24000)) continue;
      spots[i + 1] = { x: Math.round(x), y: Math.round(y), m: modelOf(i + 1) };
    }
    out[serverId] = spots;
  }
  return out;
}

// Merge a decoded dataset into the atlases — gap-fill only, then persist.
// Each server's dataset is hashed and remembered: a dataset we've already
// merged once is skipped, which is what keeps a STALE capture from
// re-filling an atlas that was wiped after a server reset. The moment the
// upstream repo ships a fresh capture (different hash), it merges again.
function mergeDataset(decoded) {
  let servers = 0, added = 0, skippedStale = 0;
  for (const [serverId, spots] of Object.entries(decoded)) {
    const h = hashStr(JSON.stringify(spots));
    const m = meta(serverId);
    if (m.importHash === h) { skippedStale++; continue; }
    const a = atlas(serverId);
    let n = 0;
    for (const uid in spots) {
      if (!a[uid]) { a[uid] = spots[uid]; n++; }
    }
    if (n) dirty.add(serverId);
    m.importHash = h;
    saveMeta(serverId);
    servers++; added += n;
  }
  flush();
  return { servers, added, skippedStale };
}

let syncing = false;
async function syncFromUpstream() {
  if (syncing) return null;
  syncing = true;
  try {
    const r = await fetch(UPSTREAM_URL);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const res = mergeDataset(decodeBansheeDataset(await r.text()));
    console.log(`[worldSpots] upstream sync: +${res.added} spots across ${res.servers} servers`);
    return res;
  } catch (e) {
    // Offline / GitHub down is fine — the fleet still self-captures and
    // the next scheduled sync retries.
    console.error("[worldSpots] upstream sync failed:", e && e.message);
    return null;
  } finally {
    syncing = false;
  }
}

module.exports = {
  collectFromBot, flush, getAtlas, MAX_SPOT_UID,
  decodeBansheeDataset, mergeDataset, syncFromUpstream, UPSTREAM_URL,
  noteServerTick, wipeServer,
};
