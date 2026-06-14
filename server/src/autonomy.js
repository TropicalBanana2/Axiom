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

// How far the base extends from its GoldStash — the open area must clear
// obstacles by at least this much. baseString parts are "idx,dx,dy,yaw"
// where dx,dy is the stash→building offset; add a building half + margin.
function baseRadius(baseString) {
  let maxR = 0;
  for (const part of String(baseString).split(";")) {
    const p = part.split(","); if (!p[0]) continue;
    const r = Math.hypot(+p[1] || 0, +p[2] || 0);
    if (r > maxR) maxR = r;
  }
  return Math.round(maxR + 60);
}

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
  function mostLoaded(bots) {
    const r = (p) => (p.myPlayer.wood || 0) + (p.myPlayer.stone || 0);
    return bots.slice().sort((a, b) => r(b) - r(a))[0];
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
  // Is there a live GoldStash near `center` in the bot's known buildings?
  // We must confirm the stash landed before placing anything else — every
  // other building is rejected by the server until a stash exists.
  function stashNear(bot, center, r = 160) {
    if (!bot.buildings) return false;
    for (const bld of bot.buildings.values()) {
      if (bld.type === "GoldStash" && !bld.dead &&
          Math.hypot(bld.x - center.x, bld.y - center.y) < r) return true;
    }
    return false;
  }
  // Where the builder stands to place the base: just OUTSIDE the footprint,
  // on the side facing the farm — so it never places on its own cell and
  // never seals itself inside the towers.
  function approachPoint(center, farmMid, radius) {
    const dx = farmMid.x - center.x, dy = farmMid.y - center.y;
    const d = Math.hypot(dx, dy) || 1;
    // Stand well clear of the centre (bigger than the arrival tolerance so
    // the bot can't "arrive" on the stash cell), but within the 576u build
    // range so it can still place the stash + inner buildings.
    const off = Math.min(radius + 240, 500);
    return { x: Math.round(center.x + (dx / d) * off), y: Math.round(center.y + (dy / d) * off) };
  }
  // Place every base building (NOT the stash — that's placed + confirmed
  // first). Positions are relative to the stash centre.
  function placeBuildings(bot, center, baseString) {
    let n = 0;
    for (const part of String(baseString).split(";")) {
      const p = part.split(","); if (!p[0]) continue;
      const type = TOWERS[+p[0]]; if (!type) continue;
      try { bot.sendRpc("MakeBuilding", { type, x: center.x - (+p[1]), y: center.y - (+p[2]), yaw: (+p[3]) || 0 }); n++; } catch {}
    }
    return n;
  }
  // Sell-to-escape: if a bot is wedged against its own buildings, delete
  // the nearest non-stash building so it can walk free (auto-rebuild puts
  // it back once Auto Upgrade is running).
  function sellToEscape(bot) {
    if (!bot.buildings || !bot.myPlayer || !bot.myPlayer.position) return false;
    const p = bot.myPlayer.position;
    let best = null, bd = Infinity;
    for (const bld of bot.buildings.values()) {
      if (bld.dead || bld.type === "GoldStash") continue;
      const d = Math.hypot(bld.x - p.x, bld.y - p.y);
      if (d < 90 && d < bd) { bd = d; best = bld; }
    }
    if (best) { try { bot.sendRpc("DeleteBuilding", { uid: best.uid }); } catch {} return true; }
    return false;
  }
  function setPhase(job, phase, status) { job.phase = phase; job.status = status; job.phaseT0 = Date.now(); }

  function start(userId, partyId, baseString) {
    const bots = partyBots(userId, partyId);
    if (!bots.length) return { ok: false, error: "No in-world bots in this party." };
    if (!baseString) return { ok: false, error: "No base layout — pick a saved base first." };
    jobs.set(K(userId, partyId), {
      userId, partyId: +partyId, serverId: bots[0].serverId, baseString,
      baseRadius: baseRadius(baseString),
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
      // Require an open area big enough for THIS base (clearance >= radius).
      const cands = findSpots(spots, bases, { minClear: job.baseRadius });
      if (!cands.length) {
        return setPhase(job, "failed",
          `No open area large enough for this base (needs ${job.baseRadius}u clear). Try a smaller base.`);
      }
      job.spot = cands[0];
      applyFarm(bots, job.spot);
      setPhase(job, "farm", "Farming the pair to gather materials…");

    } else if (job.phase === "farm") {
      // The builder is whichever bot has gathered the most wood+stone.
      const b = mostLoaded(bots);
      const wood = b.myPlayer.wood || 0, stone = b.myPlayer.stone || 0;
      job.status = `Farming — best bot ${wood}w ${stone}s of 3000 (${Math.round(elapsed / 1000)}s)`;
      // Build costs wood+stone (placement is gold-free), so wait for a real
      // stockpile — 3k of each — or 5 min as a fallback, then build.
      if ((wood >= 3000 && stone >= 3000) || elapsed > 300000) {
        job.builderId = b.id;
        // Stand just outside the base footprint, facing the farm.
        job.approach = approachPoint(job.spot.base, job.spot.farm.mid, job.baseRadius);
        try { b.gotoPoint(job.approach.x, job.approach.y); } catch {}
        setPhase(job, "build", "Sending the loaded bot to build the base…");
      }

    } else if (job.phase === "build") {
      const b = bots.find((x) => x.id === job.builderId) || mostLoaded(bots);
      const ap = job.approach;
      const d = dist(b.myPlayer.position, ap);
      if (d >= 180) {
        if (elapsed > 240000) return setPhase(job, "failed", "Builder couldn't reach the base — try again (clear path / daytime).");
        try { b.gotoPoint(ap.x, ap.y); } catch {}   // keep committing to the trip
        job.status = `Heading to build — ${Math.round(d)}u away…`;
        return;
      }
      // Arrived just outside the footprint. STAGE 1: place + confirm the
      // GoldStash — nothing else can be placed until it exists. The builder
      // stands at the approach point (off the stash's own cell), since the
      // server rejects placing on the player's tile.
      if (!stashNear(b, job.spot.base)) {
        // Never place while standing on the stash's own cell — the server
        // rejects that. Step off to the approach point first.
        if (dist(b.myPlayer.position, job.spot.base) < 100) {
          try { b.gotoPoint(ap.x, ap.y); } catch {}
          job.status = "Stepping off the stash cell…";
          return;
        }
        if (!job.stashSentAt || Date.now() - job.stashSentAt > 3000) {
          try { b.sendRpc("MakeBuilding", { type: "GoldStash", x: job.spot.base.x, y: job.spot.base.y, yaw: 0 }); } catch {}
          job.stashSentAt = Date.now();
        }
        // Surface the server's rejection reason if one came back.
        const f = b._lastFailure;
        const recentFail = f && f.type === "GoldStash" && Date.now() - f.at < 4000;
        job.status = recentFail ? `GoldStash rejected: ${f.reason || f.category}` : "Placing GoldStash…";
        if (Date.now() - (job.stashFirstTry || (job.stashFirstTry = Date.now())) > 45000) {
          const why = (f && (f.reason || f.category)) || "no confirmation from server";
          return setPhase(job, "failed", `Couldn't place a GoldStash (${why}).`);
        }
        return;
      }
      // STAGE 2: stash confirmed → place the rest, settle outside the base.
      const n = placeBuildings(b, job.spot.base, job.baseString);
      setPhase(job, "recall", `Base placed (${n} parts) — settling the party…`);

    } else if (job.phase === "recall") {
      // Settle OUTSIDE the base (the approach point), not on the towers,
      // so bots don't wedge inside; the coordinator anchors home here.
      const target = job.approach || job.spot.base;
      if (!job._stuck) job._stuck = {};
      let atBase = 0;
      for (const bot of bots) {
        const pos = bot.myPlayer.position;
        const here = dist(pos, target) < 320;
        if (here) { atBase++; continue; }
        try { bot.gotoPoint(target.x, target.y); } catch {}
        // Stuck detection → sell-to-escape.
        const st = job._stuck[bot.id] || (job._stuck[bot.id] = { x: pos.x, y: pos.y, since: Date.now() });
        if (Math.hypot(pos.x - st.x, pos.y - st.y) > 25) { st.x = pos.x; st.y = pos.y; st.since = Date.now(); }
        else if (Date.now() - st.since > 5000) { sellToEscape(bot); st.since = Date.now(); }
      }
      job.status = `Settling at base (${atBase}/${bots.length})…`;
      if (atBase >= Math.max(1, Math.ceil(bots.length * 0.6)) || elapsed > 70000) {
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
