import { formatSpanishAgo } from "../../domain/service/etaFormatter.js";

/**
 * Presentación demo de ubicación (solo UI; no altera lectura GPS).
 * @param {object|null} raw — fila ubicación del conductor
 * @param {(raw: object|null) => string} formatLugar
 * @param {number} [nowMs]
 */
export function formatConductorUbicacionDemoDisplay(raw, formatLugar, nowMs = Date.now()) {
  const lugar = typeof formatLugar === "function" ? formatLugar(raw) : "—";
  if (!raw || raw.missing || raw.fetchError) {
    return { lugar, freshness: "Sin actualización reciente", isRecent: false };
  }

  if (raw.recent === false) {
    return { lugar, freshness: "Sin actualización reciente", isRecent: false };
  }

  const ts = raw.updatedAt || raw.ts;
  if (ts) {
    const ago = formatSpanishAgo(ts, new Date(nowMs));
    const freshness =
      ago === "ahora" ? "Actualizado ahora" : ago.startsWith("hace") ? `Actualizado ${ago}` : `Actualizado · ${ago}`;
    return { lugar, freshness, isRecent: true };
  }

  if (raw.recent) {
    return { lugar, freshness: "Actualizado recientemente", isRecent: true };
  }

  return { lugar, freshness: "Sin actualización reciente", isRecent: false };
}
