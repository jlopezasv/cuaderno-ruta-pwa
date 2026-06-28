import { getExpedienteDecaLinks } from "./autonomoExpedienteMeta.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { getServicioOperacionMeta } from "../../domain/service/serviceOperacionMeta.js";
import {
  resolveProximaAccionPrincipal,
  splitCargasByRole,
} from "../../domain/service/operationalVisualModel.js";
import {
  isCargaNacional,
  listNacionalCargas,
} from "./autonomoExpedienteDeca.js";
import {
  getCargaEstado,
  isCargaPendienteEntrada,
  isCargaTerminada,
  isDestinoEntregado,
  CARGA_ESTADO,
} from "./autonomoExpedienteStopModel.js";

/**
 * DeCA «vigente» en pantalla de trabajo: pendiente de generar o último tramo con documento.
 */
export function resolveAutonomoDecaFocus({ servicio, cargas = [], destinos = [], operativo = null }) {
  const op = operativo || buildExpedienteOperativoState({ servicio, cargas, destinos });
  const pending = op.nacionalSinDeca?.[0];
  if (pending) {
    return { kind: "pending", carga: pending, cargaId: pending.id, link: null };
  }
  const links = getExpedienteDecaLinks(servicio);
  if (!links.length) return { kind: "none", carga: null, cargaId: null, link: null };

  const terminadasNacional = listNacionalCargas(cargas).filter(isCargaTerminada);
  for (let i = terminadasNacional.length - 1; i >= 0; i -= 1) {
    const carga = terminadasNacional[i];
    const link = decaLinkForCarga(servicio, carga.id);
    if (link) {
      return { kind: "ready", carga, cargaId: carga.id, link };
    }
  }
  const link = links[links.length - 1];
  return { kind: "ready", carga: null, cargaId: link?.carga_stop_id || null, link };
}

export function decaLinkForCarga(servicio, cargaStopId) {
  const links = getExpedienteDecaLinks(servicio);
  return links.find((l) => l.carga_stop_id === cargaStopId) || null;
}

export function cargaNeedsDeca(stop, servicio) {
  if (!isCargaNacional(stop)) return false;
  if (!isCargaTerminada(stop)) return false;
  const link = servicio ? decaLinkForCarga(servicio, stop?.id) : null;
  if (link?.deca_id) return false;
  const meta = getStopOperacionMeta(stop?.notas);
  if (meta.no_requiere_deca === true) return false;
  return true;
}

export function filterDestinosActivos(destinos = []) {
  const pendientes = destinos.filter((d) => !isDestinoEntregado(d));
  if (pendientes.length) return pendientes;
  return destinos.slice(-2);
}

export function collectRecentExpedienteDocumentos({ evidenciasByStop = {}, extraDocumentos = [], stops = [], limit = 5 }) {
  const stopById = Object.fromEntries((stops || []).map((s) => [s.id, s]));
  const rows = [];
  for (const [stopId, evs] of Object.entries(evidenciasByStop || {})) {
    for (const ev of evs || []) {
      rows.push({
        id: ev.id,
        kind: "evidence",
        tipo: ev.tipo || "doc",
        label: `${ev.tipo || "doc"} · ${stopById[stopId]?.nombre || "parada"}`,
        at: ev.created_at || ev.fecha || null,
        stopId,
      });
    }
  }
  for (const doc of extraDocumentos || []) {
    rows.push({
      id: doc.id,
      kind: "extra",
      tipo: doc.tipo || doc.categoria || "doc",
      label: doc.nombre || doc.tipo || "Documento",
      at: doc.created_at || null,
      stopId: null,
    });
  }
  return rows
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
    .slice(0, limit);
}

