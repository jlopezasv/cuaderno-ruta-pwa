import { getOperationalPlanSnapshot } from "./serviceOperacionMeta.js";
import { OPERATIONAL_GROUP_LABEL, operationalGroupFromStopTipo, sortStopsByOrden } from "./tripOperationalDossier.js";
import { getFixedServiceRoute, getServiceClient, getServiceClientReference, getServiceNumber } from "./serviceIdentity.js";
import { formatOperationalEtaLabel, isRelativeEtaLabel } from "./etaFormatter.js";

const enc = new TextEncoder();

function parseTs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function fmtClock(ms) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(ms) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fileSafe(value, fallback = "servicio") {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function plain(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .trim();
}

function evidenceTitle(ev) {
  if (ev?.tipo === "cmr") return ev?.datos?.num_cmr ? `CMR ${ev.datos.num_cmr}` : "CMR escaneado";
  if (ev?.tipo === "incidencia") return "Incidencia";
  if (ev?.tipo === "foto") return "Foto adjunta";
  if (ev?.tipo === "nota") return "Observación";
  return String(ev?.tipo || "Documento").toUpperCase();
}

function evidenceDetail(ev) {
  if (ev?.tipo === "incidencia") return ev?.datos?.texto || ev?.nota || "";
  if (ev?.tipo === "cmr") {
    const d = ev.datos || {};
    return [d.remitente && `Remitente: ${d.remitente}`, d.destinatario && `Destinatario: ${d.destinatario}`, d.mercancia && `Mercancía: ${d.mercancia}`].filter(Boolean).join(" · ");
  }
  return ev?.nota || "";
}

function stopLabel(stop, counters) {
  const group = operationalGroupFromStopTipo(stop?.tipo);
  counters[group] = (counters[group] || 0) + 1;
  if (group === "carga") return `Carga ${counters[group]}`;
  if (group === "descarga") return `Descarga ${counters[group]}`;
  if (group === "carga_descarga") return `Carga/descarga ${counters[group]}`;
  return `Parada ${stop?.orden || counters[group] || ""}`.trim();
}

function bucketForEvidence(ev) {
  if (ev?.tipo === "cmr") return "cmr";
  if (ev?.tipo === "incidencia") return "incidencias";
  if (ev?.tipo === "foto") return "fotos";
  return "documentos";
}

function extFromUrl(url, fallback = "jpg") {
  const clean = String(url || "").split("?")[0];
  const ext = clean.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1];
  return ext ? ext.toLowerCase() : fallback;
}

