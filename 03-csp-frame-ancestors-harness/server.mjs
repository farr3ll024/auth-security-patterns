// Visual proof that `frame-ancestors` is a meta-disallowed CSP directive:
// browsers enforce it from an HTTP response header but silently ignore it
// when set via <meta http-equiv="Content-Security-Policy">. Per spec
// (https://www.w3.org/TR/CSP3/#meta-element), frame-ancestors, report-uri,
// sandbox, and a couple of others simply don't apply when delivered via meta.
//
// Also demonstrates the legacy X-Frame-Options header (still enforced, but
// coarser than frame-ancestors — it can't express a list of allowed
// origins) and CSP violation reporting via report-uri.
//
// Zero dependencies (plain node:http) so it runs with just `node server.mjs`.
import http from "node:http";

const PORT = 5000;

// In-memory only — this is a demo, not a store. Restarts the server, loses
// the log; that's fine, the point is to *see* a report land in real time.
const receivedReports = [];

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
    `<div style="max-width:1000px;margin:0 auto;font-family:system-ui,sans-serif;">
      <h1 style="font-size:20px;">CSP <code>frame-ancestors</code>: HTTP header vs &lt;meta&gt; tag vs legacy XFO</h1>
      <p>Three pages below all try to block being framed, three different ways. This page embeds all
      three in iframes so you can see which ones the browser actually enforces.</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;">
          <h2 style="font-size:14px;">Page A — CSP header</h2>
          <p style="font-size:12px;color:#888780;"><code>Content-Security-Policy: frame-ancestors 'none'</code> as a real header.<br>Expect: <strong>blocked</strong>, and a violation report logged.</p>
          <iframe src="/page-a" style="width:100%;height:140px;border:1px solid #d3d1c7;border-radius:8px;"></iframe>
        </div>
        <div style="flex:1;min-width:280px;">
          <h2 style="font-size:14px;">Page B — CSP meta tag</h2>
          <p style="font-size:12px;color:#888780;">Identical policy, but as a &lt;meta&gt; tag.<br>Expect: <strong>renders anyway</strong> (the bug — meta is silently ignored).</p>
          <iframe src="/page-b" style="width:100%;height:140px;border:1px solid #d3d1c7;border-radius:8px;"></iframe>
        </div>
        <div style="flex:1;min-width:280px;">
          <h2 style="font-size:14px;">Page C — legacy X-Frame-Options</h2>
          <p style="font-size:12px;color:#888780;"><code>X-Frame-Options: DENY</code> header, no CSP at all.<br>Expect: <strong>blocked</strong> — still enforced, but can only say "deny" or "same-origin", never a specific list of allowed origins like frame-ancestors can.</p>
          <iframe src="/page-c" style="width:100%;height:140px;border:1px solid #d3d1c7;border-radius:8px;"></iframe>
        </div>
      </div>
      <p style="margin-top:16px;">Open devtools console — the header case (A) logs a CSP violation; Page B
      logs nothing and renders normally; Page C is blocked by the browser's frame-loading check before CSP
      or JS ever runs, so nothing appears in the console for it at all.</p>
      <p><a href="/csp-reports">View collected CSP violation reports →</a> (sent by Page A via <code>report-uri</code>)</p>
    </div>`
  ),

  "/page-a": () => page(
    "Page A (header)",
    `<span class="badge blocked">frame-ancestors set via HTTP header</span>
     <p>If you're reading this <em>inside an iframe</em>, your browser is not spec-compliant —
     this response was sent with <code>Content-Security-Policy: frame-ancestors 'none'</code> as a
     real header, which should have blocked the embed entirely. The browser also POSTs a violation
     report to <code>/csp-report</code> on this same origin when that happens — check
     <a href="/csp-reports">/csp-reports</a>.</p>`,
    { "Content-Security-Policy": "frame-ancestors 'none'; report-uri /csp-report" }
  ),

  "/page-b": () => page(
    "Page B (meta)",
    `<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'; report-uri /csp-report">
     <span class="badge leaked">frame-ancestors set via &lt;meta&gt; tag (ignored)</span>
     <p>This page has the exact same policy — including the same <code>report-uri</code> — but declared via
     a &lt;meta&gt; tag instead of a header. Per the CSP spec, both <code>frame-ancestors</code> and
     <code>report-uri</code> are directives browsers must ignore when delivered this way — so this content
     renders inside the parent iframe anyway, and no violation report is ever sent, meta tag notwithstanding.</p>`
  ),

  "/page-c": () => page(
    "Page C (X-Frame-Options)",
    `<span class="badge blocked">X-Frame-Options: DENY</span>
     <p>This page sends the legacy <code>X-Frame-Options: DENY</code> header and no CSP at all. If you're
     reading this inside an iframe, XFO enforcement failed. XFO predates CSP, is still respected by every
     major browser, but only supports <code>DENY</code> or <code>SAMEORIGIN</code> — it cannot express "allow
     these three specific origins" the way <code>frame-ancestors https://a.example https://b.example</code>
     can. That expressiveness gap is the actual reason CSP's frame-ancestors superseded it, not that XFO
     stopped working.</p>`,
    { "X-Frame-Options": "DENY" }
  ),

  "/csp-reports": () => page(
    "Collected CSP violation reports",
    `<h1 style="font-size:18px;">Collected CSP violation reports (${receivedReports.length})</h1>
     <p style="font-size:12px;color:#888780;">Only Page A's header-based policy can produce these — Page B's
     meta-tag report-uri is ignored along with the rest of the directive.</p>
     <pre style="background:#1a1a18;color:#d4f5e5;padding:14px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${
       receivedReports.length === 0
         ? "(none yet — visit / and let Page A's iframe get blocked, then refresh this page)"
         : receivedReports.map((r, i) => `#${i + 1} @ ${r.receivedAt}\n${JSON.stringify(r.body, null, 2)}`).join("\n\n")
     }</pre>`
  ),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/csp-report" && req.method === "POST") {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw };
    }
    receivedReports.unshift({ receivedAt: new Date().toISOString(), body });
    console.log("[csp-report] violation received:", JSON.stringify(body));
    res.writeHead(204).end();
    return;
  }

  const handler = routes[url];
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
