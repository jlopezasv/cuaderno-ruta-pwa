import {
  getServicioOperacionMeta,
  mergeReferenciaOperacional,
} from "../../domain/service/serviceOperacionMeta.js";

export const AUTONOMO_EXPEDIENTE_MARK = "autonomo_expediente_v1";

export function isAutonomoExpedienteServicio(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  return meta[AUTONOMO_EXPEDIENTE_MARK] === true;
}

export function getAutonomoExpedienteMeta(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  return {
    startedAt: meta.expediente_started_at || servicio?.fecha_inicio || servicio?.created_at || null,
    timelineEvents: Array.isArray(meta.timeline_events) ? meta.timeline_events : [],
    pdfVisibility: meta.pdf_visibility && typeof meta.pdf_visibility === "object" ? meta.pdf_visibility : {},
    activeStopId: meta.active_stop_id || null,
    decaLinks: Array.isArray(meta.deca_autonomo_links) ? meta.deca_autonomo_links : [],
  };
}

export function getExpedienteDecaLinks(servicio) {
  return getAutonomoExpedienteMeta(servicio).decaLinks;
}

export function pdfVisibilityKey(kind, id) {
  return `${String(kind || "item")}:${String(id || "")}`;
}

export function isIncludedInExpedientePdf(servicio, kind, id) {
  const key = pdfVisibilityKey(kind, id);
  const vis = getAutonomoExpedienteMeta(servicio).pdfVisibility;
  if (Object.prototype.hasOwnProperty.call(vis, key)) return vis[key] !== false;
  return true;
}

export function mergeAutonomoExpedientePatch(referencia, patch) {
  return mergeReferenciaOperacional(referencia, patch);
}

export function appendTimelineEvent(referencia, event) {
  const prev = getServicioOperacionMeta({ referencia });
  const events = Array.isArray(prev.timeline_events) ? [...prev.timeline_events] : [];
  events.push({
    id: event.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: event.type,
    at: event.at || new Date().toISOString(),
    label: event.label || "",
    stopId: event.stopId || null,
    refId: event.refId || null,
    meta: event.meta || null,
  });
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return mergeReferenciaOperacional(referencia, { timeline_events: events });
}
