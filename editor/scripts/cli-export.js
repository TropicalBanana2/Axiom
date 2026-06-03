#!/usr/bin/env node
// cli-export.js — generate D:/axiom/axiom.user.js from a schema file.
//
//   node scripts/cli-export.js                    # uses .axiom-dev.json
//   node scripts/cli-export.js path/to/schema.json
//   node scripts/cli-export.js --schema path/to/schema.json --out path/to/out.user.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildUserscript } from "./buildUserscript.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const schemaPath = flag("--schema", args[0]) ||
  path.join(__dirname, "..", ".axiom-dev.json");
const outPath = flag("--out", null) ||
  path.join(__dirname, "..", "..", "axiom.user.js");
const templatePath = path.join(__dirname, "..", "..", "axiom.user.js");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const out = buildUserscript({ templatePath, schema });
fs.writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${out.length} bytes) with schema from ${schemaPath}`);
