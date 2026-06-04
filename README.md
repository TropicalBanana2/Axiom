# Axiom

Self-hosted bot management and scripting console for
[zombs.io](https://zombs.io). Run headless bots that stay logged in after
your browser closes, drive them from a dashboard, and script the in-game
panel from a single JSON schema.

## Quick start

```sh
cd server
npm install
npm start            # pm2 start ecosystem.config.js — 3 processes
```

Then open **http://localhost/**.

- **`/`** — landing page.
- **`/app`** — the dashboard: spawn sessions, create parties, attach,
  and configure the smart-upgrade coordinator.
- **`/play`** — the modded zombs.io client (attach a session to drive
  it live, or play yourself with the in-game panel).

Axiom runs in **no-login local mode** — it's meant to be run on your own
machine for your own use, so there's no account system. The single
local user is provisioned automatically on first boot.

> **Port 80 on Windows** may need admin, or set a different port:
> `AXIOM_HTTP_PORT=8080 npm start`.
>
> **Node 22+** is recommended — the MBF anti-bot WASM uses GC types that
> need experimental flags on Node 18. See `server/ecosystem.config.js`.

See [`server/README.md`](server/README.md) for the full architecture,
engine docs, and the wire protocol.

---

## What it does

- **Persistent sessions** — each bot is a headless Node WebSocket client
  that solves the MBF anti-bot handshake and stays in the world even
  when no browser is attached.
- **Dashboard** — spawn single sessions or a whole **party** at once,
  multi-attach every session in a party to live `/play` tabs, and watch
  per-session state on a live party map.
- **Smart-upgrade coordinator** — an economy-first, per-party solver
  that decides what to upgrade next (economy → defense → rest) and
  sends bots out to farm wood/stone while saving for expensive gold
  upgrades, returning them the moment the gap opens.
- **Pathfinding navigation** — a windowed A\* pathfinder keeps each bot
  shuttling only between its base and its set farm spot, with
  day/night-aware travel so it isn't caught out by zombies.
- **In-game panel** — a search-first, schema-driven panel (toggle with
  `` ` ``) with Auto Farm, Auto Heal, Auto Aim/Bow, AHRC, Base Saver,
  clones, and more.

---

## Layout

```
axiom/
└── server/             the product — see server/README.md
    ├── src/            localhost (:80), sessions (:8090), sockets (:8100)
    ├── public/         dashboard, /play page, assets
    └── data/           SQLite db + JWT secret (gitignored)
```

---

## Privacy

No analytics, no telemetry, no phone-home. The only outbound traffic is
the bots dialing zombs.io and the leaderboard proxy.

## Third-party assets

`server/public/asset/` vendors the zombs.io client runtime (`app.js`,
`pixi.js`, `app.css`, `smallWasm.wasm`, `pictures/`). These are
copyrighted by the game's authors and are included only to make the
modded `/play` page work locally — they are not original to this
project. If zombs.io ships a new client, re-copy these from a fresh
install.
