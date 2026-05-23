/**
 * Caché local de medios documentales del conductor (IndexedDB + metadatos en localStorage).
 * No modifica backend ni documentos de empresa: solo copias locales descargadas/visualizadas.
 *
 * Regla: servicios archivados (completado / cancelado / anulado) → eliminar blobs locales
 * cuando hayan pasado 5 días desde el último acceso local (o desde el archivo del servicio si nunca hubo acceso).
 */

const DB_NAME = "cuaderno_conductor_doc_cache_v1";
const STORE_NAME = "media";
const DB_VERSION = 1;

const RETENTION_LS = "cuaderno_service_local_retention_v1";

/** 5 días en ms */
export const DRIVER_LOCAL_DOC_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;

const ARCHIVED_ESTADOS = new Set(["completado", "cerrado", "cancelado", "anulado"]);

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "evidenciaId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function loadRetentionMap() {
  try {
    const raw = localStorage.getItem(RETENTION_LS);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveRetentionMap(map) {
  try {
    localStorage.setItem(RETENTION_LS, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Marca servicios no activos como archivados para la política de retención local.
 * @param {Array<{ id?: string, estado?: string }>} servicios
 */
export function syncArchivedServicesFromList(servicios) {
  if (!Array.isArray(servicios) || !servicios.length) return;
  const map = loadRetentionMap();
  const now = Date.now();
  let changed = false;
  for (const sv of servicios) {
    const id = sv?.id;
    const est = String(sv?.estado || "").toLowerCase();
    if (!id || !ARCHIVED_ESTADOS.has(est)) continue;
    const cur = map[id] || {};
    if (!cur.archivedAt) {
      map[id] = { ...cur, archivedAt: now };
      changed = true;
    }
  }
  if (changed) saveRetentionMap(map);
}

/** Marca un servicio como archivado en retención local (p. ej. pantalla “completado” en Servicio). */
export function markServiceArchived(servicioId) {
  if (!servicioId) return;
  const map = loadRetentionMap();
  const now = Date.now();
  const cur = map[servicioId] || {};
  if (cur.archivedAt) return;
  map[servicioId] = { ...cur, archivedAt: now };
  saveRetentionMap(map);
}

/** Última vez que el conductor abrió/descargó documentos locales de ese servicio en este dispositivo. */
export function touchServiceDocumentAccess(servicioId) {
  if (!servicioId) return;
  const map = loadRetentionMap();
  const cur = map[servicioId] || {};
  map[servicioId] = { ...cur, lastAccessAt: Date.now() };
  saveRetentionMap(map);
}

function effectiveRetentionAnchor(meta) {
  return meta?.lastAccessAt ?? meta?.archivedAt ?? 0;
}

function shouldPurgeService(meta, now) {
  if (!meta?.archivedAt) return false;
  const ref = effectiveRetentionAnchor(meta);
  if (!ref) return false;
  return now - ref >= DRIVER_LOCAL_DOC_RETENTION_MS;
}

async function idbGetRecord(evidenciaId) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(evidenciaId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutRecord(rec) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Obtiene blob en caché o lo descarga y guarda. Actualiza acceso local al servicio. */
export async function getDriverMediaDisplayBlob(servicioId, evidenciaId, fetchUrl) {
  if (!evidenciaId || !fetchUrl) return null;
  const urlStr = String(fetchUrl);
  if (servicioId) touchServiceDocumentAccess(servicioId);

  if (urlStr.startsWith("data:") || urlStr.startsWith("blob:")) {
    try {
      const r = await fetch(urlStr);
      const blob = await r.blob();
      return { blob, mime: blob.type || "application/octet-stream" };
    } catch {
      return null;
    }
  }

  try {
    const cached = await idbGetRecord(evidenciaId);
    if (cached?.blob) {
      return { blob: cached.blob, mime: cached.mime || cached.blob.type || "image/jpeg" };
    }
  } catch {
    /* seguir a red */
  }

  const res = await fetch(urlStr, { mode: "cors", credentials: "omit" }).catch(() => null);
  if (!res || !res.ok) return null;
  const blob = await res.blob();
  const mime = blob.type || res.headers.get("content-type") || "application/octet-stream";

  try {
    await idbPutRecord({
      evidenciaId,
      servicioId: servicioId || "",
      blob,
      mime,
      size: blob.size,
      updatedAt: Date.now(),
    });
  } catch {
    /* caché opcional */
  }

  return { blob, mime };
}

/** Elimina entradas de caché local expiradas según retención por servicio archivado. */
export async function runRetentionSweep() {
  const map = loadRetentionMap();
  const now = Date.now();
  const toPurge = [];
  for (const [sid, meta] of Object.entries(map)) {
    if (shouldPurgeService(meta, now)) toPurge.push(sid);
  }
  if (!toPurge.length) return { purgedServices: 0, removedBlobs: 0 };

  let removedBlobs = 0;
  const db = await openDb();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const st = tx.objectStore(STORE_NAME);
      const req = st.openCursor();
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return;
        const row = c.value;
        if (row?.servicioId && toPurge.includes(row.servicioId)) {
          removedBlobs += 1;
          c.delete();
        }
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  const next = { ...map };
  for (const sid of toPurge) delete next[sid];
  saveRetentionMap(next);

  return { purgedServices: toPurge.length, removedBlobs };
}

/** Limpieza manual: todo el caché documental local del conductor en este dispositivo (no toca servidor). */
export async function purgeAllConductorLocalMediaCaches() {
  const db = await openDb();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  try {
    localStorage.removeItem(RETENTION_LS);
  } catch {
    /* */
  }
  if (typeof caches !== "undefined" && caches?.keys) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("cuaderno-driver-")).map((k) => caches.delete(k)));
    } catch {
      /* */
    }
  }
  return true;
}

export async function getConductorStorageStats() {
  let idbBytes = 0;
  let cachedFiles = 0;
  const db = await openDb();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const st = tx.objectStore(STORE_NAME);
      const req = st.openCursor();
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return;
        const row = c.value;
        cachedFiles += 1;
        idbBytes += Number(row?.size) || (row?.blob && row.blob.size) || 0;
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  const retention = loadRetentionMap();
  return {
    idbBytes,
    cachedFiles,
    retentionServices: Object.keys(retention).length,
  };
}

export function formatStorageMb(bytes) {
  if (!bytes) return "0";
  return (bytes / (1024 * 1024)).toFixed(2);
}
