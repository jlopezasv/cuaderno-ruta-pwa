const STORAGE_PREFIX = "cuaderno_archived_autonomo_expedientes_v1:";

function storageKey(uid) {
  return `${STORAGE_PREFIX}${uid || "anon"}`;
}

export function loadArchivedAutonomoExpedienteIds(uid) {
  if (typeof localStorage === "undefined" || !uid) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(uid));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function saveArchivedAutonomoExpedienteIds(uid, ids) {
  if (typeof localStorage === "undefined" || !uid) return;
  const list = [...(ids instanceof Set ? ids : new Set(ids))].filter(Boolean);
  localStorage.setItem(storageKey(uid), JSON.stringify(list.slice(0, 500)));
}

export function archiveAutonomoExpedienteLocal(uid, servicioId) {
  if (!uid || !servicioId) return;
  const ids = loadArchivedAutonomoExpedienteIds(uid);
  ids.add(servicioId);
  saveArchivedAutonomoExpedienteIds(uid, ids);
}

export function isAutonomoExpedienteArchived(uid, servicioId) {
  if (!servicioId) return false;
  return loadArchivedAutonomoExpedienteIds(uid).has(servicioId);
}
