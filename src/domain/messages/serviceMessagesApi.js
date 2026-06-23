import { sbFetch, getAuthUid, ensureAuthAccessToken } from "../../data/supabaseClient.js";
import { upsertServiceMessageReadReceipt } from "./serviceMessagesReadReceipts.js";

function pushDebugWarn(label, payload) {
  if (typeof console !== "undefined") console.warn(`[service-messages] ${label}`, payload);
}

export function resolveServiceMessageEmpresaId(servicio) {
  const e = servicio?.empresa_id;
  if (e === undefined || e === null) return null;
  const s = String(e).trim();
  return s || null;
}

export async function listServiceMessages(servicioId) {
  if (!servicioId) return [];
  const r = await sbFetch(
    `/rest/v1/service_messages?servicio_id=eq.${servicioId}&order=created_at.asc&select=*`,
  );
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function createServiceMessage({
  servicio,
  message,
  senderName = null,
  senderRole = null,
  includeInCustomerReport = false,
}) {
  const servicioId = servicio?.id;
  if (!servicioId) throw new Error("Servicio inválido");
  const text = String(message || "").trim();
  if (!text) throw new Error("Escribe un mensaje");
  const senderUserId = getAuthUid?.() || null;
  if (!senderUserId) throw new Error("Sesión no válida");

  const body = {
    servicio_id: servicioId,
    empresa_id: resolveServiceMessageEmpresaId(servicio),
    sender_user_id: senderUserId,
    sender_name: senderName ? String(senderName).trim() : null,
    sender_role: senderRole ? String(senderRole).trim() : null,
    message: text,
    visibility: "internal",
    include_in_customer_report: !!includeInCustomerReport,
  };

  const r = await sbFetch("/rest/v1/service_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    const msg =
      data?.message ||
      data?.hint ||
      (typeof data === "string" ? data : null) ||
      `No se pudo enviar el mensaje (${r.status})`;
    throw new Error(msg);
  }
  const rows = await r.json().catch(() => []);
  const saved = Array.isArray(rows) ? rows[0] : rows;
  if (!saved?.id) throw new Error("Mensaje guardado pero no legible");

  void notifyServiceMessagePush({
    servicioId,
    senderUserId,
    senderName: body.sender_name,
    messagePreview: text.slice(0, 120),
  });

  void upsertServiceMessageReadReceipt({
    servicioId,
    userId: senderUserId,
    lastReadAt: saved.created_at || new Date().toISOString(),
    lastReadMessageId: saved.id,
  });

  return saved;
}

/** Push FCM al otro participante; no bloquea si falla. */
export async function notifyServiceMessagePush({
  servicioId,
  senderUserId,
  senderName,
  messagePreview,
}) {
  if (!servicioId || !senderUserId) return;
  try {
    const access = await ensureAuthAccessToken();
    const headers = { "Content-Type": "application/json" };
    if (access) headers.Authorization = `Bearer ${access}`;
    const res = await fetch("/api/push", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "notify_service_message",
        payload: {
          servicio_id: servicioId,
          sender_user_id: senderUserId,
          sender_name: senderName || "Equipo",
          message_preview: messagePreview || "",
        },
      }),
    });
    const text = await res.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok || json?.ok === false) {
      pushDebugWarn("push falló", { status: res.status, body: json || text?.slice(0, 300) });
    } else if (json?.skipped) {
      pushDebugWarn("push omitido", { skipped: json.skipped });
    }
  } catch (e) {
    pushDebugWarn("push error de red", e?.message || String(e));
  }
}

export function filterCustomerReportMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter((m) => m?.include_in_customer_report);
}

export function formatServiceMessageClock(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
