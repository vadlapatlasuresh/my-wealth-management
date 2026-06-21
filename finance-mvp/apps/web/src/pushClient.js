// pushClient.js — enable/disable web push for THIS device.
//
// Uses the app's existing PWA service worker + the Web Push API (PushManager) with
// the server's VAPID key, then registers the resulting subscription as the device
// "token" via the backend. Entirely gated on the server: if push isn't configured
// (no VAPID key in /push/config) every call throws a clear, user-facing reason and
// nothing changes. The Settings toggle surfaces those messages.

import { api } from "./api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported() {
  return typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

/**
 * Subscribe this device to push and register the token server-side.
 * Throws an Error with a user-friendly message on any blocker.
 */
export async function enablePushOnThisDevice() {
  if (!supported()) throw new Error("This browser doesn't support push notifications.");

  const cfg = await api.getPushConfig().catch(() => null);
  if (!cfg || !cfg.enabled) throw new Error("Push isn't enabled on the server yet.");
  if (!cfg.vapidKey) throw new Error("Push isn't fully configured yet (missing VAPID key).");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cfg.vapidKey),
  });

  await api.registerDevice(JSON.stringify(sub), "web");
  return true;
}

/** Unsubscribe this device and remove the token server-side. Best-effort. */
export async function disablePushOnThisDevice() {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.unregisterDevice(JSON.stringify(sub)).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* nothing to clean up */
  }
}