export function buildExpedienteOperativoState({ servicio, cargas = [], destinos = [] }) {
  const { cargasPrincipal, cargasRetorno } = splitCargasByRole(cargas);
  const cargasTerminadas = cargasPrincipal.filter(isCargaTerminada);
  const cargasPendienteEntrada = cargasPrincipal.filter(isCargaPendienteEntrada);
  const cargasEnMuelle = cargasPrincipal.filter((c) => getCargaEstado(c) === CARGA_ESTADO.EN_MUELLE);
  const destinosEntregados = destinos.filter(isDestinoEntregado);
  const destinosPendientes = destinos.filter((d) => !isDestinoEntregado(d));
  const nacionalSinDeca = listNacionalCargas(cargasPrincipal).filter(
    (c) => isCargaTerminada(c) && !decaLinkForCarga(servicio, c.id),
  );
  const hasInternacional = cargas.some((c) => !isCargaNacional(c));

  const proxima = resolveProximaAccionPrincipal({ cargas, destinos, stockActual: [] });

  let estadoLabel = "Expediente iniciado";
  if (!cargas.length && !destinos.length) estadoLabel = "Sin carga registrada";
  else if (destinosPendientes.length) {
    estadoLabel = `Descarga pendiente · ${destinosPendientes[0].nombre}`;
  } else if (cargasPendienteEntrada.length) {
    estadoLabel = `Pendiente entrada muelle carga · ${cargasPendienteEntrada[0].nombre}`;
  } else if (cargasEnMuelle.length) estadoLabel = `En muelle carga · ${cargasEnMuelle[0].nombre}`;
  else if (cargasTerminadas.length && !destinos.length) estadoLabel = "Carga terminada · falta destino";
  else if (destinosPendientes.length === 0 && destinosEntregados.length) {
    const retornoPend = cargasRetorno.filter(isCargaPendienteEntrada);
    if (retornoPend.length) estadoLabel = `Retorno pendiente · ${retornoPend[0].nombre}`;
    else if (cargasRetorno.length) estadoLabel = "Retorno acumulado en transporte";
    else estadoLabel = "Expediente listo para cerrar";
  }

  const canSuggestFinalizar = cargasTerminadas.length > 0 && destinosEntregados.length > 0;

  const sugerencias = [];

  if (proxima?.stop && proxima.kind !== "idle" && proxima.kind !== "cerrar") {
    sugerencias.push({
      id: `proxima-${proxima.stop.id || proxima.kind}`,
      type: proxima.kind,
      priority: 0,
      label: `${proxima.primaryLabel} · ${proxima.stop.nombre || proxima.title}`,
      stopId: proxima.stop.id,
    });
  }

  for (const c of nacionalSinDeca) {
    sugerencias.push({
      id: `deca-${c.id}`,
      type: "deca",
      priority: 2,
      label: "Generar DeCA antes de circular",
      cargaId: c.id,
    });
  }

  // Retornos: solo sugerencia secundaria si hay descargas pendientes
  if (destinosPendientes.length) {
    for (const c of cargasRetorno.filter(isCargaPendienteEntrada)) {
      sugerencias.push({
        id: `retorno-${c.id}`,
        type: "retorno",
        priority: 5,
        label: `Retorno en paralelo · ${c.nombre} (no bloquea descargas)`,
        cargaId: c.id,
      });
    }
  } else {
    for (const c of cargasRetorno.filter(isCargaPendienteEntrada)) {
      sugerencias.push({
        id: `retorno-${c.id}`,
        type: "retorno",
        priority: 1,
        label: `Registrar retorno · ${c.nombre}`,
        cargaId: c.id,
      });
    }
  }

  if (cargasTerminadas.length && !destinos.length) {
    sugerencias.push({
      id: "add-destino",
      type: "destino",
      priority: 3,
      label: "Añadir destino",
    });
  }
  if (hasInternacional || cargas.some((c) => !isCargaNacional(c))) {
    sugerencias.push({
      id: "cmr-int",
      type: "doc",
      priority: 4,
      label: "Escanear / subir CMR (opcional)",
    });
  } else if (cargasTerminadas.length) {
    sugerencias.push({
      id: "cmr-optional",
      type: "doc",
      priority: 6,
      label: "Escanear CMR (opcional)",
    });
  }

  return {
    estadoLabel,
    proximaAccion: proxima,
    cargasTerminadas,
    cargasEnMuelle,
    cargasPendienteEntrada,
    cargasRetorno,
    cargasPrincipal,
    destinosEntregados,
    destinosPendientes,
    nacionalSinDeca,
    canSuggestFinalizar,
    sugerencias: sugerencias.sort((a, b) => a.priority - b.priority),
  };
}

/** Resumen corto para listado histórico (sin cargar workspace completo). */
export function summarizeAutonomoExpedienteListItem(servicio) {
  if (!servicio) return { title: "Expediente", subtitle: "", meta: "" };
  const meta = getServicioOperacionMeta(servicio);
  const events = Array.isArray(meta.timeline_events) ? meta.timeline_events : [];
  const cargas = events.filter((e) => e.type === "carga_registrada");
  const destinos = events.filter((e) => e.type === "destino_anadido");
  const origen =
    String(servicio.origen || "").trim() ||
    cargas[0]?.label?.replace(/^Carga:\s*/i, "") ||
    "";
  const destino =
    String(servicio.destino || "").trim() ||
    destinos[destinos.length - 1]?.label?.replace(/^Destino:\s*/i, "") ||
    "";
  const matricula = String(meta.matricula || "").trim();
  const route =
    origen && destino ? `${origen} → ${destino}` : origen || destino || "Sin ruta definida";
  const counts = [];
  if (cargas.length) counts.push(`${cargas.length} carga${cargas.length > 1 ? "s" : ""}`);
  if (destinos.length) counts.push(`${destinos.length} destino${destinos.length > 1 ? "s" : ""}`);
  const metaLine = [matricula, counts.join(" · ")].filter(Boolean).join(" · ");
  const fecha = servicio.fecha_inicio || servicio.created_at;
  const title = fecha
    ? new Date(fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    : "Expediente";
  return { title, subtitle: route, meta: metaLine };
}
