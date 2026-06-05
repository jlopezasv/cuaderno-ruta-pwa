import { formatSpanishAgo } from "../../domain/service/etaFormatter.js";
import { LIM, fmtDur } from "../../domain/route/routePlanning.js";
import { resolveConductorTelefonoMovil, formatConductorTelefonoDisplay } from "./conductorTelefonoMovil.js";

const TERMINAL_ESTADOS = new Set(["cerrado", "completado", "anulado", "cancelado"]);
const WEEK_ATTENTION_RATIO = 0.9;
const UBIC_ATTENTION_STALE_MS = 6 * 60 * 60 * 1000;

export const TOWER_SIN_SERVICIO_MAX = 5;
export const TOWER_ATENCION_MAX = 5;

export const TOWER_ATTENTION_LABELS = Object.freeze({
  sin_ubicacion: "Sin ubicación",
  limite_conduccion: "Límite de conducción",
  incidencia: "Incidencia abierta",
  exceso_semanal: "Exceso semanal",
  gps_sin_actualizar: "GPS sin actualizar",
});

function isTerminalEstado(estado) {
  return TERMINAL_ESTADOS.has(String(estado || "").toLowerCase());
}

function servicioIncidenciasCount(sv, incidenciasByServicioId) {
  const fromRow = Number(sv?.incidencias_total);
  if (Number.isFinite(fromRow) && fromRow > 0) return fromRow;
  const res = incidenciasByServicioId?.[sv?.id];
  const fromRes = Number(res?.total_incidencias);
  return Number.isFinite(fromRes) && fromRes > 0 ? fromRes : 0;
}

/** Resumen operativo de servicios (sin detalle de expedientes). */
export function buildServiciosTowerResumen(servicios, incidenciasByServicioId = {}) {
  const rows = Array.isArray(servicios) ? servicios : [];
  const abiertos = rows.filter((s) => !isTerminalEstado(s?.estado));
  let incidencias = 0;
  for (const s of abiertos) {
    if (servicioIncidenciasCount(s, incidenciasByServicioId) > 0) incidencias += 1;
  }
  return {
    activos: abiertos.filter((s) => s.estado === "en_curso").length,
    pendientesSalida: abiertos.filter((s) => s.estado === "asignado").length,
    sinConductor: abiertos.filter(
      (s) => s.estado === "pendiente_asignacion" || (!s.conductor_id && !isTerminalEstado(s.estado)),
    ).length,
    incidencias,
  };
}

/** Servicios asignados al conductor en estados operativos de flota (en_curso / asignado). */
function serviciosOperativosConductor(servicios, userId) {
  if (!userId) return [];
  return (Array.isArray(servicios) ? servicios : []).filter(
    (s) => (s.estado === "en_curso" || s.estado === "asignado") && s.conductor_id === userId,
  );
}

function ubicAttentionFlags(ubic, nowMs) {
  if (!ubic || ubic.missing || ubic.fetchError) {
    return { sinUbicacion: true, gpsStale: false };
  }
  if (ubic.recent === false) {
    const ts = ubic.updatedAt || ubic.ts;
    if (!ts) return { sinUbicacion: true, gpsStale: false };
    const diff = Math.max(0, nowMs - new Date(ts).getTime());
    return {
      sinUbicacion: true,
      gpsStale: diff >= UBIC_ATTENTION_STALE_MS,
    };
  }
  return { sinUbicacion: false, gpsStale: false };
}

function buildAttentionSignals({ norma, ubic, serviciosOperativos, incidenciasByServicioId, nowMs }) {
  const signals = [];
  if (norma && Number(norma.canDrive) <= 0) {
    signals.push({ code: "limite_conduccion", label: TOWER_ATTENTION_LABELS.limite_conduccion });
  }
  const tieneIncidencia = (serviciosOperativos || []).some(
    (s) => servicioIncidenciasCount(s, incidenciasByServicioId) > 0,
  );
  if (tieneIncidencia) {
    signals.push({ code: "incidencia", label: TOWER_ATTENTION_LABELS.incidencia });
  }
  const week = Number(norma?.weekDrive) || 0;
  if (week >= LIM.WEEK * WEEK_ATTENTION_RATIO) {
    signals.push({
      code: "exceso_semanal",
      label: TOWER_ATTENTION_LABELS.exceso_semanal,
      detail: `${fmtDur(week)} / ${fmtDur(LIM.WEEK)}`,
    });
  }
  const { sinUbicacion, gpsStale } = ubicAttentionFlags(ubic, nowMs);
  if (gpsStale) {
    signals.push({ code: "gps_sin_actualizar", label: TOWER_ATTENTION_LABELS.gps_sin_actualizar });
  } else if (sinUbicacion) {
    signals.push({ code: "sin_ubicacion", label: TOWER_ATTENTION_LABELS.sin_ubicacion });
  }
  return signals;
}

