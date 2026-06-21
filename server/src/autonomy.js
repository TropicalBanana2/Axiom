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

function createAutonomy({ getBots, enableParty, seedLayout, sendToUser }) {
  const jobs = new Map();   // "userId|partyId" -> job
  const K = (u, p) => u + "|" + p;
  // Diagnostic log — prefixes every line so a live run is traceable in
  // `pm2 logs axiom-sessions` (the phase machine is otherwise invisible).
  const log = (job, msg) => console.log(`[autonomy ${job.userId}|${job.partyId}] ${msg}`);

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
  // Lay n bots on the perpendicular bisector of the tree↔stone segment so
  // each is equidistant to both and aims at the midpoint — alternating sides
  // so the party flanks the pair (2 on each side for n=4) instead of all
  // piling onto one point. Direct port of the client's computeFarmSpots
  // (defaultSchema scr_smartFarm); CLEAR/MAXR keep every bot in melee range
  // of BOTH resources.
  function computeFarmSpots(tree, stone, n) {
    const mx = (tree.x + stone.x) / 2, my = (tree.y + stone.y) / 2;
    const ax = stone.x - tree.x, ay = stone.y - tree.y;
    const D = Math.hypot(ax, ay) || 1;
    const px = -ay / D, py = ax / D;                 // unit perpendicular
    const CLEAR = 72, MAXR = 98, half = D / 2;
    const minO = Math.sqrt(Math.max(0, CLEAR * CLEAR - half * half));
    const maxO = Math.max(minO + 1, Math.sqrt(Math.max(0, MAXR * MAXR - half * half)));
    const perSide = Math.ceil(n / 2);
    const step = perSide > 1 ? (maxO - minO) / (perSide - 1) : 0;
    const spots = [];
    for (let i = 0; i < n; i++) {
      const side = (i % 2 === 0) ? 1 : -1;           // alternate sides
      const rank = Math.floor(i / 2);                // distance out on that side
      const o = side * (minO + rank * step);
      const sx = Math.round(mx + px * o), sy = Math.round(my + py * o);
      const aim = Math.round((Math.atan2(my - sy, mx - sx) * 180 / Math.PI + 450) % 360);
      spots.push({ x: sx, y: sy, angle: aim });
    }
    return spots;
  }
  function applyFarm(bots, spot) {
    const tree = spot.farm.tree, stone = spot.farm.stone;
    const targets = [tree, stone];
    // Deterministic id order so each bot keeps the same flanking slot across
    // re-applies (matches the client's id-sorted assignment).
    const ordered = bots.slice().sort((a, b) => a.id - b.id);
    const spots = computeFarmSpots(tree, stone, ordered.length);
    ordered.forEach((b, i) => {
      const s = spots[i];
      try {
        // Distinct predetermined spot → farmFixed so assignFarmSlots leaves
        // it alone (the ring offset would re-stack what we just spread out).
        b.setFarmSpot(s.x, s.y, s.angle);
        if (b.setFarmTargets) b.setFarmTargets(targets);
        b.farmFixed = true;
        b.returnToBase = true;
        b.setNavActive(true);
      } catch {}
    });
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
      q.push({ type, x: center.x - (+p[1]), y: center.y - (+p[2]), yaw: (+p[3]) || 0, tries: 0, retryAt: 0 });
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
    // Stand OUTWARD of the piece (away from the base centre), so the builder
    // approaches from the open edge. The old centreward offset pulled the bot
    // toward the stash — each step made a deeper piece the nearest target, so
    // it spiralled in and orbited the stash without ever placing.
    const dx = item.x - center.x, dy = item.y - center.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return { x: item.x + 160, y: item.y };  // item IS the centre
    const off = 160;
    return { x: Math.round(item.x + (dx / d) * off), y: Math.round(item.y + (dy / d) * off) };
  }
  const MIN_MAT = 250;                 // below this a builder is "out" and hands off
  // Materials (each) one bot needs before we START building. A single bot
  // melee-farms slowly and the farm sits far from the base, so 3k/each was
  // unreachable inside the 5-min window — it always timed out on low mats.
  // Start with a usable first batch; the build phase refarms + hands off
  // across all party bots to top up the rest.
  const FARM_START = 1500;
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
  // Per-bot (parallel build drives several bots at once), keyed in curTargetByBot.
  function maybeGotoBot(bot, job, pt) {
    if (!job.curTargetByBot) job.curTargetByBot = new Map();
    const cur = job.curTargetByBot.get(bot.id);
    if (!cur || Math.hypot(cur.x - pt.x, cur.y - pt.y) > 24) {
      try { bot.gotoPoint(pt.x, pt.y); } catch {}
      job.curTargetByBot.set(bot.id, { x: Math.round(pt.x), y: Math.round(pt.y) });
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
  function setPhase(job, phase, status) {
    job.phase = phase; job.status = status; job.phaseT0 = Date.now();
    log(job, `→ ${phase}: ${status}`);
  }
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
    log(job, `spot #${job.spotIndex} blocked (${why}) → retarget #${job.spotIndex + 1} @(${job.spot.base.x},${job.spot.base.y})`);
  }

  // settle: optional [{ dx, dy }, ...] — per-bot rest offsets from the stash
  // centre (world units), chosen on the base-render picker in the dashboard.
  // Bots are matched to slots in id order; a bot with no slot rests at the stash.
  function start(userId, partyId, baseString, settle) {
    const bots = partyBots(userId, partyId);
    if (!bots.length) return { ok: false, error: "No in-world bots in this party." };
    if (!baseString) return { ok: false, error: "No base layout — pick a saved base first." };
    const settleClean = Array.isArray(settle)
      ? settle.map((s) => (s && Number.isFinite(s.dx) && Number.isFinite(s.dy)) ? { dx: s.dx, dy: s.dy } : null)
      : null;
    const job = {
      userId, partyId: +partyId, serverId: bots[0].serverId, baseString,
      baseRadius: baseRadius(baseString), settle: settleClean,
      phase: "spot", status: "Finding the best spot…", phaseT0: Date.now(),
      spot: null, builderId: null,
    };
    jobs.set(K(userId, partyId), job);
    log(job, `START — ${bots.length} bot(s) on ${job.serverId}, baseRadius=${job.baseRadius}, ` +
      `${String(baseString).split(";").filter(Boolean).length} pieces`);
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
      job.status = `Farming — best bot ${wood}w ${stone}s of ${FARM_START} (${Math.round(elapsed / 1000)}s)`;
      // Build costs wood+stone (placement is gold-free), so wait for a usable
      // first batch — FARM_START of each — or 5 min as a fallback, then build.
      if ((wood >= FARM_START && stone >= FARM_START) || elapsed > 300000) {
        const byTimeout = !(wood >= FARM_START && stone >= FARM_START);
        job.builderId = b.id;
        // Stand just outside the base footprint, facing the farm.
        job.approach = approachPoint(job.spot.base, job.spot.farm.mid, job.baseRadius);
        job.queue = buildQueue(job.spot.base, job.baseString);
        job.stashDone = false; job.curTarget = null;
        try { b.gotoPoint(job.approach.x, job.approach.y); } catch {}
        log(job, `farm done (${byTimeout ? "TIMEOUT — low mats!" : "3k/3k reached"}): ` +
          `builder bot ${b.id} has ${wood}w ${stone}s; base@(${job.spot.base.x},${job.spot.base.y}) ` +
          `approach@(${job.approach.x},${job.approach.y})`);
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

      const PLACE_MAX = 520;   // < the ~576u MakeBuilding player-distance cap
      const OFF_CELL = 64;     // clear of a piece's own 2×2 cell (server rejects on-cell)
      // Mirror the in-game continuous builder (AxiomBuild.continuous — the "fast"
      // reference): each bot fires EVERY in-range piece it owns each tick (up to a
      // burst cap), and only re-fires a piece after RETRY_MS if it hasn't
      // confirmed. An order of magnitude faster than one-piece-per-tick.
      const RETRY_MS = 1600;   // resend an unconfirmed in-range piece after this
      const MAX_TRIES = 8;     // in-range sends before a slot is called blocked
      const MAX_PER_TICK = 12; // per-bot burst cap (matches the in-game builder)

      // STAGE 1: ONE bot places + confirms the GoldStash — nothing else can be
      // placed until it exists. The most-loaded live bot does it; the rest keep
      // farming so they arrive loaded for the parallel build.
      if (!job.stashDone) {
        const sp = bots.filter((x) => !x.myPlayer.dead).sort((x, y) => mat(y) - mat(x))[0];
        if (!sp) { job.status = "Waiting for a live bot to place the stash…"; return; }
        const me = sp.myPlayer.position;
        if (stashNear(sp, center)) {
          job.stashDone = true;
          // Start the build budget HERE (stash confirmed), NOT at phase entry —
          // the long farm→base commute must not count against it.
          job.buildT0 = Date.now(); job.placedMax = 0; job.lastProgressT = Date.now();
          log(job, `GoldStash confirmed @(${center.x},${center.y}) — parallel build begins`);
        } else {
          const ap = job.approach;
          if (dist(me, ap) > 180) {
            if (elapsed > 240000) return setPhase(job, "failed", "Builder couldn't reach the base — try again (clear path / daytime).");
            maybeGotoBot(sp, job, ap);
            job.status = `Heading to base — ${Math.round(dist(me, ap))}u away…`;
            return;
          }
          if (dist(me, center) < 100) { maybeGotoBot(sp, job, ap); job.status = "Stepping off the stash cell…"; return; }
          if (!job.stashSentAt || Date.now() - job.stashSentAt > 2500) {
            log(job, `placing GoldStash @(${center.x},${center.y}) via bot ${sp.id}, ${Math.round(dist(me, center))}u away`);
            try { sp.sendRpc("MakeBuilding", { type: "GoldStash", x: center.x, y: center.y, yaw: 0 }); } catch {}
            job.stashSentAt = Date.now();
          }
          const f = sp._lastFailure, rf = f && f.type === "GoldStash" && Date.now() - f.at < 4000;
          // The spot is occupied (an enemy base the scanner missed) — can't
          // place the stash here, so retarget the next candidate spot.
          if (rf && /obstruct/i.test(f.reason || "")) return advanceSpot(job, bots, "stash obstructed");
          job.status = rf ? `GoldStash rejected: ${f.reason || f.category}` : "Placing GoldStash…";
          if (Date.now() - (job.stashFirstTry || (job.stashFirstTry = Date.now())) > 45000) {
            return advanceSpot(job, bots, (f && (f.reason || f.category)) || "no confirmation");
          }
          return;
        }
      }

      // Completion + caps. Each bot only sees buildings in its own AOI, so a
      // piece counts as placed if ANY party bot sees it (union view).
      let placed = 0;
      const remaining = [];
      for (const it of job.queue) {
        if (bots.some((x) => placedAt(x, it))) { placed++; continue; }
        if (!it.bad) remaining.push(it);
      }
      if (placed > (job.placedMax || 0)) { job.placedMax = placed; job.lastProgressT = Date.now(); }
      // Budget scales with base size, measured from buildT0 (stash confirmed),
      // so a big base gets the minutes it needs to place + refarm.
      const buildCap = Math.max(20 * 60 * 1000, job.queue.length * 6000);
      const overCap = job.buildT0 && Date.now() - job.buildT0 > buildCap;
      const stalled = job.lastProgressT && Date.now() - job.lastProgressT > 15 * 60 * 1000;
      if (!remaining.length || overCap || stalled) {
        const why = !remaining.length ? "complete" : stalled ? "stalled 15m" : "time cap";
        return setPhase(job, "recall", `Base built (${placed}/${job.queue.length} parts, ${why}) — settling the party…`);
      }

      // STAGE 2: PARALLEL build. Every live, loaded bot builds at once; each
      // owns the remaining pieces NEAREST to it (a spatial split) so they work
      // separate regions instead of fighting over one cell. Dry bots peel off
      // to farm and rejoin when refilled. Placement is range-based (the ~576u
      // cap): a bot drops whatever it can reach from where it stands, and only
      // walks (to a point just OUTSIDE the nearest piece) when nothing's in range.
      const builders = bots.filter((x) => !x.myPlayer.dead && !lowMat(x));
      for (const x of bots) if (!x.myPlayer.dead && lowMat(x)) { try { x.setNavActive(true); } catch {} }
      if (!builders.length) { job.status = `Building ${placed}/${job.queue.length} — all bots refarming…`; return; }

      // Assign each remaining piece to its nearest builder (a Voronoi split).
      const mineOf = new Map();   // builderId -> [pieces]
      for (const it of remaining) {
        let best = builders[0], bdd = Infinity;
        for (const x of builders) { const d = dist(x.myPlayer.position, it); if (d < bdd) { bdd = d; best = x; } }
        let a = mineOf.get(best.id); if (!a) mineOf.set(best.id, a = []); a.push(it);
      }

      if (!job.stuckByBot) job.stuckByBot = new Map();
      if (!job.wedge) job.wedge = new Map();
      let placing = 0, moving = 0;
      for (const x of builders) {
        const mine = mineOf.get(x.id);
        if (!mine || !mine.length) { job.stuckByBot.delete(x.id); job.wedge.delete(x.id); continue; }  // region done
        const me = x.myPlayer.position;

        // WEDGE ESCAPE (applies even while "placing"). A bot enclosed by the
        // towers it built keeps firing at in-range cells that can never place —
        // its OWN body (or a teammate's) is standing on them — so the build
        // stalls at e.g. 352/358 and the bot is trapped. A real placing bot
        // clears its in-range cluster in a couple ticks and moves on, so if a
        // bot hasn't moved in a while it's wedged: sell a neighbour to open a
        // path and walk it OUT to the perimeter so the blocked cells free up
        // (the hole is rebuilt by the live map now, or Auto Upgrade's self-heal).
        if (x._buildEscapeUntil && Date.now() < x._buildEscapeUntil) {
          const dx0 = me.x - center.x, dy0 = me.y - center.y, dd0 = Math.hypot(dx0, dy0) || 1;
          maybeGotoBot(x, job, { x: Math.round(center.x + dx0 / dd0 * (job.baseRadius + 160)),
                                 y: Math.round(center.y + dy0 / dd0 * (job.baseRadius + 160)) });
          moving++; continue;                       // escaping → don't place this tick
        }
        const wp = job.wedge.get(x.id);
        if (!wp) { job.wedge.set(x.id, { x: me.x, y: me.y, since: Date.now() }); }
        else if (Math.hypot(me.x - wp.x, me.y - wp.y) > 30) { wp.x = me.x; wp.y = me.y; wp.since = Date.now(); }
        else if (Date.now() - wp.since > 11000) {   // unmoved 11s → wedged
          const dx0 = me.x - center.x, dy0 = me.y - center.y, dd0 = Math.hypot(dx0, dy0) || 1;
          const sold = sellToEscape(x);
          try { x.gotoPoint(Math.round(center.x + dx0 / dd0 * (job.baseRadius + 160)),
                            Math.round(center.y + dy0 / dd0 * (job.baseRadius + 160))); } catch {}
          x._buildEscapeUntil = Date.now() + 6000;
          wp.x = me.x; wp.y = me.y; wp.since = Date.now();
          if (job.curTargetByBot) job.curTargetByBot.delete(x.id);
          log(job, `bot ${x.id} wedged in base — ${sold ? "sold a wall, " : ""}walking out to free the cells`);
          moving++; continue;
        }

        // Fire EVERY in-range, off-cell, due piece this bot owns (burst-capped) —
        // the fast continuous-builder pattern, not one-at-a-time.
        let sent = 0, inRange = 0;
        for (const it of mine) {
          const d = dist(me, it);
          if (d < OFF_CELL || d > PLACE_MAX) continue;
          inRange++;
          if (sent >= MAX_PER_TICK || Date.now() < (it.retryAt || 0)) continue;  // capped, or still in flight
          try { x.sendRpc("MakeBuilding", { type: it.type, x: it.x, y: it.y, yaw: it.yaw }); } catch {}
          it.retryAt = Date.now() + RETRY_MS;
          if ((it.tries = (it.tries || 0) + 1) >= MAX_TRIES) { it.bad = true; log(job, `skip ${it.type} @(${it.x},${it.y}) — blocked after ${it.tries} tries`); }
          sent++;
        }
        if (inRange > 0) {                       // working its region (placing, or waiting on retries)
          job.stuckByBot.delete(x.id);
          if (sent > 0) placing++;
          continue;
        }
        // Nothing in range → walk toward the nearest assigned piece (stand just
        // outside it); sell out if wedged on the way.
        let tgt = mine[0], td = Infinity;
        for (const it of mine) { const d = dist(me, it); if (d < td) { td = d; tgt = it; } }
        maybeGotoBot(x, job, buildFromPoint(tgt, center));
        let stk = job.stuckByBot.get(x.id);
        if (!stk) job.stuckByBot.set(x.id, stk = { x: me.x, y: me.y, since: Date.now() });
        if (Math.hypot(me.x - stk.x, me.y - stk.y) > 25) { stk.x = me.x; stk.y = me.y; stk.since = Date.now(); }
        else if (Date.now() - stk.since > 5000) { sellToEscape(x); stk.since = Date.now(); if (job.curTargetByBot) job.curTargetByBot.delete(x.id); }
        moving++;
      }
      job.status = `Building ${placed}/${job.queue.length} — ${builders.length} bots (${placing} placing, ${moving} moving)…`;
      // Throttled progress to the log (was a per-tick line per bot — too noisy).
      if (placed !== job._lastBuildLog && (!job._buildLogAt || Date.now() - job._buildLogAt > 12000)) {
        job._buildLogAt = Date.now(); job._lastBuildLog = placed;
        log(job, `building ${placed}/${job.queue.length} — ${builders.length} bot(s)`);
      }

    } else if (job.phase === "recall") {
      // Settle each bot at its CHOSEN spot (from the base-render picker in the
      // dashboard) — an offset from the GoldStash — or at the stash if none was
      // picked. We do NOT sell-to-escape here (recall sells left permanent
      // VOIDS); a bot that can't path in settles as close as it can, and Auto
      // Upgrade's self-heal repairs anything missing.
      const stash = job.spot.base;
      const ordered = bots.slice().sort((a, b) => a.id - b.id);
      const slotFor = (i) => {
        const s = job.settle && job.settle[i];
        return s ? { x: stash.x + s.dx, y: stash.y + s.dy } : stash;
      };
      let atBase = 0;
      ordered.forEach((bot, i) => {
        const pos = bot.myPlayer.position, t = slotFor(i);
        if (dist(pos, t) < 200) { atBase++; return; }
        try { bot.gotoPoint(t.x, t.y); } catch {}
      });
      job.status = `Settling at chosen spots (${atBase}/${ordered.length})…`;
      if (atBase >= Math.max(1, Math.ceil(ordered.length * 0.6)) || elapsed > 70000) {
        // Hand the FULL layout to the coordinator first, so Auto Upgrade rebuilds
        // any missing piece (voids, slots the build never reached, zombie damage)
        // — the base self-heals and completes itself.
        try { if (seedLayout) seedLayout(job.partyId, job.queue); } catch {}
        enableParty(job.userId, job.partyId, true);
        // Re-anchor each bot to ITS chosen spot so Auto Upgrade's home = that
        // spot (not wherever the coordinator snapshotted it) and stragglers walk
        // there instead of being stranded.
        ordered.forEach((bot, i) => { const t = slotFor(i); try { bot.gotoPoint(t.x, t.y); } catch {} });
        log(job, `recall done — seeded ${job.queue ? job.queue.length : 0}-piece layout, ` +
          `anchored ${ordered.length} bot(s) to ${job.settle ? "chosen spots" : "the stash"}`);
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
