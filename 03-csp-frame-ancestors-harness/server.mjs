// Visual proof that `frame-ancestors` is a meta-disallowed CSP directive:
// browsers enforce it from an HTTP response header but silently ignore it
// when set via <meta http-equiv="Content-Security-Policy">. Per spec
// (https://www.w3.org/TR/CSP3/#meta-element), frame-ancestors, report-uri,
// sandbox, and a couple of others simply don't apply when delivered via meta.
//
// Zero dependencies (plain node:http) so it runs with just `node server.mjs`.
import http from "node:http";

const PORT = 5000;

function page(title, bodyHtml, extraHeaders = {}) {
  return {
    headers: { "Content-Type": "text/html; charset=utf-8", ...extraHeaders },
    body: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 14px; background: #fff; color: #2c2c2a; }
  .badge { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; margin-bottom:8px; }
  .badge.blocked { background:#edf7f0; color:#2d6e45; }
  .badge.leaked { background:#faece7; color:#8b3214; }
  p { font-size: 13px; line-height: 1.5; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`,
  };
}

const routes = {
  "/": () => page(
    "CSP frame-ancestors: header vs meta",
    `<div style="max-width:900px;margin:0 auto;font-family:system-ui,sans-serif;">
      <h1 style="font-size:20px;">CSP <code>frame-ancestors</code>: HTTP header vs &lt;meta&gt; tag</h1>
      <p>Both pages below set <code>frame-ancestors 'none'</code> — one via a response header, one via a
      &lt;meta&gt; tag. This page embeds both in iframes. Per the CSP spec, only the header is enforced.</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:320px;">
          <h2 style="font-size:14px;">Page A — HTTP header</h2>
          <p style="font-size:12px;color:#888780;">Expect: <strong>blocked</strong> (browser refuses to render the frame's content)</p>
          <iframe src="/page-a" style="width:100%;height:140px;border:1px solid #d3d1c7;border-radius:8px;"></iframe>
        </div>
        <div style="flex:1;min-width:320px;">
          <h2 style="font-size:14px;">Page B — &lt;meta&gt; tag</h2>
          <p style="font-size:12px;color:#888780;">Expect: <strong>renders anyway</strong> (the bug — meta is silently ignored)</p>
          <iframe src="/page-b" style="width:100%;height:140px;border:1px solid #d3d1c7;border-radius:8px;"></iframe>
        </div>
      </div>
      <p style="margin-top:16px;">Open devtools console — the header case logs a CSP violation for Page A;
      Page B logs nothing and renders normally inside this iframe.</p>
    </div>`
  ),

  "/page-a": () => page(
    "Page A (header)",
    `<span class="badge blocked">frame-ancestors set via HTTP header</span>
     <p>If you're reading this <em>inside an iframe</em>, your browser is not spec-compliant —
     this response was sent with <code>Content-Security-Policy: frame-ancestors 'none'</code> as a
     real header, which should have blocked the embed entirely.</p>`,
    { "Content-Security-Policy": "frame-ancestors 'none'" }
  ),

  "/page-b": () => page(
    "Page B (meta)",
    `<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">
     <span class="badge leaked">frame-ancestors set via &lt;meta&gt; tag (ignored)</span>
     <p>This page has the exact same policy, but declared via a &lt;meta&gt; tag instead of a header.
     Per the CSP spec, <code>frame-ancestors</code> is one of the directives browsers must ignore when
     delivered this way — so this content renders inside the parent iframe anyway, meta tag notwithstanding.</p>`
  ),
};

const server = http.createServer((req, res) => {
  const handler = routes[req.url.split("?")[0]];
  if (!handler) {
    res.writeHead(404).end("not found");
    return;
  }
  const { headers, body } = handler();
  res.writeHead(200, headers);
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`CSP frame-ancestors harness: http://localhost:${PORT}`);
});
