// sessions.js — bot orchestrator + per-session WebSocket protocol.
//
// Single WS server on :8090. JSON frames carry user-level commands;
// binary frames forward zombs.io packets to/from a specific bot.
//
// Each Bot is keyed by its Axiom session id (we own the integer
// allocation, distinct from zombs.io's sessionUserId).
//
// Inbound JSON frame shapes:
//   { op: "auth", args: { token } }
//   { op: "list" }
//   { op: "create", args: { label, serverId, playerName, psk } }
//   { op: "attach", sid }
//   { op: "detach", sid }
//   { op: "close", sid }
//   { op: "rename", sid, args: { label } }
//   { op: "setBehaviour", sid, args: { key, value } }
//   { op: "setFlag", args: { serverId, flag, value } }
//   { op: "addKey", args: { serverId, psk } }
//   { op: "removeKey", args: { serverId, psk } }
//   { op: "rpc", sid, args: { name, ...params } }
//
// Outbound JSON shapes:
//   { op: "ready", data: { userId, username } }
//   { op: "sessions", data: [ { id, label, serverId, status, ... } ] }
//   { op: "created", data: { id } }
//   { op: "closed", data: { id } }
//   { op: "error", data: { reason } }
//   { sid, op: "entity", data }   -- forwarded per attached browser
//   { sid, op: "rpc", data }      -- forwarded per attached browser
//   { sid, op: "state", data: { status, uptimeMs, ping } }

const WebSocket = require("ws");
const { Bot } = require("./bot");
const { stmts, db } = require("./db");
const { verifyToken } = require("./auth");
const { createCoordinator } = require("./smartUpgrade");
const worldSpots = require("./worldSpots");
const {
  encodeJson, decodeJson, wrapBinary, unwrapBinary,
  TAG_RPC_OUT, TAG_BUFFER_OUT, TAG_PACKET_IN,
} = require("./protocol");

const PORT = parseInt(process.env.AXIOM_SESSIONS_PORT || "8090", 10);

// Bind with retry: across a pm2 restart the previous instance can hold
// the port for a few seconds while its sockets drain — retrying here is
// invisible to clients, while the old "exit and let pm2 cycle" approach
// dropped every dashboard/attach connection and spammed the error log
// with an EADDRINUSE stack each time.
let wss;
let bindTries = 0;
function bindServer() {
  wss = new WebSocket.Server({ port: PORT, maxPayload: 65536 });
  wss.on("listening", () => console.log(`[axiom-sessions] listening on :${PORT}`));
  wss.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      if (++bindTries <= 15) {
        console.error(`[axiom-sessions] port ${PORT} busy (previous instance still closing) — retry ${bindTries}/15 in 2s`);
        setTimeout(bindServer, 2000);
        return;
      }
      console.error(
        `[axiom-sessions] port ${PORT} still in use after ${bindTries - 1} retries — another ` +
        `instance really is running. Run "pm2 delete axiom-sessions" and start once.`);
      process.exit(0);
    }
    console.error(`[axiom-sessions] server error:`, err);
    process.exit(1);
  });
  wss.on("connection", handleConnection);
}

// In-memory state.
const bots = new Map();              // axiom sid -> Bot instance
const subscribersBySid = new Map();  // sid -> Set<ws>
// Observers are a lightweight subscription that only receives JSON
// control envelopes (currently just `farmState`). The dashboard uses
// this for its session-detail Farm Observer panel — no binary entity
// updates flood in.
const observersBySid   = new Map();  // sid -> Set<ws>
const connections = new Map();       // ws.id -> ws

// The bot sid IS its DB row id. That way after a pm2 restart, when we
// re-spawn from the DB, every bot keeps its previous sid — UI
// references in localStorage / open browser tabs all stay valid.
let connId = 0;

