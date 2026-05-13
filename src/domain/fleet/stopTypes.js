/**
 * Tipos de parada (`stops.tipo`) en Supabase / UI.
 * Fuente única — valores copiados literalmente desde cuaderno-ruta.jsx (PR-05B).
 */

/** @type {Readonly<Record<string, string>>} */
export const STOP_ICON = Object.freeze({
  carga: "📦",
  descarga: "📤",
  parada_tecnica: "🔧",
  aduana: "🛃",
  pernocta: "🛏",
  parada: "📍",
});

/** @type {Readonly<Record<string, string>>} */
export const STOP_COLOR = Object.freeze({
  carga: "#22C55E",
  descarga: "#F59E0B",
  parada_tecnica: "#64748B",
  aduana: "#A78BFA",
  pernocta: "#7C3AED",
  parada: "#06B6D4",
});

/** Etiquetas cortas por `stops.tipo` (UI listados / conductor). */
/** @type {Readonly<Record<string, string>>} */
export const STOP_LABEL = Object.freeze({
  carga: "Carga",
  descarga: "Descarga",
  parada_tecnica: "Parada técnica",
  aduana: "Aduana",
  pernocta: "Pernocta",
  parada: "Parada",
  otros: "Parada",
  pausa: "Pausa",
  reparto: "Reparto",
});

/**
 * Etiqueta legible para `stops.tipo` (UI conductor / listados).
 * @param {string|null|undefined} tipo
 * @returns {string}
 */
export function formatStopTipoLabel(tipo) {
  if (!tipo || typeof tipo !== "string") return "Parada";
  const key = tipo.trim().toLowerCase();
  if (STOP_LABEL[key]) return STOP_LABEL[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Opciones de `<select>` — mismo orden y textos que AsignarServicioModal / StopFormRow. */
export const STOP_TIPOS_FORM = Object.freeze([
  { id: "carga", label: "Carga", icon: "📦" },
  { id: "descarga", label: "Descarga", icon: "📤" },
  { id: "parada_tecnica", label: "Parada técnica", icon: "🔧" },
  { id: "aduana", label: "Aduana", icon: "🛃" },
  { id: "pernocta", label: "Pernocta", icon: "🛏" },
]);

/** Al completar stop, auto-registro tacógrafo (useServicioActivo → marcarCompletado). */
export const STOP_TIPOS_CON_AUTOTACO = Object.freeze(["carga", "descarga", "parada_tecnica"]);

/** @type {Readonly<Record<string, string>>} */
export const STOP_TIPO_TO_INICIO_EV = Object.freeze({
  carga: "inicio_carga",
  descarga: "inicio_descarga",
  parada_tecnica: "inicio_otros",
});

/** @type {Readonly<Record<string, string>>} */
export const STOP_TIPO_TO_FIN_EV = Object.freeze({
  carga: "fin_carga",
  descarga: "fin_descarga",
  parada_tecnica: "fin_otros",
});
