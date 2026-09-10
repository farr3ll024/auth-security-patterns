# CLAUDE.md — postMessage SSO demo

## What this is

Reference implementation of a cross-origin iframe auth handshake using
`window.postMessage`. Three Node static servers on different ports stand in
for three real origins (browsers scope `postMessage` origin-checking by
scheme+host+port, so different ports are enough locally — same-port pages
would be same-origin and prove nothing).

## Run

```bash
node server.mjs
```
http://localhost:4000 (host/portal) — the only page you open manually.
Also spins up http://localhost:4001 (trusted iframe origin) and
http://localhost:4002 (untrusted/"attacker" origin), both loaded via iframe
or popup from the host page, not visited directly.

No dependencies — plain `node:http`.

## Files

- `server.mjs` — serves the three origins on three ports.
- `public-host/index.html` — the host/portal page and all four demo buttons.
- `public-iframe/auth.html` — trusted iframe: validates `event.origin`, acks.
- `public-iframe/silent-renew.html` — hidden iframe, silent `prompt=none` renewal.
- `public-attacker/attack.html` — untrusted origin, tries to forge a message.

## The four demo scenarios (buttons on the host page)

1. Real handshake — host → trusted iframe → ack back. Origin checked both ways.
2. Silent renewal — hidden iframe, no visible UI, mints a renewed token.
3. Forged message from an untrusted origin — rejected by the host's
   `event.origin` whitelist check.
4. **Typo'd `targetOrigin`** — same trusted iframe, but the host's outbound
   `postMessage(..., targetOrigin)` is deliberately wrong. The browser drops
   it silently: no exception, no console warning, nothing. This is the
   opposite failure mode from #3 and the harder one to debug in practice.

## The one invariant every listener here follows

Check `event.origin` against an exact string before trusting `event.data` —
never regex/substring match, never accept `"*"`. And on the way out, always
pass the real target origin as `postMessage`'s second argument, never `"*"`.
Every change to this demo should preserve that pattern; if you add a new
message type or a new origin, make sure both directions still check origin
explicitly rather than relying on message shape/content to decide trust.

## Known limitation

Purely a manual/visual browser demo — no automated test harness (e.g.
Playwright) verifying the accept/reject outcomes. If this gets extended
significantly, adding one would catch regressions the eyeball test won't.
