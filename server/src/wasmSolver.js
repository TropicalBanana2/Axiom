// wasmSolver.js — MBF (MakeBlendField) anti-bot WASM bridge.
//
// zombs.io ships a WebAssembly module (smallWasm.wasm) that solves a
// Proof-of-Work challenge gating world entry. The browser is expected
// to run this and produce two byte arrays: one for opcode 4 (enter
// world) and one for opcode 10 (continued validation).
//
// For VPS bots, we run the same WASM in Node and fake the environment
// checks it makes (`typeof window`, `Game.currentGame.network.*`,
// etc.) so it produces valid output as if it were running in a
// browser.
//
// Each call to `createWasmSolver()` returns an isolated Module. They
// share the binary buffer but each has its own asm/memory.

const fs = require("fs");
const path = require("path");

const wasmPath = path.join(__dirname, "..", "public", "asset", "smallWasm.wasm");
let wasmbuffers = null;

function loadBuffers() {
  if (wasmbuffers) return wasmbuffers;
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `Missing ${wasmPath}\n` +
      `Copy it from a Banshee install:\n` +
      `  cp /path/to/banshee/banshee/public/asset/smallWasm.wasm ${wasmPath}`
    );
  }
  wasmbuffers = fs.readFileSync(wasmPath);
  return wasmbuffers;
}

