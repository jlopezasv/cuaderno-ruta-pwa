import { formatUbicacionEmpresaFreshness } from "../../domain/location/ubicacionSourceLabel.js";
import { hasSinUbicacionReciente, resolveConductorOperationalVisual } from "./conductorOperationalVisual.js";
import { resolveConductorTelefonoMovil, formatConductorTelefonoDisplay } from "./conductorTelefonoMovil.js";

const TERMINAL_ESTADOS = new Set(["cerrado", "completado", "anulado", "cancelado"]);

export const TOWER_SIN_SERVICIO_MAX = 5;

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

/** Clasificación operativa por carga/servicio (no normativa de conducción). */
export function classifyConductorTowerState({
  conductor,
  servicios,
  ubicacion,
}) {
  if (!conductor?.user_id) return null;
  const uid = conductor.user_id;
  const operativos = serviciosOperativosConductor(servicios, uid);
  const conServicioActivo = operativos.some((s) => s.estado === "en_curso");
  const conProximoServicio = operativos.some((s) => s.estado === "asignado");
  const sinServicio = !conServicioActivo && !conProximoServicio;

  return {
    uid,
    conductorId: conductor.id,
    nombre: conductor.nombre || "Conductor",
    telefono: resolveConductorTelefonoMovil(conductor),
    sinServicio,
    conServicioActivo,
    conProximoServicio,
    sinUbicacionReciente: sinServicio && hasSinUbicacionReciente(ubicacion),
  };
}

export function formatConductorTowerUbicLine(raw, formatLugar, nowMs = Date.now()) {
  const city = typeof formatLugar === "function" ? formatLugar(raw) : "—";
  const meta = formatUbicacionEmpresaFreshness(raw, nowMs);
  if (!raw || raw.missing || raw.fetchError) {
    return { city, updatedLabel: meta.freshness, ubicRecent: false };
  }
  return {
    city,
    updatedLabel: meta.freshness,
    ubicRecent: meta.isRecent,
  };
}

function buildTowerPersonRow(classified, conductorByUid, ubicacionByUid, formatLugar, nowMs) {
  const source = conductorByUid?.[classified.uid];
  const ubic = ubicacionByUid?.[classified.uid];
  const ubicLine = formatConductorTowerUbicLine(ubic, formatLugar, nowMs);
  const visual = resolveConductorOperationalVisual(classified, ubic);
  return {
    uid: classified.uid,
    conductorId: classified.conductorId,
    nombre: classified.nombre,
    ciudad: ubicLine.city,
    telefono: formatConductorTelefonoDisplay(classified.telefono || resolveConductorTelefonoMovil(source)),
    updatedLabel: ubicLine.updatedLabel,
    ubicRecent: ubicLine.ubicRecent,
    statusDot: visual.dot,
    statusLabel: visual.label,
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
    }),
  );

  const sinServicio = classified.filter((c) => c.sinServicio && !c.sinUbicacionReciente);
  const sinUbicacionReciente = classified.filter((c) => c.sinUbicacionReciente);
  const conServicioActivo = classified.filter((c) => c.conServicioActivo);
  const conProximoServicio = classified.filter((c) => c.conProximoServicio);

  const sinServicioList = classified
    .filter((c) => c.sinServicio)
    .map((c) => buildTowerPersonRow(c, conductorByUid, ubicacionByUid, formatLugar, nowMs))
    .sort((a, b) => {
      const aGreen = a.statusDot === "🟢";
      const bGreen = b.statusDot === "🟢";
      if (aGreen !== bGreen) return aGreen ? -1 : 1;
      if (a.ubicRecent !== b.ubicRecent) return a.ubicRecent ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    })
    .slice(0, TOWER_SIN_SERVICIO_MAX);

  return {
    servicios: serviciosResumen,
    conductores: {
      total: linked.length,
      sinServicio: sinServicio.length,
      conProximoServicio: conProximoServicio.length,
      conServicioActivo: conServicioActivo.length,
      sinUbicacionReciente: sinUbicacionReciente.length,
    },
    sinServicioList,
  };
}
