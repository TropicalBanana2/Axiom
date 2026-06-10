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

function atlas(serverId) {
  let a = atlases.get(serverId);
  if (!a) {
    try { a = schemaGet(KEY(serverId)) || {}; } catch { a = {}; }
    atlases.set(serverId, a);
  }
  return a;
}

// Merge everything a bot can currently see into its server's atlas, and
// hand the bot a live reference so the pathfinder can use it.
function collectFromBot(bot) {
  if (!bot || !bot.entities || !bot.serverId) return;
  const a = atlas(bot.serverId);
  let added = 0;
  for (const [uid, e] of bot.entities) {
    if (!(uid >= 1 && uid <= MAX_SPOT_UID) || a[uid]) continue;
    const t = e.targetTick;
    if (!t || !t.position || !MODELS.has(t.model)) continue;
    a[uid] = { x: Math.round(t.position.x), y: Math.round(t.position.y), m: t.model };
    added++;
  }
  if (added) dirty.add(bot.serverId);
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

module.exports = { collectFromBot, flush, getAtlas, MAX_SPOT_UID };
