// `tsx src/test/resetDb.cli.ts` -- used by the E2E suite's global setup to empty its database.
// Same guard as the integration tests: the database name must contain "test" or "_ci".
import { disconnectDb, resetDb } from "./db";

resetDb()
  .then(() => console.log("Test database emptied"))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(disconnectDb);
