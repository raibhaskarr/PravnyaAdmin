# Testing

Four suites. All of them run in CI (`.github/workflows/ci.yml`) on every pull request, and both
deploy workflows run CI first, so nothing reaches production unless every suite passes.

| Suite | Where | Runner | Needs a database |
|---|---|---|---|
| Backend unit + API integration | `backend/src/**/*.test.ts` | Node test runner + supertest | yes |
| Admin panel unit/component | `frontend/src/**/*.test.ts(x)` | Vitest + Testing Library | no |
| Parent app unit/component | `parent-app/src/**/*.test.ts(x)` | Vitest + Testing Library | no |
| End-to-end (both apps + backend) | `e2e/tests/` | Playwright | yes |

## Test data rules

- **Synthetic data only.** Never copy a real family's data into tests, fixtures or seeds.
- `backend/src/test/factories.ts` builds records for integration tests.
- `backend/prisma/seed-demo.ts` creates a made-up demo family (parent `demo.parent@demo.pravnya.test` /
  `Demo-parent-123`, child "Mira") for local demos and the E2E suite.
- Tests that wipe data refuse to run unless the database name contains `test` or `_ci`.

## Backend

One-time setup: create a test database whose name contains `test`, then:

```sh
cd backend
cp .env.test.example .env.test   # set DATABASE_URL to your test database
npm run test:migrate             # apply migrations to the test database
npm test
```

With `NODE_ENV=test` the backend never reads `backend/.env`, so your dev config and API keys can't
leak into test runs. Emails go to an in-memory outbox (`EMAIL_PROVIDER=memory`) that tests read
directly.

## AI features in tests

With `NODE_ENV=test` no real AI provider is ever called. Every AI call is answered by a scripted
fake, keyed by the feature's id (`companion-message`, `extract-evidence-from-note`,
`extract-iep-goals`, `goal-skill-suggestion`); an unscripted call gets `{}`, which exercises the
feature's "AI unavailable" path.

- Integration tests: `setTestAiResponse(featureId, response)` from `modules/ai/ai.platform.ts`
  (`resetDb()` clears the script).
- E2E tests: `scriptAi(request, featureId, response)` from `e2e/support/api.ts` (calls the test-only
  `POST /api/__test__/ai-responses`).

## Admin panel and parent app

```sh
cd frontend && npm test       # or: npm run test:watch
cd parent-app && npm test
```

## End-to-end

Starts its own backend (port 4111), parent app (5273) and admin panel (5276) against its own
database, so it never touches a running dev stack. Each run migrates, empties and re-seeds that
database.

```sh
createdb pravnya_e2e_test        # or set E2E_DATABASE_URL to any database whose name contains "test"
cd e2e && npm install && npx playwright install chromium
npm test                         # npm run test:parent / test:admin for one app
npm run report                   # open the HTML report after a failure
```

Set `PW_CHROMIUM_PATH` to use an already-installed Chromium instead of Playwright's download.
