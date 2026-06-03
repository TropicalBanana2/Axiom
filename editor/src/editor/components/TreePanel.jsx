import React from "react";
import { useStore } from "../store.js";

// A simple tree with up/down reorder buttons. HTML5 DnD adds complexity
// that we deliberately defer — buttons cover the same need and ship today.

const TYPE_GLYPH = {
  button: "⬜", toggle: "◐", slider: "≡", input: "ab", number: "#",
  select: "▾", radio: "○", color: "■", keybind: "⌨", text: "T",
};

export default function TreePanel() {
  const schema = useStore((s) => s.schema);
  const selected = useStore((s) => ({
    tab: s.selectedTabId, section: s.selectedSectionId, control: s.selectedControlId,
  }));

  const addTab = useStore((s) => s.addTab);
  const deleteTab = useStore((s) => s.deleteTab);
  const reorderTabs = useStore((s) => s.reorderTabs);

  const addSection = useStore((s) => s.addSection);
  const deleteSection = useStore((s) => s.deleteSection);
  const reorderSections = useStore((s) => s.reorderSections);

  const addControl = useStore((s) => s.addControl);
  const deleteControl = useStore((s) => s.deleteControl);
  const reorderControls = useStore((s) => s.reorderControls);

  const selectTab = useStore((s) => s.selectTab);
  const selectSection = useStore((s) => s.selectSection);
  const selectControl = useStore((s) => s.selectControl);

  function moveInList(list, id, dir) {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(id);
    if (i < 0) return ids;
    const j = i + dir;
    if (j < 0 || j >= ids.length) return ids;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return ids;
  }

  return (
    <aside className="tree panel">
      <div className="panel-header">
        Tree
        <div className="panel-header-spacer" />
        <button className="iconbtn" onClick={() => addTab()} title="Add tab">+ tab</button>
      </div>
      <div className="panel-body">
        {schema.tabs.map((tab) => (
          <React.Fragment key={tab.id}>
            <div
              className={"tree-node" + (selected.tab === tab.id && !selected.section ? " selected" : "")}
              onClick={() => selectTab(tab.id)}
            >
              <span className="twist">▾</span>
              <span className="type-icon">▦</span>
              <span className="label">{tab.name}</span>
              <span className="row-actions">
                <button className="iconbtn" title="Move up" onClick={(e) => {
                  e.stopPropagation();
                  reorderTabs(moveInList(schema.tabs, tab.id, -1));
                }}>↑</button>
                <button className="iconbtn" title="Move down" onClick={(e) => {
                  e.stopPropagation();
                  reorderTabs(moveInList(schema.tabs, tab.id, +1));
                }}>↓</button>
                <button className="iconbtn" title="Add section" onClick={(e) => {
                  e.stopPropagation();
                  addSection(tab.id);
                }}>+</button>
                <button className="iconbtn danger" title="Delete tab" onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete tab "${tab.name}"?`)) deleteTab(tab.id);
                }}>×</button>
              </span>
            </div>
            <div className="tree-section-list">
              {tab.sections.map((sec) => (
                <React.Fragment key={sec.id}>
                  <div
                    className={"tree-node" + (selected.section === sec.id && !selected.control ? " selected" : "")}
                    onClick={() => selectSection(tab.id, sec.id)}
                  >
                    <span className="twist">▾</span>
                    <span className="type-icon">§</span>
                    <span className="label">{sec.name}</span>
                    <span className="row-actions">
                      <button className="iconbtn" title="Move up" onClick={(e) => {
                        e.stopPropagation();
                        reorderSections(tab.id, moveInList(tab.sections, sec.id, -1));
                      }}>↑</button>
                      <button className="iconbtn" title="Move down" onClick={(e) => {
                        e.stopPropagation();
                        reorderSections(tab.id, moveInList(tab.sections, sec.id, +1));
                      }}>↓</button>
                      <button className="iconbtn" title="Add control" onClick={(e) => {
                        e.stopPropagation();
                        addControl(tab.id, sec.id, { type: "button", label: "New button" });
                      }}>+</button>
                      <button className="iconbtn danger" title="Delete section" onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete section "${sec.name}"?`)) deleteSection(tab.id, sec.id);
                      }}>×</button>
                    </span>
                  </div>
                  <div className="tree-control-list">
                    {sec.controls.map((c) => (
                      <div
                        key={c.id}
                        className={"tree-node" + (selected.control === c.id ? " selected" : "")}
                        onClick={() => selectControl(tab.id, sec.id, c.id)}
                      >
                        <span className="twist" />
                        <span className="type-icon" title={c.type}>{TYPE_GLYPH[c.type] || "·"}</span>
                        <span className="label">{c.label || c.id}</span>
                        <span className="row-actions">
                          <button className="iconbtn" title="Move up" onClick={(e) => {
                            e.stopPropagation();
                            reorderControls(tab.id, sec.id, moveInList(sec.controls, c.id, -1));
                          }}>↑</button>
                          <button className="iconbtn" title="Move down" onClick={(e) => {
                            e.stopPropagation();
                            reorderControls(tab.id, sec.id, moveInList(sec.controls, c.id, +1));
                          }}>↓</button>
                          <button className="iconbtn danger" title="Delete control" onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete control "${c.label || c.id}"?`)) deleteControl(c.id);
                          }}>×</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </aside>
  );
}