// -------- helpers ------------------------------------------------------
// JSON envelopes are sent as TEXT frames (string). Only the raw zombs.io
// packet forwarding (wrapBinary) uses binary frames. That way the
// browser's onmessage handler can switch on `ev.data` type without
// having to decode binary every time.
function send(ws, frame) {
  if (ws.readyState === 1) ws.send(JSON.stringify(frame));
}
function broadcastSubscribers(sid, frame) {
  const subs = subscribersBySid.get(sid);
  if (!subs) return;
  for (const ws of subs) send(ws, frame);
}
function listSessionsForUser(userId) {
  return [...bots.values()]
    .filter((b) => b._userId === userId)
    .map((b) => ({
      id: b.id,
      label: b.label,
      serverId: b.serverId,
      playerName: b.playerName,
      status: b.state,
      uptimeMs: b.uptimeMs ? Date.now() - b.uptimeMs : 0,
      tick: b.tick,
      behaviours: { ...b.behaviours },
      // Live game data
      psk: b.psk || null,
      myUid: b.uid || null,
      stats: b.getStats ? b.getStats() : null,
      party: b.party || null,
      members: b.getPartyMembers ? b.getPartyMembers() : [],
      farmSpot: b.farmSpot || null,
      navActive: !!b.navActive,
    }));
}
function sendSessionList(ws) {
  send(ws, { op: "sessions", data: listSessionsForUser(ws.userId) });
}
function userSessionsBroadcast(userId, frame) {
  for (const ws of connections.values()) {
    if (ws.userId === userId) send(ws, frame);
  }
}

// -------- smart-upgrade coordinator -----------------------------------
// Economy-first multi-session base upgrader. Operates on groups of the
// user's in-world bots sharing a partyId. See smartUpgrade.js.
const smartUpgrade = createCoordinator({
  getBots: () => bots.values(),
  sendToUser: (userId, frame) => userSessionsBroadcast(userId, frame),
});

// -------- bot lifecycle -----------------------------------------------
// All event-wiring lives in `_wireBot` so we can reuse it for both new
// spawns and restored sessions.
function _wireBot(bot, userId) {
  const sid = bot.id;
  // Banshee's pattern: forward the RAW packet bytes that the bot
  // received from zombs.io. The browser keeps its codec in lock-step
  // with the bot's (seeded from getSyncNeeds at attach time, kept in
  // sync because both decode the same byte-stream in the same order).
  // This is how Banshee handles entity-update + rpc forwarding —
  // raw passthrough, no JSON envelope overhead.
  const forwardRaw = (raw) => {
    const subs = subscribersBySid.get(sid);
    if (!subs || subs.size === 0) return;
    const buf = raw instanceof Buffer ? new Uint8Array(raw) :
                raw instanceof ArrayBuffer ? new Uint8Array(raw) :
                new Uint8Array(raw);
    const wrapped = wrapBinary(TAG_PACKET_IN, sid, buf);
    for (const ws of subs) {
      if (ws.readyState === 1 && ws.attachReady) ws.send(wrapped);
    }
  };
  bot.on("entityUpdate", (data, raw) => forwardRaw(raw));
  bot.on("rpc", (data, raw) => forwardRaw(raw));
  // Farm-observer JSON envelope — sent every ~200 ms by the bot when
  // autoFarm is on. Forwarded to:
  //   - every attached /play subscriber (legacy path; harmless)
  //   - every dashboard observer for this sid (new path)
  // We also cache the last state on the bot so a freshly-connected
  // observer gets an immediate snapshot instead of waiting up to
  // 200 ms for the next tick.
  bot.on("farmState", (data) => {
    bot._lastFarmState = data;
    const subs = subscribersBySid.get(sid);
    const obs  = observersBySid.get(sid);
    if ((!subs || subs.size === 0) && (!obs || obs.size === 0)) return;
    const frame = JSON.stringify({ op: "farmState", sid, data });
    if (subs) for (const ws of subs) {
      if (ws.readyState === 1 && ws.attachReady) ws.send(frame);
    }
    if (obs) for (const ws of obs) {
      if (ws.readyState === 1) ws.send(frame);
    }
  });
  bot.on("enterWorld", (data) => {
    bot._reconnectDelay = 0;   // healthy again → backoff resets
    // The enter-world packet carries the server's current tick — a drop
    // vs. the highest tick we've seen means the server reset and its
    // whole resource layout regenerated (worldSpots wipes the atlas).
    if (data && Number.isFinite(data.startingTick)) {
      try { worldSpots.noteServerTick(bot.serverId, data.startingTick); } catch {}
    }
    stmts.updateSessionStatus.run("in_world", Date.now(), sid);
    userSessionsBroadcast(userId, { op: "sessions", data: listSessionsForUser(userId) });
  });
  bot.on("close", () => {
    // User-initiated close (the "close" op flips autoReconnect off
    // first) → mark closed and forget the session.
    if (!bot.behaviours.autoReconnect) {
      stmts.updateSessionStatus.run("closed", Date.now(), sid);
      userSessionsBroadcast(userId, { op: "closed", data: { id: sid } });
      bots.delete(sid);
      subscribersBySid.delete(sid);
      return;
    }
    // In-place reconnect with exponential backoff: the SAME session (sid,
    // behaviours, farm spot, base anchor, attach subscribers) retries
    // until the server comes back. The old approach killed the session
    // and spawned a fresh DB row every 1.5 s — id churn, broken attach
    // tabs, lost farm/behaviour state, and one error line per retry for
    // as long as a zombs server stayed down (the ENOTFOUND/ETIMEDOUT
    // storms in the pm2 logs).
    bot._reconnectDelay = Math.min((bot._reconnectDelay || 1500) * 2, 60000);
    stmts.updateSessionStatus.run("connecting", Date.now(), sid);
    userSessionsBroadcast(userId, { op: "sessions", data: listSessionsForUser(userId) });
    const delay = bot._reconnectDelay;
    console.log(`[bot ${sid}] disconnected — reconnecting in ${Math.round(delay / 1000)}s`);
    setTimeout(() => {
      if (bots.get(sid) !== bot) return;            // closed/replaced meanwhile
      if (!bot.behaviours.autoReconnect) return;    // user closed during the wait
      try { bot.start(); }
      catch (e) {
        console.error(`[bot ${sid}] reconnect failed:`, e.message);
        bot.emit("close");                          // re-enter backoff
      }
    }, delay);
  });
  bot.on("error", (err) => console.error(`[bot ${sid}]`, err.message));
}

