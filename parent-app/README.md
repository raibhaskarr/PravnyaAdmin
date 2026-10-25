# Pravnya parent-app

The parent-facing frontend for Pravnya, deployed at `app2.pravnya.com`. Talks to the same shared
backend as the admin panel (`frontend/`), proxied through nginx at `/api/` on the same origin.

## Deployment

Fully automated — a push to `main` that touches `parent-app/**` is all it takes:

- `.github/workflows/ci.yml`'s `parent-app` job typechecks (`npx tsc -b`) on every push and PR.
- `.github/workflows/deploy-parent-app.yml` builds (`VITE_API_BASE_URL=""`), packages, and ships
  the result to `app2.pravnya.com` via SSH, running `~/apps/deploy-parent-app.sh` on the deploy
  server (not tracked in this repo, same convention as every other `~/apps/deploy-*.sh` script).

Both are path-filtered to `parent-app/**` (plus the deploy workflow's own file), so a backend- or
admin-panel-only commit never triggers a redundant parent-app rebuild. No manual build/upload step
is needed anymore — that was the process before this pipeline existed.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
