/**
 * Estado operativo visual del conductor (mapa, asignación, torre).
 * Solo carga/servicio y ubicación — no normativa de conducción.
 */

export const CONDUCTOR_VISUAL = Object.freeze({
  disponible: {
    key: "disponible",
    label: "Sin servicio",
    dot: "🟢",
    color: "#15803d",
    bg: "#dcfce7",
    border: "#86efac",
    mapColor: "#16a34d",
    sortTier: 0,
    assignSection: "sin_servicio",
  },
  proximo_servicio: {
    key: "proximo_servicio",
    label: "Con servicio asignado",
    dot: "🟠",
    color: "#c2410c",
    bg: "#ffedd5",
    border: "#fdba74",
    mapColor: "#ea580c",
    sortTier: 1,
    assignSection: "proximo_servicio",
  },
  en_servicio: {
    key: "en_servicio",
    label: "En curso",
    dot: "🔵",
    color: "#1d4ed8",
    bg: "#dbeafe",
    border: "#93c5fd",
    mapColor: "#2563eb",
    sortTier: 2,
    assignSection: "en_servicio",
  },
  sin_ubic: {
    key: "sin_ubic",
    label: "Sin ubicación reciente",
    dot: "⚪",
    color: "#64748b",
    bg: "#f1f5f9",
    border: "#cbd5e1",
    mapColor: "#64748b",
    sortTier: 3,
    assignSection: "sin_ubic",
  },
});

export const ASIGNAR_CONDUCTOR_SECTIONS = Object.freeze([
  { id: "sin_servicio", title: "Sin servicio" },
  { id: "proximo_servicio", title: "Con servicio asignado" },
  { id: "en_servicio", title: "En curso" },
  { id: "sin_ubic", title: "Sin ubicación reciente" },
]);

export function hasSinUbicacionReciente(ubic) {
  return !ubic || ubic.missing || ubic.fetchError || ubic.recent === false;
}

/**
 * @param {ReturnType<import("./empresaDashboardTowerModel.js").classifyConductorTowerState>|null} classified
 * @param {object|null} ubic
 */
export function resolveConductorOperationalVisual(classified, ubic) {
  if (!classified) return CONDUCTOR_VISUAL.disponible;

  if (classified.conServicioActivo) return CONDUCTOR_VISUAL.en_servicio;
  if (classified.conProximoServicio) return CONDUCTOR_VISUAL.proximo_servicio;
  if (hasSinUbicacionReciente(ubic)) return CONDUCTOR_VISUAL.sin_ubic;
  return CONDUCTOR_VISUAL.disponible;
}

export function isConductorDisponibleParaAsignar(visual) {
  return visual?.assignSection === "sin_servicio" || visual?.assignSection === "sin_ubic";
}
