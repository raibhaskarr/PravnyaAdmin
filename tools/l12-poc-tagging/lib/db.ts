// Node's built-in SQLite (stable enough for a local POC; avoids the native
// build toolchain better-sqlite3 needs, which is broken on this machine's
// current macOS SDK). Emits an ExperimentalWarning at startup -- harmless.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(__dirname, "..", "poc.sqlite");
const SCHEMA_PATH = path.join(__dirname, "..", "schema.sql");

export function openDb(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}
