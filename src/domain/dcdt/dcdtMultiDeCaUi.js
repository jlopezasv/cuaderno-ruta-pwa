import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { cargadorIdFromStop } from "./dcdtCargadorGroups.js";
import { isCargaStopTipo, isDescargaStop, resolveDescargaCargadorParteId } from "./descargaCargadorLink.js";

function sortStops(stops) {
  return [...(stops || [])].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

/** Paradas vinculadas a un DeCA concreto (por dcdt_servicio_id o cargador del documento). */
export function stopsLinkedToDcdt(allStops, dcdt) {
  if (!dcdt?.id) return [];
  const cargadorId = dcdt?.datos?.partes?.cargador_id
    ? String(dcdt.datos.partes.cargador_id)
    : null;
  return sortStops(allStops).filter((stop) => {
    const linked = getStopOperacionMeta(stop.notas)?.dcdt_servicio_id;
    if (linked && String(linked) === String(dcdt.id)) return true;
    if (cargadorId && isCargaStopTipo(stop) && cargadorIdFromStop(stop) === cargadorId) return true;
    if (cargadorId && isDescargaStop(stop) && resolveDescargaCargadorParteId(stop, allStops) === cargadorId) {
      return true;
    }
    return false;
  });
}

export function decaSelectorLabel(dcdt, index, masterById = {}) {
  const cargadorId = dcdt?.datos?.partes?.cargador_id;
  const parte = cargadorId ? masterById[cargadorId] : null;
  const name = String(parte?.nombre || parte?.razon_social || "").trim() || "Cargador";
  return `DeCA ${index + 1} — ${name}`;
}
