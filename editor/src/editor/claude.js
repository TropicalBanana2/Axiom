// claude.js — Anthropic Messages API client + Axiom tool layer.
//
// Telemetry-free: the only outbound request is the streamed call to
// https://api.anthropic.com/v1/messages. The API key lives in
// localStorage and is set as `x-api-key`. No analytics, no error
// reporting endpoints, no other origins are contacted.
//
// We use plain fetch + SSE rather than the SDK to keep dependencies
// minimal and the wire format inspectable. The browser-access header
// is required when calling Anthropic from a browser origin.

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const SYSTEM_PROMPT = `You are an assistant embedded in Axiom, a UI editor for zombs.io userscripts.
You can edit the project's schema by calling tools. The user describes high-level changes;
you translate them into one or more tool calls. After each turn the user reviews your
proposed changes in a diff and accepts or rejects them. Be concise — keep prose brief and
prefer making the actual tool calls. When attaching scripts, prefer existing scripts where
possible; only create a new one when the behavior is genuinely distinct.`;

// Tool catalogue. Names match the spec's required minimum.
export const TOOLS = [
  {
    name: "add_tab",
    description: "Append a new tab to the project. Optional sections + controls inline.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        icon: { type: ["string", "null"], description: "Emoji, image URL, or built-in (Player/Combat/Visuals/Misc)." },
        index: { type: "integer", description: "Position to insert at. Omit to append." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_tab",
    description: "Edit a tab's name or icon.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        icon: { type: ["string", "null"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_tab",
    description: "Remove a tab and all its contents.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "reorder_tabs",
    description: "Reorder all tabs to match the given list of ids.",
    input_schema: {
      type: "object",
      properties: { orderedIds: { type: "array", items: { type: "string" } } },
      required: ["orderedIds"],
    },
  },
  {
    name: "add_section",
    description: "Add a section to a tab.",
    input_schema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        name: { type: "string" },
        collapsible: { type: "boolean" },
        defaultOpen: { type: "boolean" },
      },
      required: ["tabId", "name"],
    },
  },
  {
    name: "update_section",
    description: "Edit a section's properties.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        collapsible: { type: "boolean" },
        defaultOpen: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_section",
    description: "Remove a section and its controls.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "reorder_sections",
    description: "Reorder sections within a tab.",
    input_schema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        orderedIds: { type: "array", items: { type: "string" } },
      },
      required: ["tabId", "orderedIds"],
    },
  },
  {
    name: "add_control",
    description:
      "Add a control to a section. Control type must be one of: button, toggle, slider, input, number, select, radio, color, keybind, text. " +
      "For select/radio, supply `options: [{value,label}]`. For slider/number, supply min/max/step.",
    input_schema: {
      type: "object",
      properties: {
        sectionId: { type: "string" },
        type: { type: "string" },
        label: { type: "string" },
        defaultValue: {},
        min: { type: "number" }, max: { type: "number" }, step: { type: "number" },
        placeholder: { type: "string" },
        options: {
          type: "array",
          items: { type: "object", properties: { value: {}, label: { type: "string" } }, required: ["value", "label"] },
        },
        secondary: { type: "boolean" },
        tooltip: { type: ["string", "null"] },
        scriptId: { type: ["string", "null"] },
      },
      required: ["sectionId", "type", "label"],
    },
  },
  {
    name: "update_control",
    description: "Edit any subset of a control's fields.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string" }, label: { type: "string" },
        defaultValue: {}, min: { type: "number" }, max: { type: "number" }, step: { type: "number" },
        placeholder: { type: "string" }, options: { type: "array" },
        secondary: { type: "boolean" }, tooltip: { type: ["string", "null"] },
        scriptId: { type: ["string", "null"] }, showIfScriptId: { type: ["string", "null"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_control",
    description: "Remove a control.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "reorder_controls",
    description: "Reorder controls within a section.",
    input_schema: {
      type: "object",
      properties: {
        sectionId: { type: "string" },
        orderedIds: { type: "array", items: { type: "string" } },
      },
      required: ["sectionId", "orderedIds"],
    },
  },
  {
    name: "attach_script",
    description: "Bind an existing script to a control. Pass scriptId: null to unbind.",
    input_schema: {
      type: "object",
      properties: {
        controlId: { type: "string" },
        scriptId: { type: ["string", "null"] },
      },
      required: ["controlId"],
    },
  },
  {
    name: "edit_script",
    description: "Create or replace a script's source / name. Use this to add new behaviors.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Stable script id, e.g. scr_combat_attack" },
        name: { type: "string" },
        source: { type: "string", description: "Function body. `ctx`, `value`, `controlId` are in scope." },
      },
      required: ["id", "source"],
    },
  },
  {
    name: "delete_script",
    description: "Delete a script (controls still referencing it will silently fail to fire).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

// ── Pure applyTool ──────────────────────────────────────────────────
// Returns a new schema. Throws Error with a human-readable message on
// invalid args (so we can echo back as tool_result to Claude).

function clone(schema) { return JSON.parse(JSON.stringify(schema)); }

function locateSection(schema, sectionId) {
  for (const t of schema.tabs)
    for (const s of t.sections) if (s.id === sectionId) return { tab: t, section: s };
  return null;
}
function locateControl(schema, controlId) {
  for (const t of schema.tabs)
    for (const s of t.sections)
      for (const c of s.controls) if (c.id === controlId) return { tab: t, section: s, control: c };
  return null;
}

function genId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function applyTool(schema, name, args) {
  const s = clone(schema);
  switch (name) {
    case "add_tab": {
      const id = genId("tab");
      const tab = { id, name: args.name, icon: args.icon ?? null, sections: [] };
      if (Number.isInteger(args.index)) s.tabs.splice(args.index, 0, tab);
      else s.tabs.push(tab);
      return s;
    }
    case "update_tab": {
      const t = s.tabs.find((t) => t.id === args.id);
      if (!t) throw new Error(`tab ${args.id} not found`);
      if (args.name !== undefined) t.name = args.name;
      if (args.icon !== undefined) t.icon = args.icon;
      return s;
    }
    case "delete_tab": {
      const i = s.tabs.findIndex((t) => t.id === args.id);
      if (i < 0) throw new Error(`tab ${args.id} not found`);
      s.tabs.splice(i, 1);
      return s;
    }
    case "reorder_tabs": {
      const map = new Map(s.tabs.map((t) => [t.id, t]));
      const next = args.orderedIds.map((id) => map.get(id)).filter(Boolean);
      if (next.length !== s.tabs.length) throw new Error("orderedIds must cover every tab id exactly once");
      s.tabs = next;
      return s;
    }
    case "add_section": {
      const t = s.tabs.find((t) => t.id === args.tabId);
      if (!t) throw new Error(`tab ${args.tabId} not found`);
      const id = genId("sec");
      t.sections.push({
        id, name: args.name,
        collapsible: !!args.collapsible,
        defaultOpen: args.defaultOpen !== false,
        controls: [],
      });
      return s;
    }
    case "update_section": {
      const found = locateSection(s, args.id);
      if (!found) throw new Error(`section ${args.id} not found`);
      if (args.name !== undefined) found.section.name = args.name;
      if (args.collapsible !== undefined) found.section.collapsible = args.collapsible;
      if (args.defaultOpen !== undefined) found.section.defaultOpen = args.defaultOpen;
      return s;
    }
    case "delete_section": {
      const found = locateSection(s, args.id);
      if (!found) throw new Error(`section ${args.id} not found`);
      found.tab.sections = found.tab.sections.filter((sec) => sec.id !== args.id);
      return s;
    }
    case "reorder_sections": {
      const t = s.tabs.find((t) => t.id === args.tabId);
      if (!t) throw new Error(`tab ${args.tabId} not found`);
      const map = new Map(t.sections.map((sec) => [sec.id, sec]));
      const next = args.orderedIds.map((id) => map.get(id)).filter(Boolean);
      if (next.length !== t.sections.length) throw new Error("orderedIds must cover every section exactly once");
      t.sections = next;
      return s;
    }
    case "add_control": {
      const found = locateSection(s, args.sectionId);
      if (!found) throw new Error(`section ${args.sectionId} not found`);
      const id = genId("ctl");
      const c = { id, type: args.type, label: args.label };
      ["defaultValue","min","max","step","placeholder","options","secondary","tooltip","scriptId"]
        .forEach((k) => { if (args[k] !== undefined) c[k] = args[k]; });
      found.section.controls.push(c);
      return s;
    }
    case "update_control": {
      const found = locateControl(s, args.id);
      if (!found) throw new Error(`control ${args.id} not found`);
      const c = found.control;
      Object.entries(args).forEach(([k, v]) => { if (k !== "id" && v !== undefined) c[k] = v; });
      return s;
    }
    case "delete_control": {
      const found = locateControl(s, args.id);
      if (!found) throw new Error(`control ${args.id} not found`);
      found.section.controls = found.section.controls.filter((c) => c.id !== args.id);
      return s;
    }
    case "reorder_controls": {
      const found = locateSection(s, args.sectionId);
      if (!found) throw new Error(`section ${args.sectionId} not found`);
      const map = new Map(found.section.controls.map((c) => [c.id, c]));
      const next = args.orderedIds.map((id) => map.get(id)).filter(Boolean);
      if (next.length !== found.section.controls.length) throw new Error("orderedIds must cover every control exactly once");
      found.section.controls = next;
      return s;
    }
    case "attach_script": {
      const found = locateControl(s, args.controlId);
      if (!found) throw new Error(`control ${args.controlId} not found`);
      found.control.scriptId = args.scriptId ?? null;
      return s;
    }
    case "edit_script": {
      s.scripts[args.id] = {
        id: args.id,
        name: args.name ?? (s.scripts[args.id]?.name ?? args.id),
        source: args.source,
      };
      return s;
    }
    case "delete_script": {
      if (!s.scripts[args.id]) throw new Error(`script ${args.id} not found`);
      delete s.scripts[args.id];
      return s;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Compact schema for the system context — same fields, just trims script
// sources to a preview so token usage stays reasonable in long sessions.
function summarizeSchema(schema) {
  return {
    meta: schema.meta,
    tabs: schema.tabs.map((t) => ({
      id: t.id, name: t.name,
      sections: t.sections.map((sec) => ({
        id: sec.id, name: sec.name, collapsible: sec.collapsible,
        controls: sec.controls.map((c) => ({
          id: c.id, type: c.type, label: c.label, scriptId: c.scriptId || null,
        })),
      })),
    })),
    scripts: Object.fromEntries(Object.entries(schema.scripts).map(([id, s]) => [
      id, { id, name: s.name, source: s.source.length > 400 ? s.source.slice(0, 400) + "…" : s.source },
    ])),
  };
}

// ── Streaming Messages call ─────────────────────────────────────────
// Single turn — sends user messages, streams the response, returns
// { workingSchema, ops, text } where `ops` is the ordered list of tool
// calls and `workingSchema` is the result of applying all of them.

export async function runAgentTurn({
  apiKey, model, schema, messages, signal,
  onText,      // (delta) called with text-delta chunks
  onToolStart, // (toolUse) called when a tool block starts
  onToolEnd,   // (toolUse, result) called after applying
}) {
  if (!apiKey) throw new Error("No API key set");

  // System message includes the current schema summary so Claude has
  // up-to-date ids without needing a "read" tool round-trip.
  const system = SYSTEM_PROMPT +
    "\n\nCURRENT_SCHEMA (read-only context — use ids from here when referencing existing items):\n" +
    JSON.stringify(summarizeSchema(schema));

  const body = {
    model,
    max_tokens: 4096,
    system,
    tools: TOOLS,
    messages,
    stream: true,
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text}`);
  }

  // SSE parser. Anthropic streams lines like `event: <type>\ndata: <json>\n\n`.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Per-block state — index → { type, input_partial, input, name, id, text }
  const blocks = new Map();
  const ops = [];
  let workingSchema = schema;
  let fullText = "";
  let stopReason = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = splitSseEvents(buffer);
    buffer = events.tail;
    for (const evt of events.list) {
      if (!evt.data) continue;
      let data;
      try { data = JSON.parse(evt.data); } catch { continue; }
      switch (data.type) {
        case "content_block_start": {
          blocks.set(data.index, {
            ...data.content_block,
            input_partial: "",
          });
          if (data.content_block.type === "tool_use") {
            onToolStart?.(data.content_block);
          }
          break;
        }
        case "content_block_delta": {
          const block = blocks.get(data.index);
          if (!block) break;
          const d = data.delta;
          if (d.type === "text_delta") {
            block.text = (block.text || "") + d.text;
            fullText += d.text;
            onText?.(d.text);
          } else if (d.type === "input_json_delta") {
            block.input_partial += d.partial_json;
          }
          break;
        }
        case "content_block_stop": {
          const block = blocks.get(data.index);
          if (!block) break;
          if (block.type === "tool_use") {
            // Parse the accumulated input JSON. Tolerate empty (no args).
            let input = {};
            if (block.input_partial) {
              try { input = JSON.parse(block.input_partial); }
              catch (err) { input = { __parse_error: String(err.message) }; }
            }
            block.input = input;
            // Apply against the working schema, capture result for diff.
            let opResult;
            try {
              workingSchema = applyTool(workingSchema, block.name, input);
              opResult = { ok: true };
            } catch (err) {
              opResult = { ok: false, error: err.message };
            }
            ops.push({ id: block.id, name: block.name, input, result: opResult });
            onToolEnd?.(block, opResult);
          }
          break;
        }
        case "message_delta": {
          if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
          break;
        }
        case "message_stop":
        case "error": {
          // Surface errors emitted mid-stream as exceptions.
          if (data.type === "error") throw new Error(data.error?.message || "Stream error");
          break;
        }
      }
    }
  }

  return { workingSchema, ops, text: fullText, stopReason };
}

function splitSseEvents(buffer) {
  // Split on blank lines (event delimiter). Anything trailing without
  // a delimiter is kept in `tail` for the next chunk.
  const parts = buffer.split(/\n\n/);
  const tail = parts.pop() ?? "";
  const list = parts.map((part) => {
    const obj = {};
    for (const line of part.split("\n")) {
      const m = line.match(/^([a-z]+):\s?(.*)$/);
      if (m) obj[m[1]] = obj[m[1]] ? obj[m[1]] + "\n" + m[2] : m[2];
    }
    return obj;
  });
  return { list, tail };
}
