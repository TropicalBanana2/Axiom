// import-banshee-spots.js — import a LOCAL Banshee "serverspots" dataset
// into axiom's world-resource atlas (schema_kv "spots:<id>").
//
// Usage:  node tools/import-banshee-spots.js <path-to-serverspots.js>
//
// Note: the server already syncs the same dataset automatically from the
// ZombsBuildingSandbox GitHub repo at boot and daily (worldSpots
// UPSTREAM_URL) — this tool is for offline use or one-off files.
//
// Merge policy (shared with the upstream sync): NON-destructive —
// anything the fleet has observed live wins; the import only fills gaps.
// Idempotent. Run with the axiom server stopped, or restart right after,
// so a running process doesn't flush a stale in-memory atlas over it.

const fs = require("fs");
const { decodeBansheeDataset, mergeDataset } = require("../src/worldSpots");

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/import-banshee-spots.js <serverspots.js>");
  process.exit(1);
}

const decoded = decodeBansheeDataset(fs.readFileSync(file, "utf8"));
const serverIds = Object.keys(decoded);
if (serverIds.length === 0) {
  console.error("no `window.serverspots` data found in", file);
  process.exit(1);
}
for (const id of serverIds) {
  console.log(`${id}: ${Object.keys(decoded[id]).length} spots in file`);
}
const res = mergeDataset(decoded);
console.log(`done: +${res.added} new spots merged across ${res.servers} servers (fleet-observed entries kept)`);
