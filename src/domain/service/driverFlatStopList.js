import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { fetchAllConductorDroppedStopIds } from "../fleet/servicioAssignment.js";
import {
  normalizeParticipacionTipo,
  PARTICIPACION_TIPO,
  stopMatchesParticipacionTipo,
} from "../fleet/participacionTipo.js";
import { isConductorServicioOperativoActivo, isServicioExpedienteCerrado } from "./expedienteCierre.js";
import { isStopOperationallyComplete } from "./serviceStops.js";
import {
  driverQueueAssignmentTimeMs,
  sortDriverOperationalCandidates,
} from "./driverServiceQueue.js";
import { getServiceClientReference, getServiceNumberForDisplay, getFixedServiceRoute } from "./serviceIdentity.js";
import { sortStopsByOrdenOperacional } from "./stopOperationalOrder.js";
import {
  formatStopLugarDisplay,
  formatStopCardTitleLine,
} from "./serviceOperationalPlaces.js";

const ESTADOS_SERVICIO_ACTIVO_CONDUCTOR = "en_curso,asignado,completado,pendiente_asignacion";

/** Viajes activos sin límite + últimos N completados para Más → Servicio. */
export const MAS_TRIP_PICKER_MAX_RECENT_COMPLETED = 10;
const MAS_TRIP_ESTADOS_ACTIVOS = "en_curso,asignado,pendiente_asignacion";
const MAS_TRIP_FETCH_LIMIT_ACTIVOS = 200;

export function isServicioMasTripActivo(servicio) {
  const st = String(servicio?.estado || "").toLowerCase();
  return st === "en_curso" || st === "asignado" || st === "pendiente_asignacion";
}

export function isServicioMasTripCompletado(servicio) {
  return String(servicio?.estado || "").toLowerCase() === "completado";
}

