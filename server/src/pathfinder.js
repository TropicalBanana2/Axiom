// pathfinder.js — windowed A* over a zombs.io obstacle grid.
//
// Built for the server-side bot's navigation: given the bot's tracked
// world (entities + owned buildings), produce a tile path from the bot
// to a target world point, routing around trees, stones, players and
// enemy buildings, while walking THROUGH the bot's own doors and any
// SlowTrap (per game rules).
//
// Grid: 24-unit tiles (HALF the building grid) for precision. The search
// is bounded to a window around [start, goal] so even on a 24000² map the
// A* stays fast (paths are typically short — out of a base, to a spot).
//
// Inflation note: obstacles are padded by INFLATE, NOT the full bot
// radius. zombs.io collision is forgiving (you slip through 48-wide
// gaps and slide along walls), so a small pad keeps the bot off corners
// without sealing the 1-grid (48-unit = 2-tile) corridors that thread
// through a base. Over-inflating was why the bot couldn't escape from
// deep inside — the floor tiles between its own buildings got sealed.

const { BUILDINGS, isWalkable } = require("./buildingData");

const TILE = 24;                 // half the 48-unit building grid → 2× precision
const MAP_SIZE = 24000;
// Building inflation MUST be 0. Buildings sit on the 48-unit grid, which
// aligns to our 24-unit tiles, so a wall occupies exactly whole tiles.
// ANY pad pushes into the neighbouring tile and seals the APPROACH tiles
// on either side of a door — which is exactly why the bot couldn't leave
// from deep inside. With 0 pad a 48-wide door stays 2 open tiles with
// open approaches. The clearance PENALTY (below) still biases paths off
// walls without hard-blocking them.
const INFLATE_BUILDING = 0;
// Trees / stones / players are circular obstacles in open ground (no
// tight-corridor concern) so they keep a body-clearance pad.
const INFLATE_OBSTACLE = 16;
const WINDOW_MARGIN = 1600;      // world units of padding around [start,goal]
const CLEARANCE_PENALTY = 3;     // extra cost for tiles adjacent to obstacles

const TREE_RADIUS = 64;
const STONE_RADIUS = 48;
// A player occupies ~1 tile (24u). Keep this small so a player blocks
// roughly its own 1×1 cell — over-inflating it (was 28 → ~3 tiles with the
// obstacle pad) walled off tight base corridors and jammed bots that can't
// pass through one another.
const PLAYER_RADIUS = 6;

const tileOf = (v) => Math.floor(v / TILE);
const keyOf = (tx, ty) => tx + "," + ty;

// True if a world point is inside the search window (+ a little slack so
// an obstacle just outside still blocks the tiles at the edge).
function inWindow(win, px, py, slack = 200) {
  return px >= win.minX - slack && px <= win.maxX + slack &&
         py >= win.minY - slack && py <= win.maxY + slack;
}

// Add every tile covered by a circle of `radius` (plus body clearance) to
// `set`. Used for trees / stones / players — round obstacles in the open.
function markCircle(set, cx, cy, radius) {
  const r = radius + INFLATE_OBSTACLE;
  const minTx = tileOf(cx - r), maxTx = tileOf(cx + r);
  const minTy = tileOf(cy - r), maxTy = tileOf(cy + r);
  for (let tx = minTx; tx <= maxTx; tx++)
    for (let ty = minTy; ty <= maxTy; ty++)
      set.add(keyOf(tx, ty));
}

// Add the tiles under a building footprint to `set`. `pad` > 0 inflates
// (solid obstacle); `pad` < 0 insets (a passable door/trap, kept strictly
// inside its own footprint so it can't claim a neighbour's tile).
function markFootprint(set, def, px, py, pad) {
  const hw = def.w / 2, hh = def.h / 2;
  const minTx = tileOf(px - hw - pad), maxTx = tileOf(px + hw + pad);
  const minTy = tileOf(py - hh - pad), maxTy = tileOf(py + hh + pad);
  for (let tx = minTx; tx <= maxTx; tx++)
    for (let ty = minTy; ty <= maxTy; ty++)
      set.add(keyOf(tx, ty));
}

