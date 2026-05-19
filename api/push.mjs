import { GoogleAuth } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerEnv } from "./lib/supabaseEnv.js";

function pushSendLog(...args) {
  console.log("[push-send]", ...args);
}

function envPresence() {
  const key = process.env.FCM_SERVER_KEY || "";
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  return {
    FCM_SERVER_KEY_present: String(key).trim().length > 0,
    FCM_SERVER_KEY_length: String(key).trim().length,
    GOOGLE_APPLICATION_CREDENTIALS_present: String(gac).trim().length > 0,
    GOOGLE_APPLICATION_CREDENTIALS_length: String(gac).trim().length,
  };
}

function parseGoogleApplicationCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw || !String(raw).trim()) return null;
  try {
    const json = JSON.parse(String(raw).trim());
    if (!json?.client_email || !json?.private_key || !json?.project_id) return null;
    return json;
  } catch (_) {
    return null;
  }
}

function resolveFcmSendMethod() {
  const hasLegacy = !!(process.env.FCM_SERVER_KEY || "").trim();
  const creds = parseGoogleApplicationCredentials();
  const hasV1 = !!creds;
  let method = null;
  if (hasLegacy) method = "legacy_server_key";
  else if (hasV1) method = "http_v1";
  return { method, hasLegacy, hasV1, creds };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: String(text || "").slice(0, 8000) };
  }
}