function spawnBot(userId, { label, serverId, playerName, psk }) {
  // Persist first so the DB id can serve as the bot's sid.
  const dbResult = stmts.insertSession.run(
    userId, label, serverId, playerName, psk || "", Date.now(), "connecting"
  );
  const sid = dbResult.lastInsertRowid;
  const bot = new Bot({ id: sid, label, playerName, serverId, psk });
  bot._userId = userId;
  bot._dbId = sid;
  // Banshee parity — the bot suppresses its autonomous heal/respawn
  // tick whenever a user is attached so it doesn't fight the user.
  bot._userAttached = () => {
    const s = subscribersBySid.get(sid);
    return !!(s && s.size > 0);
  };
  bots.set(sid, bot);
  _wireBot(bot, userId);
  bot.start();
  return sid;
}

// -------- startup cleanup ---------------------------------------------
// Any session row left over from a previous process is by definition
// stale — re-spawning would just create a fresh zombs.io player with
// no continuity to the character the user was in before the restart.
// Rather than offer a misleading "restored" session, clear them all.
function purgeStaleSessions() {
  const rows = stmts.listActiveSessions.all();
  if (rows.length === 0) return;
  console.log(`[axiom-sessions] purging ${rows.length} stale session(s) from previous process`);
  const purge = db.prepare("DELETE FROM sessions WHERE status != 'closed'");
  purge.run();
}
purgeStaleSessions();

