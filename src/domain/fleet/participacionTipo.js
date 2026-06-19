/** Alcance operativo del conductor en un servicio (demo: paradas visibles en lista plana). */
export const PARTICIPACION_TIPO = Object.freeze({
  TODO: "todo",
  SOLO_CARGAS: "solo_cargas",
  SOLO_DESCARGAS: "solo_descargas",
});

export const PARTICIPACION_TIPO_OPTIONS = Object.freeze([
  { value: PARTICIPACION_TIPO.TODO, label: "Todo el servicio" },
  { value: PARTICIPACION_TIPO.SOLO_CARGAS, label: "Solo cargas" },
  { value: PARTICIPACION_TIPO.SOLO_DESCARGAS, label: "Solo descargas" },
]);

export function normalizeParticipacionTipo(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === PARTICIPACION_TIPO.SOLO_CARGAS) return PARTICIPACION_TIPO.SOLO_CARGAS;
  if (v === PARTICIPACION_TIPO.SOLO_DESCARGAS) return PARTICIPACION_TIPO.SOLO_DESCARGAS;
  return PARTICIPACION_TIPO.TODO;
}

function stopOperationalGroup(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "carga") return "carga";
  if (t === "descarga") return "descarga";
  if (t.includes("carga") && t.includes("descarga")) return "carga_descarga";
  return "otra";
}

/** ¿La parada entra en el alcance del conductor según participacion_tipo? */
export function stopMatchesParticipacionTipo(stop, participacionTipo) {
  const scope = normalizeParticipacionTipo(participacionTipo);
  if (scope === PARTICIPACION_TIPO.TODO) return true;
  const group = stopOperationalGroup(stop?.tipo);
  if (scope === PARTICIPACION_TIPO.SOLO_CARGAS) {
    return group === "carga" || group === "carga_descarga";
  }
  if (scope === PARTICIPACION_TIPO.SOLO_DESCARGAS) {
    return group === "descarga" || group === "carga_descarga";
  }
  return true;
}

export function participacionTipoLabel(raw) {
  const v = normalizeParticipacionTipo(raw);
  return PARTICIPACION_TIPO_OPTIONS.find((o) => o.value === v)?.label || "Todo el servicio";
}
