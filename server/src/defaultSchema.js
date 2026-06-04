// defaultSchema.js — Axiom's first-boot UI tree, seeded with alterale-derived
// features distilled into Axiom's `ctx`-script model. The editor can edit
// this freely after first boot — it lives in the DB after that.
//
// Scripts here are intentionally short. Most are direct ports of
// alterale's onCallback / offCallback patterns, but they go through
// the standardised `ctx.game.network.sendRpc(...)` path so we don't
// have to depend on any global helper from alterale.

const scr = (id, name, source) => ({ id, name, source });

const SCRIPTS = {
  // ── Combat ──
  // ─ Real port of alterale's autoAim (alterale.js:5968) ─
  scr_autoaim: scr("scr_autoaim", "Auto Aim",
    `const on = !!value;
ctx.storage.set('axiom.autoaim.on', on);
const game = ctx.game.game;
if (on) {
  if (!game?.network?.addPacketHandler) { ctx.toast('Auto Aim: attach first'); return; }
  // Install-guard lives on the live game object, NOT ctx.storage —
  // game.network is recreated on every page load, so a persisted flag
  // would wrongly say "already hooked" and the handler would be missing.
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.autoaim) {
    H.autoaim = true;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    game.network.addPacketHandler(0, () => {
      if (!ctx.storage.get('axiom.autoaim.on')) return;
      const mode = ctx.ui.getValue('combat-autoaim-mode') || 'player';
      const myPos = game.ui && game.ui.playerTick && game.ui.playerTick.position;
      const ents = game.world && game.world.entities;
      const renderer = game.world && game.world.renderer;
      if (!myPos || !ents || !renderer) return;
      const myPid = game.ui.playerPartyId;
      const myUid = game.world.myUid;
      // Same entity source autotrap/ahrc use: game.world.entities + targetTick.
      let best = null, bestD = Infinity;
      for (const e of ents.values()) {
        const t = e.targetTick; if (!t || !t.position) continue;
        let take = false;
        if (mode === 'player')      take = t.model === 'GamePlayer' && t.partyId !== myPid && !t.dead;
        else if (mode === 'zombie') take = t.entityClass === 'Npc' && t.model !== 'NeutralTier1';
        else if (mode === 'zomdem') take = t.entityClass === 'Npc';
        else                        take = t.uid !== myUid && !t.dead;
        if (!take) continue;
        const d = dist(myPos, t.position);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (!best) return;
      const screen = renderer.worldToScreen(best.position.x, best.position.y);
      game.inputManager.onMouseMoved({ clientX: screen.x, clientY: screen.y });
    });
  }
}
ctx.toast(on ? 'Auto Aim on' : 'Auto Aim off');`),

  // ─ Real port of alterale's playerTickUpdate auto-heal (alterale.js:5863) ─
  scr_autoheal: scr("scr_autoheal", "Auto Heal",
    `const on = !!value;
ctx.storage.set('axiom.autoheal.on', on);
const game = ctx.game.game;
if (on) {
  if (!game?.network?.addPacketHandler) { ctx.toast('Auto Heal: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.autoheal) {
    H.autoheal = true;
    let lastEquipAt = 0;
    game.network.addPacketHandler(0, () => {
      if (!ctx.storage.get('axiom.autoheal.on')) return;
      const p = game.ui && game.ui.playerTick; if (!p || !p.maxHealth) return;
      if (!(game.ui.inventory && game.ui.inventory.HealthPotion) && (p.gold || 0) >= 100) {
        game.network.sendRpc({ name: 'BuyItem', itemName: 'HealthPotion', tier: 1 });
      }
      const pct = (p.health / p.maxHealth) * 100;
      const thr = ctx.ui.getValue('combat-heal-threshold') || 30;
      const now = Date.now();
      if (pct <= thr && now - lastEquipAt > 400) {
        game.network.sendRpc({ name: 'EquipItem', itemName: 'HealthPotion', tier: 1 });
        lastEquipAt = now;
      }
    });
  }
}
ctx.toast(on ? 'Auto Heal armed' : 'Auto Heal disarmed');`),

  // ─ Real port of alterale's autoRespawn (alterale.js:6026) ─
  scr_autorespawn: scr("scr_autorespawn", "Auto Respawn",
    `const on = !!value;
ctx.storage.set('axiom.autorespawn.on', on);
const game = ctx.game.game;
if (on) {
  if (!game?.network?.addRpcHandler) { ctx.toast('Auto Respawn: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.autorespawn) {
    H.autorespawn = true;
    game.network.addRpcHandler('Dead', () => {
      if (!ctx.storage.get('axiom.autorespawn.on')) return;
      const btn = document.querySelector('#hud-respawn > div > div > div > button:nth-child(3)');
      if (btn) btn.click();
    });
  }
}
ctx.toast(on ? 'Auto Respawn on' : 'off');`),

  // ─ Real port of alterale's autoBow (alterale.js:5949) ─
  scr_autobow: scr("scr_autobow", "Auto Bow",
    `const on = !!value;
ctx.storage.set('axiom.autobow.on', on);
const game = ctx.game.game;
if (on) {
  if (!game?.network?.addPacketHandler) { ctx.toast('Auto Bow: attach first'); return; }
  if (game.ui && game.ui.inventory && game.ui.inventory.Bow) {
    game.network.sendRpc({ name: 'EquipItem', itemName: 'Bow', tier: game.ui.inventory.Bow.tier });
  } else if ((game.ui && game.ui.playerTick && game.ui.playerTick.gold || 0) > 100) {
    game.network.sendRpc({ name: 'BuyItem', itemName: 'Bow', tier: 1 });
  }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.autobow) {
    H.autobow = true;
    game.network.addPacketHandler(0, () => {
      if (!ctx.storage.get('axiom.autobow.on')) return;
      game.network.sendInput({ space: 0 });
      game.network.sendInput({ space: 1 });
    });
  }
}
ctx.toast(on ? 'Auto Bow on' : 'off');`),

  scr_chatspam: scr("scr_chatspam", "Chat Spam",
    `// Real port of alterale.js:5908 spam routine. If combat-spam-msg
// is empty, cycles through a random pool with garbage padding so
// the same message doesn't get caught by zombs.io's dedup filter.
// channel MUST be "Local" — anything else throws in codec.encode.
const on = !!value;
ctx.storage.set('chatspam', on);
const prev = ctx.storage.get('chatspamTimer');
if (prev) { clearInterval(prev); ctx.storage.set('chatspamTimer', null); }
if (!on) { ctx.toast('Chat Spam off'); return; }
const game = ctx.game.game;
if (!game?.network?.sendRpc) { ctx.toast('Chat Spam: attach first'); return; }
const fixed = (ctx.ui.getValue('combat-spam-msg') || '').toString();
const pool = ['hi','ez','?verify','gg','bing chilling','axiom on top'];
const garbage = () => Array.from({length: 4 + Math.random()*8|0},
  () => String.fromCharCode(0x2000 + (Math.random()*0xFE|0))).join('');
const clamp = (s) => s.length > 249 ? s.slice(0, 249) : s;
let failed = 0;
const timer = setInterval(() => {
  let msg;
  if (fixed) msg = clamp(garbage() + ' ' + fixed + ' ' + garbage());
  else msg = clamp(garbage() + ' ' + pool[Math.random()*pool.length|0] + ' ' + garbage());
  try {
    game.network.sendRpc({ name: 'SendChatMessage', channel: 'Local', message: msg });
  } catch (e) {
    failed++;
    if (failed === 1) ctx.toast('Chat Spam failed: ' + e.message);
  }
}, 1050);  // alterale uses 1050ms — matches server-side rate limit
ctx.storage.set('chatspamTimer', timer);
ctx.toast(fixed ? 'Chat Spam on (your text)' : 'Chat Spam on (random pool)');`),

  // ── Building ──
  // ─ Real port of alterale's AHRC (alterale.js:5260+) ─
  scr_ahrc: scr("scr_ahrc", "AHRC",
    `// Auto Harvester Resource Collector — feeds gold into your party's
// harvesters (so they keep producing) and collects the wood/stone they
// make. Ported from alterale's working AHRC (fields: wood/stone/
// harvestMax on the entity tick; deposit is a tiny GOLD top-up).
// mode: rc = refill+collect · r = refill only · c = collect only
const on = !!value;
ctx.storage.set('axiom.ahrc.on', on);
if (on) {
  const game = ctx.game.game;
  if (!game?.network?.addPacketHandler) { ctx.toast('AHRC: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.ahrc) {
  H.ahrc = true;
  const seeded  = new Set();   // harvesters we've kicked off with a seed deposit
  const working = new Set();   // harvesters confirmed producing
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.ahrc.on')) return;
    const mode = ctx.ui.getValue('build-ahrc-mode') || 'rc';
    const myPid = game.ui.playerPartyId;
    const myGold = (game.ui.playerTick && game.ui.playerTick.gold) || 0;
    const ents = game.world.entities;
    const iter = ents.values ? ents.values() : Object.values(ents);
    for (const e of iter) {
      const t = e.targetTick;
      if (!t || t.model !== 'Harvester' || t.partyId !== myPid) continue;
      const uid = e.uid;
      // Kick off each harvester once with a tiny seed deposit.
      if (!seeded.has(uid)) {
        if (myGold > 1) { seeded.add(uid); game.network.sendRpc({ name: 'AddDepositToHarvester', uid, deposit: 0.69 }); }
        continue;
      }
      // Confirm it's actually producing before we manage it.
      if ((t.wood || 0) !== 0 || (t.stone || 0) !== 0) working.add(uid);
      if (!working.has(uid)) continue;
      const tier = (e.fromTick && e.fromTick.tier) || t.tier || 1;
      const max  = t.harvestMax || Infinity;
      // Refill: top up gold so it keeps making resources.
      if (mode !== 'c' && ((t.stone || 0) < max || (t.wood || 0) < max)) {
        const amount = Math.max(0.05, tier * 0.05 - 0.02);
        game.network.sendRpc({ name: 'AddDepositToHarvester', uid, deposit: amount });
      }
      // Collect the produced wood/stone.
      if (mode !== 'r') game.network.sendRpc({ name: 'CollectHarvester', uid });
    }
  });
  }
}
ctx.toast(on ? 'AHRC ' + (ctx.ui.getValue('build-ahrc-mode')||'rc') : 'AHRC off');`),

  scr_autoupgrade: scr("scr_autoupgrade", "Auto Upgrader",
    `// Upgrades all your towers to max tier.
if (!value) return;
const buildings = Object.values(ctx.game.game?.ui?.buildings || {});
let n = 0;
for (const b of buildings) {
  if (b.tier < 8) {
    ctx.game.game.network.sendRpc({ name: 'UpgradeBuilding', uid: b.uid });
    n++;
  }
}
ctx.toast(\`upgrading \${n} buildings\`);`),

  scr_aulht: scr("scr_aulht", "Auto Upgrade Low HP",
    `// Real port — watches entity updates for buildings whose health drops
// below the threshold, then sends UpgradeBuilding to repair-by-upgrading.
const on = !!value;
ctx.storage.set('axiom.aulht.on', on);
if (on) {
  const game = ctx.game.game;
  if (!game?.network?.addPacketHandler) { ctx.toast('AULHT: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.aulht) {
  H.aulht = true;
  let cooldown = new Map();
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.aulht.on')) return;
    const buildings = Object.values(game.ui?.buildings || {});
    const thr = ctx.ui.getValue('build-aulht-threshold') || 40;   // %
    const now = Date.now();
    for (const b of buildings) {
      const e = game.world.entities.get(b.uid);
      const tt = e?.targetTick; if (!tt || !tt.health || !tt.maxHealth) continue;
      const pct = (tt.health / tt.maxHealth) * 100;
      if (pct > thr) continue;
      if ((cooldown.get(b.uid) || 0) > now) continue;
      game.network.sendRpc({ name: 'UpgradeBuilding', uid: b.uid });
      cooldown.set(b.uid, now + 500);  // don't spam
    }
  });
  }
}
ctx.toast(on ? 'AULHT armed' : 'AULHT off');`),

  scr_autobuild: scr("scr_autobuild", "Auto Builder",
    `// On toggle ON, snapshots every non-stash building's offset from
// the current GoldStash and persists it. Whenever a NEW stash appears
// thereafter, replays the snapshot via MakeBuilding RPCs.
//
// To re-snapshot: toggle off, place a new base, toggle on again.
const on = !!value;
ctx.storage.set('axiom.autobuild.on', on);
const game = ctx.game.game;
if (on) {
  if (!game?.network?.addRpcHandler) { ctx.toast('Auto Build: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.autobuild) {
  H.autobuild = true;
  let layout = JSON.parse(localStorage.getItem('axiom.autobuild.layout') || 'null');
  let lastStashUid = null;
  game.network.addRpcHandler('LocalBuilding', (data) => {
    if (!ctx.storage.get('axiom.autobuild.on')) return;
    for (const b of data.response || []) {
      if (b.type !== 'GoldStash' || b.dead) continue;
      if (b.uid === lastStashUid) continue;
      lastStashUid = b.uid;
      if (!layout) {
        // First stash this session — capture the current base.
        const all = Object.values(game.ui?.buildings || {})
          .filter(x => x.type !== 'GoldStash' && !x.dead);
        layout = all.map(x => ({ dx: x.x - b.x, dy: x.y - b.y, type: x.type }));
        localStorage.setItem('axiom.autobuild.layout', JSON.stringify(layout));
        ctx.toast('Auto Build: captured ' + layout.length + ' buildings');
      } else {
        // Replay onto the new stash.
        for (const s of layout) {
          game.network.sendRpc({
            name: 'MakeBuilding', type: s.type,
            x: b.x + s.dx, y: b.y + s.dy, yaw: 0,
          });
        }
        ctx.toast('Auto Build: replaying ' + layout.length + ' buildings');
      }
    }
  });
  }
} else {
  localStorage.removeItem('axiom.autobuild.layout');
}
ctx.toast(on ? 'Auto Build armed' : 'Auto Build off (layout cleared)');`),

  scr_wallblock: scr("scr_wallblock", "Wall Block",
    `// Place a ring of walls around your gold stash.
if (!value) return;
const stash = Object.values(ctx.game.game?.ui?.buildings || {}).find((b) => b.type === 'GoldStash');
if (!stash) return ctx.toast('place a stash first');
const radius = ctx.ui.getValue('build-wall-radius') || 3;
let placed = 0;
for (let dx = -radius; dx <= radius; dx++) {
  for (let dy = -radius; dy <= radius; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
    ctx.game.game.network.sendRpc({
      name: 'MakeBuilding', type: 'Wall',
      x: stash.x + dx * 48, y: stash.y + dy * 48, yaw: 0,
    });
    placed++;
  }
}
ctx.toast(\`placed \${placed} walls\`);`),

  scr_autotrap: scr("scr_autotrap", "Auto Trap",
    `// When an enemy player is within ~600 units, drop a SlowTrap on
// the midpoint between us and them. Cooldown 2 s to avoid spam.
const on = !!value;
ctx.storage.set('axiom.autotrap.on', on);
if (on) {
  const game = ctx.game.game;
  if (!game?.network?.addPacketHandler) { ctx.toast('Auto Trap: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.autotrap) {
  H.autotrap = true;
  let nextTrapAt = 0;
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.autotrap.on')) return;
    const me = game.ui?.playerTick;
    if (!me?.position) return;
    if (Date.now() < nextTrapAt) return;
    const myPid = game.ui.playerPartyId;
    let nearest = null, bestD = Infinity;
    for (const e of game.world.entities.values()) {
      const t = e.targetTick;
      if (!t || t.model !== 'GamePlayer' || t.dead || t.partyId === myPid) continue;
      const d = Math.hypot(t.position.x - me.position.x, t.position.y - me.position.y);
      if (d < bestD) { bestD = d; nearest = t; }
    }
    if (!nearest || bestD > 600) return;
    const mx = ((me.position.x + nearest.position.x) / 2) | 0;
    const my = ((me.position.y + nearest.position.y) / 2) | 0;
    game.network.sendRpc({ name: 'MakeBuilding', type: 'SlowTrap', x: mx, y: my, yaw: 0 });
    nextTrapAt = Date.now() + 2000;
  });
  }
}
ctx.toast(on ? 'Auto Trap armed' : 'Auto Trap off');`),

  scr_rebuild: scr("scr_rebuild", "Auto Rebuild",
    `// Real port of Banshee's autobuild rebuilder (zombsSessions.js:342).
// On stash placement, snapshots all current buildings relative to the
// stash. On any subsequent stash placement, replays MakeBuilding for
// each snapshot entry.
const on = !!value;
ctx.storage.set('axiom.rebuild.on', on);
if (on) {
  const game = ctx.game.game;
  if (!game?.network?.addRpcHandler) { ctx.toast('Rebuilder: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.rebuild) {
  H.rebuild = true;
  let snapshot = [];     // [{dx, dy, type, tier}]
  let lastStash = null;
  game.network.addRpcHandler('LocalBuilding', (data) => {
    if (!ctx.storage.get('axiom.rebuild.on')) return;
    for (const b of data.response || []) {
      if (b.type === 'GoldStash' && !b.dead) {
        if (lastStash) {
          // Replay snapshot relative to new stash.
          for (const s of snapshot) {
            game.network.sendRpc({
              name: 'MakeBuilding', type: s.type,
              x: b.x + s.dx, y: b.y + s.dy, yaw: 0,
            });
          }
        } else {
          // First stash this session — snapshot current buildings.
          const all = Object.values(game.ui?.buildings || {});
          snapshot = all
            .filter(x => x.type !== 'GoldStash' && !x.dead)
            .map(x => ({ dx: x.x - b.x, dy: x.y - b.y, type: x.type, tier: x.tier }));
          ctx.toast('Rebuilder: snapshotted ' + snapshot.length + ' buildings');
        }
        lastStash = b;
      }
    }
  });
  }
}
ctx.toast(on ? 'Rebuilder armed' : 'Rebuilder off');`),

  // ── Visuals ──
  // All visual scripts use PIXI.Graphics attached to game.world.renderer.ground.
  // They keep their PIXI objects in a global window.__axiomVis cache
  // keyed by feature+uid so toggling off can clean up cleanly without
  // tracking refs across script invocations.
  scr_aoeMap: scr("scr_aoeMap", "AOE Map",
    `// Draws a translucent range circle over every offensive tower.
const on = !!value;
ctx.storage.set('axiom.aoeMap.on', on);
const game = ctx.game.game;
window.__axiomVis = window.__axiomVis || {};
const cache = window.__axiomVis.aoe = window.__axiomVis.aoe || new Map();
const clear = () => {
  for (const g of cache.values()) {
    try { game.world.renderer.ground.removeAttachment(g); } catch {}
  }
  cache.clear();
};
if (!on) { clear(); ctx.toast('AOE map off'); return; }
if (!game?.world?.renderer?.ground || !window.PIXI) { ctx.toast('AOE map: attach first'); return; }
// Tower-name → AOE radius (zombs.io tower ranges, tier 1 baseline).
const RANGES = { Cannon: 360, Bomber: 280, Magic: 420, Slowdown: 300, Arrow: 380, Mortar: 600, Sniper: 700 };
const H = (game.__axiomHooks = game.__axiomHooks || {});
if (!H.aoeMap) {
  H.aoeMap = true;
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.aoeMap.on')) return;
    for (const e of game.world.entities.values()) {
      const t = e.targetTick;
      if (!t || !t.model || !t.position) continue;
      const r = RANGES[t.model]; if (!r) continue;
      if (cache.has(e.uid)) {
        const g = cache.get(e.uid);
        g.position.set(t.position.x, t.position.y);
        continue;
      }
      const g = new window.PIXI.Graphics();
      g.lineStyle(3, 0xffffff, 0.4);
      g.beginFill(0xffffff, 0.05); g.drawCircle(0, 0, r); g.endFill();
      g.position.set(t.position.x, t.position.y);
      cache.set(e.uid, g);
      try { game.world.renderer.ground.addAttachment(g); } catch {}
    }
    // Remove circles whose entity is gone.
    for (const uid of [...cache.keys()]) {
      if (!game.world.entities.has(uid)) {
        const g = cache.get(uid);
        try { game.world.renderer.ground.removeAttachment(g); } catch {}
        cache.delete(uid);
      }
    }
  });
}
ctx.toast('AOE map on');`),

  scr_stashIndicators: scr("scr_stashIndicators", "Stash Indicators",
    `// Draws the 3 canonical ranges around every visible GoldStash:
//   build limit (864 units), stash-spacing (2496), zombie spawn (~864).
// Numbers from alterale.js:6230.
const on = !!value;
ctx.storage.set('axiom.stashInd.on', on);
const game = ctx.game.game;
window.__axiomVis = window.__axiomVis || {};
const cache = window.__axiomVis.stash = window.__axiomVis.stash || new Map();
const clear = () => {
  for (const arr of cache.values())
    for (const g of arr) { try { game.world.renderer.ground.removeAttachment(g); } catch {} }
  cache.clear();
};
if (!on) { clear(); ctx.toast('Stash indicators off'); return; }
if (!game?.world?.renderer?.ground || !window.PIXI) { ctx.toast('Stash indicators: attach first'); return; }
const H = (game.__axiomHooks = game.__axiomHooks || {});
if (!H.stashInd) {
  H.stashInd = true;
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.stashInd.on')) return;
    for (const e of game.world.entities.values()) {
      const t = e.targetTick;
      if (!t || t.model !== 'GoldStash' || !t.position) continue;
      if (cache.has(e.uid)) {
        for (const g of cache.get(e.uid)) g.position.set(t.position.x, t.position.y);
        continue;
      }
      const arr = [];
      for (const [r, c] of [[864, 0xeeeeee], [2496, 0xff8866], [864, 0x88aaff]]) {
        const g = new window.PIXI.Graphics();
        g.lineStyle(2, c, 0.55);
        g.drawCircle(0, 0, r);
        g.position.set(t.position.x, t.position.y);
        arr.push(g);
        try { game.world.renderer.ground.addAttachment(g); } catch {}
      }
      cache.set(e.uid, arr);
    }
    for (const uid of [...cache.keys()]) {
      if (!game.world.entities.has(uid)) {
        for (const g of cache.get(uid)) { try { game.world.renderer.ground.removeAttachment(g); } catch {} }
        cache.delete(uid);
      }
    }
  });
}
ctx.toast('Stash indicators on');`),

  scr_obstacleInd: scr("scr_obstacleInd", "Obstacle Indicators",
    `// Outlines every Tree / Stone with their 48-px snap box so you can
// see the grid cells they occupy. Useful for routing buildings around
// nat-blockers (alterale.js:6274).
const on = !!value;
ctx.storage.set('axiom.obs.on', on);
const game = ctx.game.game;
window.__axiomVis = window.__axiomVis || {};
const cache = window.__axiomVis.obs = window.__axiomVis.obs || new Map();
const clear = () => {
  for (const g of cache.values()) { try { game.world.renderer.ground.removeAttachment(g); } catch {} }
  cache.clear();
};
if (!on) { clear(); ctx.toast('Obstacle indicators off'); return; }
if (!game?.world?.renderer?.ground || !window.PIXI) { ctx.toast('Obstacle indicators: attach first'); return; }
const H = (game.__axiomHooks = game.__axiomHooks || {});
if (!H.obs) {
  H.obs = true;
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.obs.on')) return;
    for (const e of game.world.entities.values()) {
      const t = e.targetTick;
      if (!t || !t.position) continue;
      if (t.model !== 'Tree' && t.model !== 'Stone') continue;
      if (cache.has(e.uid)) continue;
      const rad = t.model === 'Tree' ? 70 : 50;
      const minCx = Math.floor((t.position.x - rad) / 48);
      const maxCx = Math.floor((t.position.x + rad) / 48);
      const minCy = Math.floor((t.position.y - rad) / 48);
      const maxCy = Math.floor((t.position.y + rad) / 48);
      const w = (maxCx - minCx + 1) * 48;
      const h = (maxCy - minCy + 1) * 48;
      const cx = (minCx * 48 + (maxCx + 1) * 48) * 0.5;
      const cy = (minCy * 48 + (maxCy + 1) * 48) * 0.5;
      const g = new window.PIXI.Graphics();
      g.lineStyle(2, 0xff4444, 0.6); g.beginFill(0xff4444, 0.08);
      g.drawRect(-w/2, -h/2, w, h); g.endFill();
      g.position.set(cx, cy);
      cache.set(e.uid, g);
      try { game.world.renderer.ground.addAttachment(g); } catch {}
    }
    for (const uid of [...cache.keys()]) {
      if (!game.world.entities.has(uid)) {
        const g = cache.get(uid);
        try { game.world.renderer.ground.removeAttachment(g); } catch {}
        cache.delete(uid);
      }
    }
  });
}
ctx.toast('Obstacle indicators on');`),

  scr_buildingLife: scr("scr_buildingLife", "Building Lifetime",
    `// Renders a PIXI.Text label above every friendly building showing
// HP% / current tier. Updates on every entity tick.
const on = !!value;
ctx.storage.set('axiom.blife.on', on);
const game = ctx.game.game;
window.__axiomVis = window.__axiomVis || {};
const cache = window.__axiomVis.blife = window.__axiomVis.blife || new Map();
const clear = () => {
  for (const txt of cache.values()) { try { game.world.renderer.ground.removeAttachment(txt); } catch {} }
  cache.clear();
};
if (!on) { clear(); ctx.toast('Building lifetime off'); return; }
if (!game?.world?.renderer?.ground || !window.PIXI) { ctx.toast('Building lifetime: attach first'); return; }
const H = (game.__axiomHooks = game.__axiomHooks || {});
if (!H.blife) {
  H.blife = true;
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.blife.on')) return;
    const myPid = game.ui.playerPartyId;
    for (const e of game.world.entities.values()) {
      const t = e.targetTick;
      if (!t || !t.position || !t.health || !t.maxHealth) continue;
      if (t.partyId !== myPid) continue;        // only my own party's buildings
      if (t.entityClass !== 'Building') continue;
      const pct = ((t.health / t.maxHealth) * 100) | 0;
      const label = pct + '%  T' + (t.tier || 1);
      if (cache.has(e.uid)) {
        const txt = cache.get(e.uid);
        txt.text = label;
        txt.position.set(t.position.x, t.position.y - 40);
        continue;
      }
      const txt = new window.PIXI.Text(label, {
        fontFamily: 'Hammersmith One, monospace', fontSize: 14,
        fill: pct > 60 ? 0xffffff : pct > 30 ? 0xfcd34d : 0xf87171,
        stroke: 0x000000, strokeThickness: 3,
      });
      txt.anchor.set(0.5, 0.5);
      txt.position.set(t.position.x, t.position.y - 40);
      cache.set(e.uid, txt);
      try { game.world.renderer.ground.addAttachment(txt); } catch {}
    }
    for (const uid of [...cache.keys()]) {
      if (!game.world.entities.has(uid)) {
        const txt = cache.get(uid);
        try { game.world.renderer.ground.removeAttachment(txt); } catch {}
        cache.delete(uid);
      }
    }
  });
}
ctx.toast('Building lifetime on');`),

  scr_grouping: scr("scr_grouping", "Grouping Grid",
    `// Draws a 24-px snap grid (5x5 cells) following the mouse so you
// can visualize building alignment.
const on = !!value;
ctx.storage.set('axiom.grid.on', on);
const game = ctx.game.game;
window.__axiomVis = window.__axiomVis || {};
const slot = window.__axiomVis.grid = window.__axiomVis.grid || { graphic: null, handler: null };
const tearDown = () => {
  if (slot.graphic) { try { game.world.renderer.ground.removeAttachment(slot.graphic); } catch {} slot.graphic = null; }
  if (slot.handler) { document.removeEventListener('mousemove', slot.handler); slot.handler = null; }
};
if (!on) { tearDown(); ctx.toast('Grouping grid off'); return; }
if (!game?.world?.renderer?.ground || !window.PIXI) { ctx.toast('Grouping grid: attach first'); return; }
tearDown();
const g = new window.PIXI.Graphics();
g.lineStyle(1, 0xffffff, 0.35);
const cells = 5;
for (let i = -cells; i <= cells; i++) {
  g.moveTo(i * 24, -cells * 24); g.lineTo(i * 24, cells * 24);
  g.moveTo(-cells * 24, i * 24); g.lineTo(cells * 24, i * 24);
}
slot.graphic = g;
try { game.world.renderer.ground.addAttachment(g); } catch {}
slot.handler = (e) => {
  if (!game.world.renderer.screenToWorld) return;
  const w = game.world.renderer.screenToWorld(e.clientX, e.clientY);
  const sx = Math.round(w.x / 24) * 24;
  const sy = Math.round(w.y / 24) * 24;
  g.position.set(sx, sy);
};
document.addEventListener('mousemove', slot.handler);
ctx.toast('Grouping grid on');`),

  scr_bossAlert: scr("scr_bossAlert", "Boss Alert",
    `// Watches entity updates for NeutralTier* (demon-class npcs) and
// flashes a toast + plays a beep the first time one spawns each wave.
const on = !!value;
ctx.storage.set('axiom.bossAlert.on', on);
if (on) {
  const game = ctx.game.game;
  if (!game?.network?.addPacketHandler) { ctx.toast('Boss Alert: attach first'); return; }
  const H = (game.__axiomHooks = game.__axiomHooks || {});
  if (!H.bossAlert) {
  H.bossAlert = true;
  const seen = new Set();
  let lastWave = -1;
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.bossAlert.on')) return;
    const wave = game.ui?.playerTick?.wave;
    if (wave !== lastWave) { seen.clear(); lastWave = wave; }
    for (const e of game.world.entities.values()) {
      const m = e.targetTick?.model;
      if (!m || !m.startsWith('NeutralTier')) continue;
      if (seen.has(e.uid)) continue;
      seen.add(e.uid);
      ctx.toast('BOSS: ' + m + ' (wave ' + wave + ')');
      try {
        const ctxA = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctxA.createOscillator(); osc.type = 'square'; osc.frequency.value = 440;
        const g = ctxA.createGain(); g.gain.value = 0.15;
        osc.connect(g); g.connect(ctxA.destination);
        osc.start(); osc.stop(ctxA.currentTime + 0.18);
      } catch {}
    }
  });
  }
}
ctx.toast(on ? 'Boss Alert armed' : 'off');`),
  scr_optimizers: scr("scr_optimizers", "Optimizers",
    `// Real impl — hides PIXI overlays known to be cheap to disable.
const on = !!value;
ctx.storage.set('axiom.optimize.on', on);
const game = ctx.game.game;
if (game?.world?.renderer) {
  try {
    if (game.world.renderer.particles && game.world.renderer.particles.setVisible)
      game.world.renderer.particles.setVisible(!on);
    if (game.world.renderer.attachments && game.world.renderer.attachments.setVisible)
      game.world.renderer.attachments.setVisible(!on);
  } catch {}
}
ctx.toast(on ? 'optimizers on (particles+attachments off)' : 'optimizers off');`),

  // ── Multibox (server-side feature — these route through axiom-
  // sessions.js, not the modded client. Stubs for now until the
  // dashboard's session-spawn flow is exposed through ctx.) ──
  scr_movementCopy: scr("scr_movementCopy", "Movement Copy",
    `// Mirrors the input keys of the nearest party member. Every entity
// tick, compares their position delta to last tick — if they moved in
// a direction, we press that direction key.
const on = !!value;
ctx.storage.set('axiom.moveCopy.on', on);
const game = ctx.game.game;
if (!on) {
  // Release any held keys when turning off.
  try { game.network.sendInput({ up: 0, down: 0, left: 0, right: 0 }); } catch {}
  ctx.toast('Movement Copy off'); return;
}
if (!game?.network?.addPacketHandler) { ctx.toast('Movement Copy: attach first'); return; }
const H = (game.__axiomHooks = game.__axiomHooks || {});
if (!H.moveCopy) {
  H.moveCopy = true;
  let lastPos = null, lastTick = 0;
  const lastKeys = { up: 0, down: 0, left: 0, right: 0 };
  game.network.addPacketHandler(0, () => {
    if (!ctx.storage.get('axiom.moveCopy.on')) return;
    const me = game.ui?.playerTick;
    if (!me?.position) return;
    const myPid = game.ui.playerPartyId;
    let target = null, bestD = Infinity;
    for (const e of game.world.entities.values()) {
      const t = e.targetTick;
      if (!t || t.model !== 'GamePlayer' || t.uid === game.world.myUid) continue;
      if (t.partyId !== myPid || t.dead) continue;
      const d = Math.hypot(t.position.x - me.position.x, t.position.y - me.position.y);
      if (d < bestD) { bestD = d; target = t; }
    }
    if (!target) return;
    if (lastPos) {
      const dx = target.position.x - lastPos.x;
      const dy = target.position.y - lastPos.y;
      const out = {};
      if (dx > 4  && !lastKeys.right) { out.right = 1; lastKeys.right = 1; lastKeys.left  = 0; out.left = 0; }
      if (dx < -4 && !lastKeys.left)  { out.left  = 1; lastKeys.left  = 1; lastKeys.right = 0; out.right = 0; }
      if (dy > 4  && !lastKeys.down)  { out.down  = 1; lastKeys.down  = 1; lastKeys.up    = 0; out.up = 0; }
      if (dy < -4 && !lastKeys.up)    { out.up    = 1; lastKeys.up    = 1; lastKeys.down  = 0; out.down = 0; }
      if (Math.abs(dx) < 1) { if (lastKeys.right) { out.right = 0; lastKeys.right = 0; } if (lastKeys.left) { out.left = 0; lastKeys.left = 0; } }
      if (Math.abs(dy) < 1) { if (lastKeys.down)  { out.down  = 0; lastKeys.down  = 0; } if (lastKeys.up)   { out.up   = 0; lastKeys.up   = 0; } }
      if (Object.keys(out).length) game.network.sendInput(out);
    }
    lastPos = { x: target.position.x, y: target.position.y };
  });
}
ctx.toast('Movement Copy on (mirroring nearest party member)');`),

  scr_clones: scr("scr_clones", "Clones",
    `// Multi-action clones controller. Dispatched on controlId:
//   multi-clones-spawn       — spawn N clones with all current options
//   multi-clones-delete-all  — close every session matching the label prefix
//   multi-clones-status      — toast the current active-clone count
//
// Clones spawn through the same /api/auth/local-issued JWT the dashboard
// uses; the bot ID returned from {op:'created'} gets recorded in
// localStorage so "Delete all" only closes things we spawned.
const game = window.game;
const TOKEN_KEY = 'axiom.token';
const CLONES_KEY = 'axiom.clones.sids';

// Resolve a token (auto-fetch if missing — works on a cold /play boot).
const getToken = async () => {
  let t = localStorage.getItem(TOKEN_KEY);
  if (t) return t;
  try {
    const r = await fetch('/api/auth/local');
    if (!r.ok) return null;
    const j = await r.json();
    t = j.token; localStorage.setItem(TOKEN_KEY, t); return t;
  } catch { return null; }
};

// Helpers reading every panel control.
const getCtrl = (id) => window.AxiomPanel?.controlNodes?.get(id);
const val = (id) => {
  const n = getCtrl(id); if (!n) return undefined;
  const w = n.widget;
  if (n.ctrl.type === 'toggle') return w.classList.contains('on');
  return w.value;
};

const count       = +val('multi-clone-count') || 1;
const randomName  = !!val('multi-random-name');
const namePrefix  = (val('multi-name-prefix')  || 'Clone').slice(0, 24);
const labelPrefix = (val('multi-label-prefix') || 'Clone').slice(0, 26);
const joinParty   = !!val('multi-join-party');
const customPsk   = (val('multi-custom-psk') || '').slice(0, 20);
const mode        = val('multi-mode') || 'filler';
const serverOver  = (val('multi-server-override') || '').trim();
const stagger     = !!val('multi-stagger');

// Resolve server + PSK from the live game state (so each spawn fresh).
const currentServer = game?.options?.serverId || 'v5001';
const serverId = serverOver || currentServer;
const myPsk = game?.ui?.playerPartyShareKey || '';
const psk = joinParty ? myPsk : customPsk;

// Random-name table (29 chars max per zombs.io's display name cap).
const ADJ = ['Brave','Spry','Quiet','Wild','Sly','Bold','Lucky','Tame','Cool','Quick','Sharp','Lone'];
const ANIMAL = ['Otter','Fox','Hare','Wolf','Lynx','Hawk','Owl','Bear','Stag','Crow','Mole','Shrew'];
const randName = () => ADJ[Math.random()*ADJ.length|0] + ' ' + ANIMAL[Math.random()*ANIMAL.length|0];

// Behavior preset → setBehaviour calls to make after the clone enters world.
// Keys must match bot.behaviours in axiom-sessions/src/bot.js.
const MODE_PRESETS = {
  idle:     {},
  filler:   { autoHeal: true },
  farmer:   { autoFarm: true, autoHeal: true },
  defender: { autoaim: true,  autobow: true, autoHeal: true },
  custom:   {},
};
const preset = MODE_PRESETS[mode] || {};

// ── Action: status ──
if (controlId === 'multi-clones-status') {
  const sids = JSON.parse(localStorage.getItem(CLONES_KEY) || '[]');
  ctx.toast('Tracked clones: ' + sids.length + ' (server: ' + serverId + ')');
  return;
}

// ── Action: delete all ──
if (controlId === 'multi-clones-delete-all') {
  (async () => {
    const token = await getToken();
    if (!token) { ctx.toast('Delete all: no auth'); return; }
    const ws = new WebSocket('ws://' + location.hostname + ':8090');
    let closed = 0;
    ws.onopen = () => ws.send(JSON.stringify({ op: 'auth', args: { token } }));
    ws.onmessage = (ev) => {
      let f; try { f = JSON.parse(ev.data); } catch { return; }
      if (f.op === 'ready') {
        ws.send(JSON.stringify({ op: 'list' }));
      } else if (f.op === 'sessions') {
        const sessions = f.data || [];
        const tracked = new Set(JSON.parse(localStorage.getItem(CLONES_KEY) || '[]'));
        for (const s of sessions) {
          if (tracked.has(s.id) || (s.label || '').startsWith(labelPrefix)) {
            ws.send(JSON.stringify({ op: 'close', sid: s.id }));
            closed++;
          }
        }
        localStorage.setItem(CLONES_KEY, '[]');
        ctx.toast('Closed ' + closed + ' clone(s)');
        setTimeout(() => ws.close(), 800);
      }
    };
    ws.onerror = () => ctx.toast('Delete all: WS error');
  })();
  return;
}

// ── Action: spawn ──
if (controlId === 'multi-clones-spawn') {
  (async () => {
    const token = await getToken();
    if (!token) { ctx.toast('Spawn: no auth — visit /app first'); return; }
    if (joinParty && !myPsk) {
      ctx.toast('Spawn: \"Join my party\" is on but you have no PSK. Open a party first.');
      return;
    }
    const ws = new WebSocket('ws://' + location.hostname + ':8090');
    const spawnedIds = [];
    ws.onopen = () => ws.send(JSON.stringify({ op: 'auth', args: { token } }));
    ws.onmessage = (ev) => {
      let f; try { f = JSON.parse(ev.data); } catch { return; }
      if (f.op === 'ready') {
        // Send create requests — optionally staggered to avoid MBF rate limit.
        let i = 0;
        const sendOne = () => {
          if (i >= count) return;
          const n = i + 1;
          const name = randomName ? randName() : (namePrefix + ' ' + n);
          const label = labelPrefix + ' ' + n;
          ws.send(JSON.stringify({
            op: 'create',
            args: { label: label.slice(0, 30),
                    serverId,
                    playerName: name.slice(0, 29),
                    psk: psk.slice(0, 20) },
          }));
          i++;
          if (stagger) setTimeout(sendOne, 250); else sendOne();
        };
        sendOne();
      } else if (f.op === 'created') {
        spawnedIds.push(f.data.id);
        // Apply mode preset behaviors.
        for (const [key, value] of Object.entries(preset)) {
          ws.send(JSON.stringify({ op: 'setBehaviour', sid: f.data.id, args: { key, value } }));
        }
        // After we've heard back for all of them, persist + close.
        if (spawnedIds.length >= count) {
          const tracked = JSON.parse(localStorage.getItem(CLONES_KEY) || '[]');
          tracked.push(...spawnedIds);
          localStorage.setItem(CLONES_KEY, JSON.stringify(tracked));
          ctx.toast('Spawned ' + spawnedIds.length + ' clone(s) on ' + serverId +
                    (psk ? (joinParty ? ' (joining your party)' : ' (custom PSK)') : ' (no party)') +
                    ' · mode: ' + mode);
          setTimeout(() => ws.close(), 1200);
        }
      } else if (f.op === 'error') {
        ctx.toast('Spawn error: ' + (f.data?.reason || 'unknown'));
      }
    };
    ws.onerror = () => ctx.toast('Spawn: WS error');
  })();
  return;
}`),

  // ── Party ──
  scr_autoGiveSell: scr("scr_autoGiveSell", "Auto Give Sell",
    `if (!value) return;
const game = ctx.game.game;
// Party members come from game.ui.getPlayerPartyMembers() — the same
// accessor the client's own party UI uses. Each member has .playerUid
// and .canSell (1 = already allowed). There is no game.ui.parties[].members.
const members = (game && game.ui && game.ui.getPlayerPartyMembers)
  ? (game.ui.getPlayerPartyMembers() || []) : null;
if (!members) { ctx.toast('Give Sell: attach to a session first'); return; }
const myUid = game.world && game.world.myUid;
const targets = members.filter((m) => m && m.playerUid !== myUid && m.canSell !== 1);
if (!targets.length) { ctx.toast('Give Sell: nobody to grant'); return; }
// The server only registers ONE SetPartyMemberCanSell per network flush,
// so a synchronous loop granted just the first member. Stagger the RPCs
// ~180 ms apart so every member is granted.
let i = 0;
const grantNext = () => {
  if (i >= targets.length) {
    ctx.toast('granted sell perms to ' + targets.length + ' member' + (targets.length === 1 ? '' : 's'));
    return;
  }
  const m = targets[i++];
  try { game.network.sendRpc({ name: 'SetPartyMemberCanSell', uid: m.playerUid, canSell: 1 }); } catch {}
  setTimeout(grantNext, 180);
};
grantNext();`),

  // ── Smart Farm Setup ──
  // Click a tree, then a nearby stone. Every bot in your party is sent to
  // farm that pair, fanned out (server-side assignFarmSlots) so each can
  // reach both. Picks are screen→world via the renderer; the party session
  // list comes from the live fleet; commands go over a short-lived
  // sessions WS (same channel the clones tool uses).
  scr_smartFarm: scr("scr_smartFarm", "Smart Farm Setup",
    `const game = ctx.game.game;
const rend = game && game.world && game.world.renderer;
if (!rend || !rend.screenToWorld) { ctx.toast('Smart Farm: load the world first'); return; }
const SF = (window.__axiomSmartFarm = window.__axiomSmartFarm || {});
if (SF.cleanup) { SF.cleanup(); SF.cleanup = null; }   // re-arm cleanly
SF.picks = [];

const nearest = (wx, wy, model) => {
  let best = null, bestD = Infinity;
  for (const e of game.world.entities.values()) {
    const t = e.targetTick;
    if (!t || t.model !== model || !t.position) continue;
    const d = Math.hypot(t.position.x - wx, t.position.y - wy);
    if (d < bestD) { bestD = d; best = t.position; }
  }
  return (best && bestD < 700) ? { x: best.x, y: best.y } : null;
};

// Predetermined, distinct standing spots so EVERY bot can reach BOTH the
// tree and the stone (not split between them). We ring the bots around the
// pair's midpoint and aim each one at the centre, so its swing sweeps the
// whole cluster. The radius is the largest that still keeps both resources
// in reach from every ring position, but never so small the bots overlap.
function computeSpots(tree, stone, n) {
  const mx = (tree.x + stone.x) / 2, my = (tree.y + stone.y) / 2;
  const sep = Math.hypot(tree.x - stone.x, tree.y - stone.y);  // tree↔stone gap
  const REACH = 150;                          // ~harvest reach from a spot
  const spacingR = Math.max(34, 9 * n);       // keep adjacent bots ~1 body apart
  const reachR = Math.max(34, REACH - sep / 2);  // stay in range of the FAR resource
  // Prefer the spacing radius, but never exceed what keeps both in reach.
  const R = Math.min(reachR, Math.max(spacingR, 42));
  const spots = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;   // first slot = north
    const sx = Math.round(mx + Math.cos(a) * R);
    const sy = Math.round(my + Math.sin(a) * R);
    // Aim back at the centre so the swing covers both resources.
    const aim = Math.round((Math.atan2(my - sy, mx - sx) * 180 / Math.PI + 450) % 360);
    spots[i] = { x: sx, y: sy, angle: aim };
  }
  return spots;
}

function apply(tree, stone) {
  const pid = game.ui && game.ui.playerPartyId;
  const all = window.__axiomFleet || [];
  const fleet = all.filter((b) => b.partyId === pid);
  const ids = (fleet.length ? fleet : all).map((b) => b.id).sort((a, b) => a - b);
  if (!ids.length) { ctx.toast('Smart Farm: no party sessions found'); return; }
  const spots = computeSpots(tree, stone, ids.length);     // one distinct spot per bot
  const token = localStorage.getItem('axiom.token');
  let ws; try { ws = new WebSocket('ws://' + location.hostname + ':8090'); } catch { ctx.toast('Smart Farm: WS failed'); return; }
  ws.onopen = () => ws.send(JSON.stringify({ op: 'auth', args: { token } }));
  ws.onmessage = (m) => {
    let f; try { f = JSON.parse(m.data); } catch { return; }
    if (f.op === 'ready') {
      ids.forEach((id, idx) => {
        const s = spots[idx];
        ws.send(JSON.stringify({ op: 'setFarmSpot', sid: id, args: { x: s.x, y: s.y, angle: s.angle, fixed: true } }));
        ws.send(JSON.stringify({ op: 'setNav', sid: id, args: { on: true, returnToBase: true } }));
      });
      ctx.toast('Smart Farm: ' + ids.length + ' bot(s) assigned to tree + stone');
      setTimeout(() => { try { ws.close(); } catch {} }, 700);
    }
  };
  ws.onerror = () => ctx.toast('Smart Farm: sessions WS error');
}

const onDown = (e) => {
  if (e.target && e.target.closest && e.target.closest('.ax-panel')) return;  // ignore panel clicks
  e.preventDefault(); e.stopPropagation();
  const w = rend.screenToWorld(e.clientX, e.clientY);
  if (!w) return;
  if (SF.picks.length === 0) {
    const tree = nearest(w.x, w.y, 'Tree');
    if (!tree) { ctx.toast('No tree near that click — try again'); return; }
    SF.picks.push(tree); ctx.toast('Tree set ✓ — now click the STONE');
  } else {
    const stone = nearest(w.x, w.y, 'Stone');
    if (!stone) { ctx.toast('No stone near that click — try again'); return; }
    SF.picks.push(stone);
    if (SF.cleanup) { SF.cleanup(); SF.cleanup = null; }
    apply(SF.picks[0], SF.picks[1]);
  }
};
window.addEventListener('mousedown', onDown, true);
SF.cleanup = () => window.removeEventListener('mousedown', onDown, true);
if (ctx.toast) ctx.toast('Smart Farm: click the TREE (then the stone)…');`),

  // ── Base Saver ──
  // One script dispatches every BaseSaver action via controlId so all
  // controls share state (the saved bases + pins) without recompiling
  // logic across multiple scripts. Bases persist in localStorage at
  // axiom.baseSaver.data; pins at axiom.baseSaver.pins.
  //
  // Overlay preview uses PIXI.Graphics rectangles attached to
  // game.world.renderer.ground — left-click anywhere on the HUD to commit
  // the ghosted layout via MakeBuilding RPCs; right-click cancels.
  // Prebuilt "Plus Base" — a fixed layout placed relative to the
  // GoldStash. Offsets are ADDED to the stash position (gs.x + dx),
  // matching the source design's coordinate convention. Fires one
  // MakeBuilding RPC per building.
  scr_buildPlusBase: scr("scr_buildPlusBase", "Build Plus Base",
    `if (!value) return;
const game = window.game;
const gs = Object.values(game?.ui?.buildings || {}).find((b) => b.type === 'GoldStash');
if (!gs) { ctx.toast('Build Plus Base: place a GoldStash first'); return; }
const data = JSON.parse('{"31464096":{"x":-72,"y":-120,"type":"Door"},"31464097":{"x":-24,"y":-120,"type":"Door"},"31464098":{"x":-24,"y":-72,"type":"Door"},"31464099":{"x":-72,"y":-72,"type":"Door"},"31464100":{"x":72,"y":-72,"type":"Door"},"31464101":{"x":120,"y":-72,"type":"Door"},"31464102":{"x":120,"y":-24,"type":"Door"},"31464103":{"x":72,"y":-24,"type":"Door"},"31464104":{"x":24,"y":72,"type":"Door"},"31464105":{"x":72,"y":72,"type":"Door"},"31464106":{"x":72,"y":120,"type":"Door"},"31464107":{"x":24,"y":120,"type":"Door"},"31464108":{"x":-120,"y":24,"type":"Door"},"31464109":{"x":-72,"y":24,"type":"Door"},"31464110":{"x":-72,"y":72,"type":"Door"},"31464111":{"x":-120,"y":72,"type":"Door"},"31464112":{"x":-120,"y":-24,"type":"SlowTrap"},"31464113":{"x":-72,"y":-24,"type":"SlowTrap"},"31464114":{"x":24,"y":-120,"type":"SlowTrap"},"31464115":{"x":24,"y":-72,"type":"SlowTrap"},"31464116":{"x":72,"y":24,"type":"SlowTrap"},"31464117":{"x":120,"y":24,"type":"SlowTrap"},"31464118":{"x":-24,"y":72,"type":"SlowTrap"},"31464119":{"x":-24,"y":120,"type":"SlowTrap"},"31464120":{"x":-144,"y":-96,"type":"GoldMine"},"31464121":{"x":-96,"y":-192,"type":"GoldMine"},"31464122":{"x":96,"y":-144,"type":"GoldMine"},"31464123":{"x":192,"y":-96,"type":"GoldMine"},"31464124":{"x":144,"y":96,"type":"GoldMine"},"31464126":{"x":-96,"y":144,"type":"GoldMine"},"31464127":{"x":-192,"y":96,"type":"GoldMine"},"31464128":{"x":192,"y":192,"type":"GoldMine"},"31464129":{"x":0,"y":-192,"type":"Harvester"},"31464130":{"x":-192,"y":0,"type":"Harvester"},"31464132":{"x":0,"y":192,"type":"Harvester"},"31464133":{"x":-192,"y":192,"type":"BombTower"},"31464134":{"x":-96,"y":240,"type":"BombTower"},"31464136":{"x":-192,"y":288,"type":"BombTower"},"31464776":{"x":-288,"y":144,"type":"ArrowTower"},"31464800":{"x":-336,"y":240,"type":"ArrowTower"},"31464825":{"x":-384,"y":144,"type":"CannonTower"},"31464837":{"x":-432,"y":240,"type":"CannonTower"},"31464917":{"x":-336,"y":48,"type":"CannonTower"},"31464930":{"x":-432,"y":48,"type":"CannonTower"},"31464946":{"x":-264,"y":24,"type":"Wall"},"31464953":{"x":-264,"y":72,"type":"Wall"},"31464980":{"x":-528,"y":48,"type":"MagicTower"},"31464993":{"x":-480,"y":144,"type":"MagicTower"},"31464998":{"x":-528,"y":240,"type":"MagicTower"},"31465007":{"x":-600,"y":24,"type":"Wall"},"31465014":{"x":-648,"y":24,"type":"Door"},"31465019":{"x":-600,"y":72,"type":"Door"},"31465022":{"x":-552,"y":120,"type":"Door"},"31465025":{"x":-552,"y":168,"type":"Door"},"31465049":{"x":-600,"y":216,"type":"SlowTrap"},"31465052":{"x":-648,"y":264,"type":"SlowTrap"},"31465060":{"x":-600,"y":264,"type":"Wall"},"31465080":{"x":-576,"y":-48,"type":"Harvester"},"31465081":{"x":-648,"y":-72,"type":"Door"},"31465082":{"x":-600,"y":-120,"type":"Door"},"31465083":{"x":-648,"y":-24,"type":"SlowTrap"},"31465084":{"x":-504,"y":-24,"type":"SlowTrap"},"31465085":{"x":-456,"y":-24,"type":"SlowTrap"},"31465086":{"x":-408,"y":-24,"type":"SlowTrap"},"31465087":{"x":-360,"y":-24,"type":"SlowTrap"},"31465088":{"x":-312,"y":-24,"type":"SlowTrap"},"31465089":{"x":-264,"y":-24,"type":"SlowTrap"},"31465090":{"x":-552,"y":-120,"type":"Wall"},"31465091":{"x":-552,"y":-168,"type":"Door"},"31465092":{"x":-552,"y":-216,"type":"Door"},"31465093":{"x":-480,"y":-96,"type":"MagicTower"},"31465094":{"x":-480,"y":-192,"type":"MagicTower"},"31465095":{"x":-384,"y":-192,"type":"CannonTower"},"31465096":{"x":-384,"y":-96,"type":"CannonTower"},"31465097":{"x":-288,"y":-192,"type":"ArrowTower"},"31465098":{"x":-288,"y":-96,"type":"ArrowTower"},"31465099":{"x":-192,"y":-192,"type":"ArrowTower"},"31465100":{"x":-216,"y":-120,"type":"Wall"},"31465101":{"x":-216,"y":-72,"type":"Wall"},"31465102":{"x":-600,"y":-264,"type":"Door"},"31465103":{"x":-600,"y":-312,"type":"Door"},"31465104":{"x":-648,"y":-360,"type":"Door"},"31465105":{"x":-648,"y":-408,"type":"Door"},"31465106":{"x":-528,"y":-288,"type":"MagicTower"},"31465107":{"x":-528,"y":-384,"type":"ArrowTower"},"31465108":{"x":-600,"y":-408,"type":"Wall"},"31465109":{"x":-600,"y":-360,"type":"Wall"},"31465110":{"x":-552,"y":-456,"type":"Wall"},"31465111":{"x":-504,"y":-456,"type":"Wall"},"31465112":{"x":-504,"y":-504,"type":"Wall"},"31465113":{"x":-456,"y":-552,"type":"Wall"},"31465114":{"x":-408,"y":-552,"type":"Wall"},"31465115":{"x":-408,"y":-600,"type":"Wall"},"31465116":{"x":-360,"y":-648,"type":"Wall"},"31465117":{"x":-312,"y":-648,"type":"Wall"},"31465118":{"x":-336,"y":-576,"type":"ArrowTower"},"31465119":{"x":-336,"y":-480,"type":"CannonTower"},"31465120":{"x":-432,"y":-384,"type":"CannonTower"},"31465121":{"x":-432,"y":-288,"type":"CannonTower"},"31465122":{"x":-240,"y":-480,"type":"CannonTower"},"31465123":{"x":-144,"y":-432,"type":"CannonTower"},"31465124":{"x":-48,"y":-384,"type":"CannonTower"},"31465125":{"x":-240,"y":-576,"type":"MagicTower"},"31465126":{"x":-144,"y":-528,"type":"MagicTower"},"31465127":{"x":-48,"y":-480,"type":"MagicTower"},"31465128":{"x":-240,"y":-384,"type":"ArrowTower"},"31465129":{"x":-144,"y":-336,"type":"ArrowTower"},"31465130":{"x":-48,"y":-288,"type":"ArrowTower"},"31465131":{"x":-120,"y":-264,"type":"Wall"},"31465132":{"x":-168,"y":-264,"type":"Wall"},"31465133":{"x":-432,"y":-480,"type":"BombTower"},"31465134":{"x":-336,"y":-384,"type":"BombTower"},"31465136":{"x":-240,"y":-288,"type":"BombTower"},"31465137":{"x":-336,"y":-288,"type":"ArrowTower"},"31465138":{"x":-312,"y":-696,"type":"Door"},"31465139":{"x":-360,"y":-696,"type":"Door"},"31465140":{"x":-408,"y":-648,"type":"Door"},"31465141":{"x":-456,"y":-600,"type":"Door"},"31465142":{"x":-504,"y":-552,"type":"Door"},"31465143":{"x":-552,"y":-504,"type":"Door"},"31465144":{"x":-600,"y":-456,"type":"Door"},"31465145":{"x":-264,"y":-648,"type":"Door"},"31465146":{"x":-216,"y":-648,"type":"Door"},"31465147":{"x":-168,"y":-600,"type":"Door"},"31465148":{"x":-120,"y":-600,"type":"Door"},"31465152":{"x":-72,"y":-600,"type":"Door"},"31465153":{"x":-24,"y":-648,"type":"Door"},"31465154":{"x":-72,"y":-552,"type":"Wall"},"31465155":{"x":0,"y":-576,"type":"Harvester"},"31465156":{"x":24,"y":-648,"type":"SlowTrap"},"31465157":{"x":72,"y":-600,"type":"Wall"},"31465158":{"x":72,"y":-648,"type":"Door"},"31465159":{"x":120,"y":-600,"type":"Door"},"31465160":{"x":96,"y":-528,"type":"MagicTower"},"31465161":{"x":192,"y":-480,"type":"MagicTower"},"31465162":{"x":288,"y":-528,"type":"MagicTower"},"31465163":{"x":384,"y":-576,"type":"MagicTower"},"31465164":{"x":168,"y":-552,"type":"Door"},"31465165":{"x":216,"y":-552,"type":"Door"},"31465166":{"x":312,"y":-600,"type":"Wall"},"31465167":{"x":360,"y":-648,"type":"Wall"},"31465168":{"x":408,"y":-648,"type":"Wall"},"31465170":{"x":264,"y":-600,"type":"Door"},"31465171":{"x":312,"y":-648,"type":"Door"},"31465172":{"x":360,"y":-696,"type":"Door"},"31465173":{"x":408,"y":-696,"type":"Door"},"31465174":{"x":456,"y":-648,"type":"Door"},"31466967":{"x":504,"y":-648,"type":"Door"},"31467041":{"x":552,"y":-600,"type":"Door"},"31467357":{"x":600,"y":-552,"type":"Door"},"31467376":{"x":648,"y":-504,"type":"Door"},"31467398":{"x":456,"y":-600,"type":"Wall"},"31467400":{"x":504,"y":-600,"type":"Wall"},"31467423":{"x":96,"y":-432,"type":"CannonTower"},"31467424":{"x":192,"y":-384,"type":"CannonTower"},"31467425":{"x":288,"y":-432,"type":"CannonTower"},"31467426":{"x":384,"y":-480,"type":"CannonTower"},"31467427":{"x":480,"y":-528,"type":"CannonTower"},"31467428":{"x":552,"y":-552,"type":"Wall"},"31467429":{"x":552,"y":-504,"type":"Wall"},"31467430":{"x":600,"y":-504,"type":"Wall"},"31467431":{"x":576,"y":-432,"type":"MeleeTower"},"31467432":{"x":576,"y":-336,"type":"MeleeTower"},"31467433":{"x":576,"y":-240,"type":"MeleeTower"},"31467435":{"x":648,"y":-360,"type":"Wall"},"31467436":{"x":648,"y":-312,"type":"Wall"},"31467437":{"x":648,"y":-264,"type":"Wall"},"31467438":{"x":648,"y":-216,"type":"Wall"},"31467439":{"x":696,"y":-312,"type":"Wall"},"31467440":{"x":696,"y":-264,"type":"Wall"},"31467444":{"x":648,"y":-408,"type":"Door"},"31467454":{"x":696,"y":-360,"type":"Door"},"31467487":{"x":744,"y":-312,"type":"Door"},"31467488":{"x":744,"y":-264,"type":"Door"},"31467530":{"x":696,"y":-216,"type":"Door"},"31467531":{"x":648,"y":-168,"type":"Door"},"31467532":{"x":648,"y":-456,"type":"Door"},"31467533":{"x":600,"y":-168,"type":"Wall"},"31467534":{"x":600,"y":-120,"type":"Door"},"31467535":{"x":600,"y":-72,"type":"Door"},"31467536":{"x":648,"y":-24,"type":"Door"},"31467537":{"x":552,"y":-72,"type":"Wall"},"31467538":{"x":576,"y":0,"type":"Harvester"},"31467539":{"x":600,"y":72,"type":"Wall"},"31467540":{"x":648,"y":72,"type":"Door"},"31467541":{"x":600,"y":120,"type":"Door"},"31467542":{"x":648,"y":24,"type":"SlowTrap"},"31467543":{"x":552,"y":168,"type":"Wall"},"31467544":{"x":600,"y":168,"type":"Door"},"31467545":{"x":600,"y":216,"type":"Door"},"31467546":{"x":552,"y":216,"type":"Door"},"31467547":{"x":528,"y":96,"type":"MagicTower"},"31467548":{"x":480,"y":192,"type":"MagicTower"},"31467549":{"x":528,"y":-144,"type":"MagicTower"},"31467550":{"x":480,"y":-48,"type":"MagicTower"},"31467551":{"x":504,"y":24,"type":"SlowTrap"},"31467552":{"x":456,"y":24,"type":"SlowTrap"},"31467553":{"x":408,"y":24,"type":"SlowTrap"},"31467554":{"x":360,"y":24,"type":"SlowTrap"},"31467555":{"x":312,"y":24,"type":"SlowTrap"},"31467557":{"x":192,"y":0,"type":"Harvester"},"31467558":{"x":264,"y":24,"type":"SlowTrap"},"31467559":{"x":432,"y":-144,"type":"CannonTower"},"31467560":{"x":384,"y":-48,"type":"CannonTower"},"31467561":{"x":336,"y":-144,"type":"ArrowTower"},"31467564":{"x":288,"y":-48,"type":"BombTower"},"31467565":{"x":264,"y":-168,"type":"Wall"},"31467566":{"x":264,"y":-120,"type":"Wall"},"31467567":{"x":192,"y":-288,"type":"ArrowTower"},"31467568":{"x":96,"y":-336,"type":"ArrowTower"},"31467569":{"x":96,"y":-240,"type":"ArrowTower"},"31467570":{"x":192,"y":-192,"type":"BombTower"},"31467571":{"x":288,"y":-336,"type":"BombTower"},"31467572":{"x":384,"y":-384,"type":"BombTower"},"31467573":{"x":288,"y":-240,"type":"BombTower"},"31467574":{"x":384,"y":-240,"type":"BombTower"},"31467575":{"x":480,"y":-240,"type":"BombTower"},"31467576":{"x":360,"y":-312,"type":"Wall"},"31467577":{"x":408,"y":-312,"type":"Wall"},"31467578":{"x":480,"y":-432,"type":"ArrowTower"},"31467579":{"x":480,"y":-336,"type":"ArrowTower"},"31467580":{"x":24,"y":-504,"type":"SlowTrap"},"31467581":{"x":24,"y":-456,"type":"SlowTrap"},"31467582":{"x":24,"y":-408,"type":"SlowTrap"},"31467583":{"x":24,"y":-360,"type":"SlowTrap"},"31467584":{"x":24,"y":-312,"type":"SlowTrap"},"31467585":{"x":24,"y":-264,"type":"SlowTrap"},"31467586":{"x":432,"y":96,"type":"CannonTower"},"31467587":{"x":384,"y":192,"type":"CannonTower"},"31467588":{"x":336,"y":96,"type":"ArrowTower"},"31467589":{"x":240,"y":96,"type":"BombTower"},"31467590":{"x":288,"y":192,"type":"BombTower"},"31467591":{"x":72,"y":168,"type":"Door"},"31467592":{"x":120,"y":168,"type":"Door"},"31467593":{"x":120,"y":216,"type":"Door"},"31467594":{"x":72,"y":216,"type":"Door"},"31467595":{"x":120,"y":264,"type":"Door"},"31467596":{"x":168,"y":264,"type":"Door"},"31467597":{"x":216,"y":264,"type":"Door"},"31467598":{"x":264,"y":264,"type":"Door"},"31467599":{"x":264,"y":312,"type":"Door"},"31467600":{"x":312,"y":264,"type":"Wall"},"31467601":{"x":360,"y":264,"type":"Wall"},"31467602":{"x":360,"y":312,"type":"Wall"},"31467603":{"x":312,"y":312,"type":"Door"},"31467605":{"x":216,"y":312,"type":"Wall"},"31467892":{"x":432,"y":288,"type":"BombTower"},"31468056":{"x":528,"y":288,"type":"MagicTower"},"31468462":{"x":600,"y":264,"type":"Door"},"31468615":{"x":648,"y":264,"type":"Door"},"31469347":{"x":696,"y":360,"type":"Door"},"31469452":{"x":696,"y":312,"type":"Door"},"31469628":{"x":648,"y":408,"type":"Door"},"31469736":{"x":600,"y":456,"type":"Door"},"31469758":{"x":552,"y":504,"type":"Door"},"31470698":{"x":456,"y":600,"type":"Door"},"31470903":{"x":504,"y":552,"type":"Wall"},"31470965":{"x":408,"y":648,"type":"Door"},"31470998":{"x":360,"y":696,"type":"Door"},"31471010":{"x":312,"y":744,"type":"Door"},"31471011":{"x":264,"y":744,"type":"Door"},"31471012":{"x":216,"y":696,"type":"Door"},"31471013":{"x":600,"y":312,"type":"Wall"},"31471014":{"x":648,"y":312,"type":"Wall"},"31471015":{"x":648,"y":360,"type":"Wall"},"31471016":{"x":600,"y":360,"type":"Wall"},"31471017":{"x":504,"y":360,"type":"Wall"},"31471018":{"x":552,"y":360,"type":"Wall"},"31471019":{"x":552,"y":408,"type":"Wall"},"31471020":{"x":552,"y":456,"type":"Wall"},"31471021":{"x":504,"y":456,"type":"Wall"},"31471022":{"x":600,"y":408,"type":"Wall"},"31471023":{"x":504,"y":408,"type":"Door"},"31471024":{"x":264,"y":696,"type":"Wall"},"31471025":{"x":312,"y":696,"type":"Wall"},"31471026":{"x":312,"y":648,"type":"Wall"},"31471027":{"x":264,"y":648,"type":"Wall"},"31471028":{"x":216,"y":648,"type":"Wall"},"31471029":{"x":360,"y":648,"type":"Wall"},"31471030":{"x":312,"y":600,"type":"Wall"},"31471031":{"x":312,"y":552,"type":"Wall"},"31471032":{"x":360,"y":600,"type":"Wall"},"31471033":{"x":408,"y":600,"type":"Wall"},"31471034":{"x":408,"y":552,"type":"Wall"},"31471035":{"x":504,"y":504,"type":"Door"},"31471036":{"x":456,"y":504,"type":"Door"},"31471037":{"x":456,"y":552,"type":"Door"},"31471038":{"x":360,"y":552,"type":"Door"},"31471039":{"x":360,"y":504,"type":"Door"},"31471040":{"x":408,"y":504,"type":"Door"},"31471041":{"x":456,"y":456,"type":"Door"},"31471044":{"x":384,"y":432,"type":"ArrowTower"},"31471045":{"x":312,"y":360,"type":"Door"},"31471046":{"x":312,"y":408,"type":"Door"},"31471047":{"x":312,"y":456,"type":"Door"},"31471048":{"x":312,"y":504,"type":"Door"},"31471049":{"x":360,"y":360,"type":"Door"},"31471050":{"x":408,"y":360,"type":"Door"},"31471051":{"x":456,"y":360,"type":"Door"},"31471052":{"x":456,"y":408,"type":"Door"},"31471053":{"x":168,"y":600,"type":"Wall"},"31471054":{"x":168,"y":648,"type":"Door"},"31471055":{"x":120,"y":600,"type":"Door"},"31471056":{"x":72,"y":648,"type":"Door"},"31471057":{"x":24,"y":648,"type":"Wall"},"31471058":{"x":24,"y":696,"type":"Door"},"31471059":{"x":240,"y":576,"type":"MagicTower"},"31471060":{"x":144,"y":528,"type":"MagicTower"},"31471061":{"x":48,"y":576,"type":"MagicTower"},"31471062":{"x":144,"y":432,"type":"CannonTower"},"31471063":{"x":48,"y":480,"type":"CannonTower"},"31471064":{"x":48,"y":384,"type":"ArrowTower"},"31471066":{"x":-96,"y":432,"type":"CannonTower"},"31471067":{"x":-96,"y":528,"type":"MagicTower"},"31471068":{"x":48,"y":288,"type":"BombTower"},"31471069":{"x":144,"y":336,"type":"BombTower"},"31471070":{"x":240,"y":384,"type":"BombTower"},"31471071":{"x":240,"y":480,"type":"BombTower"},"31471072":{"x":-264,"y":216,"type":"Wall"},"31471073":{"x":-264,"y":264,"type":"Wall"},"31471074":{"x":-96,"y":336,"type":"ArrowTower"},"31471075":{"x":-192,"y":384,"type":"ArrowTower"},"31471076":{"x":-192,"y":480,"type":"MagicTower"},"31471077":{"x":-216,"y":552,"type":"Wall"},"31471078":{"x":-168,"y":552,"type":"Wall"},"31471079":{"x":-120,"y":600,"type":"Wall"},"31471080":{"x":-48,"y":624,"type":"Harvester"},"31471090":{"x":-72,"y":696,"type":"Door"},"31471115":{"x":-120,"y":648,"type":"Door"},"31471119":{"x":-216,"y":600,"type":"Door"},"31471123":{"x":-168,"y":600,"type":"Door"},"31471124":{"x":-24,"y":696,"type":"SlowTrap"},"31471128":{"x":-264,"y":600,"type":"Wall"},"31471129":{"x":-312,"y":600,"type":"Wall"},"31471130":{"x":-360,"y":600,"type":"Wall"},"31471131":{"x":-408,"y":600,"type":"Wall"},"31471132":{"x":-360,"y":648,"type":"Wall"},"31471133":{"x":-312,"y":648,"type":"Wall"},"31471134":{"x":-264,"y":648,"type":"Door"},"31471135":{"x":-312,"y":696,"type":"Door"},"31471136":{"x":-360,"y":696,"type":"Door"},"31471137":{"x":-408,"y":648,"type":"Door"},"31471138":{"x":-456,"y":600,"type":"Door"},"31471177":{"x":-456,"y":552,"type":"Wall"},"31471178":{"x":-456,"y":504,"type":"Wall"},"31471179":{"x":-504,"y":504,"type":"Wall"},"31471180":{"x":-384,"y":528,"type":"MeleeTower"},"31471181":{"x":-288,"y":528,"type":"MeleeTower"},"31471375":{"x":-504,"y":552,"type":"Door"},"31471459":{"x":-552,"y":504,"type":"Door"},"31472550":{"x":-600,"y":456,"type":"Door"},"31473067":{"x":-600,"y":408,"type":"Wall"},"31473180":{"x":-648,"y":408,"type":"Door"},"31473706":{"x":-648,"y":360,"type":"Wall"},"31473775":{"x":-648,"y":312,"type":"Wall"},"31474138":{"x":-696,"y":312,"type":"Door"},"31474172":{"x":-696,"y":360,"type":"Door"},"31474551":{"x":-576,"y":336,"type":"MagicTower"},"31475047":{"x":-480,"y":336,"type":"ArrowTower"},"31475122":{"x":-528,"y":432,"type":"ArrowTower"},"31475754":{"x":-360,"y":408,"type":"Wall"},"31475761":{"x":-360,"y":456,"type":"Wall"},"31475847":{"x":-432,"y":432,"type":"BombTower"},"31475861":{"x":-384,"y":336,"type":"BombTower"},"31475869":{"x":-288,"y":336,"type":"BombTower"},"31475881":{"x":-288,"y":432,"type":"BombTower"},"31475918":{"x":-24,"y":264,"type":"SlowTrap"},"31475919":{"x":-24,"y":312,"type":"SlowTrap"},"31475921":{"x":-24,"y":360,"type":"SlowTrap"},"31475922":{"x":-24,"y":408,"type":"SlowTrap"},"31475923":{"x":-24,"y":456,"type":"SlowTrap"},"31475924":{"x":-24,"y":504,"type":"SlowTrap"},"31475928":{"x":-24,"y":552,"type":"SlowTrap"}}');
const items = Object.values(data);
let n = 0;
for (const b of items) {
  game.network.sendRpc({ name: 'MakeBuilding', type: b.type, x: gs.x + b.x, y: gs.y + b.y, yaw: 0 });
  n++;
}
ctx.toast('Build Plus Base: queued ' + n + ' buildings');`),

  scr_basesaver: scr("scr_basesaver", "Base Saver",
    `const KEY_DATA = 'axiom.baseSaver.data';
const KEY_PINS = 'axiom.baseSaver.pins';
const TOWERS = ['Wall','Door','SlowTrap','ArrowTower','CannonTower','MeleeTower','BombTower','MagicTower','GoldMine','Harvester'];
const MAX_PINS = 3;
const game = window.game;

// Lazy state — created once, reused across all button clicks.
const S = window.__axiomBase = window.__axiomBase || {
  data: JSON.parse(localStorage.getItem(KEY_DATA) || '{}'),
  pins: JSON.parse(localStorage.getItem(KEY_PINS) || '[]'),
  overlay: null,
  mouse: { x: 0, y: 0 },
};
const save     = () => localStorage.setItem(KEY_DATA, JSON.stringify(S.data));
const savePins = () => localStorage.setItem(KEY_PINS, JSON.stringify(S.pins));
const getCtrl  = (id) => window.AxiomPanel?.controlNodes?.get(id)?.widget;
const getStash = () => Object.values(game?.ui?.buildings || {}).find(b => b.type === 'GoldStash');
const simplify = (s) => s.replace(/[^a-zA-Z0-9_-]+/g, '');

// Always track mouse — overlay needs current screen position.
if (!S._mouseHook) {
  S._mouseHook = true;
  document.addEventListener('mousemove', e => { S.mouse.x = e.clientX; S.mouse.y = e.clientY; });
}

// Refresh the dropdown options + pin button labels from current state.
// Idempotent: only rebuilds the <select> when its options don't match
// the saved data, so the persistent loop below can call it cheaply
// without clobbering the user's current selection.
const refreshUI = () => {
  const sel = getCtrl('bs-list');
  if (sel) {
    const ids = Object.keys(S.data);
    const want = ids.length ? ids : [''];
    const have = Array.from(sel.options).map((o) => o.value);
    const same = want.length === have.length && want.every((v, i) => v === have[i]);
    if (!same) {
      const cur = sel.value;
      sel.innerHTML = '';
      if (ids.length === 0) {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = '(no saved bases)';
        sel.appendChild(opt);
      }
      for (const id of ids) {
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = S.data[id].name;
        sel.appendChild(opt);
      }
      if (S.data[cur]) sel.value = cur;
    }
  }
  for (let i = 0; i < MAX_PINS; i++) {
    const btn = getCtrl('bs-pin' + (i + 1));
    if (!btn) continue;
    const id = S.pins[i];
    const entry = id && S.data[id];
    const label = entry ? entry.name : '(empty)';
    if (btn.textContent !== label) btn.textContent = label;
  }
};
refreshUI();

// The panel rebuilds controls from the schema on every render (tab
// switch, search, collapse), which wipes the dynamically-added dropdown
// options. Keep them in sync with a lightweight persistent loop so the
// saved-base list + pin labels are always correct when the panel opens.
if (!S._uiTimer) {
  S._uiTimer = setInterval(() => { try { refreshUI(); } catch {} }, 600);
}

// ── Overlay (ghost preview that follows the mouse) ──
const TILE = 48;
const COLORS = {
  Wall: 0x88ccff, Door: 0xbbddff, SlowTrap: 0x99ff99, ArrowTower: 0xffaa55,
  CannonTower: 0xff8855, MeleeTower: 0xffcc44, BombTower: 0xff4477,
  MagicTower: 0xcc88ff, GoldMine: 0xffdd44, Harvester: 0x66ccff,
};
const quantize = () => {
  const w = game.world.renderer.screenToWorld(S.mouse.x, S.mouse.y);
  return { x: Math.round(w.x / TILE) * TILE, y: Math.round(w.y / TILE) * TILE };
};
const stopOverlay = () => {
  if (!S.overlay) return;
  for (const gh of S.overlay.ghosts) {
    try { game.world.renderer.ground.removeAttachment(gh.g); } catch {}
  }
  removeEventListener('mousedown',  S.overlay.onClick);
  removeEventListener('mousemove',  S.overlay.onMove);
  removeEventListener('contextmenu', S.overlay.onContext);
  S.overlay = null;
};
const startOverlay = (id) => {
  if (!S.data[id]) return;
  if (!game.world?.renderer?.ground || !window.PIXI) { ctx.toast('Preview: attach first'); return; }
  stopOverlay();
  const towers = S.data[id].baseString.split(';')
    .filter(s => s)
    .map(s => { const p = s.split(','); return { model: TOWERS[+p[0]], dx: +p[1], dy: +p[2], yaw: +p[3] }; })
    .filter(t => t.model);
  const ghosts = [];
  for (const t of towers) {
    const g = new window.PIXI.Graphics();
    const c = COLORS[t.model] || 0xffffff;
    g.lineStyle(2, c, 0.85);
    g.beginFill(c, 0.25);
    g.drawRect(-TILE/2, -TILE/2, TILE, TILE);
    g.endFill();
    ghosts.push({ g, dx: -t.dx, dy: -t.dy, model: t.model, yaw: t.yaw });
    try { game.world.renderer.ground.addAttachment(g); } catch {}
  }
  S.overlay = {
    ghosts,
    onMove:    () => { if (!S.overlay) return;
                       const r = quantize();
                       for (const gh of S.overlay.ghosts) gh.g.position.set(r.x + gh.dx, r.y + gh.dy); },
    onClick:   (e) => {
      if (!S.overlay) return;
      if (e.target.id !== 'hud') return;
      if (e.button === 0) {
        const r = quantize();
        for (const gh of S.overlay.ghosts) {
          game.network.sendRpc({ name: 'MakeBuilding', type: gh.model,
            x: r.x + gh.dx, y: r.y + gh.dy, yaw: gh.yaw });
        }
        stopOverlay();
        ctx.toast('Base built');
      } else if (e.button === 2) {
        stopOverlay();
        ctx.toast('Overlay cancelled');
      }
    },
    onContext: (e) => { if (S.overlay) e.preventDefault(); },
  };
  addEventListener('mousedown',  S.overlay.onClick);
  addEventListener('mousemove',  S.overlay.onMove);
  addEventListener('contextmenu', S.overlay.onContext);
  S.overlay.onMove();
};

// ── Dispatch on which button fired the script ──
const selId = () => getCtrl('bs-list')?.value || null;

if (controlId === 'bs-record') {
  if (!getStash()) { ctx.toast('Need a GoldStash first'); return; }
  const nameInput = getCtrl('bs-name');
  const name = (nameInput?.value || '').trim();
  if (!name) { ctx.toast('Enter a base name first'); return; }
  const id = simplify(name);
  if (!id) { ctx.toast('Name has no valid characters'); return; }
  const stash = getStash();
  let baseStr = '';
  let count = 0;
  for (const b of Object.values(game.ui.buildings)) {
    const idx = TOWERS.indexOf(b.type);
    if (idx < 0) continue;
    let yaw = 0;
    if (['Harvester', 'MeleeTower'].includes(b.type)) {
      const e = game.world.entities.get(b.uid);
      if (e?.targetTick?.yaw) yaw = e.targetTick.yaw;
    }
    baseStr += idx + ',' + (stash.x - b.x) + ',' + (stash.y - b.y) + ',' + yaw + ';';
    count++;
  }
  const existed = !!S.data[id];
  S.data[id] = { name, baseString: baseStr };
  save(); refreshUI();
  if (nameInput) nameInput.value = '';
  ctx.toast((existed ? 'Overwrote' : 'Saved') + ' "' + name + '" (' + count + ' buildings)');
}

else if (controlId === 'bs-build') {
  const id = selId(); if (!id || !S.data[id]) { ctx.toast('Select a base'); return; }
  if (!getStash()) { ctx.toast('Need a GoldStash first'); return; }
  const stash = getStash();
  let n = 0;
  for (const s of S.data[id].baseString.split(';')) {
    const p = s.split(','); if (!p[0]) continue;
    game.network.sendRpc({ name: 'MakeBuilding', type: TOWERS[+p[0]],
      x: stash.x - +p[1], y: stash.y - +p[2], yaw: +p[3] });
    n++;
  }
  ctx.toast('Building "' + S.data[id].name + '" (' + n + ' parts)');
}

else if (controlId === 'bs-preview') {
  const id = selId(); if (!id || !S.data[id]) { ctx.toast('Select a base'); return; }
  startOverlay(id);
  ctx.toast('Preview "' + S.data[id].name + '" — LClick build · RClick cancel');
}

else if (controlId === 'bs-clear-overlay') {
  stopOverlay();
  ctx.toast('Overlay cleared');
}

else if (controlId === 'bs-pin') {
  const id = selId(); if (!id || !S.data[id]) { ctx.toast('Select a base'); return; }
  if (S.pins.includes(id)) { ctx.toast('Already pinned'); return; }
  if (S.pins.length >= MAX_PINS) { ctx.toast('Max ' + MAX_PINS + ' pins — delete one first'); return; }
  S.pins.push(id); savePins(); refreshUI();
  ctx.toast('Pinned "' + S.data[id].name + '"');
}

else if (controlId === 'bs-delete') {
  const id = selId(); if (!id || !S.data[id]) { ctx.toast('Select a base'); return; }
  const name = S.data[id].name;
  delete S.data[id];
  S.pins = S.pins.filter(p => p !== id);
  save(); savePins(); refreshUI();
  ctx.toast('Deleted "' + name + '"');
}

else if (controlId === 'bs-export') {
  const json = JSON.stringify(S.data);
  try {
    navigator.clipboard.writeText(json);
    ctx.toast('Exported ' + Object.keys(S.data).length + ' bases to clipboard');
  } catch {
    console.log('[axiom BaseSaver export]', json);
    ctx.toast('Exported to console (clipboard blocked)');
  }
}

else if (controlId === 'bs-import') {
  const json = prompt('Paste base JSON:');
  if (!json) return;
  try {
    const parsed = JSON.parse(json);
    Object.assign(S.data, parsed);
    save(); refreshUI();
    ctx.toast('Imported ' + Object.keys(parsed).length + ' bases');
  } catch (e) { ctx.toast('Invalid JSON: ' + e.message); }
}

else if (controlId === 'bs-pin1' || controlId === 'bs-pin2' || controlId === 'bs-pin3') {
  const i = +controlId.slice(-1) - 1;
  const id = S.pins[i];
  if (!id || !S.data[id]) { ctx.toast('Pin slot empty'); return; }
  if (!getStash()) { ctx.toast('Need a GoldStash first'); return; }
  const stash = getStash();
  for (const s of S.data[id].baseString.split(';')) {
    const p = s.split(','); if (!p[0]) continue;
    game.network.sendRpc({ name: 'MakeBuilding', type: TOWERS[+p[0]],
      x: stash.x - +p[1], y: stash.y - +p[2], yaw: +p[3] });
  }
  ctx.toast('Built pin: ' + S.data[id].name);
}

else if (controlId === 'bs-unpin') {
  if (S.pins.length === 0) { ctx.toast('No pins to remove'); return; }
  S.pins.pop(); savePins(); refreshUI();
  ctx.toast('Removed last pin');
}`),
};

