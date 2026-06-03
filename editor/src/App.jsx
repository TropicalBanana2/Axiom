import React, { useEffect } from "react";
import { useStore } from "./editor/store.js";
import TopBar from "./editor/components/TopBar.jsx";
import TreePanel from "./editor/components/TreePanel.jsx";
import Canvas from "./editor/components/Canvas.jsx";
import Inspector from "./editor/components/Inspector.jsx";
import ScriptPanel from "./editor/components/ScriptPanel.jsx";
import ClaudeChat from "./editor/components/ClaudeChat.jsx";
import BottomBar from "./editor/components/BottomBar.jsx";

export default function App() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const claudeOpen = useStore((s) => s.claudeOpen);
  const pushDevSchema = useStore((s) => s.pushDevSchema);
  const schema = useStore((s) => s.schema);

  // Global undo/redo shortcut
  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Push current schema to dev server so /axiom.user.js stays fresh.
  useEffect(() => {
    pushDevSchema();
  }, [schema, pushDevSchema]);

  return (
    <div className="app">
      <TopBar />
      <div className={"app-body" + (claudeOpen ? " claude-open" : "")}>
        <TreePanel />
        <div className="app-center">
          <Canvas />
          <ScriptPanel />
        </div>
        <Inspector />
        {claudeOpen && <ClaudeChat />}
      </div>
      <BottomBar />
    </div>
  );
}