function createWasmSolver() {
  const buffers = loadBuffers();
  let exportG;
  let HEAPU8;
  let asmL;
  const exports = {};
  const decoder = new TextDecoder("utf8");
  let uid = 0;

  function setHeaps() {
    HEAPU8 = new Uint8Array(exportG.buffer);
    exports.HEAPU8 = HEAPU8;
  }

  // Read a C string from the heap.
  function intCalc(heap, int) {
    let n = int;
    while (heap[n] && !(n >= NaN)) ++n;
    if (n - int > 16 && heap.buffer && decoder) {
      return decoder.decode(heap.subarray(int, n));
    }
    let out = "";
    while (int < n) {
      const e = heap[int++];
      if (0x80 & e) {
        const j = 0x3f & heap[int++];
        if (0xc0 !== (0xe0 & e)) {
          const k = 0x3f & heap[int++];
          let code = (0xe0 === (0xf0 & e))
            ? ((0xf & e) << 12) | (j << 6) | k
            : ((0x7 & e) << 18) | (j << 12) | (k << 6) | (0x3f & heap[int++]);
          if (code < 0x10000) out += String.fromCharCode(code);
          else {
            const d = code - 0x10000;
            out += String.fromCharCode(0xd800 | (d >> 10), 0xdc00 | (0x3ff & d));
          }
        } else out += String.fromCharCode(((0x1f & e) << 6) | j);
      } else out += String.fromCharCode(e);
    }
    return out;
  }

  const intToStr = (int) => intCalc(HEAPU8, int);

  // Faked environment checks: WASM probes for these JS expressions
  // and we return values consistent with a browser-side client.
  function cstr(str) {
    if (str.startsWith('typeof window === "undefined" ? 1 : 0')) return 0;
    if (str.startsWith("typeof process !== 'undefined' ? 1 : 0")) return 0;
    if (str.startsWith("Game.currentGame.network.connected ? 1 : 0")) return 1;
    if (str.startsWith("Game.currentGame.network.connectionOptions.ipAddress")) return Module.hostname;
    if (str.startsWith("Game.currentGame.world.myUid === null ? 0 : Game.currentGame.world.myUid")) {
      return uid++ ? 0 : 1;
    }
    if (str.startsWith('document.getElementById("hud").children.length')) return 24;
  }

  const repeater = (int) => 0 | cstr(intToStr(int));

  function writeBuffer(ipAddress, buffer, bufferSize, undf) {
    if (!(undf > 0)) return 0;
    const byteSize = bufferSize;
    const limit = bufferSize + undf - 1;
    for (let i = 0; i < ipAddress.length; ++i) {
      let charCode = ipAddress.charCodeAt(i);
      if (charCode >= 0xd800 && charCode <= 0xdfff) {
        const lo = ipAddress.charCodeAt(++i);
        charCode = 0x10000 + ((0x3ff & charCode) << 10) | (0x3ff & lo);
      }
      if (charCode <= 0x7f) {
        if (bufferSize >= limit) break;
        buffer[bufferSize++] = charCode;
      } else if (charCode <= 0x7ff) {
        if (bufferSize + 1 >= limit) break;
        buffer[bufferSize++] = 0xc0 | (charCode >> 6);
        buffer[bufferSize++] = 0x80 | (0x3f & charCode);
      } else if (charCode <= 0xffff) {
        if (bufferSize + 2 >= limit) break;
        buffer[bufferSize++] = 0xe0 | (charCode >> 12);
        buffer[bufferSize++] = 0x80 | ((charCode >> 6) & 0x3f);
        buffer[bufferSize++] = 0x80 | (0x3f & charCode);
      } else {
        if (bufferSize + 3 >= limit) break;
        buffer[bufferSize++] = 0xf0 | (charCode >> 18);
        buffer[bufferSize++] = 0x80 | ((charCode >> 12) & 0x3f);
        buffer[bufferSize++] = 0x80 | ((charCode >> 6) & 0x3f);
        buffer[bufferSize++] = 0x80 | (0x3f & charCode);
      }
    }
    buffer[bufferSize] = 0;
    return bufferSize - byteSize;
  }

  function importB(int) {
    let str = cstr(intToStr(int));
    if (str == null) return 0;
    str += "";
    importB.bufferSize = str.length + 1;
    importB.buffer = asmL(importB.bufferSize);
    writeBuffer(str, HEAPU8, importB.buffer, importB.bufferSize);
    return importB.buffer;
  }

  const methods = {
    a: () => {}, b: importB, c: repeater, d: () => {}, e: () => {}, f: () => {},
  };

  asmL = (...args) => (asmL = exports.asm.l)(...args);

  WebAssembly.instantiate(buffers, { a: methods }).then((asm) => {
    exports.asm = asm.instance.exports;
    exportG = exports.asm.g;
    exports.asm.h();
    exports.asm.i();
    setHeaps();
    Module.ready = true;
    if (Module.opcode5Callback) {
      Module.onDecodeOpcode5(Module.blended, Module.hostname, Module.opcode5Callback);
    }
  });

  const Module = exports;

  Module.decodeBlendInternal = (blended) => {
    Module.asm.j(24, 132);
    const pos = Module.asm.j(228, 132);
    const extra = new Uint8Array(blended);
    for (let i = 0; i < 132; i++) Module.HEAPU8[pos + i] = extra[i + 1];
    Module.asm.j(172, 36);
    const index = Module.asm.j(4, 152);
    const arr = new ArrayBuffer(64);
    const list = new Uint8Array(arr);
    for (let i = 0; i < 64; i++) list[i] = Module.HEAPU8[index + i];
    return arr;
  };

  Module.onDecodeOpcode5 = (blended, hostname, callback) => {
    Module.blended = blended;
    Module.hostname = hostname;
    if (!Module.ready) return (Module.opcode5Callback = callback);
    Module.asm.j(255, 140);
    const decoded = Module.decodeBlendInternal(blended);
    const mcs = Module.asm.j(187, 22);
    const opcode6Data = [6];
    for (let i = 0; i < 16; i++) opcode6Data.push(Module.HEAPU8[mcs + i]);
    callback({ 5: decoded, 6: new Uint8Array(opcode6Data) });
  };

  Module.finalizeOpcode10 = (blended) => {
    const decoded = Module.decodeBlendInternal(blended);
    const list = new Uint8Array(decoded);
    const out = [10];
    for (let i = 0; i < decoded.byteLength; i++) out.push(list[i]);
    return new Uint8Array(out);
  };

  return Module;
}

module.exports = { createWasmSolver };
