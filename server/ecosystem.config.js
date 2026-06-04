// Axiom — pm2 process map.
// Three processes mirror Banshee's layout but with cleaned-up names:
//   - axiom-localhost: Express on :80, serves the modded zombs.io page.
//   - axiom-sessions:  WS on :8090, bot orchestrator + per-session protocol.
//   - axiom-sockets:   WS on :8100, MBF / WASM solver pool for alts.
//
// Each process gets its own log file under ~/.pm2/logs and is restarted
// independently. `axiom-sessions` and `axiom-sockets` need a Node ≥ 22 (or
// Node 18 with --experimental-wasm-gc) to run the smallWasm.wasm module.
//
// Restart policy: a small restart_delay covers the brief window where a
// just-killed process hasn't released its port yet (Windows TIME_WAIT),
// and min_uptime + max_restarts stop a genuine port conflict (EADDRINUSE)
// from crash-looping and spamming the logs — pm2 marks it "errored"
// instead. The servers themselves log one clear line and exit cleanly on
// EADDRINUSE rather than throwing a stack trace.

// Shared restart policy for all three processes.
const restartPolicy = {
  cwd: __dirname,
  restart_delay: 2000,   // wait 2s before relaunching after an exit
  min_uptime: "10s",     // a run shorter than this counts as a failed boot
  max_restarts: 6,       // after 6 failed boots in a row, give up (errored)
};

module.exports = {
  apps: [
    {
      ...restartPolicy,
      name: "axiom-localhost",
      script: "src/localhost.js",
      max_memory_restart: "256M",
    },
    {
      ...restartPolicy,
      name: "axiom-sessions",
      script: "src/sessions.js",
      max_memory_restart: "512M",
      // Node 22+ ships WASM-GC + typed-funcref as stable, so no flags
      // are needed. If you're stuck on Node 18, upgrade — these flag
      // names don't exist there either (they landed in Node 19).
    },
    {
      ...restartPolicy,
      name: "axiom-sockets",
      script: "src/sockets.js",
      max_memory_restart: "256M",
    },
  ],
};
