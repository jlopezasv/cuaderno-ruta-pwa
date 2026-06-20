import { isDescargaStopTipo } from "../fleet/stopTypes.js";
import { getStopEntregaFirmaMeta } from "./stopOperacionMeta.js";

/** Bloque de firma de entrega listo para expediente operacional / PDF. */
export function mapStopEntregaFirmaForExpediente(stop, { stopLabel = null, signedAtLabel = null } = {}) {
  const meta = getStopEntregaFirmaMeta(stop);
  if (!meta?.firma_url) return null;
  return {
    stop_id: stop?.id ?? meta.stop_id,
    stop_label: stopLabel || stop?.nombre || null,
    stop_nombre: stop?.nombre || stopLabel || null,
    stop_tipo: stop?.tipo || null,
    firma_url: meta.firma_url,
    signed_at: meta.signed_at,
    signed_at_label: signedAtLabel || meta.signed_at || null,
    conductor_id: meta.conductor_id,
    conductor_nombre: meta.conductor_nombre,
    comentario: meta.comentario || null,
    geo: meta.geo || null,
    hasFirma: true,
  };
}

/** Firmas de entrega en paradas de descarga (orden de ruta). */
export function collectFirmasEntregaDescargaFromStops(stops, { labelForStop } = {}) {
  const sorted = [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const out = [];
  for (const stop of sorted) {
    if (!isDescargaStopTipo(stop?.tipo)) continue;
    const label = typeof labelForStop === "function" ? labelForStop(stop) : stop?.nombre || null;
    const row = mapStopEntregaFirmaForExpediente(stop, { stopLabel: label });
    if (row) out.push(row);
  }
  return out;
}
