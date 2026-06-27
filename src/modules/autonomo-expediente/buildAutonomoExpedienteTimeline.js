import { enrichEvidenciaDisplay } from "../../domain/documents/operationalDocumentRecord.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { getAutonomoExpedienteMeta } from "./autonomoExpedienteMeta.js";

const TYPE_LABEL = {
  expediente_iniciado: "Expediente iniciado",
  carga_registrada: "Carga registrada",
  ocr_cmr: "OCR CMR",
  foto_cmr: "Foto CMR",
  foto_carga: "Foto carga",
  foto_mercancia: "Foto mercancía",
  documento: "Documento",
  incidencia: "Incidencia",
  destino_anadido: "Destino añadido",
  entrega_llegada: "Llegada a destino",
  entrega_salida: "Salida de destino",
  entrega_completada: "Entrega completada",
  deca_generado: "DeCA generado",
  expediente_generado: "Expediente generado",
  expediente_finalizado: "Expediente finalizado",
  pod: "POD firmado",
  nueva_carga: "Nueva carga",
  retorno: "Retorno / recogida",
};

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function pushEvent(out, { at, type, label, stopId = null, refId = null }) {
  if (!at) return;
  out.push({
    at,
    type,
    label: label || TYPE_LABEL[type] || type,
    stopId,
    refId,
    timeLabel: fmtTime(at),
  });
}

export function buildAutonomoExpedienteTimeline({
  servicio,
  stops = [],
  evidenciasByStop = {},
  extraDocumentos = [],
}) {
  const out = [];
  const { timelineEvents, startedAt } = getAutonomoExpedienteMeta(servicio);

  if (startedAt) {
    pushEvent(out, { at: startedAt, type: "expediente_iniciado", label: TYPE_LABEL.expediente_iniciado });
  }

  for (const evt of timelineEvents) {
    pushEvent(out, {
      at: evt.at,
      type: evt.type,
      label: evt.label,
      stopId: evt.stopId,
      refId: evt.refId,
    });
  }

  for (const stop of stops) {
    const meta = getStopOperacionMeta(stop?.notas);
    const stopLabel = String(stop.nombre || "").trim();
    if (meta.carga_registrada_at) {
      pushEvent(out, {
        at: meta.carga_registrada_at,
        type: "carga_registrada",
        label: `Carga: ${stopLabel}`,
        stopId: stop.id,
      });
    }
    if (meta.entrada_at) {
      pushEvent(out, {
        at: meta.entrada_at,
        type: "entrega_llegada",
        label: `Llegada: ${stopLabel}`,
        stopId: stop.id,
      });
    }
    if (meta.salida_at) {
      pushEvent(out, {
        at: meta.salida_at,
        type: "entrega_salida",
        label: `Salida: ${stopLabel}`,
        stopId: stop.id,
      });
    }
    if (meta.destino_estado === "entregado" && meta.entrega_completada_at) {
      pushEvent(out, {
        at: meta.entrega_completada_at,
        type: "entrega_completada",
        label: `Entregado: ${stopLabel}`,
        stopId: stop.id,
      });
    }
  }

  for (const stopId of Object.keys(evidenciasByStop || {})) {
    for (const ev of evidenciasByStop[stopId] || []) {
      const enriched = enrichEvidenciaDisplay(ev);
      const at = ev.created_at || enriched?.created_at;
      const tipo = String(ev.tipo || "").toLowerCase();
      let type = "documento";
      if (tipo === "cmr") type = ev.datos?.ocr ? "ocr_cmr" : "foto_cmr";
      else if (tipo === "foto") type = "foto_mercancia";
      else if (tipo === "incidencia") type = "incidencia";
      pushEvent(out, {
        at,
        type,
        label: enriched?.displayLabel || TYPE_LABEL[type] || "Documento",
        stopId,
        refId: ev.id,
      });
    }
  }

  for (const doc of extraDocumentos || []) {
    pushEvent(out, {
      at: doc.created_at,
      type: "documento",
      label: doc.descripcion || doc.tipo || "Documento",
      refId: doc.id,
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const e of out.sort((a, b) => new Date(a.at) - new Date(b.at))) {
    const key = `${e.at}|${e.type}|${e.stopId || ""}|${e.refId || ""}|${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped;
}
