import { classifyConductorTowerState } from "./empresaDashboardTowerModel.js";
import {
  formatConductorTelefonoDisplay,
  resolveConductorTelefonoMovil,
} from "./conductorTelefonoMovil.js";

/** Estrategias de ordenación futuras (proximidad, disponibilidad, sugerencias). */
export const ASIGNAR_CONDUCTOR_SORT_STRATEGIES = Object.freeze({
  OPERATIONAL_LOAD: "operational_load",
  PROXIMITY: "proximity",
  FUTURE_AVAILABILITY: "future_availability",
  SMART_SUGGESTIONS: "smart_suggestions",
});

export const CONDUCTOR_ASSIGN_STATUS_META = Object.freeze({
  disponible: {
    key: "disponible",
    label: "Disponible",
    dot: "🟢",
    color: "#15803d",
    bg: "#dcfce7",
    border: "#86efac",
    sortTier: 0,
  },
  en_servicio: {
    key: "en_servicio",
    label: "En servicio",
    dot: "🟠",
    color: "#c2410c",
    bg: "#ffedd5",
    border: "#fdba74",
    sortTier: 1,
  },
  atencion: {
    key: "atencion",
    label: "Atención",
    dot: "🔴",
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fca5a5",
    sortTier: 2,
  },
});

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function countOperationalLoad(servicios, userId) {
  if (!userId) return 0;
  return (Array.isArray(servicios) ? servicios : []).filter(
    (s) =>
      s.conductor_id === userId &&
      (s.estado === "en_curso" || s.estado === "asignado"),
  ).length;
}

function resolveCiudadLabel(conductor, ubicacion, formatLugar) {
  if (typeof formatLugar === "function" && ubicacion) {
    const fromUbic = String(formatLugar(ubicacion) || "").trim();
    if (fromUbic && fromUbic !== "—") return fromUbic;
  }
  const fromProfile = String(conductor?.ciudad || "").trim();
  return fromProfile || "—";
}

export function resolveConductorAssignStatus(classified) {
  if (!classified) return CONDUCTOR_ASSIGN_STATUS_META.disponible;
  if (classified.needsAttention) return CONDUCTOR_ASSIGN_STATUS_META.atencion;
  if (classified.conServicioActivo || classified.conProximoServicio) {
    return CONDUCTOR_ASSIGN_STATUS_META.en_servicio;
  }
  return CONDUCTOR_ASSIGN_STATUS_META.disponible;
}

/**
 * @param {object} p
 * @param {Array} p.conductores
 * @param {Array} [p.flotaServicios]
 * @param {object} [p.incidenciasByServicioId]
 * @param {object} [p.ubicacionByUid]
 * @param {(raw: object) => string} [p.formatLugar]
 * @param {number} [p.nowMs]
 * @param {string} [p.searchQuery]
 * @param {string} [p.sortStrategy] — reservado; solo OPERATIONAL_LOAD activo.
 */
export function buildAsignarConductorPickerRows({
  conductores = [],
  flotaServicios = [],
  incidenciasByServicioId = {},
  ubicacionByUid = {},
  formatLugar = null,
  nowMs = Date.now(),
  searchQuery = "",
  sortStrategy = ASIGNAR_CONDUCTOR_SORT_STRATEGIES.OPERATIONAL_LOAD,
}) {
  void sortStrategy;

  const lista = (Array.isArray(conductores) ? conductores : []).filter(
    (c) => c?.user_id && !c.pendiente,
  );

  const rows = lista.map((conductor) => {
    const uid = conductor.user_id;
    const classified = classifyConductorTowerState({
      conductor,
      servicios: flotaServicios,
      ubicacion: ubicacionByUid[uid],
      incidenciasByServicioId,
      nowMs,
    });
    const status = resolveConductorAssignStatus(classified);
    const telefono = formatConductorTelefonoDisplay(
      resolveConductorTelefonoMovil(conductor),
    );
    const ciudad = resolveCiudadLabel(conductor, ubicacionByUid[uid], formatLugar);
    const operationalLoad = countOperationalLoad(flotaServicios, uid);

    return {
      uid,
      conductor,
      nombre: conductor.nombre || "Conductor",
      matricula: String(conductor.matricula || "").trim(),
      ciudad,
      telefono,
      status,
      operationalLoad,
      classified,
      searchHaystack: normalizeSearchText(
        [conductor.nombre, conductor.matricula, ciudad, telefono].join(" "),
      ),
    };
  });

  const q = normalizeSearchText(searchQuery);
  const filtered = q
    ? rows.filter((row) => row.searchHaystack.includes(q))
    : rows;

  filtered.sort((a, b) => {
    if (a.status.sortTier !== b.status.sortTier) {
      return a.status.sortTier - b.status.sortTier;
    }
    if (a.operationalLoad !== b.operationalLoad) {
      return a.operationalLoad - b.operationalLoad;
    }
    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  });

  return filtered;
}
