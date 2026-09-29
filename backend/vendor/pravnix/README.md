# Vendored `@pravnix/*` packages

These `.tgz` files are `npm pack` output from [AIPlatformNode](https://github.com/raibhaskarr/AIPlatformNode)
(the shared AI execution platform — see `../../docs/manual/04-ai-platform.md`), committed directly
into this repo instead of being installed from a registry or a sibling checkout.

## Why they're here instead of a normal dependency

`AIPlatformNode` isn't published to any npm registry yet (see its own
`docs/versioning-and-releases.md`). The natural interim approach — a `file:` dependency pointing at
a sibling git checkout — works for local development, but breaks in production: this repo's deploy
script only has access to whatever `git` delivers to the server, and there's no sibling
`AIPlatformNode` checkout there. Vendoring the built tarballs here means `git reset --hard` on the
server brings them along automatically, and `npm ci` resolves everything with zero extra
server-side setup.

All 11 packages `@pravnix/ai-node` transitively needs are vendored (not just `ai-node` itself),
because each one declares its sibling dependencies as plain `0.1.0-preview.1` version ranges —
without every sibling present, npm would try to fetch the missing ones from the public registry and
fail. Their own external SDK dependencies (`@anthropic-ai/sdk`, `@google/generative-ai`, `zod`,
etc.) are real published packages and install normally.

## Regenerating after an AIPlatformNode change

```bash
git clone https://github.com/raibhaskarr/AIPlatformNode.git /tmp/aiplatformnode-pack
cd /tmp/aiplatformnode-pack && npm install && npm run build

for pkg in core abstractions structured-output provider-support observability providers/fake \
           orchestration providers/anthropic providers/gemini providers/openai node; do
  (cd "packages/$pkg" && npm pack --pack-destination /path/to/PravnyaAdmin/backend/vendor/pravnix)
done
```

Then `rm -rf node_modules package-lock.json && npm install` in `backend/` to pick up the new
tarballs, and commit both the updated `.tgz` files and the regenerated `package-lock.json`.

## Target end state

Once `AIPlatformNode` publishes to a real registry (GitHub Packages, per its own docs), replace
these `file:` dependencies with normal registry versions and delete this directory.
