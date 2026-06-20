import { servicioPendienteAsignacion } from "../../domain/fleet/servicioAssignment.js";
import { getServicioOperacionMeta } from "../../domain/service/serviceOperacionMeta.js";
import { getServicioAlcance } from "../../domain/service/servicioAlcance.js";
import { ETA_UI_VISUAL_TICK_MS } from "../../domain/service/operationalEtaPresentation.js";

const EMPRESA_VISTA_ESTADOS_COMPLETADOS = Object.freeze(["completado", "cerrado"]);

/**
 * Misma regla que el listado Servicios (pestaña activa).
 * @param {object} ctx — { archivedExpedienteIds, flotaStops, flotaEvs, countIncidencias(servicioId, flotaStops, flotaEvs) }
 */
export function servicioMatchesEmpresaVistaTab(servicio, tab, ctx = {}) {
  if (!servicio?.id || !tab) return true;
  if (tab === "todos") return servicio.estado !== "anulado";

  const archived = ctx.archivedExpedienteIds;
  const archSet =
    archived instanceof Set ? archived : new Set(Array.isArray(archived) ? archived : []);

  if (tab === "activos") return false;
  if (tab === "en_curso") return servicio.estado === "en_curso";
  if (tab === "asignados") return servicio.estado === "asignado";
  if (tab === "sin_asignar") return servicioPendienteAsignacion(servicio);
  if (tab === "completados") return EMPRESA_VISTA_ESTADOS_COMPLETADOS.includes(servicio.estado);
  if (tab === "archivados") return archSet.has(servicio.id);
  if (tab === "anulados") return servicio.estado === "anulado";
  return true;
}

export function filterServiciosForEmpresaVistaTab(servicios, tab, ctx = {}) {
  const list = Array.isArray(servicios) ? servicios : [];
  const effectiveTab = tab || "todos";
  return list.filter((sv) => servicioMatchesEmpresaVistaTab(sv, effectiveTab, ctx));
}

/** Si el servicio ya no encaja en la pestaña, usar "todos" para no desmontar la card expandida. */
export function resolveEmpresaVistaTabKeepingExpandedServicio(currentTab, servicio, ctx = {}) {
  if (servicioMatchesEmpresaVistaTab(servicio, currentTab, ctx)) return currentTab;
  if (servicio?.estado === "anulado") return "anulados";
  return "todos";
}

/** Intervalos panel empresa: datos en background vs tick visual ETA. */
export const EMPRESA_FLOTA_DATA_POLL_MS = 120_000;
export const EMPRESA_UBICACION_POLL_MS = 90_000;
/** Tick visual ETA en cards (textos auxiliares; sin red). */
export const EMPRESA_ETA_VISUAL_TICK_MS = ETA_UI_VISUAL_TICK_MS;

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
  return `${s.id}|${s.estado}|${s.referencia}|${getServicioAlcance(s)}|${s.conductor_id}|${s.updated_at || ""}|${s.fecha_inicio || ""}`;
}

