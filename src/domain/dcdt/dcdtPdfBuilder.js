import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DECA_FULL_TITLE, DECA_LEGAL_REF, DECA_SHORT_LABEL } from "./decaBranding.js";

/** Límite DeCA (Orden FOM/2861/2012 / requisito electrónico). */
export const DECA_PDF_MAX_BYTES = 5 * 1024 * 1024;

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

function hexRgb(hex) {
  const h = String(hex || "#000000").replace("#", "");
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

function formatFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function parteLines(label, parte) {
  const out = [`${label}`];
  if (!parte?.nombre) {
    out.push("  —");
    return out;
  }
  out.push(`  Razon social: ${parte.nombre}`);
  if (parte.nif) out.push(`  NIF/CIF: ${parte.nif}`);
  const dom = parte.domicilio || parte.direccion;
  if (dom) out.push(`  Domicilio: ${dom}`);
  return out;
}

function parsePdfDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * PDF DeCA/DCDT (Orden FOM/2861/2012) — generado con pdf-lib (PDF válido + metadatos).
 *
 * @param {object} doc — documento resuelto (resolveDcdtDocument)
 * @param {{ creationDate?: string|null, qrPngBytes?: Uint8Array|null }} [options]
 *   creationDate: dcdt_servicio.created_at (creación del registro documento)
 *   qrPngBytes: PNG del QR DeCA (URL de descarga directa)
 */
export async function buildDcdtPdfBlob(doc, options = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const referencia = plain(doc?.referencia || "servicio");
  const creationDate = parsePdfDate(options.creationDate) || new Date();
  const modificationDate = new Date();

  pdfDoc.setTitle(`${DECA_SHORT_LABEL} — ${referencia}`);
  pdfDoc.setAuthor("Cuaderno Ruta");
  pdfDoc.setCreator("Cuaderno Ruta");
  pdfDoc.setProducer("Cuaderno Ruta — DeCA");
  pdfDoc.setSubject(DECA_FULL_TITLE);
  pdfDoc.setCreationDate(creationDate);
  pdfDoc.setModificationDate(modificationDate);
  pdfDoc.setKeywords(["DeCA", "DCDT", "FOM/2861/2012", referencia]);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const qrBytes = options.qrPngBytes;
  const qrSize = 88;
  const headerQrReserve = qrBytes?.length ? qrSize + 28 : 0;

  if (qrBytes?.length) {
    const qrImage = await pdfDoc.embedPng(qrBytes);
    const qrX = PAGE_W - MARGIN - qrSize;
    const qrY = PAGE_H - MARGIN - qrSize;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText("DeCA - escanee para descargar", {
      x: qrX - 2,
      y: qrY - 12,
      size: 7,
      font,
      color: hexRgb("#64748b"),
    });
  }

  function ensure(h) {
    if (y - h < MARGIN + (page === pdfDoc.getPages()[0] ? 0 : 0)) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function drawLine(str, x, size, color, bold = false) {
    ensure(LINE_H + 2);
    const text = plain(str);
    if (!text) {
      y -= LINE_H;
      return;
    }
    const maxWidth = PAGE_W - MARGIN - x - (page === pdfDoc.getPages()[0] && headerQrReserve ? headerQrReserve + 12 : 0);
    page.drawText(text, {
      x,
      y: y - size,
      size,
      font: bold ? fontBold : font,
      color: hexRgb(color),
      maxWidth: maxWidth > 80 ? maxWidth : undefined,
    });
    y -= LINE_H;
  }

  function drawLines(str, x, size = 10, color = "#334155", maxChars = 82) {
    for (const ln of wrapText(str, maxChars)) {
      drawLine(ln, x, size, color);
    }
  }

  function drawSectionTitle(str) {
    drawLine(str, MARGIN, 12, "#0f172a", true);
  }

  drawLine(DECA_FULL_TITLE, MARGIN, 16, "#0f172a", true);
  drawLine(DECA_LEGAL_REF, MARGIN, 11, "#475569");
  y -= 6;
  drawLine(`Referencia servicio: ${doc.referencia || "—"}`, MARGIN, 10, "#64748b");
  y -= 10;

  drawSectionTitle("1. CARGADOR CONTRACTUAL");
  for (const ln of parteLines("", doc.cargador)) drawLines(ln, MARGIN);
  y -= 6;

  drawSectionTitle("2. TRANSPORTISTA EFECTIVO");
  for (const ln of parteLines("", doc.transportista)) drawLines(ln, MARGIN);
  y -= 6;

  if (doc.destinatario?.nombre) {
    drawLine("DESTINATARIO", MARGIN, 11, "#64748b", true);
    for (const ln of parteLines("", doc.destinatario)) drawLines(ln, MARGIN);
    y -= 4;
  }

  drawSectionTitle("3. ORIGEN Y DESTINO");
  drawLines(`Origen / carga: ${doc.origen || "—"}`, MARGIN);
  drawLines(`Destino / descarga: ${doc.destino || "—"}`, MARGIN);
  y -= 6;

  drawSectionTitle("4. MERCANCIA");
  drawLines(`Naturaleza: ${doc.mercancia?.descripcion || "—"}`, MARGIN);
  drawLines(`Peso (kg): ${doc.mercancia?.peso_kg ?? "—"}`, MARGIN);
  drawLines(`Bultos: ${doc.mercancia?.bultos ?? "—"}`, MARGIN);
  drawLines(`Palets: ${doc.mercancia?.palets ?? "—"}`, MARGIN);
  y -= 6;

  drawSectionTitle("5. FECHA Y VEHICULO");
  drawLines(`Fecha transporte: ${formatFecha(doc.fecha_transporte)}`, MARGIN);
  drawLines(`Matricula tractora: ${doc.vehiculo?.matricula || "—"}`, MARGIN);
  if (doc.vehiculo?.remolque) drawLines(`Matricula remolque: ${doc.vehiculo.remolque}`, MARGIN);
  y -= 6;

  if (doc.observaciones) {
    drawSectionTitle("OBSERVACIONES");
    drawLines(doc.observaciones, MARGIN);
    y -= 4;
  }

  const mods = Array.isArray(doc.modificaciones_ruta) ? doc.modificaciones_ruta : [];
  if (mods.length) {
    y -= 4;
    drawSectionTitle("MODIFICACIONES EN RUTA");
    for (const entry of mods) {
      const campo = plain(entry?.campo || entry?.campo_key || "Campo");
      drawLines(`${campo}: ${entry?.valor_anterior ?? "—"} → ${entry?.valor_nuevo ?? "—"}`, MARGIN, 10, "#334155", 78);
      if (entry?.motivo) drawLines(`Motivo: ${entry.motivo}`, MARGIN + 8, 9, "#64748b", 78);
      if (entry?.modificado_at) {
        drawLines(`Fecha: ${formatFechaHora(entry.modificado_at)}`, MARGIN + 8, 9, "#64748b");
      }
      y -= 4;
    }
  }

  if (doc.validado_at) {
    y -= 6;
    const validado = formatFechaHora(doc.validado_at);
    drawLines("Estado: Validado", MARGIN, 10, "#15803d");
    drawLines(`Validado por trafico: ${validado}`, MARGIN, 10, "#15803d");
    if (doc.transportista?.nombre) {
      drawLines(`Empresa transportista: ${doc.transportista.nombre}`, MARGIN, 10, "#15803d");
    }
  }

  const pdfBytes = await pdfDoc.save();
  if (pdfBytes.byteLength > DECA_PDF_MAX_BYTES) {
    const mb = (pdfBytes.byteLength / (1024 * 1024)).toFixed(2);
    throw new Error(`El PDF DeCA supera el limite de 5 MB (${mb} MB). Reduce el contenido del documento.`);
  }

  return new Blob([pdfBytes], { type: "application/pdf" });
}

/** Bloque DCDT para insertar en expediente operacional PDF. */
export function appendDcdtSectionToPdfCommands({ commands, yRef, margin, text, lines, section, kv, ensure }) {
  section(DECA_FULL_TITLE, DECA_LEGAL_REF);
  return yRef;
}
