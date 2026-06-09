// smartUpgrade.js — economy-first multi-session base upgrade solver.
//
// Coordinates a group of bots that share a party (same partyId) to
// upgrade their shared base as fast as possible, using the COMBINED
// materials of every session in the group.
//
// Key zombs.io mechanic: materials are per-player. You can't pool gold
// across sessions, but any party member can upgrade any shared building
// — paying from THEIR OWN inventory. So the solver distributes upgrade
// clicks: each upgrade is fired from whichever session can afford it.
//
// Strategy (per user request):
//   - Economy buildings (GoldStash + GoldMine) are kept `aheadBy` tiers
//     above the highest-tier "other" building before the rest upgrade.
//   - Costs account for gold AND wood AND stone (AND token).
//   - Continuous: re-evaluates every tick as GoldMines regenerate gold.
//
// Costs come from the static buildingData table (captured once; zombs.io
// balance is stable). No runtime schema dependency.

const { upgradeCost, placeCost, itemUpgradeCost, MAX_TIER } = require("./buildingData");

const ECONOMY_TYPES = new Set(["GoldStash", "GoldMine"]);
// Defensive structures + the harvester (resource producer). These are
// the high-value buildings — upgraded right after economy, BEFORE walls.
const DEFENSE_TYPES = new Set([
  "CannonTower", "ArrowTower", "MagicTower", "BombTower", "MeleeTower", "Harvester",
]);
// Structural (cheap, plentiful) — walls/doors/traps. Lowest priority so
// they don't monopolize picks just for being cheap.
// (Anything not economy and not defense falls here.)

// Priority classes (lower = upgraded first):
//   0  economy (GoldStash + GoldMine) — always top priority so it leads
//   1  defense (towers + harvester)   — may climb up to the rest-cap
//   2  structure (walls/doors/traps)  — may climb up to the rest-cap
//   99 not eligible this tick
//
// The "economy stays aheadBy ahead" rule is enforced as a CAP on the
// rest, not a global switch: a non-economy building at tier t may only
// reach t+1 if that keeps it within (ecoMin - aheadBy). Economy is
// always class 0, so when economy CAN afford to climb it goes first.
// But pickUpgrade falls through to class 1/2 when economy is
// unaffordable — so towers keep climbing toward the cap while the base
// saves gold for an expensive stash/mine tier. (The previous version
// hard-blocked the rest whenever gap<=aheadBy, which deadlocked towers
// the moment economy couldn't afford its next upgrade.)
function classOf(type, tier, ecoMin, restMax, aheadBy) {
  if (ECONOMY_TYPES.has(type)) return 0;
  // Once the economy is fully maxed there's nothing left to stay ahead
  // of — lift the cap so defense/structures climb all the way to max
  // tier instead of stalling at (MAX_TIER - aheadBy).
  const restCap = (ecoMin >= MAX_TIER) ? MAX_TIER : (ecoMin - aheadBy);
  if (tier + 1 > restCap) return 99;    // upgrading would break the gap
  return DEFENSE_TYPES.has(type) ? 1 : 2;
}

const TICK_MS = 1000;               // re-evaluate once per second
const MAX_UPGRADES_PER_TICK = 25;   // burst limit per cycle (more towers/tick)

// Farm stockpile thresholds SCALE with base level — wood/stone upgrade
// costs grow ~50× from tier 1→8 (towers 15→800, mines 15→1600 each), so
// a fixed goal is huge early and trivial late. We size the per-session
// stockpile to fund several upgrades at the CURRENT tier.
//
// Reference: representative per-upgrade wood/stone cost to go FROM tier
// `t` (1-indexed) → t+1, taken from the tower/mine cost curve.
const WOODSTONE_COST_BY_TIER = [0, 25, 35, 45, 60, 90, 300, 800];
// Stock ~CEIL_MULT upgrades, go refarm below ~FLOOR_MULT upgrades' worth.
const FARM_FLOOR_MULT = 3;
const FARM_CEIL_MULT  = 12;
const FARM_FLOOR_MIN  = 150;
const FARM_CEIL_MIN   = 600;

// Returns { floor, ceil } sized to the base's current level (the highest
// tier being funded — towers or economy).
function farmThresholds(ecoMin, restMax) {
  const level = Math.max(1, Math.min(7, Math.max(restMax, ecoMin === MAX_TIER ? 1 : ecoMin)));
  const c = WOODSTONE_COST_BY_TIER[level] || 25;
  return {
    floor: Math.max(FARM_FLOOR_MIN, c * FARM_FLOOR_MULT),
    ceil:  Math.max(FARM_CEIL_MIN,  c * FARM_CEIL_MULT),
  };
}

