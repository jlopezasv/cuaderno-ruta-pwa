import { processOperationalDocumentImage } from "../domain/documents/operationalDocumentPipeline.js";
import {
  buildOperationalDocumentName,
  buildOperationalFileName,
} from "../domain/documents/operationalDocumentNaming.js";
import { buildDocMetaPayload } from "../domain/documents/operationalDocumentRecord.js";
import { uploadBlobToStorage, uploadUserFile } from "./uploadUserPhoto.js";

/**
 * Sube preview operacional (+ original opcional) con metadatos.
 * @returns {Promise<{ previewUrl: string, originalUrl: string|null, docMeta: object, displayName: string }>}
 */
export async function uploadOperationalDocument(file, {
  folder = "stops",
  tipo = "foto",
  context = {},
  processImage = true,
} = {}) {
  console.log("DOCUMENT_VERSION_TEST_15_MAY");
  const {
    servicio = null,
    stop = null,
    conductorName = null,
    conductorId = null,
    cliente = null,
    ciudad = null,
    eventoOperacional = null,
    geo = null,
  } = context;

  const displayName = buildOperationalDocumentName({
    tipo,
    fecha: new Date().toISOString(),
    cliente: cliente || servicio?.cliente,
    ciudad: ciudad || stop?.nombre,
    conductor: conductorName,
    servicioRef: servicio?.referencia,
    stop,
  });

  const isPdf =
    String(file?.type || "").includes("pdf") || String(file?.name || "").toLowerCase().endsWith(".pdf");

  let previewUrl;
  let originalUrl = null;
  let width = null;
  let height = null;
  let previewBytes = file?.size || 0;
  let originalBytes = null;
  let mime = file?.type || "image/jpeg";

  if (isPdf) {
    previewUrl = await uploadUserFile(file, folder);
    mime = "application/pdf";
  } else if (processImage) {
    const processed = await processOperationalDocumentImage(file);
    const previewName = buildOperationalFileName(displayName, "jpg");
    previewUrl = await uploadBlobToStorage(processed.previewBlob, "image/jpeg", folder, previewName);
    previewBytes = processed.previewBytes;
    width = processed.width;
    height = processed.height;
    if (processed.originalBlob) {
      const origName = buildOperationalFileName(`${displayName}_original`, "jpg");
      originalUrl = await uploadBlobToStorage(processed.originalBlob, file.type || "image/jpeg", `${folder}/original`, origName);
      originalBytes = processed.originalBytes;
    }
  } else {
    previewUrl = await uploadUserFile(file, folder);
  }

  const docMeta = buildDocMetaPayload({
    displayName,
    archivoNombre: buildOperationalFileName(displayName, isPdf ? "pdf" : "jpg"),
    mimeType: mime,
    sizeBytes: previewBytes + (originalBytes || 0),
    sizePreviewBytes: previewBytes,
    sizeOriginalBytes: originalBytes,
    width,
    height,
    previewUrl,
    originalUrl,
    stopId: stop?.id || null,
    servicioId: servicio?.id || null,
    conductorId: conductorId || servicio?.conductor_id || null,
    tipoDocumento: tipo,
    cliente: cliente || null,
    ciudad: ciudad || stop?.nombre || null,
    eventoOperacional,
    geo,
  });

  return { previewUrl, originalUrl, docMeta, displayName };
}
