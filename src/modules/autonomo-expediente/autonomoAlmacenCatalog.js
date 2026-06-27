import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";

const STORAGE_PREFIX = "autonomo_almacenes_v1:";

function storageKey(uid) {
  return `${STORAGE_PREFIX}${uid || "anon"}`;
}

function normalizeAlmacen(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nombre = String(raw.nombre || raw.name || "").trim();
  if (!nombre) return null;
  return {
    id: String(raw.id || `alm-${nombre.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`),
    nombre,
    direccion: String(raw.direccion || "").trim(),
    cp: String(raw.cp || raw.codigo_postal || "").trim(),
    ciudad: String(raw.ciudad || "").trim(),
    contacto: String(raw.contacto || raw.persona_contacto || "").trim(),
    telefono: String(raw.telefono || "").trim(),
    cif: String(raw.cif || "").trim(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function loadAutonomoAlmacenes(uid) {
  if (typeof localStorage === "undefined" || !uid) return [];
  try {
    const raw = localStorage.getItem(storageKey(uid));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeAlmacen).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveAutonomoAlmacenes(uid, list) {
  if (typeof localStorage === "undefined" || !uid) return;
  const normalized = (Array.isArray(list) ? list : []).map(normalizeAlmacen).filter(Boolean);
  localStorage.setItem(storageKey(uid), JSON.stringify(normalized.slice(0, 200)));
}

export function upsertAutonomoAlmacen(uid, almacen) {
  const next = normalizeAlmacen(almacen);
  if (!next) return loadAutonomoAlmacenes(uid);
  const list = loadAutonomoAlmacenes(uid);
  const idx = list.findIndex(
    (a) => a.id === next.id || a.nombre.toLowerCase() === next.nombre.toLowerCase(),
  );
  if (idx >= 0) list[idx] = { ...list[idx], ...next, updatedAt: new Date().toISOString() };
  else list.unshift({ ...next, updatedAt: new Date().toISOString() });
  saveAutonomoAlmacenes(uid, list);
  return list;
}

/** Elimina un almacén del catálogo local (no afecta paradas ya registradas). */
export function deleteAutonomoAlmacen(uid, almacenId, { nombre = null } = {}) {
  if (!uid) return loadAutonomoAlmacenes(uid);
  const id = String(almacenId || "").trim();
  const nameKey = String(nombre || "").trim().toLowerCase();
  const list = loadAutonomoAlmacenes(uid).filter((a) => {
    if (id && a.id === id) return false;
    if (nameKey && a.nombre.toLowerCase() === nameKey) return false;
    return true;
  });
  saveAutonomoAlmacenes(uid, list);
  return list;
}

export function searchAutonomoAlmacenes(uid, query) {
  const q = String(query || "").trim().toLowerCase();
  const list = loadAutonomoAlmacenes(uid);
  if (!q) return list;
  return list.filter((a) => {
    const hay = [a.nombre, a.direccion, a.cp, a.ciudad, a.cif].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

/** Importa almacenes únicos desde paradas previas (empresa_logistica). */
export function mergeAlmacenesFromStops(uid, stops = []) {
  let list = loadAutonomoAlmacenes(uid);
  for (const stop of stops) {
    if (!stop) continue;
    const m = getStopOperacionMeta(stop.notas);
    const nombre = String(m.empresa_logistica || stop.nombre || "").trim();
    if (!nombre) continue;
    const candidate = normalizeAlmacen({
      nombre,
      direccion: stop.direccion,
      cp: m.codigo_postal,
      ciudad: m.provincia,
    });
    if (!candidate) continue;
    if (!list.some((a) => a.nombre.toLowerCase() === candidate.nombre.toLowerCase())) {
      list = upsertAutonomoAlmacen(uid, candidate);
    }
  }
  return list;
}
