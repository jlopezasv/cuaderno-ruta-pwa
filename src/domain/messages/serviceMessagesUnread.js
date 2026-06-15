/** Estado local de lectura de mensajes (solo UX conductor; no persiste en servidor). */

function readKey(servicioId, userId) {
  return `cuaderno_svc_msgs_read_${servicioId}_${userId}`;
}

export function getServiceMessagesReadAt(servicioId, userId) {
  if (!servicioId || !userId) return null;
  try {
    return localStorage.getItem(readKey(servicioId, userId));
  } catch {
    return null;
  }
}

export function markServiceMessagesRead(servicioId, userId, atIso = new Date().toISOString()) {
  if (!servicioId || !userId) return;
  try {
    localStorage.setItem(readKey(servicioId, userId), atIso);
  } catch {
    /* ignore */
  }
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
