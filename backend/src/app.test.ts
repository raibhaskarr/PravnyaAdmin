import assert from "node:assert/strict";
import { test } from "node:test";
import request from "node:http";
import { createApp } from "./app";

test("GET /health responds", async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as { port: number };

  await new Promise<void>((resolve, reject) => {
    request
      .get(`http://127.0.0.1:${port}/health`, (res) => {
        assert.ok(res.statusCode === 200 || res.statusCode === 503);
        res.resume();
        res.on("end", resolve);
      })
      .on("error", reject);
  });

  server.close();
});
