import React, { useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useStore } from "../store.js";

// Load the ctx typings into Monaco once.
import typesSrc from "../../shared/types.d.ts?raw";

loader.init().then((monaco) => {
  monaco.languages.typescript.javascriptDefaults.addExtraLib(typesSrc, "ts:filename/axiom-ctx.d.ts");
  // Loose JS for user scripts — we're not running TS, just want autocomplete.
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2022,
    allowNonTsExtensions: true,
    noImplicitAny: false,
    strict: false,
  });
  monaco.editor.defineTheme("axiom-dark", {
    base: "vs-dark", inherit: true,
    rules: [],
    colors: {
      "editor.background":       "#0a0a0b",
      "editor.foreground":       "#e4e4e7",
      "editorLineNumber.foreground": "#5c5c66",
      "editor.selectionBackground":  "#3b82f640",
      "editorCursor.foreground":     "#3b82f6",
      "editor.lineHighlightBackground": "#16161a",
    },
  });
});

export default function ScriptPanel() {
  const scriptId = useStore((s) => s.selectedScriptId);
  const script = useStore((s) => s.schema.scripts[s.selectedScriptId]);
  const upsertScript = useStore((s) => s.upsertScript);
  const deleteScript = useStore((s) => s.deleteScript);
  const debounceRef = useRef(null);

  function onChange(next) {
    // Debounce so each keystroke doesn't snapshot into the history stack.
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      upsertScript(scriptId, { source: next });
    }, 300);
  }

  function onRename(name) {
    upsertScript(scriptId, { name });
  }

  return (
    <section className="script-panel panel">
      <div className="panel-header">
        Script
        {script && (
          <>
            <input
              type="text"
              value={script.name || ""}
              onChange={(e) => onRename(e.target.value)}
              style={{
                marginLeft: 8, background: "transparent", border: "1px solid transparent",
                color: "var(--text-primary)", fontSize: 11, padding: "2px 6px", borderRadius: 4, width: 200,
              }}
              onFocus={(e) => e.target.style.border = "1px solid var(--border-strong)"}
              onBlur={(e) => e.target.style.border = "1px solid transparent"}
            />
          </>
        )}
        <div className="panel-header-spacer" />
        {script && (
          <button className="iconbtn danger" onClick={() => {
            if (confirm(`Delete script ${script.name || script.id}?`)) deleteScript(script.id);
          }} title="Delete script">×</button>
        )}
      </div>
      <div className="panel-body" style={{ position: "relative" }}>
        {script ? (
          <Editor
            language="javascript"
            theme="axiom-dark"
            value={script.source}
            onChange={(v) => onChange(v ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              tabSize: 2,
            }}
            className="monaco-host"
          />
        ) : (
          <div className="empty">
            Select a control bound to a script, or create a new script from the Inspector.
          </div>
        )}
      </div>
    </section>
  );
}
