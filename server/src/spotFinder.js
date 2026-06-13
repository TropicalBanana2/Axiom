// spotFinder.js — ideal base + farm spot finder.
//
// Strategy (per request): find the SPOT first, then the farm. We grid the
// map for genuinely open, safe base sites (clear of resources, far from
// enemy bases), and only then attach the nearest eligible tree+stone farm
// pair to each. A site with no farmable pair within shuttle range is
// dropped. This prioritises base quality, then farm proximity.
//
// A farm pair is "eligible" only when the tree and stone OVERLAP tightly
// (gap <= FARM_PAIR_MAX) so a single bot reaches both halves.
//
// Pure over its inputs so it's trivially testable; the endpoint feeds it
// the live worldSpots atlas + the community-scanner stashes. Meaningful
// only where the server's spots are exposed (a non-empty atlas).

const MAP_SIZE = 24000;
const EDGE_MARGIN = 300;          // keep the base off the map border

const FARM_PAIR_MAX = 95;         // tree↔stone gap for a single bot (overlap)

const TOWER = 96;                 // a tower's footprint length (2 grid cells)
const GRID_STEP = 220;            // open-site sampling resolution
const BASE_CLEAR_MIN = 340;       // a base site must clear resources by >= this
const SAFE_BASE_DIST = 700;       // …and sit >= this from any enemy base
// The farm must sit a SAFE distance from the base — zombies spawn around
// the GoldStash, so a too-close farm gets caught in the wave. Min = 32
// tower-lengths from the stash; cap the far end so the shuttle stays sane.
const FARM_DIST_MIN = 32 * TOWER; // 3072u — clear of the base's zombie ring
const FARM_DIST_MAX = 8000;       // …but still reachable for the farm↔base run

const MERGE_DIST = 700;           // collapse base sites whose areas overlap
const RETURN_N = 8;

function nearest(px, py, pts) {
  let best = Infinity;
  for (const p of pts) {
    const dx = p.x - px, dy = p.y - py;
    const d = dx * dx + dy * dy;          // squared — sqrt once at the end
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Clearance to the nearest RESOURCE (tree/stone/camp) or the map edge —
// how much open room a base centred here would have.
function resourceClearance(px, py, spots) {
  const edge = Math.min(px, MAP_SIZE - px, py, MAP_SIZE - py);
  return Math.min(edge, nearest(px, py, spots));
}

// Find and rank ideal base+farm spots.
//   spots: [{ x, y, m }]  resource atlas (Tree/Stone/NeutralCamp)
//   bases: [{ x, y }]     enemy stash positions to avoid
function findSpots(spots, bases, opts = {}) {
  const returnN = opts.returnN || RETURN_N;
  // A base only fits if the open area clears obstacles by at least its
  // own radius — callers building a big base pass minClear so cramped
  // sites are rejected up front.
  const minClear = Math.max(BASE_CLEAR_MIN, opts.minClear || 0);
  spots = (spots || []).filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.y));
  bases = (bases || []).filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y));
  if (spots.length === 0) return [];

  // 1) Eligible farm pairs — tightly overlapping tree+stone.
  const trees = spots.filter((s) => s.m === "Tree");
  const stones = spots.filter((s) => s.m === "Stone");
  const farms = [];
  for (const t of trees) {
    for (const s of stones) {
      const dx = t.x - s.x, dy = t.y - s.y;
      const gap = Math.sqrt(dx * dx + dy * dy);
      if (gap <= FARM_PAIR_MAX) {
        farms.push({ t, s, gap, mid: { x: (t.x + s.x) / 2, y: (t.y + s.y) / 2 } });
      }
    }
  }
  if (farms.length === 0) return [];

  // 2) Grid the map for open, safe base sites; attach the nearest farm.
  const sites = [];
  for (let gx = EDGE_MARGIN; gx <= MAP_SIZE - EDGE_MARGIN; gx += GRID_STEP) {
    for (let gy = EDGE_MARGIN; gy <= MAP_SIZE - EDGE_MARGIN; gy += GRID_STEP) {
      const clr = resourceClearance(gx, gy, spots);
      if (clr < minClear) continue;
      const baseDist = bases.length ? nearest(gx, gy, bases) : Infinity;
      if (baseDist < SAFE_BASE_DIST) continue;
      // 3) Closest eligible farm that is FAR ENOUGH from the base (clear of
      //    the zombie ring) but still within the shuttle cap.
      let farm = null, fd = Infinity;
      for (const f of farms) {
        const d = Math.hypot(gx - f.mid.x, gy - f.mid.y);
        if (d < FARM_DIST_MIN || d > FARM_DIST_MAX) continue;
        if (d < fd) { fd = d; farm = f; }
      }
      if (!farm) continue;                   // no safely-distant farm from here
      const safety = Math.min(baseDist, 3000);
      // Prefer farms just past the safety threshold (least extra walking).
      const score = clr * 1.4 + safety * 0.4 - (fd - FARM_DIST_MIN) * 0.3 - farm.gap * 0.6;
      sites.push({ x: gx, y: gy, clr, baseDist, farm, fd, score });
    }
  }
  if (sites.length === 0) return [];

  // 4) Rank, dedupe overlapping base areas, shape the result.
  sites.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const s of sites) {
    if (kept.some((k) => Math.hypot(k.x - s.x, k.y - s.y) < MERGE_DIST)) continue;
    kept.push(s);
    if (kept.length >= returnN) break;
  }
  return kept.map((s) => ({
    base: { x: Math.round(s.x), y: Math.round(s.y), clearance: Math.round(s.clr) },
    farm: {
      tree: { x: Math.round(s.farm.t.x), y: Math.round(s.farm.t.y) },
      stone: { x: Math.round(s.farm.s.x), y: Math.round(s.farm.s.y) },
      mid: { x: Math.round(s.farm.mid.x), y: Math.round(s.farm.mid.y) },
      gap: Math.round(s.farm.gap),
    },
    distBaseToFarm: Math.round(s.fd),
    distToNearestBase: Number.isFinite(s.baseDist) ? Math.round(s.baseDist) : null,
    score: Math.round(s.score),
  }));
}

module.exports = { findSpots };
