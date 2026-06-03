// store.js — Zustand store for the editor's schema + UI state.
//
// History stack: every mutation that touches `schema` pushes the
// previous state onto `past`; Ctrl+Z pops back, Ctrl+Shift+Z reapplies.
// Mutations are coarse (whole-schema snapshots) — schema is small
// enough that this is fine and gives us cheap, correct undo.
//
// Persistence: the editor's own UI state (selection, panel widths)
// lives in localStorage. The schema lives in memory + is mirrored to
// the dev server so /axiom.user.js stays fresh; saving to a file is
// explicit via File System Access API / download.

import { create } from "zustand";
import { defaultSchema, findControl, uid } from "../shared/schema.js";
import { migrate } from "../shared/migrate.js";

const HISTORY_LIMIT = 100;
const LS_API_KEY = "axiom.editor.apiKey";
const LS_MODEL   = "axiom.editor.model";

function loadInitialSchema() {
  // Pull from localStorage if present (resume work after refresh).
  try {
    const raw = localStorage.getItem("axiom.editor.schema");
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* fall through */ }
  return defaultSchema();
}

function persistSchema(schema) {
  try { localStorage.setItem("axiom.editor.schema", JSON.stringify(schema)); } catch {}
}

async function pushToDevServer(schema) {
  // Best-effort POST so the dev server's /axiom.user.js endpoint
  // returns the latest schema next time Tampermonkey pulls.
  try {
    await fetch("/__axiom/dev-schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schema),
    });
  } catch { /* dev server might not be up; that's OK */ }
}

