// shell.js — Axiom's custom chrome wrapped around a ZOUI panel.
//
// ZOUI ships with sidebar tab navigation; we hide that, project the
// tab buttons into a custom top-tab bar of our own, and append a
// bottom status bar with a sliding console drawer. Search reuses
// ZOUI's built-in fuzzy search.
//
// We rely on ZOUI's components for the in-tab UI but own the chrome.

import { axiomCssVars, axiomZouiTheme, AXIOM_THEME_NAME } from "./theme.js";

const SHELL_STYLE_ID  = "axiom-shell-styles";
const SHELL_CSS_VARS  = "axiom-css-vars";

// Build the shell into `container`. Returns an object containing the
// ZOUI instance, a console controller, and DOM hooks used by the
// renderer / script host.
export function buildShell({ container, ZOUI, schema }) {
  installStyles();

  // The shell wrapper owns Axiom's own chrome and contains the ZOUI
  // panel as a child. ZOUI normally consumes the entire container —
  // we wrap it.
  const root = document.createElement("div");
  root.className = "axiom-root";
  root.innerHTML = `
    <div class="axiom-topbar">
      <div class="axiom-brand">
        <span class="axiom-brand-dot"></span>
        <span class="axiom-brand-name">${escapeHtml(schema.meta?.name || "Axiom")}</span>
        <span class="axiom-brand-version">v${escapeHtml(schema.meta?.version || "")}</span>
      </div>
      <nav class="axiom-tabs" role="tablist"></nav>
      <div class="axiom-actions">
        <button class="axiom-iconbtn" data-action="search" title="Search (Ctrl+F)">⌕</button>
        <button class="axiom-iconbtn" data-action="console" title="Toggle console">≡</button>
        <button class="axiom-iconbtn" data-action="minimize" title="Minimize">−</button>
      </div>
    </div>
    <div class="axiom-stage"></div>
    <div class="axiom-bottombar">
      <span class="axiom-status" data-status="idle">●</span>
      <span class="axiom-status-text">Ready</span>
      <span class="axiom-bottombar-spacer"></span>
      <span class="axiom-hint">Press <kbd>${escapeHtml(schema.meta?.hotkey || "`")}</kbd> to toggle</span>
    </div>
    <div class="axiom-console" data-open="false">
      <div class="axiom-console-header">
        <span>Console</span>
        <span class="axiom-console-actions">
          <button data-console-action="clear" class="axiom-iconbtn">Clear</button>
          <button data-console-action="close" class="axiom-iconbtn">×</button>
        </span>
      </div>
      <div class="axiom-console-body"></div>
    </div>
  `;
  container.appendChild(root);

  // Drop the ZOUI panel into the stage area. ZOUI's constructor
  // sets the container's inline style — we let it.
  const stage = root.querySelector(".axiom-stage");
  const zouiMount = document.createElement("div");
  zouiMount.className = "axiom-zoui-mount";
  stage.appendChild(zouiMount);

  // Register Axiom's ZOUI theme before constructing so it's available.
  ZOUI.registerTheme(AXIOM_THEME_NAME, axiomZouiTheme());

  const ui = new ZOUI(
    zouiMount,
    schema.meta?.name || "Axiom",
    schema.meta?.version || "0.1.0",
    { icon: "▲" }
  );
  ui.setTheme(AXIOM_THEME_NAME);

  // Console controller — buffer + DOM writer.
  const consoleEl = root.querySelector(".axiom-console");
  const consoleBody = consoleEl.querySelector(".axiom-console-body");
  const consoleCtl = makeConsole(consoleEl, consoleBody);

  // Wire top-bar buttons.
  root.querySelector('[data-action="search"]').onclick = () => {
    ui.searchInput?.focus();
  };
  root.querySelector('[data-action="console"]').onclick = () => consoleCtl.toggle();
  root.querySelector('[data-action="minimize"]').onclick = () => ui.toggleMinimize();
  consoleEl.querySelector('[data-console-action="clear"]').onclick = () => consoleCtl.clear();
  consoleEl.querySelector('[data-console-action="close"]').onclick = () => consoleCtl.close();

  // Re-project ZOUI's sidebar tab buttons into our top-tab bar. We
  // observe the sidebar so new tabs added later (e.g. after re-render)
  // appear in the top bar too.
  const tabBar = root.querySelector(".axiom-tabs");
  const syncTabs = () => projectTabs(ui, tabBar);
  const observer = new MutationObserver(syncTabs);
  observer.observe(ui.sidebar, { childList: true, subtree: false });

  // Bridge ZOUI's status dot to our bottombar so e.g. "active script"
  // hints can update via setStatus(text, level).
  const statusEl = root.querySelector(".axiom-status");
  const statusText = root.querySelector(".axiom-status-text");
  function setStatus(text, level = "idle") {
    statusText.textContent = text;
    statusEl.dataset.status = level;
  }

  // Collapse/restore — owns its own state since we hide ZOUI's chrome.
  // Collapsed = only the top bar is visible.
  function toggleMinimize() { root.classList.toggle("is-minimized"); }
  root.querySelector('[data-action="minimize"]').onclick = toggleMinimize;

  // Hotkey handler — bound at the window level so it works regardless
  // of focus. Ignored when typing into an input/textarea/contenteditable.
  const hotkeyChord = parseChord(schema.meta?.hotkey || "`");
  const onHotkey = (e) => {
    if (!matchChord(e, hotkeyChord)) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    toggleMinimize();
  };
  window.addEventListener("keydown", onHotkey);

  // Drag — only meaningful when the host is a floating element (we
  // give it the `.axiom-host` class in the userscript fallback path).
  const dragCleanup = enableDrag(root, container);

  return {
    ui,
    root,
    tabBar,
    syncTabs,
    setStatus,
    toggleMinimize,
    console: consoleCtl,
    destroy() {
      observer.disconnect();
      window.removeEventListener("keydown", onHotkey);
      dragCleanup?.();
      try { ui.destroy(); } catch { /* ignore */ }
      root.remove();
    },
  };
}