function simpleHash(value) {
  const data = enc.encode(JSON.stringify(value));
  let h = 2166136261;
  for (const b of data) {
    h ^= b;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function importantEntry(type) {
  const t = String(type || "").toLowerCase();
  return /(pausa|descanso|disponibilidad|otros|carga|descarga|inspeccion|repostaje|ferry|incidencia|art12|jornada)/.test(t);
}

function entryTitle(type) {
  const t = String(type || "").replace(/^inicio_/, "Inicio ").replace(/^fin_/, "Fin ").replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Evento conductor";
}

function eventRecord({ ts, type, title, detail = "", servicio, stopId = null, userId = null, location = "", origin, metadata = {} }) {
  const base = {
    timestamp_utc: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    type,
    title,
    detail,
    servicio_id: servicio?.id || null,
    stop_id: stopId,
    user_id: userId || servicio?.conductor_id || null,
    location_label: location || "",
    origin,
    metadata,
  };
  return { ...base, hash: simpleHash(base) };
}

function serviceWindow(servicio, stopRows, evidencias) {
  const candidates = [
    parseTs(servicio?.fecha_inicio),
    ...stopRows.flatMap((st) => [parseTs(st.entrada), parseTs(st.salida)]),
    ...evidencias.map((ev) => parseTs(ev.created_at)),
  ].filter((v) => v != null);
  if (!candidates.length) return { start: null, end: null };
  return {
    start: Math.min(...candidates),
    end: servicio?.estado === "completado" ? Math.max(...candidates) : Date.now(),
  };
}

export function buildServiceExpediente({ servicio, stops, evidenciasByStop, metrics, nombreConductor, etaLabel, fmtDur, entries = [] }) {
  const sortedStops = sortStopsByOrden(stops);
  const plan = getOperationalPlanSnapshot(servicio);
  const ref = getServiceNumber(servicio);
  const counters = {};
  const stopRows = sortedStops.map((stop) => {
    const label = stopLabel(stop, counters);
    const evs = [...(evidenciasByStop?.[stop.id] || [])].sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at));
    const group = operationalGroupFromStopTipo(stop.tipo);
    const llegadaMs = parseTs(stop.hora_llegada_real);
    const salidaMs = parseTs(stop.hora_salida_real);
    const esperaMin = llegadaMs != null && salidaMs != null && salidaMs >= llegadaMs ? Math.round((salidaMs - llegadaMs) / 60000) : null;
    return {
      id: stop.id,
      orden: stop.orden,
      label,
      tipo: group,
      tipoLabel: OPERATIONAL_GROUP_LABEL[group] || stop.tipo || "PARADA",
      nombre: stop.nombre || label,
      direccion: stop.direccion || "",
      notas: stop.notas || "",
      entrada: stop.hora_llegada_real || null,
      salida: stop.hora_salida_real || null,
      entradaHora: fmtClock(llegadaMs),
      salidaHora: fmtClock(salidaMs),
      esperaMin,
      esperaLabel: esperaMin != null ? fmtDur(esperaMin) : "—",
      evidencias: evs.map((ev) => ({
        id: ev.id,
        tipo: ev.tipo,
        titulo: evidenceTitle(ev),
        detalle: evidenceDetail(ev),
        created_at: ev.created_at,
        hora: fmtClock(parseTs(ev.created_at)),
        url: ev.url || null,
        nota: ev.nota || null,
        datos: ev.datos || null,
        bucket: bucketForEvidence(ev),
      })),
    };
  });

  const timeline = [];
  if (servicio?.fecha_inicio) {
    timeline.push({ ts: servicio.fecha_inicio, time: fmtClock(parseTs(servicio.fecha_inicio)), type: "servicio", title: "Servicio iniciado", detail: `${servicio.origen || "—"} → ${servicio.destino || "—"}` });
  }
  for (const stop of stopRows) {
    if (stop.entrada) timeline.push({ ts: stop.entrada, time: stop.entradaHora, type: "entrada_muelle", title: `Entrada muelle — ${stop.nombre}`, detail: stop.label, stopId: stop.id });
    for (const ev of stop.evidencias) {
      timeline.push({ ts: ev.created_at, time: ev.hora, type: ev.tipo, title: ev.titulo, detail: ev.detalle, stopId: stop.id, evidenceId: ev.id });
    }
    if (stop.salida) timeline.push({ ts: stop.salida, time: stop.salidaHora, type: "salida_muelle", title: `${stop.label} finalizada`, detail: `${stop.nombre} · Espera ${stop.esperaLabel}`, stopId: stop.id });
  }
  timeline.sort((a, b) => parseTs(a.ts) - parseTs(b.ts));

  const evidencias = stopRows.flatMap((stop) => stop.evidencias.map((ev) => ({ ...ev, stopId: stop.id, stopLabel: stop.label, stopName: stop.nombre })));
  const incidencias = evidencias.filter((ev) => ev.tipo === "incidencia");
  const cmr = evidencias.filter((ev) => ev.tipo === "cmr");
  const fotos = evidencias.filter((ev) => ev.tipo === "foto");
  const window = serviceWindow(servicio, stopRows, evidencias);
  const integrityRecords = [];

  if (servicio?.fecha_inicio) {
    integrityRecords.push(eventRecord({
      ts: servicio.fecha_inicio,
      type: "servicio_iniciado",
      title: "Servicio iniciado",
      detail: `${servicio.origen || "—"} → ${servicio.destino || "—"}`,
      servicio,
      origin: "servicio",
      location: servicio.origen || "",
      metadata: { estado: servicio.estado || null },
    }));
  }

  for (const stop of stopRows) {
    if (stop.entrada) {
      integrityRecords.push(eventRecord({
        ts: stop.entrada,
        type: "entrada_muelle",
        title: `Entrada muelle — ${stop.nombre}`,
        detail: stop.label,
        servicio,
        stopId: stop.id,
        origin: "stop",
        location: stop.nombre || stop.direccion || "",
        metadata: { tipo: stop.tipo, orden: stop.orden },
      }));
    }
    for (const ev of stop.evidencias) {
      integrityRecords.push(eventRecord({
        ts: ev.created_at,
        type: ev.tipo,
        title: ev.titulo,
        detail: ev.detalle,
        servicio,
        stopId: stop.id,
        origin: "evidencia",
        location: stop.nombre || stop.direccion || "",
        metadata: { evidencia_id: ev.id, has_attachment: !!ev.url, has_ocr: ev.tipo === "cmr" && !!ev.datos },
      }));
    }
    if (stop.salida) {
      integrityRecords.push(eventRecord({
        ts: stop.salida,
        type: stop.tipo === "descarga" ? "descarga_finalizada" : "carga_finalizada",
        title: `${stop.label} finalizada`,
        detail: `${stop.nombre} · Espera ${stop.esperaLabel}`,
        servicio,
        stopId: stop.id,
        origin: "stop",
        location: stop.nombre || stop.direccion || "",
        metadata: { espera_min: stop.esperaMin },
      }));
    }
  }

  for (const entry of entries || []) {
    const ms = parseTs(entry.ts);
    if (ms == null || !importantEntry(entry.type)) continue;
    if (window.start != null && ms < window.start) continue;
    if (window.end != null && ms > window.end) continue;
    integrityRecords.push(eventRecord({
      ts: entry.ts,
      type: `tacografo_${entry.type}`,
      title: entryTitle(entry.type),
      detail: entry.note || "",
      servicio,
      origin: "tacografo",
      location: entry.location || "",
      metadata: { entry_id: entry.id, manual: !!entry.manual, late: !!entry.late },
    }));
  }

  integrityRecords.sort((a, b) => parseTs(a.timestamp_utc) - parseTs(b.timestamp_utc));
  const chronologyConsistent = integrityRecords.every((row, idx, arr) => idx === 0 || parseTs(row.timestamp_utc) >= parseTs(arr[idx - 1].timestamp_utc));
  const geoAvailable = integrityRecords.some((row) => !!row.location_label);
  const integrity = {
    status: "validated",
    label: "Cronología operacional verificada",
    eventCount: integrityRecords.length,
    chronologyConsistent,
    timestampsVerified: integrityRecords.every((row) => Number.isFinite(parseTs(row.timestamp_utc))),
    geoAvailable,
    records: integrityRecords,
  };

  const timelineFromIntegrity = integrityRecords.map((row) => ({
    ts: row.timestamp_utc,
    time: fmtClock(parseTs(row.timestamp_utc)),
    type: row.type,
    title: row.title,
    detail: row.detail,
    stopId: row.stop_id,
    evidenceId: row.metadata?.evidencia_id || null,
    integrityHash: row.hash,
    origin: row.origin,
  }));

  const fechaDocumento = servicio?.fecha_inicio || servicio?.created_at || new Date().toISOString();
  const fechaArchivo = new Date(fechaDocumento).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const cliente = getServiceClient(servicio);
  const referenciaCliente = getServiceClientReference(servicio);

  return {
    id: servicio?.id,
    ref,
    filenameBase: fileSafe(`SRV_${servicio?.destino || ref}_${fechaArchivo}`, servicio?.id || "SERV"),
    generatedAt: new Date().toISOString(),
    header: {
      referencia: ref,
      ruta: getFixedServiceRoute(servicio, "—", "—"),
      estado: servicio?.estado || "—",
      conductor: nombreConductor?.(servicio?.conductor_id) || "—",
      cliente: cliente || "—",
      referenciaCliente: referenciaCliente || "—",
      eta: formatOperationalEtaLabel(plan?.planned_eta) || (isRelativeEtaLabel(etaLabel) ? null : etaLabel) || (isRelativeEtaLabel(plan?.planned_eta_label) ? null : plan?.planned_eta_label) || "—",
      km: Number.isFinite(Number(plan?.planned_km)) ? Math.round(Number(plan.planned_km)) : null,
      fechaInicio: servicio?.fecha_inicio || null,
      fecha: fechaDocumento,
    },
    metrics: {
      tiempoTotalViaje: metrics?.tiempoTotalViajeMin != null ? fmtDur(metrics.tiempoTotalViajeMin) : "—",
      conduccion: fmtDur(metrics?.tiempoConduccionMin || 0),
      plantaCarga: fmtDur(metrics?.tiempoEnPlantaCargaMin || 0),
      plantaDescarga: fmtDur(metrics?.tiempoEnPlantaDescargaMin || 0),
      esperaCarga: fmtDur(metrics?.esperaMuelleCargaMin || 0),
      esperaDescarga: fmtDur(metrics?.esperaMuelleDescargaMin || 0),
      incidencias: incidencias.length,
      cmr: cmr.length,
      fotos: fotos.length,
    },
    stops: stopRows,
    timeline: timelineFromIntegrity.length ? timelineFromIntegrity : timeline,
    integrity,
    evidencias,
    incidencias,
    cmr,
    fotos,
  };
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

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

async function blobToJpeg(blob, { maxSide = 900, quality = 0.7 } = {}) {
  const img = await blobToImage(blob);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const jpg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!jpg) throw new Error("No se pudo comprimir la imagen");
  return { bytes: new Uint8Array(await jpg.arrayBuffer()), width, height, outputBytes: jpg.size, inputBytes: blob.size };
}

