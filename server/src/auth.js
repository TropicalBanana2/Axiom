// auth.js — JWT-based per-user authentication.
//
// Banshee had a single shared salt for every user. Axiom uses a JWT
// per user — that means multiple humans can run their own session
// pools on the same self-hosted instance without clobbering each
// other.
//
// Secret lives on disk so JWTs survive process restarts. Generated
// once on first boot.
//
// For local single-user setups, this is still simple: there's a
// default "admin" account, and the first time you log in you set its
// password.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { stmts } = require("./db");

const SECRET_PATH = path.join(__dirname, "..", "data", "jwt.secret");

function loadSecret() {
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH, "utf8");
  }
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
  console.log("[auth] generated new JWT secret");
  return secret;
}

const SECRET = loadSecret();

function hashPassword(password, salt = null) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(password, s, 64).toString("hex");
  return `${s}:${h}`;
}

function verifyPassword(password, stored) {
  const [s, expectedHex] = stored.split(":");
  if (!s || !expectedHex) return false;
  const h = crypto.scryptSync(password, s, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(expectedHex, "hex"));
}

function issueToken(userId, username) {
  return jwt.sign({ uid: userId, u: username }, SECRET, {
    expiresIn: "30d",
    issuer: "axiom",
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET, { issuer: "axiom" });
  } catch {
    return null;
  }
}

// Local-user helpers — usable from REPL or wire handlers.
function registerUser(username, password) {
  if (stmts.findUserByUsername.get(username)) {
    throw new Error("Username already taken");
  }
  const result = stmts.insertUser.run(username, hashPassword(password), Date.now());
  return result.lastInsertRowid;
}

function login(username, password) {
  const user = stmts.findUserByUsername.get(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return { user, token: issueToken(user.id, user.username) };
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  registerUser,
  login,
};
