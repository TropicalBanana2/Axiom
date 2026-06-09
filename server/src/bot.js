// bot.js — Axiom headless bot.
//
// A single Bot represents one persistent zombs.io connection. It owns:
//   - the WebSocket to wss://<server-host>
//   - its own BinCodec instance (server-specific RPC tables)
//   - its own WASM solver for MBF
//   - a small state machine for the join handshake
//   - per-bot behaviour flags (autoFarm, autoBuild, ...)
//
// Cleaner than Banshee's Bot in a few specific ways:
//   1. Constructor takes a plain options object — no positional spread.
//   2. EventEmitter for entity updates / RPCs instead of bespoke callbacks.
//   3. Behaviour flags live on `this.behaviours`, settable in one place,
//      so per-session toggles are explicit (no implicit DOM globals).
//   4. The handshake state machine is named and observable.

const WebSocket = require("ws");
const { EventEmitter } = require("events");
const { BinCodec, packetIds } = require("./binCodec");
const { createWasmSolver } = require("./wasmSolver");
const { serverMap } = require("./serverList");
const { findPath } = require("./pathfinder");

const STATE = {
  IDLE: "idle",
  CONNECTING: "connecting",
  AUTHENTICATING: "authenticating",
  IN_WORLD: "in_world",
  CLOSED: "closed",
};

class Bot extends EventEmitter {
  constructor(opts) {
    super();
    const { id, label, playerName, serverId, psk } = opts;
    if (!serverMap.has(serverId)) throw new Error(`Unknown server: ${serverId}`);
    this.id = id;                     // Axiom session id
    this.label = label || "Session";
    this.playerName = playerName || "Player";
    this.serverId = serverId;
    this.psk = psk;
    this.server = serverMap.get(serverId);

    this.state = STATE.IDLE;
    this.codec = new BinCodec();
    this.wasm = null;
    this.ws = null;
    this.uid = 0;
    this.tick = 0;
    this.uptimeMs = 0;
    this.entities = new Map();
    this.myPlayer = null;
    this.myPet = null;
    this.gs = null;                  // gold-stash entity once placed
    this.party = { id: null, name: null, shareKey: psk || null, members: [] };
    this.partyInfo = [];             // last PartyInfo array (for syncNeeds)
    this.parties = {};               // partyId -> partyData (for SetPartyList replay)
    this.dayCycle = null;            // last DayCycle RPC payload
    this.leaderboard = [];           // last Leaderboard payload
    this.inventory = [];             // [{itemName, tier, stacks}, ...]
    this.localBuildings = [];        // last LocalBuilding delta batch (for syncNeeds replay)
    this.buildings = new Map();      // uid -> {uid,x,y,type,tier,dead} — full live base state
    this.recentMessages = [];        // recent chat messages
    this.isPaused = false;
    this.schemas = {};               // BuildingShopPrices/ItemShopPrices/Spells

    // Full Banshee Scripts set — every flag the per-tick behaviour
    // code may reference. Defaults match Banshee's defaults (all false
    // except autoReconnect/autoHeal which Axiom turns on by default).
    this.behaviours = {
      // Axiom-style on-by-default toggles
      autoFarm:        false,
      autoReconnect:   true,
      autoRefiller:    false,
      autoBreakIn:     false,
      autoHeal:        true,
      autoRevive:      true,    // respawn the alt automatically when it dies
      // Banshee parity — all of the script flags exposed in zombsSessions.js
      autobuild:       false,
      autoupgrade:     false,
      autobow:         false,
      autoaim:         false,
      autopetrevive:   false,
      autopetevolve:   false,
      autopetheal:     false,
      autoaimzombies:  false,
      autoaimdemons:   false,
      playertrick:        false,
      reverseplayertrick: false,
      bossreverseplayertrick: false,
      tokenreverseplayertrick: false,
      ahrc:            false,
      upgradeall:      false,
      sellall:         false,
      upgradetowerhealth: false,
      towerheal:       false,
      autotimeout:     false,
      positionlock:    false,
      autofollow:      false,
      antiarrow:       false,
      revert:          false,
      returnitems:     false,
      autoweaponswitch: false,
      automove:        false,
      aimlock:         false,
      chatspam:        false,
      wallbounce:      false,
      autoclearzombies: false,
    };

    // Internal per-tick state.
    this.hasFarmed = true;           // flipped to false by start() if autoFarm
    this.farmReleaseTicks = 0;
    this.petActivated = false;
    this.healCooldownTick = 0;
    this.farmLock = null;            // {x, y} when locked onto a tree/stone

    // ── Navigation (spot-farming) state machine ──
    // farmSpot:    { x, y, angle } — marked point + aim angle.
    // navIntent:   'farm' (controller wants this bot farming) | 'idle'.
    // navHome:     {x,y} — the bot's spot in the base; it returns here
    //              when recalled instead of stopping at the farm.
    // navReturning:true while walking home after a recall (so the nav
    //              tick keeps running until home is reached).
    // navActive:   derived getter — true while any navigation is live.
    this.farmSpot = null;
    // farmFixed: this bot has an explicit, predetermined farm spot (set by
    // Smart Farm Setup) — don't apply the dynamic ring offset on top of it.
    this.farmFixed = false;
    this.navIntent = "idle";
    this.navHome = null;
    // navBase: {x,y} — the explicit base anchor the user sets by
    // positioning the bot where they want it and starting smart upgrade.
    // Takes priority over the GoldStash / spawn fallback in _homePoint().
    this.navBase = null;
    // navErrand: {x,y} — a TEMPORARY walk target (smart-upgrade fetching
    // the bot to a building). Unlike gotoPoint it does NOT re-anchor
    // navBase; cleared on arrival or when any other intent takes over.
    this.navErrand = null;
    // When farming is turned OFF, return to base ONLY if this is set —
    // which Smart Farm Setup does. Otherwise the bot just stops where it
    // is (the user doesn't want every farm-disable to trek home).
    this.returnToBase = false;
    this.navReturning = false;
    this.navPath = null;             // [{x,y}, ...] remaining waypoints
    this.navIndex = 0;
    this.navReplanTick = 0;
    this.navArrived = false;
    this.navStatus = "idle";         // idle|to-farm|farming|returning|holding|nopath
  }

  // True while the bot is navigating (heading out, farming, or returning).
  get navActive() {
    return this.navIntent === "farm" || this.navReturning;
  }

  // Mark / clear the farm spot. angle is 0-359 (the aim direction used
  // once the bot arrives). Persisted by the caller (dashboard/db).
  setFarmSpot(x, y, angle) {
    if (x == null) { this.farmSpot = null; this.farmTargets = null; return; }
    this.farmSpot = { x: +x, y: +y, angle: ((+angle % 360) + 360) % 360 };
    this.navPath = null; this.navIndex = 0; this.navArrived = false;
  }

  // Optional resource targets for the farm spot. When set (Smart Farm sends
  // the tree + stone), the bot ALTERNATES its swing between them while
  // farming — aiming straight at a real resource each time — instead of
  // holding one fixed angle at the empty point between them. This is what
  // lets a single bot collect both wood and stone, and makes the exact
  // standing position far less fiddly.
  setFarmTargets(targets) {
    this.farmTargets = (Array.isArray(targets) && targets.length)
      ? targets.map((t) => ({ x: +t.x, y: +t.y })).filter((t) => Number.isFinite(t.x) && Number.isFinite(t.y))
      : null;
  }

