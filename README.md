# Axiom

Self-hosted bot management and scripting console for
[zombs.io](https://zombs.io).
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

## Smart Upgrade Setup
- Spawn in a party
- Attach to the party
- Find a spot to farm and go into the in game menu 
- Click smart upgrade setup and then click a wood and stone on your screen, they should be overlapping
- After that if you reliquish control the bots should go to farm.
- Once you have the resources build the base.
- make sure you take back control
- Bring all the bots into the base (be smart where you put them, specifically out of the way of any bosses)
- the spot you put them in will be an anchor point
- Go to the party manager menu and click on the slide toggle to enable smart upgrade
- give control back to the sessions
- Optionally save the farming location for ease of access later

## Some notes
- Don't have a farming spot close enough to the base the zombies will get it
- know to use the take control / release to bot in the top of the menus
- Good rule of thumb is if you want the bot to do something give it control
- You can zoom out to find farming spots faster

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
`server/public/asset/pictures` belong to Banshee, a lot of the client
is based off of Banshee and the reason I created this was to not fry
my eyes every time I looked at the Banshee UI.

## Questions
Should you have any questions or want to report an issue you can contact Goonicks on discord
