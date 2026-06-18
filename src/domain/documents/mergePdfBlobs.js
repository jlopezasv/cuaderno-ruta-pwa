import { PDFDocument } from "pdf-lib";

/** Concatena PDFs binarios (base + anexos) preservando todas las páginas de cada uno. */
export async function mergePdfBlobs(baseBlob, attachmentBlobs = []) {
  const attachments = (Array.isArray(attachmentBlobs) ? attachmentBlobs : []).filter(Boolean);
  if (!attachments.length) return baseBlob;

  const merged = await PDFDocument.load(await baseBlob.arrayBuffer());

  for (const blob of attachments) {
    try {
      const doc = await PDFDocument.load(await blob.arrayBuffer());
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch (e) {
      console.warn("[mergePdfBlobs] Anexo PDF omitido", e?.message || e);
    }
  }

  const bytes = await merged.save();
  return new Blob([bytes], { type: "application/pdf" });
}
