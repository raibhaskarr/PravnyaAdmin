import { expect, type APIRequestContext } from "@playwright/test";
import { BACKEND_URL } from "./env";

type Email = { to: string; subject: string; text: string; sentAt: string };

/** Waits for the newest email to `to` in the backend's test outbox (EMAIL_PROVIDER=memory). */
export async function latestEmailTo(request: APIRequestContext, to: string): Promise<Email> {
  let latest: Email | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(`${BACKEND_URL}/api/__test__/outbox`, { params: { to } });
      const emails = (await res.json()) as Email[];
      latest = emails.at(-1);
      return Boolean(latest);
    })
    .toBe(true);
  return latest!;
}

export async function verificationCodeFor(request: APIRequestContext, to: string): Promise<string> {
  const email = await latestEmailTo(request, to);
  const code = email.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No 6-digit code in email to ${to}: ${email.text}`);
  return code;
}
