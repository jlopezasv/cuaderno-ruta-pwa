import { getExpedienteCierre } from "../service/expedienteCierre.js";

/** Días naturales de descarga pública tras fin efectivo del servicio (DeCA / FOM). */
export const DECA_PUBLIC_DOWNLOAD_DAYS = 7;

/** Conservación mínima del fichero PDF en servidor (independiente de la URL pública). */
export const DCDT_MIN_RETENTION_DAYS = 365;

const MS_PER_DAY = 86400000;

const SERVICIO_FIN_ESTADOS = new Set(["cerrado", "completado", "cancelado", "anulado"]);

function startOfUtcDayMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Días naturales transcurridos desde una marca temporal (UTC, por día calendario). */
export function calendarDaysSince(isoStart, nowMs = Date.now()) {
  const startMs = Date.parse(String(isoStart || "").trim());
  if (!Number.isFinite(startMs)) return null;
  return Math.floor((startOfUtcDayMs(nowMs) - startOfUtcDayMs(startMs)) / MS_PER_DAY);
}

/**
 * Fin efectivo del servicio para retención DeCA.
 * Prioridad: cierre documental → estados terminales con updated_at.
 * Servicio aún activo → null (descarga pública permitida).
 */
export function resolveServicioFinEfectivoAt(servicio) {
  if (!servicio) return null;

  const closedAt = getExpedienteCierre(servicio)?.closed_at;
  if (closedAt) return String(closedAt).trim() || null;

  const estado = String(servicio.estado || "").toLowerCase();
  if (SERVICIO_FIN_ESTADOS.has(estado)) {
    const updated = servicio.updated_at;
    return updated ? String(updated).trim() : null;
  }

  return null;
}

/** true si la ventana pública de descarga DeCA ya expiró (>7 días naturales tras el fin). */
export function isDecaPublicDownloadExpired(finEfectivoIso, nowMs = Date.now()) {
  if (!finEfectivoIso) return false;
  const days = calendarDaysSince(finEfectivoIso, nowMs);
  if (days === null) return false;
  return days > DECA_PUBLIC_DOWNLOAD_DAYS;
}

/** ISO del último instante inclusivo de descarga pública (fin del día natural N+7). */
export function decaPublicDownloadUntilIso(finEfectivoIso) {
  const startMs = Date.parse(String(finEfectivoIso || "").trim());
  if (!Number.isFinite(startMs)) return null;
  return new Date(startOfUtcDayMs(startMs) + (DECA_PUBLIC_DOWNLOAD_DAYS + 1) * MS_PER_DAY - 1).toISOString();
}

export function retentionUntilIso(from = new Date(), days = DCDT_MIN_RETENTION_DAYS) {
  const baseMs = from instanceof Date ? from.getTime() : Date.parse(String(from));
  const safeMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(safeMs + days * MS_PER_DAY).toISOString();
}
