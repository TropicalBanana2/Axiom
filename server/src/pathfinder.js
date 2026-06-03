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
const PLAYER_RADIUS = 28;

const tileOf = (v) => Math.floor(v / TILE);
const keyOf = (tx, ty) => tx + "," + ty;

// Build the set of blocked tiles within a world-coordinate window.
// `bot` must expose .entities (Map uid->{targetTick}) and .buildings
// (Map uid->{...}) for door-ownership. Returns a Set of "tx,ty".
function buildObstacles(bot, win) {
  const blocked = new Set();
  // Tiles explicitly cleared because a walkable building (owned Door /
  // SlowTrap) sits there. Applied in a SECOND pass so a neighbouring
  // wall's inflation can't seal a door gap shut. Without this, two
  // walls flanking a 48-unit door each bleed INFLATE into the door
  // tile and the bot can never path out of its own base.
  const passable = new Set();

  const mark = (cx, cy, radius) => {
    // Inflate by the bot's body so the path keeps clearance.
    const r = radius + INFLATE_OBSTACLE;
    const minTx = tileOf(cx - r), maxTx = tileOf(cx + r);
    const minTy = tileOf(cy - r), maxTy = tileOf(cy + r);
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        blocked.add(keyOf(tx, ty));
      }
    }
  };

  for (const [uid, e] of bot.entities) {
    const t = e.targetTick;
    if (!t || !t.position || t.dead) continue;
    const m = t.model;
    if (!m) continue;
    const px = t.position.x, py = t.position.y;
    // Skip anything outside the search window (+ a little slack).
    if (px < win.minX - 200 || px > win.maxX + 200 ||
        py < win.minY - 200 || py > win.maxY + 200) continue;

    if (m === "Tree")  { mark(px, py, TREE_RADIUS);  continue; }
    if (m === "Stone") { mark(px, py, STONE_RADIUS); continue; }
    if (m === "GamePlayer") {
      if (uid === bot.uid) continue;                 // never block on self
      mark(px, py, PLAYER_RADIUS);
      continue;
    }
    const def = BUILDINGS[m];
    if (def) {
      // Door walkable only if WE own it (in our party's LocalBuilding set).
      const owned = bot.buildings && bot.buildings.has(uid);
      if (isWalkable(m, owned)) {
        // Record the building's footprint tiles as guaranteed-passable.
        // No inflation — the gap is exactly the door, and the game lets
        // us walk straight through our own doors / slow-traps.
        const hw = def.w / 2, hh = def.h / 2;
        const minTx = tileOf(px - hw + 1), maxTx = tileOf(px + hw - 1);
        const minTy = tileOf(py - hh + 1), maxTy = tileOf(py + hh - 1);
        for (let tx = minTx; tx <= maxTx; tx++)
          for (let ty = minTy; ty <= maxTy; ty++)
            passable.add(keyOf(tx, ty));
        continue;
      }
      // Box obstacle — mark tiles under the footprint (inflated).
      const halfW = def.w / 2, halfH = def.h / 2;
      const r = INFLATE_BUILDING;
      const minTx = tileOf(px - halfW - r), maxTx = tileOf(px + halfW + r);
      const minTy = tileOf(py - halfH - r), maxTy = tileOf(py + halfH + r);
      for (let tx = minTx; tx <= maxTx; tx++)
        for (let ty = minTy; ty <= maxTy; ty++)
          blocked.add(keyOf(tx, ty));
    }
  }
  // Own-base pass — bot.buildings is the authoritative party base from
  // LocalBuilding (always present, unlike entity-update coverage which
  // can lag). Mark its solid buildings + collect its doors/traps as
  // passable. Everything here is owned by definition.
  if (bot.buildings) {
    for (const b of bot.buildings.values()) {
      if (b.dead) continue;
      const def = BUILDINGS[b.type];
      if (!def) continue;
      const px = b.x, py = b.y;
      if (px < win.minX - 200 || px > win.maxX + 200 ||
          py < win.minY - 200 || py > win.maxY + 200) continue;
      if (isWalkable(b.type, true)) {   // owned Door / SlowTrap
        const hw = def.w / 2, hh = def.h / 2;
        const minTx = tileOf(px - hw + 1), maxTx = tileOf(px + hw - 1);
        const minTy = tileOf(py - hh + 1), maxTy = tileOf(py + hh - 1);
        for (let tx = minTx; tx <= maxTx; tx++)
          for (let ty = minTy; ty <= maxTy; ty++)
            passable.add(keyOf(tx, ty));
      } else {
        const hw = def.w / 2, hh = def.h / 2, r = INFLATE_BUILDING;
        const minTx = tileOf(px - hw - r), maxTx = tileOf(px + hw + r);
        const minTy = tileOf(py - hh - r), maxTy = tileOf(py + hh + r);
        for (let tx = minTx; tx <= maxTx; tx++)
          for (let ty = minTy; ty <= maxTy; ty++)
            blocked.add(keyOf(tx, ty));
      }
    }
  }

  // Final pass: carve the passable tiles back open. A door/slowtrap
  // tile is always walkable even if flanking walls inflated into it.
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
