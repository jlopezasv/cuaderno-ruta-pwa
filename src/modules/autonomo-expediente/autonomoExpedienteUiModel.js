import { getExpedienteDecaLinks } from "./autonomoExpedienteMeta.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import {
  isCargaNacional,
  listNacionalCargas,
} from "./autonomoExpedienteDeca.js";
import {
  getCargaEstado,
  isCargaTerminada,
  isDestinoEntregado,
  CARGA_ESTADO,
} from "./autonomoExpedienteStopModel.js";

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
  const cargasTerminadas = cargas.filter(isCargaTerminada);
  const cargasEnMuelle = cargas.filter((c) => getCargaEstado(c) === CARGA_ESTADO.EN_MUELLE);
  const destinosEntregados = destinos.filter(isDestinoEntregado);
  const destinosPendientes = destinos.filter((d) => !isDestinoEntregado(d));
  const nacionalSinDeca = listNacionalCargas(cargas).filter(
    (c) => isCargaTerminada(c) && !decaLinkForCarga(servicio, c.id),
  );
  const hasInternacional = cargas.some((c) => !isCargaNacional(c));

  let estadoLabel = "Expediente iniciado";
  if (!cargas.length && !destinos.length) estadoLabel = "Sin carga registrada";
  else if (cargasEnMuelle.length) estadoLabel = `En muelle · ${cargasEnMuelle[0].nombre}`;
  else if (cargasTerminadas.length && !destinos.length) estadoLabel = "Carga registrada · falta destino";
  else if (destinosPendientes.length) estadoLabel = "En ruta / entregas";
  else if (destinosEntregados.length && cargasTerminadas.length) estadoLabel = "Expediente listo para cerrar";

  const canSuggestFinalizar = cargasTerminadas.length > 0 && destinosEntregados.length > 0;

  const sugerencias = [];
  for (const c of nacionalSinDeca) {
    sugerencias.push({
      id: `deca-${c.id}`,
      type: "deca",
      priority: 1,
      label: "Generar DeCA antes de circular",
      cargaId: c.id,
    });
  }
  if (cargasTerminadas.length && !destinos.length) {
    sugerencias.push({
      id: "add-destino",
      type: "destino",
      priority: 2,
      label: "Añadir destino",
    });
  }
  if (hasInternacional || cargas.some((c) => !isCargaNacional(c))) {
    sugerencias.push({
      id: "cmr-int",
      type: "doc",
      priority: 3,
      label: "Escanear / subir CMR (opcional)",
    });
  } else if (cargasTerminadas.length) {
    sugerencias.push({
      id: "cmr-optional",
      type: "doc",
      priority: 4,
      label: "Escanear CMR (opcional)",
    });
  }

  return {
    estadoLabel,
    cargasTerminadas,
    cargasEnMuelle,
    destinosEntregados,
    destinosPendientes,
    nacionalSinDeca,
    canSuggestFinalizar,
    sugerencias: sugerencias.sort((a, b) => a.priority - b.priority),
  };
}
