export const DOCUMENT_TYPES = Object.freeze(["cmr", "foto", "incidencia", "qr", "nota"]);

export function getDocumentLabel(ev) {
  if (ev?.tipo === "cmr" && ev?.datos?.num_cmr) return "CMR " + ev.datos.num_cmr;
  return (ev?.tipo || "").toUpperCase();
}

export function countServiceDocuments(stops, evidenciasByStop) {
  return (Array.isArray(stops) ? stops : []).reduce((a, st) => (evidenciasByStop?.[st.id] || []).length + a, 0);
}

export function groupDocumentsByStop(evidencias) {
  const evMap = {};
  (Array.isArray(evidencias) ? evidencias : []).forEach((ev) => {
    if (!evMap[ev.stop_id]) evMap[ev.stop_id] = [];
    evMap[ev.stop_id].push(ev);
  });
  return evMap;
}

export function isIncidentDocument(ev) {
  return ev?.tipo === "incidencia";
}
