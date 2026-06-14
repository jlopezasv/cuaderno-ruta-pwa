const enc = new TextEncoder();

function plain(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
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

/** PDF DCDT (Orden FOM/2861/2012). */
export async function buildDcdtPdfBlob(doc) {
  const margin = 48;
  const pageW = 595;
  const pageH = 842;
  const lineH = 14;
  const objects = [];
  const pageRefs = [];
  let y = pageH - margin;
  const commands = [];

  function ensure(h) {
    if (y - h < margin) {
      finishPage(false);
      y = pageH - margin;
    }
  }

  function text(str, x, size = 10, color = "#0f172a") {
    const [r, g, b] = [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
    commands.push(
      `BT /F1 ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x} ${y} Td (${pdfEscape(str)}) Tj ET`,
    );
    y -= lineH;
  }

  function lines(str, x, size = 10, color = "#334155", maxChars = 82) {
    for (const ln of wrapText(str, maxChars)) {
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
        `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentIdx} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      ),
    );
    objects.push(bytes(`<< /Length ${bytes(stream).length} >>\nstream\n${stream}\nendstream`));
    commands.length = 0;
    if (!last) y = pageH - margin;
  }

  objects.push(bytes("<< >>"));
  objects.push(
    bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
  );

  ensure(50);
  text("Documento de Control del Transporte", margin, 16, "#0f172a");
  text("DCDT - Orden FOM/2861/2012", margin, 11, "#475569");
  y -= 6;
  text(`Referencia servicio: ${doc.referencia || "—"}`, margin, 10, "#64748b");
  y -= 10;

  text("1. CARGADOR CONTRACTUAL", margin, 12, "#0f172a");
  for (const ln of parteLines("", doc.cargador)) lines(ln, margin);
  y -= 6;

  text("2. TRANSPORTISTA EFECTIVO", margin, 12, "#0f172a");
  for (const ln of parteLines("", doc.transportista)) lines(ln, margin);
  y -= 6;

  if (doc.destinatario?.nombre) {
    text("DESTINATARIO", margin, 11, "#64748b");
    for (const ln of parteLines("", doc.destinatario)) lines(ln, margin);
    y -= 4;
  }

  text("3. ORIGEN Y DESTINO", margin, 12, "#0f172a");
  lines(`Origen / carga: ${doc.origen || "—"}`, margin);
  lines(`Destino / descarga: ${doc.destino || "—"}`, margin);
  y -= 6;

  text("4. MERCANCIA", margin, 12, "#0f172a");
  lines(`Naturaleza: ${doc.mercancia?.descripcion || "—"}`, margin);
  lines(`Peso (kg): ${doc.mercancia?.peso_kg ?? "—"}`, margin);
  lines(`Bultos: ${doc.mercancia?.bultos ?? "—"}`, margin);
  lines(`Palets: ${doc.mercancia?.palets ?? "—"}`, margin);
  y -= 6;

  text("5. FECHA Y VEHICULO", margin, 12, "#0f172a");
  lines(`Fecha transporte: ${formatFecha(doc.fecha_transporte)}`, margin);
  lines(`Matricula tractora: ${doc.vehiculo?.matricula || "—"}`, margin);
  if (doc.vehiculo?.remolque) lines(`Matricula remolque: ${doc.vehiculo.remolque}`, margin);
  y -= 6;

  if (doc.observaciones) {
    text("OBSERVACIONES", margin, 12, "#0f172a");
    lines(doc.observaciones, margin);
    y -= 4;
  }

  if (doc.validado_at) {
    y -= 6;
    const validado = formatFechaHora(doc.validado_at);
    lines(`Estado: Validado`, margin, 10, "#15803d");
    lines(`Validado por trafico: ${validado}`, margin, 10, "#15803d");
    if (doc.transportista?.nombre) {
      lines(`Empresa transportista: ${doc.transportista.nombre}`, margin, 10, "#15803d");
    }
  }

  finishPage(true);
  objects[0] = bytes(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`);

  const parts = [bytes("%PDF-1.4\n")];
  const offsets = [0];
  let offset = parts[0].length;
  objects.forEach((obj, idx) => {
    offsets.push(offset);
    const prefix = bytes(`${idx + 1} 0 obj\n`);
    const suffix = bytes("\nendobj\n");
    parts.push(prefix, obj, suffix);
    offset += prefix.length + obj.length + suffix.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((off) => {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(bytes(xref));
  return new Blob([concatParts(parts)], { type: "application/pdf" });
}

/** Bloque DCDT para insertar en expediente operacional PDF. */
export function appendDcdtSectionToPdfCommands({ commands, yRef, margin, text, lines, section, kv, ensure }) {
  section("Documento de Control del Transporte", "DCDT — Orden FOM/2861/2012");
  return yRef;
}
