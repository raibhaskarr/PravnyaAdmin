import webpush from "web-push";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

// Web Push to the parent app (a browser, or the iPhone/iPad web app added to the Home Screen).
// Off unless VAPID keys are configured.

export type PushMessage = { title: string; body: string; url: string; tag: string };

/** Test-only: what would have been sent. */
export const testPushOutbox: { parentId: string; message: PushMessage }[] = [];

let configured = false;
function ready() {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(`mailto:${env.EMAIL_FROM_ADDRESS}`, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export const pushService = {
  publicKey() {
    return env.VAPID_PUBLIC_KEY ?? null;
  },

  async subscribe(parentId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    // An endpoint belongs to one browser; if another parent signed in there before, it moves to this one.
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { parentId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { parentId, p256dh: sub.keys.p256dh, auth: sub.keys.auth }
    });
  },

  async unsubscribe(parentId: string, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { parentId, endpoint } });
  },

  /** Sends to every device of the parent. Returns how many got it. */
  async sendToParent(parentId: string, message: PushMessage) {
    const subs = await prisma.pushSubscription.findMany({ where: { parentId } });
    if (!subs.length) return 0;
    if (env.NODE_ENV === "test") {
      testPushOutbox.push({ parentId, message });
      return subs.length;
    }
    if (!ready()) return 0;
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 30 * 60 });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Gone: the browser unsubscribed or the app was removed.
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error(`[push] send failed (${status ?? "?"}):`, e instanceof Error ? e.message : e);
      }
    }
    return sent;
  }
};