const UPGRADE_COOLDOWN_MS = 1800;   // per-building, until LocalBuilding confirms
// A session must be within this distance of a building to upgrade it.
// The zombs.io server enforces maxPlayerDistance = 12 cells = 576 units
// (wiki 10 §B1 / 12 §1) and silently no-ops anything farther. Stay UNDER
// 576 with a margin for position lag — the old value of 600 made the
// coordinator believe a bot at ~580u could fire, so the upgrade silently
// failed forever and nobody was ever dispatched.
const UPGRADE_RANGE = 550;
const UPGRADE_MOVE_COOLDOWN_MS = 6000;   // re-dispatch throttle for movers
// How long a dispatched bot is shielded from the farm logic. Must exceed
// a worst-case base↔farm walk: with the old 8 s shield the farm block
// re-captured the bot mid-trip ("wood is low → go farm"), then the
// dispatcher recalled it 3 s later — the mid-field ping-pong the wiki
// warns about (12 §4). Cleared early the moment the bot fires an upgrade.
const DISPATCH_SHIELD_MS = 45000;
// Once a bot commits to a farm trip it stays committed at least this long
// before the dispatcher may pull it back for an upgrade (wiki 12 §4
// "min-farm-dwell" anti-thrash rule).
const FARM_MIN_DWELL_MS = 30000;
// Pickaxe: each farming session upgrades its pickaxe toward this tier
// (faster wood/stone gathering) — only when the math says it's worth it.
//
// Pickaxe HarvestCount by tier (1-indexed): [1.5, 3, 3, 4.5, 4.5, 6, 9]
//   — note tiers 3 and 5 give ZERO harvest gain over the tier below, so
//     blindly climbing wastes gold (the "too much upgrading" bug).
// GoldCost to go tier t→t+1: [_, 1000, 3000, 6000, 8000, 24000, 90000].
//
// Decision (pickaxeWorthIt): from the current tier, look ahead to the
// NEXT tier that actually raises harvest, sum the gold to reach it, and
// only upgrade if gold-per-+harvest is efficient AND the bot holds a big
// multiple of that cost (so pickaxe never starves building upgrades).
const PICK_HARVEST = [0, 1.5, 3, 3, 4.5, 4.5, 6, 9];   // index = tier
const PICK_STEP_COST = [0, 1000, 3000, 6000, 8000, 24000, 90000]; // [t] = t→t+1
const PICKAXE_GPH_MAX = 8000;       // max gold per +1 harvest worth paying
const PICKAXE_GOLD_BUFFER = 4;      // need cost × this much gold before buying
const PICKAXE_COOLDOWN_MS = 4000;   // per-bot, until inventory confirms

// Returns the cost to reach the next harvest-increasing tier, or null if
// upgrading isn't worth it from `tier` with `gold` on hand.
function pickaxeWorthIt(tier, gold) {
  if (tier >= 7) return null;
  const curH = PICK_HARVEST[tier];
  // Walk forward to the next tier with strictly more harvest.
  let cost = 0, nt = tier;
  while (nt < 7) { cost += PICK_STEP_COST[nt]; nt++; if (PICK_HARVEST[nt] > curH) break; }
  if (PICK_HARVEST[nt] <= curH) return null;       // no improvement reachable
  const gain = PICK_HARVEST[nt] - curH;
  if (cost / gain > PICKAXE_GPH_MAX) return null;   // too pricey per +harvest
  if (gold < cost * PICKAXE_GOLD_BUFFER) return null; // keep gold for buildings
  return cost;
}

function canAfford(mat, cost) {
  return mat.gold  >= cost.gold  &&
         mat.wood  >= cost.wood  &&
         mat.stone >= cost.stone &&
         mat.token >= cost.token;
}

