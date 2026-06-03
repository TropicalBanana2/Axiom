# Axiom — server

Self-hosted Banshee successor for zombs.io. Three engines, one
localhost install:

- **UI engine** — search-first, minimalist panel rendered from a JSON
  schema. Editable by hand or via the upstream uiengine (`/editor`).
- **Scripting engine** — `ctx`-shaped JS runs per-control; live game
  state via `ctx.game`, persisted state via `ctx.storage`.
- **Session engine** — headless bot workers that stay logged in to
  zombs.io even when your browser closes. Per-session protocol —
  every wire command carries an explicit `sessionId`.

## Architecture

```
                ┌──────────────────────────────┐
       :80 ────▶│  axiom-localhost   (Express) │   serves modded page
                │   /api/login                 │   serves /api/schema
                │   /api/schema                │
                │   /play  (modded client)     │
                └──────┬─────────┬─────────────┘
                       │         │
            login      ▼         ▼   schema seed
                    SQLite (data/axiom.db)
                       ▲         ▲
                       │         │
        :8090 ──▶┌─────┴──────┐  │
    Browser  ──▶│ axiom-       │ │ session list, per-session
                │ sessions     │ │ protocol, behaviour toggles
    (JSON +     │  - Bot pool  │ │
     binary)    │  - WASM solver│ │
                └─────┬────────┘ │
                      │          │
                  wss zombs.io   │
                                 │
        :8100 ──▶┌────────────┐  │
       Alts  ──▶│ axiom-      │  │
                │ sockets     │  │  MBF solver pool for alt browsers
                │ (WASM only) │  │
                └─────────────┘  │
```

## Layout

```
server/
├── package.json
├── ecosystem.config.js          pm2 process map
├── data/                        SQLite db + JWT secret (gitignored)
├── public/                      served by :80
│   ├── index.html               minimalist landing page (login + sessions)
│   ├── client.html              modded zombs.io play page
│   └── asset/
│       ├── axiom-shell.css      shared dark palette
│       ├── axiom-client.js      landing page logic
│       ├── axiom-panel.js       in-game panel (search-first)
│       ├── server-list.js       client mirror of serverList.js
│       ├── app.js               modded zombs.io client (from Banshee)
│       ├── app.css
│       ├── pixi.js
│       ├── smallWasm.wasm
│       └── pictures/
└── src/
    ├── localhost.js             :80 Express
    ├── sessions.js              :8090 bot orchestrator
    ├── sockets.js               :8100 WASM solver pool
    ├── bot.js                   one Bot per persistent session
    ├── binCodec.js              zombs.io binary codec
    ├── wasmSolver.js            MBF anti-bot WASM bridge
    ├── serverList.js            zombs.io server map
    ├── protocol.js              session WS envelope
    ├── db.js                    SQLite helpers (better-sqlite3)
    ├── auth.js                  JWT issuer/verifier
    └── defaultSchema.js         seed schema with alterale features
```

## Install

```sh
cd D:/axiom/server
npm install                       # bytebuffer, ws, express, better-sqlite3, jsonwebtoken, pm2
npm start                         # pm2 start ecosystem.config.js
```

Then in a browser → **http://localhost/**

Axiom runs in **no-login local mode** — it's meant to run on your own
machine for your own use, so there's no account system. A single local
user is provisioned automatically on first boot (`GET /api/auth/local`),
and all sessions belong to it. The old register/login endpoints were
removed.

## Engines

### UI engine — search-first panel

