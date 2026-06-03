// protocol.js — Axiom wire protocol.
//
// Every frame on the browser <-> sessions WebSocket is JSON, with a
// consistent envelope so toggles can target a specific bot instead of
// implicitly piggybacking on a DOM input value (Banshee's biggest
// design flaw):
//
//   { sid: number | null, op: string, args?: object }    -- inbound
//   { sid: number | null, op: string, data?: object }    -- outbound
//
// `sid` is the *Axiom* session id (our internal id), not the
// zombs.io sessionUserId. It's null for connection-level frames
// (auth, ping, list) and required for any per-session command.
//
// Binary frames (Uint8Array) are still used for forwarding raw
// zombs.io packets to/from the bot, but they're tagged with a single
// leading byte:
//
//   0x01 + sid (4 bytes) + zombs payload : RPC from browser to bot
//   0x02 + sid (4 bytes) + zombs payload : raw buffer to bot
//   0x03 + sid (4 bytes) + zombs payload : packet from bot to browser
//
// Each direction is fully decodable without any out-of-band state.

const TAG_RPC_OUT = 0x01;
const TAG_BUFFER_OUT = 0x02;
const TAG_PACKET_IN = 0x03;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeJson(frame) {
  return encoder.encode(JSON.stringify(frame));
}

function decodeJson(buf) {
  try {
    return JSON.parse(decoder.decode(buf));
  } catch {
    return null;
  }
}

function wrapBinary(tag, sid, payload) {
  const out = new Uint8Array(5 + payload.length);
  out[0] = tag;
  // little-endian sid
  out[1] = sid & 0xff;
  out[2] = (sid >>> 8) & 0xff;
  out[3] = (sid >>> 16) & 0xff;
  out[4] = (sid >>> 24) & 0xff;
  out.set(payload, 5);
  return out;
}

function unwrapBinary(buf) {
  if (buf.length < 5) return null;
  const tag = buf[0];
  const sid = buf[1] | (buf[2] << 8) | (buf[3] << 16) | (buf[4] << 24);
  const payload = buf.slice(5);
  return { tag, sid, payload };
}

module.exports = {
  TAG_RPC_OUT,
  TAG_BUFFER_OUT,
  TAG_PACKET_IN,
  encodeJson,
  decodeJson,
  wrapBinary,
  unwrapBinary,
};
