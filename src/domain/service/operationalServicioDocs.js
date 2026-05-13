/**
 * Documentación operativa en "Docs por servicio" (checklist conductor).
 * CMR + POD/evidencia de parada como foto. Sin tickets, incidencias ni notas libres.
 */
export const OPERATIONAL_SERVICIO_DOC_TIPOS = Object.freeze(["cmr", "foto"]);

export function isOperationalServicioDocTipo(tipo) {
  return OPERATIONAL_SERVICIO_DOC_TIPOS.includes(String(tipo || "").toLowerCase());
}

export function filterOperationalEvidencias(evs) {
  return (Array.isArray(evs) ? evs : []).filter((ev) => isOperationalServicioDocTipo(ev?.tipo));
}

/** Mapa stop_id -> solo evidencias operativas */
export function filterOperationalEvidenciasByStop(evidenciasByStop) {
  if (!evidenciasByStop || typeof evidenciasByStop !== "object") return {};
  const out = {};
  for (const [stopId, arr] of Object.entries(evidenciasByStop)) {
    out[stopId] = filterOperationalEvidencias(arr);
  }
  return out;
}

export function countOperationalDocuments(stops, evidenciasByStop) {
  return (Array.isArray(stops) ? stops : []).reduce((acc, st) => acc + filterOperationalEvidencias(evidenciasByStop?.[st.id]).length, 0);
}
