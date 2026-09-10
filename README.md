# Auth & Security Reference Tools

Standalone, dependency-light tools built to understand a few
technical patterns before writing production code: a cross-origin
postMessage auth handshake, a local .NET + SQL Server dev environment, the
CSP `frame-ancestors` header-vs-meta-tag behavior, and RS256 JWT minting/
verification. Each is self-contained — no shared code, no monorepo tooling.

This project is intentionally separate from any other repo on this machine.

## Tools

1. **`01-postmessage-sso-demo/`** — host + trusted iframe + untrusted origin,
   demonstrating strict origin checking on both the receiving and sending
   ends of `postMessage`, plus a hidden silent-renewal iframe. Run:
   `node server.mjs`, open http://localhost:4000.

2. **`02-dotnet-sqlserver-starter/`** — docker-compose template: SQL Server
   2022 + Azurite + a minimal .NET Web API with EF Core migrations-on-startup
   and a DevSeed service. Run: `make start` (needs Docker).

3. **`03-csp-frame-ancestors-harness/`** — two pages, one setting
   `frame-ancestors` via a real HTTP header (enforced), one via a `<meta>`
   tag (silently ignored per spec) — side by side in iframes. Run:
   `node server.mjs`, open http://localhost:5000.

4. **`04-jwt-rs256-inspector/`** — zero-dependency CLI to mint and verify
   RS256 JWTs using Node's built-in `crypto`, with a built-in test matrix
   (valid / expired / wrong issuer / wrong audience / replayed jti). Run:
   `node jwt-tool.mjs keygen --out ./keys && node jwt-tool.mjs test --key-dir ./keys`.

Each subdirectory has its own README with full usage.

## Requirements

- Node.js (tools 1, 3, 4 — no npm install needed, all use only built-ins)
- Docker + `make` (tool 2 only)
