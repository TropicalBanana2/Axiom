import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store.js";
import { runAgentTurn } from "../claude.js";
import DiffModal from "./DiffModal.jsx";

// Claude chat panel. Messages are kept in component state — they're a
// session detail, not a persistent part of the project.

export default function ClaudeChat() {
  const apiKey = useStore((s) => s.apiKey);
  const model = useStore((s) => s.model);
  const schema = useStore((s) => s.schema);
  const setDiffPending = useStore((s) => s.setDiffPending);
  const diffPending = useStore((s) => s.diffPending);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const toggleClaude = useStore((s) => s.toggleClaude);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState([]);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, streamToolCalls]);

  async function send() {
    if (!input.trim() || streaming) return;
    if (!apiKey) {
      toggleSettings(true);
      return;
    }
    const userMsg = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setStreamToolCalls([]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await runAgentTurn({
        apiKey, model, schema, signal: controller.signal,
        // Claude expects the Messages API format — pass through.
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        onText:    (delta) => setStreamText((t) => t + delta),
        onToolStart: (block) => setStreamToolCalls((c) => [...c, { id: block.id, name: block.name, input: {} }]),
        onToolEnd:   (block, opResult) => setStreamToolCalls((c) =>
          c.map((x) => x.id === block.id ? { ...x, input: block.input, result: opResult } : x)),
      });

      const assistantContent = renderAssistantBubble(result.text, result.ops);
      setMessages((m) => [...m, { role: "assistant", content: assistantContent, ops: result.ops }]);

      // Stage the diff. The user accepts or rejects from the modal.
      if (result.ops.length > 0) {
        setDiffPending({
          ops: result.ops,
          original: schema,
          working: result.workingSchema,
        });
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${err.message}`, error: true }]);
    } finally {
      setStreaming(false);
      setStreamText("");
      setStreamToolCalls([]);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
    <aside className="claude">
      <div className="panel-header">
        Claude
        <div className="panel-header-spacer" />
        <span className="topbar-meta">{model}</span>
        <button className="iconbtn" onClick={() => toggleClaude(false)}>×</button>
      </div>
      <div className="messages">
        {messages.length === 0 && !streaming && (
          <div className="empty-state">
            Describe a change. For example:<br/>
            <em>"Add a Combat tab with toggles for Auto-Attack and Auto-Heal."</em>
          </div>
        )}
        {messages.map((m, i) => (
          <div className={"msg " + m.role} key={i}>
            <div className="role">{m.role}{m.error ? " · error" : ""}</div>
            <div className="body">{m.content || (m.role === "assistant" ? "(tool calls only)" : "")}</div>
            {m.ops?.length ? (
              <div>
                {m.ops.map((op) => (
                  <div className="tool-call" key={op.id}>
                    {op.name}({short(op.input)}){op.result?.ok === false ? ` — failed: ${op.result.error}` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {streaming && (
          <div className="msg assistant">
            <div className="role">assistant · streaming…</div>
            <div className="body">{streamText || "…"}</div>
            {streamToolCalls.map((op) => (
              <div className="tool-call" key={op.id}>
                {op.name}({short(op.input)}){op.result?.ok === false ? ` — failed: ${op.result.error}` : ""}
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-row">
        <textarea
          value={input}
          placeholder={apiKey ? "Describe a change… (Enter to send, Shift+Enter for newline)" : "Set your API key in Settings first."}
          onKeyDown={onKey}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
        />
        {streaming
          ? <button className="topbar-btn" onClick={cancel}>Cancel</button>
          : <button className="topbar-btn primary" onClick={send} disabled={!input.trim()}>Send</button>}
      </div>
    </aside>
    {diffPending && <DiffModal />}
    </>
  );
}

function renderAssistantBubble(text, ops) {
  if (text) return text;
  if (ops?.length) return `Proposed ${ops.length} change${ops.length === 1 ? "" : "s"}.`;
  return "";
}

function short(obj) {
  try {
    const s = JSON.stringify(obj);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  } catch { return ""; }
}