// -------- WS handlers --------------------------------------------------
const handleConnection = (ws) => {
  ws.id = ++connId;
  ws.userId = null;
  ws.authed = false;
  ws.attached = new Set();
  connections.set(ws.id, ws);

  // 10 seconds to authenticate or we drop.
  const authTimer = setTimeout(() => {
    if (!ws.authed) ws.close();
  }, 10000);

  ws.on("message", (m) => {
    // Binary frames are RPC/buffer forwards to a specific bot.
    if (m instanceof Buffer || m instanceof Uint8Array || m instanceof ArrayBuffer) {
      const buf = Buffer.isBuffer(m) ? new Uint8Array(m) : new Uint8Array(m);
      // If the first byte is `{` (0x7B) we treat as JSON anyway.
      if (buf[0] === 0x7b) {
        handleJsonFrame(ws, buf, authTimer);
        return;
      }
      handleBinaryFrame(ws, buf);
      return;
    }
    handleJsonFrame(ws, m, authTimer);
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    for (const sid of ws.attached) {
      const subs = subscribersBySid.get(sid);
      if (subs) subs.delete(ws);
    }
    if (ws.observers) {
      for (const sid of ws.observers) {
        const obs = observersBySid.get(sid);
        if (obs) obs.delete(ws);
      }
    }
    connections.delete(ws.id);
  });
};
bindServer();

