import { sbFetch } from "../../data/supabaseClient.js";
import { uploadBlobToStorage } from "../../data/uploadUserPhoto.js";
import { storageUploadUrl } from "../documents/mediaStorageV2.js";
import { geoPayloadFromLocationResult } from "../../data/driverActionGps.js";
import { sanitizeDocumentCommentText } from "../documents/documentCommentSanitize.js";
import { mergeStopOperacionMeta } from "./stopOperacionMeta.js";

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas) {
      reject(new Error("Firma no válida"));
      return;
    }
    canvas.toBlob(
      (blob) => (blob && blob.size > 0 ? resolve(blob) : reject(new Error("Firma vacía"))),
      "image/png",
      0.92,
    );
  });
}

/**
 * Sube y persiste la firma de entrega en la parada de descarga (`stops.notas`).
 * Debe llamarse antes de `marcarCompletadoEn` para esa parada.
 */
export async function persistDescargaEntregaFirma({
  stop,
  servicioId = null,
  firmaCanvas,
  conductorId = null,
  conductorNombre = null,
  comentario = "",
  prefetchedGps = null,
}) {
  if (!stop?.id) throw new Error("Parada no válida");
  if (!firmaCanvas) throw new Error("Añade tu firma antes de completar la descarga");

  const firmaBlob = await canvasToPngBlob(firmaCanvas);
  const sid = servicioId || stop.servicio_id || "sv";
  let firmaUrl = null;
  try {
    const storage = await uploadBlobToStorage(
      firmaBlob,
      "image/png",
      "expediente_firma",
      `firma_descarga_${sid}_${stop.id}.png`,
      { requireHttpUrl: true },
    );
    firmaUrl = storageUploadUrl(storage);
  } catch (e) {
    throw new Error(e?.message || "No se pudo guardar la firma");
  }

  const signedAt = new Date().toISOString();
  const geo =
    prefetchedGps != null
      ? geoPayloadFromLocationResult(prefetchedGps)
      : null;

  const notas = mergeStopOperacionMeta(stop.notas, {
    entrega_firma_url: firmaUrl,
    entrega_firma_at: signedAt,
    entrega_conductor_id: conductorId || null,
    entrega_conductor_nombre: conductorNombre || null,
    entrega_firma_comentario: sanitizeDocumentCommentText(comentario) || null,
    entrega_firma_geo: geo && Number.isFinite(Number(geo.lat)) ? geo : null,
  });

  const res = await sbFetch(`/rest/v1/stops?id=eq.${stop.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ notas }),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg = payload?.message || payload?.hint || `No se pudo guardar la firma (${res.status})`;
    throw new Error(msg);
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  return {
    stop: row || { ...stop, notas },
    notas: row?.notas ?? notas,
    firmaUrl,
    signedAt,
  };
}
