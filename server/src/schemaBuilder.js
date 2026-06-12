// schemaBuilder.js — panel layout engine.
//
// Splits the in-game panel into two layers:
//
//   • LIBRARY (from code) — every "feature" (a top-level control in a
//     section: toggle / button / slider / select / group / row) plus all
//     SCRIPTS. Shipped in defaultSchema.js, updated by code.
//   • LAYOUT (from the DB) — which features live in which tabs/sections
//     and their order, plus tab/section names. Owned by the user, edited
//     in the dashboard's Panel Builder, and SURVIVES version bumps.
//
// The served schema (/api/schema) is assembled from library + layout, so
// new scripts I ship always appear in the library while the user's tab
// arrangement is never clobbered by an update.
//
// A "feature" is identified by its control `id`. Groups and rows are kept
// atomic (one draggable feature), preserving curated clusters like the
// Multibox identity/party/behaviour groups.

const { DEFAULT_SCHEMA } = require("./defaultSchema");

// ── Library: flatten the default schema into a feature registry ──────
// registry[id] = { ...controlDef, _origin: <default tab name> }
function buildLibrary() {
  const registry = {};
  const order = [];                 // feature ids in default order
  for (const tab of DEFAULT_SCHEMA.tabs || []) {
    for (const sec of tab.sections || []) {
      for (const ctrl of sec.controls || []) {
        if (!ctrl || !ctrl.id || registry[ctrl.id]) continue;
        registry[ctrl.id] = { def: ctrl, origin: tab.name, originTab: tab.id };
        order.push(ctrl.id);
      }
    }
  }
  return { registry, order };
}

// ── Default layout: derived from the default schema's structure ──────
// { version, tabs: [{ id, name, sections: [{ id, name, featureIds:[] }] }] }
function defaultLayout() {
  return {
    version: DEFAULT_SCHEMA.schemaVersion || 1,
    landingTabId: DEFAULT_SCHEMA.meta && DEFAULT_SCHEMA.meta.landingTabId,
    tabs: (DEFAULT_SCHEMA.tabs || []).map((tab) => ({
      id: tab.id,
      name: tab.name,
      sections: (tab.sections || []).map((sec) => ({
        id: sec.id,
        name: sec.name,
        collapsible: sec.collapsible !== false,
        defaultOpen: sec.defaultOpen !== false,
        featureIds: (sec.controls || []).map((c) => c.id).filter(Boolean),
      })),
    })),
  };
}

// The feature-library view for the builder UI: each feature with a short
// human label + type + origin, grouped-friendly. Excludes nothing.
function libraryView() {
  const { registry, order } = buildLibrary();
  return order.map((id) => {
    const { def, origin } = registry[id];
    return {
      id,
      type: def.type,
      label: def.label || def.id,
      tooltip: def.tooltip || "",
      scriptId: def.scriptId || null,
      origin,
      // A group/row bundles children — surface the count so the builder
      // can show "Identity (3)".
      childCount: Array.isArray(def.controls) ? def.controls.length : 0,
    };
  });
}

// ── Assemble the served schema from library + a layout ───────────────
// Unknown feature ids (e.g. a script removed in a later version) are
// silently dropped. Empty sections/tabs are kept (the user may be
// mid-edit); the panel renders them harmlessly.
function assemble(layout) {
  const { registry } = buildLibrary();
  const lay = layout && Array.isArray(layout.tabs) ? layout : defaultLayout();
  const tabs = lay.tabs.map((t) => ({
    id: t.id,
    name: t.name,
    icon: null,
    sections: (t.sections || []).map((s) => ({
      id: s.id,
      name: s.name,
      collapsible: s.collapsible !== false,
      defaultOpen: s.defaultOpen !== false,
      controls: (s.featureIds || [])
        .map((fid) => registry[fid] && registry[fid].def)
        .filter(Boolean),
    })),
  }));
  // Landing tab: honour the layout's, else the default, else the first.
  const landingTabId =
    (lay.landingTabId && tabs.some((t) => t.id === lay.landingTabId) && lay.landingTabId) ||
    (DEFAULT_SCHEMA.meta && DEFAULT_SCHEMA.meta.landingTabId) ||
    (tabs[0] && tabs[0].id);
  return {
    schemaVersion: DEFAULT_SCHEMA.schemaVersion,
    meta: { ...DEFAULT_SCHEMA.meta, landingTabId },
    tabs,
    scripts: DEFAULT_SCHEMA.scripts,
  };
}

// Validate + normalise a layout coming from the builder before storing.
// Keeps only known shapes; drops feature ids that aren't in the library
// so a bad client can't inject arbitrary controls.
function sanitizeLayout(input) {
  const { registry } = buildLibrary();
  if (!input || !Array.isArray(input.tabs)) return null;
  const slug = (s, fallback) => {
    const v = String(s == null ? "" : s).trim();
    return v || fallback;
  };
  const seenTab = new Set();
  const tabs = input.tabs.slice(0, 40).map((t, ti) => {
    let id = slug(t.id, "tab" + ti).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || ("tab" + ti);
    while (seenTab.has(id)) id += "_";
    seenTab.add(id);
    const seenSec = new Set();
    const sections = (Array.isArray(t.sections) ? t.sections : []).slice(0, 40).map((s, si) => {
      let sid = slug(s.id, id + "-s" + si).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || (id + "-s" + si);
      while (seenSec.has(sid)) sid += "_";
      seenSec.add(sid);
      const featureIds = (Array.isArray(s.featureIds) ? s.featureIds : [])
        .filter((fid) => typeof fid === "string" && registry[fid])
        .slice(0, 200);
      return {
        id: sid,
        name: slug(s.name, "Section").slice(0, 60),
        collapsible: s.collapsible !== false,
        defaultOpen: s.defaultOpen !== false,
        featureIds,
      };
    });
    return { id, name: slug(t.name, "Tab").slice(0, 40), sections };
  });
  if (tabs.length === 0) return null;
  const landingTabId = tabs.some((t) => t.id === input.landingTabId)
    ? input.landingTabId : tabs[0].id;
  return { version: DEFAULT_SCHEMA.schemaVersion, landingTabId, tabs };
}

// ── Controllers ──────────────────────────────────────────────────────
// Server-side, MULTI-SESSION coordinators — distinct from the per-session
// in-game scripts. They run on the axiom server and are configured per
// party in the dashboard (not dragged into an in-game tab). Catalogued
// here so the Panel Builder can show the full capability inventory; add a
// new entry when a new coordinator ships.
function controllers() {
  return [
    {
      id: "autoUpgrade",
      name: "Auto Upgrade",
      scope: "per-party",
      configuredAt: "Party menu → Auto Upgrade",
      description:
        "Economy-first base upgrader. Keeps GoldStash + GoldMines a set number of tiers ahead, then towers, then walls. Spends every session's materials, designates a 'saver' to bank gold for the next stash tier, retreats idle bots to their farm spots while saving, auto-rebuilds dead buildings, manages pets and a farm-harvester ring, and buys pickaxes only when the economy can spare it.",
    },
  ];
}

module.exports = {
  buildLibrary, defaultLayout, libraryView, assemble, sanitizeLayout, controllers,
};
