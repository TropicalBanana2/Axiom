// spotFinder.js — ideal farm + base spot finder.
//
// Given a server's known resource spots (the worldSpots atlas) and the
// enemy base positions (the community scanner), rank the best places to
// set up: a tight tree+stone PAIR a single bot can farm both halves of,
// next to a large OPEN AREA clear enough to drop a base, and far from any
// existing base.
//
// Pure over its inputs so it's trivially testable; the endpoint feeds it
// the live atlas + scanner stashes. Only meaningful when the server's
// spots are actually exposed (a non-empty atlas).

const MAP_SIZE = 24000;
const EDGE_MARGIN = 250;          // keep the base off the map border

const FARM_PAIR_MAX = 200;        // tree↔stone gap a single bot can farm both
const TOP_PAIRS = 120;            // only open-area-search the tightest pairs

const BASE_SEARCH_MIN = 280;      // look for open ground this far from the farm…
const BASE_SEARCH_MAX = 1000;     // …out to here
const BASE_SEARCH_STEP = 110;
const BASE_CLEAR_MIN = 340;       // open area must clear obstacles by ≥ this
const SAFE_BASE_DIST = 700;       // …and sit ≥ this from any enemy base

const MERGE_DIST = 650;           // collapse candidates whose base areas overlap
const RETURN_N = 8;

function nearest(px, py, pts) {
  let best = Infinity;
  for (const p of pts) {
    const dx = p.x - px, dy = p.y - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}

// Clearance to the nearest RESOURCE (tree/stone/camp) or the map edge —
// i.e. how much open room a base centred here would have.
function resourceClearance(px, py, spots) {
  const edge = Math.min(px, MAP_SIZE - px, py, MAP_SIZE - py);
  return Math.min(edge, nearest(px, py, spots));
}

// Find and rank ideal farm+base spots.
//   spots: [{ x, y, m }]  resource atlas (Tree/Stone/NeutralCamp)
//   bases: [{ x, y }]     enemy stash positions to avoid
function findSpots(spots, bases, opts = {}) {
  const returnN = opts.returnN || RETURN_N;
  spots = (spots || []).filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.y));
  bases = (bases || []).filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y));
  if (spots.length === 0) return [];

  const trees = spots.filter((s) => s.m === "Tree");
  const stones = spots.filter((s) => s.m === "Stone");

  // 1) Tree+stone pairs a single bot can farm (both within one stand).
  const pairs = [];
  for (const t of trees) {
    for (const s of stones) {
      const dx = t.x - s.x, dy = t.y - s.y;
      const gap = Math.sqrt(dx * dx + dy * dy);
      if (gap <= FARM_PAIR_MAX) {
        pairs.push({ t, s, gap, mid: { x: (t.x + s.x) / 2, y: (t.y + s.y) / 2 } });
      }
    }
  }
  if (pairs.length === 0) return [];
  pairs.sort((a, b) => a.gap - b.gap);
  const candidatePairs = pairs.slice(0, TOP_PAIRS);

  // 2) For each pair, hunt the clearest base spot in a ring around it.
  const candidates = [];
  for (const pair of candidatePairs) {
    let best = null;
    for (let r = BASE_SEARCH_MIN; r <= BASE_SEARCH_MAX; r += BASE_SEARCH_STEP) {
      for (let a = 0; a < 360; a += 24) {
        const rad = (a * Math.PI) / 180;
        const bx = pair.mid.x + Math.cos(rad) * r;
        const by = pair.mid.y + Math.sin(rad) * r;
        if (bx < EDGE_MARGIN || bx > MAP_SIZE - EDGE_MARGIN ||
            by < EDGE_MARGIN || by > MAP_SIZE - EDGE_MARGIN) continue;
        const clr = resourceClearance(bx, by, spots);
        if (clr < BASE_CLEAR_MIN) continue;
        const baseDist = bases.length ? nearest(bx, by, bases) : Infinity;
        if (baseDist < SAFE_BASE_DIST) continue;
        // Reward open room + distance from enemy bases; penalise a loose
        // farm pair and a base placed far from its farm (extra walking).
        const safety = Math.min(baseDist, 3000);
        const walk = Math.hypot(bx - pair.mid.x, by - pair.mid.y);
        const score = clr * 1.4 + safety * 0.4 - pair.gap * 0.8 - walk * 0.25;
        if (!best || score > best.score) {
          best = { x: Math.round(bx), y: Math.round(by), clr, baseDist, score };
        }
      }
    }
    if (!best) continue;
    candidates.push({
      farm: {
        tree: { x: Math.round(pair.t.x), y: Math.round(pair.t.y) },
        stone: { x: Math.round(pair.s.x), y: Math.round(pair.s.y) },
        mid: { x: Math.round(pair.mid.x), y: Math.round(pair.mid.y) },
        gap: Math.round(pair.gap),
      },
      base: { x: best.x, y: best.y, clearance: Math.round(best.clr) },
      distToNearestBase: Number.isFinite(best.baseDist) ? Math.round(best.baseDist) : null,
      score: Math.round(best.score),
    });
  }

  // 3) Dedupe overlapping base areas (keep the highest score), then rank.
  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const c of candidates) {
    if (kept.some((k) => Math.hypot(k.base.x - c.base.x, k.base.y - c.base.y) < MERGE_DIST)) continue;
    kept.push(c);
    if (kept.length >= returnN) break;
  }
  return kept;
}

module.exports = { findSpots };
