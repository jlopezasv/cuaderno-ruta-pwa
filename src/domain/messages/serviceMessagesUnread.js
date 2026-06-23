/** Cálculo local de no leídos; la fuente de verdad de lectura es Supabase (chat_service_read_receipts). */

function readKey(servicioId, userId) {
  return `cuaderno_svc_msgs_read_${servicioId}_${userId}`;
}

/** Caché local opcional (respaldo si falla la red al reabrir). */
export function getServiceMessagesReadAt(servicioId, userId) {
  if (!servicioId || !userId) return null;
  try {
    return localStorage.getItem(readKey(servicioId, userId));
  } catch {
    return null;
  }
}

export function cacheServiceMessagesReadAt(servicioId, userId, atIso) {
  if (!servicioId || !userId || !atIso) return;
  try {
    localStorage.setItem(readKey(servicioId, userId), atIso);
  } catch {
    /* ignore */
  }
}

/** @deprecated Usar upsertServiceMessageReadReceipt; mantiene caché local. */
export function markServiceMessagesRead(servicioId, userId, atIso = new Date().toISOString()) {
  cacheServiceMessagesReadAt(servicioId, userId, atIso);
}

export function countUnreadServiceMessages(messages, userId, readAtIso = null) {
  if (!userId || !Array.isArray(messages) || !messages.length) return 0;
  const readMs = readAtIso ? Date.parse(readAtIso) : 0;
  return messages.filter((m) => {
    if (m?.sender_user_id === userId) return false;
    const t = Date.parse(m?.created_at);
    return Number.isFinite(t) && (!readMs || t > readMs);
  }).length;
}
