import React from "react";
import { useStore, useSelectedTab, useSelectedSection, useSelectedControl } from "../store.js";

// Inspector — edits the currently selected node (tab / section / control).
// We pick the most-specific selection: control > section > tab > project.

export default function Inspector() {
  const control = useSelectedControl();
  const section = useSelectedSection();
  const tab = useSelectedTab();

  return (
    <aside className="inspector panel">
      <div className="panel-header">
        Inspector
        <div className="panel-header-spacer" />
        <span className="topbar-meta">{control ? "control" : section ? "section" : tab ? "tab" : "project"}</span>
      </div>
      <div className="panel-body">
        {control ? <ControlInspector control={control} /> :
         section ? <SectionInspector section={section} tabId={tab?.id} /> :
         tab     ? <TabInspector tab={tab} /> :
                   <ProjectInspector />}
      </div>
    </aside>
  );
}

function ControlInspector({ control }) {
  const update = useStore((s) => s.updateControl);
  const schema = useStore((s) => s.schema);
  const upsertScript = useStore((s) => s.upsertScript);
  const selectScript = useStore((s) => s.selectScript);

  function setField(key, val) { update(control.id, { [key]: val }); }

  function bindNewScript() {
    const id = `scr_${Math.random().toString(36).slice(2, 8)}`;
    upsertScript(id, { name: control.label || id, source: "// new script\n" });
    update(control.id, { scriptId: id });
    selectScript(id);
  }

  const showOptions = ["select", "radio"].includes(control.type);
  const showNumeric = ["slider", "number"].includes(control.type);
  const showPlaceholder = control.type === "input";
  const showSecondary = control.type === "button";
  const showDefault = !["button", "text"].includes(control.type);

  return (
    <>
      <Field label="Type">
        <select value={control.type} onChange={(e) => setField("type", e.target.value)}>
          {["button","toggle","slider","input","number","select","keybind","color","radio","text"].map((t) =>
            <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Id"><input type="text" value={control.id} disabled /></Field>
      <Field label="Label">
        <input type="text" value={control.label || ""} onChange={(e) => setField("label", e.target.value)} />
      </Field>
      <Field label="Tooltip">
        <input type="text" value={control.tooltip || ""} onChange={(e) => setField("tooltip", e.target.value || null)} />
      </Field>

      {showDefault && (
        <Field label="Default">
          <input
            type="text"
            value={control.defaultValue == null ? "" : String(control.defaultValue)}
            onChange={(e) => {
              let v = e.target.value;
              // Coerce booleans / numbers as appropriate.
              if (control.type === "toggle") v = v === "true";
              else if (showNumeric) v = v === "" ? 0 : Number(v);
              setField("defaultValue", v);
            }}
          />
        </Field>
      )}

      {showPlaceholder && (
        <Field label="Placeholder">
          <input type="text" value={control.placeholder || ""} onChange={(e) => setField("placeholder", e.target.value)} />
        </Field>
      )}

      {showNumeric && (
        <>
          <Field label="Min"><input type="number" value={control.min ?? 0}
            onChange={(e) => setField("min", Number(e.target.value))} /></Field>
          <Field label="Max"><input type="number" value={control.max ?? 100}
            onChange={(e) => setField("max", Number(e.target.value))} /></Field>
          <Field label="Step"><input type="number" value={control.step ?? 1}
            onChange={(e) => setField("step", Number(e.target.value))} /></Field>
        </>
      )}

      {showSecondary && (
        <Field label="Secondary">
          <input type="checkbox" checked={!!control.secondary}
            onChange={(e) => setField("secondary", e.target.checked)} />
        </Field>
      )}

      {showOptions && <OptionsEditor control={control} setField={setField} />}

      <FormSection title="Script binding">
        <Field label="Script">
          <select
            value={control.scriptId || ""}
            onChange={(e) => setField("scriptId", e.target.value || null)}
          >
            <option value="">(none)</option>
            {Object.values(schema.scripts).map((s) =>
              <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </select>
        </Field>
        <Field label="">
          <div style={{ display: "flex", gap: 6 }}>
            <button className="topbar-btn" onClick={bindNewScript}>New script</button>
            {control.scriptId && (
              <button className="topbar-btn" onClick={() => selectScript(control.scriptId)}>Edit in panel</button>
            )}
          </div>
        </Field>
        <Field label="showIf script">
          <select
            value={control.showIfScriptId || ""}
            onChange={(e) => setField("showIfScriptId", e.target.value || null)}
          >
            <option value="">(always show)</option>
            {Object.values(schema.scripts).map((s) =>
              <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </select>
        </Field>
      </FormSection>
    </>
  );
}

function OptionsEditor({ control, setField }) {
  const options = control.options || [];
  function setAll(next) { setField("options", next); }
  return (
    <FormSection title="Options">
      <div className="options-list">
        {options.map((o, i) => (
          <div className="opt-row" key={i}>
            <input type="text" value={o.value} placeholder="value"
              onChange={(e) => setAll(options.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
            <input type="text" value={o.label} placeholder="label"
              onChange={(e) => setAll(options.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <button className="iconbtn danger" onClick={() => setAll(options.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="topbar-btn" onClick={() => setAll([...options, { value: `opt${options.length + 1}`, label: `Option ${options.length + 1}` }])}>
          + option
        </button>
      </div>
    </FormSection>
  );
}

function SectionInspector({ section, tabId }) {
  const update = useStore((s) => s.updateSection);
  return (
    <>
      <Field label="Name">
        <input type="text" value={section.name || ""}
          onChange={(e) => update(tabId, section.id, { name: e.target.value })} />
      </Field>
      <Field label="Id"><input type="text" value={section.id} disabled /></Field>
      <Field label="Collapsible">
        <input type="checkbox" checked={!!section.collapsible}
          onChange={(e) => update(tabId, section.id, { collapsible: e.target.checked })} />
      </Field>
      <Field label="Default open">
        <input type="checkbox" checked={section.defaultOpen !== false}
          onChange={(e) => update(tabId, section.id, { defaultOpen: e.target.checked })} />
      </Field>
    </>
  );
}

function TabInspector({ tab }) {
  const update = useStore((s) => s.updateTab);
  return (
    <>
      <Field label="Name">
        <input type="text" value={tab.name || ""} onChange={(e) => update(tab.id, { name: e.target.value })} />
      </Field>
      <Field label="Id"><input type="text" value={tab.id} disabled /></Field>
      <Field label="Icon">
        <input type="text" value={tab.icon || ""} placeholder="emoji, URL, or built-in name"
          onChange={(e) => update(tab.id, { icon: e.target.value || null })} />
      </Field>
    </>
  );
}

function ProjectInspector() {
  const meta = useStore((s) => s.schema.meta);
  const tabs = useStore((s) => s.schema.tabs);
  const updateMeta = useStore((s) => s.updateMeta);
  return (
    <>
      <Field label="Project name">
        <input type="text" value={meta.name} onChange={(e) => updateMeta({ name: e.target.value })} />
      </Field>
      <Field label="Version">
        <input type="text" value={meta.version} onChange={(e) => updateMeta({ version: e.target.value })} />
      </Field>
      <Field label="Hotkey">
        <input type="text" value={meta.hotkey} onChange={(e) => updateMeta({ hotkey: e.target.value })} />
      </Field>
      <Field label="Landing tab">
        <select value={meta.landingTabId || ""} onChange={(e) => updateMeta({ landingTabId: e.target.value || null })}>
          <option value="">(first)</option>
          {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}
function FormSection({ title, children }) {
  return (
    <div className="form-section">
      <div className="form-section-title">{title}</div>
      {children}
    </div>
  );
}
