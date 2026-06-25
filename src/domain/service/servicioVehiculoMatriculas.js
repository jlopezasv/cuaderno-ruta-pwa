/** Prioridad: override DeCA/servicio si existe; si no, matrícula del conductor asignado. */
export function pickVehiculoStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function vehiculoOverridesFromDcdtDatos(vehiculo = null) {
  const v = vehiculo || {};
  const out = {};
  if (v.matricula_override != null) {
    out.matriculaOverride = String(v.matricula_override).trim();
  }
  if (v.remolque_override != null) {
    out.remolqueOverride = String(v.remolque_override).trim();
  }
  return out;
}

/**
 * Matrículas efectivas para formulario DeCA / edición servicio.
 * @param {string|undefined|null} matriculaOverride — solo si guardado en DeCA
 * @param {string|undefined|null} remolqueOverride — solo si guardado en DeCA
 */
export function resolveEffectiveServicioVehiculo({
  matriculaOverride,
  remolqueOverride,
  conductor = null,
} = {}) {
  const cMat = String(conductor?.matricula ?? "").trim();
  const cRem = String(conductor?.remolque ?? "").trim();

  const matricula =
    matriculaOverride !== undefined && matriculaOverride !== null
      ? String(matriculaOverride).trim()
      : cMat;
  const remolque =
    remolqueOverride !== undefined && remolqueOverride !== null
      ? String(remolqueOverride).trim()
      : cRem;

  return { matricula, remolque };
}
