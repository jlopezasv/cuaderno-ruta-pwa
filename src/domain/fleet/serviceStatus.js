/**
 * Vocabulario UI para la columna `servicios.estado` (Supabase).
 * Fuente única — valores copiados literalmente desde cuaderno-ruta.jsx (PR-05A).
 */

/** @type {Readonly<Record<string, string>>} */
export const ESTADO_COLOR = Object.freeze({
  pendiente_asignacion: "#6366F1",
  asignado: "#3B82F6",
  en_curso: "#F59E0B",
  completado: "#22C55E",
  cerrado: "#0D9488",
  cancelado: "#EF4444",
  anulado: "#64748B",
});

/** @type {Readonly<Record<string, string>>} */
export const ESTADO_LABEL = Object.freeze({
  pendiente_asignacion: "Pendiente asignación",
  asignado: "Asignado",
  en_curso: "En curso",
  completado: "Completado",
  cerrado: "Expediente cerrado",
  cancelado: "Cancelado",
  anulado: "Anulado",
});

/** @type {Readonly<Record<string, string>>} */
export const ESTADO_ICON = Object.freeze({
  pendiente_asignacion: "◎",
  asignado: "📋",
  en_curso: "🚛",
  completado: "🏁",
  cerrado: "✓",
  cancelado: "❌",
  anulado: "○",
});

/** Estados incluidos en filtros “activos” (sin cambiar orden ni strings). */
export const SERVICIO_ESTADOS_ACTIVOS = Object.freeze(["asignado", "en_curso"]);
