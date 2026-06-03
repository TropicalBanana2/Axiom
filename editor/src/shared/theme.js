// theme.js — Single source of truth for Axiom's visual style.
// All colors live here as CSS custom properties; nothing is hardcoded
// in components. Swap the palette by editing this file.
//
// Two consumers:
//   - Axiom's custom shell (CSS variables under :root or .axiom-root)
//   - ZOUI components (we pass a derived theme object to ZOUI.registerTheme)

export const AXIOM_PALETTE = {
  // Surfaces
  bgPrimary:   "#0a0a0b",   // app / page backdrop
  bgPanel:     "#16161a",   // tab + section surfaces
  bgElevated:  "#1c1c21",   // inputs, hover, console
  bgSearch:    "#101013",
  bgRow:       "rgba(255,255,255,0.02)",
  bgRowHover:  "rgba(255,255,255,0.04)",

  // Borders / dividers
  border:        "#26262c",
  borderStrong:  "#33333a",
  divider:       "rgba(255,255,255,0.06)",

  // Text
  textPrimary: "#e4e4e7",
  textMuted:   "#8b8b94",
  textDim:     "#5c5c66",

  // Accent — Framer-blue
  accent:       "#3b82f6",
  accentHover:  "#60a5fa",
  accentMuted:  "rgba(59,130,246,0.12)",
  accentMuted2: "rgba(59,130,246,0.22)",
  accentText:   "#93c5fd",
  accentGlow:   "rgba(59,130,246,0.35)",
  accentOn:     "#ffffff",  // text color on top of the accent fill

  // Semantic
  success: "#22c55e",
  warning: "#f59e0b",
  error:   "#ef4444",

  // Shape
  radius:   "6px",
  radiusLg: "10px",
  shadow:   "0 12px 40px rgba(0,0,0,0.55)",

  // Switch (used by ZOUI toggles)
  switchOff: "#3a3a42",
  switchOn:  "#3b82f6",
  track:     "#2a2a30",
};

// Axiom's own CSS custom properties — used by the custom shell.
// Generated string can be injected into a <style> tag.
export function axiomCssVars(p = AXIOM_PALETTE) {
  return `
:root, .axiom-root {
  --bg-primary:   ${p.bgPrimary};
  --bg-panel:     ${p.bgPanel};
  --bg-elevated:  ${p.bgElevated};
  --bg-search:    ${p.bgSearch};
  --bg-row:       ${p.bgRow};
  --bg-row-hover: ${p.bgRowHover};
  --border:        ${p.border};
  --border-strong: ${p.borderStrong};
  --divider:       ${p.divider};
  --text-primary: ${p.textPrimary};
  --text-muted:   ${p.textMuted};
  --text-dim:     ${p.textDim};
  --accent:        ${p.accent};
  --accent-hover:  ${p.accentHover};
  --accent-muted:  ${p.accentMuted};
  --accent-muted-2:${p.accentMuted2};
  --accent-text:   ${p.accentText};
  --accent-glow:   ${p.accentGlow};
  --accent-on:     ${p.accentOn};
  --success: ${p.success};
  --warning: ${p.warning};
  --error:   ${p.error};
  --radius:    ${p.radius};
  --radius-lg: ${p.radiusLg};
  --shadow:    ${p.shadow};
}`.trim();
}

// Derived ZOUI theme object — passes Axiom's palette through to
// ZOUI's 28 named fields. We re-use Axiom's palette so any tweak
// in AXIOM_PALETTE propagates to both shells.
export function axiomZouiTheme(p = AXIOM_PALETTE) {
  return {
    shadow:       p.shadow,
    bg:           p.bgPanel,
    bgHeader:     p.bgPrimary,
    bgSearch:     p.bgSearch,
    bgInput:      p.bgElevated,
    bgRow:        p.bgRow,
    bgRowHover:   p.bgRowHover,
    bgTabHover:   "rgba(255,255,255,0.04)",
    border:       p.border,
    borderStrong: p.borderStrong,
    divider:      p.divider,
    accent:       p.accent,
    accentHover:  p.accentHover,
    accentMuted:  p.accentMuted,
    accentMuted2: p.accentMuted2,
    accentText:   p.accentText,
    accentGlow:   p.accentGlow,
    text1:        p.textPrimary,
    text2:        p.textMuted,
    text3:        p.textDim,
    textOnAccent: p.accentOn,
    success:      p.success,
    warning:      p.warning,
    error:        p.error,
    switchOff:    p.switchOff,
    switchOn:     p.switchOn,
    track:        p.track,
    radius:       p.radius,
    radiusLg:     p.radiusLg,
  };
}

export const AXIOM_THEME_NAME = "axiom-dark";
