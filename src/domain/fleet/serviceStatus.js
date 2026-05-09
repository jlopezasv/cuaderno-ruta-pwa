/**
 * Vocabulario UI para la columna `servicios.estado` (Supabase).
 * Fuente única — valores copiados literalmente desde cuaderno-ruta.jsx (PR-05A).
 */

/** @type {Readonly<Record<string, string>>} */
export const ESTADO_COLOR = Object.freeze({
  asignado: "#3B82F6",
  en_curso: "#F59E0B",
  completado: "#22C55E",
  cancelado: "#EF4444",
});

/** @type {Readonly<Record<string, string>>} */
export const ESTADO_LABEL = Object.freeze({
  asignado: "Asignado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
});

/** @type {Readonly<Record<string, string>>} */
export const ESTADO_ICON = Object.freeze({
  asignado: "📋",
  en_curso: "🚛",
  completado: "🏁",
  cancelado: "❌",
});

/** Estados incluidos en filtros “activos” (sin cambiar orden ni strings). */
export const SERVICIO_ESTADOS_ACTIVOS = Object.freeze(["asignado", "en_curso"]);
