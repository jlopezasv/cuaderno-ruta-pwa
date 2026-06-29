/**
 * Evita mostrar JSON/errores técnicos de PostgREST al conductor.
 * @param {unknown} err
 * @param {string} fallback
 * @returns {Error}
 */
export function humanizeApiError(err, fallback = "No se pudo completar la operación.") {
  const raw = String(err?.message || err || "").trim();
  console.error("[api-error]", raw || err);

  if (!raw) return new Error(fallback);
  if (raw.startsWith("{") || raw.startsWith("[") || raw.includes('"code"')) {
    return new Error(fallback);
  }
  if (raw.length > 140 || /ERRCODE|42703|42501|23505/i.test(raw)) {
    return new Error(fallback);
  }
  return err instanceof Error ? err : new Error(fallback);
}
