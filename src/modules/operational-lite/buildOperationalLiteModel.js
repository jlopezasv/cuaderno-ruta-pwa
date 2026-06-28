import { DECA_TITLE_WITH_LEGAL } from "../../domain/dcdt/decaBranding.js";
import { ESTADO_LABEL, SERVICIO_ESTADO_CERRADO } from "../../domain/fleet/serviceStatus.js";
import { enrichEvidenciaDisplay } from "../../domain/documents/operationalDocumentRecord.js";
import { mergeExtraDocsIntoExpedienteEvidencias } from "../../domain/service/extraDocumentExpediente.js";
import { getExpedienteCierre } from "../../domain/service/expedienteCierre.js";
import {
  getServiceClient,
  getServiceClientReference,
  getServiceNumber,
  getServiceNumberForDisplay,
  getFixedServiceRoute,
} from "../../domain/service/serviceIdentity.js";
import { getServicioOperacionMeta } from "../../domain/service/serviceOperacionMeta.js";
import {
  OPERATIONAL_GROUP_LABEL,
  operationalGroupFromStopTipo,
  sortStopsByOrden,
} from "../../domain/service/tripOperationalDossier.js";
import { formatStopNotesForDisplay, getStopOperacionMeta, getStopEntregaFirmaMeta } from "../../domain/service/stopOperacionMeta.js";
import { mapStopEntregaFirmaForExpediente } from "../../domain/service/stopEntregaFirma.js";
import { sanitizeDocumentCommentText } from "../../domain/documents/documentCommentSanitize.js";
import { SERVICIO_TRAMOS_FUTURE } from "./future/servicioTramos.js";
import { STOP_ICON } from "./operationalLiteTheme.js";
import { collectLiteAnnexItems } from "./collectLiteAnnexItems.js";

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
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileSafe(value, fallback = "servicio") {
  return (
    String(value || fallback)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

function stopLabel(stop, counters) {
  const group = operationalGroupFromStopTipo(stop?.tipo);
  counters[group] = (counters[group] || 0) + 1;
  if (group === "carga") return `Carga ${counters[group]}`;
  if (group === "descarga") return `Descarga ${counters[group]}`;
  if (group === "carga_descarga") return `Carga/descarga ${counters[group]}`;
  return `Parada ${stop?.orden || counters[group] || ""}`.trim();
}

function isIncidenciaLinkedEvidence(ev) {
  return !!ev?.incidencia_id || ev?.tipo === "incidencia";
}

function mapIncidencias(incidenciasExpediente, { servicio, nombreConductor }) {
  const rows = incidenciasExpediente?.incidenciasOperativas || [];
  return rows.map((inc) => {
    const registradoMs = parseTs(inc.registrado_en || inc.created_at);
    const fotos = (inc.fotos || []).map((ev) => {
      const enriched = enrichEvidenciaDisplay(ev, {
        conductorName:
          typeof nombreConductor === "function" ? nombreConductor(servicio?.conductor_id) : null,
      });
      return {
        id: ev.id,
        tipo: "foto",
        titulo: enriched.displayTitle || "Foto incidencia",
        url: enriched.displayImageUrl || enriched.previewUrl || ev.url || null,
        created_at: ev.created_at,
        hora: fmtClock(parseTs(ev.created_at)),
      };
    });
    return {
      id: inc.id,
      stopId: inc.stop_id || null,
      titulo: inc.titulo || "Incidencia",
      descripcion: inc.descripcion || "",
      fechaLabel: registradoMs != null ? fmtDateTime(registradoMs) : "—",
      fotos,
    };
  });
}

function mapEvidencia(ev, { stop, servicio, nombreConductor }) {
  const enriched = enrichEvidenciaDisplay(ev, {
    stop,
    conductorName:
      typeof nombreConductor === "function" ? nombreConductor(servicio?.conductor_id) : null,
  });
  return {
    id: ev.id,
    tipo: ev.tipo,
    titulo: enriched.displayTitle || ev.tipo || "Documento",
    detalle: enriched.displaySubtitle || ev.nota || "",
    hora: fmtClock(parseTs(ev.created_at)),
    url: enriched.displayImageUrl || enriched.previewUrl || ev.url || null,
    isPod: ev.tipo === "foto" && operationalGroupFromStopTipo(stop?.tipo) === "descarga",
    displayKindLabel: enriched.displayKindLabel,
  };
}

function buildCierre(servicio, nombreConductor) {
  const cierre = getExpedienteCierre(servicio);
  if (!cierre?.closed_at && String(servicio?.estado || "").toLowerCase() !== SERVICIO_ESTADO_CERRADO) {
    return null;
  }
  const closedMs = parseTs(cierre?.closed_at);
  return {
    closedAtLabel: closedMs != null ? fmtDateTime(closedMs) : "—",
    comentario: sanitizeDocumentCommentText(cierre?.comentario || "") || null,
    firmaUrl: cierre?.firma_url || null,
    conductorNombre:
      cierre?.conductor_nombre ||
      (typeof nombreConductor === "function" && servicio?.conductor_id
        ? nombreConductor(servicio.conductor_id)
        : null) ||
      "—",
  };
}

function resolveVehiculo(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  const mat = servicio?.matricula || meta?.matricula || meta?.vehiculo?.matricula || null;
  if (mat) return String(mat).trim();
  const label = meta?.vehiculo_label || meta?.vehiculo?.label;
  return label ? String(label).trim() : null;
}

function fmtDurationBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return `${h}h ${r}m`;
  return `${r} m`;
}

function paradaEstado(stop) {
  if (stop.hora_salida_real) return { key: "completado", label: "Completada" };
  if (stop.hora_llegada_real) return { key: "en_planta", label: "En planta" };
  return { key: "pendiente", label: "Pendiente" };
}

function resolveFechaOperacion(servicio, stops) {
  const candidates = [
    parseTs(servicio?.fecha_inicio),
    parseTs(servicio?.created_at),
    ...stops.map((st) => parseTs(st.hora_llegada_real)),
  ].filter((v) => v != null);
  if (!candidates.length) return null;
  const ms = Math.min(...candidates);
  return fmtDateTime(ms);
}

/**
 * Modelo de expediente operacional ligero (sin tacógrafo ni métricas legales).
 * @returns {object|null}
 */
export function buildOperationalLiteModel({
  servicio,
  stops = [],
  evidenciasByStop = {},
  extraDocumentos = [],
  incidenciasExpediente = null,
  nombreConductor,
  dcdt = null,
  decasAutonomo = [],
}) {
  if (!servicio?.id) return null;

  const sortedStops = sortStopsByOrden(stops);
  const ref = getServiceNumberForDisplay(servicio) || getServiceNumber(servicio) || servicio.id;
  const incidencias = mapIncidencias(incidenciasExpediente, { servicio, nombreConductor });
  const incidenciasByStop = {};
  for (const inc of incidencias) {
    if (!inc.stopId) continue;
    if (!incidenciasByStop[inc.stopId]) incidenciasByStop[inc.stopId] = [];
    incidenciasByStop[inc.stopId].push(inc);
  }

  const counters = {};
  const paradas = sortedStops.map((stop) => {
    const label = stopLabel(stop, counters);
    const group = operationalGroupFromStopTipo(stop.tipo);
    const stopMeta = getStopOperacionMeta(stop.notas);
    const evs = [...(evidenciasByStop[stop.id] || [])]
      .filter((ev) => !isIncidenciaLinkedEvidence(ev))
      .sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at))
      .map((ev) => mapEvidencia(ev, { stop, servicio, nombreConductor }));

    const estado = paradaEstado(stop);
    const docCount = evs.length + (incidenciasByStop[stop.id]?.length || 0);
    const llegadaMs = parseTs(stop.hora_llegada_real);
    const salidaMs = parseTs(stop.hora_salida_real);
    const tiempoEnMuelleMin =
      llegadaMs != null && salidaMs != null && salidaMs >= llegadaMs
        ? Math.round((salidaMs - llegadaMs) / 60000)
        : null;
    const tiempoEnMuelleLabel = fmtDurationBetween(stop.hora_llegada_real, stop.hora_salida_real);
    const entregaFirmaSignedMs = parseTs(getStopEntregaFirmaMeta(stop)?.signed_at);
    const entregaFirma = mapStopEntregaFirmaForExpediente(stop, {
      stopLabel: label,
      signedAtLabel: entregaFirmaSignedMs != null ? fmtDateTime(entregaFirmaSignedMs) : null,
    });
    if (entregaFirma) {
      entregaFirma.comentario = sanitizeDocumentCommentText(entregaFirma.comentario || "") || null;
    }

    return {
      id: stop.id,
      orden: stop.orden,
      label,
      tipo: group,
      icon: STOP_ICON[group] || STOP_ICON.otro,
      tipoLabel: OPERATIONAL_GROUP_LABEL[group] || stop.tipo || "PARADA",
      estado: estado.key,
      estadoLabel: estado.label,
      docCount,
      ubicacion: stop.nombre || stop.direccion || label,
      direccion: stop.direccion || "",
      muelle: stopMeta?.muelle || stopMeta?.dock || stopMeta?.plataforma || null,
      llegada: stop.hora_llegada_real || null,
      salida: stop.hora_salida_real || null,
      llegadaHora: fmtClock(llegadaMs),
      salidaHora: fmtClock(salidaMs),
      entradaMuelleHora: fmtClock(llegadaMs),
      salidaMuelleHora: fmtClock(salidaMs),
      tiempoEnMuelleMin,
      tiempoEnMuelleLabel: tiempoEnMuelleLabel || (tiempoEnMuelleMin != null ? `${tiempoEnMuelleMin} m` : null),
      observaciones: formatStopNotesForDisplay(stop.notas) || "",
      entregaFirma,
      incidencias: incidenciasByStop[stop.id] || [],
      documentos: evs,
    };
  });

  let evidenciasFlat = paradas.flatMap((p) =>
    p.documentos.map((ev) => ({ ...ev, stopId: p.id, stopLabel: p.label })),
  );
  evidenciasFlat = mergeExtraDocsIntoExpedienteEvidencias(evidenciasFlat, extraDocumentos, {
    nombreConductor,
    servicio,
  }).map((ev) => ({
    id: ev.id,
    tipo: ev.tipo,
    titulo: ev.displayTitle || ev.titulo,
    detalle: ev.displaySubtitle || ev.detalle || "",
    hora: ev.hora || fmtClock(parseTs(ev.created_at)),
    url: ev.displayImageUrl || ev.previewUrl || ev.url || null,
    source: ev.source || "evidencia",
    isPod: ev.tipo === "foto" && (ev.bucket === "fotos" || ev.datos?.pod === true || ev.datos?.es_pod === true),
  }));

  const cmr = evidenciasFlat.filter((e) => e.tipo === "cmr");
  const fotos = evidenciasFlat.filter((e) => e.tipo === "foto");
  const pod = evidenciasFlat.filter((e) => e.isPod);
  const extras = evidenciasFlat.filter((e) => e.source === "servicio_documentos_extra");
  const incidenciasSinStop = incidencias.filter((i) => !i.stopId);

  const estadoRaw = String(servicio.estado || "").toLowerCase();
  const estadoLabel =
    estadoRaw === SERVICIO_ESTADO_CERRADO
      ? ESTADO_LABEL[SERVICIO_ESTADO_CERRADO] || "Expediente cerrado"
      : ESTADO_LABEL[servicio.estado] || servicio.estado || "—";

  const fechaArchivo = new Date(servicio.fecha_inicio || servicio.created_at || Date.now())
    .toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, "-");

  const cargas = paradas.filter((p) => p.tipo === "carga" || p.tipo === "carga_descarga").length;
  const descargas = paradas.filter((p) => p.tipo === "descarga" || p.tipo === "carga_descarga").length;
  const totalFotos =
    fotos.length + incidencias.reduce((n, inc) => n + (inc.fotos?.length || 0), 0);
  const cierre = buildCierre(servicio, nombreConductor);
  const firmasEntregaDescarga = paradas.map((p) => p.entregaFirma).filter(Boolean);
  const operacionCompletada =
    !!cierre ||
    firmasEntregaDescarga.length > 0 ||
    estadoRaw === SERVICIO_ESTADO_CERRADO ||
    estadoRaw === "completado" ||
    estadoRaw === "cerrado";

  const model = {
    kind: "operational_lite",
    id: servicio.id,
    ref,
    filenameBase: fileSafe(`EXP-OP_${servicio.destino || ref}_${fechaArchivo}`, servicio.id),
    generatedAt: new Date().toISOString(),
    future: { servicioTramos: SERVICIO_TRAMOS_FUTURE.version },
    header: {
      referencia: ref,
      ruta: getFixedServiceRoute(servicio, "—", "—", sortedStops),
      fechaOperacion: resolveFechaOperacion(servicio, sortedStops),
      estado: estadoLabel,
      conductor:
        typeof nombreConductor === "function" && servicio.conductor_id
          ? nombreConductor(servicio.conductor_id)
          : "—",
      vehiculo: resolveVehiculo(servicio),
      cliente: getServiceClient(servicio) || null,
      referenciaCliente: getServiceClientReference(servicio) || null,
    },
    paradas,
    documentos: {
      cmr,
      fotos,
      pod,
      extras,
      incidencias: incidencias,
      incidenciasSinStop,
    },
    cierre,
    firmasEntregaDescarga,
    resumen: {
      cargas,
      descargas,
      incidencias: incidencias.length,
      cmr: cmr.length,
      fotos: totalFotos,
      pod: pod.length,
      extras: extras.length,
      documentosAdjuntos: evidenciasFlat.length + incidencias.reduce((n, i) => n + (i.fotos?.length || 0), 0),
      operacionCompletada,
    },
  };

  model.evidenciasAnnexo = collectLiteAnnexItems(model);
  if (dcdt) {
    model.dcdt = {
      titulo: "Documento de Control del Transporte",
      subtitulo: DECA_TITLE_WITH_LEGAL,
      ...dcdt,
    };
  }
  if (Array.isArray(decasAutonomo) && decasAutonomo.length) {
    model.decasAutonomo = decasAutonomo;
  }
  return model;
}
