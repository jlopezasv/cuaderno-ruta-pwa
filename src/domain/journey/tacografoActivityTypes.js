/**
 * Tipos de evento tacógrafo agrupados por actividad (alineado con EV / calcNorma en cuaderno-ruta).
 * Uso: cálculo por ventana temporal (FASE 2B), sin alterar norma global.
 */

/** Fin de conducción (mismos STOP_TYPES que driveIn en calcNorma). */
export const TACOGRAFO_DRIVE_STOP_TYPES = Object.freeze([
  "fin_conduccion",
  "inicio_pausa",
  "inicio_descanso",
  "inicio_descanso_frac",
  "inicio_disponibilidad",
  "inicio_pasajero",
  "inicio_carga",
  "inicio_descarga",
  "inicio_carga_descarga",
  "inicio_otros",
  "inicio_repostaje",
  "inicio_inspeccion",
  "inicio_ferry",
  "fin_jornada",
]);

export const TACOGRAFO_REST_PAIRS = Object.freeze([
  ["inicio_pausa", "fin_pausa"],
  ["inicio_descanso", "fin_descanso"],
  ["inicio_descanso_frac", "fin_descanso_frac"],
]);

export const TACOGRAFO_DISPONIBILIDAD_PAIRS = Object.freeze([
  ["inicio_disponibilidad", "fin_disponibilidad"],
  ["inicio_pasajero", "fin_pasajero"],
  ["inicio_ferry", "fin_ferry"],
]);

export const TACOGRAFO_TRABAJO_PAIRS = Object.freeze([
  ["inicio_carga", "fin_carga"],
  ["inicio_descarga", "fin_descarga"],
  ["inicio_carga_descarga", "fin_carga_descarga"],
  ["inicio_repostaje", "fin_repostaje"],
  ["inicio_inspeccion", "fin_inspeccion"],
  ["inicio_otros", "fin_otros"],
]);

export const TACOGRAFO_DRIVE_OPEN = "inicio_conduccion";
