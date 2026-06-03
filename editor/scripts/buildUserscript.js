// buildUserscript.js — Generate axiom.user.js from a schema.
//
// Strategy: read the template at D:/axiom/axiom.user.js (which is a
// fully-working hand-written userscript) and replace its embedded
// schema block. Markers `// __AXIOM_SCHEMA_BEGIN__` / `__AXIOM_SCHEMA_END__`
// bracket the literal so the regex is unambiguous.
//
// Used both by Vite's dev middleware (live regen on every GET) and by
// the editor's "Export" feature (write to disk).

import fs from "node:fs";

const SCHEMA_RE =
  /\/\/ __AXIOM_SCHEMA_BEGIN__[\s\S]*?\/\/ __AXIOM_SCHEMA_END__/;

export function buildUserscript({ templatePath, template, schema, version }) {
  const src = template ?? fs.readFileSync(templatePath, "utf8");

  // Allow caller to omit schema — useful if all they want is to bump
  // @version (e.g. dev hot-reload via a monotonic timestamp).
  let next = src;
  if (schema) {
    if (!SCHEMA_RE.test(src)) {
      throw new Error("Template missing __AXIOM_SCHEMA_BEGIN__/_END__ markers");
    }
    const json = JSON.stringify(schema, null, 2)
      // indent the block one level to match the surrounding IIFE
      .replace(/\n/g, "\n  ");
    next = next.replace(
      SCHEMA_RE,
      `// __AXIOM_SCHEMA_BEGIN__\n  const SCHEMA = ${json};\n  // __AXIOM_SCHEMA_END__`
    );
  }

  if (version) {
    next = next.replace(/^(\/\/\s*@version\s+).*$/m, `$1${version}`);
  }

  return next;
}
