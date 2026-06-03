import React, { useEffect, useRef } from "react";
import { useStore } from "../store.js";

// Canvas — live preview of the userscript shell rendered into an iframe.
//
// We use an iframe so ZOUI's global styles + IDs (which it injects into
// document.head as singletons) don't collide with the editor's own
// chrome. The iframe is sandboxed only with `allow-scripts` + same-origin
// so ZOUI's CacheStorage usage works.
//
// On schema change we postMessage the new schema to the iframe and let
// it re-render. The preview document loads zoui.js + a small inline
// renderer derived from the shared modules.

export default function Canvas() {
  const schema = useStore((s) => s.schema);
  const iframeRef = useRef(null);

  // First mount: write the document with our preview bootstrap.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = previewHtml();
  }, []);

  // Schema → iframe sync.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    function send() {
      try { iframe.contentWindow?.postMessage({ type: "axiom:schema", schema }, "*"); }
      catch { /* ignore */ }
    }
    // The iframe pings ready when its bootstrap is set up.
    function onReady(e) {
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.type === "axiom:ready") send();
    }
    window.addEventListener("message", onReady);
    send();
    return () => window.removeEventListener("message", onReady);
  }, [schema]);

  return (
    <section className="canvas panel">
      <div className="panel-header">
        Preview
        <div className="panel-header-spacer" />
        <span className="topbar-meta">live</span>
      </div>
      <iframe
        ref={iframeRef}
        title="Axiom preview"
        sandbox="allow-scripts allow-same-origin"
      />
    </section>
  );
}

// Inline preview document. Loads zoui.js from the dev server's public
// dir, then a small bootstrap that listens for schema messages and runs
// the shared modules. The modules are dynamically imported from the
// dev server so the SAME files power both editor and userscript.
function previewHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>html,body{margin:0;height:100%;background:#0a0a0b;font-family:-apple-system,"Segoe UI","Inter",sans-serif;}</style>
</head>
<body>
<div id="axiom-host" style="position:fixed;inset:0;"></div>
<script src="/zoui.js"></script>
<script type="module">
  // Import shared modules from the dev server — same files the
  // userscript export concatenates.
  const [theme, schemaMod, scriptHostMod, rendererMod, shellMod] = await Promise.all([
    import("/src/shared/theme.js"),
    import("/src/shared/schema.js"),
    import("/src/shared/scriptHost.js"),
    import("/src/shared/renderer.js"),
    import("/src/shared/shell.js"),
  ]);

  let current = null;

  function render(schema) {
    if (current) try { current.shell.destroy(); } catch (_) {}
    const host = document.getElementById("axiom-host");
    host.innerHTML = "";
    const shell = shellMod.buildShell({ container: host, ZOUI: window.ZOUI, schema });
    const axiom = {
      schema, ui: shell.ui, cache: shell.ui._cache, console: shell.console,
      values: {}, controlUpdaters: new Map(), tabIds: new Map(),
    };
    const scriptHost = scriptHostMod.createScriptHost({ ui: shell.ui, axiom, schema });
    rendererMod.renderSchema({ ui: shell.ui, axiom, schema, scriptHost });
    current = { shell, axiom, scriptHost };
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "axiom:schema") {
      try { render(e.data.schema); } catch (err) {
        document.getElementById("axiom-host").innerHTML =
          '<pre style="color:#ef4444;padding:16px;white-space:pre-wrap;">Preview failed: ' + (err && err.message || err) + '</pre>';
      }
    }
  });
  parent.postMessage({ type: "axiom:ready" }, "*");
</script>
</body></html>`;
}
