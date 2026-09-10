# CSP frame-ancestors test harness

Visual proof that `frame-ancestors` set via a `<meta>` tag is silently
ignored by browsers, while the same directive sent as a real HTTP response
header is enforced. Per the [CSP3 spec](https://www.w3.org/TR/CSP3/#meta-element),
`frame-ancestors` is one of a handful of directives browsers must not apply
when delivered via `<meta http-equiv="Content-Security-Policy">`.

## Run

```bash
node server.mjs
```

Open http://localhost:5000 — it embeds two iframes side by side:

- **Page A** (`/page-a`) sends `Content-Security-Policy: frame-ancestors 'none'`
  as a real header → the browser refuses to render it inside the iframe.
- **Page B** (`/page-b`) sets the identical policy via a `<meta>` tag →
  it renders inside the iframe anyway, because the browser ignores it.

Open devtools console to see the CSP violation logged for Page A and nothing
for Page B.

Zero dependencies — plain `node:http`, no Express install required.
