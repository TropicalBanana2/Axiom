// sockets.js — MBF (WASM) solver pool for browser alts.
//
// Same role as Banshee's zombsSockets.js: alt browser tabs offload
// the expensive WebAssembly Proof-of-Work computation to this server
// so the user's machine isn't running N copies of the MBF module.
//
// Protocol (text frames):
//   in:  "auth <token>"
//   in:  "createModule <moduleId>"
//   in:  "decodeOpcode5 <moduleId> <bytes,comma,separated> <hostname>"
//   in:  "decodeOpcode10 <moduleId> <bytes,comma,separated>"
//   in:  "destroy <moduleId>"
//   out: "ready"
//   out: "opcode4 <moduleId> <bytes> <opcode6Bytes>"
//   out: "opcode10 <moduleId> <bytes>"

const WebSocket = require("ws");
const { runInNewContext } = require("node:vm");
const { setFlagsFromString } = require("node:v8");
const { createWasmSolver } = require("./wasmSolver");
const { verifyToken } = require("./auth");

setFlagsFromString("--expose_gc");
const gc = runInNewContext("gc");

const PORT = parseInt(process.env.AXIOM_SOCKETS_PORT || "8100", 10);
// Bind with retry: across a pm2 restart the previous instance can hold
// the port for a few seconds while its sockets drain — retrying here is
// invisible to clients, while the old "exit and let pm2 cycle" approach
// spammed the error log with an EADDRINUSE stack each time.
let wss;
let bindTries = 0;
function bindServer() {
  wss = new WebSocket.Server({ port: PORT, maxPayload: 65536 });
  wss.on("listening", () => console.log(`[axiom-sockets] listening on :${PORT}`));
  wss.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      if (++bindTries <= 15) {
        console.error(`[axiom-sockets] port ${PORT} busy (previous instance still closing) — retry ${bindTries}/15 in 2s`);
        setTimeout(bindServer, 2000);
        return;
      }
      console.error(
        `[axiom-sockets] port ${PORT} still in use after ${bindTries - 1} retries — another ` +
        `instance really is running. Run "pm2 delete axiom-sockets" and start once.`);
      process.exit(0);
    }
    console.error(`[axiom-sockets] server error:`, err);
    process.exit(1);
  });
  wss.on("connection", handleConnection);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const enc = (s) => encoder.encode(s);
const dec = (b) => decoder.decode(b);

const handleConnection = (ws) => {
  ws.modules = new Map();
  ws.authed = false;
  ws.userId = null;

  const dropTimer = setTimeout(() => { if (!ws.authed) ws.close(); }, 10000);

  const send = (s) => { if (ws.readyState === 1) ws.send(enc(s)); };

  ws.on("message", (m) => {
    let str;
    try { str = dec(m); } catch { return; }
    if (!str) return;
    const parts = str.split(" ");
    const cmd = parts[0];

    if (!ws.authed) {
      if (cmd !== "auth") return;
      const decoded = verifyToken(parts[1]);
      if (!decoded) { send("error bad-token"); ws.close(); return; }
      ws.authed = true;
      ws.userId = decoded.uid;
      clearTimeout(dropTimer);
      send("ready");
      return;
    }

    switch (cmd) {
      case "createModule": {
        const id = parts[1];
        if (!id || ws.modules.size >= 32) return;
        ws.modules.set(id, createWasmSolver());
        break;
      }
      case "decodeOpcode5": {
        const id = parts[1];
        const m = ws.modules.get(id);
        if (!m) return;
        const bytes = new Uint8Array(parts[2].split(",").map(Number));
        const hostname = parts[3];
        m.onDecodeOpcode5(bytes, hostname, (decoded) => {
          send(`opcode4 ${id} ${new Uint8Array(decoded[5])} ${decoded[6]}`);
        });
        break;
      }
      case "decodeOpcode10": {
        const id = parts[1];
        const m = ws.modules.get(id);
        if (!m) return;
        const bytes = new Uint8Array(parts[2].split(",").map(Number));
        send(`opcode10 ${id} ${m.finalizeOpcode10(bytes)}`);
        break;
      }
      case "destroy": {
        ws.modules.delete(parts[1]);
        gc();
        break;
      }
    }
  });

  ws.on("close", () => {
    ws.modules.clear();
    gc();
  });
};
bindServer();
