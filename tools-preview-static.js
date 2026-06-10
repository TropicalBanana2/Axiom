// Dev-only static server for previewing the public/ UI without booting
// the full axiom backend (whose ports are held by the prod instance).
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "server", "public");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm" };
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  if (p === "/app") p = "/app.html";
  if (p === "/play") p = "/client.html";
  if (p.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(5198, () => console.log("static preview on :5198"));
