/**
 * Vocabulario UI y valores canónicos de `servicios.estado` (Supabase CHECK).
 * Flujo conductor: asignado → en_curso → completado → cerrado (cierre documental).
 */

/** Estados literales (PATCH/INSERT). */
export const SERVICIO_ESTADO_PENDIENTE_ASIGNACION = "pendiente_asignacion";
export const SERVICIO_ESTADO_ASIGNADO = "asignado";
export const SERVICIO_ESTADO_EN_CURSO = "en_curso";
export const SERVICIO_ESTADO_COMPLETADO = "completado";
export const SERVICIO_ESTADO_CERRADO = "cerrado";
export const SERVICIO_ESTADO_ANULADO = "anulado";
export const SERVICIO_ESTADO_CANCELADO = "cancelado";

/** Valores permitidos por `servicios_estado_check` (migración 20260522130000). */
export const SERVICIO_ESTADOS_DB = Object.freeze([
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_CERRADO,
  SERVICIO_ESTADO_ANULADO,
  SERVICIO_ESTADO_CANCELADO,
]);

export function isServicioEstadoValid(estado) {
  return SERVICIO_ESTADOS_DB.includes(String(estado || "").toLowerCase());
}

/** Ciclo operativo + cierre documental del conductor. */
export const SERVICIO_ESTADOS_FLUJO_CONDUCTOR = Object.freeze([
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_CERRADO,
]);

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
