// scriptHost.js — User-script execution sandbox.
//
// Each user-authored script is stored as a function body string. We
// instantiate it lazily via `new Function('ctx', source)` and invoke it
// inside try/catch so a buggy script logs to the console panel rather
// than crashing Axiom.
//
// `extras` lets the caller inject per-invocation locals (e.g. `value`,
// `controlId` for change events) without polluting the long-lived ctx.

import { findControl } from "./schema.js";

export function createScriptHost({ ui, axiom, schema }) {
  // Compile cache — keyed by scriptId + source so edits invalidate cleanly.
  const compiled = new Map();
  function compile(scriptId, source, extraNames) {
    const cacheKey = `${scriptId}::${extraNames.join(",")}::${source}`;
    if (compiled.has(cacheKey)) return compiled.get(cacheKey);
    let fn;
    try {
      fn = new Function("ctx", ...extraNames, source);
    } catch (err) {
      // Syntax error — return a thunk that re-throws on call so the
      // error path is the same as a runtime error.
      const message = err && err.message ? err.message : String(err);
      fn = () => { throw new Error(`Syntax error: ${message}`); };
    }
    compiled.set(cacheKey, fn);
    return fn;
  }

  // Live event bus — scripts can subscribe via ctx.on/off. We piggy-back
  // on ZOUI's bus so the script's listeners participate in ui.destroy().
  function onCtx(event, handler) { return ui.on(event, handler); }
  function offCtx(event, handler) { return ui.off(event, handler); }

  // Read game state — for now we expose whatever globals exist on
  // window. The wrapper makes this safe to call even when game/window
  // are not the expected shape.
  const gameProxy = new Proxy({}, {
    get(_t, prop) {
      try {
        // Common zombs.io globals — adjust here as we learn the API.
        const w = typeof window !== "undefined" ? window : globalThis;
        if (prop === "window") return w;
        return w[prop];
      } catch { return undefined; }
    },
  });

  // ctx.ui — read/write other controls and trigger buttons by id.
  const uiCtx = {
    getValue(controlId) {
      return axiom.values[controlId];
    },
    setValue(controlId, value) {
      // Persist + notify any subscribed controls.
      const found = findControl(schema, controlId);
      if (!found) return false;
      axiom.values[controlId] = value;
      axiom.cache.set(`v::${controlId}`, value);
      // If the control has a DOM updater registered, call it so the
      // visual stays in sync.
      const updater = axiom.controlUpdaters.get(controlId);
      if (updater) try { updater(value); } catch { /* ignore */ }
      return true;
    },
    trigger(controlId) {
      // Re-runs the script attached to the named control as if the
      // user activated it. Currently meaningful for buttons; for
      // value-bound controls it re-fires the bound script with the
      // current value.
      const found = findControl(schema, controlId);
      if (!found) return false;
      const c = found.control;
      if (!c.scriptId) return false;
      run(c.scriptId, c.type === "button"
        ? { controlId: c.id }
        : { controlId: c.id, value: axiom.values[c.id] });
      return true;
    },
  };

  // ctx.storage — thin wrapper over ZOUI's cache, namespaced to avoid
  // collisions with Axiom's own keys.
  const storageCtx = {
    get(key, fallback) { return axiom.cache.get(`s::${key}`, fallback); },
    set(key, value) { axiom.cache.set(`s::${key}`, value); },
    delete(key) { return axiom.cache.delete(`s::${key}`); },
  };

  // ctx.log — writes to the in-UI console panel. Levels: log|info|warn|error|debug.
  function logCtx(message, level = "log") {
    axiom.console.write(level, message);
  }

  const ctx = {
    get game() { return gameProxy; },
    ui: uiCtx,
    storage: storageCtx,
    log: logCtx,
    on: onCtx,
    off: offCtx,
    // Convenience aliases that read better in user scripts.
    toast(msg, type = "info", duration = 2400) { ui.toast(msg, type, duration); },
  };

  // Run a script by id, catching all errors and routing to the console.
  function run(scriptId, extras = {}) {
    const script = schema.scripts[scriptId];
    if (!script) {
      axiom.console.write("error", `[script] ${scriptId} — not found`);
      return undefined;
    }
    const names = Object.keys(extras);
    const fn = compile(scriptId, script.source, names);
    try {
      return fn(ctx, ...names.map((n) => extras[n]));
    } catch (err) {
      const where = extras.controlId ? ` (control: ${extras.controlId})` : "";
      axiom.console.write("error", `[script ${scriptId}${where}] ${err && err.message || err}`);
      return undefined;
    }
  }

  // Evaluate a showIf predicate — same try/catch path, returns boolean.
  function evalShowIf(scriptId, controlId) {
    const v = run(scriptId, { controlId });
    return v === undefined ? true : Boolean(v);
  }

  return { ctx, run, evalShowIf, _compiled: compiled };
}