const DEFAULT_SCHEMA = {
  schemaVersion: 16,
  meta: {
    name: "Axiom",
    version: "0.1.0",
    hotkey: "`",
    theme: "axiom-dark",
    landingTabId: "combat",
  },
  tabs: [
    {
      id: "combat", name: "Combat", icon: null,
      sections: [
        {
          id: "combat-targeting", name: "Targeting", collapsible: true, defaultOpen: true,
          controls: [
            { type: "toggle", id: "combat-autoaim", label: "Auto Aim", scriptId: "scr_autoaim",
              tooltip: "Continuously aims at the nearest target. Pick what to aim at below." },
            { type: "select", id: "combat-autoaim-mode", label: "Aim mode", defaultValue: "player",
              options: [
                { value: "player", label: "Players (non-party)" },
                { value: "zombie", label: "Zombies only" },
                { value: "zomdem", label: "Zombies + Demons" },
                { value: "any",    label: "Any non-self" },
              ] },
            { type: "toggle", id: "combat-autobow", label: "Auto Bow", scriptId: "scr_autobow",
              tooltip: "Equips Bow + auto-fires when an enemy is in range." },
          ],
        },
        {
          id: "combat-survival", name: "Survival", collapsible: true, defaultOpen: true,
          controls: [
            { type: "toggle", id: "combat-autoheal", label: "Auto Heal", scriptId: "scr_autoheal",
              tooltip: "Drinks a Health Potion when below threshold." },
            { type: "slider", id: "combat-heal-threshold", label: "Heal at HP %",
              defaultValue: 30, min: 5, max: 90, step: 5 },
            { type: "toggle", id: "combat-autorespawn", label: "Auto Respawn", scriptId: "scr_autorespawn",
              tooltip: "Re-clicks the respawn button on death." },
          ],
        },
      ],
    },
    {
      id: "build", name: "Build", icon: null,
      sections: [
        {
          id: "build-smartfarm", name: "Smart Farm", collapsible: true, defaultOpen: true,
          controls: [
            { type: "text", id: "smartfarm-info",
              defaultValue: "Click below, then pick a tree and a nearby stone in the world. Every party bot is sent to farm that pair, fanned out so each can reach both." },
            { type: "button", id: "smartfarm-setup", label: "Smart Farm Setup", scriptId: "scr_smartFarm",
              tooltip: "Arms pick mode: click a tree, then a stone. All party sessions are sent to farm them." },
          ],
        },
        {
          id: "build-auto", name: "Automation", collapsible: true, defaultOpen: true,
          controls: [
            { type: "toggle", id: "build-ahrc", label: "AHRC", scriptId: "scr_ahrc",
              tooltip: "Auto Harvester Resource Collector — refills harvesters AND collects produced wood/stone." },
            { type: "select", id: "build-ahrc-mode", label: "AHRC mode", defaultValue: "rc",
              options: [
                { value: "rc", label: "Refill + Collect" },
                { value: "r",  label: "Refill only" },
                { value: "c",  label: "Collect only" },
              ] },
            { type: "button", id: "build-autoupgrade", label: "Upgrade all towers", scriptId: "scr_autoupgrade" },
            { type: "toggle", id: "build-aulht", label: "Auto Upgrade Low HP", scriptId: "scr_aulht",
              tooltip: "Auto-upgrades any tower whose HP falls below the threshold (Banshee's UTH)." },
            { type: "toggle", id: "build-rebuild", label: "Auto Rebuild", scriptId: "scr_rebuild",
              tooltip: "Rebuilds dead towers in their previous slot and re-upgrades them." },
          ],
        },
        {
          id: "build-place", name: "Placement", collapsible: true, defaultOpen: true,
          controls: [
            { type: "button", id: "build-wallblock", label: "Place wall ring", scriptId: "scr_wallblock",
              tooltip: "Drops a ring of walls around your gold stash at the configured radius." },
            { type: "slider", id: "build-wall-radius", label: "Ring radius (tiles)",
              defaultValue: 3, min: 1, max: 9, step: 1 },
            { type: "toggle", id: "build-autobuild", label: "Auto Builder", scriptId: "scr_autobuild",
              tooltip: "On stash placement, auto-builds your saved base design." },
            { type: "toggle", id: "build-autotrap", label: "Auto Trap", scriptId: "scr_autotrap",
              tooltip: "Traps adjacent players with walls — close to use." },
          ],
        },
      ],
    },
    {
      id: "base", name: "Base Saver", icon: null,
      sections: [
        {
          id: "bs-record-build", name: "Record & Build", collapsible: true, defaultOpen: true,
          controls: [
            { type: "input",  id: "bs-name",   label: "Name", placeholder: "e.g. north corner" },
            { type: "button", id: "bs-record", label: "Record current base", scriptId: "scr_basesaver",
              tooltip: "Captures every building's offset from your GoldStash and saves it under the name above." },
            { type: "select", id: "bs-list",   label: "Saved",
              defaultValue: "", dynamicOptions: "axiom.baseSaver.data",
              options: [{ value: "", label: "(no saved bases)" }] },
            { type: "row", id: "bs-row-actions", controls: [
              { type: "button", id: "bs-build",         label: "Build",          scriptId: "scr_basesaver" },
              { type: "button", id: "bs-preview",       label: "Preview",        scriptId: "scr_basesaver",
                tooltip: "Ghost-overlay the layout under your cursor. L-click commits, R-click cancels." },
              { type: "button", id: "bs-clear-overlay", label: "Clear",          scriptId: "scr_basesaver" },
            ]},
            { type: "row", id: "bs-row-manage", controls: [
              { type: "button", id: "bs-pin",     label: "Pin",       scriptId: "scr_basesaver" },
              { type: "button", id: "bs-delete",  label: "Delete",    scriptId: "scr_basesaver" },
            ]},
          ],
        },
        {
          id: "bs-sec-pins", name: "Pins", collapsible: true, defaultOpen: true,
          controls: [
            { type: "row", id: "bs-pin-row", controls: [
              { type: "button", id: "bs-pin1", label: "(empty)", scriptId: "scr_basesaver" },
              { type: "button", id: "bs-pin2", label: "(empty)", scriptId: "scr_basesaver" },
              { type: "button", id: "bs-pin3", label: "(empty)", scriptId: "scr_basesaver" },
            ]},
            { type: "button", id: "bs-unpin", label: "Remove last pin", scriptId: "scr_basesaver" },
          ],
        },
        {
          id: "bs-sec-backup", name: "Backup & Prebuilt", collapsible: true, defaultOpen: false,
          controls: [
            { type: "row", id: "bs-backup-row", controls: [
              { type: "button", id: "bs-export", label: "Export", scriptId: "scr_basesaver" },
              { type: "button", id: "bs-import", label: "Import", scriptId: "scr_basesaver" },
            ]},
            { type: "text", id: "bs-prebuilt-info",
              defaultValue: "One-click full base layouts placed relative to your GoldStash." },
            { type: "button", id: "bs-plusbase", label: "Build Plus Base", scriptId: "scr_buildPlusBase",
              tooltip: "Places the full Plus-shaped base (~500 buildings) around the GoldStash." },
          ],
        },
      ],
    },
    {
      id: "visuals", name: "Visuals", icon: null,
      sections: [
        {
          id: "vis-overlay", name: "Overlays", collapsible: true, defaultOpen: true,
          controls: [
            { type: "toggle", id: "vis-aoe", label: "AOE Map", scriptId: "scr_aoeMap",
              tooltip: "Draws tower AOE radii on the world so you can plan ranges." },
            { type: "toggle", id: "vis-stash", label: "Stash Indicators", scriptId: "scr_stashIndicators" },
            { type: "toggle", id: "vis-obstacle", label: "Obstacle Indicators", scriptId: "scr_obstacleInd",
              tooltip: "Shows trees/rocks pathfinding bounding boxes." },
            { type: "toggle", id: "vis-blife", label: "Building Lifetime", scriptId: "scr_buildingLife",
              tooltip: "Shows how long each building has been alive." },
            { type: "toggle", id: "vis-grouping", label: "Grouping Grid", scriptId: "scr_grouping",
              tooltip: "Snap-to-grid overlay (48 px) for clean base layouts." },
            { type: "toggle", id: "vis-bossalert", label: "Boss Alert", scriptId: "scr_bossAlert" },
          ],
        },
        {
          id: "vis-perf", name: "Performance", collapsible: true, defaultOpen: false,
          controls: [
            { type: "toggle", id: "vis-optimize", label: "Optimizers", scriptId: "scr_optimizers",
              tooltip: "Skips optional renderer work (zombie textures, hit flashes) to reclaim frame budget." },
          ],
        },
      ],
    },
    {
      id: "multi", name: "Multibox", icon: null,
      sections: [
        {
          id: "multi-clone", name: "Clones", collapsible: true, defaultOpen: true,
          controls: [
            { type: "number", id: "multi-clone-count", label: "Spawn count",
              defaultValue: 1, min: 1, max: 16, step: 1 },
            { type: "row", id: "multi-clone-actions", controls: [
              { type: "button", id: "multi-clones-spawn",      label: "Spawn",        scriptId: "scr_clones",
                tooltip: "Opens N additional sessions on the current server using the options below." },
              { type: "button", id: "multi-clones-delete-all", label: "Delete all",   scriptId: "scr_clones",
                tooltip: "Closes every session previously spawned via this panel." },
              { type: "button", id: "multi-clones-status",     label: "Status",       scriptId: "scr_clones",
                tooltip: "Toasts the count of active clones." },
            ]},

            { type: "group", id: "multi-grp-identity", label: "Identity", defaultOpen: true, controls: [
              { type: "toggle", id: "multi-random-name", label: "Random names",
                defaultValue: true,
                tooltip: "Pick a random adjective + animal name for each clone (e.g. Spry Otter)." },
              { type: "input",  id: "multi-name-prefix", label: "Name prefix",
                defaultValue: "Clone", placeholder: "Clone",
                tooltip: "Used when Random names is off. Clones get \"<prefix> N\"." },
              { type: "input",  id: "multi-label-prefix", label: "Session label prefix",
                defaultValue: "Clone", placeholder: "Clone",
                tooltip: "The label shown in the dashboard session list. Also what \"Delete all\" matches against." },
            ]},

            { type: "group", id: "multi-grp-party", label: "Party", defaultOpen: true, controls: [
              { type: "toggle", id: "multi-join-party", label: "Join my party",
                defaultValue: true,
                tooltip: "Uses your current Party Share Key so the clones join your party automatically. Default ON." },
              { type: "input",  id: "multi-custom-psk", label: "Override PSK",
                placeholder: "leave blank to use my PSK",
                tooltip: "Optional. If set, clones join this party share key instead of yours. Only used when \"Join my party\" is off." },
            ]},

            { type: "group", id: "multi-grp-behavior", label: "Behavior", defaultOpen: true, controls: [
              { type: "select", id: "multi-mode", label: "Mode",
                defaultValue: "filler",
                options: [
                  { value: "idle",     label: "Idle (stand still)" },
                  { value: "filler",   label: "Filler (auto-heal only)" },
                  { value: "farmer",   label: "Farmer (auto-farm + heal)" },
                  { value: "defender", label: "Defender (auto-aim + auto-bow + heal)" },
                  { value: "custom",   label: "Custom (no presets applied)" },
                ],
                tooltip: "Sets the bot behavior flags on each newly-spawned clone." },
              { type: "toggle", id: "multi-movecopy", label: "Movement copy (mirror nearest party)",
                scriptId: "scr_movementCopy",
                tooltip: "Mirrors movement to the nearest party member. Runs locally — independent of clones." },
            ]},

            { type: "group", id: "multi-grp-server", label: "Server", defaultOpen: false, controls: [
              { type: "input",  id: "multi-server-override", label: "Server override",
                placeholder: "leave blank for current",
                tooltip: "e.g. v5001 / v1001 / v2002. Empty = same server you're playing on." },
              { type: "toggle", id: "multi-stagger",         label: "Stagger spawns",
                defaultValue: true,
                tooltip: "Sleep 250 ms between spawn requests so the MBF challenge doesn't rate-limit." },
            ]},
          ],
        },
      ],
    },
    {
      id: "party", name: "Party", icon: null,
      sections: [
        {
          id: "party-admin", name: "Permissions", collapsible: true, defaultOpen: true,
          controls: [
            { type: "button", id: "party-givesell", label: "Grant sell perms to all", scriptId: "scr_autoGiveSell",
              tooltip: "Gives every party member permission to sell — staggered so they all get it." },
          ],
        },
        {
          id: "party-chat", name: "Chat", collapsible: true, defaultOpen: false,
          controls: [
            { type: "toggle", id: "combat-chatspam", label: "Chat Spam", scriptId: "scr_chatspam",
              tooltip: "Sends the message below every ~1 s (random pool if blank)." },
            { type: "input", id: "combat-spam-msg", label: "Message",
              defaultValue: "", placeholder: "leave blank for random pool" },
          ],
        },
      ],
    },
    {
      id: "home", name: "Home", icon: null,
      sections: [
        {
          id: "home-welcome", name: "Welcome", collapsible: false, defaultOpen: true,
          controls: [
            { type: "text", id: "home-blurb", label: "",
              defaultValue:
                "Axiom — search-first scripting console.\n" +
                "Hotkey: ` to toggle. Type in the search bar to filter every tab's controls live.\n" +
                "Persistent sessions live on the localhost dashboard (browser homepage)." },
          ],
        },
      ],
    },
  ],
  scripts: SCRIPTS,
};

module.exports = { DEFAULT_SCHEMA, defaultSchema: () => DEFAULT_SCHEMA };
