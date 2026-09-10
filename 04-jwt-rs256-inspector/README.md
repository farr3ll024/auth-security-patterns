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

# 4. Run the built-in test matrix: valid / expired / wrong iss / wrong aud / replayed jti
node jwt-tool.mjs test --key-dir ./keys
```

`verify` and `test` exit non-zero on any invalid/failed case, so both are
CI-friendly.

## Claim shape

`mint` always sets `iss`, `aud`, `sub`, `iat`, `exp`, `jti`, plus an optional
`kid` in the header — matching a typical portal-assertion shape. Pass
`--claims '{"...": "..."}'` to merge in anything endpoint-specific.

Note: `verify` checks signature, expiry, issuer and audience, and — only when
you pass it a shared `Set` (as the `test` command does) — replay of `jti`.
Replay detection needs persistent state across calls in a real service (e.g.
a short-TTL cache of seen `jti`s); this CLI's single-shot `verify` command
doesn't carry state between invocations.
