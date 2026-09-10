#!/usr/bin/env node
// Minimal RS256 JWT mint/verify CLI. Zero dependencies — uses Node's built-in
// crypto module directly rather than a JWT library, so the token shape and
// signing steps are fully visible.
//
// Usage:
//   node jwt-tool.mjs keygen --out ./keys [--kid key-1]
//   node jwt-tool.mjs mint --key ./keys/private.pem --iss <iss> --aud <aud> --sub <sub> [--exp 3600] [--kid key-1] [--claims '{"foo":"bar"}']
//   node jwt-tool.mjs verify --key ./keys/public.pem --token <jwt> [--iss <iss>] [--aud <aud>]
//   node jwt-tool.mjs verify --jwks-dir ./keys --token <jwt> [--iss <iss>] [--aud <aud>]
//   node jwt-tool.mjs test --key-dir ./keys
import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}
function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function generateRsaKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function keygen(args) {
  const outDir = args.out ?? "./keys";
  mkdirSync(outDir, { recursive: true });
  const kid = typeof args.kid === "string" ? args.kid : undefined;
  const { publicKey, privateKey } = generateRsaKeyPair();
  // Without a --kid, files are named private.pem/public.pem (the simple
  // single-key case). With one, they're named <kid>-private.pem/<kid>-public.pem
  // so a directory can hold several keys side by side for --jwks-dir.
  const privName = kid ? `${kid}-private.pem` : "private.pem";
  const pubName = kid ? `${kid}-public.pem` : "public.pem";
  writeFileSync(path.join(outDir, privName), privateKey);
  writeFileSync(path.join(outDir, pubName), publicKey);
  console.log(`wrote ${path.join(outDir, privName)}`);
  console.log(`wrote ${path.join(outDir, pubName)}`);
}

// Scans a directory for <kid>-public.pem files and returns a kid -> PEM map,
// standing in for fetching a JWKS endpoint and picking a key by "kid".
function loadJwks(dir) {
  const map = new Map();
  for (const file of readdirSync(dir)) {
    const m = file.match(/^(.+)-public\.pem$/);
    if (m) map.set(m[1], readFileSync(path.join(dir, file), "utf8"));
  }
  return map;
}

function mint({ privateKeyPem, iss, aud, sub, exp, kid, extraClaims }) {
  const header = { alg: "RS256", typ: "JWT", ...(kid ? { kid } : {}) };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss,
    aud,
    sub,
    iat: now,
    exp: now + (exp ?? 3600),
    jti: randomUUID(),
    ...extraClaims,
  };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signature = cryptoSign("RSA-SHA256", Buffer.from(signingInput), privateKeyPem);
  const token = `${signingInput}.${signature.toString("base64url")}`;
  return { token, header, payload };
}

function decode(token) {
  const [h, p, s] = token.split(".");
  if (!h || !p || s === undefined) throw new Error("malformed token (expected 3 dot-separated segments)");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s, "base64url"),
  };
}

// Returns { valid, errors[] } rather than throwing, so callers (and the
// `test` command) can report *why* a token was rejected.
//
// Pass either `publicKeyPem` (single fixed key) or `jwks` (a Map of
// kid -> PEM, for key-rotation setups) — never both. Either way, the
// algorithm this function trusts is hardcoded to RS256/RSA-SHA256; it is
// NEVER taken from the token's own `alg` header. That single choice is what
// defeats the classic "alg:none" and "RS256-key-used-as-an-HS256-secret"
// forgery attacks exercised in the `test` command below — a verifier that
// dynamically dispatches on `header.alg` is vulnerable to both.
function verify({ publicKeyPem, jwks, token, expectIss, expectAud, seenJtis }) {
  const errors = [];
  let decoded;
  try {
    decoded = decode(token);
  } catch (e) {
    return { valid: false, errors: [e.message] };
  }
  const { header, payload, signingInput, signature } = decoded;

  let resolvedKeyPem = publicKeyPem;
  if (jwks) {
    if (!header.kid) {
      return { valid: false, errors: ['token has no "kid" in header; cannot select a key from the JWKS directory'], header, payload };
    }
    resolvedKeyPem = jwks.get(header.kid);
    if (!resolvedKeyPem) {
      return { valid: false, errors: [`no key found for kid "${header.kid}"`], header, payload };
    }
  }

  if (header.alg !== "RS256") errors.push(`unexpected alg "${header.alg}", expected RS256`);

  let sigOk = false;
  try {
    // Hardcoded "RSA-SHA256" regardless of what header.alg claims — see the
    // function comment above.
    sigOk = header.alg === "RS256" && cryptoVerify("RSA-SHA256", Buffer.from(signingInput), resolvedKeyPem, signature);
  } catch {
    sigOk = false;
  }
  if (!sigOk) errors.push("signature verification failed");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) errors.push(`token expired at ${new Date(payload.exp * 1000).toISOString()}`);
  if (expectIss && payload.iss !== expectIss) errors.push(`iss mismatch: expected "${expectIss}", got "${payload.iss}"`);
  if (expectAud && payload.aud !== expectAud) errors.push(`aud mismatch: expected "${expectAud}", got "${payload.aud}"`);
  if (seenJtis) {
    if (payload.jti && seenJtis.has(payload.jti)) errors.push(`jti "${payload.jti}" already used (replay)`);
    else if (payload.jti) seenJtis.add(payload.jti);
  }

  return { valid: errors.length === 0, errors, header, payload };
}