// Route one building into either the blocked set (solid) or the passable
// set (an owned door / slow-trap the game lets us walk through).
function markBuilding(blocked, passable, type, px, py, owned) {
  const def = BUILDINGS[type];
  if (!def) return;
  if (isWalkable(type, owned)) markFootprint(passable, def, px, py, -1);
  else markFootprint(blocked, def, px, py, INFLATE_BUILDING);
}

// Build the set of blocked tiles within a world-coordinate window.
// `bot` must expose .entities (Map uid->{targetTick}) and .buildings
// (Map uid->{...}) for door-ownership. Returns a Set of "tx,ty".
function buildObstacles(bot, win) {
  const blocked = new Set();
  // Tiles explicitly cleared because a walkable building (owned Door /
  // SlowTrap) sits there. Carved back open in a SECOND pass so a
  // neighbouring wall's inflation can't seal a door gap shut — otherwise
  // two walls flanking a 48-unit door each bleed into the door tile and
  // the bot can never path out of its own base.
  const passable = new Set();

  // Pass 1 — live entities: trees, stones, other players, enemy/seen
  // buildings (door ownership decided per-uid against our base set).
  for (const [uid, e] of bot.entities) {
    const t = e.targetTick;
    if (!t || !t.position || t.dead || !t.model) continue;
    const px = t.position.x, py = t.position.y;
    if (!inWindow(win, px, py)) continue;
    switch (t.model) {
      case "Tree":  markCircle(blocked, px, py, TREE_RADIUS);  break;
      case "Stone": markCircle(blocked, px, py, STONE_RADIUS); break;
      case "GamePlayer":
        if (uid !== bot.uid) markCircle(blocked, px, py, PLAYER_RADIUS);
        break;
      default:
        markBuilding(blocked, passable, t.model, px, py,
          !!(bot.buildings && bot.buildings.has(uid)));
    }
  }

  // Pass 1b — world-spot atlas: trees/stones/camps the FLEET has seen but
  // this bot currently can't (outside its AOI). Resource spots are static
  // per server, so they're safe to trust — without this, a long cross-map
  // path happily routes straight through an unseen forest and the bot
  // spends the whole trip in stuck-recovery. Live entities (pass 1) win:
  // any uid this bot can see right now is skipped here.
  if (bot._worldSpots) {
    for (const uid in bot._worldSpots) {
      if (bot.entities && bot.entities.has(+uid)) continue;
      const s = bot._worldSpots[uid];
      if (!inWindow(win, s.x, s.y)) continue;
      if (s.m === "Tree")       markCircle(blocked, s.x, s.y, TREE_RADIUS);
      else if (s.m === "Stone") markCircle(blocked, s.x, s.y, STONE_RADIUS);
      else                      markCircle(blocked, s.x, s.y, 70);   // NeutralCamp
    }
  }

  // Pass 2 — own base: bot.buildings is the authoritative party base from
  // LocalBuilding (always present, unlike entity coverage which can lag).
  // Everything here is owned by definition.
  if (bot.buildings) {
    for (const b of bot.buildings.values()) {
      if (b.dead || !inWindow(win, b.x, b.y)) continue;
      markBuilding(blocked, passable, b.type, b.x, b.y, true);
    }
  }

  // Final pass: a door/slow-trap tile is always walkable even if a
  // flanking wall inflated into it.
  for (const k of passable) blocked.delete(k);
  return blocked;
}

