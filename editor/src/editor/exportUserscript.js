// exportUserscript.js — fetch the dev server's generated userscript
// for the current schema. We delegate generation to the server so the
// template + transform logic stays in one place (Vite middleware +
// scripts/buildUserscript.js).

export async function exportUserscript(schema) {
  // Push latest schema then fetch the generated file.
  await fetch("/__axiom/dev-schema", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema),
  });
  const res = await fetch("/axiom.user.js", { cache: "no-store" });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return await res.text();
}

export function downloadFile(name, contents, mime = "text/plain") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}
