import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DECA_FULL_NAME, DECA_SHORT_LABEL } from "./decaBranding.js";
import { DECA_VIVO_LEGAL_REFS } from "./decaVivoConstants.js";
import { formatStockLineLabel } from "./decaVivoStock.js";
import { DECA_PDF_MAX_BYTES } from "./dcdtPdfBuilder.js";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const LINE_H = 14;

function plain(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .trim();
}

function hexRgb(hex) {
  const h = String(hex || "#000000").replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

function formatFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * PDF del DeCA actual vivo (estado a bordo del camión).
 *
 * @param {object} params
 * @param {object} params.servicioRef — referencia/número servicio
 * @param {object|null} params.documento — fila deca_documentos
 * @param {Array<object>} params.stockActual
 * @param {object} [params.conductor]
 * @param {{ qrPngBytes?: Uint8Array|null }} [options]
 */
export async function buildDecaVivoPdfBlob({ servicioRef, documento, stockActual, conductor }, options = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const referencia = plain(servicioRef || documento?.servicio_id || "servicio");
  pdfDoc.setTitle(`${DECA_SHORT_LABEL} actual — ${referencia}`);
  pdfDoc.setSubject(`${DECA_FULL_NAME} — estado a bordo`);
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const qrBytes = options.qrPngBytes;
  const qrSize = 88;

  if (qrBytes?.length) {
    const qrImage = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImage, { x: PAGE_W - MARGIN - qrSize, y: PAGE_H - MARGIN - qrSize, width: qrSize, height: qrSize });
  }

  function drawLine(str, size = 10, bold = false, color = "#334155") {
    if (y < MARGIN + 40) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    page.drawText(plain(str), {
      x: MARGIN,
      y: y - size,
      size,
      font: bold ? fontBold : font,
      color: hexRgb(color),
      maxWidth: PAGE_W - 2 * MARGIN - (qrBytes?.length ? qrSize + 16 : 0),
    });
    y -= LINE_H + (size > 11 ? 2 : 0);
  }

  drawLine(`${DECA_SHORT_LABEL} — ${DECA_FULL_NAME}`, 14, true, "#0f172a");
  drawLine("Documento Electrónico de Control Administrativo — DeCA actual", 10, false, "#0f172a");
  drawLine(DECA_VIVO_LEGAL_REFS, 8, false, "#64748b");
  y -= 6;

  drawLine(`Servicio: ${referencia}`, 10);
  drawLine(`Versión DeCA: ${documento?.version ?? 1}`, 10);
  drawLine(`Generado: ${formatFechaHora(documento?.fecha_actualizacion || new Date().toISOString())}`, 10);
  y -= 8;

  drawLine("CARGADOR CONTRACTUAL", 11, true, "#0f172a");
  drawLine(documento?.cargador_contractual_nombre || "—", 10);
  if (documento?.cargador_contractual_nif) drawLine(`NIF: ${documento.cargador_contractual_nif}`, 9);
  y -= 4;

  drawLine("TRANSPORTISTA EFECTIVO", 11, true, "#0f172a");
  drawLine(documento?.transportista_efectivo_nombre || "—", 10);
  if (documento?.transportista_efectivo_nif) drawLine(`NIF: ${documento.transportista_efectivo_nif}`, 9);
  y -= 4;

  drawLine("VEHÍCULO", 11, true, "#0f172a");
  drawLine(`Matrícula tractora: ${documento?.matricula_tractora || "—"}`, 10);
  if (documento?.matricula_remolque) drawLine(`Matrícula remolque: ${documento.matricula_remolque}`, 10);
  if (conductor?.nombre) drawLine(`Conductor: ${conductor.nombre}`, 10);
  y -= 6;

  drawLine("MERCANCÍA ACTUALMENTE A BORDO", 11, true, "#0f172a");
  const stock = Array.isArray(stockActual) ? stockActual : [];
  if (!stock.length) {
    drawLine("Sin mercancía registrada a bordo en este momento.", 10, false, "#64748b");
  } else {
    for (const line of stock) {
      drawLine(`• ${formatStockLineLabel(line)}`, 10);
    }
  }
  y -= 6;

  drawLine("Documento generado a partir de la trazabilidad operativa del servicio.", 8, false, "#64748b");
  if (qrBytes?.length) {
    drawLine("Escanee el QR para inspección en carretera.", 8, false, "#64748b");
  }

  const pdfBytes = await pdfDoc.save();
  if (pdfBytes.byteLength > DECA_PDF_MAX_BYTES) {
    throw new Error("El PDF DeCA supera el límite de 5 MB.");
  }
  return new Blob([pdfBytes], { type: "application/pdf" });
}

/** Descarga local del PDF DeCA actual. */
export async function downloadDecaVivoPdf(params, filename = "DeCA-actual.pdf", options = {}) {
  const blob = await buildDecaVivoPdfBlob(params, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
