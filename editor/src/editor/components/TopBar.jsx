import React, { useRef } from "react";
import { useStore } from "../store.js";
import { exportUserscript, downloadFile } from "../exportUserscript.js";
import { importFromUserscript, importFromProject } from "../importUserscript.js";
import SettingsModal from "./SettingsModal.jsx";

export default function TopBar() {
  const schema = useStore((s) => s.schema);
  const replaceSchema = useStore((s) => s.replaceSchema);
  const toggleClaude = useStore((s) => s.toggleClaude);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);

  const fileInputRef = useRef(null);

  async function onExport() {
    const src = await exportUserscript(schema);
    downloadFile("axiom.user.js", src, "application/javascript");
  }

  function onSaveProject() {
    downloadFile(`axiom-project.axiom.json`,
      JSON.stringify(schema, null, 2), "application/json");
  }

  function onLoadClick() { fileInputRef.current?.click(); }

  async function onFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      if (file.name.endsWith(".user.js")) {
        const schema = importFromUserscript(text);
        replaceSchema(schema, { skipHistory: true });
      } else {
        const schema = importFromProject(text);
        replaceSchema(schema, { skipHistory: true });
      }
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
    e.target.value = "";
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-brand-dot" />
        <span>Axiom <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>uiengine</span></span>
        <span className="topbar-meta">v{schema.meta?.version}</span>
      </div>
      <button className="topbar-btn" onClick={undo} disabled={!past.length}>↶ Undo</button>
      <button className="topbar-btn" onClick={redo} disabled={!future.length}>↷ Redo</button>
      <div className="topbar-spacer" />
      <button className="topbar-btn" onClick={onSaveProject} title="Download .axiom.json">Save project</button>
      <button className="topbar-btn" onClick={onLoadClick} title="Load .axiom.json or .user.js">Load…</button>
      <button className="topbar-btn primary" onClick={onExport} title="Export axiom.user.js">Export userscript</button>
      <button className="topbar-btn" onClick={() => toggleClaude()}>Claude</button>
      <button className="topbar-btn" onClick={() => toggleSettings(true)}>Settings</button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".axiom.json,application/json,.user.js,application/javascript"
        style={{ display: "none" }}
        onChange={onFileChosen}
      />
      {settingsOpen && <SettingsModal />}
    </header>
  );
}