export const useStore = create((set, get) => ({
  schema: loadInitialSchema(),
  past: [],
  future: [],

  // Selection — by id. selectedControlId implies a tab+section selection too.
  selectedTabId: null,
  selectedSectionId: null,
  selectedControlId: null,

  // Selected script for the Monaco panel. Defaults to the script bound
  // to the currently-selected control, but the user can pin it.
  selectedScriptId: null,

  // Panel state
  claudeOpen: false,
  settingsOpen: false,
  diffPending: null, // { changes: [...], original: schemaSnapshot }

  // Claude config — API key lives in localStorage only.
  apiKey: localStorage.getItem(LS_API_KEY) || "",
  model: localStorage.getItem(LS_MODEL) || "claude-sonnet-4-6",

  // ── Schema mutation primitives ──────────────────────────────────────
  // `apply` snapshots current schema into history then writes the new one.
  apply(producer, options = {}) {
    const prev = get().schema;
    const next = typeof producer === "function" ? producer(prev) : producer;
    if (next === prev) return;
    const past = options.skipHistory ? get().past : [...get().past, prev];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ schema: next, past, future: [] });
    persistSchema(next);
    pushToDevServer(next);
  },

  undo() {
    const { past, schema, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      schema: prev,
      past: past.slice(0, -1),
      future: [...future, schema],
    });
    persistSchema(prev);
    pushToDevServer(prev);
  },

  redo() {
    const { past, schema, future } = get();
    if (!future.length) return;
    const next = future[future.length - 1];
    set({
      schema: next,
      past: [...past, schema],
      future: future.slice(0, -1),
    });
    persistSchema(next);
    pushToDevServer(next);
  },

  pushDevSchema() { pushToDevServer(get().schema); },

  // ── Selection ───────────────────────────────────────────────────────
  selectTab(tabId) {
    set({ selectedTabId: tabId, selectedSectionId: null, selectedControlId: null });
  },
  selectSection(tabId, sectionId) {
    set({ selectedTabId: tabId, selectedSectionId: sectionId, selectedControlId: null });
  },
  selectControl(tabId, sectionId, controlId) {
    const found = findControl(get().schema, controlId);
    const scriptId = found?.control?.scriptId || null;
    set({
      selectedTabId: tabId,
      selectedSectionId: sectionId,
      selectedControlId: controlId,
      selectedScriptId: scriptId,
    });
  },
  selectScript(scriptId) { set({ selectedScriptId: scriptId }); },

  // ── Tab / Section / Control CRUD ────────────────────────────────────
  addTab(partial = {}) {
    const id = partial.id || uid("tab");
    get().apply((s) => ({
      ...s,
      tabs: [...s.tabs, {
        id, name: partial.name || "New tab", icon: partial.icon || null,
        sections: partial.sections || [],
      }],
    }));
    set({ selectedTabId: id, selectedSectionId: null, selectedControlId: null });
    return id;
  },
  updateTab(tabId, patch) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => t.id === tabId ? { ...t, ...patch } : t),
    }));
  },
  deleteTab(tabId) {
    get().apply((s) => ({ ...s, tabs: s.tabs.filter((t) => t.id !== tabId) }));
    if (get().selectedTabId === tabId)
      set({ selectedTabId: null, selectedSectionId: null, selectedControlId: null });
  },
  reorderTabs(orderedIds) {
    get().apply((s) => {
      const map = new Map(s.tabs.map((t) => [t.id, t]));
      return { ...s, tabs: orderedIds.map((id) => map.get(id)).filter(Boolean) };
    });
  },

  addSection(tabId, partial = {}) {
    const id = partial.id || uid("sec");
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => t.id !== tabId ? t : {
        ...t, sections: [...t.sections, {
          id, name: partial.name || "New section",
          collapsible: !!partial.collapsible,
          defaultOpen: partial.defaultOpen !== false,
          controls: partial.controls || [],
        }],
      }),
    }));
    set({ selectedTabId: tabId, selectedSectionId: id, selectedControlId: null });
    return id;
  },
  updateSection(tabId, sectionId, patch) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => t.id !== tabId ? t : {
        ...t, sections: t.sections.map((sec) => sec.id === sectionId ? { ...sec, ...patch } : sec),
      }),
    }));
  },
  deleteSection(tabId, sectionId) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => t.id !== tabId ? t : { ...t, sections: t.sections.filter((sec) => sec.id !== sectionId) }),
    }));
  },
  reorderSections(tabId, orderedIds) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const map = new Map(t.sections.map((sec) => [sec.id, sec]));
        return { ...t, sections: orderedIds.map((id) => map.get(id)).filter(Boolean) };
      }),
    }));
  },

  addControl(tabId, sectionId, partial = {}) {
    const id = partial.id || uid("ctl");
    const control = {
      type: partial.type || "button",
      id,
      label: partial.label || "New control",
      ...partial,
    };
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => t.id !== tabId ? t : {
        ...t, sections: t.sections.map((sec) =>
          sec.id !== sectionId ? sec : { ...sec, controls: [...sec.controls, control] }),
      }),
    }));
    set({ selectedTabId: tabId, selectedSectionId: sectionId, selectedControlId: id });
    return id;
  },
  updateControl(controlId, patch) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => ({
        ...t,
        sections: t.sections.map((sec) => ({
          ...sec,
          controls: sec.controls.map((c) => c.id === controlId ? { ...c, ...patch } : c),
        })),
      })),
    }));
  },
  deleteControl(controlId) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => ({
        ...t,
        sections: t.sections.map((sec) => ({
          ...sec,
          controls: sec.controls.filter((c) => c.id !== controlId),
        })),
      })),
    }));
    if (get().selectedControlId === controlId) set({ selectedControlId: null });
  },
  reorderControls(tabId, sectionId, orderedIds) {
    get().apply((s) => ({
      ...s,
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return { ...t, sections: t.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const map = new Map(sec.controls.map((c) => [c.id, c]));
          return { ...sec, controls: orderedIds.map((id) => map.get(id)).filter(Boolean) };
        }) };
      }),
    }));
  },

  // ── Scripts ─────────────────────────────────────────────────────────
  upsertScript(scriptId, patch) {
    get().apply((s) => ({
      ...s,
      scripts: {
        ...s.scripts,
        [scriptId]: {
          id: scriptId,
          name: patch.name ?? s.scripts[scriptId]?.name ?? scriptId,
          source: patch.source ?? s.scripts[scriptId]?.source ?? "",
        },
      },
    }));
  },
  attachScript(controlId, scriptId) {
    get().updateControl(controlId, { scriptId });
  },
  deleteScript(scriptId) {
    get().apply((s) => {
      const next = { ...s.scripts };
      delete next[scriptId];
      return { ...s, scripts: next };
    });
  },

  // ── Meta ────────────────────────────────────────────────────────────
  updateMeta(patch) {
    get().apply((s) => ({ ...s, meta: { ...s.meta, ...patch } }));
  },

  // ── Project save / load ─────────────────────────────────────────────
  // Whole-schema replacement, skipping history if requested (e.g. on
  // project open). Otherwise the load is undoable.
  replaceSchema(schema, { skipHistory } = {}) {
    const migrated = migrate(schema);
    get().apply(() => migrated, { skipHistory: !!skipHistory });
  },

  // ── UI panel state ──────────────────────────────────────────────────
  toggleClaude(open) { set({ claudeOpen: open === undefined ? !get().claudeOpen : !!open }); },
  toggleSettings(open) { set({ settingsOpen: open === undefined ? !get().settingsOpen : !!open }); },

  setApiKey(key) {
    set({ apiKey: key });
    try { localStorage.setItem(LS_API_KEY, key); } catch {}
  },
  setModel(model) {
    set({ model });
    try { localStorage.setItem(LS_MODEL, model); } catch {}
  },

  setDiffPending(diff) { set({ diffPending: diff }); },
}));

// Selector helpers — keep components from re-rendering on unrelated changes.
export function useSelectedTab() {
  return useStore((s) => s.schema.tabs.find((t) => t.id === s.selectedTabId) || null);
}
export function useSelectedSection() {
  return useStore((s) => {
    const tab = s.schema.tabs.find((t) => t.id === s.selectedTabId);
    if (!tab) return null;
    return tab.sections.find((sec) => sec.id === s.selectedSectionId) || null;
  });
}
export function useSelectedControl() {
  return useStore((s) => {
    if (!s.selectedControlId) return null;
    for (const t of s.schema.tabs)
      for (const sec of t.sections)
        for (const c of sec.controls) if (c.id === s.selectedControlId) return c;
    return null;
  });
}