function handleJsonFrame(ws, raw, authTimer) {
  const frame = decodeJson(raw);
  if (!frame || !frame.op) return;

  // Unauthenticated frames: only `auth` is allowed.
  if (!ws.authed) {
    if (frame.op !== "auth") return;
    const decoded = verifyToken(frame.args && frame.args.token);
    if (!decoded) { send(ws, { op: "error", data: { reason: "bad token" } }); return; }
    ws.authed = true;
    ws.userId = decoded.uid;
    ws.username = decoded.u;
    clearTimeout(authTimer);
    send(ws, { op: "ready", data: { userId: ws.userId, username: ws.username } });
    sendSessionList(ws);
    send(ws, { op: "smartUpgradeConfig", data: smartUpgrade.getConfig(ws.userId) });
    return;
  }

  switch (frame.op) {
    case "list":
      sendSessionList(ws);
      break;

    case "create": {
      const { label, serverId, playerName, psk } = frame.args || {};
      if (!label || !serverId) {
        send(ws, { op: "error", data: { reason: "missing fields" } });
        return;
      }
      // PSK is optional. Empty string is stored and the bot just
      // doesn't send JoinPartyByShareKey on world entry.
      const sid = spawnBot(ws.userId, {
        label: label.slice(0, 30),
        serverId,
        playerName: (playerName || "Player").slice(0, 29),
        psk: (psk || "").slice(0, 20),
      });
      send(ws, { op: "created", data: { id: sid } });
      userSessionsBroadcast(ws.userId, { op: "sessions", data: listSessionsForUser(ws.userId) });
      break;
    }

    case "attach": {
      const sid = frame.sid;
      const bot = bots.get(sid);
      if (!bot || bot._userId !== ws.userId) {
        send(ws, { op: "error", data: { reason: "no such session" } });
        return;
      }
      let subs = subscribersBySid.get(sid);
      if (!subs) subscribersBySid.set(sid, (subs = new Set()));
      // CRITICAL ordering — Banshee pattern. Subscribe FIRST, send
      // syncNeeds, THEN flip attachReady. Forwarders check
      // attachReady so no raw packet leaves before the browser has
      // the snapshot that seeds its codec.
      subs.add(ws);
      ws.attached.add(sid);
      ws.attachReady = false;
      const syncNeeds = bot.getSyncNeeds ? bot.getSyncNeeds() : null;
      send(ws, {
        op: "attached", sid,
        data: {
          label: bot.label,
          serverId: bot.serverId,
          behaviours: bot.behaviours,
          stats: bot.getStats ? bot.getStats() : null,
          party: bot.party || null,
          members: bot.getPartyMembers ? bot.getPartyMembers() : [],
          syncNeeds,
        },
      });
      ws.attachReady = true;
      break;
    }

    case "detach": {
      const sid = frame.sid;
      const subs = subscribersBySid.get(sid);
      if (subs) subs.delete(ws);
      ws.attached.delete(sid);
      break;
    }

    case "observe": {
      // Lightweight subscription for the dashboard's Farm Observer
      // panel — receives only farmState JSON envelopes, no binary
      // entity packets. Auth identical to attach: must own the bot.
      const sid = frame.sid;
      const bot = bots.get(sid);
      if (!bot || bot._userId !== ws.userId) {
        send(ws, { op: "error", data: { reason: "no such session" } });
        return;
      }
      let obs = observersBySid.get(sid);
      if (!obs) observersBySid.set(sid, (obs = new Set()));
      obs.add(ws);
      if (!ws.observers) ws.observers = new Set();
      ws.observers.add(sid);
      // Hand the new observer the cached last state immediately so the
      // UI doesn't sit on "waiting for bot…" for up to 200 ms (or
      // forever if the bot's autoFarm is currently off).
      if (bot._lastFarmState) {
        send(ws, { op: "farmState", sid, data: bot._lastFarmState });
      }
      break;
    }

    case "unobserve": {
      const sid = frame.sid;
      const obs = observersBySid.get(sid);
      if (obs) obs.delete(ws);
      if (ws.observers) ws.observers.delete(sid);
      break;
    }

    case "smartUpgradeTuning": {
      // { op:"smartUpgradeTuning", args:{ aheadBy?, farmWhenSaving? } }
      const cfg = smartUpgrade.setTuning(ws.userId, frame.args || {});
      send(ws, { op: "smartUpgradeConfig", data: cfg });
      break;
    }

    case "smartUpgradeParty": {
      // { op:"smartUpgradeParty", args:{ partyId, enabled } }
      const a = frame.args || {};
      const cfg = smartUpgrade.setPartyEnabled(ws.userId, a.partyId, !!a.enabled);
      send(ws, { op: "smartUpgradeConfig", data: cfg });
      break;
    }

    case "smartUpgradeStatus": {
      send(ws, {
        op: "smartUpgrade",
        data: smartUpgrade.getStatus(ws.userId),
        config: smartUpgrade.getConfig(ws.userId),
      });
      break;
    }

    case "close": {
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      bot.behaviours.autoReconnect = false;
      bot.stop();
      stmts.deleteSession.run(bot._dbId, ws.userId);
      break;
    }

    case "rename": {
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const newLabel = (frame.args && frame.args.label || "").slice(0, 30);
      if (!newLabel) return;
      bot.label = newLabel;
      stmts.updateSessionLabel.run(newLabel, bot._dbId);
      userSessionsBroadcast(ws.userId, { op: "sessions", data: listSessionsForUser(ws.userId) });
      break;
    }

    case "setBehaviour": {
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const { key, value } = frame.args || {};
      bot.setBehaviour(key, value);
      send(ws, { op: "behaviour", sid: bot.id, data: { key, value: bot.behaviours[key] } });
      break;
    }

    case "rpc": {
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const { name, ...params } = frame.args || {};
      if (!name) return;
      bot.sendRpc(name, params);
      break;
    }

    case "setFarmSpot": {
      // { op:"setFarmSpot", sid, args:{ x, y, angle, fixed? } | { useCurrent } | { clear } }
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const a = frame.args || {};
      if (a.clear) {
        bot.setFarmSpot(null);
        bot.farmFixed = false;
        if (bot.setFarmTargets) bot.setFarmTargets(null);
      } else if (a.useCurrent && bot.myPlayer && bot.myPlayer.position) {
        // Capture the bot's current position + its current aim as the spot.
        const ang = bot.myPlayer.aimingYaw != null ? bot.myPlayer.aimingYaw : (bot.myPlayer.yaw || 0);
        bot.setFarmSpot(bot.myPlayer.position.x, bot.myPlayer.position.y, ang);
        bot.farmFixed = false;
        if (bot.setFarmTargets) bot.setFarmTargets(null);
      } else if (a.x != null && a.y != null) {
        bot.setFarmSpot(a.x, a.y, a.angle || 0);
        // Smart Farm sends fixed:true — a predetermined per-bot spot the
        // ring shouldn't offset. A plain manual set clears the flag.
        bot.farmFixed = !!a.fixed;
        // Optional resource targets to alternate the swing between.
        if (bot.setFarmTargets) bot.setFarmTargets(a.targets || null);
      }
      send(ws, { op: "farmSpot", sid: bot.id, data: bot.farmSpot });
      break;
    }

    case "setNav": {
      // { op:"setNav", sid, args:{ on, returnToBase? } }
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const a = frame.args || {};
      // returnToBase (set by Smart Farm) controls whether a later nav-off
      // walks the bot home or just stops it in place.
      if (a.returnToBase != null) bot.returnToBase = !!a.returnToBase;
      bot.setNavActive(!!a.on);
      send(ws, { op: "nav", sid: bot.id, data: { active: bot.navActive, spot: bot.farmSpot } });
      break;
    }

    case "setControl": {
      // { op:"setControl", sid, args:{ taken } } — when taken, the bot
      // stops all its own inputs so the human at /play drives the session.
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      bot._userControlling = !!(frame.args && frame.args.taken);
      send(ws, { op: "control", sid: bot.id, data: { taken: bot._userControlling } });
      break;
    }

    case "gotoPoint": {
      // { op:"gotoPoint", sid, args:{ x, y } } — relocate the bot to a
      // world point (used by "bring other sessions here").
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const a = frame.args || {};
      if (a.x != null && a.y != null && bot.gotoPoint) bot.gotoPoint(+a.x, +a.y);
      break;
    }

    case "setFlag": {
      const { serverId, flag, value } = frame.args || {};
      if (!serverId || !flag) return;
      stmts.setFlag.run(ws.userId, serverId, flag, value ? 1 : 0);
      break;
    }

    case "addKey": {
      const { serverId, psk } = frame.args || {};
      if (!serverId || !psk || psk.length !== 20) return;
      stmts.addKey.run(ws.userId, serverId, psk);
      break;
    }

    case "removeKey": {
      const { serverId, psk } = frame.args || {};
      if (!serverId || !psk) return;
      stmts.removeKey.run(ws.userId, serverId, psk);
      break;
    }

    case "ping":
      send(ws, { op: "pong", data: { t: Date.now() } });
      break;
  }
}

