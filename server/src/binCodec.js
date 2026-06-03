// binCodec.js — zombs.io binary protocol codec.
//
// Lifted verbatim from Banshee (which lifted it from zombs.io's client
// bundle). Modularized so it can be required from bot.js. The codec
// holds per-server state (attribute maps, RPC tables) once the bot
// completes PACKET_ENTER_WORLD, so each Bot gets its own instance.

const ByteBuffer = require("bytebuffer");

const packetIds = {
  PACKET_ENTITY_UPDATE: 0,
  PACKET_PLAYER_COUNTER_UPDATE: 1,
  PACKET_SET_WORLD_DIMENSIONS: 2,
  PACKET_INPUT: 3,
  PACKET_ENTER_WORLD: 4,
  PACKET_PRE_ENTER_WORLD: 5,
  PACKET_ENTER_WORLD2: 6,
  PACKET_PING: 7,
  PACKET_RPC: 9,
};

const attributeTypes = {
  Uint32: 1, Int32: 2, Float: 3, String: 4, Vector2: 5, EntityType: 6,
  ArrayVector2: 7, ArrayUint32: 8, Uint16: 9, Uint8: 10, Int16: 11,
  Int8: 12, Uint64: 13, Int64: 14, Double: 15,
};

const parameterTypes = {
  Uint32: 0, Int32: 1, Float: 2, String: 3, Uint64: 4, Int64: 5,
};

class BinCodec {
  constructor() {
    this.attributeMaps = {};
    this.entityTypeNames = {};
    this.rpcMaps = [];
    this.rpcMapsByName = {};
    this.sortedUidsByType = {};
    this.removedEntities = {};
    this.removedEntitiesSet = new Set();
    this.changedEntityTypes = {};
    this.entityUpdates = [];
    this.removedEntityList = [];
    this.entityUpdateData = {
      tick: 0,
      entities: this.entityUpdates,
      removedEntities: this.removedEntityList,
      byteSize: 0,
    };
    this.absentEntitiesFlags = new Uint8Array(64);
    this.absentEntitiesFlagsUsed = 0;
    this.updatedEntityFlags = new Uint8Array(64);
    this.updatedEntityFlagsUsed = 0;
    this.entityTypeKeyList = null;
  }

  encode(name, item) {
    const buffer = new ByteBuffer(100, true);
    switch (name) {
      case packetIds.PACKET_ENTER_WORLD:
        buffer.writeUint8(packetIds.PACKET_ENTER_WORLD);
        this.encodeEnterWorld(buffer, item);
        break;
      case packetIds.PACKET_INPUT:
        buffer.writeUint8(packetIds.PACKET_INPUT);
        this.encodeInput(buffer, item);
        break;
      case packetIds.PACKET_PING:
        buffer.writeUint8(packetIds.PACKET_PING);
        this.encodePing(buffer, item);
        break;
      case packetIds.PACKET_RPC:
        buffer.writeUint8(packetIds.PACKET_RPC);
        this.encodeRpc(buffer, item);
        break;
    }
    buffer.flip();
    buffer.compact();
    return buffer.toArrayBuffer(false);
  }

  decode(data) {
    const buffer = ByteBuffer.wrap(data);
    buffer.littleEndian = true;
    const opcode = buffer.readUint8();
    let decoded = {};
    switch (opcode) {
      case packetIds.PACKET_ENTER_WORLD:
        decoded = this.decodeEnterWorldResponse(buffer); break;
      case packetIds.PACKET_ENTITY_UPDATE:
        decoded = this.decodeEntityUpdate(buffer); break;
      case packetIds.PACKET_PING:
        decoded = this.decodePing(buffer); break;
      case packetIds.PACKET_RPC:
        decoded = this.decodeRpc(buffer); break;
    }
    if (opcode) decoded.opcode = opcode;
    return decoded;
  }

  safeReadVString(buffer) {
    let offset = buffer.offset;
    const len = buffer.readVarint32(offset);
    try {
      const fn = buffer.readUTF8String.bind(buffer);
      const str = fn(len.value, "b", (offset += len.length));
      offset += str.length;
      buffer.offset = offset;
      return str.string;
    } catch {
      offset += len.value;
      buffer.offset = offset;
      return "?";
    }
  }

