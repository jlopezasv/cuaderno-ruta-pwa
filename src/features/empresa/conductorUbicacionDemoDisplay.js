import { formatUbicacionEmpresaFreshness } from "../../domain/location/ubicacionSourceLabel.js";

/**
 * Presentación demo de ubicación (solo UI; no altera lectura GPS).
 * @param {object|null} raw — fila ubicación del conductor
 * @param {(raw: object|null) => string} formatLugar
 * @param {number} [nowMs]
 */
export function formatConductorUbicacionDemoDisplay(raw, formatLugar, nowMs = Date.now()) {
  const lugar = typeof formatLugar === "function" ? formatLugar(raw) : "—";
  const meta = formatUbicacionEmpresaFreshness(raw, nowMs);
  return {
    lugar,
    freshness: meta.freshness,
    isRecent: meta.isRecent,
    sourceLabel: meta.sourceLabel,
  };
}