// Nearest non-blocked tile to (tx,ty) within a small spiral. Used when
// the bot's own tile is blocked (standing inside a footprint) or the
// goal tile lands on an obstacle.
function nearestFree(blocked, tx, ty, maxR = 26) {
  if (!blocked.has(keyOf(tx, ty))) return { tx, ty };
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const k = keyOf(tx + dx, ty + dy);
        if (!blocked.has(k)) return { tx: tx + dx, ty: ty + dy };
      }
    }
  }
  return null;
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Tiny binary min-heap keyed on `.f`. The 24-unit grid explores far more
// tiles than the old 48-unit one, so the previous linear-scan open set
// (O(n) extract-min → O(n²) overall) could spike a tick on long paths.
// A heap keeps extract-min at O(log n).
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a; a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// A* over the windowed grid. Returns an array of world waypoints
// [{x,y}, ...] from start→goal (excluding the start tile), or null if
// no path exists. `start` and `goal` are world coordinates.
function findPath(bot, start, goal) {
  // Window bounding box around start+goal.
  const win = {
    minX: Math.max(0, Math.min(start.x, goal.x) - WINDOW_MARGIN),
    minY: Math.max(0, Math.min(start.y, goal.y) - WINDOW_MARGIN),
    maxX: Math.min(MAP_SIZE, Math.max(start.x, goal.x) + WINDOW_MARGIN),
    maxY: Math.min(MAP_SIZE, Math.max(start.y, goal.y) + WINDOW_MARGIN),
  };
  const minTx = tileOf(win.minX), maxTx = tileOf(win.maxX);
  const minTy = tileOf(win.minY), maxTy = tileOf(win.maxY);
  const inWindow = (tx, ty) => tx >= minTx && tx <= maxTx && ty >= minTy && ty <= maxTy;

  const blocked = buildObstacles(bot, win);

  let s = nearestFree(blocked, tileOf(start.x), tileOf(start.y));
  let g = nearestFree(blocked, tileOf(goal.x), tileOf(goal.y));
  if (!s || !g) return null;

  const startKey = keyOf(s.tx, s.ty);
  const goalKey = keyOf(g.tx, g.ty);
  if (startKey === goalKey) return [{ x: goal.x, y: goal.y }];

  // octile heuristic — admissible for 8-dir movement.
  const h = (tx, ty) => {
    const dx = Math.abs(tx - g.tx), dy = Math.abs(ty - g.ty);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  const gScore = new Map([[startKey, 0]]);
  const came = new Map();
  const open = new MinHeap();
  open.push({ tx: s.tx, ty: s.ty, f: h(s.tx, s.ty) });
  const closed = new Set();

  let iterations = 0;
  const MAX_ITER = 200000;    // hard cap so a pathological case can't hang

  while (open.size) {
    if (++iterations > MAX_ITER) return null;
    const cur = open.pop();
    const ck = keyOf(cur.tx, cur.ty);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (ck === goalKey) {
      // Reconstruct → tile path → world waypoints.
      const tiles = [];
      let k = ck;
      while (k) { tiles.push(k); k = came.get(k); }
      tiles.reverse();
      const pts = tiles.map((key) => {
        const [tx, ty] = key.split(",").map(Number);
        return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      });
      pts.shift();                       // drop the start tile
      pts.push({ x: goal.x, y: goal.y }); // exact goal as final waypoint
      return simplify(pts, blocked);
    }

    const curG = gScore.get(ck);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cur.tx + dx, ny = cur.ty + dy;
      if (!inWindow(nx, ny)) continue;
      const nk = keyOf(nx, ny);
      if (closed.has(nk) || blocked.has(nk)) continue;
      // Disallow diagonal squeeze between two blocked orthogonals.
      if (dx !== 0 && dy !== 0) {
        if (blocked.has(keyOf(cur.tx + dx, cur.ty)) &&
            blocked.has(keyOf(cur.tx, cur.ty + dy))) continue;
      }
      const step = (dx !== 0 && dy !== 0) ? Math.SQRT2 : 1;
      // clearance penalty: nudge path away from obstacle-adjacent tiles
      let pen = 0;
      for (const [ax, ay] of NEIGHBORS) {
        if (blocked.has(keyOf(nx + ax, ny + ay))) { pen = CLEARANCE_PENALTY; break; }
      }
      const tentative = curG + step + pen;
      if (tentative < (gScore.has(nk) ? gScore.get(nk) : Infinity)) {
        came.set(nk, ck);
        gScore.set(nk, tentative);
        const f = tentative + h(nx, ny);
        open.push({ tx: nx, ty: ny, f });
      }
    }
  }
  return null;   // no path
}

// Line-of-sight path simplification: drop waypoints that can be reached
// in a straight line from the previous kept point (fewer, smoother
// turns). Uses a tile-walk LoS test against the blocked set.
function simplify(pts, blocked) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!lineClear(pts[anchor], pts[i], blocked)) {
      out.push(pts[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Bresenham-ish tile LoS test between two world points.
function lineClear(a, b, blocked) {
  let x0 = tileOf(a.x), y0 = tileOf(a.y);
  const x1 = tileOf(b.x), y1 = tileOf(b.y);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    if (blocked.has(keyOf(x0, y0))) return false;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
  return true;
}

module.exports = { findPath, TILE };
