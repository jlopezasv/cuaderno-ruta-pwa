import { sbFetch } from "../../data/supabaseClient.js";
import { uploadBlobToStorage } from "../../data/uploadUserPhoto.js";
import { storageUploadUrl } from "../documents/mediaStorageV2.js";
import { tryDriverGeoSnapshot } from "../../data/driverActionGps.js";
import { geoFromGpsPoint } from "./operationalGeo.js";
import {
  buildExpedienteCierreMetaPatch,
  mergeReferenciaConCierre,
} from "./expedienteCierre.js";

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
 * Sube firma, persiste cierre en referencia y pasa el servicio a `cerrado`.
 * @param {{ servicio: object, comentario?: string, firmaCanvas: HTMLCanvasElement, conductorId?: string, conductorNombre?: string }} p
 */
export async function cerrarExpedienteServicio({
  servicio,
  comentario = "",
  firmaCanvas,
  conductorId = null,
  conductorNombre = null,
}) {
  if (!servicio?.id) throw new Error("Servicio no válido");
  if (!firmaCanvas) throw new Error("Añade tu firma antes de cerrar");

  const firmaBlob = await canvasToPngBlob(firmaCanvas);

  let firmaUrl = null;
  try {
    const storage = await uploadBlobToStorage(
      firmaBlob,
      "image/png",
      "expediente_firma",
      `firma_${servicio.id}.png`,
      { requireHttpUrl: true },
    );
    firmaUrl = storageUploadUrl(storage);
  } catch (e) {
    throw new Error(e?.message || "No se pudo guardar la firma");
  }

  let geo = null;
  try {
    const point = await tryDriverGeoSnapshot({ timeoutMs: 10000 });
    geo = geoFromGpsPoint(point);
  } catch {
    geo = null;
  }

  const closedAt = new Date().toISOString();
  const referencia = mergeReferenciaConCierre(
    servicio.referencia || "",
    buildExpedienteCierreMetaPatch({
      comentario,
      firmaUrl,
      conductorId,
      conductorNombre,
      geo,
      closedAt,
    }),
  );

  const res = await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ estado: "cerrado", referencia }),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg = payload?.message || payload?.hint || `Error al cerrar expediente (${res.status})`;
    throw new Error(msg);
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  return {
    servicio: row || { ...servicio, estado: "cerrado", referencia },
    referencia: row?.referencia ?? referencia,
    closedAt,
    firmaUrl,
  };
}
