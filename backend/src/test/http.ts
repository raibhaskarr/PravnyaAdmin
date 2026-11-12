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