export function classifyConductorTowerState({
  conductor,
  servicios,
  ubicacion,
  incidenciasByServicioId,
  nowMs = Date.now(),
}) {
  if (!conductor?.user_id) return null;
  const uid = conductor.user_id;
  const operativos = serviciosOperativosConductor(servicios, uid);
  const conServicioActivo = operativos.some((s) => s.estado === "en_curso");
  const conProximoServicio = operativos.some((s) => s.estado === "asignado");
  const sinServicio = !conServicioActivo && !conProximoServicio;
  const attentionSignals = buildAttentionSignals({
    norma: conductor.norma,
    ubic: ubicacion,
    serviciosOperativos: operativos,
    incidenciasByServicioId,
    nowMs,
  });

  return {
    uid,
    conductorId: conductor.id,
    nombre: conductor.nombre || "Conductor",
    telefono: resolveConductorTelefonoMovil(conductor),
    sinServicio,
    conServicioActivo,
    conProximoServicio,
    needsAttention: attentionSignals.length > 0,
    attentionReason: attentionSignals[0]?.label || null,
    attentionSignals,
  };
}

export function formatConductorTowerUbicLine(raw, formatLugar, nowMs = Date.now()) {
  const city = typeof formatLugar === "function" ? formatLugar(raw) : "—";
  if (!raw || raw.missing || raw.fetchError) {
    return { city, updatedLabel: "Sin actualización reciente", ubicRecent: false };
  }
  const ts = raw.updatedAt || raw.ts;
  if (!ts) {
    return {
      city,
      updatedLabel: raw.recent === false ? "Sin actualización reciente" : "—",
      ubicRecent: raw.recent !== false,
    };
  }
  const ago = formatSpanishAgo(ts, new Date(nowMs));
  const updatedLabel =
    ago === "ahora" ? "Ahora" : ago.startsWith("hace") ? ago.charAt(0).toUpperCase() + ago.slice(1) : ago;
  return {
    city,
    updatedLabel: raw.recent === false ? "Sin actualización reciente" : updatedLabel,
    ubicRecent: raw.recent !== false,
  };
}

function buildTowerPersonRow(classified, conductorByUid, ubicacionByUid, formatLugar, nowMs) {
  const source = conductorByUid?.[classified.uid];
  const ubic = ubicacionByUid?.[classified.uid];
  const ubicLine = formatConductorTowerUbicLine(ubic, formatLugar, nowMs);
  return {
    uid: classified.uid,
    conductorId: classified.conductorId,
    nombre: classified.nombre,
    ciudad: ubicLine.city,
    telefono: formatConductorTelefonoDisplay(classified.telefono || resolveConductorTelefonoMovil(source)),
    updatedLabel: ubicLine.updatedLabel,
    ubicRecent: ubicLine.ubicRecent,
    reason: classified.needsAttention
      ? classified.attentionReason || classified.attentionSignals?.[0]?.label || "Requiere revisión"
      : null,
  };
}

export function buildEmpresaDashboardTowerState({
  conductores,
  servicios,
  ubicacionByUid,
  incidenciasByServicioId,
  formatLugar,
  nowMs = Date.now(),
}) {
  const linked = (Array.isArray(conductores) ? conductores : []).filter((c) => c.user_id);
  const conductorByUid = Object.fromEntries(linked.map((c) => [c.user_id, c]));
  const serviciosResumen = buildServiciosTowerResumen(servicios, incidenciasByServicioId);

  const classified = linked.map((c) =>
    classifyConductorTowerState({
      conductor: c,
      servicios,
      ubicacion: ubicacionByUid?.[c.user_id],
      incidenciasByServicioId,
      nowMs,
    }),
  );

  const sinServicio = classified.filter((c) => c.sinServicio);
  const conServicioActivo = classified.filter((c) => c.conServicioActivo);
  const conProximoServicio = classified.filter((c) => c.conProximoServicio);
  const atencion = classified.filter((c) => c.needsAttention);

  const sinServicioList = sinServicio
    .map((c) => buildTowerPersonRow(c, conductorByUid, ubicacionByUid, formatLugar, nowMs))
    .sort((a, b) => (a.ubicRecent === b.ubicRecent ? 0 : a.ubicRecent ? -1 : 1))
    .slice(0, TOWER_SIN_SERVICIO_MAX);

  const atencionList = atencion
    .map((c) => buildTowerPersonRow(c, conductorByUid, ubicacionByUid, formatLugar, nowMs))
    .slice(0, TOWER_ATENCION_MAX);

  return {
    servicios: serviciosResumen,
    conductores: {
      total: linked.length,
      sinServicio: sinServicio.length,
      conServicioActivo: conServicioActivo.length,
      conProximoServicio: conProximoServicio.length,
      atencion: atencion.length,
    },
    sinServicioList,
    atencionList,
  };
}
