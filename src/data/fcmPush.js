import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getUserId, sbFetch, getAccessToken } from "./supabaseClient";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
const TOKEN_CACHE_KEY = "cuaderno_fcm_token_v1";

/** localStorage: cuaderno_push_debug = "1" */
export const PUSH_DEBUG_LS_KEY = "cuaderno_push_debug";
/** sessionStorage: activa panel sin recargar (temporal) */
export const PUSH_DEBUG_SESSION_KEY = "cuaderno_push_debug_ui";

/**
 * Panel de diagnóstico push visible en producción si:
 * - URL contiene ?pushdebug=1
 * - localStorage[PUSH_DEBUG_LS_KEY] === "1"
 * - VITE_SHOW_PUSH_DEBUG === "true" (Vercel)
 * - import.meta.env.DEV
 */
export function isPushDebugEnvironmentEnabled() {
  if (import.meta.env.DEV) return true;
  if (import.meta.env.VITE_SHOW_PUSH_DEBUG === "true") return true;
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("pushdebug") === "1") return true;
    if (localStorage.getItem(PUSH_DEBUG_LS_KEY) === "1") return true;
  } catch (_) {}
  return false;
}

export function isPushDebugSessionEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PUSH_DEBUG_SESSION_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function enablePushDebugSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PUSH_DEBUG_SESSION_KEY, "1");
  } catch (_) {}
}

function pushLog(...args) {
  console.log("[push]", ...args);
}

function partialToken(token) {
  if (!token || typeof token !== "string") return null;
  if (token.length <= 24) return `${token.slice(0, 6)}…(${token.length})`;
  return `${token.slice(0, 12)}…${token.slice(-8)} (${token.length} chars)`;
}

function partialUid(uid) {
  if (!uid) return null;
  return uid.length > 12 ? `${uid.slice(0, 8)}…` : uid;
}

export function getPushBrowserSupport() {
  const sw = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const notification = typeof window !== "undefined" && "Notification" in window;
  const pushManager = typeof window !== "undefined" && "PushManager" in window;
  return { serviceWorker: sw, Notification: notification, PushManager: pushManager };
}

function isIosFamily() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function getPwaDiagnostics() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const standaloneMatch =
    typeof window !== "undefined"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;
  const navigatorStandalone =
    typeof navigator !== "undefined" && navigator.standalone === true;
  const ios = isIosFamily();
  const safariLike =
    !!ua && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua);
  return {
    displayModeStandalone: standaloneMatch,
    navigatorStandalone,
    iosFamily: ios,
    iosPwaInstalled: ios && (standaloneMatch || navigatorStandalone),
    safariLike,
    userAgent: ua,
  };
}

function ensureFirebaseApp(trace) {
  try {
    if (getApps().length) {
      const app = getApp();
      pushLog("firebase initialize success (existing app)", { name: app?.name });
      trace.firebase = { ok: true, reused: true };
      return app;
    }
    const app = initializeApp(firebaseConfig);
    pushLog("firebase initialize success (new app)", { projectId: firebaseConfig.projectId || null });
    trace.firebase = { ok: true, reused: false };
    return app;
  } catch (e) {
    const msg = e?.message || String(e);
    pushLog("firebase initialize fail", msg, e);
    trace.firebase = { ok: false, error: msg };
    throw e;
  }
}

