# CLAUDE.md — CSP frame-ancestors test harness

## What this is

Visual/live proof of three related facts about framing controls:
1. `frame-ancestors` set via an HTTP `Content-Security-Policy` header is
   enforced.
2. The identical policy set via `<meta http-equiv="Content-Security-Policy">`
   is **silently ignored** (per the [CSP3 spec](https://www.w3.org/TR/CSP3/#meta-element),
   `frame-ancestors` and `report-uri` are both meta-disallowed directives).
3. The legacy `X-Frame-Options: DENY` header is still enforced by every
   major browser, but is strictly less expressive than `frame-ancestors`
   (only `DENY`/`SAMEORIGIN`, never a specific origin list).

## Run

```bash
node server.mjs
```
http://localhost:5000 — three iframes side by side (Page A/B/C), plus
http://localhost:5000/csp-reports to watch live CSP violation reports land.

No dependencies — plain `node:http`, despite the original brief calling for
Express; swap it in if you want, but it isn't needed for anything here.

## Routes

- `/` — host page, embeds A/B/C in iframes, links to `/csp-reports`.
- `/page-a` — real header: `Content-Security-Policy: frame-ancestors 'none'; report-uri /csp-report`. Blocked, and fires a violation report.
- `/page-b` — identical policy via `<meta>`. Renders anyway; no report sent (meta ignores `report-uri` too).
- `/page-c` — `X-Frame-Options: DENY`, no CSP. Blocked, but via a different, older enforcement path than CSP — nothing shows in devtools console for it.
- `POST /csp-report` — accepts browser-sent violation reports, logs them in-memory (`receivedReports` array, not persisted).
- `/csp-reports` — renders whatever's in `receivedReports`, newest first.

## If extending this

Keep the three-way comparison shape (header vs. meta vs. legacy) rather
than just adding more header-only demos — the meta-tag-is-ignored gap is
the actual lesson, and it only reads clearly side by side with a working
case. If you add a fourth CSP directive to demo (e.g. `sandbox`, another
meta-disallowed one), reuse the `page()` helper and the same "A works / B
looks identical but silently doesn't" pairing.

`receivedReports` is in-memory and unbounded — fine for a demo server you
restart often, but don't copy this pattern into anything long-running
without a cap or persistence.
