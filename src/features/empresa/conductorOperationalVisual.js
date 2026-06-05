/**
 * Estado operativo visual del conductor (mapa, asignación, torre).
 * Disponible = sin servicio asignado (no confundir con "puede conducir").
 */

export const CONDUCTOR_VISUAL = Object.freeze({
  disponible: {
    key: "disponible",
    label: "Disponible",
    dot: "🟢",
    color: "#15803d",
    bg: "#dcfce7",
    border: "#86efac",
    mapColor: "#16a34d",
    sortTier: 0,
    assignSection: "disponibles",
  },
  sin_ubic: {
    key: "sin_ubic",
    label: "Sin ubicación reciente",
    dot: "⚪",
    color: "#64748b",
    bg: "#f1f5f9",
    border: "#cbd5e1",
    mapColor: "#64748b",
    sortTier: 0,
    assignSection: "disponibles",
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
    assignSection: "ocupados",
  },
  en_servicio: {
    key: "en_servicio",
    label: "En servicio",
    dot: "🔵",
    color: "#1d4ed8",
    bg: "#dbeafe",
    border: "#93c5fd",
    mapColor: "#2563eb",
    sortTier: 2,
    assignSection: "ocupados",
  },
  atencion: {
    key: "atencion",
    label: "Atención",
    dot: "🔴",
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fca5a5",
    mapColor: "#dc2626",
    sortTier: 3,
    assignSection: "atencion",
  },
});

export const ASIGNAR_CONDUCTOR_SECTIONS = Object.freeze([
  { id: "disponibles", title: "Disponibles para asignar" },
  { id: "ocupados", title: "Con servicio asignado" },
  { id: "atencion", title: "Atención" },
]);

/** Atención crítica (incidencia, límites, GPS muy antiguo). Sin ubicación simple → gris. */
export function hasCriticalAttention(classified) {
  if (!classified?.needsAttention) return false;
  const signals = classified.attentionSignals || [];
  if (!signals.length) return true;
  return signals.some((s) => s.code !== "sin_ubicacion");
}

export function hasSinUbicacionReciente(ubic) {
  return !ubic || ubic.missing || ubic.fetchError || ubic.recent === false;
}

/**
 * @param {ReturnType<import("./empresaDashboardTowerModel.js").classifyConductorTowerState>|null} classified
 * @param {object|null} ubic
 */
export function resolveConductorOperationalVisual(classified, ubic) {
  if (!classified) return CONDUCTOR_VISUAL.disponible;

  if (classified.conServicioActivo) {
    if (hasCriticalAttention(classified)) return CONDUCTOR_VISUAL.atencion;
    return CONDUCTOR_VISUAL.en_servicio;
  }
  if (classified.conProximoServicio) {
    if (hasCriticalAttention(classified)) return CONDUCTOR_VISUAL.atencion;
    return CONDUCTOR_VISUAL.proximo_servicio;
  }
  if (hasCriticalAttention(classified)) return CONDUCTOR_VISUAL.atencion;
  if (hasSinUbicacionReciente(ubic)) return CONDUCTOR_VISUAL.sin_ubic;
  return CONDUCTOR_VISUAL.disponible;
}

export function isConductorDisponibleParaAsignar(visual) {
  return visual?.assignSection === "disponibles";
}
