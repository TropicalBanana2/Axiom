// ZOUI v3.2.0
// ==============================================================
//  ZOUI  —  Discord-style UI library for zombs.io userscripts
//  https://github.com/TropicalBanana2/ZOUI
//  License: MIT
// ==============================================================

// ── ZOUICache ────────────────────────────────────────────────────────────────
//  Web Cache API persistence with an in-memory mirror for sync reads.

class ZOUICache {
    constructor(namespace) {
        this._ns  = namespace;
        this._mem = {};
        this._ready = this._hydrate();
    }

    async _hydrate() {
        try {
            const cache = await caches.open(this._ns);
            const keys  = await cache.keys();
            await Promise.all(keys.map(async req => {
                const res  = await cache.match(req);
                if (!res) return;
                const text = await res.text();
                const raw  = new URL(req.url).pathname.replace(/^\/.+\/~z~\//, "");
                const key  = decodeURIComponent(raw);
                try { this._mem[key] = JSON.parse(text); }
                catch { this._mem[key] = text; }
            }));
        } catch (e) { /* CacheStorage unavailable — mem-only mode */ }
    }

    get(key, fallback) {
        return key in this._mem ? this._mem[key] : fallback;
    }

    set(key, value) {
        this._mem[key] = value;
        this._write(key, value);
    }

    async _write(key, val) {
        try {
            const cache = await caches.open(this._ns);
            const url   = `https://zoui-persist/~z~/${encodeURIComponent(key)}`;
            await cache.put(url, new Response(JSON.stringify(val), { headers: { "Content-Type": "application/json" } }));
        } catch (e) { /* silent fallback */ }
    }

    async delete(key) {
        delete this._mem[key];
        try {
            const cache = await caches.open(this._ns);
            await cache.delete(`https://zoui-persist/~z~/${encodeURIComponent(key)}`);
        } catch (e) { /* silent */ }
    }

    async clear() {
        this._mem = {};
        try { await caches.delete(this._ns); } catch (e) { /* silent */ }
    }
}

// ── ZOUIPopup ────────────────────────────────────────────────────────────────
//  Standalone popup / toast system. Uses CSS variables for theming.
//  Every method returns a live handle: { update, setType, dismiss }

class ZOUIPopup {
    static _COLORS = { info: "#5865f2", success: "#23a559", warning: "#f0b232", error: "#ed4245" };
    static _ICONS  = {
        info:    `<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="rgba(88,101,242,0.25)"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="#8b9cf4" font-weight="700">i</text></svg>`,
        success: `<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="rgba(35,165,89,0.2)"/><path d="M5 8.5l2 2 4-4" stroke="#23a559" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
        warning: `<svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 2.5L13.5 13H2.5z" fill="rgba(240,178,50,0.2)" stroke="#f0b232" stroke-width="1.4" stroke-linejoin="round"/><text x="8" y="12" text-anchor="middle" font-size="7.5" fill="#f0b232" font-weight="700">!</text></svg>`,
        error:   `<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="rgba(237,66,69,0.2)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ed4245" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    };

    constructor() {
        this._injectStyles();
    }

    _injectStyles() {
        if (document.getElementById("zui-popup-styles")) return;
        const s = document.createElement("style");
        s.id = "zui-popup-styles";
        s.innerHTML = `
            @keyframes zui-in  { from{opacity:0;transform:translateY(-10px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
            @keyframes zui-out { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(-8px) scale(0.95)} }

            .zui-toast-wrap {
                position:fixed;top:20px;left:50%;transform:translateX(-50%);
                z-index:999999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;
            }
            .zui-toast {
                pointer-events:auto;
                background:var(--zui-bg, #2b2d31);
                border:1px solid var(--zui-border-strong, rgba(0,0,0,0.5));
                border-left:3px solid var(--zui-accent, #5865f2);
                border-radius:var(--zui-radius, 6px);
                padding:11px 16px;
                font-family:'gg sans','Noto Sans',sans-serif;font-size:13px;
                color:var(--zui-text-2, #dcddde);
                display:flex;align-items:center;gap:10px;
                box-shadow:0 4px 20px rgba(0,0,0,0.55);min-width:220px;max-width:480px;
                animation:zui-in 0.2s ease forwards;
            }
            .zui-toast.zui-out { animation:zui-out 0.18s ease forwards; }
            .zui-toast-icon { flex-shrink:0;display:flex;align-items:center; }
            .zui-toast { overflow:hidden; }
            .zui-toast-progress {
                position:absolute;left:0;bottom:0;height:2px;
                background:var(--zui-accent, #5865f2);
                width:100%;transform-origin:left center;
                animation:zui-toast-drain linear forwards;
            }
            @keyframes zui-toast-drain { from{transform:scaleX(1)} to{transform:scaleX(0)} }

            .zui-popup {
                pointer-events:auto;
                background:var(--zui-bg, #2b2d31);
                border:1px solid var(--zui-border-strong, rgba(0,0,0,0.5));
                border-top:2px solid var(--zui-accent, #5865f2);
                border-radius:var(--zui-radius-lg, 10px);
                padding:16px 18px;
                font-family:'gg sans','Noto Sans',sans-serif;font-size:13px;
                color:var(--zui-text-2, #dcddde);
                box-shadow:0 8px 28px rgba(0,0,0,0.65);min-width:260px;max-width:420px;
                animation:zui-in 0.2s ease forwards;display:flex;flex-direction:column;gap:12px;
            }
            .zui-popup-msg { line-height:1.55;color:var(--zui-text-2, #dcddde); }
            .zui-popup-btns { display:flex;gap:8px;justify-content:flex-end; }
            .zui-popup-btns button {
                background:var(--zui-accent, #5865f2);border:none;
                padding:7px 16px;border-radius:var(--zui-radius, 6px);
                color:var(--zui-text-on-accent, white);
                cursor:pointer;font-size:13px;font-weight:500;transition:background 0.15s;
            }
            .zui-popup-btns button:hover { background:var(--zui-accent-hover, #4752c4); }
            .zui-popup-btns button.secondary {
                background:var(--zui-accent-muted, rgba(88,101,242,0.15));
                color:var(--zui-accent-text, #8b9cf4);
            }
            .zui-popup-btns button.secondary:hover { background:var(--zui-accent-muted-2, rgba(88,101,242,0.25)); }
            .zui-popup-input {
                width:100%;padding:8px 10px;
                border-radius:var(--zui-radius, 6px);
                border:1px solid var(--zui-border-strong, rgba(0,0,0,0.4));
                background:var(--zui-bg-input, #1e1f22);
                color:var(--zui-text-2, #dcddde);
                font-size:13px;font-family:'gg sans','Noto Sans',sans-serif;
                outline:none;transition:border-color 0.15s;
            }
            .zui-popup-input::placeholder { color:var(--zui-text-3, #87898c); }
            .zui-popup-input:focus        { border-color:var(--zui-accent, #5865f2); }
        `;
        document.head.appendChild(s);
    }

    _container() {
        let w = document.getElementById("zui-toast-wrap");
        if (!w) {
            w = document.createElement("div");
            w.id = "zui-toast-wrap";
            w.className = "zui-toast-wrap";
            document.body.appendChild(w);
        }
        return w;
    }

    _handle(el) {
        return {
            update(msg) {
                const t = el.querySelector("[data-zui-msg]");
                if (t) t.innerHTML = msg;
                return this;
            },
            setType(type) {
                const c = ZOUIPopup._COLORS[type] ?? ZOUIPopup._COLORS.info;
                el.style.borderLeftColor = c;
                el.style.borderTopColor  = c;
                const icon = el.querySelector(".zui-toast-icon");
                if (icon) icon.innerHTML = ZOUIPopup._ICONS[type] ?? ZOUIPopup._ICONS.info;
                return this;
            },
            dismiss() {
                if (el._dismissed) return;
                el._dismissed = true;
                el.classList.add("zui-out");
                el.addEventListener("animationend", () => el.remove(), { once: true });
            },
        };
    }

    toast(message, type = "info", duration = 3000) {
        const wrap = this._container();
        const live = wrap.querySelectorAll(".zui-toast:not(.zui-out)");
        if (live.length >= 5) this._handle(live[0]).dismiss();

        const color = ZOUIPopup._COLORS[type] ?? ZOUIPopup._COLORS.info;
        const el = document.createElement("div");
        el.className = "zui-toast";
        el.style.borderLeftColor = color;
        el.style.position        = "relative"; // for the progress bar
        const progressHtml = duration > 0
            ? `<span class="zui-toast-progress" style="background:${color};animation-duration:${duration}ms"></span>`
            : "";
        el.innerHTML = `<span class="zui-toast-icon">${ZOUIPopup._ICONS[type] ?? ZOUIPopup._ICONS.info}</span><span data-zui-msg>${message}</span>${progressHtml}`;
        wrap.appendChild(el);
        const handle = this._handle(el);
        if (duration > 0) setTimeout(() => handle.dismiss(), duration);
        return handle;
    }

    confirm(message, onConfirm, onCancel = null) {
        const el = document.createElement("div");
        el.className = "zui-popup";
        el.innerHTML = `
            <div class="zui-popup-msg" data-zui-msg>${message}</div>
            <div class="zui-popup-btns">
                <button class="secondary zui-popup-cancel">Cancel</button>
                <button class="zui-popup-confirm">Confirm</button>
            </div>
        `;
        const close = (confirmed) => {
            document.removeEventListener("keydown", onKey);
            el.remove();
            confirmed ? onConfirm?.() : onCancel?.();
        };
        el.querySelector(".zui-popup-confirm").onclick = () => close(true);
        el.querySelector(".zui-popup-cancel").onclick  = () => close(false);
        const onKey = e => {
            if (e.key === "Enter")  close(true);
            if (e.key === "Escape") close(false);
        };
        document.addEventListener("keydown", onKey);
        this._container().appendChild(el);
        return this._handle(el);
    }

    input(message, onConfirm, onCancel = null, placeholder = "", defaultValue = "") {
        const el = document.createElement("div");
        el.className = "zui-popup";
        el.innerHTML = `
            <div class="zui-popup-msg" data-zui-msg>${message}</div>
            <input class="zui-popup-input" type="text" placeholder="${placeholder}" value="${defaultValue}">
            <div class="zui-popup-btns">
                <button class="secondary zui-popup-cancel">Cancel</button>
                <button class="zui-popup-confirm">Confirm</button>
            </div>
        `;
        const inp = el.querySelector(".zui-popup-input");
        const close = (confirmed) => { el.remove(); confirmed ? onConfirm?.(inp.value) : onCancel?.(); };
        el.querySelector(".zui-popup-confirm").onclick = () => close(true);
        el.querySelector(".zui-popup-cancel").onclick  = () => close(false);
        inp.addEventListener("keydown", e => {
            if (e.key === "Enter")  close(true);
            if (e.key === "Escape") close(false);
        });
        this._container().appendChild(el);
        setTimeout(() => inp.focus(), 30);
        return this._handle(el);
    }
}

// ── ZOUI ─────────────────────────────────────────────────────────────────────

class ZOUI {
    // ─────────────────────────────────────────────────────────────────────────
    //  Theme registry
    //  Keys map to theme objects consumed by setTheme().
    //  Add your own: ZOUI.registerTheme("my-theme", { bg: "#...", ... })
    // ─────────────────────────────────────────────────────────────────────────
    static themes = {};

    /**
     * Register a custom theme by name.
     * @param {string} name
     * @param {ThemeObject} theme  — see ZOUI.themes["default"] for the required fields
     */
    static registerTheme(name, theme) {
        ZOUI.themes[name] = theme;
    }

    /**
     * Convert a theme object to a CSS custom-property block string.
     * @param {ThemeObject} t
     * @returns {string}
     */
    static _themeToVars(t) {
        return `
            --zui-shadow:         ${t.shadow};
            --zui-bg:             ${t.bg};
            --zui-bg-header:      ${t.bgHeader};
            --zui-bg-search:      ${t.bgSearch};
            --zui-bg-input:       ${t.bgInput};
            --zui-bg-row:         ${t.bgRow};
            --zui-bg-row-hover:   ${t.bgRowHover};
            --zui-bg-tab-hover:   ${t.bgTabHover};
            --zui-border:         ${t.border};
            --zui-border-strong:  ${t.borderStrong};
            --zui-divider:        ${t.divider};
            --zui-accent:         ${t.accent};
            --zui-accent-hover:   ${t.accentHover};
            --zui-accent-muted:   ${t.accentMuted};
            --zui-accent-muted-2: ${t.accentMuted2};
            --zui-accent-text:    ${t.accentText};
            --zui-accent-glow:    ${t.accentGlow};
            --zui-text-1:         ${t.text1};
            --zui-text-2:         ${t.text2};
            --zui-text-3:         ${t.text3};
            --zui-text-on-accent: ${t.textOnAccent};
            --zui-success:        ${t.success};
            --zui-warning:        ${t.warning};
            --zui-error:          ${t.error};
            --zui-switch-off:     ${t.switchOff};
            --zui-switch-on:      ${t.switchOn};
            --zui-track:          ${t.track};
            --zui-radius:         ${t.radius};
            --zui-radius-lg:      ${t.radiusLg};
        `;
    }

    /**
     * @param {Element} container  - DOM element to mount the UI into
     * @param {string}  title      - Title shown in the header bar
     * @param {string}  version    - Version string shown in the header badge
     * @param {object}  opts       - { icon?: string }  emoji / SVG / URL for the header
     */
    constructor(container, title = "ZOUI", version = "1.0.0", opts = {}) {
        this.container = container;
        this.tabs      = {};
        this.activeTab = null;
        this.features  = [];
        this.version   = version;

        this._cols      = {};
        this._colTabMap = {};
        this._collId    = 0;

        // v3.2 state
        this._hydrates   = [];   // [() => void] rehydrators for preset / import re-apply
        this._defaults   = {};   // persistKey -> defaultVal (for "changed" indicator + reset)
        this._showIfs    = [];   // [{ el, fn }]
        this._accordions = {};   // tab -> [collKey, ...]
        this._tooltipId  = 0;
        this._dotEls     = {};   // persistKey -> dot element

        // v3.2 — Game-scripting helpers
        this._binds       = [];     // [{ id, combo, spec, fn, allowInInput, preventDefault }]
        this._bindId      = 0;
        this._bindKeyFn   = null;   // single global keydown listener
        this._loops       = [];     // managed loop handles
        this._events      = {};     // event -> Set<fn>
        this._huds        = {};     // name -> element
        this._logLevels   = {};     // namespace -> "silent"|"error"|"warn"|"info"|"debug"
        this._destroyed   = false;

        this._minimized   = false;
        this._toggleKeyFn = null;

        this._title = title;
        this._cache = new ZOUICache("zoui-" + title);

        this.container.style.cssText = "background:transparent;border:none;box-shadow:none;padding:0;";

        const headerIcon = opts.icon
            ? this._resolveHeaderIcon(opts.icon)
            : `<svg width="11" height="11" viewBox="0 0 12 12" fill="white"><polygon points="6,1 11,10 1,10"/></svg>`;

        this.container.innerHTML = `
            <div class="zui-wrapper">
                <div class="zui-headerbar">
                    <div class="zui-header-left">
                        <div class="zui-logo">${headerIcon}</div>
                        <span class="zui-title">${title}</span>
                    </div>
                    <div class="zui-header-right">
                        <button class="zui-minimize-btn" title="Minimize / Restore">−</button>
                        <div class="zui-status-dot"></div>
                        <span class="zui-version-badge">v${version}</span>
                    </div>
                </div>
                <div class="zui-global-search">
                    <div class="zui-search-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16">
                            <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="#87898c" stroke-width="1.8"/>
                            <line x1="10" y1="10" x2="14" y2="14" stroke="#87898c" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <input type="text" placeholder=" Search settings... (Ctrl+F)">
                    <div class="zui-search-results"></div>
                </div>
                <div class="zui-body">
                    <div class="zui-sidebar">
                        <div class="zui-sidebar-label">Navigation</div>
                    </div>
                    <div class="zui-content"></div>
                </div>
                <div class="zui-resize-handle" title="Drag to resize"></div>
            </div>
        `;

        this.wrapper       = this.container.querySelector(".zui-wrapper");
        this.sidebar       = this.container.querySelector(".zui-sidebar");
        this.content       = this.container.querySelector(".zui-content");
        this.searchInput   = this.container.querySelector(".zui-global-search input");
        this.searchResults = this.container.querySelector(".zui-search-results");
        this._versionBadge = this.container.querySelector(".zui-version-badge");
        this._resizeGrip   = this.container.querySelector(".zui-resize-handle");

        this.container.querySelector(".zui-minimize-btn").onclick = () => this.toggleMinimize();

        this._injectStyles();
        this._setupSearch();
        this._setupResize();
        this._setupKeyboardNav();
        this._setupBinds();
        this.popup = new ZOUIPopup();

        // Apply default theme then restore from cache
        this.setTheme("default");
        this._cache._ready.then(() => {
            const savedTheme = this._cache.get("__theme__");
            if (savedTheme && ZOUI.themes[savedTheme]) this.setTheme(savedTheme);
            const t = this._cache.get("__activeTab__");
            if (t && this.tabs[t]) this.switchTab(t);
            const size = this._cache.get("__panelSize__");
            if (size?.w && size?.h) { this.wrapper.style.width = size.w + "px"; this.wrapper.style.height = size.h + "px"; }
            // v3.2 — restore log levels (per-namespace, persisted)
            for (const k of Object.keys(this._cache._mem)) {
                if (k.startsWith("__log_") && k.endsWith("__")) {
                    this._logLevels[k.slice(6, -2)] = this._cache._mem[k];
                }
            }
            this._updateChangedDots();
        });
    }

    _resolveHeaderIcon(icon) {
        if (typeof icon !== "string") return "";
        if (icon.trim().startsWith("<svg")) return icon;
        if (icon.startsWith("http") || icon.startsWith("data:") || icon.includes("/"))
            return `<img src="${icon}" alt="" style="width:14px;height:14px;object-fit:contain;border-radius:3px">`;
        return `<span style="font-size:13px;line-height:1">${icon}</span>`;
    }

    // ── Theme ────────────────────────────────────────────────────────────────

    /**
     * Apply a theme by name (from ZOUI.themes) or by passing a theme object directly.
     * The active theme name is persisted across reloads.
     * @param {string|ThemeObject} nameOrObj
     */
    setTheme(nameOrObj) {
        const theme = typeof nameOrObj === "string"
            ? ZOUI.themes[nameOrObj]
            : nameOrObj;
        if (!theme) { console.warn(`ZOUI: unknown theme "${nameOrObj}"`); return; }

        let el = document.getElementById("zui-theme-vars");
        if (!el) {
            el = document.createElement("style");
            el.id = "zui-theme-vars";
            document.head.appendChild(el);
        }
        el.textContent = `:root { ${ZOUI._themeToVars(theme)} }`;

        this._currentTheme = typeof nameOrObj === "string" ? nameOrObj : "custom";
        // Persist (skip "default" to keep fresh installs clean)
        if (this._currentTheme !== "default") this._cache?.set("__theme__", this._currentTheme);
        else this._cache?.delete("__theme__");

        // Toggle structural CSS layout classes
        const wrapper = this.container.querySelector(".zui-wrapper");
        if (wrapper) {
            const isIos    = typeof nameOrObj === "string" && nameOrObj.startsWith("ios-");
            const isFluent = typeof nameOrObj === "string" && nameOrObj === "aurora";
            wrapper.classList.toggle("zui-ios",    isIos);
            wrapper.classList.toggle("zui-fluent", isFluent);
            wrapper.setAttribute("data-zui-theme", this._currentTheme);
            this._syncIosDOM(isIos);
            this._syncFluentDOM(isFluent);
        }
        // Body-level classes so backdrop-filter has no opaque ancestor blocking it
        document.body.classList.toggle("zui-glass",  this._currentTheme === "glass");
        document.body.classList.toggle("zui-aurora", this._currentTheme === "aurora");
    }

    _syncIosDOM(isIos) {
        const wrapper = this.container.querySelector(".zui-wrapper");
        if (!wrapper) return;

        // Drag handle — sheet-style pill at the very top of the panel
        let handle = wrapper.querySelector(".zui-ios-handle");
        if (isIos && !handle) {
            handle = document.createElement("div");
            handle.className = "zui-ios-handle";
            wrapper.insertBefore(handle, wrapper.firstChild);
        } else if (!isIos && handle) {
            handle.remove();
        }

        // Search placeholder
        if (this.searchInput) {
            this.searchInput.placeholder = isIos ? " Search" : " Search settings...";
        }
    }

    _syncFluentDOM(isFluent) {
        const wrapper = this.container.querySelector(".zui-wrapper");
        if (!wrapper) return;

        // Animated glow stripe injected at the start of the header bar
        const header = wrapper.querySelector(".zui-headerbar");
        let glow = wrapper.querySelector(".zui-aurora-glow");
        if (isFluent && !glow) {
            glow = document.createElement("div");
            glow.className = "zui-aurora-glow";
            if (header) header.insertBefore(glow, header.firstChild);
        } else if (!isFluent && glow) {
            glow.remove();
        }

        // Update search placeholder for the fluent aesthetic
        if (this.searchInput) {
            this.searchInput.placeholder = isFluent ? " Search…" : " Search settings...";
        }
    }

    // ── Styles ───────────────────────────────────────────────────────────────

    _injectStyles() {
        if (document.getElementById("zui-styles")) return;
        const style = document.createElement("style");
        style.id = "zui-styles";
        style.innerHTML = `
            /* ─── Layout ───────────────────────────────────────────────────── */
            .zui-wrapper {
                display:flex;flex-direction:column;width:620px;height:440px;
                background:var(--zui-bg);color:var(--zui-text-2);
                font-family:'gg sans','Noto Sans',sans-serif;
                border-radius:var(--zui-radius-lg);overflow:hidden;
                border:1px solid var(--zui-border-strong);
                box-shadow:var(--zui-shadow);
                transition:background 0.2s, color 0.2s, border-color 0.2s;
            }
            .zui-wrapper * { box-sizing:border-box;margin:0;padding:0; }

            /* ─── Header ───────────────────────────────────────────────────── */
            .zui-headerbar {
                height:48px;background:var(--zui-bg-header);display:flex;align-items:center;
                justify-content:space-between;padding:0 16px;
                border-bottom:1px solid var(--zui-border-strong);flex-shrink:0;
                transition:background 0.2s;
            }
            .zui-header-left  { display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--zui-text-1); }
            .zui-header-right { display:flex;align-items:center;gap:8px; }
            .zui-logo {
                width:20px;height:20px;background:var(--zui-accent);border-radius:5px;
                display:flex;align-items:center;justify-content:center;flex-shrink:0;
                transition:background 0.2s;
            }
            .zui-status-dot {
                width:7px;height:7px;border-radius:50%;
                background:var(--zui-success);
            }
            .zui-version-badge {
                font-size:11px;color:var(--zui-accent-text);
                background:var(--zui-accent-muted);padding:2px 8px;border-radius:10px;
                transition:background 0.2s, color 0.2s;
            }

            /* ─── Search ───────────────────────────────────────────────────── */
            .zui-global-search {
                position:relative;padding:12px;background:var(--zui-bg);
                border-bottom:1px solid var(--zui-border);flex-shrink:0;
                transition:background 0.2s;
            }
            .zui-search-icon { position:absolute;left:22px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:0.7; }
            .zui-wrapper .zui-global-search input[type="text"] {
                width:100%;height:40px;padding:0 10px 0 44px;
                background:var(--zui-bg-input);border:1px solid var(--zui-border-strong);
                border-radius:var(--zui-radius);color:var(--zui-text-2);font-size:13px;outline:none;
                transition:border-color 0.15s, background 0.2s;
            }
            .zui-wrapper .zui-global-search input[type="text"]::placeholder { color:var(--zui-text-3); }
            .zui-wrapper .zui-global-search input[type="text"]:focus        { border-color:var(--zui-accent); }
            .zui-search-results {
                position:absolute;top:calc(100% + 2px);left:12px;right:12px;
                background:var(--zui-bg-search);border:1px solid var(--zui-border-strong);
                border-radius:var(--zui-radius-lg);max-height:200px;overflow-y:auto;
                opacity:0;transform:translateY(-6px);pointer-events:none;
                transition:opacity 0.15s ease, transform 0.15s ease;z-index:99;
                box-shadow:0 8px 24px rgba(0,0,0,0.4);
            }
            .zui-search-results.active { opacity:1;transform:translateY(0);pointer-events:auto; }
            .zui-search-result {
                padding:8px 12px;font-size:13px;cursor:pointer;transition:background 0.1s;
                border-radius:4px;margin:3px;display:flex;justify-content:space-between;align-items:center;
                color:var(--zui-text-2);
            }
            .zui-search-result:hover,
            .zui-search-result.zui-kbd-focus { background:var(--zui-accent);color:var(--zui-text-on-accent); }
            .zui-result-tab { font-size:11px;color:var(--zui-text-3);background:var(--zui-bg-tab-hover);padding:2px 6px;border-radius:4px;flex-shrink:0; }
            .zui-search-result:hover .zui-result-tab { color:var(--zui-text-on-accent);background:rgba(255,255,255,0.15); }
            .zui-search-highlight { color:var(--zui-accent-text);font-weight:600; }
            .zui-search-result:hover .zui-search-highlight { color:var(--zui-text-on-accent); }

            /* ─── Body ─────────────────────────────────────────────────────── */
            .zui-body { display:flex;flex:1;min-height:0; }
            .zui-sidebar {
                width:152px;background:var(--zui-bg-header);display:flex;flex-direction:column;
                padding:6px;gap:2px;overflow-y:auto;flex-shrink:0;
                border-right:1px solid var(--zui-border);
                transition:background 0.2s;
            }
            .zui-sidebar-label {
                font-size:10px;font-weight:700;color:var(--zui-text-3);
                letter-spacing:0.07em;text-transform:uppercase;padding:10px 8px 5px;
            }
            .zui-content { flex:1;padding:14px 16px;overflow-y:auto;min-height:0; }

            /* ─── Tabs ─────────────────────────────────────────────────────── */
            .zui-tab {
                padding:8px 10px;border-radius:var(--zui-radius);cursor:pointer;font-size:13px;
                color:var(--zui-text-3);transition:background 0.12s,color 0.12s;
                display:flex;align-items:center;gap:8px;user-select:none;
            }
            .zui-tab:hover  { background:var(--zui-bg-tab-hover);color:var(--zui-text-2); }
            .zui-tab.active { background:var(--zui-accent);color:var(--zui-text-on-accent); }
            .zui-tab-icon   { width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0.7; }
            .zui-tab-icon img { width:16px;height:16px;object-fit:contain;border-radius:2px; }
            .zui-tab-icon svg { width:14px;height:14px; }
            .zui-tab.active .zui-tab-icon { opacity:1; }
            .zui-tab-icon.icon-emoji { font-size:14px;opacity:1;line-height:1; }

            /* ─── Content elements ─────────────────────────────────────────── */
            .zui-item           { margin-bottom:8px; }
            .zui-section-header { font-size:11px;font-weight:700;color:var(--zui-text-3);margin:14px 0 8px;text-transform:uppercase;letter-spacing:0.06em; }
            .zui-section-header:first-child { margin-top:2px; }
            .zui-text     { font-size:13px;color:var(--zui-text-3);line-height:1.5;padding:6px 0; }
            .zui-tip      { display:flex;gap:8px;align-items:flex-start;padding:9px 12px;background:var(--zui-accent-muted);border-radius:var(--zui-radius);border-left:3px solid var(--zui-accent);border-top-left-radius:0;border-bottom-left-radius:0; }
            .zui-tip-text { font-size:12px;color:var(--zui-accent-text);line-height:1.5; }
            .zui-divider  { height:1px;background:var(--zui-divider);margin:10px 0; }
            .zui-field-label { font-size:13px;color:var(--zui-text-2);margin-bottom:5px;display:block; }

            /* ─── Toggle ───────────────────────────────────────────────────── */
            .zui-toggle       { display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:var(--zui-radius);cursor:pointer;background:var(--zui-bg-row);transition:background 0.12s; }
            .zui-toggle:hover { background:var(--zui-bg-row-hover); }
            .zui-toggle-label { font-size:13px;color:var(--zui-text-2); }
            .zui-switch       { width:40px;height:22px;background:var(--zui-switch-off);border-radius:999px;position:relative;transition:background 0.25s,box-shadow 0.25s;flex-shrink:0; }
            .zui-switch::before { content:"";position:absolute;width:16px;height:16px;background:white;border-radius:50%;top:3px;left:3px;transition:left 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.4); }
            .zui-switch.active  { background:var(--zui-switch-on);box-shadow:0 0 0 2px var(--zui-accent-glow); }
            .zui-switch.active::before { left:21px; }

            /* ─── Slider ───────────────────────────────────────────────────── */
            .zui-slider-wrap label     { display:flex;justify-content:space-between;font-size:13px;color:var(--zui-text-2);margin-bottom:8px; }
            .zui-slider-wrap label span { color:var(--zui-accent-text);font-weight:600; }
            .zui-wrapper input[type="range"] { width:100%;appearance:none;height:4px;background:var(--zui-track);border-radius:999px;outline:none;cursor:pointer; }
            .zui-wrapper input[type="range"]::-webkit-slider-thumb { appearance:none;width:14px;height:14px;background:var(--zui-accent);border-radius:50%;cursor:pointer;border:2px solid var(--zui-bg-header);box-shadow:0 0 0 2px var(--zui-accent-glow); }

            /* ─── Buttons ──────────────────────────────────────────────────── */
            .zui-wrapper button           { background:var(--zui-accent);border:none;padding:8px 14px;border-radius:var(--zui-radius);color:var(--zui-text-on-accent);cursor:pointer;font-size:13px;font-weight:500;transition:background 0.15s,transform 0.1s; }
            .zui-wrapper button:hover     { background:var(--zui-accent-hover); }
            .zui-wrapper button:active    { transform:scale(0.97); }
            .zui-wrapper button.secondary { background:var(--zui-accent-muted);color:var(--zui-accent-text); }
            .zui-wrapper button.secondary:hover { background:var(--zui-accent-muted-2); }
            .zui-btn-row { display:flex;gap:6px; }

            /* ─── Text input ───────────────────────────────────────────────── */
            .zui-wrapper input[type="text"]              { width:100%;padding:8px 10px;border-radius:var(--zui-radius);border:1px solid var(--zui-border-strong);background:var(--zui-bg-input);color:var(--zui-text-2);font-size:13px;outline:none;transition:border-color 0.15s,background 0.2s; }
            .zui-wrapper input[type="text"]::placeholder { color:var(--zui-text-3); }
            .zui-wrapper input[type="text"]:focus        { border-color:var(--zui-accent); }

            /* ─── Select ───────────────────────────────────────────────────── */
            .zui-select       { width:100%;margin-top:4px;padding:8px 10px;border-radius:var(--zui-radius);border:1px solid var(--zui-border-strong);background:var(--zui-bg-input);color:var(--zui-text-2);font-size:13px;outline:none;cursor:pointer;transition:border-color 0.15s; }
            .zui-select:focus { border-color:var(--zui-accent); }

            /* ─── Search list ──────────────────────────────────────────────── */
            .zui-search-list { background:var(--zui-bg-input);border-radius:var(--zui-radius);max-height:110px;overflow-y:auto;margin-top:6px;border:1px solid var(--zui-border-strong); }
            .zui-search-list .zui-search-result { display:flex;align-items:center;gap:8px; }
            .zui-check { width:7px;height:7px;border-radius:50%;background:var(--zui-accent);display:none;flex-shrink:0; }
            .zui-search-list .zui-search-result.selected         { color:var(--zui-accent-text);font-weight:600; }
            .zui-search-list .zui-search-result.selected .zui-check { display:block; }
            .zui-search-list .zui-search-result:hover .zui-check    { display:block;background:var(--zui-text-on-accent); }

            /* ─── Version switcher ─────────────────────────────────────────── */
            .zui-version-switcher { display:flex;gap:4px;flex-wrap:wrap;margin-top:4px; }
            .zui-version-pill {
                padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;
                border:1px solid var(--zui-accent-muted-2);color:var(--zui-accent-text);background:transparent;
                transition:background 0.15s,border-color 0.15s,color 0.15s;
            }
            .zui-version-pill:hover  { background:var(--zui-accent-muted); }
            .zui-version-pill.active { background:var(--zui-accent);color:var(--zui-text-on-accent);border-color:var(--zui-accent); }

            /* ─── Scrollbars ───────────────────────────────────────────────── */
            .zui-wrapper ::-webkit-scrollbar       { width:6px; }
            .zui-wrapper ::-webkit-scrollbar-thumb { background:var(--zui-bg-tab-hover);border-radius:10px; }
            .zui-wrapper ::-webkit-scrollbar-thumb:hover { background:var(--zui-accent); }

            /* ─── v3 — Tab badge ───────────────────────────────────────────── */
            .zui-tab-badge { margin-left:auto;background:var(--zui-error);color:var(--zui-text-on-accent);font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;padding:0 5px;display:flex;align-items:center;justify-content:center; }

            /* ─── v3 — Collapsible ─────────────────────────────────────────── */
            .zui-collapsible-header { display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 4px;color:var(--zui-text-2);font-size:13px;user-select:none;border-radius:var(--zui-radius);transition:background 0.1s; }
            .zui-collapsible-header:hover { background:var(--zui-bg-tab-hover); }
            .zui-collapsible-arrow { display:flex;align-items:center;transition:transform 0.2s;color:var(--zui-text-3);flex-shrink:0; }
            .zui-collapsible-arrow.open { transform:rotate(90deg); }
            .zui-collapsible-body { padding-left:12px;border-left:2px solid var(--zui-divider);margin-left:6px; }

            /* ─── v3 — Progress bar ────────────────────────────────────────── */
            .zui-progress-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:6px; }
            .zui-progress-val    { font-size:12px;color:var(--zui-accent-text);font-weight:600; }
            .zui-progress-track  { height:6px;background:var(--zui-track);border-radius:999px;overflow:hidden; }
            .zui-progress-fill   { height:100%;background:var(--zui-accent);border-radius:999px;transition:width 0.3s ease; }

            /* ─── v3 — Keybind ─────────────────────────────────────────────── */
            .zui-keybind { display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--zui-bg-row);border-radius:var(--zui-radius); }
            .zui-keybind-btn { padding:4px 12px !important;font-size:12px !important;font-family:monospace !important;min-width:80px !important; }

            /* ─── v3 — Number input ────────────────────────────────────────── */
            .zui-wrapper input[type="number"] { width:100%;padding:8px 10px;border-radius:var(--zui-radius);border:1px solid var(--zui-border-strong);background:var(--zui-bg-input);color:var(--zui-text-2);font-size:13px;outline:none;transition:border-color 0.15s;-moz-appearance:textfield; }
            .zui-wrapper input[type="number"]:focus { border-color:var(--zui-accent); }
            .zui-wrapper input[type="number"]::-webkit-inner-spin-button { opacity:0.4; }

            /* ─── v3 — Color picker ────────────────────────────────────────── */
            .zui-color-row { display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--zui-bg-row);border-radius:var(--zui-radius); }
            .zui-color-swatch { width:28px;height:28px;border-radius:var(--zui-radius);border:2px solid var(--zui-border-strong);cursor:pointer;transition:border-color 0.15s,transform 0.1s;flex-shrink:0; }
            .zui-color-swatch:hover { border-color:var(--zui-accent);transform:scale(1.05); }

            /* ─── v3 — Radio group ─────────────────────────────────────────── */
            .zui-radio-group { display:flex;flex-direction:column;gap:4px;margin-top:6px; }
            .zui-radio-label { display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--zui-text-2);padding:6px 8px;border-radius:var(--zui-radius);transition:background 0.1s;user-select:none; }
            .zui-radio-label:hover { background:var(--zui-bg-tab-hover); }
            .zui-radio { width:16px;height:16px;border-radius:50%;border:2px solid var(--zui-switch-off);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color 0.2s; }
            .zui-radio::after { content:"";width:7px;height:7px;border-radius:50%;background:var(--zui-accent);opacity:0;transition:opacity 0.2s,transform 0.2s;transform:scale(0.5); }
            .zui-radio.active { border-color:var(--zui-accent); }
            .zui-radio.active::after { opacity:1;transform:scale(1); }

            /* ─── v3 — Tag / chip ──────────────────────────────────────────── */
            .zui-tag-row { display:flex;justify-content:space-between;align-items:center;padding:7px 0; }
            .zui-tag { font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;border:1px solid;letter-spacing:0.03em;white-space:nowrap; }

            /* ─── v3 — Minimize ────────────────────────────────────────────── */
            .zui-minimize-btn { background:transparent !important;border:none !important;color:var(--zui-text-3) !important;width:22px !important;height:22px !important;padding:0 !important;font-size:16px !important;line-height:1 !important;display:flex !important;align-items:center !important;justify-content:center !important;cursor:pointer;border-radius:var(--zui-radius) !important;transition:color 0.15s,background 0.15s !important;transform:none !important; }
            .zui-minimize-btn:hover { color:var(--zui-text-2) !important;background:var(--zui-bg-tab-hover) !important; }
            .zui-wrapper.zui-minimized .zui-body,
            .zui-wrapper.zui-minimized .zui-global-search { display:none !important; }
            .zui-wrapper.zui-minimized { height:auto !important; }

            /* ─── iOS structural overrides (.zui-ios) ──────────────────────── */
            /* Activates when an ios-* theme is set. Transforms the Discord-style
               layout into an iOS Settings grouped-table-view appearance.       */

            .zui-ios,
            .zui-ios * { font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-0.01em; }

            /* Drag handle — iOS modal sheet indicator pill */
            .zui-ios-handle { width:36px;height:5px;border-radius:3px;background:rgba(120,120,128,0.4);margin:10px auto 2px;flex-shrink:0; }

            /* Header bar — frosted-glass navigation bar (UIBlurEffect systemUltraThinMaterial) */
            .zui-ios .zui-headerbar { height:52px;border-bottom-width:0.5px;backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);background:var(--zui-bg-header) !important;position:relative; }

            /* Centered nav title — iOS positions title absolutely at center */
            .zui-ios .zui-title { position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:17px;font-weight:600;letter-spacing:-0.02em;pointer-events:none; }

            /* Hide logo triangle, version badge, status dot in iOS mode */
            .zui-ios .zui-logo { display:none; }
            .zui-ios .zui-version-badge { display:none; }
            .zui-ios .zui-status-dot { display:none; }

            /* Hide "Navigation" sidebar label */
            .zui-ios .zui-sidebar-label { display:none; }

            /* Search — iOS prominent search bar */
            .zui-ios .zui-global-search { padding:6px 12px 6px; }
            .zui-ios .zui-wrapper .zui-global-search input[type="text"] { border-radius:10px;height:36px;font-size:17px; }

            /* Content — inset padding matching .insetGrouped table view */
            .zui-ios .zui-content { padding:16px 16px 20px; }

            /* Section headers — 13px SF Pro, uppercase, secondaryLabel color */
            .zui-ios .zui-section-header { font-size:13px;font-weight:400;letter-spacing:0.04em;padding:20px 4px 6px;margin:0;text-transform:uppercase;color:var(--zui-text3); }
            .zui-ios .zui-section-header:first-child { padding-top:2px; }

            /* Plain text — iOS section footer style: 13px, tertiaryLabel */
            .zui-ios .zui-text { font-size:13px;padding:6px 4px 2px;line-height:1.45; }

            /* Tip box — full rounded, no left accent bar */
            .zui-ios .zui-tip { border-radius:12px;border-left:none;padding:12px 14px;font-size:13px; }

            /* Divider — section gap (no visible line, just spacing) */
            .zui-ios .zui-divider { background:transparent;height:8px;margin:0; }

            /* ── Grouped-section cells ─────────────────────────────────────── */
            /* Items sit flush inside a group; :has() rounds only outermost corners. */

            .zui-ios .zui-item { background:var(--zui-bg-row);border-radius:0;margin:0;overflow:hidden;position:relative; }

            /* First cell of a group — 12px top radius (Apple HIG insetGrouped) */
            .zui-ios .zui-item:first-child,
            .zui-ios .zui-section-header + .zui-item,
            .zui-ios .zui-divider + .zui-item,
            .zui-ios .zui-text + .zui-item,
            .zui-ios .zui-tip + .zui-item { border-top-left-radius:12px;border-top-right-radius:12px; }

            /* Last cell of a group — 12px bottom radius */
            .zui-ios .zui-item:last-child,
            .zui-ios .zui-item:has(+ .zui-section-header),
            .zui-ios .zui-item:has(+ .zui-divider),
            .zui-ios .zui-item:has(+ .zui-text),
            .zui-ios .zui-item:has(+ .zui-tip) { border-bottom-left-radius:12px;border-bottom-right-radius:12px; }

            /* Inset separator — 0.5px line from 16px left inset (opaqueSeparator color) */
            .zui-ios .zui-item + .zui-item::before { content:"";position:absolute;top:0;left:16px;right:0;height:0.5px;background:var(--zui-divider);z-index:1; }

            /* Cell press/active state — instant highlight like UITableView */
            .zui-ios .zui-item:active { background:var(--zui-bg-row-hover); }

            /* ── Toggle / UISwitch ─────────────────────────────────────────── */
            .zui-ios .zui-toggle { min-height:44px;padding:8px 16px;border-radius:0;background:transparent; }
            .zui-ios .zui-toggle:hover { background:var(--zui-bg-row-hover); }
            .zui-ios .zui-toggle:active { background:var(--zui-bg-row-hover); }

            /* UISwitch — 51×31px, easeInEaseOut 0.3s (matches CABasicAnimation default) */
            .zui-ios .zui-switch { width:51px;height:31px; }
            .zui-ios .zui-switch::before { width:27px;height:27px;top:2px;left:2px;box-shadow:0 3px 8px rgba(0,0,0,0.4),0 0 0 0.5px rgba(0,0,0,0.1);transition:left 0.3s cubic-bezier(0.42,0,0.58,1); }
            .zui-ios .zui-switch.active::before { left:22px; }

            /* ── Slider ────────────────────────────────────────────────────── */
            .zui-ios .zui-slider-wrap { padding:10px 16px 14px; }
            .zui-ios .zui-wrapper input[type="range"]::-webkit-slider-thumb { width:22px;height:22px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.35),0 0 0 0.5px rgba(0,0,0,0.1); }

            /* ── Buttons — 12px radius, 15px SF Pro, standard weight ───────── */
            .zui-ios .zui-wrapper button { border-radius:12px;font-size:15px;font-weight:400; }
            .zui-ios .zui-btn-row { gap:8px;padding:6px 0; }

            /* ── Sidebar tabs — iOS list-style navigation rows ─────────────── */
            .zui-ios .zui-sidebar { padding:8px 0;border-right-width:0.5px; }
            .zui-ios .zui-tab { border-radius:0;font-size:15px;font-weight:400;min-height:44px;padding:12px 14px;border-bottom:0.5px solid var(--zui-border); }
            .zui-ios .zui-tab:first-child { border-top:0.5px solid var(--zui-border); }
            .zui-ios .zui-tab.active { font-weight:600;color:var(--zui-accent);background:var(--zui-accent-muted); }

            /* Disclosure chevron — flex-1 on name so chevron pins to right edge */
            .zui-ios .zui-tab > span:not(.zui-tab-badge) { flex:1; }
            .zui-ios .zui-tab::after { content:"›";color:var(--zui-text3);font-size:20px;font-weight:300;line-height:1;margin-left:4px; }
            .zui-ios .zui-tab.active::after { color:var(--zui-accent); }

            /* ── Radio group ───────────────────────────────────────────────── */
            .zui-ios .zui-radio-label { min-height:44px;padding:10px 8px;font-size:15px; }

            /* ── Color picker row ──────────────────────────────────────────── */
            .zui-ios .zui-color-row { min-height:44px;padding:8px 16px;border-radius:0;background:transparent; }
            .zui-ios .zui-color-swatch { border-radius:8px;width:30px;height:30px;box-shadow:0 0 0 0.5px rgba(0,0,0,0.15); }

            /* ── Keybind ───────────────────────────────────────────────────── */
            .zui-ios .zui-keybind { min-height:44px;padding:8px 16px;background:transparent;border-radius:0;font-size:15px; }

            /* ── Tag / chip row ────────────────────────────────────────────── */
            .zui-ios .zui-tag-row { min-height:44px;padding:10px 0; }

            /* ── Number input ──────────────────────────────────────────────── */
            .zui-ios .zui-wrapper input[type="number"] { border-radius:10px;font-size:17px; }

            /* ── Progress bar — thinner iOS-style track ────────────────────── */
            .zui-ios .zui-progress-track { height:4px;border-radius:2px; }

            /* ── Search list ───────────────────────────────────────────────── */
            .zui-ios .zui-search-list { border-radius:12px; }

            /* ─── Aurora / Fluent layout (.zui-fluent) ──────────────────────── */
            /* Activated by setTheme("aurora"). Transforms the sidebar layout     */
            /* into a top-nav Windows Fluent / Claude-inspired glass panel.       */

            /* Panel — frosted glass + Segoe Variable font */
            .zui-wrapper.zui-fluent {
                backdrop-filter:blur(28px) saturate(180%);
                -webkit-backdrop-filter:blur(28px) saturate(180%);
                font-family:"Segoe UI Variable","Segoe UI",system-ui,-apple-system,sans-serif;
                letter-spacing:-0.012em;
            }

            /* Animated gradient glow stripe at the very top of the panel */
            .zui-aurora-glow {
                position:absolute;top:0;left:0;right:0;height:1px;pointer-events:none;z-index:10;
                background:linear-gradient(90deg,transparent 0%,rgba(56,189,248,0) 10%,rgba(56,189,248,0.75) 38%,rgba(147,197,253,0.85) 50%,rgba(56,189,248,0.75) 62%,rgba(56,189,248,0) 90%,transparent 100%);
                background-size:200% 100%;
                animation:zui-aurora-shimmer 4s ease-in-out infinite;
            }
            @keyframes zui-aurora-shimmer {
                0%,100% { opacity:0.6;background-position:0% 0%; }
                50%      { opacity:1;  background-position:100% 0%; }
            }

            /* Header — glass chrome */
            .zui-fluent .zui-headerbar {
                height:52px;
                background:rgba(6,9,20,0.72) !important;
                backdrop-filter:blur(20px) saturate(200%);
                -webkit-backdrop-filter:blur(20px) saturate(200%);
                border-bottom:1px solid rgba(56,189,248,0.14) !important;
                padding:0 14px 0 16px;
            }
            .zui-fluent .zui-header-left { gap:10px; }
            .zui-fluent .zui-title { font-size:14px;font-weight:600;letter-spacing:-0.025em; }
            .zui-fluent .zui-logo {
                width:26px;height:26px;border-radius:10px;
                box-shadow:0 0 0 1px rgba(56,189,248,0.45),0 0 16px rgba(56,189,248,0.6);
            }
            .zui-fluent .zui-version-badge {
                font-size:10px;font-weight:600;border-radius:6px;letter-spacing:0.03em;
                border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);
            }
            .zui-fluent .zui-status-dot { box-shadow:0 0 6px var(--zui-success); }
            .zui-fluent .zui-minimize-btn:hover { background:rgba(56,189,248,0.12) !important;color:#38bdf8 !important; }

            /* Body — sidebar floats to the top */
            .zui-fluent .zui-body { flex-direction:column; }

            /* Sidebar → horizontal pill nav bar */
            .zui-fluent .zui-sidebar {
                flex-direction:row;width:100%;height:auto;
                padding:8px 12px;gap:3px;align-items:center;flex-shrink:0;
                border-right:none;border-bottom:1px solid rgba(255,255,255,0.07);
                overflow-x:auto;overflow-y:hidden;
                scrollbar-width:none;background:rgba(255,255,255,0.018);
                transition:background 0.2s;
            }
            .zui-fluent .zui-sidebar::-webkit-scrollbar { display:none; }
            .zui-fluent .zui-sidebar-label { display:none; }

            /* Tabs → rounded pills */
            .zui-fluent .zui-tab {
                padding:5px 14px 5px 10px;border-radius:999px;white-space:nowrap;flex-shrink:0;
                font-size:12.5px;font-weight:500;gap:5px;
                border:1px solid transparent;
                transition:background 0.15s,color 0.15s,border-color 0.15s,box-shadow 0.15s;
            }
            .zui-fluent .zui-tab:hover {
                background:rgba(56,189,248,0.1);color:rgba(255,255,255,0.85);
                border-color:rgba(56,189,248,0.18);
            }
            .zui-fluent .zui-tab.active {
                background:rgba(56,189,248,0.18);color:#38bdf8;
                border-color:rgba(56,189,248,0.42);
                box-shadow:0 0 0 1px rgba(56,189,248,0.1),0 0 20px rgba(56,189,248,0.18);
            }
            .zui-fluent .zui-tab-icon { opacity:0.72; }
            .zui-fluent .zui-tab.active .zui-tab-icon { opacity:1; }
            .zui-fluent .zui-tab-badge { font-size:9px;min-width:16px;height:16px;border-radius:8px;padding:0 4px; }

            /* Search — pill shape */
            .zui-fluent .zui-global-search {
                background:transparent;padding:8px 14px;
                border-bottom:1px solid rgba(255,255,255,0.06);
            }
            .zui-fluent .zui-wrapper .zui-global-search input[type="text"] {
                background:rgba(255,255,255,0.055);border:1px solid rgba(255,255,255,0.12);
                border-radius:999px;height:34px;font-size:12.5px;padding:0 14px 0 40px;
            }
            .zui-fluent .zui-wrapper .zui-global-search input[type="text"]:focus {
                border-color:rgba(56,189,248,0.5);box-shadow:0 0 0 2px rgba(56,189,248,0.14);
            }

            /* Content */
            .zui-fluent .zui-content { padding:14px 16px 18px; }

            /* Section headers — blue tinted, no sticky bg */
            .zui-fluent .zui-section-header {
                font-size:10.5px;font-weight:700;letter-spacing:0.07em;
                color:rgba(56,189,248,0.65);margin:16px 0 8px;
                padding-bottom:7px;border-bottom:1px solid rgba(56,189,248,0.12);
                background:transparent !important;
            }
            .zui-fluent .zui-section-header:first-child { margin-top:2px; }

            /* Items — floating glass cards */
            .zui-fluent .zui-toggle {
                background:rgba(255,255,255,0.038);border:1px solid rgba(255,255,255,0.09);
                border-radius:12px;padding:10px 14px;
                transition:background 0.15s,border-color 0.15s;
            }
            .zui-fluent .zui-toggle:hover { background:rgba(56,189,248,0.07);border-color:rgba(56,189,248,0.24); }
            .zui-fluent .zui-switch.active { box-shadow:0 0 0 2px rgba(56,189,248,0.38),0 0 12px rgba(56,189,248,0.28); }

            .zui-fluent .zui-keybind {
                background:rgba(255,255,255,0.038);border:1px solid rgba(255,255,255,0.09);
                border-radius:12px;padding:10px 14px;
            }
            .zui-fluent .zui-keybind-btn { border-radius:8px !important; }

            .zui-fluent .zui-color-row {
                background:rgba(255,255,255,0.038);border:1px solid rgba(255,255,255,0.09);
                border-radius:12px;padding:10px 14px;
            }
            .zui-fluent .zui-color-swatch { border-radius:8px; }

            .zui-fluent .zui-slider-wrap {
                background:rgba(255,255,255,0.038);border:1px solid rgba(255,255,255,0.09);
                border-radius:12px;padding:12px 14px;
            }
            .zui-fluent .zui-wrapper input[type="range"]::-webkit-slider-thumb {
                box-shadow:0 0 0 2px rgba(56,189,248,0.42),0 0 10px rgba(56,189,248,0.42);
            }

            /* Buttons */
            .zui-fluent .zui-wrapper button { border-radius:8px;font-weight:500;letter-spacing:-0.01em; }
            .zui-fluent .zui-wrapper button.secondary {
                background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.11);color:var(--zui-accent-text);
            }
            .zui-fluent .zui-wrapper button.secondary:hover { background:rgba(255,255,255,0.1);color:var(--zui-accent-text); }

            /* Tip callout */
            .zui-fluent .zui-tip {
                border-left:none;border-top-left-radius:10px;border-bottom-left-radius:10px;border-radius:10px;
                background:rgba(56,189,248,0.09);border:1px solid rgba(56,189,248,0.22);padding:10px 14px;
            }

            /* Progress */
            .zui-fluent .zui-progress-track { background:rgba(255,255,255,0.08);height:5px; }

            /* Collapsible */
            .zui-fluent .zui-collapsible-body { border-left:2px solid rgba(56,189,248,0.28);margin-left:8px; }
            .zui-fluent .zui-collapsible-header:hover { background:rgba(56,189,248,0.07); }

            /* Text/number inputs and select */
            .zui-fluent .zui-wrapper input[type="text"],
            .zui-fluent .zui-wrapper input[type="number"],
            .zui-fluent .zui-select {
                background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;
            }
            .zui-fluent .zui-wrapper input[type="text"]:focus,
            .zui-fluent .zui-wrapper input[type="number"]:focus,
            .zui-fluent .zui-select:focus {
                border-color:rgba(56,189,248,0.5);box-shadow:0 0 0 2px rgba(56,189,248,0.12);
            }

            /* Radio */
            .zui-fluent .zui-radio-label:hover { background:rgba(56,189,248,0.07); }
            .zui-fluent .zui-tag { border-radius:8px; }
            .zui-fluent .zui-divider { background:rgba(56,189,248,0.1); }

            /* Scrollbars */
            .zui-fluent .zui-wrapper ::-webkit-scrollbar-thumb { background:rgba(56,189,248,0.2); }
            .zui-fluent .zui-wrapper ::-webkit-scrollbar-thumb:hover { background:rgba(56,189,248,0.45); }

            /* Resize grip — blue dots */
            .zui-fluent .zui-resize-handle {
                background:linear-gradient(135deg,transparent 0%,transparent 45%,rgba(56,189,248,0.45) 45%,rgba(56,189,248,0.45) 55%,transparent 55%,transparent 70%,rgba(56,189,248,0.45) 70%,rgba(56,189,248,0.45) 80%,transparent 80%);
            }

            /* Search results dropdown */
            .zui-fluent .zui-search-results {
                background:rgba(8,12,28,0.94);border:1px solid rgba(56,189,248,0.22);
                box-shadow:0 12px 40px rgba(0,0,0,0.55),0 0 32px rgba(56,189,248,0.08);
                backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
            }
            .zui-fluent .zui-search-result:hover,
            .zui-fluent .zui-search-result.zui-kbd-focus { background:rgba(56,189,248,0.2);color:rgba(255,255,255,0.92); }

            /* ─── v3.2 — Wrapper position (for resize handle) ──────────────── */
            .zui-wrapper { position:relative;min-width:420px;min-height:280px;max-width:1200px;max-height:900px; }

            /* ─── v3.2 — Resize handle ─────────────────────────────────────── */
            .zui-resize-handle {
                position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;
                background:linear-gradient(135deg, transparent 0%, transparent 45%, var(--zui-text-3) 45%, var(--zui-text-3) 55%, transparent 55%, transparent 70%, var(--zui-text-3) 70%, var(--zui-text-3) 80%, transparent 80%);
                opacity:0.5;transition:opacity 0.15s;z-index:5;border-bottom-right-radius:var(--zui-radius-lg);
            }
            .zui-resize-handle:hover { opacity:1; }
            .zui-wrapper.zui-minimized .zui-resize-handle { display:none !important; }

            /* ─── v3.2 — Accent-tinted scrollbars ──────────────────────────── */
            .zui-wrapper ::-webkit-scrollbar-thumb       { background:var(--zui-accent-muted-2); }
            .zui-wrapper ::-webkit-scrollbar-thumb:hover { background:var(--zui-accent); }

            /* ─── v3.2 — Sticky section headers ────────────────────────────── */
            .zui-section-header {
                position:sticky;top:-14px;background:var(--zui-bg);
                margin-left:-16px;margin-right:-16px;padding:14px 16px 8px;z-index:2;
            }
            .zui-section-header:first-child { margin-top:-14px; }

            /* ─── v3.2 — Tab fade-in ───────────────────────────────────────── */
            @keyframes zui-tab-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
            .zui-tab-anim { animation: zui-tab-in 0.18s ease both; }

            /* ─── v3.2 — Search-result pulse ───────────────────────────────── */
            @keyframes zui-pulse {
                0%   { box-shadow:0 0 0 0 var(--zui-accent); background:var(--zui-accent-muted); }
                100% { box-shadow:0 0 0 8px transparent;       background:transparent; }
            }
            .zui-pulse { animation: zui-pulse 0.9s ease-out; border-radius:var(--zui-radius); }

            /* ─── v3.2 — Slider value bubble ───────────────────────────────── */
            .zui-slider-wrap { position:relative; }
            .zui-slider-bubble {
                position:absolute;bottom:24px;transform:translateX(-50%);
                background:var(--zui-accent);color:var(--zui-text-on-accent);
                font-size:11px;font-weight:600;padding:3px 8px;border-radius:var(--zui-radius);
                opacity:0;transition:opacity 0.15s;pointer-events:none;white-space:nowrap;
                box-shadow:0 2px 6px rgba(0,0,0,0.3);
            }
            .zui-slider-bubble::after {
                content:"";position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);
                border:4px solid transparent;border-top-color:var(--zui-accent);
            }
            .zui-slider-wrap.zui-dragging .zui-slider-bubble { opacity:1; }

            /* ─── v3.2 — Tooltip ───────────────────────────────────────────── */
            .zui-tooltip-wrap { position:relative;display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle; }
            .zui-tooltip-icon {
                width:14px;height:14px;border-radius:50%;
                background:var(--zui-accent-muted);color:var(--zui-accent-text);
                font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;
                cursor:help;line-height:1;user-select:none;
            }
            .zui-tooltip {
                position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);
                background:var(--zui-bg-header);color:var(--zui-text-2);
                border:1px solid var(--zui-border-strong);
                font-size:11px;line-height:1.45;padding:6px 9px;border-radius:var(--zui-radius);
                white-space:normal;min-width:140px;max-width:240px;
                opacity:0;pointer-events:none;transition:opacity 0.15s,transform 0.15s;
                z-index:1000;box-shadow:0 4px 14px rgba(0,0,0,0.4);
            }
            .zui-tooltip-wrap:hover .zui-tooltip { opacity:1;transform:translateX(-50%) translateY(-2px); }

            /* ─── v3.2 — Changed-from-default dot ──────────────────────────── */
            .zui-changed-dot {
                display:inline-block;width:6px;height:6px;border-radius:50%;
                background:var(--zui-warning);margin-left:6px;vertical-align:middle;
            }

            /* ─── v3.2 — Empty tab state ───────────────────────────────────── */
            .zui-empty-state { text-align:center;color:var(--zui-text-3);font-size:12px;padding:40px 20px;opacity:0.7; }

            /* ─── v3.2 — Header icon container ─────────────────────────────── */
            .zui-logo { overflow:hidden; }
            .zui-logo img, .zui-logo svg, .zui-logo span { display:block; }

            /* ─── v3.2 — Glass theme variant (backdrop blur) ───────────────── */
            .zui-glass .zui-wrapper       { backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%); }
            .zui-glass .zui-headerbar,
            .zui-glass .zui-sidebar       { backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px); }

            /* ─── v3.2 — HUD overlay widgets ───────────────────────────────── */
            .zui-hud {
                position:fixed;z-index:999998;
                background:var(--zui-bg);color:var(--zui-text-1);
                border:1px solid var(--zui-border-strong);
                font-family:'gg sans','Noto Sans',sans-serif;font-size:12px;font-weight:600;
                padding:4px 10px;border-radius:var(--zui-radius);
                box-shadow:0 2px 8px rgba(0,0,0,0.4);
                user-select:none;cursor:grab;
                transition:background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.15s;
                white-space:nowrap;
            }
            .zui-hud:hover  { box-shadow:0 4px 14px rgba(0,0,0,0.5); }
            .zui-hud.zui-hud-dragging { cursor:grabbing;opacity:0.85; }
            .zui-hud-top-left     { top:10px;    left:10px;  }
            .zui-hud-top-right    { top:10px;    right:10px; }
            .zui-hud-bottom-left  { bottom:10px; left:10px;  }
            .zui-hud-bottom-right { bottom:10px; right:10px; }
        `;
        document.head.appendChild(style);
        document.addEventListener("click", e => {
            if (!e.target.closest(".zui-global-search"))
                document.querySelectorAll(".zui-search-results").forEach(r => r.classList.remove("active"));
        });
    }

    // ── Search ───────────────────────────────────────────────────────────────

    _scoreMatch(text, query) {
        text = text.toLowerCase(); query = query.toLowerCase();
        if (text === query)          return 100;
        if (text.startsWith(query)) return 90;
        if (text.includes(query))   return 80;
        let score = 0, t = 0;
        for (let i = 0; i < query.length; i++) {
            const idx = text.indexOf(query[i], t);
            if (idx === -1) return 0;
            score++; t = idx + 1;
        }
        return score;
    }

    _highlight(text, query) {
        const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return text.replace(new RegExp(`(${safe.split("").join(".*?")})`, "i"), `<span class="zui-search-highlight">$1</span>`);
    }

    _setupSearch() {
        this.searchInput.oninput = () => {
            const val = this.searchInput.value.trim();
            this.searchResults.innerHTML = "";
            if (!val) { this.searchResults.classList.remove("active"); return; }
            const ranked = this.features
                .map(f => ({ ...f, score: this._scoreMatch(f.label, val) }))
                .filter(f => f.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);
            ranked.forEach(f => {
                const el = document.createElement("div");
                el.className = "zui-search-result";
                el.innerHTML = `<span>${this._highlight(f.displayLabel ?? f.label, val)}</span><span class="zui-result-tab">${f.tab}</span>`;
                el.onclick = () => {
                    this.switchTab(f.tab);
                    f.element.scrollIntoView({ behavior: "smooth", block: "center" });
                    // v3.2: pulse highlight on landing
                    f.element.classList.remove("zui-pulse");
                    void f.element.offsetWidth;     // force reflow to restart animation
                    f.element.classList.add("zui-pulse");
                    setTimeout(() => f.element.classList.remove("zui-pulse"), 1000);
                    this.searchResults.classList.remove("active");
                    this.searchInput.value = "";
                };
                this.searchResults.appendChild(el);
            });
            this.searchResults.classList.add("active");
        };
    }

    // ── Icon resolver ────────────────────────────────────────────────────────

    _resolveIcon(name, icon) {
        if (icon && typeof icon === "string") {
            if (icon.trim().startsWith("<svg"))
                return `<div class="zui-tab-icon">${icon}</div>`;
            if (icon.startsWith("http") || icon.startsWith("data:") || icon.includes("/"))
                return `<div class="zui-tab-icon"><img src="${icon}" alt=""></div>`;
            if (icon.codePointAt(0) > 127)
                return `<div class="zui-tab-icon icon-emoji">${icon}</div>`;
        }
        const builtins = {
            Player:  `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.31 2.69-6 6-6s6 2.69 6 6"/></svg>`,
            Combat:  `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l3 3-1 1 1 1 5-5-1-1 1-1-3-3-1 1-1-1-5 5 1 1zm10 8l-5 5 1 1 1-1 3 3 1-1-3-3 1-1 1 1 5-5-1-1-1 1-3-3-1 1z"/></svg>`,
            Visuals: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.2"/><path d="M8 3C4.5 3 1.5 8 1.5 8S4.5 13 8 13s6.5-5 6.5-5S11.5 3 8 3z"/></svg>`,
            Misc:    `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>`,
        };
        const svg = builtins[name] || `<svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>`;
        return `<div class="zui-tab-icon">${svg}</div>`;
    }

    // ── Feature registration ─────────────────────────────────────────────────

    _registerFeature(tabOrColl, label, element) {
        const tab = this._colTabMap?.[tabOrColl] ?? tabOrColl;
        const searchLabel = label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{So}\s]+/u, "").trim() || label;
        this.features.push({ tab, label: searchLabel, displayLabel: label, element });
    }

    // ── Persistence helper ───────────────────────────────────────────────────

    _makePersist(opts, defaultVal) {
        const key = opts?.persist;
        if (key) this._defaults[key] = defaultVal;          // v3.2: track defaults
        return {
            initial: key ? this._cache.get(key, defaultVal) : defaultVal,
            wrap: (cb) => key
                ? (v => { this._cache.set(key, v); cb(v); this._updateChangedDot(key); this._evaluateShowIfs(); })
                : (v => { cb(v); this._evaluateShowIfs(); }),
            hydrate: (applyFn) => {
                if (!key) return;
                // Reusable rehydrator — called once after cache._ready, and again on preset / import loads.
                const rehydrate = () => {
                    const stored = this._cache.get(key, undefined);
                    if (stored !== undefined) applyFn(stored);
                    this._updateChangedDot(key);
                };
                this._hydrates.push(rehydrate);
                this._cache._ready.then(rehydrate);
            },
        };
    }

    // ── v3.2 — Decoration helper ─────────────────────────────────────────────
    //  After a component is constructed, this attaches the tooltip "?" icon,
    //  the "changed" dot, and registers any showIf predicate.
    //
    //  Components call this once after `_registerFeature`:
    //      this._decorate(el, opts, opts?.persist);

    _decorate(el, opts, persistKey) {
        // Tooltip — append `?` icon after the first label-like element
        if (opts?.tooltip) {
            const label = el.querySelector(".zui-toggle-label, .zui-field-label");
            if (label) {
                const tid  = `zui-tip-${++this._tooltipId}`;
                const wrap = document.createElement("span");
                wrap.className = "zui-tooltip-wrap";
                wrap.innerHTML = `<span class="zui-tooltip-icon">?</span><span class="zui-tooltip" id="${tid}">${opts.tooltip}</span>`;
                label.appendChild(wrap);
            }
        }
        // Changed-from-default dot
        if (persistKey) {
            const label = el.querySelector(".zui-toggle-label, .zui-field-label");
            if (label) {
                const dot = document.createElement("span");
                dot.className = "zui-changed-dot";
                dot.style.display = "none";
                dot.title = "Modified from default";
                label.appendChild(dot);
                this._dotEls[persistKey] = dot;
                this._updateChangedDot(persistKey);
            }
        }
        // showIf — store and evaluate immediately
        if (typeof opts?.showIf === "function") {
            this._showIfs.push({ el, fn: opts.showIf });
            try { el.style.display = opts.showIf() ? "" : "none"; } catch { /* swallow */ }
        }
    }

    _updateChangedDot(key) {
        const dot = this._dotEls[key];
        if (!dot) return;
        const cur = this._cache.get(key, this._defaults[key]);
        const def = this._defaults[key];
        const changed = JSON.stringify(cur) !== JSON.stringify(def);
        dot.style.display = changed ? "inline-block" : "none";
    }

    _updateChangedDots() {
        for (const k of Object.keys(this._dotEls)) this._updateChangedDot(k);
    }

    _evaluateShowIfs() {
        for (const { el, fn } of this._showIfs) {
            let ok = true;
            try { ok = !!fn(); } catch { ok = true; }
            el.style.display = ok ? "" : "none";
        }
    }

    _rehydrateAll() {
        for (const fn of this._hydrates) { try { fn(); } catch { /* swallow */ } }
        this._evaluateShowIfs();
        this._updateChangedDots();
    }

    // ── v3.2 — Resize handle ─────────────────────────────────────────────────

    _setupResize() {
        const grip = this._resizeGrip;
        if (!grip) return;
        let startX = 0, startY = 0, startW = 0, startH = 0, dragging = false;

        const onMove = (e) => {
            if (!dragging) return;
            const w = Math.max(420, Math.min(1200, startW + (e.clientX - startX)));
            const h = Math.max(280, Math.min(900,  startH + (e.clientY - startY)));
            this.wrapper.style.width  = w + "px";
            this.wrapper.style.height = h + "px";
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            const r = this.wrapper.getBoundingClientRect();
            this._cache?.set("__panelSize__", { w: Math.round(r.width), h: Math.round(r.height) });
        };
        grip.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            const r = this.wrapper.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            startW = r.width;   startH = r.height;
            dragging = true;
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    // ── v3.2 — Keyboard navigation ───────────────────────────────────────────

    _setupKeyboardNav() {
        document.addEventListener("keydown", (e) => {
            // Ctrl+F or Cmd+F → focus search
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && this.container.isConnected) {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
                return;
            }
            // Escape → clear search if focused
            if (e.key === "Escape" && document.activeElement === this.searchInput) {
                this.searchInput.value = "";
                this.searchInput.dispatchEvent(new Event("input"));
                this.searchInput.blur();
            }
        });
        // Arrow keys within search results
        this.searchInput.addEventListener("keydown", (e) => {
            const items = [...this.searchResults.querySelectorAll(".zui-search-result")];
            if (!items.length) return;
            const idx = items.findIndex(el => el.classList.contains("zui-kbd-focus"));
            if (e.key === "ArrowDown") {
                e.preventDefault();
                items.forEach(el => el.classList.remove("zui-kbd-focus"));
                items[(idx + 1) % items.length].classList.add("zui-kbd-focus");
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                items.forEach(el => el.classList.remove("zui-kbd-focus"));
                items[(idx <= 0 ? items.length - 1 : idx - 1)].classList.add("zui-kbd-focus");
            } else if (e.key === "Enter") {
                e.preventDefault();
                (items[idx] || items[0])?.click();
            }
        });
    }

    // ── Content container resolver ───────────────────────────────────────────

    _getTabEl(tab) {
        return this.tabs[tab] || this._cols[tab];
    }

    // ── Public API ───────────────────────────────────────────────────────────

    setVersion(v) {
        this.version = v;
        this._versionBadge.textContent = `v${v}`;
    }

    switchTab(name) {
        for (let t in this.tabs) this.tabs[t].style.display = "none";
        [...this.sidebar.querySelectorAll(".zui-tab")].forEach(el => el.classList.remove("active"));
        const index = Object.keys(this.tabs).indexOf(name);
        this.sidebar.querySelectorAll(".zui-tab")[index].classList.add("active");
        const tabEl = this.tabs[name];
        tabEl.style.display = "block";
        // v3.2 — empty-state placeholder
        tabEl.querySelector(".zui-empty-state")?.remove();
        if (tabEl.children.length === 0) {
            const empty = document.createElement("div");
            empty.className = "zui-empty-state";
            empty.textContent = "No settings here yet.";
            tabEl.appendChild(empty);
        }
        // v3.2 — fade-in animation
        tabEl.classList.remove("zui-tab-anim");
        void tabEl.offsetWidth;
        tabEl.classList.add("zui-tab-anim");
        this.activeTab = name;
        this._cache?.set("__activeTab__", name);
    }

    addTab(name, icon = null) {
        const tabBtn = document.createElement("div");
        tabBtn.className = "zui-tab";
        tabBtn.innerHTML = this._resolveIcon(name, icon) + `<span>${name}</span>`;
        const tabContent = document.createElement("div");
        tabContent.style.display = "none";
        this.sidebar.appendChild(tabBtn);
        this.content.appendChild(tabContent);
        this.tabs[name] = tabContent;
        tabBtn.onclick = () => this.switchTab(name);
        if (!this.activeTab) tabBtn.click();
        return name;
    }

    setTabBadge(tab, value) {
        const index = Object.keys(this.tabs).indexOf(tab);
        if (index === -1) return;
        const tabBtn = this.sidebar.querySelectorAll(".zui-tab")[index];
        if (!tabBtn) return;
        tabBtn.querySelector(".zui-tab-badge")?.remove();
        if (value === null || value === undefined) return;
        const badge = document.createElement("span");
        badge.className = "zui-tab-badge";
        badge.textContent = String(value);
        tabBtn.appendChild(badge);
    }

    addHeader(tab, text) {
        const el = document.createElement("div");
        el.className = "zui-section-header";
        el.innerText = text;
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, text, el);
    }

    addDivider(tab) {
        const el = document.createElement("div");
        el.className = "zui-divider";
        this._getTabEl(tab).appendChild(el);
    }

    addText(tab, text, tip = false) {
        const el = document.createElement("div");
        if (tip) {
            el.className = "zui-tip";
            el.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="7" fill="rgba(88,101,242,0.25)"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="#8b9cf4" font-weight="700">i</text></svg><span class="zui-tip-text">${text}</span>`;
        } else {
            el.className = "zui-text";
            el.innerText = text;
        }
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, text, el);
    }

    addToggle(tab, label, def, callback, opts = {}) {
        const p = this._makePersist(opts, def);
        const el = document.createElement("div");
        el.className = "zui-item";
        let active = p.initial;
        el.innerHTML = `<div class="zui-toggle"><span class="zui-toggle-label">${label}</span><div class="zui-switch ${active ? "active" : ""}"></div></div>`;
        const sw = el.querySelector(".zui-switch");
        const cb = p.wrap(callback);
        el.querySelector(".zui-toggle").onclick = () => {
            active = !active;
            sw.classList.toggle("active", active);
            cb(active);
        };
        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== def) callback(p.initial);
        p.hydrate(v => { active = v; sw.classList.toggle("active", active); callback(v); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
    }

    addSlider(tab, label, min, max, value, callback, opts = {}) {
        const p  = this._makePersist(opts, value);
        const el = document.createElement("div");
        el.className = "zui-item zui-slider-wrap";
        el.innerHTML = `<label>${label}<span>${p.initial}</span></label><input type="range" min="${min}" max="${max}" value="${p.initial}" step="1"><div class="zui-slider-bubble">${p.initial}</div>`;
        const input  = el.querySelector("input");
        const span   = el.querySelector("label > span");
        const bubble = el.querySelector(".zui-slider-bubble");
        const cb = p.wrap(callback);

        // v3.2: position the bubble above the thumb
        const positionBubble = () => {
            const pct = (Number(input.value) - min) / (max - min || 1);
            const w   = input.getBoundingClientRect().width;
            bubble.style.left = (pct * (w - 14) + 7) + "px"; // 14 = thumb width
            bubble.textContent = input.value;
        };

        input.oninput = () => { span.innerText = input.value; positionBubble(); cb(Number(input.value)); };
        input.addEventListener("pointerdown", () => { el.classList.add("zui-dragging"); positionBubble(); });
        document.addEventListener("pointerup", () => el.classList.remove("zui-dragging"));
        input.addEventListener("focus", () => { el.classList.add("zui-dragging"); positionBubble(); });
        input.addEventListener("blur",  () => el.classList.remove("zui-dragging"));

        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== value) callback(p.initial);
        p.hydrate(v => { input.value = v; span.innerText = v; positionBubble(); callback(Number(v)); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
    }

    addButton(tab, label, callback, secondary = false, opts = {}) {
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<button class="${secondary ? "secondary" : ""}">${label}</button>`;
        el.querySelector("button").onclick = callback;
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, label, el);
        this._decorate(el, opts);
    }

    addButtonRow(tab, buttons) {
        const el = document.createElement("div");
        el.className = "zui-item zui-btn-row";
        buttons.forEach(([label, cb, sec]) => {
            const b = document.createElement("button");
            b.className = sec ? "secondary" : "";
            b.innerText = label;
            b.onclick = cb;
            el.appendChild(b);
            this._registerFeature(tab, label, b);
        });
        this._getTabEl(tab).appendChild(el);
    }

    addTextbox(tab, label, placeholder, callback, defaultValue = "", opts = {}) {
        const p  = this._makePersist(opts, defaultValue);
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<span class="zui-field-label">${label}</span><input type="text" placeholder="${placeholder}" value="${p.initial}">`;
        const input = el.querySelector("input");
        const cb = p.wrap(callback);
        input.oninput = e => cb(e.target.value);
        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== defaultValue) callback(p.initial);
        p.hydrate(v => { input.value = v; callback(v); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
    }

    addSelect(tab, label, options, callback, opts = {}) {
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<span class="zui-field-label">${label}</span><select class="zui-select"></select>`;
        const sel = el.querySelector("select");
        options.forEach(({ value, label: text }) => {
            const opt = document.createElement("option");
            opt.value = value; opt.textContent = text;
            sel.appendChild(opt);
        });
        const p  = this._makePersist(opts, sel.value);
        const cb = p.wrap(callback);
        sel.onchange = () => cb(sel.value);
        if (opts?.persist && p.initial !== sel.value) { sel.value = p.initial; callback(p.initial); }
        p.hydrate(v => { sel.value = v; callback(v); });
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
        return {
            element: sel,
            get value() { return sel.value; },
            set value(v) { sel.value = v; },
            addOption(value, label) { const opt = document.createElement("option"); opt.value = value; opt.textContent = label; sel.appendChild(opt); return opt; },
            removeOption(value) { sel.querySelector(`option[value="${CSS.escape(value)}"]`)?.remove(); },
            clear() { sel.innerHTML = ""; },
            getValue() { return sel.value; },
            setValue(v) { sel.value = v; },
        };
    }

    addSearchList(tab, label, items, callback, opts = {}) {
        const p  = this._makePersist(opts, null);
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<span class="zui-field-label">${label}</span><input type="text" placeholder="Filter..."><div class="zui-search-list"></div>`;
        const input = el.querySelector("input"), list = el.querySelector(".zui-search-list");
        let selected = p.initial;
        const cb = p.wrap(callback);
        const render = (filter = "") => {
            list.innerHTML = "";
            items.filter(i => i.toLowerCase().includes(filter.toLowerCase())).forEach(item => {
                const itemEl = document.createElement("div");
                itemEl.className = "zui-search-result" + (item === selected ? " selected" : "");
                itemEl.innerHTML = `<div class="zui-check"></div>${item}`;
                itemEl.onclick = () => { selected = item; render(input.value); cb(item); };
                list.appendChild(itemEl);
            });
        };
        input.oninput = () => render(input.value);
        render();
        if (opts?.persist && p.initial !== null) callback(p.initial);
        p.hydrate(v => { if (items.includes(v)) { selected = v; render(input.value); callback(v); } });
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
        return {
            addItem(item)    { if (!items.includes(item)) items.push(item); render(input.value); },
            removeItem(item) { const i = items.indexOf(item); if (i !== -1) items.splice(i, 1); if (selected === item) selected = null; render(input.value); },
            clear()          { items.length = 0; selected = null; render(input.value); },
            getValue()       { return selected; },
            setValue(item)   { selected = items.includes(item) ? item : null; render(input.value); },
            get value()      { return selected; },
            set value(item)  { this.setValue(item); },
        };
    }

    addVersionSwitcher(tab, label, versions, current, callback) {
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<span class="zui-field-label">${label}</span><div class="zui-version-switcher"></div>`;
        const row = el.querySelector(".zui-version-switcher");
        versions.forEach(v => {
            const pill = document.createElement("button");
            pill.className = "zui-version-pill" + (v === current ? " active" : "");
            pill.textContent = `v${v}`;
            pill.onclick = () => {
                row.querySelectorAll(".zui-version-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                this.setVersion(v);
                callback(v);
            };
            row.appendChild(pill);
            this._registerFeature(tab, `${label} v${v}`, pill);
        });
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, label, el);
    }

    // ── v3 components ────────────────────────────────────────────────────────

    addCollapsible(tab, label, open = true, opts = {}) {
        const collKey = `__coll_${++this._collId}`;
        const p = this._makePersist(opts, open);
        let isOpen = p.initial;
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `
            <div class="zui-collapsible-header">
                <span class="zui-collapsible-arrow ${isOpen ? "open" : ""}">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><polygon points="0,0 8,4 0,8"/></svg>
                </span>
                <span>${label}</span>
            </div>
            <div class="zui-collapsible-body" style="display:${isOpen ? "block" : "none"}"></div>
        `;
        const arrow  = el.querySelector(".zui-collapsible-arrow");
        const body   = el.querySelector(".zui-collapsible-body");
        const header = el.querySelector(".zui-collapsible-header");

        // v3.2: accordion mode — track siblings in the same accordion group
        if (opts?.accordion) {
            (this._accordions[tab] ||= []).push({ collKey, arrow, body, opts });
        }

        const setOpen = (v, persist = true) => {
            isOpen = v;
            arrow.classList.toggle("open", isOpen);
            body.style.display = isOpen ? "block" : "none";
            if (persist && opts?.persist) this._cache.set(opts.persist, isOpen);
        };

        header.onclick = () => {
            const next = !isOpen;
            setOpen(next);
            // accordion: close siblings
            if (next && opts?.accordion) {
                for (const s of (this._accordions[tab] || [])) {
                    if (s.collKey === collKey) continue;
                    s.arrow.classList.remove("open");
                    s.body.style.display = "none";
                    if (s.opts?.persist) this._cache.set(s.opts.persist, false);
                }
            }
        };
        p.hydrate(v => setOpen(v, false));
        this._cols[collKey]      = body;
        this._colTabMap[collKey] = tab;
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
        this._getTabEl(tab).appendChild(el);
        return collKey;
    }

    addNumberInput(tab, label, min, max, step, value, callback, opts = {}) {
        const p  = this._makePersist(opts, value);
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<span class="zui-field-label">${label}</span><input type="number" min="${min}" max="${max}" step="${step}" value="${p.initial}">`;
        const input = el.querySelector("input");
        const cb = p.wrap(callback);
        input.onchange = () => {
            let v = Math.min(max, Math.max(min, Number(input.value)));
            v = Math.round(v / step) * step;
            input.value = v;
            cb(v);
        };
        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== value) callback(p.initial);
        p.hydrate(v => { input.value = v; callback(Number(v)); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
    }

    addProgressBar(tab, label, value = 0, max = 100) {
        const el = document.createElement("div");
        el.className = "zui-item";
        const pct = Math.round((value / max) * 100);
        el.innerHTML = `
            <div class="zui-progress-header">
                <span class="zui-field-label" style="margin-bottom:0">${label}</span>
                <span class="zui-progress-val">${value} / ${max}</span>
            </div>
            <div class="zui-progress-track"><div class="zui-progress-fill" style="width:${pct}%"></div></div>
        `;
        const fill  = el.querySelector(".zui-progress-fill");
        const valEl = el.querySelector(".zui-progress-val");
        let curVal  = value, curMax = max;
        const update = () => {
            fill.style.width  = `${Math.min(100, Math.max(0, (curVal / curMax) * 100))}%`;
            valEl.textContent = `${curVal} / ${curMax}`;
        };
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, label, el);
        return {
            setValue(v) { curVal = Math.min(curMax, Math.max(0, v)); update(); },
            setMax(m)   { curMax = m; curVal = Math.min(curVal, curMax); update(); },
        };
    }

    addKeybind(tab, label, defaultKey, callback, opts = {}) {
        const p  = this._makePersist(opts, defaultKey);
        let curKey = p.initial;
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<div class="zui-keybind"><span class="zui-toggle-label">${label}</span><button class="zui-keybind-btn">${curKey}</button></div>`;
        const btn = el.querySelector(".zui-keybind-btn");

        // v3.2 — opts.bind: auto-install via ui.bind() and re-bind whenever the key changes
        let installedId = null;
        const reinstall = (k) => {
            if (!opts?.bind) return;
            if (installedId !== null) this.unbind(installedId);
            installedId = this.bind(k, () => callback(k), {
                allowInInput:   !!opts.allowInInput,
                preventDefault: opts.preventDefault,
            }).id;
        };

        const cb  = p.wrap((k) => { reinstall(k); callback(k); });
        btn.onclick = () => {
            btn.textContent = "Press a key...";
            btn.style.color = "var(--zui-warning)";
            const onKey = (e) => {
                e.preventDefault(); e.stopPropagation();
                curKey = e.key;
                btn.textContent = curKey;
                btn.style.color = "";
                document.removeEventListener("keydown", onKey, true);
                cb(curKey);
            };
            document.addEventListener("keydown", onKey, true);
        };
        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== defaultKey) callback(p.initial);
        if (opts?.bind) reinstall(curKey);   // initial install
        p.hydrate(v => { curKey = v; btn.textContent = v; reinstall(v); callback(v); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
    }

    addColorPicker(tab, label, defaultColor, callback, opts = {}) {
        const p   = this._makePersist(opts, defaultColor);
        let curColor = p.initial;
        const el  = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `
            <div class="zui-color-row">
                <span class="zui-toggle-label">${label}</span>
                <div class="zui-color-swatch" style="background:${curColor}"></div>
                <input type="color" value="${curColor}" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">
            </div>
        `;
        const swatch = el.querySelector(".zui-color-swatch");
        const input  = el.querySelector("input[type='color']");
        const cb     = p.wrap(callback);
        swatch.onclick = () => input.click();
        input.oninput  = () => { curColor = input.value; swatch.style.background = curColor; cb(curColor); };
        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== defaultColor) callback(p.initial);
        p.hydrate(v => { curColor = v; input.value = v; swatch.style.background = v; callback(v); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
        return {
            getValue() { return curColor; },
            setValue(v) { curColor = v; input.value = v; swatch.style.background = v; },
        };
    }

    addRadioGroup(tab, label, options, defaultVal, callback, opts = {}) {
        const p   = this._makePersist(opts, defaultVal);
        let curVal = p.initial;
        const el  = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `<span class="zui-field-label">${label}</span><div class="zui-radio-group"></div>`;
        const group = el.querySelector(".zui-radio-group");
        const cb    = p.wrap(callback);
        const dots  = [];
        options.forEach(({ value, label: text }) => {
            const row = document.createElement("div");
            row.className = "zui-radio-label";
            row.innerHTML = `<div class="zui-radio ${value === curVal ? "active" : ""}"></div><span>${text}</span>`;
            const dot = row.querySelector(".zui-radio");
            dots.push({ dot, value });
            row.onclick = () => { dots.forEach(d => d.dot.classList.remove("active")); dot.classList.add("active"); curVal = value; cb(value); };
            group.appendChild(row);
        });
        this._getTabEl(tab).appendChild(el);
        if (opts?.persist && p.initial !== defaultVal) callback(p.initial);
        p.hydrate(v => { curVal = v; dots.forEach(d => d.dot.classList.toggle("active", d.value === v)); callback(v); });
        this._registerFeature(tab, label, el);
        this._decorate(el, opts, opts?.persist);
    }

    addTag(tab, label, text, color = "#5865f2") {
        const el = document.createElement("div");
        el.className = "zui-item";
        el.innerHTML = `
            <div class="zui-tag-row">
                <span class="zui-toggle-label">${label}</span>
                <span class="zui-tag" style="color:${color};background:${color}22;border-color:${color}55">${text}</span>
            </div>
        `;
        const chip = el.querySelector(".zui-tag");
        this._getTabEl(tab).appendChild(el);
        this._registerFeature(tab, label, el);
        return {
            update(t)   { chip.textContent = t; },
            setColor(c) { chip.style.color = c; chip.style.background = c + "22"; chip.style.borderColor = c + "55"; },
        };
    }

    // ── Minimize ─────────────────────────────────────────────────────────────

    toggleMinimize() {
        this._minimized = !this._minimized;
        const wrapper = this.container.querySelector(".zui-wrapper");
        wrapper.classList.toggle("zui-minimized", this._minimized);
        this.container.querySelector(".zui-minimize-btn").textContent = this._minimized ? "+" : "−";
    }

    setToggleKey(key = "Insert") {
        if (this._toggleKeyFn) document.removeEventListener("keydown", this._toggleKeyFn);
        this._toggleKeyFn = e => { if (e.key === key) this.toggleMinimize(); };
        document.addEventListener("keydown", this._toggleKeyFn);
    }

    // ── v3.2 — Config import / export ────────────────────────────────────────

    /**
     * Return a JSON string of all current persisted values for this script,
     * filtering out system keys (those wrapped in `__...__`) so the result
     * is portable across versions.
     */
    exportConfig() {
        const out = {};
        for (const k of Object.keys(this._cache._mem)) {
            if (/^__.+__$/.test(k)) continue;            // skip system keys
            if (/^__preset_/.test(k)) continue;          // skip preset bundles
            out[k] = this._cache._mem[k];
        }
        return JSON.stringify(out, null, 2);
    }

    /**
     * Apply a JSON config (as produced by exportConfig) and re-hydrate every
     * component so the UI reflects the new values immediately.
     * @returns {boolean} true on success
     */
    importConfig(json) {
        let obj;
        try { obj = typeof json === "string" ? JSON.parse(json) : json; }
        catch { return false; }
        if (!obj || typeof obj !== "object") return false;
        for (const k of Object.keys(obj)) {
            if (/^__.+__$/.test(k)) continue;
            this._cache.set(k, obj[k]);
        }
        this._rehydrateAll();
        return true;
    }

    /**
     * Wipe every non-system cache key and re-hydrate (puts every component
     * back to its default).
     */
    resetDefaults() {
        for (const k of Object.keys(this._cache._mem)) {
            if (/^__.+__$/.test(k)) continue;
            this._cache.delete(k);
        }
        this._rehydrateAll();
    }

    // ── v3.2 — Presets ───────────────────────────────────────────────────────

    /** Save the current config under a named preset. */
    savePreset(name) {
        const snapshot = JSON.parse(this.exportConfig());
        this._cache.set(`__preset_${name}__`, snapshot);
    }

    /** Apply a previously-saved preset to all components. */
    loadPreset(name) {
        const snap = this._cache.get(`__preset_${name}__`);
        if (!snap) return false;
        return this.importConfig(snap);
    }

    /** Delete a preset. */
    deletePreset(name) {
        this._cache.delete(`__preset_${name}__`);
    }

    /** Return the list of preset names currently stored. */
    listPresets() {
        return Object.keys(this._cache._mem)
            .filter(k => k.startsWith("__preset_") && k.endsWith("__"))
            .map(k => k.slice(9, -2));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  v3.2  —  Game-scripting helpers
    //  Drop-in replacements for the boilerplate every game userscript writes:
    //  keybind manager, managed loops, reactive watchers, event bus,
    //  draggable HUD widgets, and a namespaced logger.
    // ─────────────────────────────────────────────────────────────────────────

    // ── Keybind manager ──────────────────────────────────────────────────────

    _parseKey(combo) {
        const parts = String(combo).split("+").map(p => p.trim()).filter(Boolean);
        const spec  = { key: "", ctrl: false, shift: false, alt: false, meta: false };
        for (const p of parts) {
            const lc = p.toLowerCase();
            if      (lc === "ctrl"  || lc === "control")               spec.ctrl  = true;
            else if (lc === "shift")                                    spec.shift = true;
            else if (lc === "alt"   || lc === "option")                 spec.alt   = true;
            else if (lc === "meta"  || lc === "cmd" || lc === "command") spec.meta  = true;
            else                                                        spec.key   = p.toLowerCase();
        }
        return spec;
    }

    _matchesEvent(spec, e) {
        return e.key?.toLowerCase() === spec.key
            && !!e.ctrlKey  === spec.ctrl
            && !!e.shiftKey === spec.shift
            && !!e.altKey   === spec.alt
            && !!e.metaKey  === spec.meta;
    }

    _setupBinds() {
        this._bindKeyFn = (e) => {
            if (!this._binds.length) return;
            const t = e.target;
            const inInput = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
            // Snapshot — fn may call unbind on itself
            for (const b of this._binds.slice()) {
                if (inInput && !b.allowInInput) continue;
                if (this._matchesEvent(b.spec, e)) {
                    if (b.preventDefault !== false) e.preventDefault();
                    try { b.fn(e); } catch (err) { console.error("[ZOUI bind]", err); }
                }
            }
        };
        document.addEventListener("keydown", this._bindKeyFn);
    }

    /**
     * Bind a global hotkey or key combo.
     *   ui.bind("F2", () => buildBase());
     *   ui.bind("Ctrl+Shift+P", () => openPalette());
     * @param {string}   combo     e.g. "F2", "Ctrl+S", "Alt+Shift+K"
     * @param {function} fn        called with the native KeyboardEvent
     * @param {object}   [opts]    { allowInInput?: false, preventDefault?: true }
     * @returns {{ id: number, unbind: () => void }}
     */
    bind(combo, fn, opts = {}) {
        const id = ++this._bindId;
        const b  = { id, combo, spec: this._parseKey(combo), fn, allowInInput: !!opts.allowInInput, preventDefault: opts.preventDefault !== false };
        this._binds.push(b);
        return { id, unbind: () => this.unbind(id) };
    }

    /**
     * Remove a binding by handle id or by combo string. Strings remove every
     * binding for that combo.
     */
    unbind(idOrCombo) {
        if (typeof idOrCombo === "number") {
            const i = this._binds.findIndex(b => b.id === idOrCombo);
            if (i !== -1) this._binds.splice(i, 1);
        } else if (typeof idOrCombo === "string") {
            this._binds = this._binds.filter(b => b.combo !== idOrCombo);
        }
    }

    /** Remove every binding installed via `bind()`. */
    unbindAll() { this._binds.length = 0; }

    /** Returns a snapshot of currently-installed binds. */
    bindings() { return this._binds.map(b => ({ id: b.id, combo: b.combo })); }

    // ── Loops ────────────────────────────────────────────────────────────────

    /**
     * Schedule a function to run repeatedly. Returns a handle with
     * `.pause()`, `.resume()`, `.stop()`, and a `paused` getter.
     *
     *   ui.loop(() => moveBot(),  { fps: 30 });
     *   ui.loop(() => pollState(), { ms: 1000 });
     *   ui.loop(renderOverlay);                  // rAF — every frame
     */
    loop(fn, opts = {}) {
        const useRaf = !opts.ms;
        let running = true, paused = false, rafId = 0, intervalId = 0, lastTime = 0;
        const targetMs = opts.fps ? 1000 / opts.fps : 0;

        const safeFn = () => { try { fn(); } catch (e) { console.error("[ZOUI loop]", e); } };

        const tick = (now) => {
            if (!running) return;
            if (!paused) {
                if (targetMs > 0) { if (now - lastTime >= targetMs) { lastTime = now; safeFn(); } }
                else { safeFn(); }
            }
            rafId = requestAnimationFrame(tick);
        };

        if (useRaf) rafId = requestAnimationFrame(tick);
        else        intervalId = setInterval(() => { if (running && !paused) safeFn(); }, opts.ms);

        const handle = {
            get paused() { return paused; },
            pause()  { paused = true;  },
            resume() { paused = false; },
            stop()   {
                if (!running) return;
                running = false;
                if (useRaf) cancelAnimationFrame(rafId);
                else        clearInterval(intervalId);
                const i = this._loops.indexOf(handle);
                if (i !== -1) this._loops.splice(i, 1);
            },
        };
        // Re-bind `this` for the stop closure
        handle.stop = handle.stop.bind(this);
        this._loops.push(handle);
        return handle;
    }

    /** Stop every loop registered via `loop()`. */
    stopAllLoops() { this._loops.slice().forEach(h => h.stop()); }

    /**
     * Watch a value-producing function and fire a callback when it changes.
     *   ui.watch(() => game.player?.gold, (cur, prev) => console.log("gold:", cur));
     *
     * @param {function} getter     called repeatedly
     * @param {function} cb         (current, previous) => void
     * @param {object}   [opts]     { ms?: 250, deep?: false (JSON-equality) }
     * @returns {{ stop: () => void }}
     */
    watch(getter, cb, opts = {}) {
        let prev, first = true;
        const handle = this.loop(() => {
            let cur;
            try { cur = getter(); } catch { return; }
            const changed = opts.deep
                ? JSON.stringify(cur) !== JSON.stringify(prev)
                : cur !== prev;
            if (first) { first = false; prev = cur; return; }
            if (changed) { const p = prev; prev = cur; try { cb(cur, p); } catch (e) { console.error("[ZOUI watch]", e); } }
        }, { ms: opts.ms ?? 250 });
        return { stop: handle.stop };
    }

    // ── Event bus ────────────────────────────────────────────────────────────

    /** Subscribe to an event. Returns an unsubscribe handle. */
    on(event, fn) {
        (this._events[event] ||= new Set()).add(fn);
        return { off: () => this.off(event, fn) };
    }

    /** Subscribe once — auto-unsubscribes after the first emit. */
    once(event, fn) {
        const wrap = (data) => { this.off(event, wrap); fn(data); };
        return this.on(event, wrap);
    }

    /** Unsubscribe a specific handler. */
    off(event, fn) { this._events[event]?.delete(fn); }

    /** Fire an event synchronously. */
    emit(event, data) {
        this._events[event]?.forEach(fn => {
            try { fn(data); } catch (e) { console.error(`[ZOUI emit:${event}]`, e); }
        });
    }

    // ── HUD overlays ─────────────────────────────────────────────────────────

    /**
     * Add a small floating widget to the page (FPS counter, gold tracker, ping
     * indicator, etc.). Draggable — final position is persisted under
     * `__hud_<name>__`.
     *
     *   const fps = ui.addHud("fps", { position: "top-left", color: "#0f0" });
     *   fps.update("60 FPS");
     *
     * @param {string} name
     * @param {object} [opts]   { position?: "top-left"|"top-right"|"bottom-left"|"bottom-right",
     *                            color?: string, draggable?: true }
     */
    addHud(name, opts = {}) {
        const id = `zui-hud-${name}`;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.className = "zui-hud zui-hud-" + (opts.position || "top-left");
            document.body.appendChild(el);
        }
        if (opts.color) el.style.color = opts.color;

        // Restore persisted position
        const saved = this._cache.get(`__hud_${name}__`);
        if (saved && typeof saved.x === "number") {
            el.style.left = saved.x + "px";
            el.style.top  = saved.y + "px";
            el.style.right = el.style.bottom = "auto";
        }

        // Drag-to-move (default on)
        if (opts.draggable !== false) {
            let drag = false, sx = 0, sy = 0, ex = 0, ey = 0;
            const onMove = (e) => {
                if (!drag) return;
                el.style.left   = (ex + (e.clientX - sx)) + "px";
                el.style.top    = (ey + (e.clientY - sy)) + "px";
                el.style.right  = el.style.bottom = "auto";
            };
            const onUp = () => {
                if (!drag) return;
                drag = false;
                el.classList.remove("zui-hud-dragging");
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup",   onUp);
                const r = el.getBoundingClientRect();
                this._cache?.set(`__hud_${name}__`, { x: Math.round(r.left), y: Math.round(r.top) });
            };
            el.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                drag = true;
                el.classList.add("zui-hud-dragging");
                sx = e.clientX; sy = e.clientY;
                const r = el.getBoundingClientRect();
                ex = r.left;    ey = r.top;
                document.addEventListener("pointermove", onMove);
                document.addEventListener("pointerup",   onUp);
            });
        }

        this._huds[name] = el;
        return {
            element: el,
            update(text)     { el.textContent = text;          },
            setHTML(html)    { el.innerHTML  = html;           },
            setColor(c)      { el.style.color = c;             },
            setPosition(x, y){ el.style.left = x + "px"; el.style.top = y + "px"; el.style.right = el.style.bottom = "auto"; },
            show()           { el.style.display = "";          },
            hide()           { el.style.display = "none";      },
            remove()         { el.remove();                    },
        };
    }

    // ── Namespaced logger ────────────────────────────────────────────────────

    /**
     * Returns a logger scoped to a namespace. Level is read live from
     * `_logLevels` so `setLogLevel` takes effect immediately.
     *
     *   const log = ui.log("AutoAttack");
     *   log.info("started");
     *   log.debug("targeting...");   // only printed when level is "debug"
     */
    log(ns) {
        const levels = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
        const lvl    = () => levels[this._logLevels[ns] ?? "info"] ?? 3;
        return {
            error: (...a) => { if (lvl() >= 1) console.error(`[${ns}]`, ...a); },
            warn:  (...a) => { if (lvl() >= 2) console.warn (`[${ns}]`, ...a); },
            info:  (...a) => { if (lvl() >= 3) console.log  (`[${ns}]`, ...a); },
            debug: (...a) => { if (lvl() >= 4) console.debug(`[${ns}]`, ...a); },
            group: (label) => { if (lvl() >= 3) console.group(`[${ns}] ${label}`); },
            groupEnd: ()    => { if (lvl() >= 3) console.groupEnd(); },
        };
    }

    /**
     * Set the log level for a namespace.
     *   ui.setLogLevel("AutoAttack", "debug");
     * Valid levels: "silent", "error", "warn", "info" (default), "debug".
     * Persists across reloads.
     */
    setLogLevel(ns, level) {
        this._logLevels[ns] = level;
        this._cache?.set(`__log_${ns}__`, level);
    }

    /** Read the current log level for a namespace. */
    getLogLevel(ns) { return this._logLevels[ns] ?? "info"; }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /** Tear down listeners, loops, and HUDs. Cache is left intact. */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.stopAllLoops();
        Object.values(this._huds).forEach(el => el.remove());
        this._huds   = {};
        this._binds  = [];
        this._events = {};
        if (this._bindKeyFn)   document.removeEventListener("keydown", this._bindKeyFn);
        if (this._toggleKeyFn) document.removeEventListener("keydown", this._toggleKeyFn);
        this.container.innerHTML = "";
    }

    // ── Popup delegates ──────────────────────────────────────────────────────
    toast(...args)   { return this.popup.toast(...args);   }
    confirm(...args) { return this.popup.confirm(...args); }
    input(...args)   { return this.popup.input(...args);   }
}

// ── Built-in themes ───────────────────────────────────────────────────────────
//
//  Each theme object has these required fields:
//
//  shadow, bg, bgHeader, bgSearch, bgInput, bgRow, bgRowHover, bgTabHover,
//  border, borderStrong, divider,
//  accent, accentHover, accentMuted, accentMuted2, accentText, accentGlow,
//  text1, text2, text3, textOnAccent,
//  success, warning, error,
//  switchOff, switchOn, track,
//  radius, radiusLg

ZOUI.themes["default"] = {
    shadow:       "0 8px 32px rgba(0,0,0,0.6)",
    bg:           "#2b2d31",
    bgHeader:     "#1e1f22",
    bgSearch:     "#111214",
    bgInput:      "#1e1f22",
    bgRow:        "rgba(0,0,0,0.18)",
    bgRowHover:   "rgba(0,0,0,0.28)",
    bgTabHover:   "rgba(255,255,255,0.06)",
    border:       "rgba(0,0,0,0.25)",
    borderStrong: "rgba(0,0,0,0.5)",
    divider:      "rgba(255,255,255,0.06)",
    accent:       "#5865f2",
    accentHover:  "#4752c4",
    accentMuted:  "rgba(88,101,242,0.15)",
    accentMuted2: "rgba(88,101,242,0.25)",
    accentText:   "#8b9cf4",
    accentGlow:   "rgba(88,101,242,0.3)",
    text1:        "#f2f3f5",
    text2:        "#dcddde",
    text3:        "#87898c",
    textOnAccent: "#ffffff",
    success:      "#23a559",
    warning:      "#f0b232",
    error:        "#ed4245",
    switchOff:    "#4e5058",
    switchOn:     "#5865f2",
    track:        "#3a3c42",
    radius:       "6px",
    radiusLg:     "12px",
};

// iOS Dark — true Apple dark-mode system colors + grouped-table-view layout
ZOUI.themes["ios-dark"] = {
    shadow:       "0 8px 40px rgba(0,0,0,0.85)",
    bg:           "#000000",           // systemBackground (dark) — true black
    bgHeader:     "rgba(28,28,30,0.85)",   // nav bar: translucent for backdrop-filter blur
    bgSearch:     "#1c1c1e",
    bgInput:      "#2c2c2e",           // tertiarySystemBackground
    bgRow:        "#1c1c1e",           // secondarySystemGroupedBackground — cells
    bgRowHover:   "#2c2c2e",
    bgTabHover:   "rgba(255,255,255,0.08)",
    border:       "rgba(84,84,88,0.35)",   // Apple separator (dark)
    borderStrong: "rgba(84,84,88,0.65)",
    divider:      "rgba(72,72,74,0.9)",    // opaqueSeparator dark (#48484A)
    accent:       "#0a84ff",           // systemBlue (dark)
    accentHover:  "#0071e3",
    accentMuted:  "rgba(10,132,255,0.16)",
    accentMuted2: "rgba(10,132,255,0.26)",
    accentText:   "#64afff",
    accentGlow:   "rgba(10,132,255,0.4)",
    text1:        "#ffffff",           // label (dark)
    text2:        "rgba(235,235,245,0.85)",  // secondaryLabel (dark)
    text3:        "#8e8e93",           // systemGray (dark)
    textOnAccent: "#ffffff",
    success:      "#30d158",           // systemGreen (dark)
    warning:      "#ffd60a",           // systemYellow (dark)
    error:        "#ff453a",           // systemRed (dark)
    switchOff:    "#3a3a3c",           // UISwitch off-track (dark) — systemGray3
    switchOn:     "#30d158",           // systemGreen — iOS uses green for UISwitch
    track:        "#3a3a3c",           // systemGray4 (dark)
    radius:       "10px",
    radiusLg:     "14px",
};

// iOS Light — true Apple light-mode system colors + grouped-table-view layout
ZOUI.themes["ios-light"] = {
    shadow:       "0 4px 24px rgba(0,0,0,0.1)",
    bg:           "#f2f2f7",           // systemGroupedBackground (light)
    bgHeader:     "rgba(242,242,247,0.85)", // nav bar: translucent for backdrop-filter blur
    bgSearch:     "#e5e5ea",           // systemGray5 (light)
    bgInput:      "#ffffff",
    bgRow:        "#ffffff",           // secondarySystemGroupedBackground — cells are white
    bgRowHover:   "#e9e9ee",           // cell pressed state — slightly darker than bg
    bgTabHover:   "rgba(0,0,0,0.05)",
    border:       "rgba(60,60,67,0.18)",   // Apple separator (light)
    borderStrong: "rgba(60,60,67,0.29)",
    divider:      "rgba(60,60,67,0.29)",   // opaqueSeparator light (#D1D1D6 ≈ rgba(60,60,67,0.29))
    accent:       "#007aff",           // systemBlue (light)
    accentHover:  "#0062cc",
    accentMuted:  "rgba(0,122,255,0.1)",
    accentMuted2: "rgba(0,122,255,0.2)",
    accentText:   "#007aff",
    accentGlow:   "rgba(0,122,255,0.2)",
    text1:        "#000000",           // label (light)
    text2:        "rgba(60,60,67,0.9)",     // secondaryLabel (light)
    text3:        "#8e8e93",           // systemGray (light)
    textOnAccent: "#ffffff",
    success:      "#34c759",           // systemGreen (light)
    warning:      "#ff9f0a",           // systemOrange (light)
    error:        "#ff3b30",           // systemRed (light)
    switchOff:    "#e5e5ea",           // UISwitch off-track (light)
    switchOn:     "#34c759",           // systemGreen — iOS uses green for UISwitch
    track:        "#e5e5ea",           // systemGray5 (light)
    radius:       "10px",
    radiusLg:     "14px",
};

// Aurora — sky-blue glass panel with top-nav Fluent / Claude-inspired layout.
// Activate with ui.setTheme("aurora") — setTheme handles .zui-fluent and body class.
// The sidebar becomes a horizontal pill nav bar; all items become floating cards;
// the entire panel gets backdrop-filter frosted glass.
ZOUI.themes["aurora"] = {
    shadow:       "0 0 0 1px rgba(56,189,248,0.22),0 24px 80px rgba(0,0,0,0.72),0 0 100px rgba(56,189,248,0.06)",
    bg:           "rgba(8,12,26,0.86)",
    bgHeader:     "rgba(6,9,20,0.90)",
    bgSearch:     "rgba(255,255,255,0.04)",
    bgInput:      "rgba(255,255,255,0.07)",
    bgRow:        "rgba(255,255,255,0.038)",
    bgRowHover:   "rgba(56,189,248,0.09)",
    bgTabHover:   "rgba(56,189,248,0.1)",
    border:       "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.13)",
    divider:      "rgba(255,255,255,0.07)",
    accent:       "#38bdf8",
    accentHover:  "#0ea5e9",
    accentMuted:  "rgba(56,189,248,0.15)",
    accentMuted2: "rgba(56,189,248,0.26)",
    accentText:   "#7dd3fc",
    accentGlow:   "0 0 0 3px rgba(56,189,248,0.32)",
    text1:        "rgba(255,255,255,0.95)",
    text2:        "rgba(255,255,255,0.72)",
    text3:        "rgba(255,255,255,0.38)",
    textOnAccent: "#020c1a",
    success:      "#34d399",
    warning:      "#fbbf24",
    error:        "#f87171",
    switchOff:    "rgba(255,255,255,0.15)",
    switchOn:     "#38bdf8",
    track:        "rgba(255,255,255,0.1)",
    radius:       "10px",
    radiusLg:     "16px",
};

// Glass — translucent, backdrop-blurred (pair with .zui-glass class on root)
// Activate with ui.setTheme("glass") — the setTheme method handles the body class toggle.
ZOUI.themes["glass"] = {
    shadow:       "0 8px 40px rgba(0,0,0,0.4)",
    bg:           "rgba(30,30,36,0.55)",
    bgHeader:     "rgba(20,20,28,0.55)",
    bgSearch:     "rgba(0,0,0,0.35)",
    bgInput:      "rgba(0,0,0,0.25)",
    bgRow:        "rgba(255,255,255,0.04)",
    bgRowHover:   "rgba(255,255,255,0.09)",
    bgTabHover:   "rgba(255,255,255,0.07)",
    border:       "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.14)",
    divider:      "rgba(255,255,255,0.08)",
    accent:       "#7289ff",
    accentHover:  "#5d72e6",
    accentMuted:  "rgba(114,137,255,0.15)",
    accentMuted2: "rgba(114,137,255,0.28)",
    accentText:   "#a3b3ff",
    accentGlow:   "rgba(114,137,255,0.35)",
    text1:        "#f4f5f7",
    text2:        "#e3e4e8",
    text3:        "#a1a3aa",
    textOnAccent: "#ffffff",
    success:      "#3ddc84",
    warning:      "#ffd166",
    error:        "#ff6b6b",
    switchOff:    "rgba(255,255,255,0.18)",
    switchOn:     "#7289ff",
    track:        "rgba(255,255,255,0.15)",
    radius:       "8px",
    radiusLg:     "14px",
};
