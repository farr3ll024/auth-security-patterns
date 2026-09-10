// Serves three separate local "origins" (different ports) so the browser
// treats them as genuinely cross-origin, which is what makes the postMessage
// origin-checking demo meaningful:
//   http://localhost:4000  -> host app (the "portal")
//   http://localhost:4001  -> trusted iframe app (the "auth" origin)
//   http://localhost:4002  -> untrusted "attacker" origin
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function serve(rootDir, port, label) {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = req.url === "/" ? "/index.html" : req.url;
      const filePath = path.join(rootDir, decodeURIComponent(urlPath.split("?")[0]));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  server.listen(port, () => {
    console.log(`[${label}] http://localhost:${port}`);
  });
}

serve(path.join(__dirname, "public-host"), 4000, "host (portal)");
serve(path.join(__dirname, "public-iframe"), 4001, "trusted iframe (auth)");
serve(path.join(__dirname, "public-attacker"), 4002, "attacker (untrusted)");

console.log("\nOpen http://localhost:4000 to run the demo.\n");
