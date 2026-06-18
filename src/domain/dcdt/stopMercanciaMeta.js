import { getStopOperacionMeta, mergeStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { emptyServicioMercancia } from "./servicioMercanciaMeta.js";
import { buildMercanciaDatosPatch } from "./mercanciaPatch.js";
import { cargadorIdFromStop } from "./dcdtCargadorGroups.js";

function isCargaStop(stop) {
  return String(stop?.tipo || "").toLowerCase() === "carga";
}

function mercanciaFromMetaObject(m) {
  if (!m || typeof m !== "object") return emptyServicioMercancia();
  return {
    descripcion: String(m.descripcion || "").trim(),
    palets: m.palets == null || m.palets === "" ? "" : String(m.palets),
    bultos: m.bultos == null || m.bultos === "" ? "" : String(m.bultos),
    peso_kg: m.peso_kg == null || m.peso_kg === "" ? "" : String(m.peso_kg),
  };
}

/** Mercancía embebida en __CUADERNO_OP__.mercancia de una parada. */
export function getStopMercanciaFromStop(stop) {
  if (!stop) return emptyServicioMercancia();
  if (stop.mercancia && typeof stop.mercancia === "object") {
    return mercanciaFromMetaObject(stop.mercancia);
  }
  return mercanciaFromMetaObject(getStopOperacionMeta(stop.notas)?.mercancia);
}

export function emptyStopMercancia() {
  return emptyServicioMercancia();
}

/** Primera parada de carga del cargador (o la primera carga del servicio). */
export function primaryCargaStopForCargador(stops = [], cargadorId = null) {
  const sorted = [...(stops || [])].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  const cargas = sorted.filter(isCargaStop);
  if (cargadorId) {
    const hit = cargas.find((s) => cargadorIdFromStop(s) === String(cargadorId));
    if (hit) return hit;
  }
  return cargas[0] || null;
}

/** Bloque mercancía listo para dcdt_servicio.datos.mercancia. */
export function mercanciaDatosFromCargaStops(stops = [], cargadorId = null) {
  const stop = primaryCargaStopForCargador(stops, cargadorId);
  return buildMercanciaDatosPatch(getStopMercanciaFromStop(stop));
}

/** Vista previa en formularios (1 cargador → primera carga). */
export function mercanciaPreviewFromStops(stops = []) {
  return getStopMercanciaFromStop(primaryCargaStopForCargador(stops));
}

export function mergeMercanciaIntoStopNotas(notas, mercanciaEdit) {
  const patch = buildMercanciaDatosPatch(mercanciaEdit);
  const hasData =
    patch.descripcion || patch.peso_kg != null || patch.bultos != null || patch.palets != null;
  return mergeStopOperacionMeta(notas, { mercancia: hasData ? patch : null });
}

export function stopMercanciaFormPatch(stop) {
  if (!stop || !isCargaStop(stop)) return {};
  const m = getStopMercanciaFromStop(stop);
  const patch = buildMercanciaDatosPatch(m);
  const hasData =
    patch.descripcion || patch.peso_kg != null || patch.bultos != null || patch.palets != null;
  return hasData ? { mercancia: patch } : {};
}
