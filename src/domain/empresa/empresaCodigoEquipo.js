/** Código de vinculación de conductores (empresas.codigo_equipo / codigo_corto). */

export function normalizeEmpresaVinculoCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Código real de equipo (sin TMP). Vacío si aún no hay migración / trigger. */
export function getEmpresaEquipoCodeStrict(emp) {
  if (!emp) return "";
  const a = String(emp.codigo_equipo || "").trim();
  if (a) return a;
  return String(emp.codigo_corto || "").trim();
}

/** Código visible: codigo_equipo > codigo_corto > TMP- (solo fallback legacy). */
export function getEmpresaCodigoEquipoDisplay(emp) {
  if (!emp) return "";
  const strict = getEmpresaEquipoCodeStrict(emp);
  if (strict) return strict;
  if (emp.id) {
    const h = String(emp.id).replace(/-/g, "").slice(0, 6).toUpperCase();
    return h ? `TMP-${h}` : "";
  }
  return "";
}

export function isEmpresaCodigoTemporal(displayCode) {
  return String(displayCode || "").startsWith("TMP-");
}