async function fetchEvidenceImages(expediente) {
  const imageEvs = expediente.evidencias.filter((ev) => ev.url).slice(0, 24);
  const many = imageEvs.length > 10;
  const images = new Map();
  for (const ev of imageEvs) {
    try {
      const res = await fetch(ev.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const maxSide = ev.tipo === "cmr" ? (many ? 900 : 1200) : (many ? 620 : 900);
      const quality = many ? 0.58 : ev.tipo === "cmr" ? 0.72 : 0.68;
      images.set(ev.id, await blobToJpeg(blob, { maxSide, quality }));
    } catch (error) {
      images.set(ev.id, { error: error?.message || "Imagen no disponible" });
    }
  }
  return images;
}

function imageObject(bytesData, width, height) {
  return concat([
    bytes(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytesData.length} >>\nstream\n`),
    bytesData,
    bytes("\nendstream"),
  ]);
}

async function makePdfBlob(expediente) {
  const imageMap = await fetchEvidenceImages(expediente);
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
  for (const [evId, img] of imageMap.entries()) {
    if (!img?.bytes) continue;
    const name = `Im${imageIndex++}`;
    const objectId = addRaw(imageObject(img.bytes, img.width, img.height));
    imageRefs.set(evId, { ...img, name, objectId });
  }

  const pageRefs = [];
  let commands = [];
  let y = 800;
  const margin = 42;
  const pageWidth = 595;
  const pageHeight = 842;
  const contentWidth = pageWidth - margin * 2;
  const evById = new Map(expediente.evidencias.map((ev) => [ev.id, ev]));
  const xObjects = [...imageRefs.values()].map((img) => `/${img.name} ${img.objectId} 0 R`).join(" ");

  const finishPage = () => {
    const content = commands.join("\n");
    const pageId = objects.length + 1;
    const contentId = objects.length + 2;
    pageRefs.push(`${pageId} 0 R`);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> ${xObjects ? `/XObject << ${xObjects} >>` : ""} >> /Contents ${contentId} 0 R >>`);
    add(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
    commands = [];
    y = 800;
  };
  const ensure = (height) => {
    if (y - height < 42) finishPage();
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
  const lines = (value, x, size = 10, fill = "#334155", maxChars = 90, lineHeight = size + 4) => {
    for (const line of wrapText(value, maxChars)) {
      text(line, x, y, size, fill);
      y -= lineHeight;
    }
  };
  const section = (title) => {
    ensure(38);
    y -= 10;
    text(title, margin, y, 13, "#0f172a");
    y -= 10;
    rect(margin, y, contentWidth, 1.2, "#cbd5e1");
    y -= 16;
  };
  const metric = (label, value, x, w) => {
    rect(x, y, w, 42, "#f8fafc");
    text(label, x + 8, y - 14, 8, "#64748b");
    text(value || "—", x + 8, y - 30, 11, "#0f172a");
  };
  const drawImage = (img, x, maxW, maxH) => {
    const drawW = Math.min(maxW, img.width);
    let drawH = drawW * (img.height / img.width);
    let finalW = drawW;
    if (drawH > maxH) {
      drawH = maxH;
      finalW = drawH * (img.width / img.height);
    }
    ensure(drawH + 18);
    commands.push(`q ${finalW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x} ${(y - drawH).toFixed(2)} cm /${img.name} Do Q`);
    y -= drawH + 12;
  };

  rect(0, pageHeight, pageWidth, 76, "#0f172a");
  text("EXPEDIENTE OPERACIONAL", margin, 792, 18, "#ffffff");
  text("Documento corporativo unico con evidencias visuales incrustadas", margin, 770, 10, "#cbd5e1");
  y = 728;

  metric("Servicio", expediente.header.referencia, margin, 120);
  metric("Cliente", expediente.header.cliente, margin + 130, 135);
  metric("Ruta", expediente.header.ruta, margin + 275, 190);
  y -= 54;
  metric("Conductor", expediente.header.conductor, margin, 120);
  metric("ETA", expediente.header.eta, margin + 130, 95);
  metric("Km", expediente.header.km != null ? `${expediente.header.km}` : "—", margin + 235, 70);
  metric("Estado", expediente.header.estado, margin + 315, 150);
  y -= 54;

  section("Timeline operacional");
  for (const ev of expediente.timeline) {
    const evidence = ev.evidenceId ? evById.get(ev.evidenceId) : null;
    const img = evidence?.id ? imageRefs.get(evidence.id) : null;
    const failedImage = evidence?.id ? imageMap.get(evidence.id)?.error : null;
    ensure(img ? 205 : 52);
    rect(margin, y + 5, contentWidth, img ? 38 : 34, evidence?.tipo === "incidencia" ? "#fff7ed" : evidence?.tipo === "cmr" ? "#eff6ff" : "#f8fafc");
    text(ev.time || "—", margin + 9, y - 13, 9, "#64748b");
    text(ev.title || "Evento", margin + 60, y - 13, 11, "#0f172a");
    y -= 30;
    if (ev.detail) lines(ev.detail, margin + 60, 9, "#475569", 80, 12);
    if (evidence?.tipo === "cmr" && evidence.datos) {
      const d = evidence.datos;
      const ocr = [
        d.num_cmr && `CMR: ${d.num_cmr}`,
        d.remitente && `Remitente: ${d.remitente}`,
        d.destinatario && `Destinatario: ${d.destinatario}`,
        d.mercancia && `Mercancia: ${d.mercancia}`,
        d.peso_kg && `Peso: ${d.peso_kg} kg`,
        d.observaciones && `Obs: ${d.observaciones}`,
      ].filter(Boolean).join(" · ");
      if (ocr) lines(`OCR contextual: ${ocr}`, margin + 60, 8.5, "#1d4ed8", 88, 12);
    }
    if (img) {
      drawImage(img, margin + 60, 250, evidence?.tipo === "cmr" ? 230 : 170);
    } else if (failedImage) {
      lines(`Imagen no incrustada: ${failedImage}`, margin + 60, 8.5, "#b45309", 78, 11);
    }
    y -= 6;
  }

  section("Resumen operacional");
  const resumen = [
    ["Km reales / plan", expediente.header.km != null ? `${expediente.header.km} km` : "—"],
    ["Conduccion", expediente.metrics.conduccion],
    ["Pausas y descansos", "Incluidos en timeline"],
    ["Espera carga", expediente.metrics.esperaCarga],
    ["Espera descarga", expediente.metrics.esperaDescarga],
    ["ETA prevista vs real", expediente.header.eta],
    ["CMR", String(expediente.metrics.cmr)],
    ["Incidencias", String(expediente.metrics.incidencias)],
  ];
  for (let i = 0; i < resumen.length; i += 2) {
    ensure(48);
    metric(resumen[i][0], resumen[i][1], margin, 220);
    if (resumen[i + 1]) metric(resumen[i + 1][0], resumen[i + 1][1], margin + 240, 220);
    y -= 50;
  }

  section("Integridad operacional");
  [
    `${expediente.integrity?.eventCount || 0} eventos registrados automaticamente`,
    expediente.integrity?.chronologyConsistent ? "Cronologia operacional consistente" : "Cronologia pendiente de revision",
    expediente.integrity?.timestampsVerified ? "Timestamps verificados" : "Timestamps incompletos",
    expediente.integrity?.geoAvailable ? "Geolocalizacion operacional disponible" : "Geolocalizacion operacional no disponible",
  ].forEach((row) => lines(`OK ${row}`, margin, 10, "#166534", 95, 14));

  finishPage();
  objects[1] = bytes(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`);

  let header = bytes("%PDF-1.4\n");
  const parts = [header];
  const offsets = [0];
  let offset = header.length;
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
  return new Blob([concat(parts)], { type: "application/pdf" });
}

export async function downloadServiceExpedientePdf(expediente) {
  const blob = await makePdfBlob(expediente);
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${expediente.filenameBase}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, dosDate };
}

function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  return enc.encode(String(value));
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function zipBlob(entries) {
  const now = dosTimeDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = bytes(entry.path);
    const data = bytes(entry.data);
    const crc = crc32(data);
    const local = concat([bytes("PK\x03\x04"), u16(20), u16(0), u16(0), u16(now.time), u16(now.dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    const central = concat([bytes("PK\x01\x02"), u16(20), u16(20), u16(0), u16(0), u16(now.time), u16(now.dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concat(centrals);
  const end = concat([bytes("PK\x05\x06"), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralDir.length), u32(offset), u16(0)]);
  return new Blob([concat([...locals, centralDir, end])], { type: "application/zip" });
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function downloadServiceExpedienteZip(expediente) {
  const entries = [];
  const pdf = await makePdfBlob(expediente);
  entries.push({ path: "expediente.pdf", data: new Uint8Array(await pdf.arrayBuffer()) });
  entries.push({ path: "timeline.json", data: JSON.stringify(expediente.timeline, null, 2) });
  entries.push({ path: "integridad.json", data: JSON.stringify(expediente.integrity, null, 2) });
  entries.push({ path: "expediente.json", data: JSON.stringify(expediente, null, 2) });

  for (const ev of expediente.evidencias) {
    const folder = ev.bucket;
    const base = `${folder}/${fileSafe(`${ev.stopLabel}-${ev.titulo}-${ev.id || ev.hora}`, "documento")}`;
    entries.push({ path: `${base}.json`, data: JSON.stringify(ev, null, 2) });
    if (ev.url) {
      try {
        entries.push({ path: `${base}.${extFromUrl(ev.url)}`, data: await fetchBytes(ev.url) });
      } catch {
        entries.push({ path: `${base}.url.txt`, data: ev.url });
      }
    }
  }

  const blob = zipBlob(entries);
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${expediente.filenameBase}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

export function downloadServiceArchiveMetadata(expediente) {
  const keep = {
    id: expediente.id,
    ref: expediente.ref,
    generatedAt: expediente.generatedAt,
    header: expediente.header,
    metrics: expediente.metrics,
    integrity: {
      status: expediente.integrity?.status,
      label: expediente.integrity?.label,
      eventCount: expediente.integrity?.eventCount,
      chronologyConsistent: expediente.integrity?.chronologyConsistent,
      timestampsVerified: expediente.integrity?.timestampsVerified,
      geoAvailable: expediente.integrity?.geoAvailable,
      records: expediente.integrity?.records?.map((row) => ({
        timestamp_utc: row.timestamp_utc,
        type: row.type,
        title: row.title,
        servicio_id: row.servicio_id,
        stop_id: row.stop_id,
        user_id: row.user_id,
        location_label: row.location_label,
        origin: row.origin,
        hash: row.hash,
      })) || [],
    },
    timeline: expediente.timeline,
    summary: expediente.metrics,
    stops: expediente.stops.map((stop) => ({
      ...stop,
      evidencias: stop.evidencias.map((ev) => ({
        id: ev.id,
        tipo: ev.tipo,
        titulo: ev.titulo,
        detalle: ev.detalle,
        created_at: ev.created_at,
        has_attachment: !!ev.url,
        attachment_archived: !!ev.url,
      })),
    })),
  };
  const blob = new Blob([JSON.stringify(keep, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${expediente.filenameBase}-metadata.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}
