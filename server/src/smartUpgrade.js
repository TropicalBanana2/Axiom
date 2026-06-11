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

const { upgradeCost, placeCost, MAX_TIER } = require("./buildingData");
// Persist the per-user tuning knobs so they survive a pm2 restart (the
// bots themselves are re-spawned from the sessions table, so their
// upgrade settings should come back too). Stored in the schema_kv table.
const { schemaGet, schemaSet } = require("./db");

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
// before the dispatcher may pull it back for an upgrade AND before it
// returns voluntarily (wiki 12 §4 "min-farm-dwell" anti-thrash rule).
// Short farm-for-a-few-seconds-then-trek-back trips are useless — the
// travel costs more than the gather — so a trip must pay for itself.
const FARM_MIN_DWELL_MS = 45000;
// Placement (MakeBuilding) uses the SAME 576u player-distance cap as
// upgrades — a rebuild needs a bot right next to the slot.
const PLACE_RANGE = 550;
// A bot within this distance of its base anchor counts as "in the base".
// Bots outside it that aren't farming or mid-dispatch get walked home by
// the keep-in-base sweep, so they don't strand in the open while the base
// upgrades. Wider than the nav ARRIVE radius so it doesn't fight homing.
const BASE_RADIUS = 300;
// Give up an unreachable errand after this and walk home (no looping).
const ERRAND_MS = 15000;

// ── Pet (C.A.R.L.) management ──
// CARL bodies physically jam 1×1 bots in tight base corridors (wiki 12 §3),
// so we despawn CARL (sell it via DeleteBuilding on the pet uid) while a bot
// is idle & safe in the base, and re-summon it (BuyItem+EquipItem) the moment
// it farms or takes damage. We never touch an evolved (tier > 1) CARL —
// re-buying tier 1 would lose its evolution.
const PET_COMBAT_MS = 6000;          // keep CARL this long after taking a hit
const PET_ACT_COOLDOWN_MS = 2500;    // per-bot throttle on buy/equip/sell

// ── Farm harvester ring ──
// A ring of Harvesters around the farm spot converts each bot's surplus gold
// into wood/stone ON SITE, so the party banks materials without trekking home.
// Placement needs a base (GoldStash) to exist, but harvesters themselves can
// sit anywhere (they're exempt from the stash-distance cap — wiki 10 §B1).
const FARM_HARV_MAX = 4;             // harvesters to ring around the farm centre
const FARM_HARV_RADIUS = 192;        // ring radius (4 grid cells out)
const FARM_HARV_ZONE = 480;          // harvesters within this of centre = "farm" ones
const FARM_HARV_PLACE_CD = 6000;     // per-slot placement throttle
const FARM_HARV_FEED_CD = 4000;      // per-harvester feed/collect throttle
const FARM_HARV_FEED_GOLD = 50;      // gold deposited per feed

// "Emerald" gold mines — the high tier at which gold income is so strong that
// hoarding gold is pointless and the pickaxe should be pushed to MAX. Tied to
// the top GoldMine tier reached.
const EMERALD_MINE_TIER = 7;

// A reachable tile just OUTSIDE a building's footprint, on the side facing
// `ref` (the base centre) so the bot approaches from open base ground. Used to
// move a bot next to a building to upgrade/place it — NEVER the solid centre
// (unreachable → endless pathfind). 84 ≈ half a 96 building + body clearance.
function approachPoint(bx, by, ref) {
  let dx = (ref ? ref.x : bx) - bx;
  let dy = (ref ? ref.y : by) - by;
  let d = Math.hypot(dx, dy);
  if (d < 1) { dx = -1; dy = 0; d = 1; }   // ref == building → pick a side
  const OFF = 84;
  return { x: Math.round(bx + (dx / d) * OFF), y: Math.round(by + (dy / d) * OFF) };
}
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
// Pickaxe spending is deliberately STINGY — gold is far better spent on
// the base, and the high pickaxe tiers are terrible value:
//   1→2  1000g / +1.5 =    667 g/harvest  ✓ great
//   2→4  9000g / +1.5 =  6000 g/harvest   ~ ok when farming hard
//   4→6 32000g / +1.5 = 21333 g/harvest   ✗ poor
//   6→7 90000g / +3   = 30000 g/harvest   ✗ worst single buy in the game
// So: a low base cap on gold-per-+harvest that only loosens with a strong
// economy, and a big surplus buffer so a buy never competes with building
// upgrades. Net effect vs. the old code: roughly tier-4 pickaxes on a
// modest base, higher only once the economy is genuinely rich.
const PICKAXE_GPH_BASE = 3500;      // base max gold per +1 harvest
const PICKAXE_GPH_PER_MINE = 1500;  // +cap per top-GoldMine tier
const PICKAXE_GPH_CAP = 16000;      // absolute ceiling (emerald lifts this)
const PICKAXE_BUFFER = 3;           // need cost×this beyond the reserve before buying
const PICKAXE_COOLDOWN_MS = 8000;   // per-bot, until inventory confirms (was 4s)

