# postMessage SSO demo

Reference implementation of a cross-origin iframe auth handshake using
`window.postMessage`, plus the silent-renewal ("prompt=none") pattern, a
demo of what happens when an untrusted origin tries to forge a message, and
a demo of the opposite mistake — a misconfigured `targetOrigin` that fails
completely silently.

## Run

```bash
node server.mjs
```

Then open http://localhost:4000 and click through the four buttons in order:

1. **Run auth handshake** — host loads the trusted iframe (`localhost:4001`),
   sends a token via `postMessage`, the iframe validates `event.origin`,
   "authenticates", and posts a completion ack back.
2. **Trigger silent renewal** — loads a hidden iframe that simulates a
   session-cookie check on the auth origin and silently mints a renewed
   token with no visible UI (no login flash).
3. **Simulate message from untrusted origin** — opens a popup on
   `localhost:4002` (a different origin, standing in for an attacker-controlled
   page) that tries to post a forged `auth-complete` message straight at the
   host window. The host's origin whitelist check rejects it — watch the log.
4. **Misconfigured targetOrigin** — same trusted iframe, same real token, but
   `postMessage`'s second argument is deliberately typo'd to the wrong
   origin. The browser refuses delivery because `targetOrigin` must match the
   target window's actual origin — but unlike the origin-check rejection
   above, this fails with **no event, no exception, no console warning**.
   The log times out after 2s with nothing to show for it. This is the
   opposite failure mode from #3, and in practice the harder one to debug.

## What this demonstrates

- **Origin checking is the entire security model.** Every listener in this
  demo checks `event.origin` against an explicit string before trusting
  `event.data` at all — never regex/substring matching, never `*`.
- **`targetOrigin` matters on the way out too** — the host never posts to
  `"*"`; it posts to the exact trusted origin so a navigated/hijacked iframe
  can't receive a live token.
- **Silent renewal** — a hidden iframe with no user-visible chrome does the
  "is there still a session here" check, the standard `prompt=none`
  silent-authentication pattern used by OIDC-style SSO flows.

Three separate Node static servers (ports 4000/4001/4002) stand in for three
real origins, which is what makes the origin check meaningful locally —
same-port pages are same-origin and the browser wouldn't enforce anything.
