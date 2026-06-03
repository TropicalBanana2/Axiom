// importUserscript.js — pull a schema back out of an exported
// axiom.user.js, and load .axiom.json project files.
//
// The userscript embeds the schema between the markers
//   `// __AXIOM_SCHEMA_BEGIN__`   ...   `// __AXIOM_SCHEMA_END__`
// We extract that, evaluate the literal in a sandboxed Function so we
// don't depend on it being JSON-strict (the hand-written template uses
// JS object-literal syntax with quoted keys, which IS valid JSON, but
// we tolerate either form).

import { migrate } from "../shared/migrate.js";
import { SchemaError } from "../shared/schema.js";

const MARKER_RE =
  /\/\/\s*__AXIOM_SCHEMA_BEGIN__[\s\S]*?const\s+SCHEMA\s*=\s*([\s\S]*?);\s*\/\/\s*__AXIOM_SCHEMA_END__/;

export function importFromUserscript(text) {
  const m = text.match(MARKER_RE);
  if (!m) throw new SchemaError("This file does not look like an axiom.user.js (no schema markers).");
  let schema;
  try {
    // The literal is a JS object — evaluate it in an isolated Function
    // returning the value. This is the editor's own origin and the user
    // chose the file, so eval is acceptable here.
    schema = new Function(`return (${m[1]});`)();
  } catch (err) {
    throw new SchemaError(`Failed to parse embedded schema: ${err.message}`);
  }
  return migrate(schema);
}

export function importFromProject(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (err) { throw new SchemaError(`Invalid .axiom.json: ${err.message}`); }
  return migrate(parsed);
}
