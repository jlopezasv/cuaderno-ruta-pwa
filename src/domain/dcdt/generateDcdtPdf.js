import { buildDcdtPdfBlob } from "./dcdtPdfBuilder.js";

export async function downloadDcdtPdf(doc, filename) {
  const blob = await buildDcdtPdfBlob(doc);
  const name = filename || `dcdt-${doc.referencia || "servicio"}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[^\w.\-áéíóúñ]+/gi, "_");
  a.click();
  URL.revokeObjectURL(url);
}

export { buildDcdtPdfBlob };
