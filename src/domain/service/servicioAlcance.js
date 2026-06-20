import { getServicioOperacionMeta } from "./serviceOperacionMeta.js";

/** Alcance operativo del servicio (DeCA solo aplica a nacional en flota). */
export const SERVICIO_ALCANCE = Object.freeze({
  NACIONAL: "nacional",
  INTERNACIONAL: "internacional",
});

export const SERVICIO_ALCANCE_DEFAULT = SERVICIO_ALCANCE.NACIONAL;

export const SERVICIO_ALCANCE_LABELS = Object.freeze({
  [SERVICIO_ALCANCE.NACIONAL]: "Nacional",
  [SERVICIO_ALCANCE.INTERNACIONAL]: "Internacional",
});

/** Clave en meta `referencia` → `__SRV_OP__`. */
export const SERVICIO_ALCANCE_META_KEY = "alcance_servicio";

export function normalizeServicioAlcance(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === SERVICIO_ALCANCE.INTERNACIONAL) return SERVICIO_ALCANCE.INTERNACIONAL;
  return SERVICIO_ALCANCE.NACIONAL;
}

/** Servicios sin meta explícita se tratan como nacional (demo histórico). */
export function getServicioAlcance(servicio) {
  const raw = getServicioOperacionMeta(servicio)?.[SERVICIO_ALCANCE_META_KEY];
  return normalizeServicioAlcance(raw);
}

export function isServicioInternacional(servicio) {
  return getServicioAlcance(servicio) === SERVICIO_ALCANCE.INTERNACIONAL;
}

/** DeCA obligatorio solo en transporte interior español (flota con empresa). */
export function isDecaAplicable(servicio) {
  if (!servicio?.empresa_id) return false;
  return !isServicioInternacional(servicio);
}

export function servicioAlcanceMetaPatch(alcance) {
  return { [SERVICIO_ALCANCE_META_KEY]: normalizeServicioAlcance(alcance) };
}
