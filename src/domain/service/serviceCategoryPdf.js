import { resolveDcdtPdfAccessUrl } from "../dcdt/dcdtPdfDocument.js";
import { fetchDcdtByServicio } from "../dcdt/dcdtModel.js";
import {
  formatServiceMessageClock,
  listServiceMessages,
} from "../messages/serviceMessagesApi.js";
import { extraDocFileUrl, resolveExtraDocAccessUrl } from "./serviceExtraDocuments.js";
import {
  expedienteForOperacionalCategory,
  SERVICE_DOC_CATEGORY,
  SERVICE_DOC_CATEGORY_META,
} from "./serviceDocumentCategories.js";
import {
  downloadServiceExpedientePdf,
  makeServiceExpedientePdfBlob,
} from "./serviceExpediente.js";

const enc = new TextEncoder();

function plain(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .trim();
}

function pdfEscape(text) {
  return plain(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text, maxChars = 82) {
  const words = plain(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function bytes(data) {
  return enc.encode(data);
}

function concatParts(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function triggerBlobDownload(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

function findDcdtExtraDoc(extraDocs = []) {
  return (Array.isArray(extraDocs) ? extraDocs : []).find(
    (d) => String(d?.tipo || "").toLowerCase() === "dcdt",
  );
}

async function fetchUrlAsBlob(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo descargar el PDF");
  return r.blob();
}

/** PDF bloc de notas del chat operativo. */
export async function buildChatOperativoPdfBlob({
  servicio,
  messages = [],
  empresaNombre = null,
  empresaCif = null,
}) {
  const ref = servicio?.referencia || servicio?.id || "SERV";
  const meta = SERVICE_DOC_CATEGORY_META[SERVICE_DOC_CATEGORY.CHAT];
  const margin = 48;
  const pageW = 595;
  const pageH = 842;
  const lineH = 14;
  const objects = [];
  const pageRefs = [];
  let y = pageH - margin;
  const commands = [];

  function ensure(h) {
    if (y - h < margin) finishPage(false);
  }

  function text(str, x, size = 10, color = "#0f172a", bold = false) {
    const [r, g, b] = [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
    commands.push(
      `BT /F${bold ? 2 : 1} ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x} ${y} Td (${pdfEscape(str)}) Tj ET`,
    );
    y -= lineH;
  }

  function bodyLines(str, x, size = 10, color = "#334155") {
    for (const ln of wrapText(str, 78)) {
      ensure(lineH + 2);
      text(ln, x, size, color);
    }
  }

  function finishPage(last) {
    const stream = commands.join("\n");
    const pageIdx = objects.length + 1;
    const contentIdx = objects.length + 2;
    pageRefs.push(`${pageIdx} 0 R`);
    objects.push(
      bytes(
        `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentIdx} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
      ),
    );
    objects.push(bytes(`<< /Length ${bytes(stream).length} >>\nstream\n${stream}\nendstream`));
    commands.length = 0;
    if (!last) y = pageH - margin;
  }

  text(meta.headerTitle, margin, 16, "#0c4a6e", true);
  y -= 4;
  text(meta.headerSubtitle, margin, 9, "#64748b");
  y -= 8;
  if (empresaNombre) text(empresaNombre, margin, 11, "#0f172a", true);
  if (empresaCif) text(`CIF ${empresaCif}`, margin, 9, "#64748b");
  text(`Servicio: ${ref}`, margin, 10, "#334155");
  y -= 10;

  const rows = Array.isArray(messages) ? messages : [];
  if (!rows.length) {
    bodyLines("Sin mensajes en este servicio.", margin, 11, "#64748b");
  } else {
    for (const msg of rows) {
      ensure(48);
      const autor = msg.sender_name || msg.sender_role || "—";
      const hora = formatServiceMessageClock(msg.created_at);
      text(`${autor} · ${hora}`, margin, 10, "#0f172a", true);
      bodyLines(msg.message || "", margin + 8, 10, "#334155");
      y -= 8;
    }
  }

  finishPage(true);

  objects.unshift(bytes("<< /Type /Pages /Kids [" + pageRefs.join(" ") + "] /Count " + pageRefs.length + " >>"));
  objects.unshift(bytes("<< /Type /Catalog /Pages 1 0 R >>"));
  objects.push(bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  objects.push(bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"));
  objects.push(bytes("trailer\n<< /Size " + (objects.length + 1) + " /Root 2 0 R >>\nstartxref\n0\n%%EOF"));

  const body = concatParts(objects);
  return new Blob([body], { type: "application/pdf" });
}

export async function resolveDcdtCategoryPdfBlob({ servicioId, extraDocs = [] }) {
  const extra = findDcdtExtraDoc(extraDocs);
  if (extra) {
    const url = await resolveExtraDocAccessUrl(extra);
    const direct = url || extraDocFileUrl(extra);
    if (direct && String(direct).startsWith("http")) {
      return fetchUrlAsBlob(direct);
    }
  }
  if (!servicioId) throw new Error("Sin servicio");
  const dcdt = await fetchDcdtByServicio(servicioId);
  if (!dcdt) throw new Error("DCDT no disponible");
  const pdfUrl = await resolveDcdtPdfAccessUrl(dcdt);
  if (pdfUrl) return fetchUrlAsBlob(pdfUrl);
  throw new Error("Genera el PDF DCDT antes de descargarlo");
}

export async function buildCategoryPdfBlob({
  categoryId,
  expediente = null,
  servicio = null,
  extraDocs = [],
  messages = null,
  empresaNombre = null,
  empresaCif = null,
}) {
  if (categoryId === SERVICE_DOC_CATEGORY.EXPEDIENTE) {
    const exp = expedienteForOperacionalCategory(expediente);
    if (!exp) throw new Error("Expediente no disponible");
    return makeServiceExpedientePdfBlob(exp);
  }
  if (categoryId === SERVICE_DOC_CATEGORY.DCDT) {
    return resolveDcdtCategoryPdfBlob({ servicioId: servicio?.id, extraDocs });
  }
  if (categoryId === SERVICE_DOC_CATEGORY.CHAT) {
    const rows = messages ?? (servicio?.id ? await listServiceMessages(servicio.id) : []);
    return buildChatOperativoPdfBlob({
      servicio,
      messages: rows,
      empresaNombre,
      empresaCif,
    });
  }
  throw new Error("Categoría desconocida");
}

export async function downloadCategoryPdf({
  categoryId,
  expediente,
  servicio,
  extraDocs,
  messages,
  empresaNombre,
  empresaCif,
}) {
  const meta = SERVICE_DOC_CATEGORY_META[categoryId];
  const blob = await buildCategoryPdfBlob({
    categoryId,
    expediente,
    servicio,
    extraDocs,
    messages,
    empresaNombre,
    empresaCif,
  });
  const base = meta?.pdfFilename || categoryId;
  const ref = servicio?.referencia ? String(servicio.referencia).replace(/\s+/g, "_") : servicio?.id?.slice(0, 8) || "servicio";
  triggerBlobDownload(blob, `${base}_${ref}.pdf`);
}

export async function categoryPdfToBase64Attachment({
  categoryId,
  expediente,
  servicio,
  extraDocs,
  messages,
  empresaNombre,
  empresaCif,
}) {
  const meta = SERVICE_DOC_CATEGORY_META[categoryId];
  const blob = await buildCategoryPdfBlob({
    categoryId,
    expediente,
    servicio,
    extraDocs,
    messages,
    empresaNombre,
    empresaCif,
  });
  const buffer = await blob.arrayBuffer();
  const bytesArr = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytesArr.length; i++) binary += String.fromCharCode(bytesArr[i]);
  const ref = servicio?.referencia ? String(servicio.referencia).replace(/\s+/g, "_") : "servicio";
  return {
    filename: `${meta.pdfFilename}_${ref}.pdf`,
    content: btoa(binary),
    kind: `category_${categoryId}`,
    label: meta.label,
  };
}

export async function loadServiceDocumentCategoryStatus({
  servicio,
  expediente = null,
  extraDocs = [],
}) {
  const dcdtExtra = findDcdtExtraDoc(extraDocs);
  let dcdtAvailable = !!dcdtExtra;
  if (!dcdtAvailable && servicio?.id) {
    try {
      const row = await fetchDcdtByServicio(servicio.id);
      dcdtAvailable = !!(row?.pdfGeneradoAt || row?.datos?.pdf_storage_path);
    } catch {
      dcdtAvailable = false;
    }
  }

  let messageCount = 0;
  if (servicio?.id) {
    try {
      const msgs = await listServiceMessages(servicio.id);
      messageCount = msgs.length;
    } catch {
      messageCount = 0;
    }
  }

  return {
    [SERVICE_DOC_CATEGORY.EXPEDIENTE]: {
      available: !!expediente,
      statusLabel: expediente ? "PDF listo" : "Sin datos",
      detail: expediente?.header?.referencia || "—",
    },
    [SERVICE_DOC_CATEGORY.DCDT]: {
      available: dcdtAvailable,
      statusLabel: dcdtAvailable ? "PDF disponible" : "Sin DCDT / PDF",
      detail: dcdtExtra?.archivo_nombre || "—",
    },
    [SERVICE_DOC_CATEGORY.CHAT]: {
      available: messageCount > 0,
      statusLabel: messageCount > 0 ? `${messageCount} mensaje${messageCount === 1 ? "" : "s"}` : "Sin mensajes",
      detail: "Interno empresa–conductor",
    },
  };
}

/** Descarga expediente operacional (categoría pura, sin DCDT embebido). */
export async function downloadExpedienteOperacionalCategory(expediente) {
  const exp = expedienteForOperacionalCategory(expediente);
  if (!exp) throw new Error("Expediente no disponible");
  await downloadServiceExpedientePdf(exp);
}
