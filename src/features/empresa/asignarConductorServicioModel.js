import {
  ASIGNAR_CONDUCTOR_SECTIONS,
  resolveConductorOperationalVisual,
} from "./conductorOperationalVisual.js";
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

/** @deprecated Usar resolveConductorOperationalVisual — se mantiene para imports legacy. */
export const CONDUCTOR_ASSIGN_STATUS_META = Object.freeze({
  disponible: { key: "disponible", label: "Sin servicio", dot: "🟢", color: "#15803d", bg: "#dcfce7", border: "#86efac", sortTier: 0 },
  proximo_servicio: { key: "proximo_servicio", label: "Con servicio asignado", dot: "🟠", color: "#c2410c", bg: "#ffedd5", border: "#fdba74", sortTier: 1 },
  en_servicio: { key: "en_servicio", label: "En curso", dot: "🔵", color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd", sortTier: 2 },
  sin_ubic: { key: "sin_ubic", label: "Sin ubicación reciente", dot: "⚪", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", sortTier: 3 },
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

export function resolveConductorAssignStatus(classified, ubic = null) {
  const visual = resolveConductorOperationalVisual(classified, ubic);
  return {
    key: visual.key,
    label: visual.label,
    dot: visual.dot,
    color: visual.color,
    bg: visual.bg,
    border: visual.border,
    sortTier: visual.sortTier,
    assignSection: visual.assignSection,
    mapColor: visual.mapColor,
  };
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
    });
    const status = resolveConductorAssignStatus(classified, ubicacionByUid[uid]);
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

/** Agrupa filas del picker por sección operativa (servicio / ubicación). */
export function groupAsignarConductorPickerRows(rows = []) {
  const bySection = Object.fromEntries(ASIGNAR_CONDUCTOR_SECTIONS.map((s) => [s.id, []]));
  for (const row of rows) {
    const sectionId = row.status?.assignSection || "sin_servicio";
    if (bySection[sectionId]) bySection[sectionId].push(row);
  }
  return ASIGNAR_CONDUCTOR_SECTIONS.map((section) => ({
    ...section,
    rows: bySection[section.id] || [],
  })).filter((section) => section.rows.length > 0);
}
