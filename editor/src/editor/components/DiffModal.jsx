import React, { useState } from "react";
import { useStore } from "../store.js";
import { applyTool } from "../claude.js";

// Diff modal — shows Claude's pending tool calls. Per-edit accept is
// supported by replaying the accepted subset against the ORIGINAL
// schema in order, which gives us a deterministic result.

export default function DiffModal() {
  const diff = useStore((s) => s.diffPending);
  const setDiff = useStore((s) => s.setDiffPending);
  const applySchema = useStore((s) => s.replaceSchema);

  // Track per-op accept state. Default: accept all (the common case).
  const [accepted, setAccepted] = useState(() =>
    Object.fromEntries(diff.ops.map((op) => [op.id, op.result?.ok !== false])));

  function close() { setDiff(null); }

  function applyAll() {
    applySchema(diff.working);
    close();
  }

  function applySelected() {
    let working = diff.original;
    for (const op of diff.ops) {
      if (!accepted[op.id]) continue;
      try { working = applyTool(working, op.name, op.input); }
      catch (err) {
        // If a downstream op depended on a rejected upstream op, it'll
        // fail. Surface this rather than silently dropping it.
        alert(`Could not apply ${op.name}: ${err.message}\n\n` +
              `This usually means it depends on an earlier change you rejected.`);
        return;
      }
    }
    applySchema(working);
    close();
  }

  function rejectAll() {
    close();
  }

  const allAccepted = diff.ops.every((op) => accepted[op.id]);

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h3>Pending changes ({diff.ops.length})</h3>
          <button className="iconbtn" onClick={close}>×</button>
        </div>
        <div className="modal-body">
          <div className="privacy-note" style={{ marginBottom: 12 }}>
            These changes will be applied as a single undo step. Toggle individual edits to
            partially accept; downstream ops may fail if you reject something they depend on.
          </div>
          {diff.ops.map((op) => {
            const isAccepted = accepted[op.id];
            const failed = op.result?.ok === false;
            return (
              <div className={`diff-item ${failed ? "rejected" : ""}`} key={op.id}>
                <div className="diff-item-header">
                  <input
                    type="checkbox"
                    checked={isAccepted}
                    disabled={failed}
                    onChange={(e) => setAccepted((a) => ({ ...a, [op.id]: e.target.checked }))}
                  />
                  <span className="diff-item-tool">{op.name}</span>
                  {failed && <span className="topbar-meta">failed: {op.result.error}</span>}
                </div>
                <div className="diff-item-body">{JSON.stringify(op.input, null, 2)}</div>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="topbar-btn" onClick={rejectAll}>Reject all</button>
          {allAccepted
            ? <button className="topbar-btn primary" onClick={applyAll}>Accept all</button>
            : <button className="topbar-btn primary" onClick={applySelected}>Apply selected</button>}
        </div>
      </div>
    </div>
  );
}
