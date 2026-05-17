/** Intervalos panel empresa: datos en background vs tick visual ETA. */
export const EMPRESA_FLOTA_DATA_POLL_MS = 120_000;
export const EMPRESA_UBICACION_POLL_MS = 90_000;
/** Tick visual ETA en cards (solo afecta etiquetas; sin red). */
export const EMPRESA_ETA_VISUAL_TICK_MS = 300_000;

const ESTADOS_ACTIVOS = Object.freeze(["asignado", "en_curso"]);
const ESTADOS_REFRESH_STOPS = Object.freeze(["pendiente_asignacion", "asignado", "en_curso"]);
const ESTADOS_CON_PARADAS_EMPRESA = Object.freeze(["pendiente_asignacion", "asignado", "en_curso"]);

/**
 * Actualiza una fila de flota tras asignar conductor (referencia = meta timeline/expediente).
 */
export function patchFlotaServicioTrasAsignar(prev, servicioId, { conductorId, referencia, estado = "asignado" }) {
  if (!servicioId || !Array.isArray(prev)) return prev;
  return prev.map((s) => {
    if (s.id !== servicioId) return s;
    const next = { ...s, conductor_id: conductorId, estado };
    if (referencia != null && referencia !== "") next.referencia = referencia;
    return next;
  });
}

export function stopsRowsToMap(stps) {
  const stopsMap = {};
  (Array.isArray(stps) ? stps : []).forEach((st) => {
    if (!stopsMap[st.servicio_id]) stopsMap[st.servicio_id] = [];
    stopsMap[st.servicio_id].push(st);
  });
  return stopsMap;
}

/** IDs de servicios cuyas paradas conviene refrescar en modo ligero. */
export function servicioIdsForLightStopsRefresh(svsArr, visibleServicios = []) {
  const ids = new Set();
  for (const s of svsArr || []) {
    if (ESTADOS_REFRESH_STOPS.includes(s.estado)) ids.add(s.id);
  }
  for (const s of visibleServicios || []) {
    if (s?.id) ids.add(s.id);
  }
  return [...ids];
}

/** Paradas en carga inicial: solo servicios activos (menos payload). */
export function servicioIdsForInitialStopsLoad(svsArr) {
  const ids = new Set();
  for (const s of svsArr || []) {
    if (ESTADOS_CON_PARADAS_EMPRESA.includes(s.estado)) ids.add(s.id);
  }
  return [...ids];
}

export function formatFlotaManualRefreshLabel(ts) {
  if (!ts) return null;
  const sec = (Date.now() - ts) / 1000;
  if (sec < 10) return "Actualizado ahora";
  if (sec < 60) return `Actualizado hace ${Math.round(sec)} s`;
  return `Actualizado ${new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

function servicioSyncKey(s) {
  if (!s?.id) return "";
  return `${s.id}|${s.estado}|${s.referencia}|${s.conductor_id}|${s.updated_at || ""}|${s.fecha_inicio || ""}`;
}

/** Reutiliza referencia de array si el contenido operacional no cambió (evita rerender lista). */
export function mergeFlotaServicios(prev, next) {
  if (!next?.length) return next || [];
  if (!prev?.length) return next;
  if (prev.length !== next.length) return next;
  for (let i = 0; i < next.length; i++) {
    if (prev[i].id !== next[i].id || servicioSyncKey(prev[i]) !== servicioSyncKey(next[i])) {
      return next;
    }
  }
  return prev;
}

function stopsArrayKey(stops) {
  if (!stops?.length) return "";
  return stops.map((st) => `${st.id}|${st.estado}|${st.hora_llegada_real || ""}|${st.hora_salida_real || ""}|${st.orden}`).join(";");
}

export function mergeFlotaStopsMap(prev, next) {
  if (!next) return prev || {};
  const out = { ...(prev || {}) };
  let changed = false;
  const ids = new Set([...Object.keys(prev || {}), ...Object.keys(next)]);
  for (const id of ids) {
    const p = prev?.[id] || [];
    const n = next[id] || [];
    if (stopsArrayKey(p) === stopsArrayKey(n)) {
      if (p !== n) out[id] = p;
      continue;
    }
    out[id] = n;
    changed = true;
  }
  if (!changed && prev) {
    let sameRef = true;
    for (const id of Object.keys(next)) {
      if (out[id] !== prev[id]) {
        sameRef = false;
        break;
      }
    }
    if (sameRef) return prev;
  }
  return out;
}

function evsMapKey(evs) {
  if (!evs) return "";
  return Object.keys(evs)
    .sort()
    .map((stopId) => {
      const arr = evs[stopId] || [];
      return `${stopId}:${arr.map((e) => `${e.id}|${e.tipo}|${e.created_at}`).join(",")}`;
    })
    .join(";");
}

export function mergeFlotaEvsMap(prev, next) {
  if (!next || !Object.keys(next).length) return prev || {};
  const base = prev || {};
  let out = null;
  for (const [stopId, arr] of Object.entries(next)) {
    if (!Array.isArray(arr) || !arr.length) continue;
    const cur = base[stopId] || [];
    const ids = new Set(cur.map((e) => e?.id).filter(Boolean));
    const merged = [...cur];
    let stopChanged = false;
    for (const ev of arr) {
      if (ev?.id && !ids.has(ev.id)) {
        ids.add(ev.id);
        merged.push(ev);
        stopChanged = true;
      }
    }
    if (!stopChanged) continue;
    if (!out) out = { ...base };
    out[stopId] = merged;
  }
  if (!out) return base;
  if (evsMapKey(base) === evsMapKey(out)) return base;
  return out;
}

/** Solo actualiza ubicaciones cuyo payload cambió. */
export function patchUbicacionMap(prev, patch) {
  if (!patch || !Object.keys(patch).length) return prev;
  let changed = false;
  const next = { ...prev };
  for (const [uid, loc] of Object.entries(patch)) {
    const p = prev[uid];
    if (
      p === loc ||
      (p &&
        loc &&
        p.lat === loc.lat &&
        p.lon === loc.lon &&
        (p.ts || p.updatedAt) === (loc.ts || loc.updatedAt) &&
        p.label === loc.label &&
        p.missing === loc.missing &&
        p.recent === loc.recent &&
        p.fetchError === loc.fetchError)
    ) {
      continue;
    }
    next[uid] = loc;
    changed = true;
  }
  return changed ? next : prev;
}
