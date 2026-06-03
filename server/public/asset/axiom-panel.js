/* axiom-panel.js — in-game Axiom panel.
 *
 * Loads the active UI schema from /api/schema and renders it into a
 * full-window modal with a left sidebar of tabs and a main content
 * area on the right (website-style). Search filters across the
 * active tab in real time.
 *
 * Opens via:
 *   - Hotkey ` (configurable in schema.meta.hotkey)
 *   - Click on the in-game Settings gear (we intercept and show
 *     Axiom instead of zombs.io's built-in Settings popup)
 *
 * Not draggable. Backdrop is blurred when open.
 *
 * Each control with a `scriptId` runs its bound script when its
 * value changes (or on button click). Scripts execute with a `ctx`
 * object — see ctx.game / ctx.ui / ctx.storage / ctx.on.
 */

(function () {
  "use strict";

  const log = (...args) => console.log("[axiom]", ...args);

  function whenReady(cb) {
    if (window.game && window.game.ui) return cb();
    setTimeout(() => whenReady(cb), 200);
  }

  async function loadSchema() {
    try {
      const r = await fetch("/api/schema");
      if (r.ok) return r.json();
    } catch {}
    return null;
  }

  // ── Script host ──────────────────────────────────────────────────
  const valueStore = new Map();
  const scriptCache = new Map();
  const consoleBuf = [];
  const eventBus = new EventTarget();
  const ctxStorage = new Map();         // per-runtime kv (in-memory)

  function makeCtx(controlId, panel) {
    return {
      log: (msg, level = "log") => {
        const line = `[${new Date().toLocaleTimeString()}] ${level.toUpperCase()} ${msg}`;
        consoleBuf.push(line); if (consoleBuf.length > 500) consoleBuf.shift();
        console[level === "error" ? "error" : "log"]("[axiom]", msg);
      },
      game: new Proxy({}, { get: (_, k) => window[k] }),
      ui: {
        getValue: (id) => valueStore.get(id),
        setValue: (id, v) => { valueStore.set(id, v); panel.syncControl(id, v); },
        trigger: (id) => panel.triggerScript(id),
      },
      storage: {
        get: (k) => ctxStorage.has(k) ? ctxStorage.get(k) : JSON.parse(localStorage.getItem(`axiom.kv.${k}`) || "null"),
        set: (k, v) => { ctxStorage.set(k, v); try { localStorage.setItem(`axiom.kv.${k}`, JSON.stringify(v)); } catch {} },
        delete: (k) => { ctxStorage.delete(k); localStorage.removeItem(`axiom.kv.${k}`); },
      },
      on: (ev, fn) => eventBus.addEventListener(ev, fn),
      off: (ev, fn) => eventBus.removeEventListener(ev, fn),
      toast: (msg) => { try { window.game.ui.components.PopupOverlay.showHint(msg); } catch { log(msg); } },
    };
  }

  function compileScript(source) {
    try { return new Function("ctx", "value", "controlId", source); }
    catch (e) { return () => log("compile error:", e.message); }
  }
  function runScript(scriptDef, value, controlId, panel) {
    if (!scriptDef) return;
    let fn = scriptCache.get(scriptDef.id);
    if (!fn) { fn = compileScript(scriptDef.source); scriptCache.set(scriptDef.id, fn); }
    try { fn(makeCtx(controlId, panel), value, controlId); }
    catch (e) { log(`script ${scriptDef.id} threw:`, e.message); }
  }

  // ── Settings-gear interception ───────────────────────────────────
  // The zombs.io Settings menu is `.hud-menu-settings`. The gear icon
  // sits in `.hud-center-right` and its click is bound by app.js's
  // UiMenuIcons. We can't easily unbind the original, so we observe
  // the popup: the moment it goes visible, we hide it and open Axiom.
  function hookSettingsGear(panel) {
    const observer = new MutationObserver(() => {
      const popup = document.querySelector(".hud-menu-settings");
      if (popup && popup.style.display !== "none" && getComputedStyle(popup).display !== "none") {
        popup.style.display = "none";
        panel.toggle(true);
      }
    });
    const start = () => {
      const popup = document.querySelector(".hud-menu-settings");
      if (!popup) return setTimeout(start, 400);
      observer.observe(popup, { attributes: true, attributeFilter: ["style", "class"] });
    };
    start();
  }

  // ── Panel ────────────────────────────────────────────────────────
  class Panel {
    constructor(schema) {
      this.schema = schema;
      this.activeTab = schema.meta.landingTabId || schema.tabs[0]?.id;
      this.searchQ = "";
      this.visible = false;
      this.controlNodes = new Map();
      this.build();
      document.body.appendChild(this.backdrop);
      document.body.appendChild(this.root);
      this.render();
      this.bindHotkey();
    }

    build() {
      this.backdrop = document.createElement("div");
      this.backdrop.className = "ax-panel-backdrop";
      this.backdrop.onclick = () => this.toggle(false);

      this.root = document.createElement("div");
      this.root.className = "ax-panel";
      this.root.innerHTML = `
        <div class="ax-panel-head">
          <span class="ax-panel-brand">AXIOM</span>
          <span class="ax-panel-brand-sub">v${this.schema.meta.version || "0.1"}</span>
          <div class="ax-panel-search">
            <span style="color: var(--text-dim); font: 12px var(--font-mono)">/</span>
            <input id="axp-search" placeholder="search every feature…" autocomplete="off">
            <span class="ax-panel-search-kbd">⌘K</span>
          </div>
          <div class="ax-panel-head-actions">
            <button class="ax-panel-iconbtn" id="axp-close" title="Close">×</button>
          </div>
        </div>
        <div class="ax-panel-body">
          <div class="ax-panel-tabs" id="axp-tabs"></div>
          <div class="ax-panel-body-main" id="axp-body"></div>
        </div>
        <div class="ax-panel-footer">
          <span>axiom</span>
          <span style="color: var(--border-h)">·</span>
          <span id="axp-meta"></span>
          <span class="ax-panel-footer-spacer"></span>
          <span>` + "`" + ` toggle · esc close</span>
        </div>
      `;
      this.root.querySelector("#axp-close").onclick = () => this.toggle(false);
      const search = this.root.querySelector("#axp-search");
      search.addEventListener("input", (e) => { this.searchQ = e.target.value.toLowerCase(); this.renderBody(); });
      search.addEventListener("keydown", (e) => { if (e.key === "Escape") this.toggle(false); });
    }

    render() {
      this.renderTabs();
      this.renderBody();
      this.root.querySelector("#axp-meta").textContent =
        `${this.schema.tabs.length} tabs · ${Object.keys(this.schema.scripts || {}).length} scripts`;
    }

    renderTabs() {
      const tabsEl = this.root.querySelector("#axp-tabs");
      tabsEl.innerHTML = "";
      for (const tab of this.schema.tabs) {
        const b = document.createElement("button");
        b.className = `ax-panel-tab ${tab.id === this.activeTab ? "active" : ""}`;
        b.innerHTML = `<span class="ax-panel-tab-dot"></span>${escape(tab.name)}`;
        b.onclick = () => { this.activeTab = tab.id; this.searchQ = ""; this.root.querySelector("#axp-search").value = ""; this.render(); };
        tabsEl.appendChild(b);
      }
    }

    renderBody() {
      const body = this.root.querySelector("#axp-body");
      body.innerHTML = "";
      this.controlNodes.clear();

      const tab = this.schema.tabs.find((t) => t.id === this.activeTab);
      if (!tab) return;
      const q = this.searchQ;
      let matchCount = 0;

      for (const section of tab.sections || []) {
        // For search, recurse into row/group children so a search hit
        // on a nested control still surfaces its parent section.
        const visible = (section.controls || []).filter((ctrl) => {
          if (!q) return true;
          return matchesControl(ctrl, q);
        });
        if (visible.length === 0) continue;
        matchCount += visible.length;

        const sec = document.createElement("div");
        sec.className = "ax-panel-section";
        const isCollapsible = !!section.collapsible;
        // Per-section open-state persists in localStorage so collapsed
        // groups stay collapsed across panel toggles. defaultOpen is
        // the initial state when no prior preference exists.
        const collapseKey = `axiom.collapse.${this.activeTab}.${section.id}`;
        const stored = localStorage.getItem(collapseKey);
        const isOpen = stored !== null ? stored === "1"
                                       : (section.defaultOpen !== false);
        if (isCollapsible && !isOpen) sec.classList.add("collapsed");
        const header = document.createElement("div");
        header.className = "ax-panel-section-name";
        if (isCollapsible) header.classList.add("collapsible");
        header.innerHTML =
          (isCollapsible ? `<span class="ax-chevron">▾</span>` : "") +
          escape(section.name);
        if (isCollapsible) {
          header.onclick = () => {
            sec.classList.toggle("collapsed");
            localStorage.setItem(collapseKey, sec.classList.contains("collapsed") ? "0" : "1");
          };
        }
        sec.appendChild(header);
        const sectionBody = document.createElement("div");
        sectionBody.className = "ax-panel-section-body";
        for (const ctrl of visible) sectionBody.appendChild(this.renderControl(ctrl));
        sec.appendChild(sectionBody);
        body.appendChild(sec);
      }

      if (matchCount === 0) {
        body.appendChild(htmlEl(`<div class="ax-panel-empty">
          no controls match "<span style="color:var(--text-mute)">${escape(q || "")}</span>"
        </div>`));
      }
    }

    renderControl(ctrl) {
      const row = document.createElement("div");
      row.className = "ax-ctrl-row";

      if (ctrl.type === "text") {
        const t = document.createElement("div");
        t.className = "ax-ctrl-text";
        t.textContent = ctrl.defaultValue || "";
        row.replaceWith(t);
        return t;
      }

      // ── Layout primitives ──
      // "row" — inline-flex container that lays out its child controls
      //   horizontally. Each child renders without its own card chrome
      //   so 3-4 buttons can sit on a single line. Use for compact
      //   action bars (e.g. Build / Preview / Clear).
      if (ctrl.type === "row" && Array.isArray(ctrl.controls)) {
        const r = document.createElement("div");
        r.className = "ax-ctrl-rowgroup";
        for (const child of ctrl.controls) {
          const node = this.renderControl(child);
          // Strip the card chrome from each child so they sit flush.
          node.classList.add("ax-ctrl-row--flat");
          r.appendChild(node);
        }
        return r;
      }
      // "group" — nested header + body with optional collapse. Persists
      //   open/closed state in localStorage so users keep their layout
      //   preferences across panel toggles.
      if (ctrl.type === "group" && Array.isArray(ctrl.controls)) {
        const g = document.createElement("div");
        g.className = "ax-ctrl-group";
        const collapsible = ctrl.collapsible !== false;
        const collapseKey = `axiom.gcollapse.${ctrl.id}`;
        const stored = localStorage.getItem(collapseKey);
        const isOpen = stored !== null ? stored === "1"
                                       : (ctrl.defaultOpen !== false);
        if (collapsible && !isOpen) g.classList.add("collapsed");
        const h = document.createElement("div");
        h.className = "ax-ctrl-group-head";
        if (collapsible) h.classList.add("collapsible");
        h.innerHTML = (collapsible ? `<span class="ax-chevron">▾</span>` : "")
                    + escape(ctrl.label || ctrl.id);
        if (collapsible) {
          h.onclick = () => {
            g.classList.toggle("collapsed");
            localStorage.setItem(collapseKey,
              g.classList.contains("collapsed") ? "0" : "1");
          };
        }
        const body = document.createElement("div");
        body.className = "ax-ctrl-group-body";
        for (const child of ctrl.controls) body.appendChild(this.renderControl(child));
        g.append(h, body);
        return g;
      }

      // Buttons render their label inside themselves — adding a separate
      // "Record current base : [Run]" row label is just noise. Skip it
      // for type=button. The tooltip indicator still surfaces, just
      // attached to the button itself via title (set below).
      const isButton = ctrl.type === "button";
      if (isButton) row.classList.add("ax-ctrl-row--button");
      if (!isButton) {
        const label = document.createElement("div");
        label.className = "ax-ctrl-label";
        const lbl = document.createElement("span");
        lbl.textContent = ctrl.label || ctrl.id;
        label.appendChild(lbl);
        if (ctrl.tooltip) {
          const tip = document.createElement("span");
          tip.className = "ax-ctrl-tip";
          tip.textContent = "?"; tip.dataset.tip = ctrl.tooltip;
          label.appendChild(tip);
        }
        row.appendChild(label);
      }

      const v0 = valueStore.has(ctrl.id) ? valueStore.get(ctrl.id) :
                 ctrl.defaultValue !== undefined ? ctrl.defaultValue :
                 controlDefaultByType(ctrl.type);
      valueStore.set(ctrl.id, v0);

      let widget;
      switch (ctrl.type) {
        case "toggle": widget = this.buildToggle(ctrl, v0); break;
        case "button": widget = this.buildButton(ctrl); break;
        case "slider": widget = this.buildSlider(ctrl, v0); break;
        case "number": widget = this.buildNumber(ctrl, v0); break;
        case "input":  widget = this.buildText(ctrl, v0);   break;
        case "select": widget = this.buildSelect(ctrl, v0); break;
        case "color":  widget = this.buildColor(ctrl, v0);  break;
        case "keybind":widget = this.buildKeybind(ctrl, v0);break;
        default: widget = htmlEl(`<span style="color:var(--text-dim)">${ctrl.type}</span>`);
      }
      row.appendChild(widget);
      this.controlNodes.set(ctrl.id, { row, widget, ctrl });
      return row;
    }

    buildToggle(ctrl, v) {
      const t = document.createElement("button");
      t.className = `ax-toggle ${v ? "on" : ""}`;
      t.onclick = () => {
        const nv = !t.classList.contains("on");
        t.classList.toggle("on", nv);
        valueStore.set(ctrl.id, nv);
        this.runBound(ctrl, nv);
      };
      return t;
    }
    buildButton(ctrl) {
      const b = document.createElement("button");
      b.className = "ax-btn";
      b.textContent = ctrl.label || ctrl.id;
      // Tooltip becomes a native hover title since buttons drop the
      // outer row label (and with it, the "?" glyph).
      if (ctrl.tooltip) b.title = ctrl.tooltip;
      b.onclick = () => this.runBound(ctrl, true);
      return b;
    }
    buildSlider(ctrl, v) {
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:flex;align-items:center;gap:8px;min-width:160px";
      const s = document.createElement("input");
      s.type = "range"; s.min = ctrl.min ?? 0; s.max = ctrl.max ?? 100;
      s.step = ctrl.step ?? 1; s.value = v; s.style.flex = "1";
      const num = document.createElement("span");
      num.style.cssText = "font:11px var(--font-mono);color:var(--text-mute);min-width:30px;text-align:right";
      num.textContent = v;
      s.oninput = () => { num.textContent = s.value; };
      s.onchange = () => { valueStore.set(ctrl.id, +s.value); this.runBound(ctrl, +s.value); };
      wrap.append(s, num);
      return wrap;
    }
    buildNumber(ctrl, v) {
      const inp = document.createElement("input");
      inp.type = "number"; inp.className = "ax-input"; inp.value = v; inp.style.width = "100px";
      if (ctrl.min !== undefined) inp.min = ctrl.min;
      if (ctrl.max !== undefined) inp.max = ctrl.max;
      if (ctrl.step !== undefined) inp.step = ctrl.step;
      inp.onchange = () => { valueStore.set(ctrl.id, +inp.value); this.runBound(ctrl, +inp.value); };
      return inp;
    }
    buildText(ctrl, v) {
      const inp = document.createElement("input");
      inp.className = "ax-input"; inp.value = v || "";
      inp.placeholder = ctrl.placeholder || ""; inp.style.maxWidth = "180px";
      inp.onchange = () => { valueStore.set(ctrl.id, inp.value); this.runBound(ctrl, inp.value); };
      return inp;
    }
    buildSelect(ctrl, v) {
      const s = document.createElement("select");
      s.className = "ax-input"; s.style.maxWidth = "140px";
      // Static or dynamic options. `dynamicOptions: "<localStorageKey>"`
      // reads a { id: { name } } object from localStorage and lists it —
      // used by Base Saver so its saved-base dropdown is always current
      // on panel open (the panel rebuilds controls on every render).
      let opts = ctrl.options || [];
      if (ctrl.dynamicOptions) {
        try {
          const data = JSON.parse(localStorage.getItem(ctrl.dynamicOptions) || "{}");
          const ids = Object.keys(data);
          opts = ids.length
            ? ids.map((id) => ({ value: id, label: (data[id] && data[id].name) || id }))
            : [{ value: "", label: "(none saved)" }];
        } catch { opts = [{ value: "", label: "(none saved)" }]; }
      }
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o.value; opt.textContent = o.label || o.value; s.appendChild(opt);
      }
      if (v !== undefined && [...s.options].some((o) => o.value === v)) s.value = v;
      s.onchange = () => { valueStore.set(ctrl.id, s.value); this.runBound(ctrl, s.value); };
      return s;
    }
    buildColor(ctrl, v) {
      const c = document.createElement("input");
      c.type = "color"; c.value = v || "#ffffff";
      c.style.cssText = "width:30px;height:26px;border:1px solid var(--border);background:transparent;border-radius:4px";
      c.onchange = () => { valueStore.set(ctrl.id, c.value); this.runBound(ctrl, c.value); };
      return c;
    }
    buildKeybind(ctrl, v) {
      const b = document.createElement("button");
      b.className = "ax-btn"; b.textContent = v || "—";
      b.onclick = () => {
        b.textContent = "press a key…";
        const onKey = (e) => { e.preventDefault();
          const k = e.key.toUpperCase();
          valueStore.set(ctrl.id, k); b.textContent = k;
          document.removeEventListener("keydown", onKey, true);
          this.runBound(ctrl, k);
        };
        document.addEventListener("keydown", onKey, true);
      };
      return b;
    }

    runBound(ctrl, value) {
      if (!ctrl.scriptId) return;
      const def = this.schema.scripts && this.schema.scripts[ctrl.scriptId];
      runScript(def, value, ctrl.id, this);
    }
    triggerScript(id) {
      const node = this.controlNodes.get(id);
      if (node) this.runBound(node.ctrl, valueStore.get(id));
    }
    syncControl(id, v) {
      const node = this.controlNodes.get(id);
      if (!node) return;
      const w = node.widget;
      if (node.ctrl.type === "toggle") w.classList.toggle("on", !!v);
      else if (w.tagName === "INPUT" || w.tagName === "SELECT") w.value = v;
    }

    toggle(force) {
      this.visible = force !== undefined ? force : !this.visible;
      this.root.classList.toggle("open", this.visible);
      this.backdrop.classList.toggle("open", this.visible);
      if (this.visible) setTimeout(() => this.root.querySelector("#axp-search")?.focus(), 0);
    }

    bindHotkey() {
      const key = (this.schema.meta && this.schema.meta.hotkey) || "`";
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.visible) { this.toggle(false); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault(); this.toggle(true);
          return;
        }
        if (e.key === key && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
          e.preventDefault(); this.toggle();
        }
      });
    }
  }

  // Recursive search match — walks into row/group children so a hit on
  // an inner toggle still surfaces the outer section.
  function matchesControl(ctrl, q) {
    const hay = `${ctrl.label || ""} ${ctrl.tooltip || ""}`.toLowerCase();
    if (hay.includes(q)) return true;
    if (ctrl.controls && (ctrl.type === "row" || ctrl.type === "group")) {
      return ctrl.controls.some((c) => matchesControl(c, q));
    }
    return false;
  }
  function controlDefaultByType(t) {
    switch (t) { case "toggle": return false; case "slider": case "number": return 0;
                 case "color": return "#ffffff"; default: return ""; }
  }
  function escape(s) { return String(s).replace(/[<>&]/g, (c) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c])); }
  function htmlEl(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  // ── Boot ──────────────────────────────────────────────────────────
  whenReady(async () => {
    const schema = await loadSchema();
    if (!schema) { log("no schema available"); return; }
    const panel = new Panel(schema);
    hookSettingsGear(panel);
    window.AxiomPanel = panel;
    log("ready — hotkey:", schema.meta.hotkey || "`", "+ Settings gear");
  });
})();