async function registerTokenOnBackend(token, context = {}, trace) {
  const uid = getUserId();
  if (!uid || !token) return { ok: false, skipped: true };
  const payload = {
    user_id: uid,
    token,
    platform: context.platform || "web",
    pwa_installed: !!context.pwaInstalled,
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
  pushLog("register_fcm_token request payload", {
    user_id: partialUid(uid),
    token: partialToken(token),
    platform: payload.platform,
    pwa_installed: payload.pwa_installed,
    ua_length: (payload.ua || "").length,
  });
  trace.registerPayload = {
    user_id: partialUid(uid),
    token: partialToken(token),
    platform: payload.platform,
    pwa_installed: payload.pwa_installed,
  };
  try {
    const access = getAccessToken();
    const headers = { "Content-Type": "application/json" };
    if (access) headers.Authorization = `Bearer ${access}`;
    const res = await fetch("/api/push", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "register_fcm_token", payload }),
    });
    const text = await res.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      pushLog("register_fcm_token response error", { status: res.status, body: text?.slice(0, 2000) });
      trace.registerResponse = { ok: false, status: res.status, body: text?.slice(0, 2000) };
      return { ok: false, status: res.status, body: text };
    }
    pushLog("register_fcm_token response ok", { status: res.status, json });
    trace.registerResponse = { ok: true, status: res.status, json };
    return { ok: true, status: res.status, json };
  } catch (e) {
    const msg = e?.message || String(e);
    pushLog("register_fcm_token fetch error", msg, e);
    trace.registerResponse = { ok: false, error: msg };
    return { ok: false, error: msg };
  }
}

async function revokeTokenOnBackend(token) {
  const uid = getUserId();
  if (!uid || !token) return;
  const access = getAccessToken();
  const headers = { "Content-Type": "application/json" };
  if (access) headers.Authorization = `Bearer ${access}`;
  await fetch("/api/push", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "revoke_fcm_token",
      payload: { token },
    }),
  }).catch(() => {});
}

/**
 * @param {{ showToast?: (m: string) => void }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string, token?: string|null, trace: Record<string, unknown> }>}
 */
