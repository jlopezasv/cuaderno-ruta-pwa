import { formatSpanishAgo } from "../service/etaFormatter.js";

const SOURCE_LABELS = Object.freeze({
  actualizacion_manual: "Actualización manual",
  inicio_servicio: "Inicio de servicio",
  ruta_iniciada: "Inicio de ruta",
  entrada_muelle: "Entrada muelle",
  salida_muelle: "Salida muelle",
  inicio_operacion_stop: "Operación en parada",
});

export function resolveUbicacionSourceKey(raw) {
  const key = String(raw?.source || raw?.event_type || "").trim().toLowerCase();
  return key || null;
}

export function resolveUbicacionSourceLabel(raw) {
  const key = resolveUbicacionSourceKey(raw);
  if (!key) return null;
  return SOURCE_LABELS[key] || key.replace(/_/g, " ");
}

/**
 * Texto empresa: "hace 3 min · Actualización manual" o "Sin actualización reciente".
 */
export function formatUbicacionEmpresaFreshness(raw, nowMs = Date.now()) {
  if (!raw || raw.missing || raw.fetchError) {
    return { freshness: "Sin actualización reciente", sourceLabel: null, isRecent: false };
  }

  const sourceLabel = resolveUbicacionSourceLabel(raw);
  const suffix = sourceLabel ? ` · ${sourceLabel}` : "";

  if (raw.recent === false) {
    return { freshness: `Sin actualización reciente${suffix}`, sourceLabel, isRecent: false };
  }

  const ts = raw.updatedAt || raw.ts;
  if (!ts) {
    const base = raw.recent ? "Actualizado recientemente" : "Sin actualización reciente";
    return { freshness: `${base}${suffix}`, sourceLabel, isRecent: raw.recent !== false };
  }

  const ago = formatSpanishAgo(ts, new Date(nowMs));
  const timePart =
    ago === "ahora" ? "hace un momento" : ago.startsWith("hace") ? ago : `hace ${ago}`;
  return {
    freshness: `${timePart}${suffix}`,
    sourceLabel,
    isRecent: true,
  };
}
