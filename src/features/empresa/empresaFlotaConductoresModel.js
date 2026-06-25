import { formatConductorTelefonoDisplay } from "./conductorTelefonoMovil.js";
import { formatConductorUbicacionDemoDisplay } from "./conductorUbicacionDemoDisplay.js";
import { formatUbicacionEmpresaFreshness } from "../../domain/location/ubicacionSourceLabel.js";
import { getFixedServiceRoute } from "../../domain/service/serviceIdentity.js";

export const FLOTA_CONDUCTOR_FILTERS = Object.freeze([
  { id: "todos", label: "Todos" },
  { id: "activos", label: "Activos" },
  { id: "inactivos", label: "Inactivos" },
  { id: "con_servicio", label: "Con servicio" },
  { id: "sin_servicio", label: "Sin servicio" },
  { id: "sin_ubicacion", label: "Sin ubicación reciente" },
]);

export const FLOTA_CONDUCTOR_SORTS = Object.freeze([
  { id: "nombre", label: "Nombre" },
  { id: "servicio", label: "Servicio activo" },
  { id: "ubicacion", label: "Última ubicación" },
  { id: "jornada", label: "Estado jornada" },
]);

export function getConductorInitials(nombre) {
  const parts = String(nombre || "C")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveConductorServicios(flotaServicios, userId) {
  if (!userId) return [];
  return (flotaServicios || [])
    .filter(
      (s) =>
        s.conductor_id === userId &&
        (s.estado === "en_curso" || s.estado === "asignado"),
    )
    .sort(
      (a, b) =>
        (a.estado === "en_curso" ? 0 : 1) - (b.estado === "en_curso" ? 0 : 1),
    );
}

/** @returns {"sin_servicio"|"con_servicio"|"pendiente"} */
export function resolveServicioChipKind(servicio) {
  if (!servicio) return "sin_servicio";
  if (servicio.estado === "en_curso") return "con_servicio";
  return "pendiente";
}

const SERVICIO_CHIP = Object.freeze({
  sin_servicio: { label: "Sin servicio", color: "#64748b" },
  con_servicio: { label: "Con servicio", color: "#15803d" },
  pendiente: { label: "Servicio pendiente", color: "#2563eb" },
});

export function resolveConductorActivoLabel(conductor) {
  if (conductor?.pendiente) return { label: "Sin vincular", color: "#94a3b8" };
  if (conductor?.activo === false) return { label: "Inactivo", color: "#94a3b8" };
  return { label: "Activo", color: "#15803d" };
}

export function resolveJornadaChip(journey, sem) {
  if (!journey?.open) {
    return { label: "Fuera jornada", color: "#94a3b8" };
  }
  return {
    label: (sem?.label || "En jornada").replace(/[🟢🟠⚪]/g, "").trim(),
    color: journey.color || sem?.col || "#22c55e",
  };
}

export function buildConductorFlotaRow({
  conductor,
  flotaServicios,
  liveLocation,
  nowMs,
  formatLugar,
  conductorJourneyInfo,
  semaforo,
  telefonoResolver,
}) {
  const journey = conductorJourneyInfo(conductor);
  const sem = semaforo(conductor.norma);
  const servicios = resolveConductorServicios(flotaServicios, conductor.user_id);
  const servicioActual = servicios[0] || null;
  const servicioKind = resolveServicioChipKind(servicioActual);
  const servicioChip = SERVICIO_CHIP[servicioKind];
  const servicioRuta = servicioActual ? getFixedServiceRoute(servicioActual) : null;
  const activoChip = resolveConductorActivoLabel(conductor);
  const jornadaChip = resolveJornadaChip(journey, sem);
  const telefono = formatConductorTelefonoDisplay(
    telefonoResolver ? telefonoResolver(conductor) : conductor?.telefono_movil,
  );
  const matricula = String(conductor?.matricula || "").trim() || "—";

  let ubicacionResumen = "Sin ubicación reciente";
  let ubicacionIsRecent = false;
  if (liveLocation && !liveLocation.missing && !liveLocation.fetchError) {
    const meta = formatUbicacionEmpresaFreshness(liveLocation, nowMs);
    ubicacionResumen = meta.freshness;
    ubicacionIsRecent = meta.isRecent;
  } else if (formatLugar) {
    const demo = formatConductorUbicacionDemoDisplay(liveLocation, formatLugar, nowMs);
    ubicacionResumen = demo.freshness;
    ubicacionIsRecent = demo.isRecent;
  }

  return {
    conductor,
    journey,
    sem,
    servicioActual,
    servicioKind,
    servicioChip,
    servicioRuta,
    activoChip,
    jornadaChip,
    telefono,
    matricula,
    ubicacionResumen,
    ubicacionIsRecent,
    initials: getConductorInitials(conductor.nombre),
    searchHaystack: [
      conductor.nombre,
      matricula,
      conductor.remolque,
      telefono,
      servicioRuta,
      servicioActual?.referencia,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export function filterConductorRows(rows, filterId, searchQuery) {
  const q = String(searchQuery || "")
    .trim()
    .toLowerCase();
  return rows.filter((row) => {
    if (q && !row.searchHaystack.includes(q)) return false;
    const c = row.conductor;
    switch (filterId) {
      case "activos":
        return !c.pendiente && c.activo !== false;
      case "inactivos":
        return !c.pendiente && c.activo === false;
      case "con_servicio":
        return row.servicioKind === "con_servicio" || row.servicioKind === "pendiente";
      case "sin_servicio":
        return row.servicioKind === "sin_servicio" && !c.pendiente;
      case "sin_ubicacion":
        return !c.pendiente && !row.ubicacionIsRecent;
      default:
        return true;
    }
  });
}

function ubicacionSortKey(row) {
  const raw = row._liveTs;
  if (!raw) return Number.POSITIVE_INFINITY;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

export function sortConductorRows(rows, sortId) {
  const list = [...rows];
  switch (sortId) {
    case "servicio":
      list.sort((a, b) => {
        const rank = (r) =>
          r.servicioKind === "con_servicio" ? 0 : r.servicioKind === "pendiente" ? 1 : 2;
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return String(a.conductor.nombre || "").localeCompare(
          String(b.conductor.nombre || ""),
          "es",
        );
      });
      break;
    case "ubicacion":
      list.sort((a, b) => ubicacionSortKey(a) - ubicacionSortKey(b));
      break;
    case "jornada":
      list.sort((a, b) => {
        const rank = (r) => (r.journey?.open ? 0 : 1);
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return String(a.conductor.nombre || "").localeCompare(
          String(b.conductor.nombre || ""),
          "es",
        );
      });
      break;
    default:
      list.sort((a, b) =>
        String(a.conductor.nombre || "").localeCompare(
          String(b.conductor.nombre || ""),
          "es",
        ),
      );
  }
  return list;
}

export function enrichRowWithLocationTs(row, liveLocation) {
  const ts = liveLocation?.updatedAt || liveLocation?.ts || null;
  return { ...row, _liveTs: ts };
}
