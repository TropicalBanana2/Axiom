// db.js — SQLite persistence layer.
//
// Tables:
//   users         (id, username, password_hash, created_at)
//   sessions      (id, user_id, label, server_id, player_name, psk,
//                  created_at, last_seen_at, status)
//   server_flags  (user_id, server_id, flag, value)
//   party_keys    (user_id, server_id, psk)
//   schema        (singleton row holding the active Axiom UI schema)
//
// We use better-sqlite3 because it's synchronous and tiny. Migrations
// are inline — schema version stored in PRAGMA user_version.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "axiom.db");
const SCHEMA_VERSION = 1;

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir();

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function migrate() {
  const current = db.pragma("user_version", { simple: true });
  if (current >= SCHEMA_VERSION) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      server_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      psk TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      status TEXT NOT NULL DEFAULT 'idle'
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS server_flags (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL,
      flag TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, server_id, flag)
    );

    CREATE TABLE IF NOT EXISTS party_keys (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL,
      psk TEXT NOT NULL,
      PRIMARY KEY (user_id, server_id, psk)
    );

    CREATE TABLE IF NOT EXISTS schema_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

migrate();

// ----- user helpers ---------------------------------------------------
const stmts = {
  insertUser: db.prepare(
    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)"
  ),
  findUserByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),

  insertSession: db.prepare(
    "INSERT INTO sessions (user_id, label, server_id, player_name, psk, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  updateSessionLabel: db.prepare("UPDATE sessions SET label = ? WHERE id = ?"),
  updateSessionStatus: db.prepare(
    "UPDATE sessions SET status = ?, last_seen_at = ? WHERE id = ?"
  ),
  deleteSession: db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?"),
  listSessions: db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC"
  ),
  // Used at axiom-sessions startup to re-spawn every persisted bot
  // that wasn't explicitly closed by the user.
  listActiveSessions: db.prepare(
    "SELECT * FROM sessions WHERE status != 'closed' ORDER BY created_at ASC"
  ),
  findSession: db.prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?"),

  getFlag: db.prepare(
    "SELECT value FROM server_flags WHERE user_id = ? AND server_id = ? AND flag = ?"
  ),
  setFlag: db.prepare(
    "INSERT INTO server_flags (user_id, server_id, flag, value) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, server_id, flag) DO UPDATE SET value = excluded.value"
  ),
  listFlags: db.prepare(
    "SELECT server_id, flag, value FROM server_flags WHERE user_id = ?"
  ),

  addKey: db.prepare(
    "INSERT OR IGNORE INTO party_keys (user_id, server_id, psk) VALUES (?, ?, ?)"
  ),
  removeKey: db.prepare(
    "DELETE FROM party_keys WHERE user_id = ? AND server_id = ? AND psk = ?"
  ),
  listKeys: db.prepare(
    "SELECT server_id, psk FROM party_keys WHERE user_id = ?"
  ),

  getKv: db.prepare("SELECT value FROM schema_kv WHERE key = ?"),
  setKv: db.prepare(
    "INSERT INTO schema_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ),
};

module.exports = {
  db,
  stmts,
  // Tiny convenience wrappers — keep call sites readable.
  schemaGet(key) {
    const row = stmts.getKv.get(key);
    return row ? JSON.parse(row.value) : null;
  },
  schemaSet(key, value) {
    stmts.setKv.run(key, JSON.stringify(value));
  },
};

if (require.main === module) {
  if (process.argv.includes("--reset")) {
    db.close();
    fs.unlinkSync(DB_PATH);
    console.log("Database reset.");
  } else {
    console.log("DB schema_version:", db.pragma("user_version", { simple: true }));
  }
}
