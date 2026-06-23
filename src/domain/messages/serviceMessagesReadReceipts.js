import { sbFetch, getAuthUid } from "../../data/supabaseClient.js";
import { cacheServiceMessagesReadAt } from "./serviceMessagesUnread.js";

const TABLE = "chat_service_read_receipts";

function isMissingTableError(status) {
  return status === 404 || status === 406;
}

/** @returns {Promise<{ last_read_at: string, last_read_message_id: string | null } | null>} */
export async function fetchServiceMessageReadReceipt(servicioId, userId = getAuthUid?.()) {
  if (!servicioId || !userId) return null;
  const r = await sbFetch(
    `/rest/v1/${TABLE}?servicio_id=eq.${servicioId}&user_id=eq.${userId}&select=last_read_at,last_read_message_id&limit=1`,
  );
  if (!r.ok) {
    if (isMissingTableError(r.status)) return null;
    return null;
  }
  const rows = await r.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.last_read_at) return null;
  return {
    last_read_at: row.last_read_at,
    last_read_message_id: row.last_read_message_id ?? null,
  };
}

/**
 * Marca el chat como leído para auth.uid() en este servicio.
 * @returns {Promise<{ last_read_at: string, last_read_message_id: string | null } | null>}
 */
export async function upsertServiceMessageReadReceipt({
  servicioId,
  userId = getAuthUid?.(),
  lastReadAt = new Date().toISOString(),
  lastReadMessageId = null,
} = {}) {
  if (!servicioId || !userId) return null;

  const body = {
    servicio_id: servicioId,
    user_id: userId,
    last_read_at: lastReadAt,
    last_read_message_id: lastReadMessageId,
    updated_at: new Date().toISOString(),
  };

  const r = await sbFetch(`/rest/v1/${TABLE}?on_conflict=servicio_id,user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    if (!isMissingTableError(r.status) && typeof console !== "undefined") {
      console.warn("[service-messages] read receipt upsert failed", r.status);
    }
    return null;
  }

  const rows = await r.json().catch(() => []);
  const saved = Array.isArray(rows) ? rows[0] : rows;
  const readAt = saved?.last_read_at || lastReadAt;
  cacheServiceMessagesReadAt(servicioId, userId, readAt);
  return {
    last_read_at: readAt,
    last_read_message_id: saved?.last_read_message_id ?? lastReadMessageId ?? null,
  };
}
