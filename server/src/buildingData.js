// buildingData.js — static zombs.io building data.
//
// Captured live from BuildingShopPrices (they don't change between
// game versions often enough to justify the runtime-capture dance).
// Serves two consumers:
//   - smartUpgrade.js : GoldCosts / WoodCosts / StoneCosts / TokenCosts
//   - pathfinder      : Width / Height (collision box) + walkability
//
// Cost arrays are length-8, indexed by CURRENT tier (index 0 =
// placement; a placed building is tier 1, so tier 1→2 uses index 1).
//
// Walkability (per game rules + user spec):
//   - Door     → walkable ONLY if you own it (same party)
//   - SlowTrap → walkable by anyone (Class "Trap")
//   - everything else → blocking

const BUILDINGS = {
  Wall:        { class: "PlayerObject", w: 48,  h: 48,  walk: "never",
    gold:[0,5,30,60,80,100,250,800], wood:[2,0,0,0,0,0,0,0], stone:[0,2,0,0,0,0,0,0], token:[0,0,0,0,0,0,0,0] },
  GoldStash:   { class: "GoldStash", w: 96, h: 96, walk: "never",
    gold:[0,5000,10000,16000,20000,32000,100000,400000], wood:[0,0,0,0,0,0,0,0], stone:[0,0,0,0,0,0,0,0], token:[0,0,0,0,0,0,0,0] },
  GoldMine:    { class: "GoldMine", w: 96, h: 96, walk: "never",
    gold:[0,200,300,600,800,1200,8000,30000], wood:[5,15,25,35,45,55,700,1600], stone:[5,15,25,35,45,55,700,1600], token:[0,0,0,0,0,0,0,0] },
  Door:        { class: "Door", w: 48, h: 48, walk: "owned",
    gold:[0,10,50,70,150,200,400,800], wood:[5,5,0,0,0,0,0,0], stone:[5,5,0,0,0,0,0,0], token:[0,0,0,0,0,0,0,0] },
  SlowTrap:    { class: "Trap", w: 48, h: 48, walk: "always",
    gold:[0,100,200,400,600,800,1000,1500], wood:[5,25,30,40,50,70,300,800], stone:[5,20,30,40,60,80,300,800], token:[0,0,0,0,0,0,0,0] },
  CannonTower: { class: "Tower", w: 96, h: 96, walk: "never",
    gold:[0,100,200,600,1200,2000,8000,35000], wood:[15,25,30,40,60,80,300,800], stone:[15,25,40,50,80,120,300,800], token:[0,0,0,0,0,0,0,0] },
  ArrowTower:  { class: "ArrowTower", w: 96, h: 96, walk: "never",
    gold:[0,100,200,600,1200,2000,8000,35000], wood:[5,25,30,40,50,70,300,800], stone:[5,20,30,40,60,80,300,800], token:[0,0,0,0,0,0,0,0] },
  MagicTower:  { class: "MagicTower", w: 96, h: 96, walk: "never",
    gold:[0,100,200,600,1200,2000,8000,35000], wood:[15,25,40,50,70,100,300,800], stone:[15,25,40,50,70,100,300,800], token:[0,0,0,0,0,0,0,0] },
  BombTower:   { class: "Tower", w: 96, h: 96, walk: "never",
    gold:[0,100,200,600,1200,2000,8000,35000], wood:[10,25,40,50,80,120,300,800], stone:[10,25,40,50,80,120,300,800], token:[0,0,0,0,0,0,0,0] },
  MeleeTower:  { class: "MeleeTower", w: 96, h: 96, walk: "never",
    gold:[0,100,200,600,1200,2000,8000,35000], wood:[10,25,30,40,50,70,300,800], stone:[10,20,30,40,60,80,300,800], token:[0,0,0,0,0,0,0,0] },
  Harvester:   { class: "Harvester", w: 96, h: 96, walk: "never",
    gold:[0,100,200,600,1200,2000,8000,10000], wood:[5,25,30,40,50,70,300,600], stone:[5,20,30,40,60,80,300,600], token:[0,0,0,0,0,0,0,0] },
};

const MAX_TIER = 8;

// Cost to upgrade `type` from `tier` (1-indexed) to tier+1. null if maxed/unknown.
function upgradeCost(type, tier) {
  const b = BUILDINGS[type];
  if (!b) return null;
  if (tier < 1 || tier >= MAX_TIER) return null;
  const i = tier;
  return { gold: b.gold[i] || 0, wood: b.wood[i] || 0, stone: b.stone[i] || 0, token: b.token[i] || 0 };
}

// Cost to PLACE a fresh tier-1 building of `type` (index 0 of the cost
// arrays). Used by auto-rebuild. null for unknown types.
function placeCost(type) {
  const b = BUILDINGS[type];
  if (!b) return null;
  return { gold: b.gold[0] || 0, wood: b.wood[0] || 0, stone: b.stone[0] || 0, token: b.token[0] || 0 };
}

// Is a building of `type` walkable by this bot?
//   ownedSet: optional Set of building uids this bot/party owns (for doors)
function isWalkable(type, owned) {
  const b = BUILDINGS[type];
  if (!b) return false;            // unknown → treat as solid
  if (b.walk === "always") return true;     // SlowTrap
  if (b.walk === "owned")  return !!owned;   // Door (only if owned)
  return false;                              // Wall / towers / stash / mine
}

// ── Shop items (from ItemShopPrices) ──
// Pickaxe: 7 tiers. GoldCosts indexed by CURRENT tier (index 0 = the
// free tier-1 you start with; index t = cost to go tier t → t+1).
// HarvestCount = resources gathered per swing — higher tier = faster farm.
const ITEMS = {
  Pickaxe: {
    maxTier: 7,
    gold: [0, 1000, 3000, 6000, 8000, 24000, 90000],
    harvest: [1.5, 3, 3, 4.5, 4.5, 6, 9],
  },
};

// Gold to upgrade `itemName` from `tier` (1-indexed) to tier+1, or null.
function itemUpgradeCost(itemName, tier) {
  const it = ITEMS[itemName];
  if (!it) return null;
  if (tier < 1 || tier >= it.maxTier) return null;
  return it.gold[tier] || 0;
}

module.exports = { BUILDINGS, MAX_TIER, ITEMS, upgradeCost, placeCost, itemUpgradeCost, isWalkable };
