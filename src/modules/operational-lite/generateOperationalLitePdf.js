import { buildOperationalLitePdfBlob } from "./operationalLitePdfBuilder.js";

export async function downloadOperationalLitePdf(doc) {
  const blob = await buildOperationalLitePdfBlob(doc);
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${doc.filenameBase || "expediente-operacional"}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

export { buildOperationalLitePdfBlob };
