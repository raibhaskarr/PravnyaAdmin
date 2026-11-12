import request from "supertest";
import { createApp } from "../app";

const app = createApp();

/** Supertest client for the real Express app -- no port, no separate server process. */
export function api() {
  return request(app);
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

type Method = "get" | "post" | "patch" | "delete";

/**
 * Asserts a parent route answers 401 both with no token and with a (valid) staff token -- parent
 * routes must never accept a staff JWT even though both are signed with the same secret.
 */
export async function expectParentAuthRequired(method: Method, path: string, staffToken: string, body?: object) {
  const send = (req: request.Test) => (body ? req.send(body) : req);
  const anon = await send(api()[method](path));
  if (anon.status !== 401) throw new Error(`${method.toUpperCase()} ${path} without a token: expected 401, got ${anon.status}`);
  const staff = await send(api()[method](path).set(bearer(staffToken)));
  if (staff.status !== 401) throw new Error(`${method.toUpperCase()} ${path} with a staff token: expected 401, got ${staff.status}`);
}