function cmdMint(args) {
  const privateKeyPem = readFileSync(args.key, "utf8");
  let extraClaims = {};
  if (args.claims) extraClaims = JSON.parse(args.claims);
  const { token, header, payload } = mint({
    privateKeyPem,
    iss: args.iss,
    aud: args.aud,
    sub: args.sub,
    exp: args.exp ? Number(args.exp) : undefined,
    kid: args.kid,
    extraClaims,
  });
  console.log(token);
  console.error("\nheader: " + JSON.stringify(header));
  console.error("payload: " + JSON.stringify(payload));
}

function cmdVerify(args) {
  let publicKeyPem, jwks;
  if (args["jwks-dir"]) {
    jwks = loadJwks(args["jwks-dir"]);
  } else if (args.key) {
    publicKeyPem = readFileSync(args.key, "utf8");
  } else {
    console.error("pass either --key <public.pem> or --jwks-dir <dir containing <kid>-public.pem files>");
    process.exitCode = 1;
    return;
  }
  const result = verify({ publicKeyPem, jwks, token: args.token, expectIss: args.iss, expectAud: args.aud });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.valid ? 0 : 1;
}

function cmdTest(args) {
  const keyDir = args["key-dir"] ?? "./keys";
  const privPath = path.join(keyDir, "private.pem");
  const pubPath = path.join(keyDir, "public.pem");
  if (!existsSync(privPath) || !existsSync(pubPath)) {
    console.error(`keys not found in ${keyDir} — run "keygen --out ${keyDir}" first`);
    process.exitCode = 1;
    return;
  }
  const privateKeyPem = readFileSync(privPath, "utf8");
  const publicKeyPem = readFileSync(pubPath, "utf8");
  const iss = "https://portal.example.com";
  const aud = "https://api.example.com";
  const seenJtis = new Set();

  const cases = [];
  const expectedValidity = [];

  function addCase(name, result, expectValid) {
    cases.push([name, result]);
    expectedValidity.push(expectValid);
  }

  // 1. valid token
  const good = mint({ privateKeyPem, iss, aud, sub: "user-1", exp: 3600, kid: "key-1" });
  addCase("valid token", verify({ publicKeyPem, token: good.token, expectIss: iss, expectAud: aud, seenJtis }), true);

  // 2. expired token (mint with exp already in the past)
  const expired = mint({ privateKeyPem, iss, aud, sub: "user-1", exp: -10, kid: "key-1" });
  addCase("expired token", verify({ publicKeyPem, token: expired.token, expectIss: iss, expectAud: aud, seenJtis }), false);

  // 3. wrong issuer
  const wrongIss = mint({ privateKeyPem, iss: "https://evil.example.com", aud, sub: "user-1", exp: 3600, kid: "key-1" });
  addCase("wrong issuer", verify({ publicKeyPem, token: wrongIss.token, expectIss: iss, expectAud: aud, seenJtis }), false);

  // 4. wrong audience
  const wrongAud = mint({ privateKeyPem, iss, aud: "https://other-api.example.com", sub: "user-1", exp: 3600, kid: "key-1" });
  addCase("wrong audience", verify({ publicKeyPem, token: wrongAud.token, expectIss: iss, expectAud: aud, seenJtis }), false);

  // 5. replayed jti — verify the *same* valid token a second time
  addCase("replayed jti (reusing case 1's token)", verify({ publicKeyPem, token: good.token, expectIss: iss, expectAud: aud, seenJtis }), false);

  // 6. classic "alg:none" forgery: attacker builds a token claiming alg:none
  // with an empty signature, hoping the verifier trusts the header and
  // skips signature checking entirely.
  const now = Math.floor(Date.now() / 1000);
  const forgedPayload = { iss, aud, sub: "attacker", iat: now, exp: now + 3600, jti: randomUUID() };
  const noneHeader = { alg: "none", typ: "JWT" };
  const noneToken = `${b64urlJson(noneHeader)}.${b64urlJson(forgedPayload)}.`;
  addCase("alg:none forged token", verify({ publicKeyPem, token: noneToken, expectIss: iss, expectAud: aud, seenJtis }), false);

  // 7. RS256 -> HS256 key-confusion attack: the RSA *public* key is, well,
  // public — an attacker can read it. If a verifier naively used
  // `header.alg` to decide which algorithm/key-type to use, it could be
  // tricked into treating that public key PEM text as an HMAC secret and
  // accept an attacker-forged HS256 token. This verify() never does that
  // (see the comment on the verify() function), so this must fail too.
  const hsHeader = { alg: "HS256", typ: "JWT" };
  const hsForgedPayload = { ...forgedPayload, jti: randomUUID() };
  const hsSigningInput = `${b64urlJson(hsHeader)}.${b64urlJson(hsForgedPayload)}`;
  const forgedHmac = createHmac("sha256", publicKeyPem).update(hsSigningInput).digest();
  const hsToken = `${hsSigningInput}.${forgedHmac.toString("base64url")}`;
  addCase("RS256->HS256 key-confusion attack", verify({ publicKeyPem, token: hsToken, expectIss: iss, expectAud: aud, seenJtis }), false);

  // 8-10. kid-based key rotation: two keys live side by side in a JWKS-style
  // map, tokens carry a "kid" and get verified against the matching key —
  // and a token referencing a kid that isn't in the map is rejected outright
  // rather than falling back to any key.
  const keyA = generateRsaKeyPair();
  const keyB = generateRsaKeyPair();
  const jwks = new Map([["key-a", keyA.publicKey], ["key-b", keyB.publicKey]]);

  const tokenA = mint({ privateKeyPem: keyA.privateKey, iss, aud, sub: "user-a", exp: 3600, kid: "key-a" });
  addCase("kid rotation: token signed by key-a verifies via JWKS", verify({ jwks, token: tokenA.token, expectIss: iss, expectAud: aud, seenJtis }), true);

  const tokenB = mint({ privateKeyPem: keyB.privateKey, iss, aud, sub: "user-b", exp: 3600, kid: "key-b" });
  addCase("kid rotation: token signed by key-b verifies via JWKS", verify({ jwks, token: tokenB.token, expectIss: iss, expectAud: aud, seenJtis }), true);

  const tokenUnknownKid = mint({ privateKeyPem: keyA.privateKey, iss, aud, sub: "user-a", exp: 3600, kid: "key-does-not-exist" });
  addCase("kid rotation: unknown kid is rejected", verify({ jwks, token: tokenUnknownKid.token, expectIss: iss, expectAud: aud, seenJtis }), false);

  let allExpected = true;
  cases.forEach(([name, result], i) => {
    const pass = result.valid === expectedValidity[i];
    allExpected = allExpected && pass;
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}: valid=${result.valid}${result.errors.length ? ` (${result.errors.join("; ")})` : ""}`);
  });
  process.exitCode = allExpected ? 0 : 1;
}

function usage() {
  console.log(`RS256 JWT builder/inspector

  node jwt-tool.mjs keygen --out ./keys [--kid key-1]
  node jwt-tool.mjs mint --key ./keys/private.pem --iss <iss> --aud <aud> --sub <sub> [--exp 3600] [--kid key-1] [--claims '{"foo":"bar"}']
  node jwt-tool.mjs verify --key ./keys/public.pem --token <jwt> [--iss <iss>] [--aud <aud>]
  node jwt-tool.mjs verify --jwks-dir ./keys --token <jwt> [--iss <iss>] [--aud <aud>]   # picks the key by the token's "kid"
  node jwt-tool.mjs test --key-dir ./keys   # valid / expired / wrong iss / wrong aud / replayed jti /
                                             # alg:none forgery / RS256->HS256 key-confusion / kid rotation (x3)
`);
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);

switch (cmd) {
  case "keygen": keygen(args); break;
  case "mint": cmdMint(args); break;
  case "verify": cmdVerify(args); break;
  case "test": cmdTest(args); break;
  default: usage(); process.exitCode = cmd ? 1 : 0;
}
