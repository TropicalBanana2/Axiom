import React, { useState } from "react";
import { useStore } from "../store.js";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (default — fast)" },
  { id: "claude-opus-4-7",   label: "Opus 4.7 (slower, smarter)" },
];

export default function SettingsModal() {
  const apiKey = useStore((s) => s.apiKey);
  const model = useStore((s) => s.model);
  const setApiKey = useStore((s) => s.setApiKey);
  const setModel = useStore((s) => s.setModel);
  const close = useStore((s) => () => s.toggleSettings(false));

  const [draftKey, setDraftKey] = useState(apiKey);

  function save() {
    setApiKey(draftKey.trim());
    close();
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="iconbtn" onClick={close}>×</button>
        </div>
        <div className="modal-body">
          <div className="privacy-note">
            <strong>Privacy:</strong> Your Anthropic API key is stored only in your browser's
            localStorage and is sent only to <code>api.anthropic.com</code>. Axiom contains no
            analytics, crash reporting, or other phone-home. The only outbound network calls
            are the Claude API requests you initiate.
          </div>
          <div className="form-row" style={{ marginTop: 16 }}>
            <label>API key</label>
            <input
              type="password"
              value={draftKey}
              placeholder="sk-ant-…"
              onChange={(e) => setDraftKey(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="topbar-btn" onClick={close}>Cancel</button>
          <button className="topbar-btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
