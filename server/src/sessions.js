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
const {
  encodeJson, decodeJson, wrapBinary, unwrapBinary,
  TAG_RPC_OUT, TAG_BUFFER_OUT, TAG_PACKET_IN,
} = require("./protocol");

const PORT = parseInt(process.env.AXIOM_SESSIONS_PORT || "8090", 10);

const wss = new WebSocket.Server({ port: PORT, maxPayload: 65536 });
wss.on("listening", () => console.log(`[axiom-sessions] listening on :${PORT}`));
wss.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `[axiom-sessions] port ${PORT} is already in use — another axiom-sessions ` +
      `instance is probably running. Not starting a duplicate. ` +
      `Run "pm2 delete axiom-sessions" (or kill the stray node process) and start once.`);
    process.exit(0);
  }
  console.error(`[axiom-sessions] server error:`, err);
  process.exit(1);
});

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
  bot.on("enterWorld", () => {
    stmts.updateSessionStatus.run("in_world", Date.now(), sid);
    userSessionsBroadcast(userId, { op: "sessions", data: listSessionsForUser(userId) });
  });
  bot.on("close", () => {
    stmts.updateSessionStatus.run("closed", Date.now(), sid);
    userSessionsBroadcast(userId, { op: "closed", data: { id: sid } });
    bots.delete(sid);
    subscribersBySid.delete(sid);
    // Same-process autoReconnect: re-spawn an identical bot under a
    // fresh DB row. We keep the SAME parameters (label/server/psk) but
    // the new sid will differ — the user's character is gone anyway.
    if (bot.behaviours.autoReconnect) {
      setTimeout(() => {
        spawnBot(userId, {
          label: bot.label, serverId: bot.serverId,
          playerName: bot.playerName, psk: bot.psk,
        });
      }, 1500);
    }
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
wss.on("connection", (ws) => {
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
});

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
      // { op:"setFarmSpot", sid, args:{ x, y, angle } | { useCurrent:true } | { clear:true } }
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      const a = frame.args || {};
      if (a.clear) {
        bot.setFarmSpot(null);
      } else if (a.useCurrent && bot.myPlayer && bot.myPlayer.position) {
        // Capture the bot's current position + its current aim as the spot.
        const ang = bot.myPlayer.aimingYaw != null ? bot.myPlayer.aimingYaw : (bot.myPlayer.yaw || 0);
        bot.setFarmSpot(bot.myPlayer.position.x, bot.myPlayer.position.y, ang);
      } else if (a.x != null && a.y != null) {
        bot.setFarmSpot(a.x, a.y, a.angle || 0);
      }
      send(ws, { op: "farmSpot", sid: bot.id, data: bot.farmSpot });
      break;
    }

    case "setNav": {
      // { op:"setNav", sid, args:{ on } }
      const bot = bots.get(frame.sid);
      if (!bot || bot._userId !== ws.userId) return;
      bot.setNavActive(!!(frame.args && frame.args.on));
      send(ws, { op: "nav", sid: bot.id, data: { active: bot.navActive, spot: bot.farmSpot } });
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

// Graceful shutdown — close every bot's socket cleanly, then exit.
// Rows are left as-is; the next process boot will purgeStaleSessions().
function gracefulExit() {
  for (const bot of bots.values()) bot.stop();
  wss.close();
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGTERM", gracefulExit);
process.on("SIGINT", gracefulExit);
