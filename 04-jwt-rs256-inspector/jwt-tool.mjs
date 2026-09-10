#!/usr/bin/env node
// Minimal RS256 JWT mint/verify CLI. Zero dependencies — uses Node's built-in
// crypto module directly rather than a JWT library, so the token shape and
// signing steps are fully visible.
//
// Usage:
//   node jwt-tool.mjs keygen --out ./keys
//   node jwt-tool.mjs mint --key ./keys/private.pem --iss <iss> --aud <aud> --sub <sub> [--exp 3600] [--kid key-1] [--claims '{"foo":"bar"}']
//   node jwt-tool.mjs verify --key ./keys/public.pem --token <jwt> [--iss <iss>] [--aud <aud>]
//   node jwt-tool.mjs test --key-dir ./keys
import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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

function keygen(args) {
  const outDir = args.out ?? "./keys";
  mkdirSync(outDir, { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(path.join(outDir, "private.pem"), privateKey);
  writeFileSync(path.join(outDir, "public.pem"), publicKey);
  console.log(`wrote ${path.join(outDir, "private.pem")}`);
  console.log(`wrote ${path.join(outDir, "public.pem")}`);
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
  if (!h || !p || !s) throw new Error("malformed token (expected 3 dot-separated segments)");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s, "base64url"),
  };
}

// Returns { valid, errors[] } rather than throwing, so callers (and the
// `test` command) can report *why* a token was rejected.
function verify({ publicKeyPem, token, expectIss, expectAud, seenJtis }) {
  const errors = [];
  let decoded;
  try {
    decoded = decode(token);
  } catch (e) {
    return { valid: false, errors: [e.message] };
  }
  const { header, payload, signingInput, signature } = decoded;

  if (header.alg !== "RS256") errors.push(`unexpected alg "${header.alg}", expected RS256`);

  const sigOk = cryptoVerify("RSA-SHA256", Buffer.from(signingInput), publicKeyPem, signature);
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
  const publicKeyPem = readFileSync(args.key, "utf8");
  const result = verify({ publicKeyPem, token: args.token, expectIss: args.iss, expectAud: args.aud });
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

  // 1. valid token
  const good = mint({ privateKeyPem, iss, aud, sub: "user-1", exp: 3600, kid: "key-1" });
  cases.push(["valid token", verify({ publicKeyPem, token: good.token, expectIss: iss, expectAud: aud, seenJtis })]);

  // 2. expired token (mint with exp already in the past)
  const expired = mint({ privateKeyPem, iss, aud, sub: "user-1", exp: -10, kid: "key-1" });
  cases.push(["expired token", verify({ publicKeyPem, token: expired.token, expectIss: iss, expectAud: aud, seenJtis })]);

  // 3. wrong issuer
  const wrongIss = mint({ privateKeyPem, iss: "https://evil.example.com", aud, sub: "user-1", exp: 3600, kid: "key-1" });
  cases.push(["wrong issuer", verify({ publicKeyPem, token: wrongIss.token, expectIss: iss, expectAud: aud, seenJtis })]);

  // 4. wrong audience
  const wrongAud = mint({ privateKeyPem, iss, aud: "https://other-api.example.com", sub: "user-1", exp: 3600, kid: "key-1" });
  cases.push(["wrong audience", verify({ publicKeyPem, token: wrongAud.token, expectIss: iss, expectAud: aud, seenJtis })]);

  // 5. replayed jti — verify the *same* valid token a second time
  cases.push(["replayed jti (reusing case 1's token)", verify({ publicKeyPem, token: good.token, expectIss: iss, expectAud: aud, seenJtis })]);

  let allExpected = true;
  const expectedValidity = [true, false, false, false, false];
  cases.forEach(([name, result], i) => {
    const pass = result.valid === expectedValidity[i];
    allExpected = allExpected && pass;
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}: valid=${result.valid}${result.errors.length ? ` (${result.errors.join("; ")})` : ""}`);
  });
  process.exitCode = allExpected ? 0 : 1;
}

function usage() {
  console.log(`RS256 JWT builder/inspector

  node jwt-tool.mjs keygen --out ./keys
  node jwt-tool.mjs mint --key ./keys/private.pem --iss <iss> --aud <aud> --sub <sub> [--exp 3600] [--kid key-1] [--claims '{"foo":"bar"}']
  node jwt-tool.mjs verify --key ./keys/public.pem --token <jwt> [--iss <iss>] [--aud <aud>]
  node jwt-tool.mjs test --key-dir ./keys   # runs: valid / expired / wrong iss / wrong aud / replayed jti
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