// Drag the topbar to move the floating host. No-op for non-fixed hosts.
function enableDrag(root, host) {
  if (!host || !host.classList?.contains("axiom-host")) return null;
  const topbar = root.querySelector(".axiom-topbar");
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  const down = (e) => {
    // Avoid hijacking clicks on actual controls in the topbar.
    if (e.target.closest("button, input, select, .axiom-tab")) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const r = host.getBoundingClientRect();
    ox = r.left; oy = r.top;
    document.body.style.userSelect = "none";
  };
  const move = (e) => {
    if (!dragging) return;
    host.style.left = (ox + e.clientX - sx) + "px";
    host.style.top  = (oy + e.clientY - sy) + "px";
    host.style.right = "auto";
  };
  const up = () => { dragging = false; document.body.style.userSelect = ""; };
  topbar.addEventListener("mousedown", down);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  return () => {
    topbar.removeEventListener("mousedown", down);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
}

// "Ctrl+Shift+K" → { ctrl: true, shift: true, alt: false, meta: false, key: "k" }
function parseChord(combo) {
  const parts = String(combo).split("+").map((p) => p.trim());
  const c = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === "ctrl" || lower === "control") c.ctrl = true;
    else if (lower === "shift") c.shift = true;
    else if (lower === "alt" || lower === "option") c.alt = true;
    else if (lower === "meta" || lower === "cmd" || lower === "command") c.meta = true;
    else c.key = lower;
  }
  return c;
}
function matchChord(e, c) {
  if (!!e.ctrlKey  !== c.ctrl)  return false;
  if (!!e.shiftKey !== c.shift) return false;
  if (!!e.altKey   !== c.alt)   return false;
  if (!!e.metaKey  !== c.meta)  return false;
  return (e.key || "").toLowerCase() === c.key;
}

