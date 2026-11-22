import { Capacitor } from "@capacitor/core";
import { api } from "../api/client";

// Schedule reminders as Web Push notifications. Works in Chrome/Edge/Firefox, and on iPhone/iPad
// only once Pravnya is added to the Home Screen (Safari's rule). Not in the Android app (that
// needs Firebase; later).

export type PushState = "unsupported" | "needs-home-screen" | "off" | "on" | "blocked";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function supported() {
  try {
    return !Capacitor.isNativePlatform() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  } catch {
    return false;
  }
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "needs-home-screen" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Asks permission, subscribes this browser and tells the server. Returns the new state. */
export async function enablePush(token: string): Promise<PushState> {
  if (!supported()) return pushState();
  const { publicKey } = await api.pushKey(token);
  if (!publicKey) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.pushSubscribe(token, { endpoint: json.endpoint, keys: json.keys });
  return "on";
}

/** Keeps the server's copy fresh (subscriptions can change) when reminders are already on. */
export async function refreshPush(token: string) {
  try {
    if ((await pushState()) !== "on") return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api.pushSubscribe(token, sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
  } catch {
    // Not important enough to bother the parent about.
  }
}
