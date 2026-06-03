// migrate.js — Schema migration hook.
//
// Each entry takes a schema at version N and returns one at version N+1.
// Adding `migrations[1] = (s) => ({ ...s, schemaVersion: 2 })` is enough
// to start supporting v2 imports without breaking older files.

import { CURRENT_SCHEMA_VERSION, SchemaError, validate } from "./schema.js";

const migrations = {
  // 0: (s) => ({ ...s, schemaVersion: 1, /* transforms */ }),
};

export function migrate(schema) {
  if (!schema || typeof schema.schemaVersion !== "number") {
    throw new SchemaError("Missing schemaVersion");
  }
  let v = schema.schemaVersion;

  if (v > CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      `Schema v${v} is newer than this build (v${CURRENT_SCHEMA_VERSION}). ` +
      `Update Axiom or downgrade the file.`
    );
  }

  while (v < CURRENT_SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) {
      throw new SchemaError(
        `No migration available from schema v${v} → v${v + 1}. ` +
        `This file is from an unsupported older version — refusing to import.`
      );
    }
    schema = step(schema);
    v = schema.schemaVersion;
  }

  return validate(schema);
}
