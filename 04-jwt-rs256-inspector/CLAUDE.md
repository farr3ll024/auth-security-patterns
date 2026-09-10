# CLAUDE.md — JWT RS256 builder / inspector

## What this is

Zero-dependency CLI (`jwt-tool.mjs`) to mint and verify RS256 JWTs using
Node's built-in `crypto` directly — no `jsonwebtoken`/`jose`. Built to
exercise a token-exchange endpoint in isolation without a real IdP wired up,
and to make the algorithm-confusion class of JWT vulnerabilities concrete
rather than theoretical.

## Commands

```bash
node jwt-tool.mjs keygen --out ./keys [--kid key-1]
node jwt-tool.mjs mint --key ./keys/private.pem --iss <iss> --aud <aud> --sub <sub> [--exp 3600] [--kid key-1] [--claims '{"foo":"bar"}']
node jwt-tool.mjs verify --key ./keys/public.pem --token <jwt> [--iss <iss>] [--aud <aud>]
node jwt-tool.mjs verify --jwks-dir ./keys --token <jwt> [--iss <iss>] [--aud <aud>]
node jwt-tool.mjs test --key-dir ./keys
```

`verify` and `test` exit non-zero on failure — safe to wire into CI.

## The one thing not to break

`verify()` in `jwt-tool.mjs` hardcodes `"RSA-SHA256"` as the algorithm it
calls `crypto.verify` with — it **never** reads `header.alg` and dispatches
on it. That single design choice is what defeats both attack cases in the
test matrix (`alg:none` forgery, and the RS256→HS256 key-confusion attack
where the public key's own PEM text gets used as a forged HMAC secret). If
you ever add support for another algorithm, do it as an explicit allowlist
check, never as "look up the verify function named by `header.alg`" — that
reintroduces exactly the vulnerability this tool demonstrates defeating.

## `test` matrix (10 cases, see the README for the full list)

Cases 1-5 are the basic ones (valid / expired / wrong iss / wrong aud /
replayed jti) using the default `./keys/private.pem` + `public.pem`. Cases
6-7 are the two forgery attacks above. Cases 8-10 exercise `kid`-based key
rotation using two keypairs generated on the fly inside `cmdTest` (not
written to disk) — a token signed by each key verifies via a shared JWKS
map, and a token naming an unrecognized `kid` is rejected outright rather
than falling back to any available key.

## Key file naming convention

`keygen` without `--kid` writes `private.pem`/`public.pem` (the simple
single-key case `mint`/`verify --key` expect). With `--kid <name>` it
writes `<name>-private.pem`/`<name>-public.pem`, and `loadJwks()` in
`jwt-tool.mjs` discovers keys by matching `*-public.pem` in a directory —
keep that naming convention if you touch either function, since they're
coupled through it rather than through any shared config.

## Generated keys aren't committed

`../.gitignore` excludes `04-jwt-rs256-inspector/keys/` and `*.pem`
anywhere in the repo. Don't commit keypairs generated while testing this
tool, even throwaway ones.