  // The base anchor the bot returns to, in priority order:
  //   1. navBase  — the exact spot the user placed the bot at when they
  //                 started smart upgrade (captureBase below). This is the
  //                 preferred anchor: the user picks where in the base the
  //                 bots should sit.
  //   2. GoldStash — the shared party base, if no explicit point was set.
  //   3. navHome  — the captured spawn position, last-resort fallback.
  // We never anchor to the raw spawn first: alts join scattered across
  // the map, which made them "go to random places" on the way back.
  _homePoint() {
    const b = this.navBase;
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) return { x: b.x, y: b.y };
    const gs = this.gs;
    if (gs && Number.isFinite(gs.x) && Number.isFinite(gs.y)) {
      return { x: gs.x, y: gs.y };
    }
    return this.navHome || null;
  }

  // Capture the bot's CURRENT position as its base anchor. Called when the
  // user starts smart upgrade, so the bots return to wherever the user has
  // positioned them inside the base. Returns the captured point or null.
  captureBase() {
    const p = this.myPlayer && this.myPlayer.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    this.navBase = { x: p.x, y: p.y };
    // Re-path any in-progress return so it heads to the new anchor.
    this.navPath = null; this.navIndex = 0;
    return this.navBase;
  }

  // Relocate the bot to an arbitrary world point: make it the new base
  // anchor and walk there, then idle. Used by the dashboard's "bring
  // other sessions here" action. Honours the only-farm-or-base model —
  // the point simply becomes this bot's base.
  gotoPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.navBase = { x: Math.round(x), y: Math.round(y) };
    this.navErrand = null;
    this.navIntent = "idle";
    this.navReturning = true;
    this.navPath = null; this.navIndex = 0; this.navArrived = false;
    this.navStatus = "returning";
  }

  // Temporary errand: walk to a point WITHOUT re-anchoring navBase (unlike
  // gotoPoint, which makes the point the bot's new home). Used by the
  // smart-upgrade coordinator to fetch a bot to an out-of-base building —
  // the bot's home stays the user's base anchor, so later recalls still
  // return it to the base instead of the building.
  errandTo(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.navErrand = { x: Math.round(x), y: Math.round(y) };
    this.navIntent = "idle";
    this.navReturning = true;
    this.navPath = null; this.navIndex = 0; this.navArrived = false;
    this.navStatus = "returning";
  }

  // Lightweight live snapshot for the fleet overlay (dashboard map +
  // in-game labels/destinations). Returns null until the bot is in-world.
  fleetInfo() {
    const p = this.myPlayer && this.myPlayer.position;
    if (!p) return null;
    const home = this._homePoint();
    return {
      id: this.id,
      label: this.label,
      uid: this.uid || null,
      partyId: (this.myPlayer && this.myPlayer.partyId) || null,
      serverId: this.serverId,
      dead: !!(this.myPlayer && this.myPlayer.dead),
      pos: { x: p.x | 0, y: p.y | 0 },
      navStatus: this.navStatus || "idle",
      navActive: !!this.navActive,
      base: home ? { x: home.x | 0, y: home.y | 0 } : null,
      farmSpot: this.farmSpot ? { x: this.farmSpot.x | 0, y: this.farmSpot.y | 0 } : null,
      // The tree+stone the bot is farming (Smart Farm) — lets the dashboard
      // save the spot as a per-server preset.
      farmTargets: this.farmTargets ? this.farmTargets.map((t) => ({ x: t.x | 0, y: t.y | 0 })) : null,
      // Only stream the path while actually moving (keeps payload small).
      path: (this.navActive && this.navPath)
        ? this.navPath.map((w) => ({ x: w.x | 0, y: w.y | 0 }))
        : null,
    };
  }

  // Controller intent. on=true → go farm (capturing the current base
  // position as "home" the first time). on=false → return to home, then
  // settle idle.
  setNavActive(on) {
    this.navErrand = null;   // any explicit intent change cancels an errand
    if (on) {
      this.navIntent = "farm";
      this.navReturning = false;
      // Capture a fallback spawn position the first time we leave — only
      // used by _homePoint() until the party's GoldStash is known. Skip it
      // if we're already standing at the farm spot (otherwise the fallback
      // home == farm and the bot would never "return").
      if (!this.navHome && this.myPlayer && this.myPlayer.position) {
        const p = this.myPlayer.position;
        const nearFarm = this.farmSpot &&
          Math.hypot(p.x - this.farmSpot.x, p.y - this.farmSpot.y) < 200;
        if (!nearFarm) this.navHome = { x: p.x, y: p.y };
      }
      this.navPath = null; this.navIndex = 0; this.navArrived = false;
    } else {
      this.navIntent = "idle";
      const me = this.myPlayer && this.myPlayer.position;
      const home = this._homePoint();
      const away = me && home && Math.hypot(me.x - home.x, me.y - home.y) > 80;
      // Only walk home on disable when returnToBase is set (Smart Farm).
      // Otherwise just stop in place — no trek back to base.
      if (away && this.returnToBase) {
        this.navReturning = true;
        this.navPath = null; this.navIndex = 0; this.navArrived = false;
        this.navStatus = "returning";
      } else {
        this.navReturning = false;
        this.navStatus = "idle";
        try { this.sendInput({ up: 0, down: 0, left: 0, right: 0, mouseUp: 1 }); } catch {}
      }
    }
  }

  // Are there hostile NPCs (zombies / demons) within `radius` of a point?
  // Used to avoid sending the bot to a farm spot that's under attack.
  _enemiesNear(x, y, radius) {
    const r2 = radius * radius;
    for (const [, e] of this.entities) {
      const t = e.targetTick;
      if (!t || !t.position || t.dead) continue;
      const m = t.model;
      if (!m) continue;
      if (!(m.startsWith("Zombie") || m.startsWith("NeutralTier"))) continue;
      const dx = t.position.x - x, dy = t.position.y - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  setBehaviour(key, value) {
    if (!(key in this.behaviours)) return;
    const wasOn = this.behaviours[key];
    this.behaviours[key] = !!value;
    // Side effects on transitions ------------------------------------
    // autoFarm OFF: release any held input so the bot stops chopping.
    // Without this, the last mouseDown stays asserted server-side and
    // the bot harvests forever even though the flag is false.
    if (key === "autoFarm" && wasOn && !value && this.myPlayer) {
      this._releaseFarm();
    }
    this.emit("behaviourChange", key, !!value);
  }

  start() {
    if (this.state !== STATE.IDLE && this.state !== STATE.CLOSED) return;
    this.state = STATE.CONNECTING;
    this.wasm = createWasmSolver();
    this.ws = new WebSocket(`wss://${this.server.host}`, {
      headers: { Origin: "", "User-Agent": "Mozilla/5.0 (Axiom)" },
    });
    this.ws.binaryType = "arraybuffer";
    this.ws.on("open", () => this.emit("open"));
    this.ws.on("message", (data) => this._onMessage(data));
    this.ws.on("close", () => this._onClose());
    this.ws.on("error", (err) => this.emit("error", err));
    this.uptimeMs = Date.now();
    this.hasFarmed = !this.behaviours.autoFarm;
  }

  stop() {
    this.state = STATE.CLOSED;
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0)) {
      this.ws.close();
    }
  }

  sendPacket(opcode, payload) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(this.codec.encode(opcode, payload));
      return true;
    } catch (err) {
      this.emit("error", err);
      return false;
    }
  }

  sendRpc(name, params = {}) {
    return this.sendPacket(packetIds.PACKET_RPC, { name, ...params });
  }

  sendInput(input) {
    return this.sendPacket(packetIds.PACKET_INPUT, input);
  }

  sendRaw(buffer) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(buffer);
  }

  // -------- internal ----------------------------------------------------
  _onMessage(raw) {
    const m = new Uint8Array(raw);
    const opcode = m[0];
    let data;
    try { data = this.codec.decode(raw); } catch {}

    switch (opcode) {
      case packetIds.PACKET_ENTITY_UPDATE:
        this._onEntityUpdate(data);
        this.emit("entityUpdate", data, raw);
        break;
      case packetIds.PACKET_ENTER_WORLD:
        this._onEnterWorld(data);
        this.emit("enterWorld", data, raw);
        break;
      case packetIds.PACKET_PRE_ENTER_WORLD:
        // MBF challenge — solve and reply with opcode 4
        if (!this.wasm) this.wasm = createWasmSolver();
        this.wasm.onDecodeOpcode5(m, this.server.hostname, (decoded) => {
          this.sendPacket(packetIds.PACKET_ENTER_WORLD, {
            displayName: this.playerName,
            extra: decoded[5],
          });
          this.enterworld2 = decoded[6];
        });
        break;
      case packetIds.PACKET_RPC:
        this._onRpc(data);
        this.emit("rpc", data, raw);
        break;
      case 10:
        // MBF continuation
        if (this.wasm) this.ws.send(this.wasm.finalizeOpcode10(m));
        break;
    }
  }

  _onClose() {
    this.state = STATE.CLOSED;
    this.emit("close");
  }

  _onEnterWorld(data) {
    // Banshee handles data.allowed === false by sending a single 0 byte
    // back. That's how the bot signals "you got rejected" upstream.
    if (!data.allowed) {
      try { this.ws.send(0); } catch {}
      return;
    }
    this.state = STATE.IN_WORLD;
    this.uid = data.uid;
    // Fresh world → forget the old base-home anchor and re-capture the
    // session's STARTING position at the first entity tick (see
    // _onEntityUpdate). This is the spot the bot returns to.
    this.navHome = null;
    this.navErrand = null;
    this.navReturning = false;
    this._captureHome = true;
    // MBF continuation — bot already computed opcode 6, send it now.
    if (this.enterworld2) this.ws.send(this.enterworld2);
    if (!this.behaviours.autoFarm) this.hasFarmed = true;
    this.uptimeMs = Date.now();
    // Note: do NOT clear autoBreakIn here — Banshee's reset was
    // server-side (server.autoBreakIn is a server-level flag, not
    // per-bot). In Axiom autoBreakIn is per-bot and user-controlled,
    // so we preserve whatever the dashboard set.

    // Banshee init sequence (zombsSessions.js:1547-1598). The 26 up:1
    // packets register the character with the server so it isn't flagged
    // as AFK and so entity-update streaming begins. The Metrics RPC sends
    // fake but realistic client telemetry that zombs.io expects from real
    // browser clients. We buy both pets but equip PetCARL LAST so CARL is
    // the active pet — never the miner pet ("Woody"), which would wander
    // off chopping resources.
    this.sendInput({ mouseMoved: 15 });
    this.sendRpc("JoinPartyByShareKey", { partyShareKey: this.psk || "" });
    this.sendRpc("BuyItem", { itemName: "HatHorns", tier: 1 });
    this.sendRpc("BuyItem", { itemName: "PetMiner", tier: 1 });
    this.sendRpc("BuyItem", { itemName: "PetCARL",  tier: 1 });
    this.sendRpc("EquipItem", { itemName: "PetMiner", tier: 1 });
    this.sendRpc("EquipItem", { itemName: "PetCARL",  tier: 1 });
    // 26 directional pings — same count Banshee uses. This is the
    // "random directional movement on load" — the character wobbles
    // briefly upward, registering its presence with the zombs.io
    // server and triggering the first entity-update broadcast.
    for (let i = 0; i < 26; i++) this.sendInput({ up: 1 });
    this.sendPacket(packetIds.PACKET_PING, {});
    // Metrics — exact payload Banshee sends. zombs.io occasionally
    // gates features behind seeing reasonable client telemetry.
    this.sendRpc("Metrics", {
      minFps: 21.74, maxFps: 70.2, currentFps: 60.34, averageFps: 59.7,
      framesRendered: 7442, framesInterpolated: 7442, framesExtrapolated: 0,
      allocatedNetworkEntities: 200,
      currentClientLag: 203, minClientLag: 99, maxClientLag: 398,
      currentPing: 101.5, minPing: 91, maxPing: 113, averagePing: 96.85,
      longFrames: 1, stutters: 142,
      group: 0, isMobile: 0,
      timeResets: 1, maxExtrapolationTime: 0,
      extrapolationIncidents: 0, totalExtrapolationTime: 0,
      differenceInClientTime: 16.7,
    });
  }

  _onEntityUpdate(data) {
    this.tick = data.tick;
    for (const uid of data.removedEntities) this.entities.delete(uid);
    for (const e of data.entities) {
      let row = this.entities.get(e.uid);
      if (!row) {
        row = { uid: e.uid, targetTick: { uid: e.uid }, model: null };
        this.entities.set(e.uid, row);
      }
      for (let i = 0; i < e.updates.length; i += 2) {
        row.targetTick[e.updates[i]] = e.updates[i + 1];
      }
      if (row.targetTick.model) row.model = row.targetTick.model;
    }
    const meRow = this.entities.get(this.uid);
    this.myPlayer = meRow && meRow.targetTick;
    if (this.myPlayer && this.entities.get(this.myPlayer.petUid)) {
      this.myPet = this.entities.get(this.myPlayer.petUid).targetTick;
    }

    // Capture the session's STARTING position once, as the base/home
    // anchor it returns to. Taken at the first tick we have a position
    // (right after spawn) so it's deterministic — not wherever the bot
    // happens to be when farming starts.
    if (this._captureHome && this.myPlayer && this.myPlayer.position) {
      this.navHome = { x: this.myPlayer.position.x, y: this.myPlayer.position.y };
      this._captureHome = false;
    }

    // -------- behaviours run on every tick --------
    // Banshee parity (zombsSessions.js:993): when a browser is attached
    // ("userCount"), suppress the bot's autonomous heal / respawn /
    // refill chatter so it doesn't conflict with the human user's
    // intent. The bot's stash-maintenance only runs while idle.
    const userCount = (typeof this._userAttached === "function")
      ? this._userAttached() : false;

    // "Take Control": while a human is driving this session, the bot stops
    // sending ALL of its own inputs (nav, autofarm, heal, respawn) so it
    // never fights the user's movement/aim. On the tick control is taken we
    // release any held swing/movement once.
    const controlling = !!this._userControlling;
    if (controlling) {
      if (!this._wasControlling && this.myPlayer) {
        try { this.sendInput({ up: 0, down: 0, left: 0, right: 0, mouseUp: 1 }); } catch {}
      }
      this._wasControlling = true;
      return;   // hand the session entirely to the user
    }
    this._wasControlling = false;

    if (this.farmReleaseTicks > 0 && this.myPlayer) {
      this.sendInput({ mouseUp: 1 });
      this.farmReleaseTicks--;
    }

    // Spot-navigation takes priority over local autoFarm. When active
    // with a marked spot, the bot pathfinds out of the base + to the
    // spot, then holds mouseDown at the marked angle to farm there.
    // While navigating we suppress the local autoFarm walker so the two
    // movement systems don't fight.
    // Track day/night phase for the travel-safety gate.
    this._updateDayPhase();

    // Navigation runs while heading to/farming a spot (needs farmSpot) OR
    // while returning home after a recall. _tickNavigate is the single
    // authority for where the bot goes (only ever farm or base).
    const navigating = this.myPlayer && !this.myPlayer.dead && (
      (this.navIntent === "farm" && this.farmSpot) ||
      this.navReturning
    );
    if (navigating) {
      this._tickNavigate();
    }

    // Continuous farming: reset hasFarmed when both resources have
    // been spent (deposited into harvester, stash was built, etc.).
    // Banshee's hasFarmed was a one-shot guard; Axiom's autoFarm is
    // meant to be continuous — farm → deposit → farm again.
    // We only reset when BOTH are 0 (pair-only targeting requires
    // both), and only when autoFarm is on so manual deposits don't
    // accidentally re-arm the loop.
    if (this.hasFarmed && this.behaviours.autoFarm && this.myPlayer &&
        this.myPlayer.wood === 0 && this.myPlayer.stone === 0) {
      this.hasFarmed = false;
    }
    if (!navigating && this.behaviours.autoFarm && !this.hasFarmed && !this.gs && this.myPlayer) {
      this._tickAutoFarm();
    }
    if (!userCount && this.behaviours.autoHeal && this.myPlayer) this._tickAutoHeal();
    // autoRevive / autoBreakIn: when the alt's player is dead, schedule a
    // respawn input (the wiki confirms respawn = an inputPacketScheduler
    // input, not an RPC). Throttled to ~once/sec so we don't spam — the
    // respawn only works while the party's GoldStash is alive. autoRevive
    // is the user-facing toggle (default on); autoBreakIn keeps the old
    // behaviour for parity.
    if ((this.behaviours.autoRevive || this.behaviours.autoBreakIn) &&
        this.myPlayer && this.myPlayer.dead) {
      if (!this._reviveAt || this.tick >= this._reviveAt) {
        this.sendInput({ respawn: 1 });
        this._reviveAt = this.tick + 20;   // ~1 s @ 20 tps
      }
    }
    // autoRefiller (port of Banshee's partyFiller — zombsSessions.js:1466):
    // when the bot has no GoldStash (was kicked / never joined), retry
    // JoinPartyByShareKey with its configured PSK on a ~5 s cooldown.
    // We don't have Banshee's server-wide PSK cache, so we use the
    // bot's own psk instead of picking a random one.
    if (this.behaviours.autoRefiller && !this.gs && this.psk && this.myPlayer) {
      if (!this._refillerNextTick || this.tick >= this._refillerNextTick) {
        this.sendRpc("JoinPartyByShareKey", { partyShareKey: this.psk });
        this._refillerNextTick = this.tick + 100;  // ~5 s @ 20 tps
      }
    }

    // ── Map-edge auto-correction ─────────────────────────────────────
    // When the bot ends up with any position coordinate within 20 units
    // of a map boundary (0 or 24000), push the opposite direction every
    // tick until it's at least 100 units back inside the playable area.
    // Runs independent of autoFarm so a bot that finished farming but
    // happens to be parked at y≈0 (or any other edge) doesn't sit there
    // forever. Hysteresis between TRIGGER (20) and RELEASE (100) avoids
    // dithering: bot pushes off, walks safely inland, then releases.
    if (this.myPlayer && !this.myPlayer.dead) {
      const MAP_SIZE   = 24000;
      const EDGE_TRIG  = 20;
      const EDGE_REL   = 100;
      const px = this.myPlayer.position.x;
      const py = this.myPlayer.position.y;
      const dEdge = Math.min(px, MAP_SIZE - px, py, MAP_SIZE - py);

      const wasActive = this._edgePushActive;
      if (dEdge < EDGE_TRIG)      this._edgePushActive = true;
      else if (dEdge > EDGE_REL)  this._edgePushActive = false;

      if (this._edgePushActive) {
        // While edge-pushing, freeze the farm move-history window.
        // If we let it accumulate here, the bot's movement toward the
        // edge-escape direction projects near-zero against the pair
        // target, which triggers the stuck-recovery cycle and can
        // blacklist a perfectly reachable pair. Clearing each tick
        // ensures the window only ever contains samples taken while
        // the bot was freely walking toward its own target.
        this.farmMoveHistory = [];

        // Push toward map center.
        this.sendInput({
          right: px < MAP_SIZE / 2 ? 1 : 0,
          left:  px < MAP_SIZE / 2 ? 0 : 1,
          down:  py < MAP_SIZE / 2 ? 1 : 0,
          up:    py < MAP_SIZE / 2 ? 0 : 1,
        });
        this._wasEdgePushing = true;
      } else if (this._wasEdgePushing) {
        // Just escaped. Clear move-history AND the stuck state so the
        // farm loop starts evaluating progress from a clean slate.
        // Also clear the blacklist — any pairs that were blacklisted
        // during the edge-push were falsely condemned (stuck detection
        // fired because of edge-movement, not because the pair was
        // unreachable). Use a short expiry so we only clear entries
        // that were added in roughly the last 5 s (100 ticks @ 20 tps).
        this.farmMoveHistory   = [];
        this.farmStuckTicks    = 0;
        this.farmStuckAttempts = 0;
        this.farmUnstickUntil  = 0;
        if (this.farmBlacklist) {
          for (const [uid, expiry] of this.farmBlacklist) {
            if (expiry < this.tick + 200) this.farmBlacklist.delete(uid);
          }
        }
        // Release the edge-push keys. This happens on the tick AFTER
        // _tickAutoFarm already sent its own movement — that movement
        // packet is now overridden. That's one wasted tick. To
        // compensate, set farmLastPos to null so the very next tick's
        // delta doesn't get recorded as a zero (which would look like
        // a stuck event and undo everything we just cleared).
        this.sendInput({ up: 0, down: 0, left: 0, right: 0 });
        this.farmLastPos = null;
        this._wasEdgePushing = false;
      }
    }

    // Emit a farm-state snapshot every ~200 ms (4 ticks) so the
    // dashboard's Farm Observer can render what the bot's doing.
    // Only emit when autoFarm is on AND we have player data — saves
    // network for idle bots and bots that haven't entered world yet.
    if ((this.behaviours.autoFarm || this.navActive) && this.myPlayer && (this.tick & 0x3) === 0) {
      // Gather candidate entities within MAX_CHASE so the minimap can
      // draw trees / stones / blacklisted markers. Capped at 40 to
      // keep the JSON payload reasonable on dense maps.
      const candidates = [];
      const blacklistDetail = [];
      const MAX = 1500;
      const px = this.myPlayer.position.x;
      const py = this.myPlayer.position.y;
      for (const [uid, entity] of this.entities) {
        const t = entity.targetTick;
        if (!t || !t.model || !t.position) continue;
        if (t.model !== "Tree" && t.model !== "Stone") continue;
        const dist = Math.hypot(t.position.x - px, t.position.y - py);
        if (dist > MAX) continue;
        const isBl = (this.farmBlacklist?.get(uid) || 0) > this.tick;
        candidates.push({
          uid, model: t.model,
          x: t.position.x | 0, y: t.position.y | 0,
          bl: isBl,
        });
        if (isBl) blacklistDetail.push({ uid, x: t.position.x | 0, y: t.position.y | 0 });
        if (candidates.length >= 40) break;
      }

      this.emit("farmState", {
        tick: this.tick,
        playerPos: { x: px | 0, y: py | 0 },
        target: this.farmLock,                    // { x, y } or null
        targetId: this.farmTargetId || null,      // "p:treeUid:stoneUid"
        targetUids: this.farmTargetUids || [],    // [treeUid, stoneUid]
        isPair: !!this.farmTargetIsPair,
        stuckTicks: this.farmStuckTicks || 0,
        stuckAttempts: this.farmStuckAttempts || 0,
        unstickActive: this.farmUnstickUntil > this.tick,
        moving: !!this.farmMoving,
        hasFarmed: !!this.hasFarmed,
        wood: this.myPlayer.wood || 0,
        stone: this.myPlayer.stone || 0,
        candidates,                               // [{uid, model, x, y, bl}]
        blacklist: blacklistDetail,               // [{uid, x, y}]
        // Navigation overlay
        navActive: !!this.navActive,
        navStatus: this.navStatus,
        navIntent: this.navIntent,
        farmSpot: this.farmSpot,                  // { x, y, angle } or null
        navHome: (() => { const h = this._homePoint(); return h ? { x: h.x | 0, y: h.y | 0 } : null; })(),
        navPath: this.navActive && this.navPath
          ? this.navPath.map((p) => ({ x: p.x | 0, y: p.y | 0 }))
          : null,
      });
    }
  }

  _onRpc(data) {
    if (!data || !data.name) return;
    const r = data.response;
    switch (data.name) {
      case "PartyShareKey":
        if (r && r.partyShareKey) this.party.shareKey = r.partyShareKey;
        break;
      case "PartyInfo":
        if (Array.isArray(r)) {
          this.partyInfo = r;
          this.party.members = r;
        }
        break;
      case "AddParty":
        if (r) {
          this.parties[r.partyId] = r;
          if (this.myPlayer && r.partyId === this.myPlayer.partyId) {
            this.party.id = r.partyId;
            this.party.name = r.partyName;
          }
        }
        break;
      case "RemoveParty":
        if (r && r.partyId != null) delete this.parties[r.partyId];
        break;
      case "SetPartyList":
        if (Array.isArray(r)) {
          this.parties = {};
          for (const p of r) {
            this.parties[p.partyId] = p;
            if (this.myPlayer && p.partyId === this.myPlayer.partyId) {
              this.party.id = p.partyId;
              this.party.name = p.partyName;
            }
          }
        }
        break;
      case "DayCycle":
        if (r) this.dayCycle = r;
        break;
      case "Leaderboard":
        if (Array.isArray(r)) this.leaderboard = r;
        break;
      case "SetItem":
        if (r) {
          // store as array (Banshee's format)
          const idx = this.inventory.findIndex((it) => it.itemName === r.itemName);
          const entry = { itemName: r.itemName, tier: r.tier, stacks: r.stacks };
          if (idx >= 0) this.inventory[idx] = entry; else this.inventory.push(entry);
        }
        break;
      case "LocalBuilding":
        if (Array.isArray(r)) {
          this.localBuildings = r;
          // Maintain the full base as a Map (Banshee zombsSessions.js:1590).
          // LocalBuilding is a DELTA stream: dead entries remove, alive
          // entries upsert. The smart-upgrade coordinator reads this.
          for (const b of r) {
            if (b.dead) this.buildings.delete(b.uid);
            else this.buildings.set(b.uid, { uid: b.uid, x: b.x, y: b.y, type: b.type, tier: b.tier, dead: 0 });
          }
          // Track the GoldStash for autoFarm gating + coordinator.
          const stash = [...this.buildings.values()].find((x) => x.type === "GoldStash");
          this.gs = stash || null;
        }
        break;
      case "ReceiveChatMessage":
        if (r) {
          this.recentMessages.push(r);
          if (this.recentMessages.length > 50) this.recentMessages.shift();
        }
        break;
      case "BuildingShopPrices":
      case "ItemShopPrices":
      case "Spells":
        this.schemas[data.name] = data;
        break;
    }
  }

  // Stats snapshot for the dashboard. Returns null if not yet in-world.
  getStats() {
    const p = this.myPlayer;
    if (!p) return null;
    return {
      name: p.name || this.playerName,
      uid: this.uid,
      wave: p.wave || 0,
      score: p.score || 0,
      wood: p.wood || 0, stone: p.stone || 0,
      gold: p.gold || 0, token: p.token || 0,
      health: p.health || 0, maxHealth: p.maxHealth || 0,
      shieldHealth: p.zombieShieldHealth || 0,
      shieldMaxHealth: p.zombieShieldMaxHealth || 0,
      weaponName: p.weaponName, weaponTier: p.weaponTier,
      petName: this.myPet && this.myPet.model,
      petTier: this.myPet && this.myPet.tier,
      partyId: p.partyId || null,
      position: p.position || null,
      dead: !!p.dead,
    };
  }

  // Current Pickaxe tier (1-7). Prefers the equipped weapon tier, falls
  // back to the inventory entry, defaults to 1.
  getPickaxeTier() {
    if (this.myPlayer && this.myPlayer.weaponName === "Pickaxe" && this.myPlayer.weaponTier) {
      return this.myPlayer.weaponTier;
    }
    const inv = (this.inventory || []).find((i) => i.itemName === "Pickaxe");
    return (inv && inv.tier) || 1;
  }

  // Is it night in-game? Used to keep bots from traversing the map
  // (between base and farm) while zombies roam.
  isNight() {
    return !!(this.dayCycle && !this.dayCycle.isDay);
  }

  // Resolve each party member's stats by looking up their entity in
  // the bot's tracked world. Used by the dashboard to show member lists.
  getPartyMembers() {
    return (this.party.members || []).map((m) => {
      const e = this.entities.get(m.playerUid);
      const t = e && e.targetTick;
      return {
        uid: m.playerUid,
        displayName: m.displayName,
        isLeader: !!m.isLeader,
        canSell: !!m.canSell,
        isMe: m.playerUid === this.uid,
        stats: t ? {
          name: t.name, wave: t.wave || 0, score: t.score || 0,
          wood: t.wood || 0, stone: t.stone || 0,
          gold: t.gold || 0, token: t.token || 0,
          health: t.health || 0, maxHealth: t.maxHealth || 0,
          dead: !!t.dead,
          position: t.position || null,
        } : null,
      };
    });
  }

  // Serialise everything an attaching browser needs to bootstrap. The
  // shape matches Banshee's getSyncNeeds() byte-for-byte so the
  // browser-side applyVerifyData can replay the same packet stream.
  getSyncNeeds() {
    // syncNeeds is an array of packet-shaped events emitted in order.
    // First MUST be the ENTER_WORLD packet — engine derives myUid here.
    const syncNeeds = [];
    const meName = (this.entities.get(this.uid) && this.entities.get(this.uid).targetTick.name) || this.playerName;
    syncNeeds.push({
      opcode: 4, allowed: 1, uid: this.uid, startingTick: this.tick,
      tickRate: 20, effectiveTickRate: 20,
      players: 1, maxPlayers: 40, chatChannel: 0,
      effectiveDisplayName: meName,
      x1: 0, y1: 0, x2: 24000, y2: 24000,
    });
    syncNeeds.push({ opcode: 9, name: "PartyInfo",     response: this.partyInfo });
    syncNeeds.push({ opcode: 9, name: "PartyShareKey", response: { partyShareKey: this.party.shareKey || this.psk || "" } });
    if (this.dayCycle)     syncNeeds.push({ opcode: 9, name: "DayCycle",    response: this.dayCycle });
    if (this.leaderboard)  syncNeeds.push({ opcode: 9, name: "Leaderboard", response: this.leaderboard });
    syncNeeds.push({ opcode: 9, name: "SetPartyList",  response: Object.values(this.parties) });

    // Entities as [uid, targetTick] tuples — engine wraps in new Map().
    const entities = [];
    this.entities.forEach((e) => entities.push([e.uid, e.targetTick]));

    return {
      opcode: 0,
      tick: this.tick,
      byteSize: 654,
      entities,
      syncNeeds,
      // Send the FULL base, not just the last delta batch. The engine's
      // LocalBuilding handler enables tower placement only when it sees
      // the GoldStash in this list (app.js:9530 clears the `disabled`
      // flags), and existing towers must be here to be clickable. The
      // last-delta `this.localBuildings` usually omits the long-placed
      // stash → placement stays disabled. Use the full buildings Map.
      localBuildings: [...this.buildings.values()],
      inventory: this.inventory,
      messages: this.recentMessages,
      serverId: this.serverId,
      useRequiredEquipment: true,
      petActivated: !!this.petActivated,
      isPaused: !!(this.myPlayer && this.myPlayer.isPaused),
      // Codec internals required for further entity-update decoding.
      sortedUidsByType: this.codec.sortedUidsByType,
      removedEntities:  this.codec.removedEntities,
      absentEntitiesFlags: Array.from(this.codec.absentEntitiesFlags.subarray(0, this.codec.absentEntitiesFlagsUsed)),
      updatedEntityFlags:  Array.from(this.codec.updatedEntityFlags.subarray (0, this.codec.updatedEntityFlagsUsed)),
      // Full codec lookup tables — the browser's engine never
      // performs a real enterWorld so these would otherwise be empty.
      attributeMaps:   this.codec.attributeMaps,
      entityTypeNames: this.codec.entityTypeNames,
      rpcMaps:         this.codec.rpcMaps,
      rpcMapsByName:   this.codec.rpcMapsByName,
      // Static schemas the engine needs at boot.
      schemas: this.schemas,
      // Convenience for the dashboard, not used by replay.
      myUid: this.uid,
      myPlayerName: meName,
      party: this.party,
    };
  }

  _tickAutoHeal() {
    if (!this.myPlayer || this.myPlayer.dead) return;
    if (this.tick < this.healCooldownTick) return;
    if (this.myPlayer.health / Math.max(1, this.myPlayer.maxHealth) > 0.3) return;
    this.sendRpc("BuyItem", { itemName: "HealthPotion", tier: 1 });
    this.sendRpc("EquipItem", { itemName: "HealthPotion", tier: 1 });
    this.healCooldownTick = this.tick + 100;       // ~5 s @ 20 tps
  }

  // ── Spot navigation state machine ──
  // INVARIANT: the bot is only ever AT one of two locations (the farm
  // spot or the base/home) or MOVING between them — never anywhere else.
  //
  // Safety model (per user spec):
  //   • At the farm spot → assumed safe (don't flee zombies).
  //   • At the base      → assumed safe.
  //   • Travel ONLY during the safe daytime window (not close to night,
  //     not just after day) — that's the only time zombies could catch a
  //     bot crossing the open. If it's an unsafe window and the bot is
  //     already at a safe location, it simply WAITS there.
  //   • If somehow stranded between the two (e.g. fresh spawn), it heads
  //     to its desired location regardless of the window — never lingers
  //     in the open.
  _tickNavigate() {
    const me = this.myPlayer.position;
    const ARRIVE = 60;        // close enough to "arrive" (home)
    const FARM_ZONE = 120;    // start farming within this of the spot (forgiving)
    const WP_REACH = 40;      // advance to next waypoint within this distance

    // A pending errand (smart-upgrade fetching us to a building) overrides
    // the base anchor as the "idle" destination — navBase itself unchanged.
    const home = this.navErrand || this._homePoint();
    // Farm target = the configured spot PLUS this bot's coordination slot
    // offset, so multiple party bots fan out around the same tree/stone
    // instead of stacking on one pixel (see assignFarmSlots). Angle is
    // preserved so they all still aim at the resource.
    let farm = this.farmSpot;
    if (farm && this._farmSlot) {
      const fs = this._farmSlot;
      farm = {
        x: farm.x + fs.dx, y: farm.y + fs.dy,
        // Ringed bots aim inward at the resource cluster; a lone bot keeps
        // the configured aim.
        angle: (fs.angle != null) ? fs.angle : farm.angle,
      };
    }

    // Desired resting location for the current intent.
    let desired = (this.navIntent === "farm") ? farm : home;
    if (!desired) desired = home || farm;   // fall back to whatever we know
    if (!desired) {
      // Nothing to navigate to — clear any stale returning state so the
      // bot doesn't get stuck "navigating" to nowhere (the reported
      // "bots just stop doing stuff" symptom).
      this.navReturning = false;
      this.navStatus = "idle";
      return;
    }
    const desiredIsFarm = (desired === farm);

    const distDesired = Math.hypot(desired.x - me.x, desired.y - me.y);

    // ── Farming: forgiving. Swing as soon as we're anywhere near the spot,
    //    keep edging onto it, but if we get jammed (bots/tree collisions)
    //    just settle and farm where we are — the alternating swing reaches
    //    the resources from anywhere in range, so the exact spot isn't vital.
    if (desiredIsFarm && distDesired <= FARM_ZONE) {
      if (this.navStatus !== "farming") {
        this.sendRpc("EquipItem", { itemName: "PetCARL", tier: 1 });  // never Woody
      }
      this.navStatus = "farming";
      // Press chop aimed at the pair midpoint (farm.angle). The pet auto-
      // targets everything in its hit cone, so BOTH the tree and stone get
      // hit from one aim — same mechanic the working auto-farm uses.
      this.attackAngle(farm.angle);
      // Edge onto the exact spot; lock (stop) once close OR once stuck.
      const SETTLE = 36;
      if (!this.navArrived) {
        if (distDesired <= SETTLE) {
          this.navArrived = true; this._farmStuck = 0;
          this.sendInput({ up: 0, down: 0, left: 0, right: 0 });
        } else {
          // Stuck detector: if approaching makes no headway for ~1.2 s
          // (jammed against another bot or the resource), settle here.
          const lp = this._farmApproachPos;
          const moved = lp ? Math.hypot(me.x - lp.x, me.y - lp.y) : 99;
          this._farmStuck = (moved < 5) ? (this._farmStuck || 0) + 1 : 0;
          this._farmApproachPos = { x: me.x, y: me.y };
          if (this._farmStuck >= 24) {
            this.navArrived = true; this._farmStuck = 0;
            this.sendInput({ up: 0, down: 0, left: 0, right: 0 });
          } else {
            this.moveToward(desired.x, desired.y);   // approach while swinging
          }
        }
      }
      this.navPath = null;
      return;
    }

    // ── Home arrival ──
    if (!desiredIsFarm && distDesired <= ARRIVE) {
      this.navArrived = false;
      this.navErrand = null;   // errand (if any) completed
      this.stopMoving(true);   // release keys + mouse
      this.navPath = null;
      this.navStatus = "home";
      if (this.navReturning && this.navIntent === "idle") this.navReturning = false;
      return;
    }
    this.navArrived = false;
    this._farmStuck = 0;   // fresh approach next time we reach the farm

    // ── Not at the desired location → decide whether to travel now ──
    const atHome = home && Math.hypot(home.x - me.x, home.y - me.y) <= ARRIVE;
    const atFarm = farm && Math.hypot(farm.x - me.x, farm.y - me.y) <= ARRIVE;
    const stranded = !atHome && !atFarm;        // mid-field → must reach safety
    const safeWindow = this._safeTravelWindow();

    if (!safeWindow && !stranded) {
      // Bad time to cross the map. If we're being recalled but we're still
      // standing at the farm, KEEP FARMING until the travel window opens
      // (per user spec) instead of standing idle — the farm spot is a safe
      // location, so we may as well keep gathering until we can leave.
      if (atFarm && farm) {
        this.attackAngle(farm.angle);
        this.navPath = null;
        this.navStatus = this.isNight() ? "farm-hold-night" : "farm-hold";
        return;
      }
      // Otherwise (waiting at base to head out) just wait.
      this.stopMoving(true);
      this.navPath = null;
      this.navStatus = this.isNight() ? "hold-night" : "hold-transition";
      return;
    }

    // ── (Re)plan toward the desired location ──
    const needPlan = !this.navPath || this.navIndex >= (this.navPath ? this.navPath.length : 0)
      || this.tick >= this.navReplanTick || this._navTargetMoved(desired);
    if (needPlan) {
      const path = findPath(this, { x: me.x, y: me.y }, { x: desired.x, y: desired.y });
      this.navReplanTick = this.tick + 30;   // ~1.5 s between replans
      this._navLastTarget = { x: desired.x, y: desired.y };
      if (!path || path.length === 0) {
        this.navStatus = "nopath";
        this.stopMoving();
        this.navPath = null;
        return;
      }
      // Destination check: only commit to a path that actually ENDS at the
      // place we want (farm or base). A pathfinder can return a truncated
      // path that stops short when the target is blocked — following it
      // blindly would march the bot to a random spot and abandon it there.
      // If the endpoint isn't near `desired`, refuse it and hold position
      // instead of drifting somewhere wrong.
      const end = path[path.length - 1];
      const endDist = Math.hypot(end.x - desired.x, end.y - desired.y);
      if (endDist > ARRIVE * 2) {
        this.navStatus = "nopath";
        this.stopMoving();
        this.navPath = null;
        return;
      }
      this.navPath = path;
      this.navIndex = 0;
    }

    // ── Follow the current waypoint ──
    let wp = this.navPath[this.navIndex];
    while (this.distanceTo(wp.x, wp.y) <= WP_REACH && this.navIndex < this.navPath.length - 1) {
      wp = this.navPath[++this.navIndex];
    }
    this.navStatus = desiredIsFarm ? "to-farm" : "returning";
    this.moveToward(wp.x, wp.y);
  }

  // True if the nav target moved far enough to warrant an early replan.
  _navTargetMoved(t) {
    const p = this._navLastTarget;
    return !p || Math.hypot(p.x - t.x, p.y - t.y) > 100;
  }

  // Track day/night phase transitions so we can gate travel. Called each
  // tick. Measures the day length so "close to night" can be estimated.
  _updateDayPhase() {
    const isDay = !!(this.dayCycle && this.dayCycle.isDay);
    if (isDay && !this._wasDay) this._dayStartTick = this.tick;       // day began
    if (!isDay && this._wasDay && this._dayStartTick != null) {
      this._dayLenTicks = Math.max(600, this.tick - this._dayStartTick); // measure day length
    }
    this._wasDay = isDay;
  }

  // Is it currently safe to CROSS THE MAP (travel between base and farm)?
  // Safe only in the middle of the day — not at night, not in the first
  // few seconds after dawn (zombies still clearing), not in the last few
  // seconds before dusk (so the bot is settled before night).
  _safeTravelWindow() {
    if (!this.dayCycle) return true;            // unknown → allow
    if (!this.dayCycle.isDay) return false;     // night → never travel
    if (this._dayStartTick == null) return true; // not measured yet → allow
    const into = this.tick - this._dayStartTick;
    const len  = this._dayLenTicks || 1300;     // ~65 s default day length
    const AFTER  = 120;   // ~6 s after dawn before going out
    const BEFORE = 200;   // ~10 s before dusk, head home / stop trips
    return into >= AFTER && into <= (len - BEFORE);
  }

  _tickAutoFarm() {
    if (!this.petActivated) {
      // PetCARL only while farming — never the miner pet ("Woody").
      this.sendRpc("EquipItem", { itemName: "PetCARL", tier: 1 });
    }

    // Release condition depends on what we're farming:
    //   - paired tree+stone target → wait for BOTH resources before
    //     releasing, otherwise the farm cycle finishes after the first
    //     resource drops and we never collect the second.
    //   - single target            → release on first resource (original).
    const wantBoth = !!this.farmTargetIsPair;
    const haveBoth = this.myPlayer.wood > 0 && this.myPlayer.stone > 0;
    const haveAny  = this.myPlayer.wood > 0 || this.myPlayer.stone > 0;
    if (wantBoth ? haveBoth : haveAny) {
      this._releaseFarm();
      return;
    }

    // Lazy-init farm-state. Blacklist persists across targets so a
    // tree we abandoned for being unreachable doesn't immediately
    // become "closest" again. Other fields are transient per-target.
    if (!this.farmBlacklist) this.farmBlacklist = new Map();

    // Periodic blacklist cleanup so dead entries don't pile up.
    if ((this.tick & 0x3F) === 0) {
      for (const [uid, expiry] of this.farmBlacklist) {
        if (expiry < this.tick) this.farmBlacklist.delete(uid);
      }
    }

    // Collect trees and stones in chase range, keyed by uid so we can
    // look up reach + blacklist later.
    const MAX_CHASE = 1500;
    const me = this.myPlayer.position;
    const trees = [], stones = [];
    for (const [uid, entity] of this.entities) {
      const t = entity.targetTick;
      if (!t.model || !t.position) continue;
      if (t.model !== "Tree" && t.model !== "Stone") continue;
      if ((this.farmBlacklist.get(uid) || 0) > this.tick) continue;
      const dx = t.position.x - me.x;
      const dy = t.position.y - me.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_CHASE) continue;
      const reach = uid <= 400 ? 120 : 96;
      const entry = { uid, t, dx, dy, dist, reach };
      if (t.model === "Tree") trees.push(entry);
      else stones.push(entry);
    }

    // Pair search — for each tree+stone, check if there's a single
    // standing position from which the pet can hit both. The pet sits
    // on the bot, so "hittable together" = the midpoint between tree
    // and stone falls within min(reach_t, reach_s) of each. Algebra:
    //   midpoint distance to either = dist(t, s) / 2
    //   feasible iff dist(t, s) / 2 ≤ min(reach_t, reach_s)
    // Equivalently dist(t, s) ≤ 2·min_reach. We bias toward pairs
    // close to the bot AND tight in spacing — a tight pair stays
    // hittable even if the pet wanders a few units off the midpoint.
    let bestPair = null, bestPairScore = Infinity;
    for (const tree of trees) {
      for (const stone of stones) {
        const dPair = Math.hypot(
          tree.t.position.x - stone.t.position.x,
          tree.t.position.y - stone.t.position.y,
        );
        const minReach = Math.min(tree.reach, stone.reach);
        if (dPair > minReach * 2) continue;
        const mx = (tree.t.position.x + stone.t.position.x) / 2;
        const my = (tree.t.position.y + stone.t.position.y) / 2;
        const dMid = Math.hypot(mx - me.x, my - me.y);
        // Score: walk distance to midpoint dominates; pair tightness
        // is a tiebreaker (a snug pair survives small position drift).
        const score = dMid + dPair * 0.5;
        if (score < bestPairScore) {
          bestPairScore = score;
          bestPair = {
            mx, my, dMid, dPair, minReach,
            tree, stone,
            // Synthetic id so target-switch detection compares stably.
            id: "p:" + tree.uid + ":" + stone.uid,
          };
        }
      }
    }

    // PAIR-ONLY targeting. The single fallback used to kick in when no
    // tree+stone pair was in range, but that meant farming sometimes
    // ended with only wood OR only stone. The user wants both per
    // cycle: if no viable pair exists right now, sit still and wait
    // for one to appear (zombies break stones / trees regrow).
    if (!bestPair) {
      this._stopFarmMovement();
      this.farmTargetId = null;
      this.farmTargetUids = null;
      this.farmTargetIsPair = false;
      return;
    }
    const dx = bestPair.mx - me.x;
    const dy = bestPair.my - me.y;
    const target = {
      x: bestPair.mx, y: bestPair.my,
      dx, dy, dist: bestPair.dMid,
      reach: bestPair.minReach,        // tightest of the two
      isPair: true,
      id:   bestPair.id,
      uids: [bestPair.tree.uid, bestPair.stone.uid],
    };

    // Reset transient stuck-state whenever target changes — the new
    // target might be reachable even if the old one wasn't.
    if (this.farmTargetId !== target.id) {
      this.farmTargetId      = target.id;
      this.farmTargetUid     = target.uids[0];   // for back-compat with observer
      this.farmTargetUids    = target.uids;
      this.farmTargetIsPair  = target.isPair;
      this.farmStuckTicks    = 0;
      this.farmStuckAttempts = 0;
      this.farmLastPos       = null;
      this.farmUnstickUntil  = 0;
      this.farmMoveHistory   = [];
    }

    const aim = Math.floor(((Math.atan2(target.dy, target.dx) * 180) / Math.PI + 450) % 360) || 0;
    this.farmLock = { x: target.x, y: target.y };

    if (target.dist <= target.reach) {
      // In reach — stop walking, press chop. The pet auto-targets
      // anything in its hit cone, so both halves of a pair get hit.
      this._stopFarmMovement();
      this.sendInput({ mouseDown: aim });
      return;
    }

    // Out of reach — walk toward target with stuck detection. We pass
    // a synthetic { t, dx, dy, uid } shape that _moveTowardFarm consumes;
    // for pairs, uid is the tree's (movement code only uses it for
    // blacklisting, and _onBlacklist below blacklists every uid in
    // this.farmTargetUids).
    this._moveTowardFarm({
      t: { position: { x: target.x, y: target.y } },
      dx: target.dx, dy: target.dy,
      uid: target.uids[0],
    });
  }

  // 8-direction movement toward a farm target — port of Banshee's
  // positionlock at zombsSessions.js:1273. Snap heading to 45 °
  // increments because zombs.io only takes orthogonal+diagonal inputs.
  //
  // Stuck recovery is layered:
  //   1. Position-delta observer  → fires after ~300 ms of no progress
  //   2. Sidestep cycle           → tries 45° / 90° / 135° offsets
  //   3. Map-edge override        → if pressed against the world boundary,
  //                                 retreat toward map center first
  //   4. Blacklist                → after all sidesteps fail, drop the
  //                                 target uid for 10 s and pick another
  _moveTowardFarm(best) {
    const me = this.myPlayer.position;

    // Wall-slide-aware stuck detection.
    //
    // The old per-tick `delta < 2` check missed a real failure mode:
    // zombs.io's collision allows the player to slide along walls,
    // so the bot's position keeps drifting (delta > 2) without
    // actually making any progress toward the target. The bot looks
    // alive but is going nowhere.
    //
    // Replacement: maintain a sliding window of the last N per-tick
    // (dx, dy) deltas, then project the cumulative window movement
    // onto the unit vector pointing at the target. Projection < 30
    // units over the 5-tick window (~250 ms) means we're either
    // standing still OR sliding tangentially along a wall — both
    // should fire recovery.
    //
    // Reference per-tick distances when moving freely:
    //   cardinal full speed   ≈ 25 units/tick → 5-tick = 125
    //   diagonal full speed   ≈ 18 units/tick → 5-tick =  90
    //   wall slide (parallel) ≈ 25 units/tick of useless motion → projection ≈ 0
    //   wall stop             ≈  0 units/tick                  → projection ≈ 0
    // So 30 is well below "useful diagonal" but well above "useless slide".
    if (!this.farmMoveHistory) this.farmMoveHistory = [];
    if (this.farmLastPos) {
      this.farmMoveHistory.push({
        dx: me.x - this.farmLastPos.x,
        dy: me.y - this.farmLastPos.y,
      });
      if (this.farmMoveHistory.length > 5) this.farmMoveHistory.shift();
    }
    this.farmLastPos = { x: me.x, y: me.y };

    // Only assess once the window is full — avoids false positives on
    // the very first ticks after a target switch (when farmLastPos was
    // null and we have no data yet).
    let projectedProgress = Infinity;
    let stuck = false;
    if (this.farmMoveHistory.length === 5) {
      let mx = 0, my = 0;
      for (const m of this.farmMoveHistory) { mx += m.dx; my += m.dy; }
      const td = Math.hypot(best.dx, best.dy) || 1;
      const tx = best.dx / td, ty = best.dy / td;
      projectedProgress = mx * tx + my * ty;
      // Surface to the dashboard observer so users can see why we
      // triggered recovery — useful for tuning the threshold.
      this.farmStuckTicks = projectedProgress < 30 ? 5 : 0;
      stuck = projectedProgress < 30;
    }

    // Map-edge detection — zombs.io's world is 0–24000 on both axes
    // (matches the syncNeeds bounding box we send in getSyncNeeds).
    // When the bot's stuck within EDGE_MARGIN of a boundary, the
    // sidestep directions ±90° often both lead back into the edge.
    // Short-circuit: walk toward map center regardless of target.
    const EDGE_MARGIN = 350;
    const MAP_SIZE = 24000;
    const nearEdge = me.x < EDGE_MARGIN || me.x > MAP_SIZE - EDGE_MARGIN ||
                     me.y < EDGE_MARGIN || me.y > MAP_SIZE - EDGE_MARGIN;

    // Fire a recovery if we're stuck (and not already mid-unstick).
    if (stuck && this.tick > this.farmUnstickUntil) {
      this.farmStuckAttempts++;

      // Hard limit — five sidestep attempts against the same target,
      // then give up and blacklist. Higher than before because we now
      // cycle through more offsets and edge-retreats. For pair
      // targets, blacklist BOTH the tree and the stone so the next
      // tick doesn't re-form the same unreachable pair.
      if (this.farmStuckAttempts >= 5) {
        const uids = this.farmTargetUids || [best.uid];
        for (const uid of uids) this.farmBlacklist.set(uid, this.tick + 200);
        this.farmTargetId = null;
        this.farmTargetUid = null;
        this.farmTargetUids = null;
        this.farmTargetIsPair = false;
        this.farmStuckAttempts = 0;
        this.farmStuckTicks = 0;
        this.farmMoveHistory = [];
        this._stopFarmMovement();
        return;
      }

      // Pick a recovery heading.
      const angleToTarget = Math.atan2(best.dy, best.dx);
      let recoveryAngleDeg;

      if (nearEdge) {
        // Override: walk straight toward map center. Disregard target
        // heading — first we have to get off the wall.
        const cx = MAP_SIZE / 2, cy = MAP_SIZE / 2;
        recoveryAngleDeg = (Math.atan2(cy - me.y, cx - me.x) * 180 / Math.PI + 450) % 360;
      } else {
        // Normal sidestep — cycle ±45°, ±90°, ±135° as we retry. The
        // ±45° is gentle (often clears a single corner); ±135° is a
        // near-reversal (helps when pinned between two trees).
        const OFFSETS = [45, 90, 135, 90, 45];
        const offsetDeg = OFFSETS[Math.min(this.farmStuckAttempts - 1, OFFSETS.length - 1)];
        const sign = Math.random() < 0.5 ? 1 : -1;
        const perp = angleToTarget + (sign * offsetDeg * Math.PI) / 180;
        recoveryAngleDeg = (perp * 180 / Math.PI + 450) % 360;
      }

      this.farmUnstickDir = (Math.round(recoveryAngleDeg / 45) * 45) % 360;
      this.farmUnstickUntil = this.tick + 8;
      this.farmStuckTicks = 0;
      // Reset the move-history window so the recovery's own movement
      // isn't immediately measured against the target direction (the
      // recovery walks tangentially, which would otherwise project to
      // ~0 progress and instantly re-fire).
      this.farmMoveHistory = [];
    }

    // Decide heading: unstick direction if active, else direct snap.
    let angleSnap;
    if (this.tick <= this.farmUnstickUntil) {
      angleSnap = this.farmUnstickDir;
    } else {
      const angleDeg = (Math.atan2(best.dy, best.dx) * 180 / Math.PI + 450) % 360;
      angleSnap = (Math.round(angleDeg / 45) * 45) % 360;
    }

    this._sendMoveDir(angleSnap);
    this.farmMoving = true;
  }

  // Maps a 45 °-snapped angle (0, 45, 90, ... 315) to up/down/left/right
  // key states. Same mapping Banshee uses in positionlock so the
  // 8-direction halo matches what we'd see from a human.
  _sendMoveDir(angle) {
    this.sendInput({
      up:    (angle === 0   || angle === 45  || angle === 315) ? 1 : 0,
      down:  (angle === 135 || angle === 180 || angle === 225) ? 1 : 0,
      right: (angle === 45  || angle === 90  || angle === 135) ? 1 : 0,
      left:  (angle === 225 || angle === 270 || angle === 315) ? 1 : 0,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Movement API — small, composable primitives so new behaviours can
  // be built without hand-rolling input packets or geometry. All angles
  // are degrees in the 0 = up (north), clockwise frame that _sendMoveDir
  // expects. Every method is a no-op-safe one-shot (call it each tick).
  // ──────────────────────────────────────────────────────────────────

  // Current world position, or null if not in-world yet.
  position() { return (this.myPlayer && this.myPlayer.position) || null; }

  // Straight-line distance from the bot to a world point (Infinity if
  // the bot isn't in-world).
  distanceTo(x, y) {
    const p = this.position();
    return p ? Math.hypot(x - p.x, y - p.y) : Infinity;
  }

  // True when within `tol` units of the point.
  atPoint(x, y, tol = 60) { return this.distanceTo(x, y) <= tol; }

  // Bearing from the bot to a world point (0 = up, clockwise degrees).
  angleTo(x, y) {
    const p = this.position();
    if (!p) return 0;
    return (Math.atan2(y - p.y, x - p.x) * 180 / Math.PI + 450) % 360;
  }

  // Walk one tick toward a compass direction (snapped to the 8-dir halo).
  moveAngle(deg) {
    const a = ((deg % 360) + 360) % 360;
    this._sendMoveDir((Math.round(a / 45) * 45) % 360);
  }

  // Walk one tick toward a world point. Returns the remaining distance so
  // callers can stop on arrival: `if (bot.moveToward(x,y) < 40) bot.stopMoving()`.
  moveToward(x, y) {
    this.moveAngle(this.angleTo(x, y));
    return this.distanceTo(x, y);
  }

  // Release the movement keys (and optionally the mouse button). Cheap to
  // call every tick — the engine ignores a no-change input.
  stopMoving(releaseMouse = false) {
    const input = { up: 0, down: 0, left: 0, right: 0 };
    if (releaseMouse) input.mouseUp = 1;
    this.sendInput(input);
  }

  // Hold the attack/use button aimed at a compass angle (mining, shooting).
  attackAngle(deg) { this.sendInput({ mouseDown: ((deg % 360) + 360) % 360 }); }
  // Hold attack aimed at a world point.
  attackToward(x, y) { this.attackAngle(this.angleTo(x, y)); }
  // Release the attack/use button.
  releaseAttack() { this.sendInput({ mouseUp: 1 }); }

  // Compute a path of world waypoints from the bot to a point (or null if
  // unreachable / not in-world). Thin wrapper over the windowed A* so
  // behaviours don't have to import the pathfinder themselves.
  pathTo(x, y) {
    const p = this.position();
    if (!p) return null;
    return findPath(this, { x: p.x, y: p.y }, { x, y });
  }

  // Only sends the release packet if we were actually moving — avoids
  // a useless input packet every tick when the bot is just sitting
  // chopping a tree in reach.
  _stopFarmMovement() {
    if (!this.farmMoving) return;
    this.sendInput({ up: 0, down: 0, left: 0, right: 0 });
    this.farmMoving = false;
    this.farmStuckTicks = 0;
    this.farmLastPos = null;
    this.farmMoveHistory = [];
  }

  // Full release path — fires after collecting resources OR when
  // autoFarm is toggled off mid-chop. Stops movement, releases mouse,
  // swaps PetCARL so the autonomous pet stops chopping.
  _releaseFarm() {
    this.hasFarmed = true;
    this.farmLock = null;
    this.sendInput({ up: 0, left: 0, down: 0, right: 0 });
    this.sendInput({ mouseUp: 1 });
    this.sendRpc("EquipItem", { itemName: "PetCARL", tier: 1 });
    this.farmReleaseTicks = 3;
    // Clear stuck-observer + target state — next farm cycle starts fresh.
    this.farmMoving = false;
    this.farmStuckTicks = 0;
    this.farmTargetId = null;
    this.farmTargetUid = null;
    this.farmTargetUids = null;
    this.farmTargetIsPair = false;
    this.farmLastPos = null;
    this.farmMoveHistory = [];
  }
}

Bot.STATE = STATE;
module.exports = { Bot, STATE };
