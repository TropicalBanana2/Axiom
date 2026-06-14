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
  // Expand a saved base into an absolute build queue (NOT the stash — that's
  // placed + confirmed first). Each item is the world-space centre of one
  // building; offsets are stash→building, matching the saved-base format.
  function buildQueue(center, baseString) {
    const q = [];
    for (const part of String(baseString).split(";")) {
      const p = part.split(","); if (!p[0]) continue;
      const type = TOWERS[+p[0]]; if (!type) continue;
      q.push({ type, x: center.x - (+p[1]), y: center.y - (+p[2]), yaw: (+p[3]) || 0, badCount: 0 });
    }
    return q;
  }
  // Is this queued building actually standing right now? Read from the bot's
  // LIVE building map — so a piece the bot sold to escape reads as missing
  // and gets rebuilt on a later pass ("sell out, rebuild behind it").
  function placedAt(bot, item, r = 40) {
    if (!bot.buildings) return false;
    for (const b of bot.buildings.values()) {
      if (b.dead || b.type !== item.type) continue;
      if (Math.hypot(b.x - item.x, b.y - item.y) <= r) return true;
    }
    return false;
  }
  // Where to stand to place `item`: one step toward the stash centre, so the
  // builder is NEVER on the item's own cell (the server rejects that) but is
  // well within the 576u build range.
  function buildFromPoint(item, center) {
    const dx = center.x - item.x, dy = center.y - item.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return { x: item.x + 130, y: item.y };  // item is the centre
    // 130u clears a 2×2 tower's footprint (±48) plus the player's own radius,
    // so the builder never obstructs its own placement, yet stays well in range.
    const off = 130;
    return { x: Math.round(item.x + (dx / d) * off), y: Math.round(item.y + (dy / d) * off) };
  }
  // The nearest building still missing — lets the builder walk the footprint
  // placing as it goes, instead of blasting everything from one spot.
  function nextItem(bot, queue) {
    const p = bot.myPlayer.position;
    let best = null, bd = Infinity;
    for (const it of queue) {
      if (it.bad || placedAt(bot, it)) continue;
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  const MIN_MAT = 250;                 // below this a builder is "out" and hands off
  const mat = (b) => (b.myPlayer.wood || 0) + (b.myPlayer.stone || 0);
  const lowMat = (b) => (b.myPlayer.wood || 0) < MIN_MAT || (b.myPlayer.stone || 0) < MIN_MAT;
  // Grant every party member sell permission, so a wedged bot can delete ANY
  // building (its own or a teammate's) to escape. Only the leader can set it.
  function grantSellPermissions(bots) {
    for (const b of bots) {
      const members = b.partyInfo || (b.party && b.party.members) || [];
      const me = members.find((m) => m.playerUid === b.uid);
      if (!me || me.isLeader !== 1) continue;
      let all = true;
      for (const m of members) {
        if (m.canSell === 1) continue;
        all = false;
        try { b.sendRpc("SetPartyMemberCanSell", { uid: m.playerUid, canSell: 1 }); } catch {}
      }
      return all;
    }
    return false;
  }
  // Re-issue a walk target only when it actually moves, to avoid path thrash.
  function maybeGoto(bot, job, pt) {
    const cur = job.curTarget;
    if (!cur || Math.hypot(cur.x - pt.x, cur.y - pt.y) > 24) {
      try { bot.gotoPoint(pt.x, pt.y); } catch {}
      job.curTarget = { x: Math.round(pt.x), y: Math.round(pt.y) };
    }
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
  // Abandon the current spot (it's blocked) and retarget the next candidate.
  // Only valid BEFORE the GoldStash is committed — you can't move a stash.
  function advanceSpot(job, bots, why) {
    job.spotIndex = (job.spotIndex || 0) + 1;
    if (!job.spots || job.spotIndex >= job.spots.length) {
      return setPhase(job, "failed", `Every candidate spot was blocked (${why}).`);
    }
    job.spot = job.spots[job.spotIndex];
    applyFarm(bots, job.spot);
    job.approach = approachPoint(job.spot.base, job.spot.farm.mid, job.baseRadius);
    job.queue = buildQueue(job.spot.base, job.baseString);
    job.stashDone = false; job.stashSentAt = 0; job.stashFirstTry = 0;
    job.curTarget = null; job._stuck = null;
    job.status = `Spot blocked (${why}) — trying spot #${job.spotIndex + 1}…`;
  }

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
      // Keep ALL candidates so we can skip to the next if a spot turns out
      // to be blocked (an enemy base the scanner didn't know about).
      job.spots = cands; job.spotIndex = 0; job.spot = cands[0];
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
        job.queue = buildQueue(job.spot.base, job.baseString);
        job.stashDone = false; job.curTarget = null;
        try { b.gotoPoint(job.approach.x, job.approach.y); } catch {}
        setPhase(job, "build", "Sending the loaded bot to build the base…");
      }

    } else if (job.phase === "build") {
      const center = job.spot.base;
      // Make sure every party member can sell, so any wedged bot can delete
      // a neighbour's wall to free itself. Retry until all are granted.
      if (!job.sellGranted && (!job.sellTryAt || Date.now() - job.sellTryAt > 5000)) {
        job.sellGranted = grantSellPermissions(bots);
        job.sellTryAt = Date.now();
      }

      // Pick the active builder. Hand off when the current one runs dry: send
      // it back to farm and bring in the most-loaded fresh bot. If everyone's
      // empty, wait while the party farms.
      let b = job.builderId ? bots.find((x) => x.id === job.builderId) : null;
      if (b && (b.myPlayer.dead || lowMat(b))) {
        try { b.setNavActive(true); } catch {}        // depleted builder → farm
        b = null; job.builderId = null; job.curTarget = null;
      }
      if (!b) {
        b = bots.filter((x) => !lowMat(x)).sort((x, y) => mat(y) - mat(x))[0];
        if (!b) { job.status = "Out of materials — party is refarming…"; return; }
        job.builderId = b.id; job.curTarget = null;
      }
      const me = b.myPlayer.position;

      // STAGE 1: GoldStash first — nothing else can be placed until it exists.
      // Stand off its own cell (the server rejects placing on the player tile).
      if (!job.stashDone) {
        if (stashNear(b, center)) { job.stashDone = true; }
        else {
          const ap = job.approach;
          if (dist(me, ap) > 180) {
            if (elapsed > 240000) return setPhase(job, "failed", "Builder couldn't reach the base — try again (clear path / daytime).");
            maybeGoto(b, job, ap);
            job.status = `Heading to base — ${Math.round(dist(me, ap))}u away…`;
            return;
          }
          if (dist(me, center) < 100) { maybeGoto(b, job, ap); job.status = "Stepping off the stash cell…"; return; }
          if (!job.stashSentAt || Date.now() - job.stashSentAt > 2500) {
            try { b.sendRpc("MakeBuilding", { type: "GoldStash", x: center.x, y: center.y, yaw: 0 }); } catch {}
            job.stashSentAt = Date.now();
          }
          const f = b._lastFailure, rf = f && f.type === "GoldStash" && Date.now() - f.at < 4000;
          // The spot is occupied (an enemy base / structure the scanner
          // missed) — the stash can't go down here, so move to the next spot.
          if (rf && /obstruct/i.test(f.reason || "")) {
            return advanceSpot(job, bots, "stash obstructed");
          }
          job.status = rf ? `GoldStash rejected: ${f.reason || f.category}` : "Placing GoldStash…";
          if (Date.now() - (job.stashFirstTry || (job.stashFirstTry = Date.now())) > 45000) {
            return advanceSpot(job, bots, (f && (f.reason || f.category)) || "no confirmation");
          }
          return;
        }
      }

      // STAGE 2: walk the footprint, placing the nearest missing building.
      const placed = job.queue.filter((it) => placedAt(b, it)).length;
      const remaining = job.queue.filter((it) => !it.bad && !placedAt(b, it));
      if (!remaining.length || Date.now() - job.phaseT0 > 240000) {
        return setPhase(job, "recall", `Base built (${placed}/${job.queue.length} parts) — settling the party…`);
      }
      const item = nextItem(b, job.queue) || remaining[0];
      const from = buildFromPoint(item, center);
      const dFrom = dist(me, from);

      // Stuck/wedge detection: while walking to a build-from point, if the
      // position stops changing we're wedged between buildings → sell the
      // nearest blocker, then re-path (it's rebuilt on a later pass).
      const st = job._stuck || (job._stuck = { x: me.x, y: me.y, since: Date.now() });
      if (Math.hypot(me.x - st.x, me.y - st.y) > 25) { st.x = me.x; st.y = me.y; st.since = Date.now(); }

      if (dFrom > 70 || dist(me, item) < 60) {
        // New destination (just finished a piece, or switched targets): start
        // heading there with a FRESH stuck timer so standing-to-place doesn't
        // look like a wedge.
        const changed = !job.curTarget || Math.hypot(job.curTarget.x - from.x, job.curTarget.y - from.y) > 24;
        if (changed) {
          maybeGoto(b, job, from);
          st.x = me.x; st.y = me.y; st.since = Date.now();
          job.status = `Building ${placed}/${job.queue.length} — moving to ${item.type}…`;
          return;
        }
        if (Date.now() - st.since > 4000) {            // wedged on the way there
          const sold = sellToEscape(b);
          st.since = Date.now(); job.curTarget = null;
          job.status = sold ? "Wedged — selling out (will rebuild)…" : `Moving to ${item.type}…`;
          return;
        }
        maybeGoto(b, job, from);
        job.status = `Building ${placed}/${job.queue.length} — moving to ${item.type}…`;
        return;
      }

      // In position and clear of the cell → place it (rate-limited).
      if (!job.lastSendAt || Date.now() - job.lastSendAt > 1200) {
        try { b.sendRpc("MakeBuilding", { type: item.type, x: item.x, y: item.y, yaw: item.yaw }); } catch {}
        job.lastSendAt = Date.now();
        const f = b._lastFailure;
        // Unplaceable cell (bad grid, or something permanently in the way) —
        // skip it after a few tries so one blocked tile can't stall the base.
        if (f && Date.now() - f.at < 2000 && f.type === item.type && /grid|obstruct/i.test(f.reason || "")) {
          if (++item.badCount >= 4) item.bad = true;
        }
      }
      job.status = `Building ${placed}/${job.queue.length} — placing ${item.type}…`;

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