export async function initFcmPush({ showToast } = {}) {
  const trace = {
    startedAt: new Date().toISOString(),
    browser: getPushBrowserSupport(),
    pwa: getPwaDiagnostics(),
    permissionInitial:
      typeof Notification !== "undefined" ? Notification.permission : "unavailable",
  };

  pushLog("initFcmPush start", { startedAt: trace.startedAt });
  pushLog("soporte navegador", trace.browser);
  pushLog("estado PWA / iOS", {
    displayModeStandalone: trace.pwa.displayModeStandalone,
    navigatorStandalone: trace.pwa.navigatorStandalone,
    iosFamily: trace.pwa.iosFamily,
  });
  pushLog("Notification.permission (initial)", trace.permissionInitial);

  const uid = getUserId();
  if (!uid) {
    pushLog("initFcmPush early exit: no_user", { uid: null });
    return { ok: false, reason: "no_user", trace };
  }
  pushLog("initFcmPush session user", { uid: partialUid(uid) });

  if (!trace.browser.serviceWorker || !trace.browser.Notification) {
    pushLog("initFcmPush early exit: unsupported (missing SW or Notification)");
    return { ok: false, reason: "unsupported", trace };
  }

  const ios = trace.pwa.iosFamily;
  const standalone = trace.pwa.displayModeStandalone || trace.pwa.navigatorStandalone;
  if (ios && !standalone) {
    showToast?.("Instala la app en pantalla de inicio para recibir servicios en tiempo real.");
    pushLog("initFcmPush early exit: ios_not_installed");
    return { ok: false, reason: "ios_not_installed", trace };
  }

  const missing = [];
  if (!vapidKey) missing.push("VITE_FIREBASE_VAPID_KEY");
  if (!firebaseConfig.projectId) missing.push("VITE_FIREBASE_PROJECT_ID");
  if (!firebaseConfig.messagingSenderId) missing.push("VITE_FIREBASE_MESSAGING_SENDER_ID");
  if (!firebaseConfig.appId) missing.push("VITE_FIREBASE_APP_ID");
  if (missing.length) {
    pushLog("initFcmPush early exit: missing_config", { missing });
    return { ok: false, reason: "missing_config", trace: { ...trace, missingConfig: missing } };
  }

  const supported = await isSupported().catch((e) => {
    pushLog("isSupported() threw", e?.message || String(e), e);
    return false;
  });
  trace.messagingSupported = supported;
  if (!supported) {
    pushLog("initFcmPush early exit: messaging_not_supported");
    return { ok: false, reason: "messaging_not_supported", trace };
  }

  let registration;
  try {
    pushLog("serviceWorker register start", { url: "/sw.js", scope: "/" });
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    pushLog("serviceWorker register success", {
      scope: registration?.scope,
      active: !!registration?.active,
      installing: !!registration?.installing,
      waiting: !!registration?.waiting,
    });
    trace.swRegister = { ok: true, scope: registration?.scope };
  } catch (e) {
    const msg = e?.message || String(e);
    pushLog("serviceWorker register fail", msg, e);
    trace.swRegister = { ok: false, error: msg };
    return { ok: false, reason: "sw_register_failed", error: msg, trace };
  }

  await navigator.serviceWorker.ready.catch(() => {});
  pushLog("serviceWorker ready");

  const permission = await Notification.requestPermission();
  trace.permissionAfterRequest = permission;
  pushLog("Notification.permission (after request)", permission);

  if (permission !== "granted") {
    const cached = localStorage.getItem(TOKEN_CACHE_KEY) || "";
    if (cached) {
      await revokeTokenOnBackend(cached);
      localStorage.removeItem(TOKEN_CACHE_KEY);
    }
    pushLog("initFcmPush early exit: permission_denied");
    return { ok: false, reason: "permission_denied", trace };
  }

  let app;
  try {
    app = ensureFirebaseApp(trace);
  } catch {
    return { ok: false, reason: "firebase_init_failed", trace };
  }

  let messaging;
  try {
    messaging = getMessaging(app);
    pushLog("getMessaging success");
    trace.getMessaging = { ok: true };
  } catch (e) {
    const msg = e?.message || String(e);
    pushLog("getMessaging fail", msg, e);
    trace.getMessaging = { ok: false, error: msg };
    return { ok: false, reason: "get_messaging_failed", error: msg, trace };
  }

  pushLog("getToken start", { vapidKeyPresent: !!vapidKey, vapidKeyLength: vapidKey?.length || 0 });
  trace.getTokenStart = { vapidKeyPresent: !!vapidKey };

  let token;
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    const code = e?.code;
    pushLog("getToken fail", { message: msg, code, error: e });
    trace.getToken = { ok: false, message: msg, code };
    return { ok: false, reason: "get_token_failed", error: msg, code, trace };
  }

  if (!token) {
    pushLog("getToken success but empty token");
    trace.getToken = { ok: false, empty: true };
    return { ok: false, reason: "no_token", trace };
  }

  pushLog("getToken success", { token: partialToken(token) });
  trace.getToken = { ok: true, tokenPartial: partialToken(token) };

  const prevToken = localStorage.getItem(TOKEN_CACHE_KEY) || "";
  if (prevToken && prevToken !== token) await revokeTokenOnBackend(prevToken);

  const regResult = await registerTokenOnBackend(
    token,
    { platform: ios ? "ios_pwa" : "android_web", pwaInstalled: standalone },
    trace
  );
  trace.registerBackendOk = regResult?.ok === true;

  try {
    await sbFetch(`/rest/v1/profiles?id=eq.${uid}`, {
      method: "PATCH",
      body: JSON.stringify({
        fcm_token: token,
        fcm_platform: ios ? "ios_pwa" : "android_web",
        fcm_updated_at: new Date().toISOString(),
      }),
    });
  } catch (_) {
    // optional columns
  }

  onMessage(messaging, (payload) => {
    const n = payload?.notification;
    if (n?.title || n?.body) {
      showToast?.(`${n.title || "Aviso"}${n.body ? ` · ${n.body}` : ""}`);
    }
  });

  localStorage.setItem(TOKEN_CACHE_KEY, token);
  pushLog("initFcmPush complete", { token: partialToken(token), registerBackendOk: trace.registerBackendOk });

  return { ok: true, token, trace };
}

export function getPushClientContext() {
  return {
    ios: isIosFamily(),
    standalone: isStandalonePwa(),
    permission: typeof Notification !== "undefined" ? Notification.permission : "denied",
    browser: getPushBrowserSupport(),
    pwa: getPwaDiagnostics(),
  };
}