function servicioMasTripSortMs(servicio) {
  const raw = servicio?.updated_at || servicio?.created_at;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

async function fetchServiciosMasByConductorAndEstados(uid, estadosIn, { limit, order = "created_at.desc" } = {}) {
  if (!uid || !estadosIn) return [];
  let q = `/rest/v1/servicios?conductor_id=eq.${uid}&estado=in.(${estadosIn})&order=${order}`;
  if (limit != null) q += `&limit=${limit}`;
  const r = await sbFetch(q);
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function fetchServiciosMasByAsignaciones(uid, estadosIn, { limit, order = "created_at.desc" } = {}) {
  if (!uid || !estadosIn) return [];
  const ar = await sbFetch(
    `/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.desc&limit=200&select=servicio_id`,
  );
  if (!ar.ok) return [];
  const arows = await ar.json().catch(() => []);
  const ids = [...new Set((Array.isArray(arows) ? arows : []).map((row) => row?.servicio_id).filter(Boolean))];
  if (!ids.length) return [];
  let q = `/rest/v1/servicios?id=in.(${ids.join(",")})&estado=in.(${estadosIn})&order=${order}`;
  if (limit != null) q += `&limit=${limit}`;
  const sr = await sbFetch(q);
  if (!sr.ok) return [];
  const srows = await sr.json().catch(() => []);
  return Array.isArray(srows) ? srows : [];
}

/**
 * Lista acotada para Más → Servicio: todos los activos + últimos completados recientes.
 * @returns {Promise<object[]>}
 */
export async function fetchServiciosForMasTripPicker(uid) {
  if (!uid) return [];

  const [activosPrincipal, activosColab, recientesCompletadosPrincipal, recientesCompletadosColab] =
    await Promise.all([
      fetchServiciosMasByConductorAndEstados(uid, MAS_TRIP_ESTADOS_ACTIVOS, {
        limit: MAS_TRIP_FETCH_LIMIT_ACTIVOS,
        order: "created_at.desc",
      }),
      fetchServiciosMasByAsignaciones(uid, MAS_TRIP_ESTADOS_ACTIVOS, {
        limit: MAS_TRIP_FETCH_LIMIT_ACTIVOS,
        order: "created_at.desc",
      }),
      fetchServiciosMasByConductorAndEstados(uid, "completado", {
        limit: MAS_TRIP_PICKER_MAX_RECENT_COMPLETED,
        order: "updated_at.desc",
      }),
      fetchServiciosMasByAsignaciones(uid, "completado", {
        limit: MAS_TRIP_PICKER_MAX_RECENT_COMPLETED,
        order: "updated_at.desc",
      }),
    ]);

  const byId = new Map();
  for (const sv of [
    ...activosPrincipal,
    ...activosColab,
    ...recientesCompletadosPrincipal,
    ...recientesCompletadosColab,
  ]) {
    if (sv?.id) byId.set(sv.id, sv);
  }

  const activos = [...byId.values()].filter(isServicioMasTripActivo);
  const completados = [...byId.values()]
    .filter(isServicioMasTripCompletado)
    .sort((a, b) => servicioMasTripSortMs(b) - servicioMasTripSortMs(a))
    .slice(0, MAS_TRIP_PICKER_MAX_RECENT_COMPLETED);

  const merged = new Map();
  for (const sv of activos) if (sv?.id) merged.set(sv.id, sv);
  for (const sv of completados) if (sv?.id) merged.set(sv.id, sv);

  return [...merged.values()].sort((a, b) => {
    const aAct = isServicioMasTripActivo(a);
    const bAct = isServicioMasTripActivo(b);
    if (aAct !== bAct) return aAct ? -1 : 1;
    return servicioMasTripSortMs(b) - servicioMasTripSortMs(a);
  });
}

/** Etiqueta legible de ruta + cliente para tarjetas de viaje en Más. */
export function masTripPickerCardLines(servicio) {
  const route = getFixedServiceRoute(servicio);
  const cliente = getServiceClientReference(servicio);
  const codigo = getServiceNumberForDisplay(servicio) || "Viaje";
  const routeLine = route || null;
  const clienteLine = cliente ? String(cliente).trim() : null;
  return { codigo, routeLine, clienteLine };
}

/** Paleta estable por conductor_id (mismo conductor = mismo color en toda la sesión). */
const TRIP_VISUAL_PALETTE = [
  { stripe: "#2563eb", chipBg: "#dbeafe", chipFg: "#1e40af" },
  { stripe: "#7c3aed", chipBg: "#ede9fe", chipFg: "#5b21b6" },
  { stripe: "#059669", chipBg: "#d1fae5", chipFg: "#047857" },
  { stripe: "#d97706", chipBg: "#fef3c7", chipFg: "#b45309" },
  { stripe: "#db2777", chipBg: "#fce7f3", chipFg: "#be185d" },
  { stripe: "#0891b2", chipBg: "#cffafe", chipFg: "#0e7490" },
];

export function tripVisualForConductor(conductorId, conductorName = "") {
  if (!conductorId) {
    return { stripe: "#94a3b8", chipBg: "#f1f5f9", chipFg: "#475569", initial: "?" };
  }
  let h = 0;
  for (let i = 0; i < conductorId.length; i++) {
    h = (h * 31 + conductorId.charCodeAt(i)) >>> 0;
  }
  const base = TRIP_VISUAL_PALETTE[h % TRIP_VISUAL_PALETTE.length];
  const initial = String(conductorName || "").trim().charAt(0).toUpperCase() || "?";
  return { ...base, initial, conductorId };
}

export async function fetchDriverOperationalCandidates(uid) {
  if (!uid) return { candidates: [], assignedAtById: {}, participacionBySvId: {}, participacionTipoBySvId: {} };

  async function fetchServiciosByConductorId() {
    const r = await sbFetch(
      `/rest/v1/servicios?conductor_id=eq.${uid}&estado=in.(${ESTADOS_SERVICIO_ACTIVO_CONDUCTOR})&order=created_at.desc&limit=40`,
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function fetchServiciosByAsignacionesFallback() {
    const ar = await sbFetch(
      `/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.desc&limit=40&select=servicio_id`,
    );
    if (!ar.ok) return [];
    const arows = await ar.json();
    const ids = [...new Set((Array.isArray(arows) ? arows : []).map((r) => r?.servicio_id).filter(Boolean))];
    if (!ids.length) return [];
    const sr = await sbFetch(
      `/rest/v1/servicios?id=in.(${ids.join(",")})&estado=in.(${ESTADOS_SERVICIO_ACTIVO_CONDUCTOR})&order=created_at.desc&limit=40`,
    );
    if (!sr.ok) return [];
    const srows = await sr.json();
    return Array.isArray(srows) ? srows : [];
  }

  async function fetchAssignedAtBySvId() {
    const selectWithStop = isDemoApp()
      ? "servicio_id,created_at,estado_participacion,participacion_tipo,stop_id"
      : "servicio_id,created_at,estado_participacion,stop_id";
    let ar = await sbFetch(
      `/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.asc&limit=200&select=${selectWithStop}`,
    );
    if (!ar.ok && isDemoApp()) {
      ar = await sbFetch(
        `/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.asc&limit=200&select=servicio_id,created_at,estado_participacion,stop_id`,
      );
    }
    if (!ar.ok) return { assignedAtById: {}, participacionBySvId: {}, participacionTipoBySvId: {} };
    const rows = await ar.json().catch(() => []);
    const map = {};
    const part = {};
    const tipoBySv = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const sid = r?.servicio_id;
      const ts = r?.created_at;
      if (!sid) return;
      if (ts && (map[sid] === undefined || new Date(ts) < new Date(map[sid]))) map[sid] = ts;
      const est = String(r?.estado_participacion || "").toLowerCase();
      const isStopLevel = !!r?.stop_id;
      // Solo finalización a nivel viaje (stop_id null) retira el servicio entero del conductor.
      if (est === "finalizado" && !isStopLevel) {
        part[sid] = "finalizado";
      } else if (part[sid] !== "finalizado" && part[sid] === undefined) {
        part[sid] = est || "pendiente";
      }
      if (isDemoApp() && !isStopLevel && r?.participacion_tipo != null) {
        tipoBySv[sid] = normalizeParticipacionTipo(r.participacion_tipo);
      }
    });
    return { assignedAtById: map, participacionBySvId: part, participacionTipoBySvId: tipoBySv };
  }

  const primaryCandidates = await fetchServiciosByConductorId();
  const fallbackCandidates = await fetchServiciosByAsignacionesFallback();
  const { assignedAtById, participacionBySvId, participacionTipoBySvId } = await fetchAssignedAtBySvId();
  const byId = new Map();
  [...primaryCandidates, ...fallbackCandidates].forEach((sv) => {
    if (sv?.id) byId.set(sv.id, sv);
  });
  const candidates = [...byId.values()]
    .filter((sv) => isConductorServicioOperativoActivo(sv, uid))
    .filter((sv) => participacionBySvId[sv.id] !== "finalizado");

  return { candidates, assignedAtById, participacionBySvId, participacionTipoBySvId };
}

export async function fetchStopsForServicioId(servicioId) {
  if (!servicioId) return [];
  const sr = await sbFetch(`/rest/v1/stops?servicio_id=eq.${servicioId}&order=orden.asc`);
  const stops = sr.ok ? await sr.json() : [];
  return Array.isArray(stops) ? stops : [];
}

export async function fetchConductorNameMapForServicios(servicios) {
  const ids = [...new Set((servicios || []).map((s) => s?.conductor_id).filter(Boolean))];
  if (!ids.length) return {};
  const r = await sbFetch(`/rest/v1/profiles?id=in.(${ids.join(",")})&select=id,nombre`);
  if (!r.ok) return {};
  const rows = await r.json().catch(() => []);
  const map = {};
  (Array.isArray(rows) ? rows : []).forEach((p) => {
    if (p?.id) map[p.id] = String(p.nombre || "").trim() || "Conductor";
  });
  return map;
}

function stopOperationalGroup(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "carga") return "carga";
  if (t === "descarga") return "descarga";
  if (t.includes("carga") && t.includes("descarga")) return "carga_descarga";
  return "otra";
}

function labelForStopType(stop) {
  const g = stopOperationalGroup(stop?.tipo);
  if (g === "carga") return "Carga";
  if (g === "descarga") return "Descarga";
  if (g === "carga_descarga") return "Carga/descarga";
  return "Parada";
}

function tipoOrdenLabelForStop(stop, counters) {
  const g = stopOperationalGroup(stop?.tipo);
  if (g === "carga") return `Carga ${counters.carga}`;
  if (g === "descarga") return `Descarga ${counters.descarga}`;
  if (g === "carga_descarga") return `Carga/descarga ${counters.carga_descarga}`;
  return `Parada ${counters.otra || stop?.orden || ""}`.trim();
}

/** Mapa stop.id → etiqueta ordinal por tipo (Carga 1, Descarga 2…) en orden de ruta. */
export function buildStopTipoOrdinalMap(sortedStops) {
  const counters = { carga: 0, descarga: 0, carga_descarga: 0, otra: 0 };
  const map = new Map();
  for (const stop of sortedStops || []) {
    if (!stop?.id) continue;
    const g = stopOperationalGroup(stop?.tipo);
    counters[g] = (counters[g] || 0) + 1;
    map.set(stop.id, tipoOrdenLabelForStop(stop, counters));
  }
  return map;
}

/** Etiqueta legible de una parada pendiente (tipo ordinal + lugar). */
export function pendingStopDisplayLabel(stop, sortedStops) {
  const tipoOrdenLabel = buildStopTipoOrdinalMap(sortedStops).get(stop?.id) || labelForStopType(stop);
  const place = String(stop?.nombre || stop?.direccion || "").trim();
  return place ? `${tipoOrdenLabel} · ${place}` : tipoOrdenLabel;
}

/** Etiqueta de viaje para desambiguar paradas mezcladas. */
export function tripLabelForServicio(servicio, conductorNameById = {}) {
  const ref = getServiceNumberForDisplay(servicio) || "Servicio";
  const cid = servicio?.conductor_id;
  const conductor = cid ? conductorNameById[cid] : null;
  if (conductor) return `${ref} · ${conductor}`;
  return ref;
}

export function buildFlatStopCardLabel(stop, servicio, conductorNameById = {}) {
  const tipo = labelForStopType(stop);
  const lugar = formatStopLugarDisplay(stop, servicio);
  const viaje = tripLabelForServicio(servicio, conductorNameById);
  return `${tipo} · ${lugar} · ${viaje}`;
}

/**
 * Paradas pendientes del conductor en todos los viajes activos (lista plana).
 * @returns {Promise<{ items: object[], participacionBySvId: Record<string,string>, candidates: object[] }>}
 */
export async function resolveDriverFlatPendingStops(uid, { conductorNameById = {} } = {}) {
  const empty = { items: [], participacionBySvId: {}, candidates: [], stopsByServicioId: {} };
  if (!uid) return empty;

  const { candidates, assignedAtById, participacionBySvId, participacionTipoBySvId } =
    await fetchDriverOperationalCandidates(uid);
  const droppedStopsByServicioId = await fetchAllConductorDroppedStopIds(uid);
  const sorted = sortDriverOperationalCandidates(candidates, assignedAtById);
  const items = [];
  const stopsByServicioId = {};
  const filterByParticipacionTipo = isDemoApp();

  for (const sv of sorted) {
    const droppedStopIds = droppedStopsByServicioId.get(sv.id) || new Set();
    const participacionTipo =
      participacionTipoBySvId[sv.id] ||
      (sv.conductor_id === uid ? PARTICIPACION_TIPO.TODO : PARTICIPACION_TIPO.TODO);
    const stops = await fetchStopsForServicioId(sv.id);
    const sortedStops = sortStopsByOrdenOperacional(stops);
    if (sv?.id) stopsByServicioId[sv.id] = sortedStops;
    const assignmentMs = driverQueueAssignmentTimeMs(sv, assignedAtById);
    const cid = sv?.conductor_id || null;
    const conductorNombre = cid ? conductorNameById[cid] || null : null;
    const tripVisual = tripVisualForConductor(cid, conductorNombre);
    const tipoOrdinalByStopId = buildStopTipoOrdinalMap(sortedStops);
    const referenciaCliente = getServiceClientReference(sv);
    for (const stop of sortedStops) {
      if (isStopOperationallyComplete(stop)) continue;
      if (droppedStopIds.has(stop.id)) continue;
      if (filterByParticipacionTipo && !stopMatchesParticipacionTipo(stop, participacionTipo)) continue;
      const lugarDisplay = formatStopLugarDisplay(stop, sv, sortedStops);
      const tipoOrdenLabel = tipoOrdinalByStopId.get(stop.id) || labelForStopType(stop);
      const cardLine1 = formatStopCardTitleLine(tipoOrdenLabel, referenciaCliente);
      const cardLine2 = lugarDisplay;
      const tripServiceRef = getServiceNumberForDisplay(sv) || null;
      items.push({
        servicio: sv,
        stop,
        stops: sortedStops,
        assignmentMs,
        cardLabel: buildFlatStopCardLabel(stop, sv, conductorNameById),
        tripLabel: tripLabelForServicio(sv, conductorNameById),
        tipoLabel: labelForStopType(stop),
        tipoOrdenLabel,
        referenciaCliente: referenciaCliente || null,
        cardLine1,
        cardLine2,
        tripServiceRef,
        lugar: lugarDisplay,
        lugarDisplay,
        conductorId: cid,
        conductorNombre,
        tripVisual,
      });
    }
  }

  items.sort((a, b) => {
    if (a.assignmentMs !== b.assignmentMs) return a.assignmentMs - b.assignmentMs;
    return (Number(a.stop.orden) || 0) - (Number(b.stop.orden) || 0);
  });

  return { items, participacionBySvId, candidates, stopsByServicioId };
}

/** Servicios donde el conductor puede pulsar «He terminado mi parte». */
export function serviciosPendientesFinalizarParticipacion(candidates, participacionBySvId, pendingItems) {
  const pendingBySv = new Set(pendingItems.map((i) => i.servicio?.id).filter(Boolean));
  return (candidates || []).filter((sv) => {
    if (!sv?.id) return false;
    if (pendingBySv.has(sv.id)) return false;
    const part = participacionBySvId[sv.id];
    if (part === "finalizado") return false;
    if (isServicioExpedienteCerrado(sv)) return false;
    const st = String(sv.estado || "").toLowerCase();
    return st === "en_curso" || st === "asignado" || st === "completado";
  });
}

/** Viajes con finalización de participación pendiente (aviso en tab Paradas). */
export function serviciosConAccionPendienteEnMas(_candidates, finalizarServicios) {
  return (finalizarServicios || []).filter((sv) => !!sv?.id);
}
