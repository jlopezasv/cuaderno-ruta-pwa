/** Tokens visuales compartidos UI + impresión lite (sin enterprise). */
export const LITE_THEME = Object.freeze({
  navy: "#0c4a6e",
  blue: "#0369a1",
  sky: "#e0f2fe",
  carga: "#0d9488",
  cargaBg: "#f0fdfa",
  descarga: "#0284c7",
  descargaBg: "#f0f9ff",
  warn: "#b45309",
  warnBg: "#fff7ed",
  ok: "#15803d",
  okBg: "#f0fdf4",
  tx: "#0f172a",
  su: "#64748b",
  line: "#e2e8f0",
  card: "#ffffff",
  page: "#f1f5f9",
});

export const STOP_ICON = Object.freeze({
  carga: "📦",
  descarga: "📤",
  carga_descarga: "⇄",
  otro: "📍",
});

export function stopAccent(tipo) {
  if (tipo === "descarga") return { color: LITE_THEME.descarga, bg: LITE_THEME.descargaBg };
  if (tipo === "carga") return { color: LITE_THEME.carga, bg: LITE_THEME.cargaBg };
  return { color: LITE_THEME.blue, bg: LITE_THEME.sky };
}