function projectTabs(ui, tabBar) {
  tabBar.innerHTML = "";
  const sidebarBtns = [...ui.sidebar.querySelectorAll(".zui-tab")];
  for (const sb of sidebarBtns) {
    const name = sb.querySelector("span")?.textContent || "";
    const btn = document.createElement("button");
    btn.className = "axiom-tab";
    if (sb.classList.contains("active")) btn.classList.add("active");
    btn.textContent = name;
    btn.onclick = () => ui.switchTab(name);
    tabBar.appendChild(btn);
  }
  // Re-sync `active` state when ZOUI changes its sidebar selection.
  ui.sidebar.querySelectorAll(".zui-tab").forEach((sb, i) => {
    sb.addEventListener("click", () => {
      [...tabBar.children].forEach((c, j) => c.classList.toggle("active", j === i));
    });
  });
}

function makeConsole(panel, body) {
  const lines = [];
  function fmtTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function write(level, message) {
    const row = document.createElement("div");
    row.className = `axiom-console-line lvl-${level}`;
    const text = typeof message === "string" ? message : safeStringify(message);
    row.innerHTML = `<span class="axiom-console-time">${fmtTime()}</span>` +
                    `<span class="axiom-console-level">${level}</span>` +
                    `<span class="axiom-console-msg"></span>`;
    row.querySelector(".axiom-console-msg").textContent = text;
    body.appendChild(row);
    lines.push({ level, message: text, ts: Date.now() });
    body.scrollTop = body.scrollHeight;
    // Cap buffer so the panel doesn't grow unbounded.
    while (body.childNodes.length > 500) body.removeChild(body.firstChild);
    // Auto-open on errors so the user notices.
    if (level === "error") open();
  }
  function open()  { panel.dataset.open = "true";  }
  function close() { panel.dataset.open = "false"; }
  function toggle() { panel.dataset.open = panel.dataset.open === "true" ? "false" : "true"; }
  function clear() { body.innerHTML = ""; lines.length = 0; }
  return { write, open, close, toggle, clear, lines };
}

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// CSS — injected once into <head>. Uses our axiom CSS vars so the
// shell stays in lock-step with the ZOUI theme.
function installStyles() {
  if (!document.getElementById(SHELL_CSS_VARS)) {
    const s = document.createElement("style");
    s.id = SHELL_CSS_VARS;
    s.textContent = axiomCssVars();
    document.head.appendChild(s);
  }
  if (document.getElementById(SHELL_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = SHELL_STYLE_ID;
  s.textContent = `
    .axiom-root {
      position: relative;
      display: flex; flex-direction: column;
      width: 100%; height: 100%;
      font-family: -apple-system, "Segoe UI", "Inter", sans-serif;
      color: var(--text-primary);
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .axiom-topbar {
      display: flex; align-items: center; gap: 16px;
      padding: 8px 12px;
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border);
      min-height: 44px;
      -webkit-app-region: drag;
    }
    .axiom-brand { display: flex; align-items: center; gap: 8px; }
    .axiom-brand-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent-glow);
    }
    .axiom-brand-name { font-weight: 600; font-size: 13px; letter-spacing: 0.02em; }
    .axiom-brand-version { font-size: 11px; color: var(--text-dim); }

    .axiom-tabs {
      display: flex; gap: 2px; flex: 1; overflow-x: auto;
      -webkit-app-region: no-drag;
    }
    .axiom-tab {
      background: transparent; border: 0; color: var(--text-muted);
      font-size: 12px; padding: 6px 12px; border-radius: var(--radius);
      cursor: pointer; transition: background 0.12s, color 0.12s;
      white-space: nowrap;
    }
    .axiom-tab:hover { background: var(--bg-row-hover); color: var(--text-primary); }
    .axiom-tab.active {
      background: var(--accent-muted);
      color: var(--accent-text);
      box-shadow: inset 0 -1px 0 var(--accent);
    }

    .axiom-actions { display: flex; gap: 4px; -webkit-app-region: no-drag; }
    .axiom-iconbtn {
      background: transparent; border: 1px solid transparent; color: var(--text-muted);
      width: 28px; height: 28px; border-radius: var(--radius); cursor: pointer;
      font-size: 13px; line-height: 1; display: inline-flex;
      align-items: center; justify-content: center;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .axiom-iconbtn:hover {
      background: var(--bg-elevated); color: var(--text-primary);
      border-color: var(--border-strong);
    }

    .axiom-stage {
      flex: 1; overflow: hidden; position: relative;
      background: var(--bg-primary);
    }
    .axiom-zoui-mount { width: 100%; height: 100%; }
    /* Hide ZOUI's own header + sidebar + resize handle; we project the
       sidebar tabs into our top bar and own the chrome. */
    .axiom-zoui-mount .zui-headerbar,
    .axiom-zoui-mount .zui-sidebar,
    .axiom-zoui-mount .zui-resize-handle { display: none !important; }
    .axiom-zoui-mount .zui-wrapper {
      width: 100% !important; height: 100% !important;
      background: transparent !important;
      border: 0 !important; box-shadow: none !important;
    }
    .axiom-zoui-mount .zui-body { width: 100% !important; height: 100% !important; }
    .axiom-zoui-mount .zui-content {
      flex: 1; width: 100%; padding: 12px 16px;
      background: var(--bg-primary);
    }
    .axiom-zoui-mount .zui-global-search {
      background: var(--bg-search);
      border-bottom: 1px solid var(--border);
    }

    .axiom-bottombar {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; min-height: 28px;
      background: var(--bg-panel);
      border-top: 1px solid var(--border);
      font-size: 11px; color: var(--text-muted);
    }
    .axiom-status { font-size: 9px; }
    .axiom-status[data-status="idle"]    { color: var(--text-dim); }
    .axiom-status[data-status="active"]  { color: var(--accent); }
    .axiom-status[data-status="warning"] { color: var(--warning); }
    .axiom-status[data-status="error"]   { color: var(--error); }
    .axiom-bottombar-spacer { flex: 1; }
    .axiom-hint kbd {
      background: var(--bg-elevated); border: 1px solid var(--border-strong);
      border-radius: 3px; padding: 0 4px; font-family: ui-monospace, monospace;
      font-size: 10px; color: var(--text-primary);
    }

    .axiom-console {
      position: absolute; left: 0; right: 0; bottom: 0;
      background: var(--bg-elevated);
      border-top: 1px solid var(--border-strong);
      max-height: 38%;
      display: flex; flex-direction: column;
      transform: translateY(100%);
      transition: transform 0.18s ease;
      z-index: 5;
    }
    .axiom-console[data-open="true"] { transform: translateY(0); }
    .axiom-console-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 12px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      font-size: 11px; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .axiom-console-actions { display: flex; gap: 4px; }
    .axiom-console-actions .axiom-iconbtn {
      width: auto; padding: 0 8px; font-size: 11px; height: 22px;
    }
    .axiom-console-body {
      flex: 1; overflow-y: auto; padding: 6px 0;
      font-family: ui-monospace, "JetBrains Mono", "SF Mono", monospace;
      font-size: 12px;
    }
    .axiom-console-line {
      display: grid; grid-template-columns: 72px 56px 1fr;
      column-gap: 8px; padding: 2px 12px;
    }
    .axiom-console-line:hover { background: var(--bg-row-hover); }
    .axiom-console-time { color: var(--text-dim); }
    .axiom-console-level {
      color: var(--text-muted); text-transform: uppercase;
      font-size: 10px; align-self: center;
    }
    .axiom-console-line.lvl-error .axiom-console-level { color: var(--error); }
    .axiom-console-line.lvl-warn  .axiom-console-level { color: var(--warning); }
    .axiom-console-line.lvl-info  .axiom-console-level { color: var(--accent-text); }
    .axiom-console-msg { color: var(--text-primary); white-space: pre-wrap; word-break: break-word; }

    /* Floating host (used when zombs.io's #hud-menu-settings isn't present). */
    .axiom-host { position: fixed; top: 60px; right: 24px;
      width: 520px; height: 580px; z-index: 999998; background: transparent; }
    .axiom-host.is-minimized { width: auto; height: auto; }
    .axiom-root.is-minimized { height: auto; }
    .axiom-root.is-minimized .axiom-stage,
    .axiom-root.is-minimized .axiom-bottombar,
    .axiom-root.is-minimized .axiom-console { display: none; }
    .axiom-topbar { cursor: grab; }
    .axiom-topbar:active { cursor: grabbing; }
  `;
  document.head.appendChild(s);
}
