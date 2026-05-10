/** Metadatos operativos embebidos al final de `stops.notas` (sin columnas nuevas). */

const MARK = "\n\n__CUADERNO_OP__:";

/**
 * Texto visible para el conductor (sin payload JSON).
 */
export function stripOperacionMetaDisplay(notas) {
  if (notas == null || String(notas) === "") return "";
  const s = String(notas);
  const i = s.indexOf(MARK);
  if (i === -1) return s.trim();
  return s.slice(0, i).trim();
}

export function getStopOperacionMeta(notas) {
  if (notas == null || String(notas) === "") return {};
  const s = String(notas);
  const i = s.indexOf(MARK);
  if (i === -1) return {};
  try {
    const raw = s.slice(i + MARK.length).trim();
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/**
 * Fusiona metadatos (p. ej. inicio_operacion_at ISO) preservando el texto libre previo.
 */
export function mergeStopOperacionMeta(notas, patch) {
  const base = stripOperacionMetaDisplay(notas);
  const prev = getStopOperacionMeta(notas);
  const next = { ...prev, ...patch };
  return base + MARK + JSON.stringify(next);
}

export function getInicioOperacionMs(stop) {
  const iso = getStopOperacionMeta(stop?.notas)?.inicio_operacion_at;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}
