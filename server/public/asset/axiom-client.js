/* axiom-client.js — dashboard client logic.
 *
 * Responsibilities:
 *   - fetch a local token (no-login mode), open the sessions WS
 *   - render the session list
 *   - global search (Ctrl+K) — searches sessions, servers, features
 *   - "play" button opens /play (modded client) in a new tab
 *   - new-session modal + spawn flow
 */

(() => {
  // ----- tiny dom helpers -----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "onclick") e.onclick = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const kid of kids) e.append(kid?.nodeType ? kid : document.createTextNode(kid));
    return e;
  };

  // ----- state -----
  const state = {
    token: localStorage.getItem("axiom.token") || null,
    user: null,
    ws: null,
    sessions: [],
    selectedSid: null,
    selectedParty: null,                             // { serverId, partyId } | null
    flags: [],
    keys: [],
    smartUpgrade: { aheadBy: 2, farmWhenSaving: true, autoRebuild: true, whenDone: "keep", parties: [] },  // config
    smartUpgradeStatus: null,                        // live status from server
    pendingPartyCreate: null,                        // two-phase party spawn state
    fleet: [],                                       // live bot positions/nav
  };

  // ----- auth (no-login mode) -----
  // On boot we hit /api/auth/local for a token. The "reset" button clears
  // the stored token and reloads (the server reissues a fresh one).
  const logoutBtn = $("#logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem("axiom.token");
      location.reload();
    };
  }
  async function ensureLocalToken() {
    if (state.token) return;
    const r = await fetch("/api/auth/local");
    if (!r.ok) throw new Error("local auth endpoint failed");
    const j = await r.json();
    state.token = j.token; state.user = j.user;
    localStorage.setItem("axiom.token", state.token);
  }

  // ----- enter app -----
  async function enterApp() {
    try {
      const me = await api("/api/me");
      state.user = me;
    } catch { return resetToken(); }
    $("#app").style.display = "grid";
    populateServers();
    loadServerPops();                                  // label pickers with live pops
    setInterval(loadServerPops, 120000);               // keep them fresh
    renderMain();
    renderServerToggles();
    renderPartyRefiller();
    renderSmartUpgrade();
    const stateResp = await api("/api/state");
    state.flags = stateResp.flags || [];
    state.keys = stateResp.keys || [];
    renderServerToggles();
    renderPartyRefiller();
    openWs();
  }
  // A 401 means the stored token was issued under a different jwt.secret
  // (e.g. the server rotated it). Clear it and reload — the boot path
  // auto-fetches a fresh one.
  function resetToken() {
    localStorage.removeItem("axiom.token");
    location.reload();
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
        ...(opts.headers || {}),
      },
    });
    if (r.status === 401) { resetToken(); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error((await r.json()).error || "request failed");
    return r.json();
  }

  // ----- websocket -----
  function openWs() {
    if (state.ws) try { state.ws.close(); } catch {}
    const ws = new WebSocket(`ws://${location.hostname}:8090`);
    // ArrayBuffer for tagged binary forwards from a bot to /play.
    // Text frames carry JSON envelopes.
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      ws.send(JSON.stringify({ op: "auth", args: { token: state.token } }));
    };
    ws.onmessage = (ev) => {
      // The landing page only ever receives JSON envelopes; binary
      // packet forwards are subscribed to by /play, not here.
      if (typeof ev.data !== "string") return;
      let f;
      try { f = JSON.parse(ev.data); } catch { return; }
      if (!f || !f.op) return;
      switch (f.op) {
        case "ready":
          setWsState(true, `connected · uid ${f.data.userId}`);
          ws.send(JSON.stringify({ op: "list" }));
          break;
        case "sessions":
          state.sessions = f.data || [];
          renderSessions();
          tickPartyCreate();
          break;
        case "fleet":
          state.fleet = f.data || [];
          drawFleetMap();   // live-refresh the party map if one's open
          break;
        case "created":
          ws.send(JSON.stringify({ op: "list" }));
          break;
        case "closed":
          if (state.selectedSid === f.data?.id) { state.selectedSid = null; renderMain(); }
          ws.send(JSON.stringify({ op: "list" }));
          break;
        case "farmState":
          // Update the Farm Observer panel if the user's currently
          // looking at this session's detail view.
          if (f.sid === state.selectedSid) {
            state.farmState = f.data;
            updateFarmObserver();
          }
          break;
        case "smartUpgradeConfig":
          state.smartUpgrade = f.data || state.smartUpgrade;
          renderSmartUpgrade();
          if (state.selectedParty) renderMain();
          break;
        case "smartUpgrade":
          state.smartUpgradeStatus = f.data || null;
          if (f.config) state.smartUpgrade = f.config;
          renderSmartUpgrade();
          // Live-refresh the party view if one's open.
          if (state.selectedParty) updatePartyStatus();
          break;
        case "farmSpot":
          if (f.sid === state.selectedSid) {
            const sess = state.sessions.find((x) => x.id === f.sid);
            if (sess) sess.farmSpot = f.data;
            const lbl = document.getElementById("farmspot-label");
            if (lbl) lbl.textContent = f.data
              ? `${f.data.x | 0}, ${f.data.y | 0} @ ${f.data.angle | 0}°` : "no spot set";
          }
          break;
        case "nav":
          if (f.sid === state.selectedSid) {
            const sess = state.sessions.find((x) => x.id === f.sid);
            if (sess) sess.navActive = f.data.active;
          }
          break;
        case "error":
          console.warn("[ws]", f.data?.reason);
          toast(`error: ${f.data?.reason || "unknown"}`, "danger");
          break;
      }
    };
    ws.onclose = () => {
      setWsState(false, "disconnected · retrying");
      setTimeout(openWs, 2000);
    };
    state.ws = ws;
  }
  function send(frame) {
    if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(frame));
  }
  function setWsState(on, label) {
    $("#ws-dot").classList.toggle("on", on);
    $("#ws-label").textContent = label;
  }

  // ----- session list (grouped by server → party) -----
  function partyIdOf(s) {
    return (s.stats && s.stats.partyId) || (s.party && s.party.partyId) || null;
  }
  function renderSessions() {
    const list = $("#session-list");
    list.innerHTML = "";
    const count = $("#session-count");
    if (count) count.textContent = state.sessions.length ? `· ${state.sessions.length}` : "";
    if (state.sessions.length === 0) {
      list.appendChild(el("div", { class: "ax-empty", style: "height: auto; padding: 18px 12px" },
        el("div", { class: "ax-empty-icon" }, "∅"),
        el("div", { class: "ax-empty-text" }, "No sessions"),
        el("div", { class: "ax-empty-sub" }, "Click + to spawn one.")));
      return;
    }
    // Group: serverId -> partyId(or "none") -> [sessions]
    const byServer = new Map();
    for (const s of state.sessions) {
      if (!byServer.has(s.serverId)) byServer.set(s.serverId, new Map());
      const pid = partyIdOf(s);
      const key = pid != null ? String(pid) : "none";
      const parties = byServer.get(s.serverId);
      if (!parties.has(key)) parties.set(key, []);
      parties.get(key).push(s);
    }

    const enabledParties = new Set((state.smartUpgrade.parties || []).map(Number));

    for (const [serverId, parties] of [...byServer].sort()) {
      // Server header
      list.appendChild(el("div", {
        style: "font:600 9px var(--font);letter-spacing:1.4px;text-transform:uppercase;color:var(--text-dim);padding:10px 12px 4px",
      }, serverId));

      for (const [key, sessions] of parties) {
        const pid = key === "none" ? null : Number(key);
        const inParty = pid != null;
        const suOn = inParty && enabledParties.has(pid);
        const partyActive = state.selectedParty &&
          state.selectedParty.serverId === serverId && String(state.selectedParty.partyId) === key;

        // Party sub-header — clickable (opens the party menu).
        const head = el("div", {
          class: `ax-row ${partyActive ? "active" : ""}`,
          style: "padding:6px 12px;margin:1px 0",
          onclick: inParty ? () => selectParty(serverId, pid) : null,
          title: inParty ? "Open party menu" : "",
        },
          el("span", { class: `ax-row-dot ${suOn ? "on" : ""}`,
            title: suOn ? "Smart Upgrade ON" : "" }),
          el("span", { class: "ax-row-name", style: "font-weight:500" },
            inParty ? `Party ${pid}` : "No party"),
          el("span", { class: "ax-row-meta" },
            `${sessions.length}${suOn ? " · ⚡" : ""}`)
        );
        list.appendChild(head);

        // Sessions under the party (indented). Meta shows live gold (the
        // number you actually glance for) + a pickaxe while the bot is
        // out farming; uptime moved to the hover tooltip. The ▶ appears
        // on hover for one-click attach without selecting first.
        for (const s of sessions) {
          const st = s.stats || {};
          const dot = el("span", { class: `ax-row-dot ${s.status === "in_world" ? "on" : s.status === "closed" ? "err" : "warn"}` });
          const meta = s.status === "in_world"
            ? `${fmtShort(st.gold || 0)}g${s.navActive ? " ⛏" : ""}`
            : s.status;
          const attachBtn = el("button", {
            class: "ax-icon-btn ax-row-action", title: "Attach — open a /play tab on this session",
            onclick: (e) => { e.stopPropagation(); window.open(`/play?attach=${s.id}`, "_blank"); },
          }, "▶");
          list.appendChild(el("div", {
            class: `ax-row ${state.selectedSid === s.id ? "active" : ""}`,
            style: "padding-left:26px",
            title: `up ${fmtMs(s.uptimeMs)}`,
            onclick: () => selectSession(s.id),
          },
            dot,
            el("span", { class: "ax-row-name" }, s.label),
            el("span", { class: "ax-row-meta" }, meta),
            attachBtn
          ));
        }
      }
    }
    if (state.selectedSid !== null && !state.selectedParty) renderMain();
  }

  function fmtMs(ms) {
    if (!ms || ms < 1000) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }


  // ----- session selection (manages observe / unobserve subscriptions) -----
  // The dashboard subscribes via `op:observe` whenever a session is
  // selected so its Farm Observer panel gets live state. Switching
  // selection (or deselecting) tells the server to stop streaming the
  // previous one — keeps WS chatter bounded as the user clicks around.
  function selectSession(sid) {
    state.selectedParty = null;                     // leave any party view
    if (state.selectedSid === sid) { renderMain(); return; }
    if (state.selectedSid != null && state.ws && state.ws.readyState === 1) {
      state.ws.send(JSON.stringify({ op: "unobserve", sid: state.selectedSid }));
    }
    state.selectedSid = sid;
    state.farmState = null;
    if (sid != null && state.ws && state.ws.readyState === 1) {
      state.ws.send(JSON.stringify({ op: "observe", sid }));
    }
    renderSessions();
    renderMain();
  }

  // Open the party menu for a given server+party.
  function selectParty(serverId, partyId) {
    if (state.selectedSid != null && state.ws && state.ws.readyState === 1) {
      state.ws.send(JSON.stringify({ op: "unobserve", sid: state.selectedSid }));
    }
    state.selectedSid = null;
    state.selectedParty = { serverId, partyId };
    // Ask for a fresh status snapshot.
    send({ op: "smartUpgradeStatus" });
    renderSessions();
    renderMain();
  }

  // ----- Farm Observer panel -----
  // Renders the bot's autoFarm state into the session-detail view.
  // Called fresh by renderMain() AND on every farmState envelope so
  // the panel updates in place without re-rendering the whole detail.
  function updateFarmObserver() {
    const root = document.getElementById("farm-observer");
    if (!root) return;
    const s = state.farmState;
    if (!s) {
      root.innerHTML = `<div style="color: var(--text-dim); font: 11px var(--font); line-height: 1.6">
        <div style="color: var(--text-mute); margin-bottom: 4px; font-size: 12px;">Waiting for bot</div>
        Updates only while <b style="color:var(--text)">Auto Farm</b> is on
        for the selected session. Toggle Auto Farm in the
        session's behaviours panel.
      </div>`;
      return;
    }
    const status = s.hasFarmed     ? `<span style="color:var(--success)">done</span>`
                 : s.unstickActive ? `<span style="color:var(--warning)">unsticking</span>`
                 : s.moving        ? `<span style="color:#7dd3fc">walking</span>`
                 : s.target        ? `<span style="color:var(--success)">chopping</span>`
                                   : `<span style="color:var(--text-dim)">searching for pair</span>`;
    // Pair-only now — the "single" branch is gone server-side.
    const targetType = s.isPair
      ? `<span style="color:#cc88ff">pair</span>`
      : (s.target ? `<span style="color:var(--text-dim)">none</span>` : `<span style="color:var(--text-dim)">—</span>`);
    const treeCount  = (s.candidates || []).filter(c => c.model === "Tree"  && !c.bl).length;
    const stoneCount = (s.candidates || []).filter(c => c.model === "Stone" && !c.bl).length;
    root.innerHTML = `
      <div class="fo-grid" style="display:grid;grid-template-columns:72px 1fr;gap:5px 12px;font:11px var(--font-mono);color:var(--text-mute);line-height:1.5">
        <span>status</span>    <span>${status}</span>
        <span>target</span>    <span>${targetType}</span>
        <span>id</span>        <span style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.targetId || "—"}</span>
        <span>bot</span>       <span style="color:var(--text)">${s.playerPos.x}, ${s.playerPos.y}</span>
        <span>aim</span>       <span style="color:var(--text)">${s.target ? s.target.x + ", " + s.target.y : "—"}</span>
        <span>stuck</span>     <span style="color:${s.stuckAttempts > 0 ? "var(--warning)" : "var(--text)"}">${s.stuckTicks}t · ${s.stuckAttempts}/5</span>
        <span>wood</span>      <span style="color:var(--text)">${s.wood}</span>
        <span>stone</span>     <span style="color:var(--text)">${s.stone}</span>
        <span>nearby</span>    <span><span style="color:#86efac">${treeCount}T</span> · <span style="color:#aaaab4">${stoneCount}S</span></span>
        <span>blacklist</span> <span style="color:${s.blacklist.length ? "var(--danger)" : "var(--text-dim)"}">${s.blacklist.length}</span>
        ${s.navActive ? `<span>nav</span><span style="color:${navColor(s.navStatus)}">${s.navStatus}${s.navPath ? " · " + s.navPath.length + "wp" : ""}</span>` : ""}
      </div>
    `;
    drawFarmMap(s);
  }
  function navColor(st) {
    return st === "farming" ? "var(--success)"
         : st === "to-farm" || st === "returning" ? "#7dd3fc"
         : st === "nopath"  ? "var(--danger)"
         : st === "hold-night" || st === "hold-transition" ? "#a78bfa"
         : st === "home" ? "var(--success)"
         : "var(--text-mute)";
  }

  // ----- minimap -----
  // Tiny canvas centred on the bot, ±1500 unit window (matches the
  // bot's MAX_CHASE). Now renders:
  //   - bot dot              white, always centre
  //   - candidate trees      green dots
  //   - candidate stones     grey dots
  //   - blacklisted          red X over the same dot
  //   - target ring          purple (pair) / amber (stuck) / yellow (unstick)
  //   - target uids          paired ring around the two constituent entities
  //   - walk vector          line from bot to target
  function drawFarmMap(s) {
    const canvas = document.getElementById("farm-canvas");
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const RADIUS = 1500;
    const scale = (W / 2) / RADIUS;
    ctx2.clearRect(0, 0, W, H);

    // Grid backdrop
    ctx2.fillStyle = "rgba(255,255,255,0.025)";
    ctx2.fillRect(0, 0, W, H);
    ctx2.strokeStyle = "rgba(255,255,255,0.08)";
    ctx2.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx2.beginPath();
      ctx2.arc(W/2, H/2, (RADIUS / 4 * i) * scale, 0, Math.PI * 2);
      ctx2.stroke();
    }
    ctx2.beginPath();
    ctx2.moveTo(0, H/2); ctx2.lineTo(W, H/2);
    ctx2.moveTo(W/2, 0); ctx2.lineTo(W/2, H);
    ctx2.strokeStyle = "rgba(255,255,255,0.06)"; ctx2.stroke();

    const toLocal = (x, y) => ({
      x: W/2 + (x - s.playerPos.x) * scale,
      y: H/2 + (y - s.playerPos.y) * scale,
    });

    // Render candidate trees + stones first so target indicators draw on top.
    const targetUids = new Set(s.targetUids || []);
    for (const c of s.candidates || []) {
      const p = toLocal(c.x, c.y);
      const isTree = c.model === "Tree";
      const isTarget = targetUids.has(c.uid);
      if (c.bl) {
        // blacklisted: small red dot + X
        ctx2.fillStyle = "rgba(248,113,113,0.5)";
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = "#f87171";
        ctx2.lineWidth = 1.5;
        ctx2.beginPath();
        ctx2.moveTo(p.x - 4, p.y - 4); ctx2.lineTo(p.x + 4, p.y + 4);
        ctx2.moveTo(p.x + 4, p.y - 4); ctx2.lineTo(p.x - 4, p.y + 4);
        ctx2.stroke();
      } else {
        ctx2.fillStyle = isTree ? "rgba(134,239,172,0.85)" : "rgba(170,170,180,0.85)";
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, isTarget ? 4.5 : 3, 0, Math.PI * 2);
        ctx2.fill();
        if (isTarget) {
          // Halo around the target entities — both members of the pair.
          ctx2.strokeStyle = "#cc88ff";
          ctx2.lineWidth = 1.5;
          ctx2.beginPath();
          ctx2.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx2.stroke();
        }
      }
    }

    // Walk vector + main target ring at the midpoint
    if (s.target) {
      const p = toLocal(s.target.x, s.target.y);
      ctx2.strokeStyle = s.moving ? "rgba(125,211,252,0.7)" : "rgba(120,120,130,0.4)";
      ctx2.lineWidth = 1.5;
      ctx2.beginPath();
      ctx2.moveTo(W/2, H/2); ctx2.lineTo(p.x, p.y); ctx2.stroke();

      const color = s.unstickActive ? "#fcd34d"
                  : s.stuckAttempts > 0 ? "#fb923c"
                  : s.isPair ? "#cc88ff"
                  : "#ffffff";
      ctx2.strokeStyle = color;
      ctx2.fillStyle = color + "33";  // 0x33 ≈ 20 % alpha
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx2.fill(); ctx2.stroke();
    }

    // Navigation path (cyan polyline bot → … → spot).
    if (s.navPath && s.navPath.length) {
      ctx2.strokeStyle = "rgba(125,211,252,0.85)";
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(W / 2, H / 2);
      for (const wp of s.navPath) { const p = toLocal(wp.x, wp.y); ctx2.lineTo(p.x, p.y); }
      ctx2.stroke();
      // Waypoint dots
      ctx2.fillStyle = "rgba(125,211,252,0.9)";
      for (const wp of s.navPath) {
        const p = toLocal(wp.x, wp.y);
        ctx2.beginPath(); ctx2.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx2.fill();
      }
    }
    // Farm spot marker (yellow ◎ + aim tick at the marked angle).
    if (s.farmSpot) {
      const p = toLocal(s.farmSpot.x, s.farmSpot.y);
      ctx2.strokeStyle = "#fcd34d"; ctx2.lineWidth = 2;
      ctx2.beginPath(); ctx2.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx2.stroke();
      ctx2.beginPath(); ctx2.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx2.fill ? (ctx2.fillStyle = "#fcd34d", ctx2.fill()) : null;
      // aim tick — zombs.io yaw: 0=up, 90=right (clockwise). Convert.
      const a = ((s.farmSpot.angle - 90) * Math.PI) / 180;
      ctx2.beginPath();
      ctx2.moveTo(p.x, p.y);
      ctx2.lineTo(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16);
      ctx2.stroke();
    }

    // Home marker (green ⌂ — base position the bot returns to).
    if (s.navHome) {
      const p = toLocal(s.navHome.x, s.navHome.y);
      ctx2.strokeStyle = "#86efac"; ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.rect(p.x - 6, p.y - 6, 12, 12);
      ctx2.stroke();
    }

    // Bot dot — drawn last so it's always on top.
    ctx2.fillStyle = "#ffffff";
    ctx2.beginPath();
    ctx2.arc(W/2, H/2, 3.5, 0, Math.PI * 2);
    ctx2.fill();
  }

  // Open a /play tab attached to every session in the list (multi-attach).
  // Browsers gate multiple window.open() behind the active user gesture —
  // the previous setTimeout stagger ran the opens OUTSIDE the gesture, so
  // the popup blocker dropped all but the first ("one at a time"). Opening
  // them all SYNCHRONOUSLY inside the click handler keeps them in-gesture,
  // so the browser allows the whole batch (once popups are permitted).
  function attachAll(sessions) {
    const list = (sessions || []).filter((s) => s && s.id != null);
    if (list.length === 0) { toast("No sessions to attach.", "danger"); return; }
    let opened = 0;
    for (const s of list) {
      const w = window.open(`/play?attach=${s.id}`, `axiom_attach_${s.id}`);
      if (w) opened++;
    }
    if (opened < list.length) {
      toast(`Opened ${opened}/${list.length} — allow pop-ups for this site to open all.`, "danger");
    } else {
      toast(`Opening ${opened} attach tab${opened === 1 ? "" : "s"}…`);
    }
  }

  // Spawn a new session joined to the given session's party. The new
  // session inherits the PARTY LEADER's in-game name — so everyone in
  // the party shares the same name (e.g. all "test"). Falls back to the
  // clicked session's own name if the leader can't be resolved.
  function spawnIntoParty(s) {
    const psk = (s.party && s.party.shareKey) || s.psk || "";
    if (!psk) {
      toast("That session has no party share key yet — open a party on it first.", "danger");
      return;
    }
    // Resolve the party leader's display name.
    const leader = (s.members || []).find((m) => m.isLeader);
    const leaderName =
      (leader && leader.displayName) ||
      (s.stats && s.stats.name) ||
      s.playerName || "Player";
    // zombs.io display names cap at 29 chars.
    const name = leaderName.slice(0, 29);
    // Indexed dashboard label: "<name> N" where N is the next free index
    // among existing "<name> *" labels — so the session list stays
    // distinguishable even though every in-game name is the same.
    const re = new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " (\\d+)$");
    let maxIdx = 0;
    for (const x of state.sessions) {
      const m = re.exec(x.label || "");
      if (m) maxIdx = Math.max(maxIdx, +m[1]);
    }
    const label = `${name} ${maxIdx + 1}`;
    send({ op: "create", args: {
      label,                  // indexed → "test 1", "test 2", …
      serverId: s.serverId,
      playerName: name,       // in-game name = the leader's name (all the same)
      psk,
    }});
    toast(`Spawning "${label}" into the party…`);
  }

  // Open the /play attach tab for a session, or focus it if one is
  // already open. The window NAME (axiom_attach_<id>) is the focus key:
  // window.open with an existing name reuses that tab instead of making
  // a new one.
  const _attachWins = {};   // id -> Window handle (this dashboard session)
  function openOrFocusAttach(id) {
    if (id == null) return;
    const key = String(id);
    // If we already hold a live handle to this bot's tab, just focus it —
    // re-calling window.open(url, name) would RELOAD the existing tab.
    const existing = _attachWins[key];
    if (existing && !existing.closed) {
      try { existing.focus(); return; } catch {}
    }
    const w = window.open(`/play?attach=${id}`, `axiom_attach_${id}`);
    if (w) { _attachWins[key] = w; try { w.focus(); } catch {} }
  }

  // ----- party fleet map -----
  // Bots belonging to the currently-open party (matched via the session
  // list so it tracks whatever partyIdOf resolves to).
  function fleetForOpenParty() {
    if (!state.selectedParty) return [];
    const { serverId, partyId } = state.selectedParty;
    const ids = new Set(state.sessions
      .filter((s) => s.serverId === serverId && String(partyIdOf(s)) === String(partyId))
      .map((s) => s.id));
    return (state.fleet || []).filter((b) => ids.has(b.id));
  }
  function drawFleetMap() {
    const pm = state._partyMap;
    if (!pm || !pm.canvas || !pm.canvas.isConnected) return;
    const cv = pm.canvas, ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 600, H = cv.clientHeight || 460;
    if (cv.width !== ((W * dpr) | 0) || cv.height !== ((H * dpr) | 0)) {
      cv.width = (W * dpr) | 0; cv.height = (H * dpr) | 0;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    pm.hits = [];

    const bots = fleetForOpenParty();
    // Collect every world point so we can frame the view around all of it.
    const pts = [];
    for (const b of bots) {
      if (b.pos) pts.push(b.pos);
      if (b.base) pts.push(b.base);
      if (b.farmSpot) pts.push(b.farmSpot);
      if (b.path) for (const p of b.path) pts.push(p);
    }
    if (pts.length === 0) {
      ctx.fillStyle = "#5a5a63"; ctx.font = "13px ui-monospace, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("waiting for live positions…", W / 2, H / 2);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    // Frame with a UNIFORM (square) world span centred on everything, so the
    // base and farm stay correctly placed relative to each other (no
    // x/y distortion) and the whole party is always in view.
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const MIN_SPAN = 500;                       // don't over-zoom a tight cluster
    const span = Math.max(maxX - minX, maxY - minY, MIN_SPAN) * 1.25;  // 25% margin
    const PADPX = 26;                           // inner pixel padding
    const usableW = W - PADPX * 2, usableH = H - PADPX * 2;
    const scale = Math.min(usableW, usableH) / span;
    const offX = (W - span * scale) / 2, offY = (H - span * scale) / 2;
    const tx = (x) => (x - (cx - span / 2)) * scale + offX;
    const ty = (y) => (y - (cy - span / 2)) * scale + offY;

    // ── Grid background (one line per ~tile, faded) ──
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
    const GRID = 480;   // world units between grid lines (10 building tiles)
    const gx0 = Math.ceil((cx - span / 2) / GRID) * GRID;
    for (let gx = gx0; gx < cx + span / 2; gx += GRID) {
      const sx = tx(gx); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    const gy0 = Math.ceil((cy - span / 2) / GRID) * GRID;
    for (let gy = gy0; gy < cy + span / 2; gy += GRID) {
      const sy = ty(gy); ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }

    // ── Paths (under markers) ──
    for (const b of bots) {
      if (!b.path || b.path.length < 2) continue;
      ctx.strokeStyle = "rgba(125,211,252,0.30)"; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(tx(b.path[0].x), ty(b.path[0].y));
      for (const p of b.path) ctx.lineTo(tx(p.x), ty(p.y));
      ctx.stroke(); ctx.setLineDash([]);
    }

    const labelPt = (x, y, text, color) => {
      ctx.fillStyle = color; ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(text, x, y - 12);
    };

    // ── Base markers (◆ + "BASE") ──
    const drawnBase = new Set();
    for (const b of bots) {
      if (!b.base) continue;
      const key = (b.base.x | 0) + "," + (b.base.y | 0);
      if (drawnBase.has(key)) continue; drawnBase.add(key);
      const x = tx(b.base.x), y = ty(b.base.y);
      ctx.fillStyle = "#fcd34d"; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      labelPt(x, y, "BASE", "#fcd34d");
    }
    // ── Farm markers (✛ + "FARM") ──
    const drawnFarm = new Set();
    for (const b of bots) {
      if (!b.farmSpot) continue;
      const key = (b.farmSpot.x | 0) + "," + (b.farmSpot.y | 0);
      if (drawnFarm.has(key)) continue; drawnFarm.add(key);
      const x = tx(b.farmSpot.x), y = ty(b.farmSpot.y);
      ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(74,222,128,0.4)";
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
      labelPt(x, y, "FARM", "#4ade80");
    }
    // ── Bots on top ──
    for (const b of bots) {
      if (!b.pos) continue;
      const x = tx(b.pos.x), y = ty(b.pos.y);
      const moving = b.navStatus === "to-farm" || b.navStatus === "returning";
      const farming = b.navStatus === "farming" || b.navStatus === "farm-hold" || b.navStatus === "farm-hold-night";
      const color = b.dead ? "#f87171" : farming ? "#4ade80" : moving ? "#7dd3fc" : "#cbd5e1";
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#0c0c0e"; ctx.stroke();
      ctx.fillStyle = "#f1f5f9"; ctx.font = "600 11px ui-monospace, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(b.label || ("#" + b.id), x, y - 11);
      pm.hits.push({ x, y, r: 10, id: b.id });
    }

    // ── Legend (bottom-left) ──
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "10px ui-monospace, monospace";
    const leg = [["#4ade80", "farming"], ["#7dd3fc", "moving"], ["#cbd5e1", "idle"], ["#f87171", "dead"]];
    let lx = 10; const ly = H - 12;
    for (const [c, t] of leg) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx + 4, ly, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8a8a93"; ctx.fillText(t, lx + 12, ly + 1);
      lx += 14 + ctx.measureText(t).width + 12;
    }
  }
  function handleFleetMapClick(e) {
    const pm = state._partyMap;
    if (!pm || !pm.canvas) return;
    const rect = pm.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD = Infinity;
    for (const h of (pm.hits || [])) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d <= Math.max(h.r, 12) && d < bestD) { bestD = d; best = h; }
    }
    if (best) showBotMenu(best.id, e.clientX, e.clientY);
    else closeBotMenu();
  }

  // ----- per-bot action menu (party map) -----
  function closeBotMenu() {
    const m = document.getElementById("ax-botmenu");
    if (m) m.remove();
    if (state._botMenuOff) { document.removeEventListener("mousedown", state._botMenuOff, true); state._botMenuOff = null; }
  }
  function showBotMenu(botId, px, py) {
    closeBotMenu();
    const fleet = fleetForOpenParty();
    const me = fleet.find((b) => b.id === botId);
    const session = state.sessions.find((s) => s.id === botId);
    const label = (me && me.label) || (session && session.label) || ("#" + botId);
    const others = fleet.filter((b) => b.id !== botId);
    const target = me && me.pos;   // where to bring others

    const menu = el("div", { id: "ax-botmenu", style:
      "position:fixed;z-index:100000;min-width:210px;max-width:280px;background:var(--bg-panel);" +
      "border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);padding:6px;" +
      "font:13px var(--font);color:var(--text)" });
    menu.onmousedown = (ev) => ev.stopPropagation();   // keep clicks inside
    menu.appendChild(el("div", { style:
      "padding:6px 8px 8px;font:600 12px var(--font-mono);color:var(--text-dim);" +
      "border-bottom:1px solid var(--border);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" },
      label));

    const item = (txt, onClick, opts = {}) => {
      const b = el("button", { class: "ax-btn ghost", style:
        "display:block;width:100%;text-align:left;margin:2px 0;" + (opts.style || "") }, txt);
      b.onclick = onClick;
      if (opts.disabled) { b.disabled = true; b.style.opacity = "0.5"; b.style.cursor = "default"; }
      menu.appendChild(b);
      return b;
    };

    item("▶  Open session", () => { openOrFocusAttach(botId); closeBotMenu(); });

    const farmOn = session && session.behaviours && session.behaviours.autoFarm;
    item(farmOn ? "✓  Auto farmer (on)" : "⛏  Enable auto farmer", () => {
      send({ sid: botId, op: "setBehaviour", args: { key: "autoFarm", value: !farmOn } });
      closeBotMenu();
    });

    // ── Bring other sessions here (expandable, default none selected) ──
    const bringBtn = item(
      "↪  Bring other sessions here" + (others.length ? "" : "  (none)"),
      () => { sub.style.display = sub.style.display === "none" ? "block" : "none"; },
      { disabled: !others.length || !target });

    const sub = el("div", { style: "display:none;padding:4px 4px 2px" });
    const picked = new Set();
    const confirm = el("button", { class: "ax-btn primary", style: "width:100%;margin-top:6px", disabled: true },
      "Bring 0 selected");
    const refresh = () => {
      confirm.textContent = `Bring ${picked.size} selected`;
      confirm.disabled = picked.size === 0;
    };
    for (const o of others) {
      const row = el("label", { style:
        "display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px" });
      const cb = el("input", { type: "checkbox" });
      cb.onchange = () => { cb.checked ? picked.add(o.id) : picked.delete(o.id); refresh(); };
      row.appendChild(cb);
      row.appendChild(el("span", { style: "flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" },
        o.label || ("#" + o.id)));
      sub.appendChild(row);
    }
    confirm.onclick = () => {
      if (!target || picked.size === 0) return;
      for (const id of picked) {
        send({ sid: id, op: "gotoPoint", args: { x: target.x, y: target.y } });
      }
      toast(`Bringing ${picked.size} session${picked.size === 1 ? "" : "s"} to ${label}…`);
      closeBotMenu();
    };
    sub.appendChild(confirm);
    menu.appendChild(sub);
    void bringBtn;

    document.body.appendChild(menu);
    // Position within the viewport.
    const r = menu.getBoundingClientRect();
    const x = Math.min(px, window.innerWidth - r.width - 8);
    const y = Math.min(py, window.innerHeight - r.height - 8);
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top = Math.max(8, y) + "px";
    // Click anywhere OUTSIDE the menu closes it (clicks inside are kept).
    state._botMenuOff = (ev) => {
      const m = document.getElementById("ax-botmenu");
      if (m && m.contains(ev.target)) return;
      closeBotMenu();
    };
    setTimeout(() => document.addEventListener("mousedown", state._botMenuOff, true), 0);
  }

  // ----- per-server farm presets -----
  // Mirror of the server's computeSpots (defaultSchema scr_smartFarm): lay
  // bots on the perpendicular bisector of the tree↔stone segment so each is
  // equidistant to both, aiming at the midpoint.
  function computeFarmSpots(tree, stone, n) {
    const mx = (tree.x + stone.x) / 2, my = (tree.y + stone.y) / 2;
    const ax = stone.x - tree.x, ay = stone.y - tree.y;
    const D = Math.hypot(ax, ay) || 1;
    const px = -ay / D, py = ax / D;
    const CLEAR = 72, MAXR = 98, half = D / 2;
    const minO = Math.sqrt(Math.max(0, CLEAR * CLEAR - half * half));
    const maxO = Math.max(minO + 1, Math.sqrt(Math.max(0, MAXR * MAXR - half * half)));
    const perSide = Math.ceil(n / 2);
    const step = perSide > 1 ? (maxO - minO) / (perSide - 1) : 0;
    const spots = [];
    for (let i = 0; i < n; i++) {
      const side = (i % 2 === 0) ? 1 : -1;
      const rank = Math.floor(i / 2);
      const o = side * (minO + rank * step);
      const sx = Math.round(mx + px * o), sy = Math.round(my + py * o);
      const aim = Math.round((Math.atan2(my - sy, mx - sx) * 180 / Math.PI + 450) % 360);
      spots.push({ x: sx, y: sy, angle: aim });
    }
    return spots;
  }
  function farmPresets(serverId) {
    try { return JSON.parse(localStorage.getItem("axiom.farmPresets." + serverId) || "[]"); }
    catch { return []; }
  }
  function saveFarmPresets(serverId, list) {
    localStorage.setItem("axiom.farmPresets." + serverId, JSON.stringify(list));
  }
  // The tree+stone currently being farmed by this party (from the fleet).
  function currentFarmTargets() {
    const b = fleetForOpenParty().find((x) => x.farmTargets && x.farmTargets.length > 1);
    return b ? b.farmTargets : null;
  }
  function applyFarmPreset(preset) {
    const ids = fleetForOpenParty().map((b) => b.id).sort((a, b) => a - b);
    if (!ids.length) { toast("No party sessions to assign.", "danger"); return; }
    const tree = preset.targets[0], stone = preset.targets[1];
    const spots = computeFarmSpots(tree, stone, ids.length);
    const targets = [{ x: tree.x, y: tree.y }, { x: stone.x, y: stone.y }];
    ids.forEach((id, idx) => {
      const s = spots[idx];
      send({ op: "setFarmSpot", sid: id, args: { x: s.x, y: s.y, angle: s.angle, fixed: true, targets } });
      send({ op: "setNav", sid: id, args: { on: true, returnToBase: true } });
    });
    toast(`Applied "${preset.name}" to ${ids.length} bot${ids.length === 1 ? "" : "s"}.`);
  }
  function buildFarmPresetsCard(serverId) {
    const card = el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "farm presets"),
      el("div", { class: "ax-card-hint" },
        "Save the active Smart Farm location for this server, then one-click apply it to the whole party."));
    const list = el("div", {});
    const refresh = () => {
      list.innerHTML = "";
      const presets = farmPresets(serverId);
      if (!presets.length) {
        list.appendChild(el("div", { style: "font-size:11px;color:var(--text-dim);padding:6px 0" },
          "No presets for this server yet — run Smart Farm Setup in-game, then Save."));
      }
      presets.forEach((p, i) => {
        list.appendChild(el("div", { style: "display:flex;align-items:center;gap:8px;padding:5px 0" },
          el("span", { style: "flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, p.name),
          el("button", { class: "ax-btn", onclick: () => applyFarmPreset(p) }, "Apply"),
          el("button", { class: "ax-btn ghost", title: "Delete",
            onclick: () => { const l = farmPresets(serverId); l.splice(i, 1); saveFarmPresets(serverId, l); refresh(); } }, "✕")));
      });
    };
    const saveBtn = el("button", { class: "ax-btn primary", style: "margin-top:8px" }, "＋ Save current farm");
    saveBtn.onclick = () => {
      const targets = currentFarmTargets();
      if (!targets) { toast("No active Smart Farm — run Smart Farm Setup in-game first.", "danger"); return; }
      const name = prompt("Preset name:", "Farm " + (farmPresets(serverId).length + 1));
      if (!name) return;
      const l = farmPresets(serverId);
      l.push({ name: name.slice(0, 40), targets: targets.map((t) => ({ x: t.x | 0, y: t.y | 0 })) });
      saveFarmPresets(serverId, l);
      refresh();
      toast(`Saved "${name}".`);
    };
    card.appendChild(list);
    card.appendChild(saveBtn);
    refresh();
    return card;
  }

  // ----- party menu -----
  // Finds the live smart-upgrade status group for the selected party.
  function partyStatusGroup() {
    const st = state.smartUpgradeStatus;
    if (!st || !st.groups || !state.selectedParty) return null;
    return st.groups.find((g) => String(g.partyId) === String(state.selectedParty.partyId)) || null;
  }
  function renderPartyView(main) {
    closeBotMenu();   // drop any stale per-bot menu from a previous view
    const { serverId, partyId } = state.selectedParty;
    const sessions = state.sessions.filter(
      (s) => s.serverId === serverId && String(partyIdOf(s)) === String(partyId));
    const enabled = (state.smartUpgrade.parties || []).map(Number).includes(Number(partyId));
    const cfg = state.smartUpgrade;

    // Header (with multi-attach + spawn buttons)
    main.appendChild(el("div", { style: "display:flex;align-items:center;gap:14px;margin-bottom:18px" },
      el("div", { style: `width:48px;height:48px;border-radius:8px;background:var(--bg-panel);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font:600 18px var(--font-mono);color:var(--text)` }, "⚡"),
      el("div", {},
        el("div", { style: "font-size:18px;font-weight:500" }, `Party ${partyId}`),
        el("div", { style: "color:var(--text-dim);font:11px var(--font-mono);margin-top:3px" },
          `${serverId} · ${sessions.length} session${sessions.length === 1 ? "" : "s"}`)),
      el("div", { style: "margin-left:auto;display:flex;gap:8px" },
        el("button", { class: "ax-btn primary",
          title: "Open a /play tab attached to every session in this party",
          onclick: () => attachAll(sessions) }, `▶ Attach all (${sessions.length})`),
        el("button", { class: "ax-btn",
          onclick: () => sessions[0] && spawnIntoParty(sessions[0]) }, "+ Spawn in party"))
    ));

    // Live party map (base + bots + farm spots + paths)
    const mapCard = el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "party map"),
      el("div", { class: "ax-card-hint" },
        "Live overhead view, auto-centred on the whole party. ◆ base · ✛ farm · ● bot. Click a bot for actions (open / auto-farm / bring others)."));
    const mapCanvas = el("canvas", {
      style: "width:100%;height:460px;display:block;border-radius:8px;background:#0c0c0e;border:1px solid var(--border);margin-top:8px;cursor:pointer",
    });
    mapCard.appendChild(mapCanvas);
    main.appendChild(mapCard);
    state._partyMap = { canvas: mapCanvas, hits: [] };
    mapCanvas.onclick = (e) => handleFleetMapClick(e);
    setTimeout(drawFleetMap, 0);

    // Smart Upgrade card
    const suToggle = el("button", { class: `ax-toggle ${enabled ? "on" : ""}` });
    suToggle.onclick = () => {
      const nv = !suToggle.classList.contains("on");
      suToggle.classList.toggle("on", nv);
      send({ op: "smartUpgradeParty", args: { partyId: Number(partyId), enabled: nv } });
    };
    const aheadVal = el("span", { style: "font:11px var(--font-mono);color:var(--text-mute);min-width:18px;text-align:right" }, (cfg.aheadBy ?? 2) + "");
    const aheadSlider = el("input", { type: "range", min: 0, max: 7, step: 1, value: cfg.aheadBy ?? 2, style: "flex:1" });
    aheadSlider.oninput = () => { aheadVal.textContent = aheadSlider.value; };
    aheadSlider.onchange = () => send({ op: "smartUpgradeTuning", args: { aheadBy: +aheadSlider.value } });
    const farmToggle = el("button", { class: `ax-toggle ${cfg.farmWhenSaving !== false ? "on" : ""}` });
    farmToggle.onclick = () => {
      const nv = !farmToggle.classList.contains("on");
      farmToggle.classList.toggle("on", nv);
      send({ op: "smartUpgradeTuning", args: { farmWhenSaving: nv } });
    };
    const rebuildToggle = el("button", { class: `ax-toggle ${cfg.autoRebuild !== false ? "on" : ""}` });
    rebuildToggle.onclick = () => {
      const nv = !rebuildToggle.classList.contains("on");
      rebuildToggle.classList.toggle("on", nv);
      send({ op: "smartUpgradeTuning", args: { autoRebuild: nv } });
    };
    const doneSelect = el("select", { class: "ax-input", style: "flex:1;max-width:170px" });
    for (const [v, lbl] of [["keep", "Keep farming"], ["stop", "Stop farming"], ["base", "Return to base"]]) {
      const opt = el("option", { value: v }, lbl);
      if ((cfg.whenDone || "keep") === v) opt.selected = true;
      doneSelect.appendChild(opt);
    }
    doneSelect.onchange = () => send({ op: "smartUpgradeTuning", args: { whenDone: doneSelect.value } });

    main.appendChild(el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "smart upgrade"),
      el("div", { class: "ax-card-hint" },
        "Economy-first: keeps GoldStash + GoldMines ahead, then towers, then walls. Spends every session's materials and retreats idle bots to their farm spots while saving."),
      el("div", { class: "ax-ctrl-row", style: "padding:8px 0;border:none" },
        el("span", { class: "ax-ctrl-label" }, "Enable for this party"), suToggle),
      el("div", { style: "display:flex;align-items:center;gap:8px;padding:6px 0" },
        el("span", { style: "font-size:11px;color:var(--text-mute);min-width:120px" }, "Economy tiers ahead"),
        aheadSlider, aheadVal),
      el("div", { class: "ax-ctrl-row", style: "padding:8px 0;border:none" },
        el("span", { class: "ax-ctrl-label" }, "Farm-retreat while saving"), farmToggle),
      el("div", { class: "ax-ctrl-row", style: "padding:8px 0;border:none" },
        el("span", { class: "ax-ctrl-label" }, "Auto-rebuild dead buildings"), rebuildToggle),
      el("div", { style: "display:flex;align-items:center;gap:8px;padding:6px 0" },
        el("span", { style: "font-size:11px;color:var(--text-mute);min-width:120px" }, "When fully upgraded"),
        doneSelect),
      el("div", { id: "party-su-status", style: "margin-top:10px;padding-top:10px;border-top:1px solid var(--glass-divider,var(--border))" })
    ));
    updatePartyStatus();

    // Farm presets (per server)
    main.appendChild(buildFarmPresetsCard(serverId));

    // Members card
    const memCard = el("div", { class: "ax-card" }, el("div", { class: "ax-card-title" }, "members"));
    for (const s of sessions) {
      const st0 = s.stats || {};
      memCard.appendChild(el("div", { class: "ax-row", style: "border:none;cursor:pointer", onclick: () => selectSession(s.id) },
        el("span", { class: `ax-row-dot ${s.status === "in_world" ? "on" : "warn"}` }),
        el("span", { class: "ax-row-name" }, s.label),
        el("span", { class: "ax-row-meta" },
          `${fmtShort(st0.gold || 0)}g ${fmtShort(st0.wood || 0)}w ${fmtShort(st0.stone || 0)}s`)));
    }
    main.appendChild(memCard);
  }

  // Repaints just the #party-su-status block from live status.
  function updatePartyStatus() {
    const root = document.getElementById("party-su-status");
    if (!root) return;
    const g = partyStatusGroup();
    if (!g) {
      root.innerHTML = `<div style="color:var(--text-dim);font:11px var(--font)">Enable to see the base analysis + live upgrades.</div>`;
      return;
    }
    if (g.note) { root.innerHTML = `<div style="color:var(--text-dim);font:11px var(--font)">${g.note}</div>`; return; }
    let html = "";
    if (g.summary) {
      html += `<div style="font:9px var(--font);color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">base · ${g.buildings} buildings</div>`;
      for (const [type, s] of Object.entries(g.summary)) {
        const eco = type === "GoldStash" || type === "GoldMine";
        const def = (type === "CannonTower"||type==="ArrowTower"||type==="MagicTower"||type==="BombTower"||type==="MeleeTower"||type==="Harvester");
        const col = eco ? "#fcd34d" : def ? "#7dd3fc" : "var(--text-dim)";
        const tier = s.minTier === s.maxTier ? `T${s.minTier}` : `T${s.minTier}–${s.maxTier}`;
        html += `<div style="display:flex;justify-content:space-between;font:10px var(--font-mono);padding:1px 0"><span style="color:${col}">${s.count}× ${type}</span><span style="color:var(--text-mute)">${tier}</span></div>`;
      }
    }
    if (g.materials) {
      const goal = g.farmCeil ? ` <span style="color:var(--text-dim)">(farm goal ${fmtShort(g.farmCeil)})</span>` : "";
      html += `<div style="font:9px var(--font);color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin:6px 0 4px">materials${goal}</div>`;
      for (const m of g.materials) {
        html += `<div style="font:10px var(--font-mono);color:var(--text-mute);padding:1px 0">${m.label}: ${fmtShort(m.gold)}g ${fmtShort(m.wood)}w ${fmtShort(m.stone)}s${m.farming ? ` <span style="color:#86efac">⛏ farming</span>` : ""}</div>`;
      }
    }
    if (g.lastActions && g.lastActions.length) {
      html += `<div style="margin-top:6px;font:10px var(--font-mono);color:#86efac">↑ ${g.lastActions.length} upgrade${g.lastActions.length === 1 ? "" : "s"} this tick</div>`;
      for (const a of g.lastActions.slice(0, 5))
        html += `<div style="font:9px var(--font-mono);color:var(--text-dim);padding-left:8px">${a.type} T${a.fromTier}→${a.toTier}</div>`;
    }
    root.innerHTML = html;
  }

  // ----- main pane -----
  function renderMain() {
    const main = $("#main");
    // Stagger-animate the cards ONLY when the view changes (a different
    // session/party/overview was selected) — live data refreshes re-render
    // the same view every second and must not replay the entrance.
    const viewKey = state.selectedParty
      ? `p:${state.selectedParty.serverId}:${state.selectedParty.partyId}`
      : state.selectedSid !== null ? `s:${state.selectedSid}` : "overview";
    if (state._lastViewKey !== viewKey) {
      state._lastViewKey = viewKey;
      main.classList.add("ax-view-enter");
      clearTimeout(state._viewEnterT);
      state._viewEnterT = setTimeout(() => main.classList.remove("ax-view-enter"), 650);
    }
    main.innerHTML = "";
    if (state.selectedParty) { renderPartyView(main); return; }
    if (state.selectedSid === null) {
      // overview
      const overview = el("div", {},
        el("h1", { style: "font-size: 22px; font-weight: 600; margin-bottom: 6px" }, "Welcome, " + state.user.username),
        el("p", { style: "color: var(--text-mute); margin-bottom: 24px" },
          "Spawn a session to keep a bot in-game persistently, or play directly in your browser."),
        el("div", { class: "ax-actions" },
          el("button", { class: "ax-btn primary", onclick: () => window.open("/play", "_blank") }, "▶ Play in browser"),
          el("button", { class: "ax-btn", onclick: openNewSessionModal }, "+ Spawn session"),
          el("button", { class: "ax-btn", onclick: () => $("#new-party-btn").click() }, "⊕ Create party"))
      );
      main.appendChild(overview);
      return;
    }
    const s = state.sessions.find((x) => x.id === state.selectedSid);
    if (!s) { state.selectedSid = null; renderMain(); return; }
    const initials = s.label.slice(0, 2).toUpperCase();
    const stColor = s.status === "in_world" ? "var(--success)"
                  : s.status === "closed" ? "var(--danger)" : "var(--warning)";
    const playerName = (s.stats && s.stats.name) || s.playerName || "";
    const head = el("div", { style: "display:flex; align-items:center; gap:14px; margin-bottom:18px" },
      el("div", { style: `position:relative; width:48px; height:48px; border-radius:12px;
                          background:var(--bg-panel); border:1px solid var(--border);
                          display:flex; align-items:center; justify-content:center;
                          font:600 16px var(--font-mono); color: var(--text)` },
        initials,
        el("span", { title: s.status,
          style: `position:absolute; right:-3px; bottom:-3px; width:11px; height:11px;
                  border-radius:50%; background:${stColor}; border:2px solid var(--bg)` })),
      el("div", {},
        el("div", { style: "display:flex; align-items:center; gap:8px" },
          el("div", { style: "font-size: 18px; font-weight: 500" }, s.label),
          el("button", { class: "ax-icon-btn", title: "Rename session",
            onclick: () => {
              const v = prompt("New label:", s.label);
              if (v && v.trim()) send({ op: "rename", sid: s.id, args: { label: v.trim().slice(0, 30) } });
            } }, "✎")),
        el("div", { style: "color: var(--text-dim); font: 11px var(--font-mono); margin-top: 3px" },
          `#${s.id} · ${s.serverId}${playerName ? " · " + playerName : ""} · ${s.status} · up ${fmtMs(s.uptimeMs)}`)
      ),
      el("div", { style: "margin-left: auto; display: flex; gap: 8px" },
        el("button", { class: "ax-btn primary",
          onclick: () => window.open(`/play?attach=${s.id}`, "_blank") }, "▶ Attach"),
        el("button", { class: "ax-btn",
          title: "Spawn a new session into this session's party (same server + PSK)",
          onclick: () => spawnIntoParty(s) }, "+ Spawn in party"),
        el("button", { class: "ax-btn danger",
          onclick: () => { if (confirm(`Close ${s.label}?`)) {
              send({ op: "close", sid: s.id }); state.selectedSid = null; renderMain();
          } } }, "× Close")
      )
    );
    main.appendChild(head);

    // -------- Live stats card --------
    // First card: the numbers you check most. Chips + an HP bar instead
    // of the old two-column label/value table. (The rename card is gone —
    // renaming is the ✎ button in the header now.)
    const stats = s.stats || {};
    const fmtN = (n) => (n || 0).toLocaleString();
    const hpPct = stats.maxHealth ? Math.max(0, Math.min(1, stats.health / stats.maxHealth)) : 0;
    const hpCol = hpPct > 0.5 ? "var(--success)" : hpPct > 0.25 ? "var(--warning)" : "var(--danger)";
    const chip = (label, value) =>
      el("div", { style: "flex:1;min-width:88px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid var(--glass-divider);border-radius:10px" },
        el("div", { style: "font:9px var(--font);letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin-bottom:3px" }, label),
        el("div", { style: "font:500 14px var(--font-mono);color:var(--text)" }, value));
    main.appendChild(el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "live stats"),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" },
        chip("Wave", fmtN(stats.wave)), chip("Score", fmtN(stats.score)),
        chip("Gold", fmtN(stats.gold)), chip("Wood", fmtN(stats.wood)),
        chip("Stone", fmtN(stats.stone)), chip("Tokens", fmtN(stats.token))),
      el("div", { style: "display:flex;align-items:center;gap:10px" },
        el("span", { style: "font:9px var(--font);letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)" }, "hp"),
        el("div", { style: "flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden" },
          el("div", { style: `height:100%;width:${(hpPct * 100).toFixed(0)}%;border-radius:999px;background:${hpCol};transition:width .3s` })),
        el("span", { style: "font:11px var(--font-mono);color:var(--text-mute)" },
          stats.maxHealth ? `${Math.round(stats.health)} / ${stats.maxHealth}` : "—")),
      stats.weaponName ? el("div", { style: "margin-top:10px;padding-top:10px;border-top:1px solid var(--glass-divider);font-size:11px;color:var(--text-dim)" },
        `Weapon: `, el("strong", { style: "color:var(--text-mute);font-family:var(--font-mono)" }, `${stats.weaponName} T${stats.weaponTier || 0}`),
        stats.petName ? el("span", {}, `  ·  Pet: `, el("strong", { style: "color:var(--text-mute);font-family:var(--font-mono)" }, `${stats.petName} T${stats.petTier || 0}`)) : el("span", {})
      ) : el("div", {})
    ));

    // -------- Behaviour toggles --------
    // Right under the stats: these are what you actually flip day to day.
    const beh = s.behaviours || {};
    const behaviourRows = ["autoFarm", "autoReconnect", "autoHeal", "autoRevive",
                           "autoRefiller", "autoBreakIn", "autoaim", "autobow"].map((key) => {
      const t = el("button", { class: `ax-toggle ${beh[key] ? "on" : ""}`, "data-key": key });
      t.onclick = () => {
        const nv = !t.classList.contains("on");
        t.classList.toggle("on", nv);
        send({ op: "setBehaviour", sid: s.id, args: { key, value: nv } });
      };
      return el("div", { class: "ax-ctrl-row" },
        el("span", { class: "ax-ctrl-label" }, prettyKey(key)),
        t);
    });
    main.appendChild(el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "behaviours"),
      el("div", { class: "ax-card-hint" }, "Per-session toggles — applied to this bot only."),
      ...behaviourRows
    ));

    // -------- Farm Spot / Navigation card --------
    // Mark a point + angle, then send the bot there (pathfinding out of
    // the base, around trees/players/enemy buildings, through owned
    // doors + slow traps). When it arrives it holds the marked angle.
    const angInput = el("input", { class: "ax-input", type: "number", min: 0, max: 359,
      placeholder: "angle 0-359", style: "max-width:110px",
      value: s.farmSpot ? (s.farmSpot.angle | 0) : "" });
    const spotLabel = el("span", { id: "farmspot-label",
      style: "font: 11px var(--font-mono); color: var(--text-mute)" },
      s.farmSpot ? `${s.farmSpot.x | 0}, ${s.farmSpot.y | 0} @ ${s.farmSpot.angle | 0}°` : "no spot set");
    const navToggle = el("button", { class: `ax-toggle ${s.navActive ? "on" : ""}`, id: "nav-toggle" });
    navToggle.onclick = () => {
      const nv = !navToggle.classList.contains("on");
      navToggle.classList.toggle("on", nv);
      send({ op: "setNav", sid: s.id, args: { on: nv } });
    };
    main.appendChild(el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "farm spot · navigation"),
      el("div", { class: "ax-card-hint" },
        "Mark a spot the bot walks to and farms. \"Use current\" captures this session's position + aim."),
      el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px" },
        el("span", { style: "color:var(--text-dim);font-size:11px;min-width:48px" }, "spot"),
        spotLabel),
      el("div", { class: "ax-actions" },
        el("button", { class: "ax-btn", onclick: () => {
          send({ op: "setFarmSpot", sid: s.id, args: { useCurrent: true } });
        } }, "Use current position"),
        el("button", { class: "ax-btn ghost", onclick: () => {
          send({ op: "setFarmSpot", sid: s.id, args: { clear: true } });
        } }, "Clear")),
      el("div", { style: "display:flex;align-items:center;gap:8px;margin-top:10px" },
        el("span", { style: "color:var(--text-dim);font-size:11px;min-width:48px" }, "set angle"),
        angInput,
        el("button", { class: "ax-btn", onclick: () => {
          // Re-set the spot at the current bot position but override angle.
          const a = Math.max(0, Math.min(359, +angInput.value || 0));
          if (s.farmSpot) send({ op: "setFarmSpot", sid: s.id, args: { x: s.farmSpot.x, y: s.farmSpot.y, angle: a } });
          else send({ op: "setFarmSpot", sid: s.id, args: { useCurrent: true, angle: a } });
        } }, "Apply angle")),
      el("div", { class: "ax-ctrl-row", style: "margin-top:10px;padding:8px 0;border:none" },
        el("span", { class: "ax-ctrl-label" }, "Go to spot & farm"), navToggle)
    ));

    // -------- Farm Observer card --------
    // Empty shells (#farm-observer text + #farm-canvas minimap); the
    // contents are painted by updateFarmObserver(), which is called
    // immediately after appending AND on every farmState envelope.
    const farmCanvas = el("canvas", { id: "farm-canvas" });
    farmCanvas.width = 200; farmCanvas.height = 200;
    farmCanvas.style.cssText = "border:1px solid var(--border);border-radius:8px;background:rgba(0,0,0,0.18);display:block;flex-shrink:0";
    main.appendChild(el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "farm observer"),
      el("div", { class: "ax-card-hint" },
        "Trees green · stones gray · pair target purple · blacklisted red X · nav path cyan · farm spot yellow ◎."),
      el("div", { style: "display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap" },
        farmCanvas,
        el("div", { id: "farm-observer", style: "flex:1;min-width:200px" })
      )
    ));
    updateFarmObserver();

    // -------- Party card --------
    const party = s.party || {};
    const members = s.members || [];
    // Build a uid -> session map so we can hyperlink party members
    // who happen to be our own bots.
    const sessionByUid = new Map();
    for (const otherS of state.sessions) {
      if (otherS.myUid) sessionByUid.set(otherS.myUid, otherS);
    }
    const partyHead = el("div", { style: "display:flex;align-items:baseline;gap:10px;margin-bottom:10px" },
      el("strong", { style: "color:var(--text)" }, party.name || "no party"),
      el("span", { style: "color:var(--text-dim);font:11px var(--font-mono)" }, `${members.length} member${members.length===1?"":"s"}`)
    );
    const pskRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;font:11px var(--font-mono);color:var(--text-dim)" },
      el("span", {}, "PSK"),
      el("input", { class: "ax-input", value: party.shareKey || "—", style: "flex:1;font-size:11px", readonly: "readonly" }),
      el("button", { class: "ax-btn", style: "padding:5px 10px;font-size:11px",
        onclick: () => {
          if (party.shareKey) { navigator.clipboard.writeText(party.shareKey); toast("copied"); }
        } }, "copy")
    );
    const memberRows = members.length === 0
      ? [el("div", { style: "color:var(--text-dim);font-size:12px;padding:8px 0" }, "no members yet — bot may still be joining")]
      : members.map((m) => {
          const isMe = m.isMe;
          const linkedSession = sessionByUid.get(m.uid);
          const mst = m.stats || {};
          const nameClick = linkedSession ? () => { state.selectedSid = linkedSession.id; renderMain(); renderSessions(); } : null;
          const nameEl = el(linkedSession ? "a" : "span",
            { style: `${linkedSession?"color:var(--accent);cursor:pointer;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.3)":"color:var(--text)"};font:13px var(--font);flex:1`,
              ...(linkedSession ? { href: "#" } : {}) },
            (m.displayName || "?") + (m.isLeader ? " ★" : "") + (isMe ? " (you)" : ""));
          if (linkedSession) nameEl.onclick = (e) => { e.preventDefault(); nameClick(); };
          const memberRow = el("div", { class: "ax-row", style: "padding:8px 10px;cursor:pointer;border-radius:4px;margin-bottom:2px;background:var(--bg);border:1px solid var(--border);align-items:flex-start" },
            el("div", { style: "flex:1;min-width:0" },
              el("div", { style: "display:flex;align-items:center;gap:6px" },
                nameEl,
                m.stats?.dead ? el("span", { style: "font:10px var(--font-mono);color:var(--danger)" }, "DEAD") : el("span", {})
              ),
              el("div", { style: "margin-top:6px;display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;font:10px var(--font-mono);color:var(--text-dim)" },
                el("span", {}, `WAVE ${mst.wave || 0}`),
                el("span", {}, `SCORE ${fmtN(mst.score)}`),
                el("span", {}, `HP ${Math.round(mst.health||0)}`),
                el("span", {}, `GOLD ${fmtN(mst.gold)}`),
                el("span", {}, `WOOD ${fmtN(mst.wood)}`),
                el("span", {}, `STONE ${fmtN(mst.stone)}`),
                el("span", {}, `TOK ${fmtN(mst.token)}`),
                el("span", {}, m.canSell ? "✓ sell" : ""),
              )
            )
          );
          return memberRow;
        });
    main.appendChild(el("div", { class: "ax-card" },
      el("div", { class: "ax-card-title" }, "party"),
      partyHead,
      pskRow,
      ...memberRows
    ));

  }
  function prettyKey(k) {
    // Lower-case bot flags don't split on camel humps — label them by hand.
    const SPECIAL = { autoaim: "Auto Aim (defender)", autobow: "Auto Bow (defender)" };
    if (SPECIAL[k]) return SPECIAL[k];
    return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  }

  // ----- server toggles (right pane) -----
  function renderServerToggles() {
    const c = $("#server-toggles");
    c.innerHTML = "";
    const sid = $("#ns-server") ? $("#ns-server").value : "v5001";
    const target = sid || "v5001";
    c.appendChild(el("div", { class: "ax-card-hint", style: "margin: 0 0 8px" },
      "target: ", el("strong", {}, target)));
    for (const flag of ["autoRefiller", "autoReconnect", "autoFarm", "autoBreakIn"]) {
      const cur = state.flags.find((f) => f.server_id === target && f.flag === flag);
      const on = cur && cur.value;
      const t = el("button", { class: `ax-toggle ${on ? "on" : ""}` });
      t.onclick = () => {
        const nv = !t.classList.contains("on");
        t.classList.toggle("on", nv);
        send({ op: "setFlag", args: { serverId: target, flag, value: nv } });
        const idx = state.flags.findIndex((f) => f.server_id === target && f.flag === flag);
        if (idx >= 0) state.flags[idx].value = nv ? 1 : 0;
        else state.flags.push({ server_id: target, flag, value: nv ? 1 : 0 });
      };
      c.appendChild(el("div", { class: "ax-ctrl-row" },
        el("span", { class: "ax-ctrl-label" }, prettyKey(flag)), t));
    }
  }

  function renderPartyRefiller() {
    const c = $("#party-refiller");
    c.innerHTML = "";
    const target = ($("#ns-server")?.value) || "v5001";
    const list = state.keys.filter((k) => k.server_id === target);
    c.appendChild(el("div", { class: "ax-card-hint", style: "margin: 0 0 8px" },
      "keys saved for ", el("strong", {}, target)));
    if (list.length === 0) c.appendChild(el("div", { style: "color: var(--text-dim); font-size:11px" }, "none"));
    for (const k of list) {
      c.appendChild(el("div", { class: "ax-row", style: "padding: 5px 0; border: none" },
        el("span", { class: "ax-row-name", style: "font: 11px var(--font-mono); color: var(--text-mute)" }, k.psk),
        el("button", { class: "ax-icon-btn", title: "remove",
          onclick: () => {
            send({ op: "removeKey", args: { serverId: target, psk: k.psk } });
            state.keys = state.keys.filter((x) => !(x.server_id === target && x.psk === k.psk));
            renderPartyRefiller();
          } }, "×")));
    }
    const inp = el("input", { class: "ax-input", placeholder: "20-char psk", maxlength: 20, style: "margin-top: 8px" });
    c.appendChild(inp);
    c.appendChild(el("button", { class: "ax-btn", style: "margin-top: 6px",
      onclick: () => {
        const v = inp.value.trim();
        if (v.length !== 20) return;
        send({ op: "addKey", args: { serverId: target, psk: v } });
        state.keys.push({ server_id: target, psk: v });
        inp.value = "";
        renderPartyRefiller();
      } }, "+ Add key"));
  }

  // ----- smart upgrade (sidebar summary) -----
  // Smart Upgrade is now configured PER-PARTY in each party's menu.
  // This sidebar block is just a live roster: which parties have it on,
  // click-through to open the party menu.
  function renderSmartUpgrade() {
    const c = $("#smart-upgrade");
    if (!c) return;
    c.innerHTML = "";
    const enabled = new Set((state.smartUpgrade.parties || []).map(Number));

    // List the user's parties (from sessions) with on/off + click-in.
    const parties = new Map();  // partyId -> {serverId, count}
    for (const s of state.sessions) {
      const pid = partyIdOf(s);
      if (pid == null) continue;
      if (!parties.has(pid)) parties.set(pid, { serverId: s.serverId, count: 0 });
      parties.get(pid).count++;
    }

    c.appendChild(el("div", { class: "ax-card-hint", style: "margin:0 0 8px" },
      "Configured per party. Click a party to open its menu."));

    if (parties.size === 0) {
      c.appendChild(el("div", { style: "color:var(--text-dim);font-size:11px" },
        "No parties yet. Spawn sessions into a party."));
      return;
    }
    for (const [pid, info] of parties) {
      const on = enabled.has(pid);
      c.appendChild(el("div", { class: "ax-row", style: "padding:6px 4px;cursor:pointer",
        onclick: () => selectParty(info.serverId, pid) },
        el("span", { class: `ax-row-dot ${on ? "on" : ""}` }),
        el("span", { class: "ax-row-name" }, `Party ${pid}`),
        el("span", { class: "ax-row-meta", style: on ? "color:var(--success)" : "" },
          on ? "ON ⚡" : "off")));
    }
  }

  // Compact number formatter — 1500 → 1.5k, 2000000 → 2M
  function fmtShort(n) {
    n = n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return n + "";
  }

  // ----- server populations (community scanner via our proxy) -----
  // Fetched once at boot + on demand; labels every server <select> option
  // with "· N/40" so picking an empty (or full) server is one glance.
  let serverPops = new Map();   // serverId -> population
  async function loadServerPops() {
    try {
      const r = await fetch("/api/server-pops");
      const pops = await r.json();
      serverPops = new Map((pops || []).map((p) => [p.serverId, p.population]));
      labelServerOptions($("#ns-server"));
      labelServerOptions($("#np-server"));
    } catch {}
  }
  function serverLabel(id, name) {
    const pop = serverPops.get(id);
    return `${id} — ${name}${pop !== undefined ? ` · ${pop}/40` : ""}`;
  }
  function labelServerOptions(sel) {
    if (!sel) return;
    const names = new Map(window.AXIOM_SERVERS);
    for (const o of sel.options) o.textContent = serverLabel(o.value, names.get(o.value) || o.value);
  }

  // ----- new session modal -----
  function populateServers() {
    const sel = $("#ns-server");
    if (sel.options.length) return;
    for (const [id, name] of window.AXIOM_SERVERS) {
      sel.appendChild(el("option", { value: id }, serverLabel(id, name)));
    }
    sel.selectedIndex = 0;   // default = first server in the list
    sel.onchange = () => { renderServerToggles(); renderPartyRefiller(); };
  }
  function openNewSessionModal() { $("#new-modal").classList.add("open"); }
  $("#new-session-btn").onclick = openNewSessionModal;
  $("#ns-cancel").onclick = () => $("#new-modal").classList.remove("open");
  $("#ns-submit").onclick = () => {
    const psk = $("#ns-psk").value.trim();
    // PSK is optional. If supplied it must be exactly 20 chars
    // (zombs.io rejects anything else). Empty PSK = bot connects
    // without joining any party.
    if (psk && psk.length !== 20) {
      toast("PSK must be exactly 20 characters (or leave blank)", "danger");
      $("#ns-psk").focus();
      return;
    }
    if (!state.ws || state.ws.readyState !== 1) {
      toast("not connected to sessions backend", "danger");
      return;
    }
    send({ op: "create", args: {
      label: $("#ns-label").value.trim() || "Session",
      serverId: $("#ns-server").value,
      playerName: $("#ns-name").value.trim() || "Player",
      psk,
    }});
    toast(`spawning ${$("#ns-label").value.trim() || "Session"}…`);
    $("#new-modal").classList.remove("open");
  };

  // ----- create party modal -----
  // Returns the next free integer N such that "<name> N" isn't already a
  // session label (mirrors spawnIntoParty's indexing).
  function nextLabelIndex(name) {
    const re = new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " (\\d+)$");
    let maxIdx = 0;
    for (const x of state.sessions) {
      const m = re.exec(x.label || "");
      if (m) maxIdx = Math.max(maxIdx, +m[1]);
    }
    return maxIdx + 1;
  }
  function populatePartyServers() {
    const sel = $("#np-server");
    if (sel.options.length) return;
    for (const [id, name] of window.AXIOM_SERVERS) {
      sel.appendChild(el("option", { value: id }, serverLabel(id, name)));
    }
    sel.selectedIndex = 0;   // default = first server in the list
  }
  function openCreatePartyModal() {
    populatePartyServers();
    $("#party-modal").classList.add("open");
  }
  $("#new-party-btn").onclick = openCreatePartyModal;
  $("#np-cancel").onclick = () => $("#party-modal").classList.remove("open");
  $("#np-submit").onclick = () => {
    if (!state.ws || state.ws.readyState !== 1) {
      toast("not connected to sessions backend", "danger"); return;
    }
    const name = ($("#np-name").value.trim() || "Player").slice(0, 29);
    const serverId = $("#np-server").value;
    let count = parseInt($("#np-count").value, 10);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > 20) count = 20;
    if (state.pendingPartyCreate) {
      toast("A party is already being created — hang on.", "danger"); return;
    }
    const startIdx = nextLabelIndex(name);
    const leaderLabel = `${name} ${startIdx}`;
    // Spawn the leader with NO psk — it opens its own party. Once the
    // server hands it a share key we join the remaining sessions in.
    send({ op: "create", args: { label: leaderLabel, serverId, playerName: name, psk: "" } });
    state.pendingPartyCreate = {
      serverId, name, count, startIdx, leaderLabel,
      startedAt: Date.now(), done: false,
    };
    toast(count > 1
      ? `Creating party "${name}" — leader up, waiting for party key…`
      : `Spawning "${leaderLabel}"…`);
    $("#party-modal").classList.remove("open");
  };

  // Drives the two-phase party creation. Called on every "sessions"
  // update: once the leader has a share key, spawn the rest into it.
  function tickPartyCreate() {
    const pc = state.pendingPartyCreate;
    if (!pc || pc.done) return;
    if (Date.now() - pc.startedAt > 30000) {
      toast(`Party "${pc.name}": leader never got a party key (timed out).`, "danger");
      state.pendingPartyCreate = null;
      return;
    }
    const leader = state.sessions.find(
      (s) => s.serverId === pc.serverId && (s.label || "") === pc.leaderLabel);
    if (!leader) return;                       // leader still spawning
    if (pc.count <= 1) { state.pendingPartyCreate = null; return; }
    const psk = (leader.party && leader.party.shareKey) || leader.psk || "";
    if (!psk || psk.length !== 20) return;     // wait for a valid key
    pc.done = true;
    for (let i = 1; i < pc.count; i++) {
      const label = `${pc.name} ${pc.startIdx + i}`;
      send({ op: "create", args: { label, serverId: pc.serverId, playerName: pc.name, psk } });
    }
    toast(`Party "${pc.name}": joining ${pc.count - 1} more session${pc.count - 1 === 1 ? "" : "s"}…`);
    state.pendingPartyCreate = null;
  }

  // -------- toast --------
  function toast(msg, kind) {
    let host = document.getElementById("ax-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "ax-toast-host";
      host.style.cssText = "position:fixed; right:18px; bottom:34px; display:flex; flex-direction:column; gap:8px; z-index:9999; pointer-events:none";
      document.body.appendChild(host);
    }
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = `pointer-events:auto; padding:8px 12px; background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-sm); color:${kind==='danger'?'var(--danger)':'var(--text)'}; font:12px var(--font); box-shadow:var(--shadow); opacity:0; transform:translateY(4px); transition:opacity .15s, transform .15s`;
    host.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
    setTimeout(() => {
      t.style.opacity = "0"; t.style.transform = "translateY(4px)";
      setTimeout(() => t.remove(), 200);
    }, 3500);
  }
  window.axiomToast = toast;

  // ----- global search (Ctrl+K) -----
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); $("#global-search").focus();
    }
  });
  $("#global-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const list = $("#session-list");
    // Match the whole row text (label, party name, status, gold meta), so
    // "closed", "party 5" or "v50" filter too — not just the label.
    $$(".ax-row", list).forEach((row) => {
      const hay = (row.textContent || "").toLowerCase();
      row.style.display = !q || hay.includes(q) ? "" : "none";
    });
  });

  // ----- boot -----
  // No-login mode: auto-fetch a token if we don't have one, then enter.
  // Any stored token the server later rejects (401) falls through to
  // resetToken(), which clears it and reloads for a fresh one.
  (async () => {
    try {
      await ensureLocalToken();
      await enterApp();
    } catch (e) {
      console.error("[axiom] boot failed:", e.message);
      document.body.insertAdjacentHTML("afterbegin",
        `<div style="position:fixed;top:8px;left:50%;transform:translateX(-50%);background:#f87171;color:#000;padding:6px 14px;border-radius:6px;font:12px var(--font);z-index:99999">boot failed: ${e.message}</div>`);
    }
  })();
})();