  decodeEnterWorldResponse(buffer) {
    const allowed = buffer.readUint32();
    const uid = buffer.readUint32();
    const startingTick = buffer.readUint32();
    const ret = {
      allowed, uid, startingTick,
      tickRate: buffer.readUint32(),
      effectiveTickRate: buffer.readUint32(),
      players: buffer.readUint32(),
      maxPlayers: buffer.readUint32(),
      chatChannel: buffer.readUint32(),
      effectiveDisplayName: this.safeReadVString(buffer),
      x1: buffer.readInt32(), y1: buffer.readInt32(),
      x2: buffer.readInt32(), y2: buffer.readInt32(),
    };
    const attributeMapCount = buffer.readUint32();
    this.attributeMaps = {};
    this.entityTypeNames = {};
    this.sortedUidsByType = {};
    for (let i = 0; i < attributeMapCount; i++) {
      const attributeMap = [];
      const entityType = buffer.readUint32();
      const entityTypeString = buffer.readVString();
      const attributeCount = buffer.readUint32();
      for (let j = 0; j < attributeCount; j++) {
        const name = buffer.readVString();
        const type = buffer.readUint32();
        attributeMap.push({ name, type });
      }
      this.attributeMaps[entityType] = attributeMap;
      this.entityTypeNames[entityType] = entityTypeString;
      this.sortedUidsByType[entityType] = [];
    }
    const rpcCount = buffer.readUint32();
    this.rpcMaps = [];
    this.rpcMapsByName = {};
    for (let i = 0; i < rpcCount; i++) {
      const rpcName = buffer.readVString();
      const paramCount = buffer.readUint8();
      const isArray = buffer.readUint8() !== 0;
      const parameters = [];
      for (let j = 0; j < paramCount; j++) {
        const paramName = buffer.readVString();
        const paramType = buffer.readUint8();
        parameters.push({ name: paramName, type: paramType });
      }
      const rpc = { name: rpcName, parameters, isArray, index: this.rpcMaps.length };
      this.rpcMaps.push(rpc);
      this.rpcMapsByName[rpcName] = rpc;
    }
    this.entityTypeKeyList = Object.keys(this.sortedUidsByType);
    return ret;
  }

  decodeEntityUpdate(buffer) {
    const tick = buffer.readUint32();
    const removedEntityCount = buffer.readVarint32();
    const entityUpdateData = this.entityUpdateData;
    entityUpdateData.tick = tick;
    this.entityUpdates.length = 0;
    this.removedEntityList.length = 0;
    this.removedEntities = {};
    this.removedEntitiesSet.clear();
    for (let i = 0; i < removedEntityCount; i++) {
      const uid = buffer.readUint32();
      this.removedEntities[uid] = 1;
      this.removedEntitiesSet.add(uid);
      this.removedEntityList.push(uid);
    }
    const brandNewEntityTypeCount = buffer.readVarint32();
    for (let i = 0; i < brandNewEntityTypeCount; i++) {
      const cnt = buffer.readVarint32();
      const brandNewEntityType = buffer.readUint32();
      const table = this.sortedUidsByType[brandNewEntityType];
      for (let j = 0; j < cnt; j++) table.push(buffer.readUint32());
      this.changedEntityTypes[brandNewEntityType] = 1;
    }
    const SUBT = this.entityTypeKeyList || Object.keys(this.sortedUidsByType);
    for (let i = 0; i < SUBT.length; i++) {
      const entityType = SUBT[i];
      const table = this.sortedUidsByType[entityType];
      if (removedEntityCount > 0) {
        let index = 0;
        for (let j = 0; j < table.length; j++) {
          const uid = table[j];
          if (!this.removedEntitiesSet.has(uid)) table[index++] = uid;
        }
        table.length = index;
      }
      if (entityType in this.changedEntityTypes) {
        table.sort((a, b) => a - b);
        delete this.changedEntityTypes[entityType];
      }
    }
    while (buffer.remaining()) {
      const entityType = buffer.readUint32();
      if (!(entityType in this.attributeMaps)) {
        throw new Error(`Entity type not in attribute map: ${entityType}`);
      }
      const absentFlagsLength = Math.floor((this.sortedUidsByType[entityType].length + 7) / 8);
      if (this.absentEntitiesFlags.length < absentFlagsLength) {
        this.absentEntitiesFlags = new Uint8Array(absentFlagsLength < 64 ? 64 : absentFlagsLength << 1);
      }
      for (let i = 0; i < absentFlagsLength; i++) {
        this.absentEntitiesFlags[i] = buffer.readUint8();
      }
      this.absentEntitiesFlagsUsed = absentFlagsLength;
      const attributeMap = this.attributeMaps[entityType];
      for (let tIdx = 0; tIdx < this.sortedUidsByType[entityType].length; tIdx++) {
        const uid = this.sortedUidsByType[entityType][tIdx];
        if ((this.absentEntitiesFlags[(tIdx / 8) | 0] & (1 << (tIdx % 8))) !== 0) continue;
        const player = { uid, updates: [] };
        const updatedFlagsLength = Math.ceil(attributeMap.length / 8);
        if (this.updatedEntityFlags.length < updatedFlagsLength) {
          this.updatedEntityFlags = new Uint8Array(updatedFlagsLength < 32 ? 32 : updatedFlagsLength << 1);
        }
        for (let j = 0; j < updatedFlagsLength; j++) {
          this.updatedEntityFlags[j] = buffer.readUint8();
        }
        this.updatedEntityFlagsUsed = updatedFlagsLength;
        for (let j = 0; j < attributeMap.length; j++) {
          const attribute = attributeMap[j];
          if (!(this.updatedEntityFlags[(j / 8) | 0] & (1 << (j % 8)))) continue;
          let value, count;
          switch (attribute.type) {
            case attributeTypes.Uint32: value = buffer.readUint32(); break;
            case attributeTypes.Int32: value = buffer.readInt32(); break;
            case attributeTypes.Float: value = buffer.readInt32() / 100; break;
            case attributeTypes.String: value = this.safeReadVString(buffer); break;
            case attributeTypes.Vector2:
              value = { x: buffer.readInt32() / 100, y: buffer.readInt32() / 100 }; break;
            case attributeTypes.ArrayVector2: {
              count = buffer.readInt32();
              const pts = [];
              for (let i = 0; i < count; i++) {
                pts.push({ x: buffer.readInt32() / 100, y: buffer.readInt32() / 100 });
              }
              value = pts; break;
            }
            case attributeTypes.ArrayUint32: {
              count = buffer.readInt32();
              const arr = [];
              for (let i = 0; i < count; i++) arr.push(buffer.readInt32());
              value = arr; break;
            }
            case attributeTypes.Uint16: value = buffer.readUint16(); break;
            case attributeTypes.Uint8: value = buffer.readUint8(); break;
            case attributeTypes.Int16: value = buffer.readInt16(); break;
            case attributeTypes.Int8: value = buffer.readInt8(); break;
            case attributeTypes.Uint64:
              value = buffer.readUint32() + buffer.readUint32() * 4294967296; break;
            case attributeTypes.Int64: {
              let lo = buffer.readUint32();
              const hi = buffer.readInt32();
              if (hi < 0) lo *= -1;
              value = lo + hi * 4294967296; break;
            }
            case attributeTypes.Double: {
              let lo = buffer.readUint32();
              const hi = buffer.readInt32();
              if (hi < 0) lo *= -1;
              value = (lo + hi * 4294967296) / 100; break;
            }
            default:
              throw new Error(`Unsupported attribute type: ${attribute.type}`);
          }
          player.updates.push(attribute.name, value);
        }
        this.entityUpdates.push(player);
      }
    }
    entityUpdateData.byteSize = buffer.capacity();
    return entityUpdateData;
  }

