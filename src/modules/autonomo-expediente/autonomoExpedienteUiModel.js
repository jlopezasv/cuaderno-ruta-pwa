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

export function buildExpedienteOperativoState({ servicio, cargas = [], destinos = [] }) {
  const cargasTerminadas = cargas.filter(isCargaTerminada);
  const cargasEnMuelle = cargas.filter((c) => getCargaEstado(c) === CARGA_ESTADO.EN_MUELLE);
  const destinosEntregados = destinos.filter(isDestinoEntregado);
  const nacionalSinDeca = listNacionalCargas(cargas).filter(
    (c) => isCargaTerminada(c) && !decaLinkForCarga(servicio, c.id),
  );

  let estadoLabel = "Expediente iniciado";
  if (cargasEnMuelle.length) estadoLabel = `En muelle · ${cargasEnMuelle[0].nombre}`;
  else if (cargasTerminadas.length && !destinos.length) estadoLabel = "Carga lista · sin destino";
  else if (destinos.length && destinosEntregados.length < destinos.length) estadoLabel = "En ruta / entregas";
  else if (destinosEntregados.length) estadoLabel = "Entregas completadas";

  const canSuggestFinalizar =
    cargasTerminadas.length > 0 && (destinosEntregados.length > 0 || destinos.length === 0);

  const sugerencias = [];
  for (const c of nacionalSinDeca) {
    sugerencias.push({
      id: `deca-${c.id}`,
      type: "deca",
      priority: 1,
      label: "Generar DeCA antes del viaje",
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
  if (cargasTerminadas.length) {
    sugerencias.push({
      id: "cmr-optional",
      type: "doc",
      priority: 3,
      label: "Escanear CMR / carta de porte (opcional)",
    });
  }

  return {
    estadoLabel,
    cargasTerminadas,
    cargasEnMuelle,
    destinosEntregados,
    nacionalSinDeca,
    canSuggestFinalizar,
    sugerencias: sugerencias.sort((a, b) => a.priority - b.priority),
  };
}
