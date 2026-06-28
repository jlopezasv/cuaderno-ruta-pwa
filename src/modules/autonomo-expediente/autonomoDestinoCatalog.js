const STORAGE_PREFIX = "autonomo_destinos_v1:";

function storageKey(uid) {
  return `${STORAGE_PREFIX}${uid || "anon"}`;
}

function normalizeDestino(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nombre = String(raw.nombre || raw.cliente || raw.name || "").trim();
  if (!nombre) return null;
  return {
    id: String(raw.id || `dst-${nombre.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`),
    nombre,
    direccion: String(raw.direccion || "").trim(),
    cp: String(raw.cp || raw.codigo_postal || "").trim(),
    ciudad: String(raw.ciudad || "").trim(),
    contacto: String(raw.contacto || "").trim(),
    telefono: String(raw.telefono || "").trim(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function loadAutonomoDestinos(uid) {
  if (typeof localStorage === "undefined" || !uid) return [];
  try {
    const raw = localStorage.getItem(storageKey(uid));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeDestino).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveAutonomoDestinos(uid, list) {
  if (typeof localStorage === "undefined" || !uid) return;
  const normalized = (Array.isArray(list) ? list : []).map(normalizeDestino).filter(Boolean);
  localStorage.setItem(storageKey(uid), JSON.stringify(normalized.slice(0, 200)));
}

export function upsertAutonomoDestino(uid, destino) {
  const next = normalizeDestino(destino);
  if (!next) return loadAutonomoDestinos(uid);
  const list = loadAutonomoDestinos(uid);
  const idx = list.findIndex(
    (d) => d.id === next.id || d.nombre.toLowerCase() === next.nombre.toLowerCase(),
  );
  if (idx >= 0) list[idx] = { ...list[idx], ...next, updatedAt: new Date().toISOString() };
  else list.unshift({ ...next, updatedAt: new Date().toISOString() });
  saveAutonomoDestinos(uid, list);
  return list;
}

export function deleteAutonomoDestino(uid, destinoId, { nombre = null } = {}) {
  if (!uid) return loadAutonomoDestinos(uid);
  const id = String(destinoId || "").trim();
  const nameKey = String(nombre || "").trim().toLowerCase();
  const list = loadAutonomoDestinos(uid).filter((d) => {
    if (id && d.id === id) return false;
    if (nameKey && d.nombre.toLowerCase() === nameKey) return false;
    return true;
  });
  saveAutonomoDestinos(uid, list);
  return list;
}

export function searchAutonomoDestinos(uid, query) {
  const q = String(query || "").trim().toLowerCase();
  const list = loadAutonomoDestinos(uid);
  if (!q) return list;
  return list.filter((d) => {
    const hay = [d.nombre, d.direccion, d.cp, d.ciudad].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
