import { expect, type APIRequestContext } from "@playwright/test";
import { BACKEND_URL } from "./env";

type Email = { to: string; subject: string; text: string; sentAt: string };

export async function emailsTo(request: APIRequestContext, to: string): Promise<Email[]> {
  const res = await request.get(`${BACKEND_URL}/api/__test__/outbox`, { params: { to } });
  return (await res.json()) as Email[];
}

/**
 * Waits for a NEW email to `to`: one beyond the `after` emails that already existed (default 0).
 * Take `after` from emailsTo() before triggering the send, so an older email (e.g. the sign-up
 * code) is never mistaken for the one under test.
 */
export async function nextEmailTo(request: APIRequestContext, to: string, after = 0): Promise<Email> {
  let emails: Email[] = [];
  await expect.poll(async () => (emails = await emailsTo(request, to)).length, { message: `waiting for email #${after + 1} to ${to}` }).toBeGreaterThan(after);
  return emails[emails.length - 1];
}

export function codeIn(email: Email): string {
  const code = email.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No 6-digit code in email to ${email.to}: ${email.text}`);
  return code;
}

export async function verificationCodeFor(request: APIRequestContext, to: string, after = 0): Promise<string> {
  return codeIn(await nextEmailTo(request, to, after));
}
