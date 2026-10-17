// Tiny local web server for rumi-pulp. No installs needed: run `node serve.js`.
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4321;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, text, extra) {
  res.writeHead(status, Object.assign({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, extra));
  res.end(text);
}

// Only answer requests addressed to this computer (blocks DNS-rebinding from other websites).
const ALLOWED_HOSTS = [`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`];

const server = http.createServer((req, res) => {
  if (!ALLOWED_HOSTS.includes(req.headers.host)) return send(res, 403, "Forbidden");
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    return send(res, 400, "Bad request");
  }
  if (pathname.indexOf("\0") >= 0) return send(res, 400, "Bad request");
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.resolve(ROOT, "." + pathname);
  const inside = file === ROOT || file.startsWith(ROOT + path.sep);
  const hidden = path.relative(ROOT, file).split(path.sep).some((part) => part.startsWith("."));
  if (!inside || hidden) return send(res, 404, "Not found");

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not found");
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": "no-store" });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. The site may already be running at http://localhost:${PORT}`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`rumi-pulp running at http://localhost:${PORT}  —  write at http://localhost:${PORT}/write.html`);
});