function handleBinaryFrame(ws, buf) {
  const unwrapped = unwrapBinary(buf);
  if (!unwrapped) return;
  const bot = bots.get(unwrapped.sid);
  if (!bot) return;
  if (bot._userId !== ws.userId) return;
  if (!bot.ws || bot.ws.readyState !== 1) return;
  bot.sendRaw(unwrapped.payload);
}

// Light periodic broadcast so clients see uptimeMs/tick tick over.
setInterval(() => {
  for (const ws of connections.values()) {
    if (ws.authed) {
      send(ws, { op: "sessions", data: listSessionsForUser(ws.userId) });
    }
  }
}, 3000);

// Coordinated farm slots — bots whose farm spots land on the same tile
// fan out into a ring around it so they don't stack on one pixel and all
// stay in range of the tree+stone. Each bot gets a {dx,dy} offset its
// nav adds to the farm spot. Recomputed on the fleet cadence so it tracks
// bots joining/leaving the cluster.
function assignFarmSlots(allBots) {
  const groups = new Map();   // userId|party|tileX|tileY -> [bot, ...]
  for (const bot of allBots) {
    if (!bot.farmSpot) { bot._farmSlot = null; continue; }
    // Predetermined Smart Farm spots are already distinct per bot — never
    // ring-offset them (that's what caused bots to fight over one point).
    if (bot.farmFixed) { bot._farmSlot = { dx: 0, dy: 0, angle: null }; continue; }
    const pid = (bot.myPlayer && bot.myPlayer.partyId) || 0;
    const key = bot._userId + "|" + pid + "|" +
      Math.round(bot.farmSpot.x / 48) + "|" + Math.round(bot.farmSpot.y / 48);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bot);
  }
  for (const grp of groups.values()) {
    const n = grp.length;
    if (n === 1) { grp[0]._farmSlot = { dx: 0, dy: 0, angle: null }; continue; }
    grp.sort((a, b) => a.id - b.id);   // deterministic slot assignment
    // Ring radius so adjacent bots don't overlap (~2·playerRadius arc
    // spacing) but stay tight enough to keep both resources in range.
    const R = Math.min(72, Math.max(36, n * 13));
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2;   // first slot = north
      const dx = Math.round(Math.cos(ang) * R), dy = Math.round(Math.sin(ang) * R);
      // Aim INWARD (back toward the farm centre) so each ringed bot swings
      // at the tree/stone sitting in the middle. 0 = up, clockwise.
      const aim = Math.round((Math.atan2(-dy, -dx) * 180 / Math.PI + 450) % 360);
      grp[i]._farmSlot = { dx, dy, angle: aim };
    }
  }
}

