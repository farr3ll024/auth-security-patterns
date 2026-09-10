# CLAUDE.md

Guidance for Claude Code (or any future session) working in this repository.

## What this is

A standalone collection of personal reference implementations of common
auth/web-security patterns — built to understand the mechanics before
writing production code, not to run as a product. Each subdirectory is
fully self-contained: no shared code, no monorepo tooling, no root
package.json. Treat each one as its own project when working in it — see
its own `CLAUDE.md` for specifics.

This repo has no relationship to any other project on this machine. Don't
pull in patterns, names, or conventions from elsewhere; nothing here should
ever reference an employer, an internal ticket/ADR system, or real
colleague names — keep it generic and public-shareable.

## Tools

| Dir | What it is | Run | Deps |
|---|---|---|---|
| `01-postmessage-sso-demo/` | Cross-origin iframe `postMessage` auth handshake, silent renewal, and two failure modes (rejected forgery, silently-dropped typo) | `node server.mjs` → http://localhost:4000 | none (node:http only) |
| `02-dotnet-sqlserver-starter/` | docker-compose template: SQL Server 2022 + Azurite + .NET Web API with EF migrations-on-startup + DevSeed | `make start` (needs Docker) | Docker, .NET SDK (only for regenerating migrations) |
| `03-csp-frame-ancestors-harness/` | CSP `frame-ancestors` header vs. `<meta>` tag vs. legacy `X-Frame-Options`, plus live violation reporting | `node server.mjs` → http://localhost:5000 | none (node:http only) |
| `04-jwt-rs256-inspector/` | Zero-dep RS256 JWT mint/verify CLI, `kid`-based key rotation, alg-confusion attack test cases | `node jwt-tool.mjs <cmd>` | none (node:crypto only) |

## Conventions

- **Prefer zero dependencies.** Tools 1, 3, and 4 deliberately use only
  Node built-ins (`node:http`, `node:crypto`) so they run with nothing but
  `node <file>` — no `npm install`, no lockfile to maintain. Keep new tools
  in this style unless there's a specific reason (e.g. tool 2 genuinely
  needs Docker + .NET).
- **Each demo should fail loudly and visibly, not just succeed.** The
  existing tools all pair a "this works" case with at least one "this is
  the bug/attack it defends against" case (rejected forged postMessage,
  meta-tag CSP being ignored, alg:none/key-confusion JWT forgery). New
  tools should follow the same shape — the point is understanding the
  failure mode, not just a happy-path demo.
- **No enterprise/internal references.** No ticket IDs, ADR numbers,
  internal doc citations, or real names. Generic domains only
  (`portal.example.com`, `api.example.com`, etc.).
- This environment has no .NET SDK and no Docker — tool 2's C#/EF changes
  can't be compiled or run here. Its `Migrations/` files were hand-authored
  to match what `dotnet ef migrations add` would produce; flag this
  explicitly if you touch them, and tell the user to verify with
  `dotnet ef migrations has-pending-model-changes` once they have the SDK.
