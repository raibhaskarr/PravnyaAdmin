import { Capacitor } from "@capacitor/core";

// The service worker (public/sw.js) shows reminders and keeps what the talking board needs offline.
// Web only (the Android app is a different story), and only in production builds.
export function registerServiceWorker() {
  try {
    if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  } catch {
    // Not available here.
  }
}

/** On sign-out: forget the boards and photos kept on this device for offline use. */
export async function clearOfflineData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("pv-aac-board-")) localStorage.removeItem(k);
  } catch {
    // Storage blocked.
  }
  try {
    if ("caches" in window) await caches.delete("pv-media-v1");
  } catch {
    // Not available.
  }
}
