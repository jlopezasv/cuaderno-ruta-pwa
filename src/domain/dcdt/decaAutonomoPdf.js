import { downloadDcdtStoredPdf } from "./dcdtPdfDocument.js";
import { getUserId } from "../../data/supabaseClient.js";
import { uploadBlobToStorage, USER_PHOTOS_BUCKET } from "../../data/uploadUserPhoto.js";
import { buildDcdtPdfBlob } from "./dcdtPdfBuilder.js";
import {
  fetchAutonomoDecaById,
  markAutonomoDecaPdfGenerado,
  resolveAutonomoDecaDocument,
} from "./decaAutonomoModel.js";
import { buildDecaDownloadUrl } from "./decaUrl.js";
import { generateDecaQrPngBytes } from "./decaQrImage.js";
import { DECA_SHORT_LABEL } from "./decaBranding.js";

function triggerBlobDownload(blob, filename) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function generateAutonomoDecaPdfBlob(deca, { qrPngBytes = null } = {}) {
  const doc = resolveAutonomoDecaDocument(deca);
  return buildDcdtPdfBlob(doc, {
    creationDate: deca?.createdAt || new Date().toISOString(),
    qrPngBytes,
  });
}

/** Genera PDF con QR, sube a storage y actualiza deca_autonomo (URL pública /api/dcdt-download). */
export async function generateAndPersistAutonomoDecaPdf(deca, { downloadAfter = true } = {}) {
  if (!deca?.id) throw new Error("DeCA no encontrado");
  const uid = getUserId();
  if (!uid) throw new Error("Sesión no válida");

  const decaPublicId = String(deca.decaPublicId || "").trim();
  if (!decaPublicId) throw new Error("DeCA sin identificador público");

  const decaDownloadUrl = buildDecaDownloadUrl(decaPublicId, {
    allowBrowserOriginFallback: typeof window !== "undefined",
  });
  const qrPngBytes = await generateDecaQrPngBytes(decaDownloadUrl);
  const qrPngBlob = new Blob([qrPngBytes], { type: "image/png" });

  const blob = await generateAutonomoDecaPdfBlob(deca, { qrPngBytes });
  if (!blob?.size) throw new Error(`No se pudo generar el PDF ${DECA_SHORT_LABEL}`);

  const label = String(decaPublicId).slice(0, 8);
  const filename = `deca-autonomo-${label}.pdf`;
  if (downloadAfter) triggerBlobDownload(blob, filename);

  const folder = `${uid}/deca-autonomo/${deca.id}`;
  const storage = await uploadBlobToStorage(blob, "application/pdf", folder, filename, {
    requireHttpUrl: true,
  });
  const storagePath = storage?.path;
  const storageBucket = storage?.bucket || USER_PHOTOS_BUCKET;
  if (!storagePath) throw new Error(`PDF ${DECA_SHORT_LABEL}: upload sin ruta en storage`);

  let qrStorage = null;
  try {
    qrStorage = await uploadBlobToStorage(qrPngBlob, "image/png", folder, "deca-qr.png", {
      requireHttpUrl: true,
    });
  } catch {
    /* QR embebido en PDF; PNG suelto opcional */
  }

  const pdfMeta = {
    pdf_storage_bucket: storageBucket,
    pdf_storage_path: storagePath,
    pdf_archivo_nombre: filename,
    pdf_size_bytes: blob.size,
    pdf_has_qr: true,
    deca_public_id: decaPublicId,
    deca_download_url: decaDownloadUrl,
    deca_qr_png_bucket: qrStorage?.bucket ?? null,
    deca_qr_png_storage_path: qrStorage?.path ?? null,
    pdf_generado_en: new Date().toISOString(),
  };

  await markAutonomoDecaPdfGenerado(deca.id, pdfMeta);
  const next = await fetchAutonomoDecaById(deca.id);
  return { deca: next, blob, decaDownloadUrl, filename };
}

export async function downloadAutonomoDecaPdf(deca, filename) {
  if (deca?.datos?.pdf_storage_path) {
    const name =
      filename ||
      deca.datos.pdf_archivo_nombre ||
      `DeCA-${String(deca?.decaPublicId || deca?.id || "documento").slice(0, 8)}.pdf`;
    await downloadDcdtStoredPdf({ datos: deca.datos }, name);
    return { deca, filename: name };
  }
  return generateAndPersistAutonomoDecaPdf(deca, { downloadAfter: true });
}

/** Objeto mínimo compatible con DcdtQrModal. */
export function autonomoDecaAsQrDcdt(deca) {
  if (!deca) return null;
  return {
    decaPublicId: deca.decaPublicId,
    datos: deca.datos || {},
  };
}