The in-game panel (toggle with `` ` ``) reads its schema from
`GET /api/schema`. The schema describes tabs → sections → controls,
each control optionally bound to a script. The same schema format is
what the upstream `D:/axiom/editor/` produces.

**Search is global** — the search box at the top of the panel filters
controls across the *current* tab in real time. Type `heal` and only
Auto Heal / Heal threshold are visible.

Hotkey is `` ` `` by default (`schema.meta.hotkey`). Drag the header
to move it.

### Scripting engine — `ctx`

Each control with a `scriptId` runs its script when its value changes
(or on button click). The compiled function gets one argument: `ctx`.

| API                          | Purpose                                                                       |
|------------------------------|-------------------------------------------------------------------------------|
| `ctx.log(msg, level?)`       | Append to the in-panel console (also stdout).                                 |
| `ctx.game`                   | Proxy onto `window` — reach `ctx.game.game.network`, `.world`, etc.           |
| `ctx.ui.getValue(id)`        | Read another control's current value.                                         |
| `ctx.ui.setValue(id, v)`     | Write another control's value and re-render it.                               |
| `ctx.ui.trigger(id)`         | Re-fire a control's script.                                                   |
| `ctx.storage.get/set/delete` | Per-script persistence (localStorage).                                        |
| `ctx.on(event, fn)`          | Subscribe to the internal event bus.                                          |
| `ctx.toast(msg)`             | Show a transient in-game popup.                                               |

Each script is `new Function("ctx", "value", "controlId", source)` —
errors are caught and routed to the console.

### Session engine — VPS bots

A "session" is a persistent zombs.io connection running headless in
Node. Browser closes? The bot keeps playing. Reopen the browser,
re-attach to that session, see live state.

Compared to Banshee, the protocol is per-session:

```jsonc
// Every browser → server frame includes the sessionId. No more implicit
// `whatever's in .sessionsid right now` global state.
{ "sid": 5, "op": "setBehaviour", "args": { "key": "autoFarm", "value": true } }
```

Bot behaviours (`autoFarm`, `autoHeal`, `autoReconnect`, etc.) live on
the Bot instance itself. The detail panel for a selected session
mutates the *correct* bot every time.

Sessions, server-level flags, and party-refiller PSKs are persisted in
SQLite — `data/axiom.db`. `pm2 restart` no longer wipes everything.

## Capabilities

Core infrastructure:

- No-login local user + JWT (auto-provisioned)
- WebSocket session orchestration with per-session protocol
- Bot connect + MBF handshake + world entry + party join/create
- Schema serving + SQLite persistence (sessions, flags, PSKs)
- The in-game panel + global search + `ctx` script host

In-game behaviours (real ports, driven by the panel):

- Auto Farm — Banshee-style with the PetCARL swap, stuck/wall-slide
  detection, and map-edge auto-correction
- Auto Heal, Auto Aim, Auto Bow, Auto Respawn, Chat Spam
- AHRC (refill / collect / both)
- Base Saver — record, pin, and rebuild base layouts (saves locally)
- Clones — spawn extra sessions into your party from in-game

Dashboard + coordinator (server-side):

- Spawn single sessions or a whole party at once; multi-attach a party
  to live `/play` tabs
- Smart-upgrade coordinator — economy-first per-party solver with
  gap-based priority and a pickaxe worth-it heuristic
- Pathfinding navigation — windowed A\* between base (spawn) and farm
  spot, with day/night-aware travel and saving→farm material gathering
- Auto-revive for dead alts

When extending: the pattern in `defaultSchema.js` is a `ctx`-flavoured
script per control. `ctx.game.game.network.sendRpc` maps 1-to-1 onto the
zombs.io RPCs; per-script state goes through `ctx.storage`.

## Wire it up with the editor

The standalone `D:/axiom/editor/` (Vite + React + Monaco) produces the
same schema format. To edit the live schema:

1. `cd D:/axiom/editor && npm run dev`
2. In uiengine, **Load** `data/axiom.db` (or paste in the JSON from
   `GET /api/schema`).
3. Edit visually; export and `PUT /api/schema` (the editor's "Export"
   flow can be pointed at `http://localhost/api/schema` directly).

## Notes / known gotchas

- **Node version.** The MBF WASM uses GC types — on Node 18 you need
  the experimental flags (see `ecosystem.config.js`). Node 22+ runs
  without flags. If you see `CompileError: WebAssembly.instantiate():
  invalid value type 0x64`, that's the version mismatch.
- **Asset binaries.** `app.js`, `pixi.js`, `app.css`, `smallWasm.wasm`,
  and `pictures/` were copied from Banshee. If zombs.io ships a new
  client, re-copy from a fresh Banshee install.
- **Port 80 on Windows.** Requires admin in some setups, or use a
  different port via `AXIOM_HTTP_PORT=8080 npm start`.
- **Auth header for /api/schema.** It's intentionally readable
  without a JWT (the modded client needs to render the panel before
  the user logs in). Write needs auth.
- **No telemetry.** Outbound HTTPS happens only when proxying
  `/zombs-leaderboard` and when a bot dials zombs.io itself.

## Commands

```sh
npm start                  pm2 start (3 processes)
npm stop                   pm2 stop
npm run logs               pm2 logs (tail)
npm run dev:localhost      run localhost.js directly (no pm2)
npm run db:reset           wipe data/axiom.db (re-seeds schema)
```