function createCoordinator({ getBots, sendToUser }) {
  // Per-user config. `parties` is the set of partyIds smart-upgrade is
  // ENABLED for (per-party control). aheadBy / farmWhenSaving are shared
  // tuning across that user's parties.
  //   userId -> { aheadBy:int, farmWhenSaving:bool, parties:Set<number> }
  const configs = new Map();
  // userId -> status object for the dashboard
  const statuses = new Map();
  // buildingUid -> last-fired timestamp (across all groups; uids are
  // globally unique within a server so collisions are a non-issue)
  const lastUpgradeAt = new Map();
  // bot.id -> last pickaxe-buy timestamp (cooldown until inventory updates)
  const lastPickaxeAt = new Map();
  // partyId -> timestamp the group entered the "saving" state (no bot can
  // afford the next pending upgrade). Used to debounce saving→farm so it
  // doesn't flip every tick.
  const savingSince = new Map();
  // bot.id -> last time we dispatched it to an out-of-range building, so
  // we don't re-issue gotoPoint every tick while it walks over.
  const lastMoveAt = new Map();
  // Auto-rebuild memory: partyId -> Map(key -> { type, x, y, firstSeen,
  // established }). "key" is type+tile so a rebuilt building (new uid) still
  // matches its slot. lastRebuildAt throttles re-placement per slot.
  const baseMemory = new Map();
  const lastRebuildAt = new Map();

  // Buy the next pickaxe tier ONLY when the harvest-gain math says it's
  // worth it (see pickaxeWorthIt). Buys one step at a time toward the
  // next harvest-increasing tier; the gold buffer keeps it from starving
  // building upgrades.
  function maybePickaxe(bot, now) {
    const tier = bot.getPickaxeTier ? bot.getPickaxeTier() : 1;
    if (now - (lastPickaxeAt.get(bot.id) || 0) < PICKAXE_COOLDOWN_MS) return;
    const gold = (bot.myPlayer && bot.myPlayer.gold) || 0;
    if (pickaxeWorthIt(tier, gold) == null) return;   // not worth it / can't afford
    try {
      bot.sendRpc("BuyItem",  { itemName: "Pickaxe", tier: tier + 1 });
      bot.sendRpc("EquipItem", { itemName: "Pickaxe", tier: tier + 1 });
    } catch {}
    lastPickaxeAt.set(bot.id, now);
  }

  function freshConfig() {
    return {
      aheadBy: 2, farmWhenSaving: true,
      autoRebuild: true,        // replace dead base buildings while running
      whenDone: "keep",         // when fully maxed: keep | stop | base
      parties: new Set(),
    };
  }
  function getRaw(userId) {
    let c = configs.get(userId);
    if (!c) { c = freshConfig(); configs.set(userId, c); }
    return c;
  }

  // Global tuning for the user (applies to every enabled party).
  function setTuning(userId, partial) {
    const c = getRaw(userId);
    if (partial.aheadBy !== undefined) c.aheadBy = Math.max(0, Math.min(7, partial.aheadBy | 0));
    if (partial.farmWhenSaving !== undefined) c.farmWhenSaving = !!partial.farmWhenSaving;
    if (partial.autoRebuild !== undefined) c.autoRebuild = !!partial.autoRebuild;
    if (partial.whenDone !== undefined && ["keep", "stop", "base"].includes(partial.whenDone)) {
      c.whenDone = partial.whenDone;
    }
    return getConfig(userId);
  }

  // Enable / disable smart-upgrade for one party.
  function setPartyEnabled(userId, partyId, enabled) {
    const c = getRaw(userId);
    partyId = +partyId;
    if (enabled) {
      c.parties.add(partyId);
      // Snapshot each bot's CURRENT position as its base anchor — the user
      // has positioned them where they want them to sit/return to, so that
      // spot (not the GoldStash or spawn) becomes "home".
      for (const bot of getBots()) {
        if (bot._userId === userId && bot.captureBase &&
            bot.myPlayer && bot.myPlayer.partyId === partyId) {
          bot.captureBase();
        }
      }
    } else {
      c.parties.delete(partyId);
      // Release any bots in THIS party that the coordinator sent to farm
      // or dispatched on an upgrade errand — clear all coordinator state.
      for (const bot of getBots()) {
        if (bot._userId === userId &&
            bot.myPlayer && bot.myPlayer.partyId === partyId) {
          bot._upgradeMoveUntil = 0;
          bot._farmCommitUntil = 0;
          if (bot._coordFarming || bot.navErrand) {
            bot._coordFarming = false;
            bot.setNavActive(false);
          }
        }
      }
    }
    return getConfig(userId);
  }

  // Serialisable config view for the dashboard.
  function getConfig(userId) {
    const c = configs.get(userId) || freshConfig();
    return {
      aheadBy: c.aheadBy, farmWhenSaving: c.farmWhenSaving,
      autoRebuild: c.autoRebuild !== false,
      whenDone: c.whenDone || "keep",
      parties: [...c.parties],
    };
  }
  function getStatus(userId) {
    return statuses.get(userId) || null;
  }

  // Group a user's in-world bots by partyId. Bots not in-world (no
  // myPlayer) or not in a party are skipped — they have no shared base.
  function groupBots(userId) {
    const groups = new Map();   // partyId -> [bot]
    for (const bot of getBots()) {
      if (bot._userId !== userId) continue;
      if (!bot.myPlayer) continue;
      const pid = bot.myPlayer.partyId;
      if (!pid) continue;
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid).push(bot);
    }
    return groups;
  }

  // Merge every bot's building Map in a group into one list. They all
  // see the same party base, but updates can lag, so take the highest
  // tier seen for each uid.
  function mergeBuildings(group) {
    const merged = new Map();   // uid -> {uid, type, tier, x, y}
    for (const bot of group) {
      for (const b of bot.buildings.values()) {
        if (b.dead) continue;
        const prev = merged.get(b.uid);
        if (!prev || b.tier > prev.tier) {
          merged.set(b.uid, { uid: b.uid, type: b.type, tier: b.tier, x: b.x, y: b.y });
        }
      }
    }
    return [...merged.values()];
  }

  // Economy / rest tier stats used for the gap-based priority.
  //   ecoMin  = lowest tier among GoldStash + GoldMines (8 if none built)
  //   restMax = highest tier among everything else (towers + walls etc.)
  // The coordinator keeps ecoMin >= restMax + aheadBy.
  function tierStats(buildings) {
    let ecoMin = MAX_TIER, hasEco = false, restMax = 0;
    for (const b of buildings) {
      if (ECONOMY_TYPES.has(b.type)) { hasEco = true; if (b.tier < ecoMin) ecoMin = b.tier; }
      else if (b.tier > restMax) restMax = b.tier;
    }
    if (!hasEco) ecoMin = MAX_TIER;   // no economy → don't gate the rest
    return { ecoMin, restMax };
  }

  // Pick the next building to upgrade given the gap rule + affordability.
  // Returns { building, cost, session } or null.
  //
  // localMats: per-session mutable material copy (so a burst within one
  // tick doesn't over-assign before the real material update lands).
  function pickUpgrade(buildings, group, aheadBy, localMats, now) {
    const { ecoMin, restMax } = tierStats(buildings);
    const { ceil: FULL_STOCK } = farmThresholds(ecoMin, restMax);

    // Build candidate list: upgradeable, off-cooldown buildings, each
    // tagged with its priority class.
    const candidates = [];
    for (const b of buildings) {
      if (b.tier >= MAX_TIER) continue;
      const cd = lastUpgradeAt.get(b.uid) || 0;
      if (now - cd < UPGRADE_COOLDOWN_MS) continue;
      const cost = upgradeCost(b.type, b.tier);
      if (!cost) continue;
      const isEco = ECONOMY_TYPES.has(b.type);
      const cls = classOf(b.type, b.tier, ecoMin, restMax, aheadBy);
      if (cls === 99) continue;     // not eligible this tick (gap rule)
      candidates.push({ b, cost, isEco, cls });
    }
    if (candidates.length === 0) return null;

    // Sort by class (economy first), then lowest tier (even leveling),
    // then cheapest gold. We then scan in this order and take the FIRST
    // AFFORDABLE candidate — falling through classes. This is the fix
    // for "towers stopped upgrading": when economy (class 0) is too
    // expensive to afford right now, we don't stall — we fall through to
    // class 1 (towers) and class 2 (walls), which keeps the rest
    // climbing toward the gap cap while the base saves for the stash.
    candidates.sort((a, b) =>
      (a.cls - b.cls) || (a.b.tier - b.b.tier) || (a.cost.gold - b.cost.gold));

    // Assign to the "smallest sufficient wallet" — the affordable session
    // with the LEAST gold — so richer sessions stay free for pricier
    // upgrades only they can cover. Proximity matters: the server only
    // accepts the upgrade from a session within UPGRADE_RANGE of the
    // building, so we prefer an in-range affordable session; if none is in
    // range we return the nearest affordable one flagged needsMove so the
    // caller can walk it over.
    for (const cand of candidates) {
      const bx = cand.b.x, by = cand.b.y;
      const hasPos = Number.isFinite(bx) && Number.isFinite(by);
      let inBest = null, inBestGold = Infinity;
      let moveBest = null, moveBestDist = Infinity, moveBestFarming = 2;
      for (const bot of group) {
        const m = localMats.get(bot.id);
        if (!m || !canAfford(m, cand.cost)) continue;
        const p = bot.myPlayer && bot.myPlayer.position;
        const dist = (hasPos && p) ? Math.hypot(p.x - bx, p.y - by) : 0;
        if (!hasPos || dist <= UPGRADE_RANGE) {
          if (m.gold < inBestGold) { inBestGold = m.gold; inBest = bot; }
          continue;
        }
        // Mover candidates (anti ping-pong — wiki 12 §4):
        //   • a farming bot inside its min-dwell is NEVER pulled;
        //   • past dwell it's pulled only for an ECONOMY upgrade or once
        //     its stockpile is full (its farm trip is done anyway);
        //   • non-farming bots always beat farming ones, then by distance.
        // Anything that can't be funded in-range right now simply waits —
        // it gets fired in a burst when a stocked bot walks home.
        const farming = bot._coordFarming ? 1 : 0;
        if (farming) {
          if (now < (bot._farmCommitUntil || 0)) continue;
          const wp = bot.myPlayer;
          const full = (wp.wood || 0) >= FULL_STOCK && (wp.stone || 0) >= FULL_STOCK;
          if (!cand.isEco && !full) continue;
        }
        if (farming < moveBestFarming ||
            (farming === moveBestFarming && dist < moveBestDist)) {
          moveBestFarming = farming; moveBestDist = dist; moveBest = bot;
        }
      }
      if (inBest) {
        return { building: cand.b, cost: cand.cost, session: inBest, isEco: cand.isEco, needsMove: false };
      }
      if (moveBest && hasPos) {
        return { building: cand.b, cost: cand.cost, session: moveBest, isEco: cand.isEco, needsMove: true };
      }
    }
    return null;
  }

  // Bring a bot to a building it needs to act on (upgrade/rebuild) when none
  // is in range. Two cases, both jam-safe:
  //   • building is inside the base → recall the bot to its OWN base anchor
  //     (a clear, reachable spot from which the whole base is in range) —
  //     never navigate it into a cramped building tile where 1×1 bots jam.
  //   • building is OUTSIDE the base → walk to it, but never cross the map at
  //     night (zombies); wait for daytime.
  // Throttled per bot and shielded from the farm-retreat loop.
  function dispatchToBuilding(bot, bx, by, now) {
    if (!bot || now - (lastMoveAt.get(bot.id) || 0) <= UPGRADE_MOVE_COOLDOWN_MS) return;
    const home = bot._homePoint && bot._homePoint();
    const nearBase = home && Math.hypot(home.x - bx, home.y - by) <= UPGRADE_RANGE;
    if (nearBase) {
      bot.returnToBase = true;
      bot._coordFarming = false;
      if (bot.setNavActive) bot.setNavActive(false);   // walk to the base anchor
    } else {
      if (bot.isNight && bot.isNight()) return;          // don't leave at night
      // Walk to an APPROACH point short of the building, never its centre:
      // a 2×2 footprint is solid, so the centre tile is unreachable and the
      // bot would jitter at the wall (wiki 12 §2). Stopping ~150u out keeps
      // it comfortably inside the 576u upgrade range. errandTo (unlike the
      // old gotoPoint) does NOT re-anchor the bot's home to the building —
      // that hijack made later "return to base" trips go to the wrong spot.
      const p = bot.myPlayer && bot.myPlayer.position;
      const dx = p ? p.x - bx : 0, dy = p ? p.y - by : 0;
      const d = Math.hypot(dx, dy) || 1;
      const ax = bx + (dx / d) * 150, ay = by + (dy / d) * 150;
      bot._coordFarming = false;
      if (bot.errandTo) bot.errandTo(ax, ay);
      else if (bot.gotoPoint) bot.gotoPoint(ax, ay);
    }
    // Shield the bot from the farm logic for the WHOLE trip (cleared the
    // moment it fires an upgrade). The old 8 s shield expired mid-walk and
    // the farm block yanked the bot straight back out — the back-and-forth.
    bot._upgradeMoveUntil = now + DISPATCH_SHIELD_MS;
    lastMoveAt.set(bot.id, now);
  }

  // Auto-rebuild: remember the established base layout per party and, when
  // a building vanishes (destroyed), place a fresh tier-1 in its slot from
  // an affordable in-range bot (or walk the nearest one over). Smart upgrade
  // then re-upgrades it. GoldStash is skipped (can't be member-rebuilt).
  function rebuildPass(partyId, group, buildings, now, actions) {
    let mem = baseMemory.get(partyId);
    if (!mem) { mem = new Map(); baseMemory.set(partyId, mem); }
    const EST_MS = 8000;     // must be alive this long before we'll rebuild it
    const REBUILD_CD = 4000; // per-slot throttle
    const TILE = 24;
    const keyOf = (t, x, y) => t + "|" + Math.round(x / TILE) + "|" + Math.round(y / TILE);

    const liveKeys = new Set();
    for (const b of buildings) {
      if (b.x == null || b.y == null || b.type === "GoldStash") continue;
      const key = keyOf(b.type, b.x, b.y);
      liveKeys.add(key);
      let rec = mem.get(key);
      if (!rec) { rec = { type: b.type, x: b.x, y: b.y, firstSeen: now, established: false }; mem.set(key, rec); }
      rec.x = b.x; rec.y = b.y;
      if (!rec.established && now - rec.firstSeen >= EST_MS) rec.established = true;
    }

    for (const [key, rec] of mem) {
      if (liveKeys.has(key)) continue;
      if (!rec.established) { mem.delete(key); continue; }   // never stabilised → forget it
      if (now - (lastRebuildAt.get(key) || 0) < REBUILD_CD) continue;
      const cost = placeCost(rec.type);
      if (!cost) { mem.delete(key); continue; }
      let placer = null, mover = null, moverD = Infinity;
      for (const bot of group) {
        const p = bot.myPlayer; if (!p) continue;
        const mats = { gold: p.gold || 0, wood: p.wood || 0, stone: p.stone || 0, token: p.token || 0 };
        if (!canAfford(mats, cost)) continue;
        const pos = p.position;
        const d = pos ? Math.hypot(pos.x - rec.x, pos.y - rec.y) : Infinity;
        if (d <= UPGRADE_RANGE && !placer) placer = bot;
        // Same min-dwell rule as pickUpgrade: don't yank a bot that just
        // committed to a farm trip to walk back for a rebuild.
        if (bot._coordFarming && now < (bot._farmCommitUntil || 0)) continue;
        if (d < moverD) { moverD = d; mover = bot; }
      }
      if (placer) {
        try { placer.sendRpc("MakeBuilding", { type: rec.type, x: rec.x, y: rec.y, yaw: 0 }); } catch {}
        lastRebuildAt.set(key, now);
        if (actions) actions.push({ uid: -1, type: rec.type, rebuild: true, by: placer.id });
      } else if (mover) {
        dispatchToBuilding(mover, rec.x, rec.y, now);
      }
    }
  }

  function runForUser(userId, cfg) {
    const groups = groupBots(userId);
    const now = Date.now();
    const statusGroups = [];

    for (const [partyId, group] of groups) {
      const enabled = cfg.parties.has(partyId);
      const buildings = mergeBuildings(group);
      if (buildings.length === 0) {
        statusGroups.push({ partyId, members: group.length, enabled, note: "no buildings yet" });
        continue;
      }
      // Status-only for parties smart-upgrade isn't enabled on: report
      // the base summary so the dashboard can show it, but perform no
      // upgrades / retreats.
      if (!enabled) {
        const summary0 = {};
        for (const b of buildings) {
          if (!summary0[b.type]) summary0[b.type] = { count: 0, minTier: 99, maxTier: 0 };
          const s = summary0[b.type];
          s.count++; s.minTier = Math.min(s.minTier, b.tier); s.maxTier = Math.max(s.maxTier, b.tier);
        }
        statusGroups.push({
          partyId, members: group.length, enabled: false,
          buildings: buildings.length, summary: summary0,
          materials: group.map((bot) => ({
            sid: bot.id, label: bot.label,
            gold: bot.myPlayer.gold | 0, wood: bot.myPlayer.wood | 0,
            stone: bot.myPlayer.stone | 0, token: bot.myPlayer.token | 0,
          })),
          lastActions: [],
        });
        continue;
      }

      // Buy better pickaxes for faster farming (uses each bot's own gold).
      for (const bot of group) maybePickaxe(bot, now);

      // Mutable per-session material copy for in-cycle deduction.
      const localMats = new Map();
      for (const bot of group) {
        const p = bot.myPlayer;
        localMats.set(bot.id, {
          gold: p.gold || 0, wood: p.wood || 0,
          stone: p.stone || 0, token: p.token || 0,
        });
      }
      // Mutable tier copy so a burst advances the plan within the tick.
      const tierByUid = new Map(buildings.map((b) => [b.uid, b.tier]));
      const workingBuildings = buildings.map((b) => ({ ...b }));

      const actions = [];
      for (let i = 0; i < MAX_UPGRADES_PER_TICK; i++) {
        // Refresh working tiers from our mutable copy.
        for (const b of workingBuildings) b.tier = tierByUid.get(b.uid);
        const pick = pickUpgrade(workingBuildings, group, cfg.aheadBy, localMats, now);
        if (!pick) break;

        // Out-of-range upgrade: no affordable session is close enough.
        // Bring one over jam-safely (recall to base anchor for in-base
        // buildings; only fetch outside-base ones in daytime), then stop
        // for this tick — the building stays pending until a bot's in range.
        if (pick.needsMove) {
          dispatchToBuilding(pick.session, pick.building.x, pick.building.y, now);
          actions.push({ uid: pick.building.uid, type: pick.building.type, by: pick.session.id, move: true });
          break;
        }

        // Fire the upgrade from the chosen session.
        try { pick.session.sendRpc("UpgradeBuilding", { uid: pick.building.uid }); }
        catch {}
        lastUpgradeAt.set(pick.building.uid, now);

        // Dispatch resolved: the session fired, so drop its move shield and,
        // if it was out on a walking errand, recall it to the base anchor —
        // never leave a bot idling next to a remote building overnight.
        if (pick.session._upgradeMoveUntil) {
          pick.session._upgradeMoveUntil = 0;
          if (pick.session.navErrand) {
            pick.session.returnToBase = true;
            if (pick.session.setNavActive) pick.session.setNavActive(false);
          }
        }

        // Deduct locally + optimistically bump tier so the next
        // iteration plans against the post-upgrade state.
        const m = localMats.get(pick.session.id);
        m.gold -= pick.cost.gold; m.wood -= pick.cost.wood;
        m.stone -= pick.cost.stone; m.token -= pick.cost.token;
        tierByUid.set(pick.building.uid, tierByUid.get(pick.building.uid) + 1);

        actions.push({
          uid: pick.building.uid, type: pick.building.type,
          fromTier: pick.building.tier, toTier: pick.building.tier + 1,
          by: pick.session.id, isEco: pick.isEco,
          cost: pick.cost,
        });
      }

      // ── Auto-rebuild: replace dead base buildings while running ──
      if (cfg.autoRebuild !== false) {
        rebuildPass(partyId, group, buildings, now, actions);
      }

      // "Done" = every (non-stash) building is maxed and there's nothing
      // left to upgrade. Drives the when-done behaviour below.
      const allMaxed = buildings.length > 0 &&
        buildings.every((b) => b.type === "GoldStash" || b.tier >= MAX_TIER);
      const whenDone = cfg.whenDone || "keep";
      const resting = allMaxed && whenDone !== "keep";

      // ── Retreat-to-farm integration ──
      // "While saving up gold, retreat to the farm location" and
      // "if a bot is low on materials, go back to farming".
      //   saving = nobody in the group can afford the PRIORITY-HEAD
      //            upgrade (the one pickUpgrade wants to fund next).
      // A bot with a farmSpot is sent to farm when saving OR low on
      // wood/stone, and recalled (nav off) once it's flush again.
      // Hysteresis via the bot._coordFarming flag prevents per-tick
      // thrash; _farmCommitUntil (min-dwell) keeps the dispatcher from
      // yanking it back mid-trip.
      // Hysteresis on FARMABLE materials (wood + stone). Gold comes from
      // mines passively and is spent remotely, so it's a bad trigger —
      // using it caused the farm↔base thrash (bot returned the instant it
      // could afford one upgrade, spent it, then left again). Instead:
      //   start farming when wood OR stone drops below FARM_FLOOR
      //   return only once BOTH are above FARM_CEIL (a full stockpile)
      // The wide floor→ceil band means one long farm trip, not a loop.
      // Thresholds SCALE with the base level (see farmThresholds).
      let savingState = false;   // surfaced on the dashboard status
      if (resting) {
        // Base fully maxed and the user chose an end behaviour:
        //   stop → stop farming, idle in place
        //   base → walk every bot back to the base and settle
        for (const bot of group) {
          if (bot._upgradeMoveUntil && now < bot._upgradeMoveUntil) continue;
          if (whenDone === "base") bot.returnToBase = true;
          if (bot._coordFarming || bot.navActive) {
            bot._coordFarming = false;
            bot.setNavActive(false);
          }
        }
      } else if (cfg.farmWhenSaving !== false) {
        const { ecoMin, restMax } = tierStats(buildings);
        const { floor: FARM_FLOOR, ceil: FARM_CEIL } = farmThresholds(ecoMin, restMax);

        // "saving" = there's a pending upgrade but NO bot can afford the
        // PRIORITY HEAD — the upgrade pickUpgrade would fund next (economy
        // first, then the gap-capped rest), chosen with the same ordering.
        // It must NOT be anchored on the globally-cheapest building (the
        // old code): that included gap-capped walls the picker would never
        // fire, and flipped sign every time passive mine income crossed a
        // cheap price — each flip yanked farm bots home for one click and
        // sent them straight back out. This is the farm↔base ping-pong the
        // wiki calls out (12 §4 "economy-anchored saving"). Debounced so a
        // single tick can't flip the group state.
        let head = null;
        for (const b of buildings) {
          if (b.tier >= MAX_TIER) continue;
          const cls = classOf(b.type, b.tier, ecoMin, restMax, cfg.aheadBy);
          if (cls === 99) continue;                  // gap-capped → never the target
          const c = upgradeCost(b.type, b.tier);
          if (!c) continue;
          if (!head || cls < head.cls ||
              (cls === head.cls && (b.tier < head.tier ||
                (b.tier === head.tier && c.gold < head.cost.gold)))) {
            head = { cls, tier: b.tier, cost: c };
          }
        }
        const anyAfford = head && group.some((bot) => {
          const p = bot.myPlayer;
          return canAfford({ gold: p.gold||0, wood: p.wood||0, stone: p.stone||0, token: p.token||0 }, head.cost);
        });
        const savingNow = !!head && !anyAfford;
        if (savingNow) {
          if (!savingSince.has(partyId)) savingSince.set(partyId, now);
        } else {
          savingSince.delete(partyId);
        }
        const saving = savingNow && (now - (savingSince.get(partyId) || now) > 1500);
        savingState = saving;

        for (const bot of group) {
          if (!bot.farmSpot) continue;          // only manage bots with a spot
          // Don't yank a bot we just dispatched to upgrade an out-of-range
          // building — let it reach the building and fire first.
          if (bot._upgradeMoveUntil && now < bot._upgradeMoveUntil) continue;
          const p = bot.myPlayer;
          const wood = p.wood || 0, stone = p.stone || 0;
          if (!bot._coordFarming) {
            // Start farming when low on materials OR the group is saving.
            if (saving || wood < FARM_FLOOR || stone < FARM_FLOOR) {
              bot._coordFarming = true;
              // Min-dwell: once committed, the dispatcher may not pull this
              // bot back for an upgrade until the dwell elapses (12 §4).
              bot._farmCommitUntil = now + FARM_MIN_DWELL_MS;
              bot.setNavActive(true);
            }
          } else {
            // Return only when NOT saving AND well-stocked on both.
            if (!saving && wood >= FARM_CEIL && stone >= FARM_CEIL) {
              bot._coordFarming = false;
              bot.setNavActive(false);   // walk back home + settle
            }
          }
        }
      }

      // Build a compact tier summary for the dashboard.
      const summary = {};
      for (const b of buildings) {
        if (!summary[b.type]) summary[b.type] = { count: 0, minTier: 99, maxTier: 0 };
        const s = summary[b.type];
        s.count++; s.minTier = Math.min(s.minTier, b.tier); s.maxTier = Math.max(s.maxTier, b.tier);
      }
      const ts = tierStats(buildings);
      const farmGoal = farmThresholds(ts.ecoMin, ts.restMax);
      statusGroups.push({
        partyId,
        members: group.length,
        enabled: true,
        ecoMin: ts.ecoMin, restMax: ts.restMax,
        saving: savingState,
        farmFloor: farmGoal.floor, farmCeil: farmGoal.ceil,
        buildings: buildings.length,
        summary,
        materials: group.map((bot) => ({
          sid: bot.id, label: bot.label,
          gold: bot.myPlayer.gold | 0, wood: bot.myPlayer.wood | 0,
          stone: bot.myPlayer.stone | 0, token: bot.myPlayer.token | 0,
          farming: !!bot._coordFarming,
        })),
        lastActions: actions,
      });
    }

    statuses.set(userId, { ts: now, aheadBy: cfg.aheadBy, groups: statusGroups });
    // Push status to the user's dashboard sockets.
    sendToUser(userId, { op: "smartUpgrade", data: statuses.get(userId) });
  }

  function tick() {
    for (const [userId, cfg] of configs) {
      // Run whenever the user has any party enabled (status for other
      // parties is computed in the same pass).
      if (!cfg.parties || cfg.parties.size === 0) continue;
      try { runForUser(userId, cfg); } catch (e) {
        console.error("[smartUpgrade] tick error for user", userId, e.message);
      }
    }
  }

  const timer = setInterval(tick, TICK_MS);
  timer.unref && timer.unref();

  return { setTuning, setPartyEnabled, getConfig, getStatus };
}

module.exports = { createCoordinator };
