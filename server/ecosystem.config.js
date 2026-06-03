// Axiom — pm2 process map.
// Three processes mirror Banshee's layout but with cleaned-up names:
//   - axiom-localhost: Express on :80, serves the modded zombs.io page.
//   - axiom-sessions:  WS on :8090, bot orchestrator + per-session protocol.
//   - axiom-sockets:   WS on :8100, MBF / WASM solver pool for alts.
//
// Each process gets its own log file under ~/.pm2/logs and is restarted
// independently. `axiom-sessions` and `axiom-sockets` need a Node ≥ 22 (or
// Node 18 with --experimental-wasm-gc) to run the smallWasm.wasm module.

module.exports = {
  apps: [
    {
      name: "axiom-localhost",
      script: "src/localhost.js",
      cwd: __dirname,
      max_memory_restart: "256M",
    },
    {
      name: "axiom-sessions",
      script: "src/sessions.js",
      cwd: __dirname,
      max_memory_restart: "512M",
      // Node 22+ ships WASM-GC + typed-funcref as stable, so no flags
      // are needed. If you're stuck on Node 18, upgrade — these flag
      // names don't exist there either (they landed in Node 19).
    },
    {
      name: "axiom-sockets",
      script: "src/sockets.js",
      cwd: __dirname,
      max_memory_restart: "256M",
    },
  ],
};
