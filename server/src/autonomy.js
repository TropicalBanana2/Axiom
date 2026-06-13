// autonomy.js — server-side one-click autonomy orchestrator.
//
// Runs the full setup for a party entirely on the server, so it survives
// the dashboard tab closing: find the best spot → farm the pair to gather
// materials → build the selected saved base in the open area → recall the
// whole party to the base → hand off to the Auto Upgrade coordinator.
//
// Drives the Bot instances directly (no WS round-trips). The recall MUST
// finish before enabling Auto Upgrade, because the coordinator snapshots
// each bot's current position as its base anchor on enable.

const { findSpots } = require("./spotFinder");
const { getAtlas } = require("./worldSpots");

const TOWERS = ["Wall", "Door", "SlowTrap", "ArrowTower", "CannonTower",
  "MeleeTower", "BombTower", "MagicTower", "GoldMine", "Harvester"];

// Enemy base positions (community scanner), cached per server.
const SCANNER = "http://95.111.234.133/api/stashes?serverId=";
const baseCache = new Map();
async function enemyBases(serverId) {
  const c = baseCache.get(serverId);
  if (c && Date.now() - c.t < 60000) return c.bases;
  try {
    const r = await fetch(SCANNER + encodeURIComponent(serverId), { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    const bases = (Array.isArray(d) ? d : [])
      .map((b) => b.position).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    baseCache.set(serverId, { t: Date.now(), bases });
    return bases;
  } catch { return (c && c.bases) || []; }
}

const dist = (a, b) => (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;

function createAutonomy({ getBots, enableParty, sendToUser }) {
  const jobs = new Map();   // "userId|partyId" -> job
  const K = (u, p) => u + "|" + p;

  function partyBots(userId, partyId) {
    return Array.from(getBots()).filter((b) =>
      b._userId === userId && b.myPlayer && !b.myPlayer.dead &&
      b.myPlayer.position && String(b.myPlayer.partyId) === String(partyId));
  }
  function richest(bots) {
    return bots.slice().sort((a, b) => (b.myPlayer.gold || 0) - (a.myPlayer.gold || 0))[0];
  }
  function applyFarm(bots, spot) {
    const mid = spot.farm.mid, targets = [spot.farm.tree, spot.farm.stone];
    for (const b of bots) {
      try {
        b.setFarmSpot(mid.x, mid.y, 0);
        if (b.setFarmTargets) b.setFarmTargets(targets);
        b.farmFixed = true;
        b.returnToBase = true;
        b.setNavActive(true);
      } catch {}
    }
  }
  function placeBase(bot, center, baseString) {
    try { bot.sendRpc("MakeBuilding", { type: "GoldStash", x: center.x, y: center.y, yaw: 0 }); } catch {}
    let n = 0;
    for (const part of String(baseString).split(";")) {
      const p = part.split(","); if (!p[0]) continue;
      const type = TOWERS[+p[0]]; if (!type) continue;
      try { bot.sendRpc("MakeBuilding", { type, x: center.x - (+p[1]), y: center.y - (+p[2]), yaw: (+p[3]) || 0 }); n++; } catch {}
    }
    return n;
  }
  function setPhase(job, phase, status) { job.phase = phase; job.status = status; job.phaseT0 = Date.now(); }

  function start(userId, partyId, baseString) {
    const bots = partyBots(userId, partyId);
    if (!bots.length) return { ok: false, error: "No in-world bots in this party." };
    if (!baseString) return { ok: false, error: "No base layout — pick a saved base first." };
    jobs.set(K(userId, partyId), {
      userId, partyId: +partyId, serverId: bots[0].serverId, baseString,
      phase: "spot", status: "Finding the best spot…", phaseT0: Date.now(),
      spot: null, builderId: null,
    });
    return { ok: true };
  }
  function stop(userId, partyId) { jobs.delete(K(userId, partyId)); }
  function statusFor(userId) {
    const list = [];
    for (const job of jobs.values()) if (job.userId === userId) {
      list.push({ partyId: job.partyId, phase: job.phase, status: job.status });
    }
    return list;
  }

  async function tickJob(job) {
    const bots = partyBots(job.userId, job.partyId);
    if (!bots.length) { job.status = "Waiting for in-world bots…"; return; }
    const elapsed = Date.now() - job.phaseT0;

    if (job.phase === "spot") {
      const spots = Object.values(getAtlas(job.serverId));
      if (!spots.length) return setPhase(job, "failed", "No resource spots known for this server.");
      const bases = await enemyBases(job.serverId);
      const cands = findSpots(spots, bases);
      if (!cands.length) return setPhase(job, "failed", "No suitable spot found.");
      job.spot = cands[0];
      applyFarm(bots, job.spot);
      setPhase(job, "farm", "Farming the pair to gather materials…");

    } else if (job.phase === "farm") {
      const r = richest(bots);
      const wood = r.myPlayer.wood || 0, stone = r.myPlayer.stone || 0;
      job.status = `Farming — ${wood}w ${stone}s (${Math.round(elapsed / 1000)}s)`;
      if ((wood >= 500 && stone >= 500) || elapsed > 120000) {
        job.builderId = r.id;
        try { r.gotoPoint(job.spot.base.x, job.spot.base.y); } catch {}
        setPhase(job, "build", "Sending a bot to build the base…");
      }

    } else if (job.phase === "build") {
      const b = bots.find((x) => x.id === job.builderId) || richest(bots);
      if (dist(b.myPlayer.position, job.spot.base) < 140) {
        const n = placeBase(b, job.spot.base, job.baseString);
        for (const bot of bots) { try { bot.gotoPoint(job.spot.base.x, job.spot.base.y); } catch {} }
        setPhase(job, "recall", `Base placed (${n} parts) — recalling the party…`);
      } else if (elapsed > 70000) {
        setPhase(job, "failed", "Builder didn't reach the base in time.");
      }

    } else if (job.phase === "recall") {
      const atBase = bots.filter((x) => dist(x.myPlayer.position, job.spot.base) < 280).length;
      job.status = `Recalling to base (${atBase}/${bots.length})…`;
      if (atBase >= Math.max(1, Math.ceil(bots.length * 0.6)) || elapsed > 50000) {
        enableParty(job.userId, job.partyId, true);
        setPhase(job, "done", "✓ Autonomous: Auto Upgrade running — farm ↔ base ↔ upgrade.");
      }
    }
  }

  function tick() {
    for (const [k, job] of jobs) {
      if (job.phase === "done" || job.phase === "failed") {
        if (Date.now() - job.phaseT0 > 10000) jobs.delete(k);   // linger so status shows
        continue;
      }
      tickJob(job).catch((e) => setPhase(job, "failed", (e && e.message) || "error"));
    }
    // Push status to each affected user.
    const byUser = new Map();
    for (const job of jobs.values()) {
      if (!byUser.has(job.userId)) byUser.set(job.userId, []);
      byUser.get(job.userId).push({ partyId: job.partyId, phase: job.phase, status: job.status });
    }
    for (const [userId, list] of byUser) sendToUser(userId, { op: "autonomy", data: { jobs: list } });
  }
  const timer = setInterval(tick, 1500);
  timer.unref && timer.unref();

  return { start, stop, statusFor };
}

module.exports = { createAutonomy };
