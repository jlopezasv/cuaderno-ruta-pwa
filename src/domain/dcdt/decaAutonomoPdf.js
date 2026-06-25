import { buildDcdtPdfBlob } from "./dcdtPdfBuilder.js";
import { resolveAutonomoDecaDocument } from "./decaAutonomoModel.js";

export async function generateAutonomoDecaPdfBlob(deca) {
  const doc = resolveAutonomoDecaDocument(deca);
  return buildDcdtPdfBlob(doc, { creationDate: deca?.createdAt || new Date().toISOString() });
}

export async function downloadAutonomoDecaPdf(deca, filename) {
  const blob = await generateAutonomoDecaPdfBlob(deca);
  const name =
    filename ||
    `DeCA-${String(deca?.decaPublicId || deca?.id || "documento").slice(0, 8)}.pdf`;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
