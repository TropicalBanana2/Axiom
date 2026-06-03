// renderer.js — Maps schema → ZOUI components.
//
// Called by both the userscript and the editor's preview iframe. The
// renderer is intentionally idempotent at the schema/control level —
// re-rendering after a schema edit is cheap because we just rebuild
// the ZOUI panel from scratch.

import { findControl } from "./schema.js";

export function renderSchema({ ui, axiom, schema, scriptHost }) {
  // Wipe any prior render — used during editor live preview where
  // schema mutations need to repaint the panel.
  resetPanel(ui);

  // Reset value mirror + DOM updater registry. Persisted values are
  // read from the cache below; defaults fill the gap.
  axiom.values = {};
  axiom.controlUpdaters = new Map();

  for (const tab of schema.tabs) {
    const tabName = ui.addTab(tab.name, tab.icon || null);
    // ZOUI keys by name, not id — so we keep a side map for navigation.
    axiom.tabIds.set(tab.id, tabName);

    for (const section of tab.sections) {
      // Sections become a header + (optionally) a collapsible. When
      // collapsible, children go into the collapsible body.
      let parent = tabName;
      if (section.collapsible) {
        parent = ui.addCollapsible(tabName, section.name, !!section.defaultOpen, {
          persist: `__sec_${section.id}`,
        });
      } else if (section.name) {
        ui.addHeader(tabName, section.name);
      }

      for (const control of section.controls) {
        renderControl({ ui, axiom, schema, scriptHost, parent, control });
      }
    }
  }

  // Select landing tab.
  const landing = schema.meta?.landingTabId;
  const landingName = landing && axiom.tabIds.get(landing);
  if (landingName) ui.switchTab(landingName);
}

function resetPanel(ui) {
  // Clear sidebar tab buttons and content panes.
  if (ui.sidebar) {
    const label = ui.sidebar.querySelector(".zui-sidebar-label");
    [...ui.sidebar.querySelectorAll(".zui-tab")].forEach((el) => el.remove());
    if (label) ui.sidebar.appendChild(label);
  }
  if (ui.content) ui.content.innerHTML = "";
  ui.tabs = {};
  ui.activeTab = null;
  ui._cols = {};
  ui._colTabMap = {};
  ui.features = [];
}

function renderControl({ ui, axiom, schema, scriptHost, parent, control }) {
  const c = control;
  const persist = `v::${c.id}`;
  // Hydrate from cache or use default. We use ZOUI's persist option so
  // future changes go through the same key.
  const opts = { persist, tooltip: c.tooltip || undefined };

  // showIf wiring — runs the named script with try/catch.
  if (c.showIfScriptId) {
    opts.showIf = () => scriptHost.evalShowIf(c.showIfScriptId, c.id);
  }

  // Bound script — value controls run on change; buttons run on click.
  const fire = (value) => {
    if (c.scriptId) scriptHost.run(c.scriptId, { controlId: c.id, value });
    axiom.values[c.id] = value;
  };

  switch (c.type) {
    case "text": {
      // Static text — defaultValue is the body, label is unused.
      ui.addText(parent, String(c.defaultValue ?? c.label ?? ""), false);
      break;
    }
    case "button": {
      ui.addButton(parent, c.label || "Button", () => {
        if (c.scriptId) scriptHost.run(c.scriptId, { controlId: c.id });
      }, !!c.secondary);
      break;
    }
    case "toggle": {
      const def = !!c.defaultValue;
      ui.addToggle(parent, c.label || "Toggle", def, fire, opts);
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "slider": {
      const def = Number(c.defaultValue ?? 0);
      const min = Number(c.min ?? 0), max = Number(c.max ?? 100);
      ui.addSlider(parent, c.label || "Slider", min, max, def, fire, opts);
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "input": {
      const def = c.defaultValue ?? "";
      ui.addTextbox(parent, c.label || "Text", c.placeholder || "", fire, def, opts);
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "number": {
      const def = Number(c.defaultValue ?? 0);
      const min = Number(c.min ?? 0), max = Number(c.max ?? 100), step = Number(c.step ?? 1);
      ui.addNumberInput(parent, c.label || "Number", min, max, step, def, fire, opts);
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "select": {
      const def = c.defaultValue ?? (c.options?.[0]?.value);
      const options = (c.options || []).map((o) => ({ value: o.value, label: o.label || o.value }));
      ui.addSelect(parent, c.label || "Select", options, fire, { ...opts });
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "radio": {
      const def = c.defaultValue ?? (c.options?.[0]?.value);
      const options = (c.options || []).map((o) => ({ value: o.value, label: o.label || o.value }));
      ui.addRadioGroup(parent, c.label || "Radio", options, def, fire, opts);
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "color": {
      const def = c.defaultValue || "#3b82f6";
      ui.addColorPicker(parent, c.label || "Color", def, fire, opts);
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    case "keybind": {
      const def = c.defaultValue || "K";
      ui.addKeybind(parent, c.label || "Keybind", def, fire, { ...opts, bind: true });
      axiom.values[c.id] = readPersisted(ui, persist, def);
      break;
    }
    default: {
      // Unknown type — render a warning so the user sees it in-panel.
      ui.addText(parent, `[unknown control type: ${c.type}]`, true);
    }
  }
}

function readPersisted(ui, key, fallback) {
  // ZOUI's cache write is async-flushed but sync-readable from its
  // in-memory mirror once hydrated. Before hydration completes we get
  // `undefined` and fall back to the default.
  try {
    const v = ui._cache?.get(key);
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