function parseServicioUpdatedAtMs(servicio) {
  const raw = servicio?.updated_at;
  if (raw == null || raw === "") return 0;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/** Marca temporal más reciente embebida en referencia (p. ej. tras bootstrap al asignar). */
function referenciaOperationalMetaMs(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  const candidates = [
    meta?.conductor_assigned_at,
    meta?.operational_plan_confirmed_at,
    meta?.operational_trip_started_at,
    meta?.operational_eta?.calculated_at,
    meta?.operational_eta?.updated_at,
  ].filter(Boolean);
  let max = 0;
  for (const iso of candidates) {
    const t = Date.parse(String(iso));
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

function servicioOperationalFreshnessMs(servicio) {
  return Math.max(parseServicioUpdatedAtMs(servicio), referenciaOperationalMetaMs(servicio));
}

function pickNewerReferencia(local, server) {
  const localRef = local?.referencia;
  const serverRef = server?.referencia;
  if (localRef == null || localRef === "") return serverRef ?? localRef;
  if (serverRef == null || serverRef === "") return localRef;
  const lMs = referenciaOperationalMetaMs(local);
  const sMs = referenciaOperationalMetaMs(server);
  if (lMs !== sMs) return lMs > sMs ? localRef : serverRef;
  return String(localRef).length >= String(serverRef).length ? localRef : serverRef;
}

/** true si la fila local debe conservar conductor/estado/referencia tras un refresh con servidor desfasado. */
export function isLocalFlotaServicioAssignNewer(local, server) {
  if (!local?.id || !server?.id || local.id !== server.id) return false;

  const localMeta = getServicioOperacionMeta(local);
  const serverMeta = getServicioOperacionMeta(server);

  if (local?.conductor_id && !server?.conductor_id) return true;
  if (localMeta?.conductor_assigned_at && !serverMeta?.conductor_assigned_at) return true;
  if (
    local?.conductor_id &&
    local.estado === "asignado" &&
    server?.estado === "pendiente_asignacion"
  ) {
    return true;
  }

  const localMs = servicioOperationalFreshnessMs(local);
  const serverMs = servicioOperationalFreshnessMs(server);
  if (localMs !== serverMs) return localMs > serverMs;

  if (local?.conductor_id && local.conductor_id === server?.conductor_id) {
    return referenciaOperationalMetaMs(local) > referenciaOperationalMetaMs(server);
  }

  return false;
}

/** Fusiona una fila: base servidor + campos sensibles a asignación si local es más reciente. */
export function mergeFlotaServicioRow(local, server) {
  if (!server) return local;
  if (!local || local.id !== server.id) return server;

  const merged = { ...server };
  if (isLocalFlotaServicioAssignNewer(local, server)) {
    if (local.conductor_id != null) merged.conductor_id = local.conductor_id;
    if (local.estado != null) merged.estado = local.estado;
    if (local.referencia != null && local.referencia !== "") merged.referencia = local.referencia;
  } else if (local?.conductor_id && local.conductor_id === server?.conductor_id) {
    merged.referencia = pickNewerReferencia(local, server);
  }
  return merged;
}

/** Reutiliza referencia de array si el contenido operacional no cambió (evita rerender lista). */
export function mergeFlotaServicios(prev, next) {
  if (!next?.length) return next || [];
  if (!prev?.length) return next;

  const prevById = new Map();
  for (const row of prev) {
    if (row?.id) prevById.set(row.id, row);
  }

  const mergedRows = next.map((serverRow) => {
    const localRow = prevById.get(serverRow?.id);
    if (!localRow) return serverRow;
    if (servicioSyncKey(localRow) === servicioSyncKey(serverRow)) return localRow;
    return mergeFlotaServicioRow(localRow, serverRow);
  });

  if (mergedRows.length === prev.length) {
    let sameAsPrev = true;
    for (let i = 0; i < prev.length; i++) {
      if (mergedRows[i] !== prev[i]) {
        sameAsPrev = false;
        break;
      }
    }
    if (sameAsPrev) return prev;
  }

  for (let i = 0; i < mergedRows.length; i++) {
    const row = mergedRows[i];
    const pr = prevById.get(row?.id);
    if (pr && servicioSyncKey(pr) === servicioSyncKey(row)) mergedRows[i] = pr;
  }

  if (mergedRows.length === prev.length) {
    let sameAsPrev = true;
    for (let i = 0; i < prev.length; i++) {
      if (mergedRows[i] !== prev[i]) {
        sameAsPrev = false;
        break;
      }
    }
    if (sameAsPrev) return prev;
  }

  return mergedRows;
}

/** Firma de paradas para memo / merge (timeline, muelle, dossier). */
export function stopsOperativaSig(stops) {
  if (!stops?.length) return "";
  return stops
    .map((st) => `${st.id}|${st.estado}|${st.hora_llegada_real || ""}|${st.hora_salida_real || ""}|${st.orden}`)
    .join(";");
}

function stopsArrayKey(stops) {
  return stopsOperativaSig(stops);
}

/** Evidencias de las paradas de un servicio (mapa global flotaEvs). */
export function flotaEvsSigForStops(stops, flotaEvs) {
  return (stops || [])
    .map((st) => {
      const arr = flotaEvs?.[st.id] || [];
      return `${st.id}:${arr.map((e) => `${e.id}|${e.created_at}|${e.tipo}`).join(",")}`;
    })
    .join("|");
}

/** ETA persistida en referencia (no columna suelta). */
export function operationalEtaMetaSig(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  const op = meta?.operational_eta;
  if (!op || typeof op !== "object") return "";
  return `${op.updated_at || op.calculated_at || ""}:${op.eta || ""}:${op.remaining_km}:${op.remaining_mins}`;
}

export function mergeFlotaStopsMap(prev, next) {
  if (!next) return prev || {};
  const out = { ...(prev || {}) };
  let changed = false;
  const changedIds = [];
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
    changedIds.push(id);
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
