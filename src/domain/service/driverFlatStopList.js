import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import {
  normalizeParticipacionTipo,
  PARTICIPACION_TIPO,
  stopMatchesParticipacionTipo,
} from "../fleet/participacionTipo.js";
import { isConductorServicioOperativoActivo } from "./expedienteCierre.js";
import { isStopOperationallyComplete } from "./serviceStops.js";
import {
  driverQueueAssignmentTimeMs,
  sortDriverOperationalCandidates,
} from "./driverServiceQueue.js";
import { getServiceNumberForDisplay } from "./serviceIdentity.js";
import { getStopOperacionMeta } from "./stopOperacionMeta.js";

const ESTADOS_SERVICIO_ACTIVO_CONDUCTOR = "en_curso,asignado,completado,pendiente_asignacion";

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
    const selectCols = isDemoApp()
      ? "servicio_id,created_at,estado_participacion,participacion_tipo"
      : "servicio_id,created_at,estado_participacion";
    let ar = await sbFetch(
      `/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.asc&limit=200&select=${selectCols}`,
    );
    if (!ar.ok && isDemoApp()) {
      ar = await sbFetch(
        `/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.asc&limit=200&select=servicio_id,created_at,estado_participacion`,
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
      if (est === "finalizado") part[sid] = "finalizado";
      else if (part[sid] === undefined) part[sid] = est || "pendiente";
      if (isDemoApp() && r?.participacion_tipo != null) {
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
  const lugar =
    String(stop?.nombre || "").trim() ||
    String(getStopOperacionMeta(stop?.notas)?.empresa_logistica || "").trim() ||
    "Sin lugar";
  const viaje = tripLabelForServicio(servicio, conductorNameById);
  return `${tipo} · ${lugar} · ${viaje}`;
}

/**
 * Paradas pendientes del conductor en todos los viajes activos (lista plana).
 * @returns {Promise<{ items: object[], participacionBySvId: Record<string,string>, candidates: object[] }>}
 */
export async function resolveDriverFlatPendingStops(uid, { conductorNameById = {} } = {}) {
  const empty = { items: [], participacionBySvId: {}, candidates: [] };
  if (!uid) return empty;

  const { candidates, assignedAtById, participacionBySvId, participacionTipoBySvId } =
    await fetchDriverOperationalCandidates(uid);
  const sorted = sortDriverOperationalCandidates(candidates, assignedAtById);
  const items = [];
  const filterByParticipacionTipo = isDemoApp();

  for (const sv of sorted) {
    const participacionTipo =
      participacionTipoBySvId[sv.id] ||
      (sv.conductor_id === uid ? PARTICIPACION_TIPO.TODO : PARTICIPACION_TIPO.TODO);
    const stops = await fetchStopsForServicioId(sv.id);
    const sortedStops = [...stops].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const assignmentMs = driverQueueAssignmentTimeMs(sv, assignedAtById);
    for (const stop of sortedStops) {
      if (isStopOperationallyComplete(stop)) continue;
      if (filterByParticipacionTipo && !stopMatchesParticipacionTipo(stop, participacionTipo)) continue;
      items.push({
        servicio: sv,
        stop,
        stops: sortedStops,
        assignmentMs,
        cardLabel: buildFlatStopCardLabel(stop, sv, conductorNameById),
        tripLabel: tripLabelForServicio(sv, conductorNameById),
        tipoLabel: labelForStopType(stop),
        lugar:
          String(stop?.nombre || "").trim() ||
          String(getStopOperacionMeta(stop?.notas)?.empresa_logistica || "").trim() ||
          "—",
      });
    }
  }

  items.sort((a, b) => {
    if (a.assignmentMs !== b.assignmentMs) return a.assignmentMs - b.assignmentMs;
    return (Number(a.stop.orden) || 0) - (Number(b.stop.orden) || 0);
  });

  return { items, participacionBySvId, candidates };
}

/** Servicios donde el conductor puede pulsar «He terminado mi parte». */
export function serviciosPendientesFinalizarParticipacion(candidates, participacionBySvId, pendingItems) {
  const pendingBySv = new Set(pendingItems.map((i) => i.servicio?.id).filter(Boolean));
  return (candidates || []).filter((sv) => {
    if (!sv?.id) return false;
    if (pendingBySv.has(sv.id)) return false;
    const part = participacionBySvId[sv.id];
    if (part === "finalizado") return false;
    const st = String(sv.estado || "").toLowerCase();
    return st === "en_curso" || st === "asignado";
  });
}
