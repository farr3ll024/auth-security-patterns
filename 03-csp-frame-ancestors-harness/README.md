# CSP frame-ancestors test harness

Visual proof that `frame-ancestors` set via a `<meta>` tag is silently
ignored by browsers, while the same directive sent as a real HTTP response
header is enforced — plus a comparison against the legacy `X-Frame-Options`
header, and live CSP violation reporting via `report-uri`. Per the
[CSP3 spec](https://www.w3.org/TR/CSP3/#meta-element), `frame-ancestors` and
`report-uri` are both directives browsers must not apply when delivered via
`<meta http-equiv="Content-Security-Policy">`.

## Run

```bash
node server.mjs
```

Open http://localhost:5000 — it embeds three iframes side by side:

- **Page A** (`/page-a`) sends `Content-Security-Policy: frame-ancestors 'none'; report-uri /csp-report`
  as a real header → the browser refuses to render it inside the iframe, and
  POSTs a violation report to `/csp-report` on the same origin.
- **Page B** (`/page-b`) sets the identical policy — including the same
  `report-uri` — via a `<meta>` tag → it renders inside the iframe anyway,
  and no report is ever sent, because the browser ignores the whole
  directive when it's delivered this way.
- **Page C** (`/page-c`) sends the legacy `X-Frame-Options: DENY` header,
  no CSP at all → still blocked. XFO is still enforced by every major
  browser; the reason `frame-ancestors` superseded it is expressiveness —
  XFO can only say `DENY` or `SAMEORIGIN`, never "allow exactly these three
  origins" the way `frame-ancestors https://a.example https://b.example`
  can.

Visit **http://localhost:5000/csp-reports** to see violation reports Page A
has sent, logged in real time as you reload `/`.

Open devtools console too: Page A logs a CSP violation, Page B logs nothing
and renders normally, and Page C produces no console entry at all — the
browser's frame-loading check runs before CSP evaluation or any page script,
so there's nothing to report.

Zero dependencies — plain `node:http`, no Express install required.
