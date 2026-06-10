// import-banshee-spots.js — one-shot importer for Banshee "serverspots"
// datasets into axiom's world-resource atlas (schema_kv "spots:<id>").
//
// Usage:  node tools/import-banshee-spots.js <path-to-serverspots.js>
//
// The Banshee file assigns `window.serverspots = { v1001: { spotEncoded,
// spotinfo }, ... }` where spotEncoded is a JSON array indexed by uid-1
// and each entry packs a position as  y*100*50000 + x  (both coords have
// at most 2 decimals; map is 24000²). Fixed uid ranges identify the
// model: 1–400 Tree · 401–800 Stone · 801–825 NeutralCamp.
//
// Merge policy: NON-destructive. Anything the fleet has already observed
// live (existing atlas entries) wins; the import only fills gaps. Run
// with the axiom server stopped — or restart right after — so a running
// process doesn't flush a stale in-memory atlas over the import.

const fs = require("fs");
const { schemaGet, schemaSet } = require("../src/db");

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/import-banshee-spots.js <serverspots.js>");
  process.exit(1);
}

const src = fs.readFileSync(file, "utf8");
// The dataset file is plain JS that writes onto `window` — run it against
// a stub instead of parsing the 250KB literal by hand.
const windowStub = {};
new Function("window", src)(windowStub);
const dataset = windowStub.serverspots || windowStub.serverSpots;
if (!dataset || typeof dataset !== "object") {
  console.error("no `window.serverspots` object found in", file);
  process.exit(1);
}

const modelOf = (uid) => (uid <= 400 ? "Tree" : uid <= 800 ? "Stone" : "NeutralCamp");

let servers = 0, imported = 0, kept = 0, skipped = 0;
for (const [serverId, entry] of Object.entries(dataset)) {
  if (!/^v\d{1,6}$/.test(serverId) || !entry || !entry.spotEncoded) { skipped++; continue; }
  let arr;
  try { arr = JSON.parse(entry.spotEncoded); } catch { skipped++; continue; }
  const key = "spots:" + serverId;
  const atlas = schemaGet(key) || {};
  let added = 0, existing = 0;
  for (let i = 0; i < Math.min(arr.length, 825); i++) {
    const packed = arr[i];
    if (!packed) continue;
    const uid = i + 1;
    if (atlas[uid]) { existing++; continue; }        // fleet-observed wins
    // Banshee's exact decode (serverspots.js getRealPosOfIndex).
    const x = ((((packed * 100).toFixed(2) - "") % 5000000) | 0) / 100;
    const y = ((packed / 50000) | 0) / 100;
    if (!(x >= 0 && x <= 24000 && y >= 0 && y <= 24000)) continue;
    atlas[uid] = { x: Math.round(x), y: Math.round(y), m: modelOf(uid) };
    added++;
  }
  schemaSet(key, atlas);
  servers++; imported += added; kept += existing;
  console.log(serverId + ": +" + added + " imported, " + existing + " already known, atlas now " +
    Object.keys(atlas).length + (entry.spotinfo ? "  (" + entry.spotinfo + ")" : ""));
}
console.log("done: " + servers + " servers, " + imported + " spots imported, " + kept +
  " pre-existing kept" + (skipped ? ", " + skipped + " entries skipped" : ""));
