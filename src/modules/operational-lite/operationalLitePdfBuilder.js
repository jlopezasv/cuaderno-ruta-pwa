import { DECA_FULL_TITLE, DECA_LEGAL_REF } from "../../domain/dcdt/decaBranding.js";
import { loadRemoteImageBlob } from "../../domain/documents/imageBlobLoad.js";
import { groupAnnexByParada } from "./collectLiteAnnexItems.js";

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

function wrapText(text, maxChars = 86) {
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

function blobToJpeg(blob, { maxSide = 900, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => {
          if (!b) {
            reject(new Error("JPEG conversion failed"));
            return;
          }
          b.arrayBuffer().then((buf) => resolve({ bytes: new Uint8Array(buf), width: w, height: h }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

function imageObject(bytesData, width, height) {
  return concatParts([
    bytes(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytesData.length} >>\nstream\n`,
    ),
    bytesData,
    bytes("\nendstream"),
  ]);
}

async function fetchImageMap(annexItems, cierre, firmasEntregaDescarga = []) {
  const map = new Map();
  const many = annexItems.length > 12;
  const tasks = annexItems.map(async (item) => {
    try {
      const blob = await loadRemoteImageBlob(item.url);
      const maxSide =
        item.categoria === "cmr" ? (many ? 1100 : 1400) : item.categoria === "pod" ? 1200 : many ? 720 : 1000;
      const quality = item.categoria === "cmr" ? 0.84 : many ? 0.62 : 0.78;
      const img = await blobToJpeg(blob, { maxSide, quality });
      map.set(item.id, img);
    } catch {
      map.set(item.id, { error: true });
    }
  });
  await Promise.all(tasks);

  let firma = null;
  if (cierre?.firmaUrl) {
    try {
      const blob = await loadRemoteImageBlob(cierre.firmaUrl);
      firma = await blobToJpeg(blob, { maxSide: 480, quality: 0.9 });
    } catch {
      firma = null;
    }
  }

  const firmasEntrega = new Map();
  for (const f of firmasEntregaDescarga) {
    if (!f?.stop_id || !f?.firma_url) continue;
    try {
      const blob = await loadRemoteImageBlob(f.firma_url);
      firmasEntrega.set(f.stop_id, await blobToJpeg(blob, { maxSide: 480, quality: 0.9 }));
    } catch {
      firmasEntrega.set(f.stop_id, null);
    }
  }
  return { map, firma, firmasEntrega };
}

const CAT_LABEL = {
  cmr: "CMR",
  foto: "Foto",
  pod: "POD / entrega",
  incidencia: "Incidencia",
  documento: "Documento",
};

export async function buildOperationalLitePdfBlob(doc) {
  const annexItems = doc.evidenciasAnnexo || [];
  const annexGroups = groupAnnexByParada(annexItems);
  const { map: imageMap, firma: firmaImg, firmasEntrega: firmasEntregaImg } = await fetchImageMap(
    annexItems,
    doc.cierre,
    doc.firmasEntregaDescarga,
  );

  const objects = [];
  const add = (data) => {
    objects.push(bytes(data));
    return objects.length;
  };
  const addRaw = (data) => {
    objects.push(data);
    return objects.length;
  };

  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const imageRefs = new Map();
  let imageIndex = 1;
  for (const [id, img] of imageMap.entries()) {
    if (!img?.bytes || img.error) continue;
    const name = `Im${imageIndex++}`;
    const objectId = addRaw(imageObject(img.bytes, img.width, img.height));
    imageRefs.set(id, { ...img, name, objectId });
  }
  let firmaRef = null;
  if (firmaImg?.bytes) {
    const name = `Im${imageIndex++}`;
    const objectId = addRaw(imageObject(firmaImg.bytes, firmaImg.width, firmaImg.height));
    firmaRef = { ...firmaImg, name, objectId };
  }
  const entregaFirmaRefs = new Map();
  for (const [stopId, img] of firmasEntregaImg.entries()) {
    if (!img?.bytes) continue;
    const name = `Im${imageIndex++}`;
    const objectId = addRaw(imageObject(img.bytes, img.width, img.height));
    entregaFirmaRefs.set(stopId, { ...img, name, objectId });
  }

  const allXObjects = [...imageRefs.values(), ...entregaFirmaRefs.values(), ...(firmaRef ? [firmaRef] : [])];
  const xObjectsStr = allXObjects.map((img) => `/${img.name} ${img.objectId} 0 R`).join(" ");

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const pageRefs = [];
  let commands = [];
  let y = 800;
  let pageNum = 0;

  const finishPage = (footerNote = "") => {
    pageNum += 1;
    if (footerNote) {
      text(`Cuaderno · Expediente operacional · pag. ${pageNum}`, margin, 28, 8, "#94a3b8");
    }
    const content = commands.join("\n");
    const pageId = objects.length + 1;
    const contentId = objects.length + 2;
    pageRefs.push(`${pageId} 0 R`);
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> ${xObjectsStr ? `/XObject << ${xObjectsStr} >>` : ""} >> /Contents ${contentId} 0 R >>`,
    );
    add(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
    commands = [];
    y = 800;
  };

  const ensure = (height) => {
    if (y - height < 48) finishPage(true);
  };

  const color = (hex) => {
    const clean = String(hex).replace("#", "");
    const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
    return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255}`;
  };

  const rect = (x, topY, w, h, fill) => commands.push(`${color(fill)} rg ${x} ${topY - h} ${w} ${h} re f`);
  const text = (value, x, topY, size = 10, fill = "#0f172a") => {
    commands.push(`BT /F1 ${size} Tf ${color(fill)} rg ${x} ${topY} Td (${pdfEscape(value)}) Tj ET`);
  };
  const lines = (value, x, size = 10, fill = "#334155", maxChars = 88, lineHeight = size + 4) => {
    for (const line of wrapText(value, maxChars)) {
      text(line, x, y, size, fill);
      y -= lineHeight;
    }
  };
  const section = (title, subtitle = "") => {
    ensure(44);
    y -= 8;
    rect(margin, y + 6, 4, 22, "#0369a1");
    text(title, margin + 12, y, 14, "#0f172a");
    y -= 18;
    if (subtitle) {
      text(subtitle, margin + 12, y, 9, "#64748b");
      y -= 14;
    }
    y -= 6;
  };
  const metricBox = (label, value, x, w) => {
    rect(x, y, w, 40, "#f8fafc");
    rect(x, y - 40, w, 1, "#e2e8f0");
    text(label, x + 8, y - 14, 8, "#64748b");
    text(String(value ?? "—"), x + 8, y - 30, 12, "#0f172a");
  };
  const drawImage = (imgRef, x, maxW, maxH) => {
    const drawW = Math.min(maxW, imgRef.width);
    let drawH = drawW * (imgRef.height / imgRef.width);
    let finalW = drawW;
    if (drawH > maxH) {
      drawH = maxH;
      finalW = drawH * (imgRef.width / imgRef.height);
    }
    ensure(drawH + 36);
    commands.push(`q ${finalW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x} ${(y - drawH).toFixed(2)} cm /${imgRef.name} Do Q`);
    y -= drawH + 8;
  };
  const kv = (label, value) => {
    ensure(18);
    text(`${label}: ${value || "—"}`, margin, y, 10, "#334155");
    y -= 14;
  };

  // —— DCDT (primera sección si validado) ——
  if (doc.dcdt) {
    section(DECA_FULL_TITLE, DECA_LEGAL_REF);
    const d = doc.dcdt;
    kv("Cargador contractual", d.cargador?.nombre);
    if (d.cargador?.nif) kv("NIF cargador", d.cargador.nif);
    if (d.cargador?.domicilio) kv("Domicilio cargador", d.cargador.domicilio);
    kv("Transportista efectivo", d.transportista?.nombre);
    if (d.transportista?.nif) kv("NIF transportista", d.transportista.nif);
    if (d.transportista?.domicilio) kv("Domicilio transportista", d.transportista.domicilio);
    kv("Origen / carga", d.origen);
    kv("Destino / descarga", d.destino);
    kv("Mercancia", d.mercancia?.descripcion);
    kv("Peso (kg)", d.mercancia?.peso_kg != null ? String(d.mercancia.peso_kg) : "");
    if (d.mercancia?.bultos != null) kv("Bultos", String(d.mercancia.bultos));
    kv("Fecha transporte", d.fecha_transporte ? new Date(d.fecha_transporte).toLocaleDateString("es-ES") : "");
    kv("Matricula", d.vehiculo?.matricula);
    if (d.observaciones) {
      lines("Observaciones:", margin, 9, "#64748b", 90, 12);
      lines(d.observaciones, margin, 10, "#334155", 88, 14);
    }
    y -= 12;
  }

  // —— Portada operacional ——
  rect(0, pageHeight, pageWidth, 88, "#0c4a6e");
  text("EXPEDIENTE OPERACIONAL", margin, 808, 20, "#ffffff");
  text("Trazabilidad logistica · evidencias · entrega", margin, 786, 10, "#bae6fd");
  text(doc.header.referencia || "Servicio", margin, 762, 13, "#e0f2fe");
  y = 718;

  metricBox("Ruta", doc.header.ruta, margin, contentWidth);
  y -= 48;
  const colW = (contentWidth - 12) / 3;
  metricBox("Fecha", doc.header.fechaOperacion || "—", margin, colW);
  metricBox("Estado", doc.header.estado, margin + colW + 6, colW);
  metricBox("Conductor", doc.header.conductor, margin + (colW + 6) * 2, colW);
  y -= 52;

  if (doc.header.cliente) {
    lines(`Cliente: ${doc.header.cliente}`, margin, 10, "#334155", 90, 13);
    y -= 4;
  }
  if (doc.header.vehiculo) {
    lines(`Vehiculo: ${doc.header.vehiculo}`, margin, 10, "#334155", 90, 13);
    y -= 8;
  }

  section("Resumen ejecutivo", "Operacion global del servicio (sin datos tacdivos)");
  const r = doc.resumen || {};
  const mW = (contentWidth - 18) / 4;
  metricBox("Cargas", r.cargas ?? 0, margin, mW);
  metricBox("Descargas", r.descargas ?? 0, margin + mW + 6, mW);
  metricBox("Incidencias", r.incidencias ?? 0, margin + (mW + 6) * 2, mW);
  metricBox("Fotos", r.fotos ?? 0, margin + (mW + 6) * 3, mW);
  y -= 52;
  metricBox("CMR", r.cmr ?? 0, margin, mW);
  metricBox("POD", r.pod ?? 0, margin + mW + 6, mW);
  metricBox("Extras", r.extras ?? 0, margin + (mW + 6) * 2, mW);
  metricBox("Adjuntos", r.documentosAdjuntos ?? 0, margin + (mW + 6) * 3, mW);
  y -= 56;

  section("Timeline operacional");
  for (const parada of doc.paradas || []) {
    ensure(58);
    const accent = parada.tipo === "descarga" ? "#0284c7" : "#0d9488";
    rect(margin, y + 2, contentWidth, 36, "#f8fafc");
    rect(margin, y + 2, 3, 36, accent);
    text(`${parada.tipoLabel} · ${parada.ubicacion}`, margin + 10, y - 12, 11, "#0f172a");
    const entrada = parada.entradaMuelleHora || parada.llegadaHora || "—";
    const salida = parada.salidaMuelleHora || parada.salidaHora || "—";
    const muelleTime = parada.tiempoEnMuelleLabel ? ` · Muelle ${parada.tiempoEnMuelleLabel}` : "";
    text(
      `Entrada ${entrada}  ·  Salida ${salida}${muelleTime}  ·  ${parada.estadoLabel || ""}  ·  ${parada.docCount || 0} docs`,
      margin + 10,
      y - 26,
      9,
      "#64748b",
    );
    y -= 44;
    if (parada.muelle) {
      lines(`Muelle: ${parada.muelle}`, margin + 10, 9, "#475569", 84, 12);
    }
    if (parada.observaciones) {
      lines(parada.observaciones, margin + 10, 9, "#475569", 84, 12);
    }
    if (parada.incidencias?.length) {
      for (const inc of parada.incidencias) {
        lines(`Incidencia: ${inc.titulo}`, margin + 10, 9, "#b45309", 84, 12);
      }
    }
    y -= 4;
  }

  finishPage(true);

  // —— Anexo evidencias visuales ——
  if (annexGroups.length) {
    section("Evidencias documentales", "Fotos, CMR, POD e incidencias por parada");
    y -= 4;

    for (const group of annexGroups) {
      ensure(52);
      rect(margin, y + 4, contentWidth, 28, "#eff6ff");
      text(group.label || "Parada", margin + 10, y - 12, 12, "#0c4a6e");
      if (group.ubicacion && group.ubicacion !== group.label) {
        text(String(group.ubicacion).slice(0, 70), margin + 10, y - 24, 9, "#64748b");
      }
      y -= 38;

      for (const item of group.items) {
        const imgRef = imageRefs.get(item.id);
        const cat = CAT_LABEL[item.categoria] || item.categoria;
        const caption = `${cat} · ${item.hora} · ${item.titulo}`;
        const sub = item.detalle ? item.detalle.slice(0, 120) : "";

        if (imgRef) {
          const imgW = contentWidth;
          const imgH = item.categoria === "cmr" ? 320 : 260;
          ensure(imgH + 50);
          drawImage(imgRef, margin, imgW, imgH);
          lines(caption, margin, 9, "#0f172a", 90, 12);
          if (sub) lines(sub, margin, 8, "#64748b", 90, 11);
          y -= 10;
        } else {
          ensure(36);
          rect(margin, y, contentWidth, 30, "#fef3c7");
          lines(`${caption} (imagen no disponible)`, margin + 8, 9, "#92400e", 84, 12);
          y -= 38;
        }
      }
      y -= 8;
    }
    finishPage(true);
  }

  // —— Cierre premium ——
  ensure(200);
  section("Cierre operacional");
  if (doc.resumen?.operacionCompletada) {
    ensure(36);
    rect(margin, y, 120, 28, "#dcfce7");
    rect(margin + 122, y, contentWidth - 122, 28, "#f0fdf4");
    text("COMPLETADO", margin + 14, y - 18, 14, "#15803d");
    text("Operacion documentada y cerrada", margin + 132, y - 18, 10, "#166534");
    y -= 40;
  }

  if (doc.firmasEntregaDescarga?.length) {
    section("Firmas de entrega por descarga");
    for (const firma of doc.firmasEntregaDescarga) {
      kv("Parada", `${firma.stop_label || "Descarga"} · ${firma.stop_nombre || "—"}`);
      kv("Conductor", firma.conductor_nombre || "—");
      kv("Fecha firma", firma.signed_at_label || "—");
      if (firma.comentario) {
        lines("Observaciones:", margin, 9, "#64748b", 90, 12);
        lines(firma.comentario, margin, 10, "#334155", 88, 14);
      }
      const ref = entregaFirmaRefs.get(firma.stop_id);
      if (ref) {
        ensure(100);
        text("Firma del conductor", margin, y, 10, "#64748b");
        y -= 14;
        const drawW = 200;
        let drawH = drawW * (ref.height / ref.width);
        if (drawH > 80) drawH = 80;
        commands.push(
          `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${margin} ${(y - drawH).toFixed(2)} cm /${ref.name} Do Q`,
        );
        y -= drawH + 16;
      } else if (firma.firma_url) {
        lines("Firma no disponible (URL caducada o sin acceso)", margin, 10, "#b45309", 88, 14);
      }
      y -= 6;
    }
  }

  if (doc.cierre) {
    kv("Finalizacion", doc.cierre.closedAtLabel);
    kv("Conductor", doc.cierre.conductorNombre);
    if (doc.cierre.comentario) {
      lines("Observaciones finales:", margin, 9, "#64748b", 90, 12);
      lines(doc.cierre.comentario, margin, 10, "#334155", 88, 14);
    }
    if (firmaRef) {
      ensure(100);
      text("Firma del conductor", margin, y, 10, "#64748b");
      y -= 14;
      const drawW = 200;
      let drawH = drawW * (firmaRef.height / firmaRef.width);
      if (drawH > 80) drawH = 80;
      commands.push(
        `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${margin} ${(y - drawH).toFixed(2)} cm /${firmaRef.name} Do Q`,
      );
      y -= drawH + 16;
    }
  } else {
    lines("Servicio sin cierre documental registrado.", margin, 10, "#64748b", 88, 14);
  }

  finishPage(true);

  objects[1] = bytes(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`);

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
