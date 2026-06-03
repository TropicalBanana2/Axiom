// schema.js — Schema constants, defaults, validators.
//
// Schema shape (v1):
//   { schemaVersion, meta: { name, version, hotkey, theme, landingTabId },
//     tabs: [{ id, name, icon?, sections: [{ id, name, collapsible?, defaultOpen?, controls: [Control] }] }],
//     scripts: { [scriptId]: { id, name, source } } }
//
// Control shape:
//   { type, id, label, tooltip?, showIfScriptId?, scriptId?,
//     defaultValue?, min?, max?, step?, placeholder?, options?, secondary? }

export const CURRENT_SCHEMA_VERSION = 1;

export const CONTROL_TYPES = [
  "button",
  "toggle",
  "slider",
  "input",       // text input
  "number",      // numeric input
  "select",
  "keybind",
  "color",
  "radio",
  "text",        // static text / info callout
];

// Default schema bundled with a fresh install. Demonstrates each control
// type with a `ctx.log()` script so the smoke test passes out of the box.
export function defaultSchema() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      name: "Axiom",
      version: "0.1.0",
      hotkey: "`",
      theme: "axiom-dark",
      landingTabId: "home",
    },
    tabs: [
      {
        id: "home",
        name: "Home",
        icon: null,
        sections: [
          {
            id: "home-welcome",
            name: "Welcome",
            collapsible: false,
            defaultOpen: true,
            controls: [
              {
                type: "text",
                id: "home-welcome-blurb",
                label: "",
                defaultValue:
                  "Axiom is a tab-based scripting console for zombs.io. " +
                  "Use the editor to add tabs, sections, and controls — each control " +
                  "can run a script you write. Press the hotkey (default backtick) to toggle this panel.",
                tooltip: null,
              },
              {
                type: "button",
                id: "home-welcome-hello",
                label: "Say hello",
                scriptId: "scr_hello",
                secondary: false,
              },
            ],
          },
          {
            id: "home-quickref",
            name: "Quick reference",
            collapsible: true,
            defaultOpen: false,
            controls: [
              {
                type: "text",
                id: "home-quickref-blurb",
                label: "",
                defaultValue:
                  "ctx.log(msg, level?) — write to the console panel.\n" +
                  "ctx.game — read-only game state.\n" +
                  "ctx.ui — read/set values of other controls by id.\n" +
                  "ctx.storage — get/set persisted values.\n" +
                  "ctx.on(event, fn) / ctx.off(event, fn) — lifecycle + tick hooks.",
              },
            ],
          },
        ],
      },
      {
        id: "demo",
        name: "Demo",
        icon: null,
        sections: [
          {
            id: "demo-controls",
            name: "Every control type",
            collapsible: false,
            defaultOpen: true,
            controls: [
              { type: "toggle", id: "demo-toggle", label: "A toggle", defaultValue: false, scriptId: "scr_changed" },
              { type: "slider", id: "demo-slider", label: "A slider", defaultValue: 50, min: 0, max: 100, step: 1, scriptId: "scr_changed" },
              { type: "input",  id: "demo-text",   label: "Some text", defaultValue: "", placeholder: "type something…", scriptId: "scr_changed" },
              { type: "number", id: "demo-number", label: "A number", defaultValue: 1, min: 0, max: 999, step: 1, scriptId: "scr_changed" },
              {
                type: "select",
                id: "demo-select",
                label: "A select",
                defaultValue: "one",
                options: [
                  { value: "one",   label: "One"   },
                  { value: "two",   label: "Two"   },
                  { value: "three", label: "Three" },
                ],
                scriptId: "scr_changed",
              },
              {
                type: "radio",
                id: "demo-radio",
                label: "A radio group",
                defaultValue: "a",
                options: [
                  { value: "a", label: "Alpha" },
                  { value: "b", label: "Beta"  },
                  { value: "c", label: "Gamma" },
                ],
                scriptId: "scr_changed",
              },
              { type: "color",   id: "demo-color",   label: "A color",   defaultValue: "#3b82f6", scriptId: "scr_changed" },
              { type: "keybind", id: "demo-keybind", label: "A keybind", defaultValue: "K",        scriptId: "scr_keybind" },
            ],
          },
        ],
      },
    ],
    scripts: {
      scr_hello: {
        id: "scr_hello",
        name: "Hello",
        source: "ctx.log('hello');",
      },
      scr_changed: {
        id: "scr_changed",
        name: "Log changes",
        source: "// Runs whenever the bound control's value changes.\n" +
                "// `value` is in scope as the new value, `controlId` as the id.\n" +
                "ctx.log(controlId + ' → ' + JSON.stringify(value));",
      },
      scr_keybind: {
        id: "scr_keybind",
        name: "Log keypress",
        source: "ctx.log('keybind pressed: ' + value);",
      },
    },
  };
}

// Cheap structural validator — used at import time. Throws SchemaError
// with a human-readable path on the first problem.
export class SchemaError extends Error {}

export function validate(schema) {
  const at = (path) => (msg) => { throw new SchemaError(`${path}: ${msg}`); };
  if (!schema || typeof schema !== "object") at("$")("not an object");
  if (typeof schema.schemaVersion !== "number") at("$.schemaVersion")("must be a number");
  if (!schema.meta || typeof schema.meta !== "object") at("$.meta")("missing");
  if (!Array.isArray(schema.tabs)) at("$.tabs")("must be an array");
  if (!schema.scripts || typeof schema.scripts !== "object") at("$.scripts")("must be an object");

  const seen = new Set();
  const claim = (id, path) => {
    if (!id || typeof id !== "string") at(path)("id must be a non-empty string");
    if (seen.has(id)) at(path)(`duplicate id "${id}"`);
    seen.add(id);
  };

  schema.tabs.forEach((tab, i) => {
    claim(tab.id, `$.tabs[${i}].id`);
    if (typeof tab.name !== "string") at(`$.tabs[${i}].name`)("must be a string");
    if (!Array.isArray(tab.sections)) at(`$.tabs[${i}].sections`)("must be an array");
    tab.sections.forEach((sec, j) => {
      claim(sec.id, `$.tabs[${i}].sections[${j}].id`);
      if (!Array.isArray(sec.controls)) at(`$.tabs[${i}].sections[${j}].controls`)("must be an array");
      sec.controls.forEach((c, k) => {
        const cp = `$.tabs[${i}].sections[${j}].controls[${k}]`;
        claim(c.id, `${cp}.id`);
        if (!CONTROL_TYPES.includes(c.type)) at(`${cp}.type`)(`unknown control type "${c.type}"`);
      });
    });
  });

  for (const [sid, s] of Object.entries(schema.scripts)) {
    if (typeof s.source !== "string") at(`$.scripts[${sid}].source`)("must be a string");
  }

  return schema;
}

// Find a control anywhere in the schema by id. Returns { tab, section, control, indices } or null.
export function findControl(schema, controlId) {
  for (let i = 0; i < schema.tabs.length; i++) {
    const tab = schema.tabs[i];
    for (let j = 0; j < tab.sections.length; j++) {
      const sec = tab.sections[j];
      for (let k = 0; k < sec.controls.length; k++) {
        if (sec.controls[k].id === controlId) {
          return { tab, section: sec, control: sec.controls[k], indices: [i, j, k] };
        }
      }
    }
  }
  return null;
}

// uid — short, collision-resistant enough for client-side schema edits.
export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
