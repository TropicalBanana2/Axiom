import React, { useEffect, useState } from "react";
import { useStore } from "../store.js";

export default function BottomBar() {
  const schema = useStore((s) => s.schema);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const counts = countNodes(schema);
  const [clients, setClients] = useState(null);

  // Poll the dev server for the count of live userscripts subscribed
  // to /__axiom/events. Cheap (the endpoint just returns Set.size).
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/__axiom/clients", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const j = await res.json();
        if (!cancelled) setClients(j.count);
      } catch {
        if (!cancelled) setClients(null);
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const liveLabel = clients === null
    ? "uiengine: dev server unreachable"
    : clients === 0
      ? "uiengine: no live userscripts"
      : `uiengine: ${clients} live userscript${clients === 1 ? "" : "s"}`;
  const liveClass = clients == null ? "warn" : clients > 0 ? "ok" : "";

  return (
    <footer className="bottombar">
      <span>{counts.tabs} tabs · {counts.sections} sections · {counts.controls} controls · {counts.scripts} scripts</span>
      <span className="bottombar-spacer" />
      <span className={liveClass} title="Userscripts currently receiving live updates over SSE">● {liveLabel}</span>
      <span title="Hot-reload URL">· <code>http://localhost:5173/axiom.user.js</code></span>
      <span>· undo {past} · redo {future}</span>
    </footer>
  );
}

function countNodes(schema) {
  let sections = 0, controls = 0;
  for (const t of schema.tabs) {
    sections += t.sections.length;
    for (const s of t.sections) controls += s.controls.length;
  }
  return { tabs: schema.tabs.length, sections, controls, scripts: Object.keys(schema.scripts).length };
}