async function sendFcmLegacy(fcmServerKey, pushBody) {
  pushSendLog("request Firebase start", { channel: "legacy", url: "https://fcm.googleapis.com/fcm/send" });
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${fcmServerKey}`,
    },
    body: JSON.stringify(pushBody),
  });
  const bodyText = await res.text();
  const parsed = parseJsonSafe(bodyText);
  pushSendLog("response Firebase exacta (legacy)", {
    statusHTTP: res.status,
    body: bodyText?.slice(0, 8000),
    parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
  });
  return { channel: "legacy_server_key", status: res.status, bodyText, parsed, ok: res.ok };
}

async function sendFcmHttpV1(credentials, { token, title, body, data }) {
  const projectId = credentials.project_id;
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const client = await auth.getClient();
  const tok = await client.getAccessToken();
  const accessToken = typeof tok === "string" ? tok : tok?.token;
  if (!accessToken) {
    throw new Error("No OAuth access token for FCM HTTP v1");
  }
  const dataStrings = {};
  for (const [k, v] of Object.entries(data || {})) {
    dataStrings[String(k)] = v == null ? "" : String(v);
  }
  const message = {
    token,
    notification: { title, body },
    data: dataStrings,
    android: { priority: "HIGH" },
    webpush: { headers: { Urgency: "high" } },
  };
  pushSendLog("request Firebase start", { channel: "http_v1", url });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });
  const bodyText = await res.text();
  const parsed = parseJsonSafe(bodyText);
  pushSendLog("response Firebase exacta (http_v1)", {
    statusHTTP: res.status,
    body: bodyText?.slice(0, 8000),
    parsed,
  });
  return { channel: "http_v1", status: res.status, bodyText, parsed, ok: res.ok };
}

function legacyResultError(parsed) {
  const r = parsed?.results?.[0];
  return r?.error || null;
}

function httpV1ShouldDeleteToken(parsed, status) {
  const err = parsed?.error;
  const statusStr = (err?.status || "").toUpperCase();
  const msg = (err?.message || "").toLowerCase();
  const code = err?.code;
  if (status === 404) return true;
  if (statusStr === "NOT_FOUND") return true;
  if (msg.includes("unregistered")) return true;
  if (msg.includes("requested entity was not found")) return true;
  if (code === 404) return true;
  return false;
}

function legacyShouldDeleteToken(parsed) {
  const err = legacyResultError(parsed);
  if (!err) return false;
  return ["InvalidRegistration", "NotRegistered", "MismatchSenderId"].includes(err);
}

async function deletePushTokenRow(supabase, token) {
  const { error } = await supabase.from("push_tokens").delete().eq("token", token);
  if (error) {
    pushSendLog("cleanup invalid tokens — delete failed", { error: error.message });
    return false;
  }
  pushSendLog("cleanup invalid tokens — deleted row", { tokenPartial: `${String(token).slice(0, 12)}…` });
  return true;
}

async function deliverFcmNotification({
  supabase,
  token,
  title,
  bodyText,
  data,
  legacyPayload,
}) {
  const presence = envPresence();
  pushSendLog("env vars presence (no secret values)", presence);
  const { method, creds } = resolveFcmSendMethod();
  pushSendLog("método envío", {
    method: method || "none",
    legacy_server_key: method === "legacy_server_key",
    http_v1: method === "http_v1",
  });
  if (!method) {
    pushSendLog("resultado delivery final", { success: false, reason: "no_fcm_sender_configured" });
    return {
      success: false,
      channel: null,
      status: 503,
      bodyText: "Configure FCM_SERVER_KEY or GOOGLE_APPLICATION_CREDENTIALS (service account JSON)",
      parsed: null,
      cleanup: false,
    };
  }

  let sendResult;
  if (method === "legacy_server_key") {
    sendResult = await sendFcmLegacy(process.env.FCM_SERVER_KEY.trim(), legacyPayload);
  } else {
    sendResult = await sendFcmHttpV1(creds, { token, title, body: bodyText, data });
  }

  const { channel, status, bodyText: fcmResponseBody, parsed, ok } = sendResult;
  pushSendLog("status HTTP Firebase", status);
  pushSendLog("body Firebase (truncado en logs arriba)", { length: fcmResponseBody?.length });

  let cleanup = false;
  if (method === "legacy_server_key") {
    const legacyErr = legacyResultError(parsed);
    const r0 = parsed?.results?.[0];
    const legacyOk = ok && !!r0?.message_id && !r0?.error;
    if (legacyShouldDeleteToken(parsed)) {
      cleanup = await deletePushTokenRow(supabase, token);
    }
    pushSendLog("resultado delivery final", {
      success: legacyOk,
      channel,
      httpStatus: status,
      legacyError: legacyErr,
      cleanup,
    });
    return { success: legacyOk, channel, status, bodyText: fcmResponseBody, parsed, cleanup };
  }

  const v1Ok = ok && !!parsed?.name && !parsed?.error;
  if (httpV1ShouldDeleteToken(parsed, status)) {
    cleanup = await deletePushTokenRow(supabase, token);
  }
  pushSendLog("resultado delivery final", {
    success: v1Ok,
    channel,
    httpStatus: status,
    cleanup,
    fcmError: parsed?.error || null,
  });
  return { success: v1Ok, channel, status, bodyText: fcmResponseBody, parsed, cleanup };
}

function getServiceSupabase(sbUrl, sbServiceKey) {
  return createClient(sbUrl, sbServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function bearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authUserIdFromBearer(supabase, accessToken) {
  if (!accessToken) return { userId: null, error: "missing_authorization_bearer" };
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) return { userId: null, error: error?.message || "invalid_bearer" };
  return { userId: data.user.id, error: null };
}

/**
 * Solo el jefe de flota (owner del servicio vía empresa_id o flota conductor_empresa)
 * puede disparar push de asignación hacia el conductor del servicio.
 * service_role bypassa RLS: obligatorio validar aquí.
 */
async function assertCallerMayNotifyAssignment(supabase, callerUserId, servicioId, conductorId) {
  if (!servicioId || !callerUserId || !conductorId) return false;
  const { data: s, error } = await supabase
    .from("servicios")
    .select("id, conductor_id, empresa_id")
    .eq("id", servicioId)
    .maybeSingle();
  if (error || !s || s.conductor_id !== conductorId) return false;
  if (s.empresa_id) {
    const { data: emp } = await supabase
      .from("empresas")
      .select("id")
      .eq("id", s.empresa_id)
      .eq("owner_id", callerUserId)
      .maybeSingle();
    if (emp) return true;
  }
  const { data: memberships, error: ceErr } = await supabase
    .from("conductor_empresa")
    .select("empresa_id")
    .eq("user_id", s.conductor_id)
    .or("activo.eq.true,activo.is.null");
  if (ceErr || !memberships?.length) return false;
  for (const row of memberships) {
    const { data: own } = await supabase
      .from("empresas")
      .select("id")
      .eq("id", row.empresa_id)
      .eq("owner_id", callerUserId)
      .maybeSingle();
    if (own) return true;
  }
  return false;
}

function resolveActionAndPayload(req) {
  const raw = req.body && typeof req.body === "object" ? req.body : {};
  const action = req.query?.action || raw.action;
  let payload = {};
  if (raw.payload != null && typeof raw.payload === "object") {
    payload = raw.payload;
  } else if (action === "test_send") {
    payload = {
      title: raw.title || "Cuaderno — prueba push",
      body: raw.body || "test_send OK",
    };
  }
  return { action, payload };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
      code: "PUSH_METHOD_NOT_ALLOWED",
    });
  }

  try {
    const { action, payload } = resolveActionAndPayload(req);
    const { url: sbUrl, serviceRoleKey: sbServiceKey } = getSupabaseServerEnv();

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "Missing action (body.action o ?action=)",
        code: "PUSH_BAD_REQUEST",
      });
    }

    if (action === "vapid_key") {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      if (!publicKey) {
        return res.status(503).json({
          ok: false,
          error: "VAPID public key not configured",
          code: "PUSH_NOT_CONFIGURED",
        });
      }
      return res.status(200).json({ ok: true, publicKey });
    }

    if (action === "fcm_config") {
      return res.status(200).json({
        ok: true,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || null,
      });
    }

    if (action === "register_fcm_token") {
      const token = payload?.token;
      const platform = payload?.platform || "web";
      if (!token) {
        return res.status(400).json({
          ok: false,
          error: "Invalid token payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      if (!sbServiceKey) {
        return res.status(503).json({
          ok: false,
          error: "SUPABASE_SERVICE_ROLE_KEY not configured",
          code: "PUSH_NOT_CONFIGURED",
        });
      }
      const supabase = getServiceSupabase(sbUrl, sbServiceKey);
      const accessToken = bearerToken(req);
      const { userId, error: authErr } = await authUserIdFromBearer(supabase, accessToken);
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: authErr || "Authorization: Bearer <access_token> requerido",
          code: "PUSH_UNAUTHORIZED",
        });
      }
      const row = {
        user_id: userId,
        token,
        platform,
        pwa_installed: !!payload?.pwa_installed,
        ua: payload?.ua || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("push_tokens").upsert(row, { onConflict: "token" });
      if (error) {
        return res.status(500).json({
          ok: false,
          error: error.message,
          code: error.code || "PUSH_TOKEN_UPSERT_FAILED",
          details: error.details || null,
          hint: error.hint || null,
        });
      }
      return res.status(200).json({ ok: true, upserted: true });
    }

    if (action === "revoke_fcm_token") {
      const token = payload?.token;
      if (!token) {
        return res.status(400).json({ ok: false, error: "Invalid revoke payload", code: "PUSH_BAD_REQUEST" });
      }
      if (!sbServiceKey) {
        return res.status(503).json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured", code: "PUSH_NOT_CONFIGURED" });
      }
      const supabase = getServiceSupabase(sbUrl, sbServiceKey);
      const accessToken = bearerToken(req);
      const { userId, error: authErr } = await authUserIdFromBearer(supabase, accessToken);
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: authErr || "Authorization: Bearer <access_token> requerido",
          code: "PUSH_UNAUTHORIZED",
        });
      }
      const { error } = await supabase.from("push_tokens").delete().eq("user_id", userId).eq("token", token);
      if (error) {
        return res.status(500).json({ ok: false, error: error.message, code: "PUSH_TOKEN_REVOKE_FAILED" });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "notify_assignment") {
      const conductorId = payload?.conductor_id;
      const servicioId = payload?.servicio_id ?? null;
      pushSendLog("notify_assignment start", { servicio_id: servicioId, conductor_id: conductorId });
      if (!conductorId) {
        return res.status(400).json({ ok: false, error: "Missing conductor_id", code: "PUSH_BAD_REQUEST" });
      }
      if (!sbServiceKey) {
        return res.status(503).json({
          ok: false,
          error: "SUPABASE_SERVICE_ROLE_KEY not configured",
          code: "PUSH_NOT_CONFIGURED",
        });
      }
      const supabaseAuth = getServiceSupabase(sbUrl, sbServiceKey);
      const accessToken = bearerToken(req);
      const { userId: callerId, error: authErr } = await authUserIdFromBearer(supabaseAuth, accessToken);
      if (!callerId) {
        return res.status(401).json({
          ok: false,
          error: authErr || "Authorization: Bearer <access_token> requerido",
          code: "PUSH_UNAUTHORIZED",
        });
      }
      const allowed = await assertCallerMayNotifyAssignment(supabaseAuth, callerId, servicioId, conductorId);
      if (!allowed) {
        pushSendLog("notify_assignment forbidden", { caller_partial: String(callerId).slice(0, 8) });
        return res.status(403).json({
          ok: false,
          error: "No autorizado para notificar este servicio",
          code: "PUSH_FORBIDDEN",
        });
      }
      const { method } = resolveFcmSendMethod();
      if (!method) {
        pushSendLog("notify_assignment abort — no FCM sender", envPresence());
        return res.status(503).json({
          ok: false,
          error: "Push not configured: set FCM_SERVER_KEY (legacy) or GOOGLE_APPLICATION_CREDENTIALS (HTTP v1 JSON)",
          code: "PUSH_NOT_CONFIGURED",
        });
      }

      const supabase = getServiceSupabase(sbUrl, sbServiceKey);
      const { data: tokenRows, error: qErr } = await supabase
        .from("push_tokens")
        .select("token,updated_at")
        .eq("user_id", conductorId)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (qErr) {
        pushSendLog("tokens query failed", qErr.message);
        return res.status(500).json({ ok: false, error: qErr.message, code: "PUSH_TOKEN_READ_FAILED" });
      }

      const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
      pushSendLog("tokens encontrados", {
        count: tokens.length,
        partials: tokens.map((t) => (t.length > 20 ? `${t.slice(0, 10)}…${t.slice(-6)}` : "(short)")),
      });

      if (!tokens.length) {
        pushSendLog("resultado delivery final", { success: false, skipped: "no_token" });
        return res.status(200).json({ ok: true, skipped: "no_token" });
      }

      const token = tokens[0];
      const route = payload?.route || "Nuevo servicio";
      const salida = payload?.salida || "";
      const bodyText = salida ? `${route}\nSalida ${salida}` : route;
      const title = "Nuevo servicio asignado";
      const data = {
        url: "/?tab=servicio",
        kind: "service_assignment",
        servicio_id: servicioId != null ? String(servicioId) : "",
      };
      const legacyPayload = {
        to: token,
        priority: "high",
        notification: {
          title,
          body: bodyText,
          click_action: "/?tab=servicio",
          icon: "/icons/icon-192.png",
        },
        data: {
          url: "/?tab=servicio",
          kind: "service_assignment",
          servicio_id: data.servicio_id,
        },
      };
      pushSendLog("payload FCM (legacy shape / datos compartidos v1)", {
        title,
        bodyPreview: bodyText?.slice(0, 200),
        data,
        toPartial: token.length > 20 ? `${token.slice(0, 10)}…${token.slice(-6)}` : token,
      });

      const delivery = await deliverFcmNotification({
        supabase,
        token,
        title,
        bodyText,
        data,
        legacyPayload,
      });

      if (!delivery.success) {
        return res.status(delivery.status >= 400 ? delivery.status : 502).json({
          ok: false,
          error: delivery.bodyText?.slice(0, 2000),
          code: "PUSH_SEND_FAILED",
          channel: delivery.channel,
          cleanup: delivery.cleanup,
        });
      }
      return res.status(200).json({
        ok: true,
        channel: delivery.channel,
        cleanup: delivery.cleanup,
        response: delivery.bodyText?.slice(0, 4000),
      });
    }

    if (action === "test_send") {
      pushSendLog("test_send start", { queryAction: !!req.query?.action });
      if (!sbServiceKey) {
        return res.status(503).json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured", code: "PUSH_NOT_CONFIGURED" });
      }
      const authHeader = req.headers.authorization || "";
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!m) {
        return res.status(401).json({
          ok: false,
          error: "Authorization: Bearer <access_token> requerido",
          code: "PUSH_UNAUTHORIZED",
        });
      }
      const accessToken = m[1].trim();
      const supabase = getServiceSupabase(sbUrl, sbServiceKey);
      const { data: userData, error: authErr } = await supabase.auth.getUser(accessToken);
      if (authErr || !userData?.user?.id) {
        pushSendLog("test_send auth failed", { message: authErr?.message || "no user" });
        return res.status(401).json({
          ok: false,
          error: authErr?.message || "Sesión inválida",
          code: "PUSH_UNAUTHORIZED",
        });
      }
      const userId = userData.user.id;
      pushSendLog("test_send usuario", { user_id_partial: userId.slice(0, 8) + "…" });

      const { method } = resolveFcmSendMethod();
      if (!method) {
        return res.status(503).json({
          ok: false,
          error: "Configure FCM_SERVER_KEY or GOOGLE_APPLICATION_CREDENTIALS",
          code: "PUSH_NOT_CONFIGURED",
        });
      }

      const { data: tokenRows, error: qErr } = await supabase
        .from("push_tokens")
        .select("token,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (qErr) {
        return res.status(500).json({ ok: false, error: qErr.message, code: "PUSH_TOKEN_READ_FAILED" });
      }
      const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
      pushSendLog("test_send tokens encontrados", { count: tokens.length });

      if (!tokens.length) {
        return res.status(400).json({ ok: false, error: "Sin token FCM para este usuario", code: "PUSH_NO_TOKEN" });
      }

      const token = tokens[0];
      const title = payload?.title || "Cuaderno — prueba push";
      const bodyText = payload?.body || "test_send: notificación manual desde backend.";
      const data = { url: "/?tab=servicio", kind: "test_send" };
      const legacyPayload = {
        to: token,
        priority: "high",
        notification: { title, body: bodyText, icon: "/icons/icon-192.png" },
        data,
      };
      pushSendLog("test_send payload FCM", { title, bodyPreview: bodyText?.slice(0, 200), data });

      const delivery = await deliverFcmNotification({
        supabase,
        token,
        title,
        bodyText,
        data,
        legacyPayload,
      });

      if (!delivery.success) {
        return res.status(delivery.status >= 400 ? delivery.status : 502).json({
          ok: false,
          error: delivery.bodyText?.slice(0, 2000),
          code: "PUSH_SEND_FAILED",
          channel: delivery.channel,
          cleanup: delivery.cleanup,
        });
      }
      return res.status(200).json({
        ok: true,
        channel: delivery.channel,
        cleanup: delivery.cleanup,
        response: delivery.bodyText?.slice(0, 4000),
      });
    }

    if (action === "subscribe") {
      const userId = payload?.user_id;
      const subscription = payload?.subscription;
      if (!userId || !subscription) {
        return res.status(400).json({
          ok: false,
          error: "Invalid subscribe payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "schedule") {
      const userId = payload?.user_id;
      const fireAt = payload?.fire_at;
      const title = payload?.title;
      const body = payload?.body;
      const tag = payload?.tag;
      if (!userId || !fireAt || !title || !body || !tag) {
        return res.status(400).json({
          ok: false,
          error: "Invalid schedule payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      return res.status(200).json({
        ok: true,
        accepted: true,
        mode: "noop",
      });
    }

    if (action === "cancel") {
      const userId = payload?.user_id;
      const tag = payload?.tag;
      if (!userId || !tag) {
        return res.status(400).json({
          ok: false,
          error: "Invalid cancel payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      return res.status(200).json({
        ok: true,
        accepted: true,
        mode: "noop",
      });
    }

    return res.status(501).json({
      ok: false,
      error: `Action not implemented: ${action}`,
      code: "NOT_IMPLEMENTED",
    });
  } catch (error) {
    pushSendLog("handler exception", error?.message || String(error), error?.stack);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error",
      code: "PUSH_INTERNAL",
    });
  }
}
