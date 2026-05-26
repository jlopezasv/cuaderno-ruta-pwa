import { getDocMeta } from "../documents/operationalDocumentRecord.js";

export const DOCUMENT_TYPES = Object.freeze(["cmr", "foto", "incidencia", "qr"]);

export function getDocumentLabel(ev) {
  const meta = getDocMeta(ev);
  if (meta?.display_name) return meta.display_name.replace(/_/g, " · ");
  if (ev?.tipo === "cmr" && ev?.datos?.num_cmr) return "CMR " + ev.datos.num_cmr;
  if (ev?.tipo === "nota") return "Observación";
  return (ev?.tipo || "").toUpperCase();
}

export function countServiceDocuments(stops, evidenciasByStop, extraDocs = null) {
  const stopCount = (Array.isArray(stops) ? stops : []).reduce(
    (a, st) => (evidenciasByStop?.[st.id] || []).length + a,
    0,
  );
  const extraCount = Array.isArray(extraDocs) ? extraDocs.length : 0;
  return stopCount + extraCount;
}

export function groupDocumentsByStop(evidencias) {
  const evMap = {};
  (Array.isArray(evidencias) ? evidencias : []).forEach((ev) => {
    if (!evMap[ev.stop_id]) evMap[ev.stop_id] = [];
    evMap[ev.stop_id].push(ev);
  });
  return evMap;
}

const EVIDENCIAS_FETCH_CHUNK = 48;

/** Carga evidencias por stop_id en lotes (evita URLs largas y fallos silenciosos). */
export async function fetchEvidenciasGroupedByStop(stopIds, sbFetch) {
  const ids = [...new Set((Array.isArray(stopIds) ? stopIds : []).filter(Boolean))];
  if (!ids.length) return {};
  const all = [];
  for (let i = 0; i < ids.length; i += EVIDENCIAS_FETCH_CHUNK) {
    const chunk = ids.slice(i, i + EVIDENCIAS_FETCH_CHUNK);
    const r = await sbFetch(
      `/rest/v1/evidencias?stop_id=in.(${chunk.join(",")})&order=stop_id.asc,created_at.asc`,
    );
    if (!r.ok) {
      console.warn("fetchEvidenciasGroupedByStop:", r.status, chunk.length);
      continue;
    }
    const evs = await r.json();
    if (Array.isArray(evs)) all.push(...evs);
  }
  return groupDocumentsByStop(all);
}

export function isIncidentDocument(ev) {
  return ev?.tipo === "incidencia";
}