// Base resting slots — party bots sharing a base anchor fan out into a small
// ring around it so they line up instead of stacking on one tile (which jams
// 1×1 bots and leaves them "out of line"). Mirrors assignFarmSlots but keyed
// on each bot's home anchor.
function assignBaseSlots(allBots) {
  const groups = new Map();   // userId|party|tileX|tileY -> [bot]
  for (const bot of allBots) {
    const home = bot._homePoint && bot._homePoint();
    if (!home) { bot._baseSlot = null; continue; }
    const pid = (bot.myPlayer && bot.myPlayer.partyId) || 0;
    const key = bot._userId + "|" + pid + "|" +
      Math.round(home.x / 48) + "|" + Math.round(home.y / 48);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bot);
  }
  for (const grp of groups.values()) {
    const n = grp.length;
    if (n === 1) { grp[0]._baseSlot = { dx: 0, dy: 0 }; continue; }
    grp.sort((a, b) => a.id - b.id);   // deterministic slot assignment
    const R = Math.min(64, Math.max(40, n * 12));   // tight ring, distinct tiles
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2;   // first slot = north
      grp[i]._baseSlot = {
        dx: Math.round(Math.cos(ang) * R),
        dy: Math.round(Math.sin(ang) * R),
      };
    }
  }
}

// Fast fleet broadcast — live positions + nav for every in-world bot,
// fanned out to all of a user's connections (dashboard party map AND each
// /play tab's overlay). Much lighter than the full session list, so it
// runs several times a second. Built once per user, then shared.
setInterval(() => {
  assignFarmSlots(bots.values());
  assignBaseSlots(bots.values());
  const byUser = new Map();   // userId -> [fleetInfo, ...]
  for (const bot of bots.values()) {
    const info = bot.fleetInfo && bot.fleetInfo();
    if (!info) continue;
    if (!byUser.has(bot._userId)) byUser.set(bot._userId, []);
    byUser.get(bot._userId).push(info);
  }
  for (const ws of connections.values()) {
    if (!ws.authed) continue;
    send(ws, { op: "fleet", data: byUser.get(ws.userId) || [] });
  }
}, 400);

// Resource atlas — union every bot's AOI view of the static trees /
// stones / camps (uid ≤ 825) into a persistent per-server map. Feeds the
// /api/spots endpoint (in-game "World Resources" overlay) and gives the
// pathfinder vision beyond each bot's own AOI.
setInterval(() => {
  for (const bot of bots.values()) {
    try { worldSpots.collectFromBot(bot); } catch {}
  }
  worldSpots.flush();
}, 5000);

// Seed/refresh the atlas from the ZombsBuildingSandbox GitHub dataset —
// the maintained upstream for Banshee-format serverspots. Best-effort
// (offline just means the fleet keeps self-capturing); gap-fill only, so
// live observations are never overwritten. Boot + daily.
const spotsBootSync = setTimeout(() => worldSpots.syncFromUpstream(), 5000);
spotsBootSync.unref && spotsBootSync.unref();
const spotsDailySync = setInterval(() => worldSpots.syncFromUpstream(), 24 * 3600 * 1000);
spotsDailySync.unref && spotsDailySync.unref();

// Graceful shutdown — close every bot's socket cleanly, then exit.
// Rows are left as-is; the next process boot will purgeStaleSessions().
function gracefulExit() {
  for (const bot of bots.values()) bot.stop();
  if (wss) wss.close();
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGTERM", gracefulExit);
process.on("SIGINT", gracefulExit);