  decodePing() { return {}; }

  encodeRpc(buffer, item) {
    if (!(item.name in this.rpcMapsByName)) {
      throw new Error(`RPC not in map: ${item.name}`);
    }
    const rpc = this.rpcMapsByName[item.name];
    buffer.writeUint32(rpc.index);
    for (let i = 0; i < rpc.parameters.length; i++) {
      const param = item[rpc.parameters[i].name];
      switch (rpc.parameters[i].type) {
        case parameterTypes.Float: buffer.writeInt32(Math.floor(param * 100)); break;
        case parameterTypes.Int32: buffer.writeInt32(param); break;
        case parameterTypes.String: buffer.writeVString(param); break;
        case parameterTypes.Uint32: buffer.writeUint32(param); break;
      }
    }
  }

  decodeRpcObject(buffer, parameters) {
    const result = {};
    for (let i = 0; i < parameters.length; i++) {
      switch (parameters[i].type) {
        case parameterTypes.Uint32: result[parameters[i].name] = buffer.readUint32(); break;
        case parameterTypes.Int32: result[parameters[i].name] = buffer.readInt32(); break;
        case parameterTypes.Float: result[parameters[i].name] = buffer.readInt32() / 100; break;
        case parameterTypes.String: result[parameters[i].name] = this.safeReadVString(buffer); break;
        case parameterTypes.Uint64:
          result[parameters[i].name] = buffer.readUint32() + buffer.readUint32() * 4294967296; break;
      }
    }
    return result;
  }

  decodeRpc(buffer) {
    const rpcIndex = buffer.readUint32();
    const rpc = this.rpcMaps[rpcIndex];
    const result = { name: rpc.name, response: null };
    if (!rpc.isArray) {
      result.response = this.decodeRpcObject(buffer, rpc.parameters);
    } else {
      const response = [];
      const count = buffer.readUint16();
      for (let i = 0; i < count; i++) {
        response.push(this.decodeRpcObject(buffer, rpc.parameters));
      }
      result.response = response;
    }
    return result;
  }

  encodeEnterWorld(buffer, item) {
    buffer.writeVString(item.displayName);
    const e = new Uint8Array(item.extra);
    for (let i = 0; i < item.extra.byteLength; i++) buffer.writeUint8(e[i]);
  }

  encodeInput(buffer, item) { buffer.writeVString(JSON.stringify(item)); }
  encodePing(buffer) { buffer.writeUint8(0); }
}

module.exports = { BinCodec, packetIds, attributeTypes, parameterTypes };