// Returns the cost to reach the next harvest-increasing tier, or null if
// upgrading isn't worth it from `tier` with `gold` on hand.
//   gphMax  — max gold per +1 harvest we'll pay.
//   reserve — gold to keep untouched (the next GoldStash upgrade cost).
//   buffer  — require gold ≥ cost×buffer + reserve, so a pickaxe buy only
//             happens when the bot is genuinely flush, never draining gold
//             the base could be spending on buildings.
function pickaxeWorthIt(tier, gold, gphMax, reserve, buffer) {
  if (tier >= 7) return null;
  const curH = PICK_HARVEST[tier];
  // Walk forward to the next tier with strictly more harvest.
  let cost = 0, nt = tier;
  while (nt < 7) { cost += PICK_STEP_COST[nt]; nt++; if (PICK_HARVEST[nt] > curH) break; }
  if (PICK_HARVEST[nt] <= curH) return null;       // no improvement reachable
  const gain = PICK_HARVEST[nt] - curH;
  if (cost / gain > gphMax) return null;           // too pricey per +harvest
  if (gold < cost * buffer + reserve) return null; // need a real surplus
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
  // bot.id -> rolling window of {t, gold, wood, stone} samples for the
  // economy dashboard (income/min, gather/min, ETA-to-next-upgrade).
  const ecoSamples = new Map();
  const ECO_WINDOW = 75;   // ~75 samples ≈ 75 s at the 1 Hz tick

  // Push a material sample for `bot` and return its rolling rates. Income
  // and gather use POSITIVE deltas only (gold spent / materials consumed
  // don't count against the earn rate); goldNetPerSec is the raw trend
  // used to project the saver's ETA to the next economy upgrade.
  function sampleEconomy(bot, now) {
    const p = bot.myPlayer;
    if (!p) return { goldPerMin: 0, matsPerMin: 0, goldNetPerSec: 0 };
    let arr = ecoSamples.get(bot.id);
    if (!arr) { arr = []; ecoSamples.set(bot.id, arr); }
    arr.push({ t: now, gold: p.gold || 0, wood: p.wood || 0, stone: p.stone || 0 });
    if (arr.length > ECO_WINDOW) arr.shift();
    if (arr.length < 2) return { goldPerMin: 0, matsPerMin: 0, goldNetPerSec: 0 };
    let gUp = 0, mUp = 0;
    for (let i = 1; i < arr.length; i++) {
      const dg = arr[i].gold - arr[i - 1].gold;
      if (dg > 0) gUp += dg;
      const dm = (arr[i].wood - arr[i - 1].wood) + (arr[i].stone - arr[i - 1].stone);
      if (dm > 0) mUp += dm;
    }
    const spanSec = Math.max(1, (arr[arr.length - 1].t - arr[0].t) / 1000);
    return {
      goldPerMin: Math.round((gUp / spanSec) * 60),
      matsPerMin: Math.round((mUp / spanSec) * 60),
      goldNetPerSec: (arr[arr.length - 1].gold - arr[0].gold) / spanSec,
    };
  }
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
  // Throttles for pet management + farm harvesters.
  const lastPetAt = new Map();        // bot.id -> last pet buy/equip/sell ts
  const lastHarvPlaceAt = new Map();  // slotKey -> last placement ts
  const lastHarvFeedAt = new Map();   // harvester uid -> last feed/collect ts

  // Buy the next pickaxe tier ONLY when the harvest-gain math says it's
  // worth it (see pickaxeWorthIt). Buys one step at a time toward the
  // next harvest-increasing tier.
  //   mineTier — top GoldMine tier the base has reached. Willingness to pay
  //   for the pickaxe scales with it (gold flows faster), and at emerald
  //   mines the pickaxe is pushed all the way to MAX tier.
  function maybePickaxe(bot, now, mineTier, stashReserve) {
    if (!bot.farmSpot) return;          // only farming bots benefit from a pickaxe
    const tier = bot.getPickaxeTier ? bot.getPickaxeTier() : 1;
    if (now - (lastPickaxeAt.get(bot.id) || 0) < PICKAXE_COOLDOWN_MS) return;
    const gold = (bot.myPlayer && bot.myPlayer.gold) || 0;
    const lvl = mineTier || 0;
    const emerald = lvl >= EMERALD_MINE_TIER;
    // Cap on gold-per-+harvest grows gently with the top mine tier and is
    // ceilinged; emerald mines (income is overflowing) lift the ceiling so
    // the pickaxe can finally reach max, but still behind the surplus
    // buffer. ALWAYS keep the next stash upgrade's gold in reserve.
    const gphMax = emerald
      ? 40000   // enough to allow the 6→7 (30k/harvest) step when truly rich
      : Math.min(PICKAXE_GPH_CAP, PICKAXE_GPH_BASE + PICKAXE_GPH_PER_MINE * lvl);
    const buffer = emerald ? 2 : PICKAXE_BUFFER;
    if (pickaxeWorthIt(tier, gold, gphMax, stashReserve || 0, buffer) == null) return;
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
      petManage: true,          // despawn CARL in base, re-summon on damage/farm
      farmHarvesters: true,     // ring harvesters around the farm + feed/collect
      parties: new Set(),
    };
  }
  // Durable tuning only. We deliberately DON'T persist the enabled
  // `parties` set: partyIds are zombs.io runtime values that change when
  // bots rejoin after a restart, so replaying them could enable
  // smart-upgrade on the wrong/recycled party. The user re-enables a
  // party each session; their knobs (aheadBy/farmWhenSaving/etc.) return.
  const PERSIST_KEY = (userId) => `smartUpgrade:${userId}`;
  function persistTuning(userId, c) {
    try {
      schemaSet(PERSIST_KEY(userId), {
        aheadBy: c.aheadBy, farmWhenSaving: c.farmWhenSaving,
        autoRebuild: c.autoRebuild, whenDone: c.whenDone,
        petManage: c.petManage, farmHarvesters: c.farmHarvesters,
      });
    } catch (e) { /* persistence is best-effort; never break the tick */ }
  }
  function hydrate(c, userId) {
    let saved = null;
    try { saved = schemaGet(PERSIST_KEY(userId)); } catch { saved = null; }
    if (!saved || typeof saved !== "object") return c;
    if (typeof saved.aheadBy === "number") c.aheadBy = Math.max(0, Math.min(7, saved.aheadBy | 0));
    if (typeof saved.farmWhenSaving === "boolean") c.farmWhenSaving = saved.farmWhenSaving;
    if (typeof saved.autoRebuild === "boolean") c.autoRebuild = saved.autoRebuild;
    if (["keep", "stop", "base"].includes(saved.whenDone)) c.whenDone = saved.whenDone;
    if (typeof saved.petManage === "boolean") c.petManage = saved.petManage;
    if (typeof saved.farmHarvesters === "boolean") c.farmHarvesters = saved.farmHarvesters;
    return c;
  }
  function getRaw(userId) {
    let c = configs.get(userId);
    if (!c) { c = hydrate(freshConfig(), userId); configs.set(userId, c); }
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
    if (partial.petManage !== undefined) c.petManage = !!partial.petManage;
    if (partial.farmHarvesters !== undefined) c.farmHarvesters = !!partial.farmHarvesters;
    persistTuning(userId, c);
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
    // getRaw (not freshConfig) so a dashboard reconnect after a restart
    // re-reads the persisted tuning instead of showing defaults.
    const c = getRaw(userId);
    return {
      aheadBy: c.aheadBy, farmWhenSaving: c.farmWhenSaving,
      autoRebuild: c.autoRebuild !== false,
      whenDone: c.whenDone || "keep",
      petManage: c.petManage !== false,
      farmHarvesters: c.farmHarvesters !== false,
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
  function pickUpgrade(buildings, group, aheadBy, localMats, now, reserve) {
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
        // Gold reservation: the designated saver's gold is earmarked for
        // the next economy upgrade (the 100k/400k stash tiers etc.). It
        // may only pay for OTHER buildings if doing so still leaves the
        // FULL economy cost untouched — so its pile only ever grows
        // toward the stash, and the stash is bought the moment it can be.
        if (reserve && bot.id === reserve.saverId && cand.b.uid !== reserve.uid &&
            (m.gold - cand.cost.gold) < reserve.gold) continue;
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
  function dispatchToBuilding(bot, bx, by, now, stashPos) {
    if (!bot || now - (lastMoveAt.get(bot.id) || 0) <= UPGRADE_MOVE_COOLDOWN_MS) return;
    const home = bot._homePoint && bot._homePoint();
    const nearBase = home && Math.hypot(home.x - bx, home.y - by) <= UPGRADE_RANGE;
    if (nearBase) {
      bot.returnToBase = true;
      bot._coordFarming = false;
      if (bot.setNavActive) bot.setNavActive(false);   // walk to the base anchor
    } else {
      if (bot.isNight && bot.isNight()) return;          // don't leave at night
      // Walk to an APPROACH point beside the building, never its centre:
      // a 2×2 footprint is solid, so the centre tile is unreachable and the
      // bot would jitter at the wall (wiki 12 §2). Approach from the side
      // facing the stash (open base ground). errandTo (unlike the old
      // gotoPoint) does NOT re-anchor the bot's home to the building —
      // that hijack made later "return to base" trips go to the wrong spot.
      const ap = approachPoint(bx, by, stashPos || (bot.myPlayer && bot.myPlayer.position));
      bot._coordFarming = false;
      bot._errandUntil = now + ERRAND_MS;   // give up if unreachable, walk home
      if (bot.errandTo) bot.errandTo(ap.x, ap.y);
      else if (bot.gotoPoint) bot.gotoPoint(ap.x, ap.y);
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
    const stashB = buildings.find((b) => b.type === "GoldStash");
    const stashRef = stashB ? { x: stashB.x, y: stashB.y } : null;
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
        if (d <= PLACE_RANGE && !placer) placer = bot;
        // Same min-dwell rule as pickUpgrade: don't yank a bot that just
        // committed to a farm trip to walk back for a rebuild.
        if (bot._coordFarming && now < (bot._farmCommitUntil || 0)) continue;
        if (d < moverD) { moverD = d; mover = bot; }
      }
      if (placer) {
        try { placer.sendRpc("MakeBuilding", { type: rec.type, x: rec.x, y: rec.y, yaw: 0 }); } catch {}
        lastRebuildAt.set(key, now);
        // Placed → if the bot walked here on an errand, send it home.
        if (placer.navErrand) {
          placer._upgradeMoveUntil = 0;
          placer.returnToBase = true;
          if (placer.setNavActive) placer.setNavActive(false);
        }
        if (actions) actions.push({ uid: -1, type: rec.type, rebuild: true, by: placer.id });
      } else if (mover) {
        dispatchToBuilding(mover, rec.x, rec.y, now, stashRef);
      }
    }
  }

  // ── Pet management: despawn CARL while idle & safe in base, re-summon on
  // damage / while farming. CARL's body jams 1×1 bots in tight base corridors.
  function managePet(bot, now) {
    const p = bot.myPlayer; if (!p) return;
    const petUid = p.petUid || 0;
    const has = !!(petUid && bot.entities && bot.entities.has(petUid));
    const hp = p.health || 0, maxHp = p.maxHealth || 0;
    // Detect a hit (health dropped since last pass) → keep CARL out a while.
    if (bot._petLastHp != null && hp < bot._petLastHp - 0.5) bot._petCombatUntil = now + PET_COMBAT_MS;
    bot._petLastHp = hp;
    const damaged = maxHp > 0 && hp > 0 && hp < maxHp * 0.999;   // below full = under threat
    const wantCarl = !!(bot._coordFarming || damaged || (now < (bot._petCombatUntil || 0)) || p.dead);

    if (now - (lastPetAt.get(bot.id) || 0) < PET_ACT_COOLDOWN_MS) return;
    if (wantCarl) {
      if (!has) {
        // Re-acquire (sold pets must be re-bought before equipping).
        try {
          bot.sendRpc("BuyItem",  { itemName: "PetCARL", tier: 1 });
          bot.sendRpc("EquipItem", { itemName: "PetCARL", tier: 1 });
        } catch {}
        lastPetAt.set(bot.id, now);
      }
      return;
    }
    // Not wanted → despawn, but only when actually idle in the base and the
    // pet is unevolved (selling a tier>1 CARL would waste its evolution).
    if (!has) return;
    const petTier = (bot.myPet && bot.myPet.tier) || 1;
    if (petTier > 1) return;
    const home = bot._homePoint && bot._homePoint();
    const pos = p.position;
    const inBase = home && pos && Math.hypot(pos.x - home.x, pos.y - home.y) <= BASE_RADIUS;
    if (!inBase) return;
    try { bot.sendRpc("DeleteBuilding", { uid: petUid }); } catch {}   // "sell" the pet to despawn it
    lastPetAt.set(bot.id, now);
  }

  // Centre of the party's farm spots (where the harvester ring goes).
  function farmCentre(group) {
    let sx = 0, sy = 0, n = 0;
    for (const bot of group) {
      const f = bot.farmSpot; if (!f) continue;
      sx += f.x; sy += f.y; n++;
    }
    return n ? { x: sx / n, y: sy / n } : null;
  }

  // ── Farm harvester ring + distributed feed/collect ──
  // Place up to FARM_HARV_MAX harvesters around the farm centre, then feed
  // each one gold and collect its wood/stone from whichever bot is nearest —
  // converting surplus gold into materials on site. Needs a base (GoldStash).
  function farmHarvestPass(group, buildings, now, actions, saverId) {
    const centre = farmCentre(group);
    if (!centre) return;
    if (!buildings.some((b) => b.type === "GoldStash")) return;   // need a base to build

    const farmHarv = buildings.filter((b) =>
      b.type === "Harvester" && Math.hypot(b.x - centre.x, b.y - centre.y) <= FARM_HARV_ZONE);

    // Placement — fill the ring (one per tick).
    if (farmHarv.length < FARM_HARV_MAX) {
      const targets = [];
      for (const bot of group) for (const t of (bot.farmTargets || [])) targets.push(t);
      for (let i = 0; i < FARM_HARV_MAX; i++) {
        const a = (2 * Math.PI * i) / FARM_HARV_MAX - Math.PI / 2;
        const sx = Math.round((centre.x + Math.cos(a) * FARM_HARV_RADIUS) / 48) * 48;
        const sy = Math.round((centre.y + Math.sin(a) * FARM_HARV_RADIUS) / 48) * 48;
        if (buildings.some((b) => Math.hypot(b.x - sx, b.y - sy) < 72)) continue;   // occupied
        if (targets.some((t) => Math.hypot(t.x - sx, t.y - sy) < 80)) continue;     // on tree/stone
        const slotKey = Math.round(sx / 48) + ":" + Math.round(sy / 48);
        if (now - (lastHarvPlaceAt.get(slotKey) || 0) < FARM_HARV_PLACE_CD) continue;
        const placer = group.find((bot) => {
          const p = bot.myPlayer;
          if (!p || !p.position) return false;
          if (Math.hypot(p.position.x - sx, p.position.y - sy) > PLACE_RANGE) return false;
          return (p.wood || 0) >= 5 && (p.stone || 0) >= 5;
        });
        if (!placer) continue;
        // Rotate each harvester to face the farm centre. Yaw is degrees with
        // 0 = UP, increasing clockwise, in 90° steps (only Harvester and
        // MeleeTower may rotate — wiki 10 §B1). The +450 converts the math
        // angle (0 = east) to the game's 0 = up frame, then snap to cardinal.
        const inwardDeg = (Math.atan2(centre.y - sy, centre.x - sx) * 180 / Math.PI + 450) % 360;
        const yaw = (Math.round(inwardDeg / 90) * 90) % 360;
        try { placer.sendRpc("MakeBuilding", { type: "Harvester", x: sx, y: sy, yaw }); } catch {}
        lastHarvPlaceAt.set(slotKey, now);
        if (actions) actions.push({ uid: -2, type: "Harvester", farmHarvester: true, by: placer.id });
        break;   // one placement per tick
      }
    }

    // Distributed feed + collect — nearest in-range bot services each
    // harvester. The designated SAVER never feeds: its gold is earmarked
    // for the next stash/mine tier and a 50-gold drip per feed would
    // meaningfully delay a 100k/400k save.
    for (const h of farmHarv) {
      if (now - (lastHarvFeedAt.get(h.uid) || 0) < FARM_HARV_FEED_CD) continue;
      let best = null, bestD = Infinity;
      for (const bot of group) {
        if (saverId && bot.id === saverId) continue;   // saver's gold is reserved
        const p = bot.myPlayer; if (!p || !p.position) continue;
        const d = Math.hypot(p.position.x - h.x, p.position.y - h.y);
        if (d <= UPGRADE_RANGE && d < bestD) { bestD = d; best = bot; }
      }
      if (!best) continue;
      try {
        if ((best.myPlayer.gold || 0) > FARM_HARV_FEED_GOLD * 2) {
          best.sendRpc("AddDepositToHarvester", { uid: h.uid, deposit: FARM_HARV_FEED_GOLD });
        }
        best.sendRpc("CollectHarvester", { uid: h.uid });
      } catch {}
      lastHarvFeedAt.set(h.uid, now);
    }
  }

  function runForUser(userId, cfg) {
    const groups = groupBots(userId);
    const now = Date.now();
    const statusGroups = [];

    for (const [partyId, group] of groups) {
      // Per-party fault isolation: a malformed building/bot state in one
      // party must not abort the whole user's pass and starve the others.
      try {
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

      // ── Next economy step + designated saver ──
      // Materials are per-player and CANNOT be pooled, so one single
      // wallet has to accumulate the full stash/mine cost (100k for the
      // tier-7 stash, 400k for tier-8). We designate the richest bot as
      // the SAVER: its gold is reserved for the economy target — the
      // picker won't spend it on other buildings, pickaxe buys keep it
      // intact, and harvester feeding skips it. Everyone else spends
      // freely: their gold could never fund the stash anyway.
      let ecoTarget = null;
      let mineTier = 0;
      for (const b of buildings) {
        if (b.type === "GoldMine" && b.tier > mineTier) mineTier = b.tier;
        if (!ECONOMY_TYPES.has(b.type) || b.tier >= MAX_TIER) continue;
        const c = upgradeCost(b.type, b.tier);
        if (!c) continue;
        if (!ecoTarget || b.tier < ecoTarget.tier ||
            (b.tier === ecoTarget.tier && c.gold < ecoTarget.cost.gold)) {
          ecoTarget = { uid: b.uid, type: b.type, tier: b.tier, cost: c };
        }
      }
      let saver = null;
      if (ecoTarget) {
        for (const bot of group) {
          if (!saver || (bot.myPlayer.gold || 0) > (saver.myPlayer.gold || 0)) saver = bot;
        }
      }
      const ecoReserve = (ecoTarget && saver)
        ? { saverId: saver.id, uid: ecoTarget.uid, gold: ecoTarget.cost.gold }
        : null;

      // Buy better pickaxes for FARMING bots (uses each bot's own gold).
      // Willingness scales with the top GoldMine tier (emerald → max).
      // Only the SAVER reserves the economy target's gold — the others'
      // gold can't fund the stash, so spending it on pickaxes is free.
      for (const bot of group) {
        const reserve = (ecoReserve && bot.id === ecoReserve.saverId) ? ecoReserve.gold : 0;
        maybePickaxe(bot, now, mineTier, reserve);
      }

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
      const stashB = buildings.find((b) => b.type === "GoldStash");
      const stashPos = stashB ? { x: stashB.x, y: stashB.y } : null;

      const actions = [];
      for (let i = 0; i < MAX_UPGRADES_PER_TICK; i++) {
        // Refresh working tiers from our mutable copy.
        for (const b of workingBuildings) b.tier = tierByUid.get(b.uid);
        const pick = pickUpgrade(workingBuildings, group, cfg.aheadBy, localMats, now, ecoReserve);
        if (!pick) break;

        // Out-of-range upgrade: no affordable session is close enough.
        // Bring one over jam-safely (recall to base anchor for in-base
        // buildings; only fetch outside-base ones in daytime), then stop
        // for this tick — the building stays pending until a bot's in range.
        if (pick.needsMove) {
          dispatchToBuilding(pick.session, pick.building.x, pick.building.y, now, stashPos);
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

      // "Done" = EVERY building (including the GoldStash) is maxed. The
      // stash used to be excluded here, which made "when done: stop/base"
      // kick in while the stash still had its expensive 100k/400k tiers
      // pending — the coordinator recalled everyone and nobody farmed for
      // the stash. The stash upgrades like everything else; it counts.
      const allMaxed = buildings.length > 0 &&
        buildings.every((b) => b.tier >= MAX_TIER);
      const whenDone = cfg.whenDone || "keep";
      const resting = allMaxed && whenDone !== "keep";

      // ── Retreat-to-farm integration ──
      // "While saving up gold, retreat to the farm location" and
      // "if a bot is low on materials, go back to farming".
      //   saving = nobody in the group can afford the next ECONOMY
      //            upgrade (stash/mine; falls back to the priority head
      //            when the economy is fully maxed).
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

        // "saving" = nobody in the group can afford the SAVING TARGET.
        // The target is the next ECONOMY upgrade when one is pending —
        // the 100k tier-7 / 400k tier-8 stash, or the next mine — and
        // only falls back to the priority head when the economy is fully
        // maxed. It must NOT be anchored on the globally-cheapest
        // building: that flipped sign every time passive mine income
        // crossed a cheap price — each flip yanked farm bots home for
        // one click and sent them straight back out (the farm↔base
        // ping-pong; wiki 12 §4 "economy-anchored saving"). Debounced so
        // a single tick can't flip the group state.
        let savingTarget = ecoTarget ? ecoTarget.cost : null;
        if (!savingTarget) {
          let head = null;
          for (const b of buildings) {
            if (b.tier >= MAX_TIER) continue;
            const cls = classOf(b.type, b.tier, ecoMin, restMax, cfg.aheadBy);
            if (cls === 99) continue;                // gap-capped → never the target
            const c = upgradeCost(b.type, b.tier);
            if (!c) continue;
            if (!head || cls < head.cls ||
                (cls === head.cls && (b.tier < head.tier ||
                  (b.tier === head.tier && c.gold < head.cost.gold)))) {
              head = { cls, tier: b.tier, cost: c };
            }
          }
          savingTarget = head && head.cost;
        }
        const anyAfford = savingTarget && group.some((bot) => {
          const p = bot.myPlayer;
          return canAfford({ gold: p.gold||0, wood: p.wood||0, stone: p.stone||0, token: p.token||0 }, savingTarget);
        });
        const savingNow = !!savingTarget && !anyAfford;
        if (savingNow) {
          if (!savingSince.has(partyId)) savingSince.set(partyId, now);
        } else {
          savingSince.delete(partyId);
        }
        const saving = savingNow && (now - (savingSince.get(partyId) || now) > 1500);
        savingState = saving;

        // ALL hands farm while saving: a bot with no farm spot of its own
        // adopts the group's spot (the ring slots fan everyone out around
        // it), so nobody idles at base while the party saves for an
        // expensive stash tier.
        if (saving) {
          const donor = group.find((b) => b.farmSpot);
          if (donor) {
            for (const bot of group) {
              if (bot.farmSpot || !bot.setFarmSpot) continue;
              bot.setFarmSpot(donor.farmSpot.x, donor.farmSpot.y, donor.farmSpot.angle);
              if (donor.farmTargets && bot.setFarmTargets) bot.setFarmTargets(donor.farmTargets);
              bot.farmFixed = donor.farmFixed;
              bot._adoptedFarmSpot = true;
            }
          }
        }

        for (const bot of group) {
          if (!bot.farmSpot) continue;          // only manage bots with a spot
          // Don't yank a bot we just dispatched to upgrade an out-of-range
          // building — let it reach the building and fire first.
          if (bot._upgradeMoveUntil && now < bot._upgradeMoveUntil) continue;
          const p = bot.myPlayer;
          const wood = p.wood || 0, stone = p.stone || 0;
          // Saver fast-path: once the designated saver is within reach of
          // the economy target (≥95% funded — passive mine income closes
          // the rest), bring it home so the upgrade fires the moment the
          // last gold lands, and don't send it back out for a pointless
          // half-trip. Its gold only grows (it's reserved), so this can't
          // thrash.
          if (ecoReserve && bot.id === ecoReserve.saverId &&
              (p.gold || 0) >= ecoReserve.gold * 0.95) {
            if (bot._coordFarming) {
              bot._coordFarming = false;
              bot.returnToBase = true;
              bot.setNavActive(false);   // walk home, fire on arrival
            }
            continue;
          }
          if (!bot._coordFarming) {
            // Start farming when low on materials OR the group is saving.
            if (saving || wood < FARM_FLOOR || stone < FARM_FLOOR) {
              bot._coordFarming = true;
              // Min-dwell: once committed, the dispatcher may not pull this
              // bot back for an upgrade until the dwell elapses (12 §4).
              bot._farmCommitUntil = now + FARM_MIN_DWELL_MS;
              bot.returnToBase = true;   // so the later recall WALKS home, not stop-in-place
              bot.setNavActive(true);
            }
          } else {
            // Return only when the run has paid for itself (min dwell) AND
            // we're NOT saving AND well-stocked on both. The dwell floor
            // kills the useless farm-for-5s-then-trek-back cycling.
            if (now >= (bot._farmCommitUntil || 0) &&
                !saving && wood >= FARM_CEIL && stone >= FARM_CEIL) {
              bot._coordFarming = false;
              bot.setNavActive(false);   // walk back home + settle
            }
          }
        }
      }

      // Errand timeout: a bot that can't reach its building (walled in) gives
      // up after ERRAND_MS and walks home — no looping, no blacklist.
      for (const bot of group) {
        if (bot.navErrand && now > (bot._errandUntil || 0)) {
          bot.returnToBase = true;
          bot.setNavActive(false);   // clears the errand, walks home
        }
      }

      // ── Keep non-farming bots INSIDE the base while upgrading ──
      // Anything that isn't actively farming, mid-dispatch, or on an errand
      // belongs in the base, not idling in the open. Walk stragglers home —
      // edge-triggered on navReturning so we don't reset their path per tick.
      if (!resting) {
        for (const bot of group) {
          if (bot._coordFarming) continue;   // farming → leave it out
          if (bot.navErrand) continue;       // heading to a building → leave it
          if (bot._upgradeMoveUntil && now < bot._upgradeMoveUntil) continue;
          const home = bot._homePoint && bot._homePoint();
          const p = bot.myPlayer && bot.myPlayer.position;
          if (!home || !p) continue;
          const away = Math.hypot(p.x - home.x, p.y - home.y) > BASE_RADIUS;
          if (away && !bot.navReturning) {
            bot.returnToBase = true;
            if (bot.setNavActive) bot.setNavActive(false);   // begin walking home
          }
        }
      }

      // Pet management (despawn CARL in base / re-summon on damage/farm).
      if (cfg.petManage !== false) {
        for (const bot of group) managePet(bot, now);
      }
      // Farm harvester ring — convert surplus gold to materials at the farm.
      if (cfg.farmHarvesters !== false) {
        farmHarvestPass(group, buildings, now, actions, ecoReserve && ecoReserve.saverId);
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

      // ── Economy rates (dashboard) ──
      // Sample every bot's materials this tick and fold the rolling rates
      // into the per-bot list. Party totals + the saver's ETA to the next
      // economy upgrade ride alongside.
      const rateById = new Map();
      let partyGoldPerMin = 0, partyMatsPerMin = 0, saverNetPerSec = 0;
      for (const bot of group) {
        const r = sampleEconomy(bot, now);
        rateById.set(bot.id, r);
        partyGoldPerMin += r.goldPerMin;
        partyMatsPerMin += r.matsPerMin;
        if (saver && bot.id === saver.id) saverNetPerSec = r.goldNetPerSec;
      }
      // ETA: how long until the saver can fund the next economy upgrade,
      // projected from its observed net-gold trend. Only meaningful while
      // it's actually climbing toward the target.
      let etaSec = null;
      if (ecoTarget && saver) {
        const remaining = ecoTarget.cost.gold - (saver.myPlayer.gold | 0);
        if (remaining <= 0) etaSec = 0;
        else if (saverNetPerSec > 0.5) etaSec = Math.round(remaining / saverNetPerSec);
      }

      statusGroups.push({
        partyId,
        members: group.length,
        enabled: true,
        ecoMin: ts.ecoMin, restMax: ts.restMax,
        saving: savingState,
        // Stash/mine progress: what the group is saving toward, who's
        // carrying the gold, and how close they are.
        ecoNext: ecoTarget ? {
          type: ecoTarget.type, toTier: ecoTarget.tier + 1,
          gold: ecoTarget.cost.gold,
          saver: saver ? saver.id : null,
          saverLabel: saver ? saver.label : null,
          saverGold: saver ? (saver.myPlayer.gold | 0) : 0,
        } : null,
        // Live economy rates for the dashboard panel.
        economy: {
          goldPerMin: partyGoldPerMin,
          matsPerMin: partyMatsPerMin,
          etaSec,
        },
        farmFloor: farmGoal.floor, farmCeil: farmGoal.ceil,
        buildings: buildings.length,
        summary,
        materials: group.map((bot) => {
          const r = rateById.get(bot.id) || { goldPerMin: 0, matsPerMin: 0 };
          return {
            sid: bot.id, label: bot.label,
            gold: bot.myPlayer.gold | 0, wood: bot.myPlayer.wood | 0,
            stone: bot.myPlayer.stone | 0, token: bot.myPlayer.token | 0,
            farming: !!bot._coordFarming,
            goldPerMin: r.goldPerMin, matsPerMin: r.matsPerMin,
          };
        }),
        lastActions: actions,
      });
      } catch (ePart) {
        console.error("[smartUpgrade] party", partyId, "error:", ePart && ePart.message);
        statusGroups.push({
          partyId, members: group.length,
          enabled: cfg.parties.has(partyId),
          error: (ePart && ePart.message) || "error",
        });
      }
    }

    statuses.set(userId, { ts: now, aheadBy: cfg.aheadBy, groups: statusGroups });
    // Push status to the user's dashboard sockets.
    sendToUser(userId, { op: "smartUpgrade", data: statuses.get(userId) });
  }

  // ── Bounded memory ──────────────────────────────────────────────────
  // The per-uid / per-slot timestamp maps (lastUpgradeAt, lastRebuildAt)
  // are keyed by values that churn over a server's lifetime — buildings
  // are destroyed and rebuilt, bases get relocated — so without pruning
  // they grow without bound. Likewise per-party state (savingSince,
  // baseMemory) leaks once a party disappears entirely. Prune periodically.
  const PRUNE_EVERY = 60;             // ~once a minute (TICK_MS = 1000)
  const STALE_TS_MS = 5 * 60 * 1000;  // forget cooldown stamps older than 5 min
  let tickCount = 0;

  function pruneStale(now, activeParties) {
    for (const [k, t] of lastUpgradeAt) if (now - t > STALE_TS_MS) lastUpgradeAt.delete(k);
    for (const [k, t] of lastRebuildAt) if (now - t > STALE_TS_MS) lastRebuildAt.delete(k);
    for (const [k, t] of lastPickaxeAt) if (now - t > STALE_TS_MS) lastPickaxeAt.delete(k);
    for (const [k, t] of lastMoveAt)      if (now - t > STALE_TS_MS) lastMoveAt.delete(k);
    for (const [k, t] of lastPetAt)       if (now - t > STALE_TS_MS) lastPetAt.delete(k);
    for (const [k, t] of lastHarvPlaceAt) if (now - t > STALE_TS_MS) lastHarvPlaceAt.delete(k);
    for (const [k, t] of lastHarvFeedAt)  if (now - t > STALE_TS_MS) lastHarvFeedAt.delete(k);
    // Economy samples: drop a bot's buffer once its newest sample is stale.
    for (const [k, arr] of ecoSamples) {
      if (!arr.length || now - arr[arr.length - 1].t > STALE_TS_MS) ecoSamples.delete(k);
    }
    // Drop per-party state for parties no bot is in anymore.
    for (const pid of savingSince.keys()) if (!activeParties.has(pid)) savingSince.delete(pid);
    for (const pid of baseMemory.keys())  if (!activeParties.has(pid)) baseMemory.delete(pid);
  }

  function tick() {
    const now = Date.now();
    // Outer guard: a timer callback that throws would surface as an
    // uncaughtException and could take the sessions process down. Never
    // let the coordinator be a single point of failure for the server.
    try {
      for (const [userId, cfg] of configs) {
        // Run whenever the user has any party enabled (status for other
        // parties is computed in the same pass).
        if (!cfg.parties || cfg.parties.size === 0) continue;
        try { runForUser(userId, cfg); } catch (e) {
          console.error("[smartUpgrade] tick error for user", userId, e && e.message);
        }
      }
      if (++tickCount % PRUNE_EVERY === 0) {
        const activeParties = new Set();
        for (const bot of getBots()) {
          if (bot && bot.myPlayer && bot.myPlayer.partyId) activeParties.add(bot.myPlayer.partyId);
        }
        pruneStale(now, activeParties);
      }
    } catch (e) {
      console.error("[smartUpgrade] tick fatal:", e && e.message);
    }
  }

  const timer = setInterval(tick, TICK_MS);
  timer.unref && timer.unref();

  return { setTuning, setPartyEnabled, getConfig, getStatus };
}

module.exports = { createCoordinator };
