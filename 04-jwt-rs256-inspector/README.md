# JWT RS256 builder / inspector

Zero-dependency CLI to mint and verify RS256 JWTs, so you can exercise a
token-exchange endpoint in isolation without a real identity provider wired up.
Uses Node's built-in `crypto` directly (no `jsonwebtoken`/`jose`) so every
step — header/payload encoding, the signing input, the signature — is visible
in `jwt-tool.mjs`.

## Usage

```bash
# 1. Generate a throwaway RS256 keypair
node jwt-tool.mjs keygen --out ./keys

# 2. Mint a token with configurable claims
node jwt-tool.mjs mint \
  --key ./keys/private.pem \
  --iss https://portal.example.com \
  --aud https://api.example.com \
  --sub user-123 \
  --exp 3600 \
  --kid key-1 \
  --claims '{"role":"guest"}'

# 3. Verify a token against the public key — prints decoded header + payload
node jwt-tool.mjs verify --key ./keys/public.pem --token <jwt> \
  --iss https://portal.example.com --aud https://api.example.com

# 4. Run the built-in test matrix (10 cases, see below)
node jwt-tool.mjs test --key-dir ./keys
```

`verify` and `test` exit non-zero on any invalid/failed case, so both are
CI-friendly.

## Key rotation (multiple keys, verify picks by `kid`)

```bash
node jwt-tool.mjs keygen --out ./keys --kid key-1   # writes key-1-private.pem / key-1-public.pem
node jwt-tool.mjs keygen --out ./keys --kid key-2   # a second key, side by side

node jwt-tool.mjs mint --key ./keys/key-1-private.pem --kid key-1 \
  --iss https://portal.example.com --aud https://api.example.com --sub user-123

# verify resolves the key from the token's own "kid" header instead of a
# single fixed --key — the way a real JWKS endpoint lookup would
node jwt-tool.mjs verify --jwks-dir ./keys --token <jwt> \
  --iss https://portal.example.com --aud https://api.example.com
```

A token whose `kid` isn't present in the directory is rejected outright —
`verify()` never falls back to trying another key.

## Claim shape

`mint` always sets `iss`, `aud`, `sub`, `iat`, `exp`, `jti`, plus an optional
`kid` in the header — matching a typical portal-assertion shape. Pass
`--claims '{"...": "..."}'` to merge in anything endpoint-specific.

## The `test` matrix

`test` mints and verifies 10 cases and exits non-zero if any doesn't match
its expected outcome:

1. valid token
2. expired token
3. wrong issuer
4. wrong audience
5. replayed `jti`
6. **`alg:none` forgery** — a token claiming `alg: "none"` with an empty
   signature, the classic bypass against verifiers that trust the token's
   own algorithm header
7. **RS256→HS256 key-confusion attack** — the RSA *public* key is public by
   definition, so an attacker can read it; if a verifier used `header.alg`
   to decide how to verify, it could be tricked into treating that public
   key's PEM text as an HMAC secret and accepting a forged HS256 token
8-10. kid-based key rotation: a token signed by `key-a` verifies against a
   two-key JWKS map, a token signed by `key-b` also verifies, and a token
   naming an unknown `kid` is rejected

`verify()` defeats cases 6 and 7 the same way: the algorithm it trusts is
hardcoded to `RSA-SHA256`, never taken from `header.alg`. That's the whole
fix — see the comment on `verify()` in `jwt-tool.mjs`.

Note: replay detection needs persistent state across calls in a real
service (e.g. a short-TTL cache of seen `jti`s); a single `verify` CLI
invocation doesn't carry state between runs the way the `test` command's
shared `Set` does.
