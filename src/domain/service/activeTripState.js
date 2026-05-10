import {
  formatTiempoConduccionDisponible,
  getViajePlanningSummary,
} from "./viajePlanSummary.js";

export const VIAJE_ACTIVO_STORAGE_KEY = "viaje_activo";

/**
 * Lee el viaje activo persistido (misma clave que AppInner / ModalDestino).
 * Solo cliente local; no sustituye datos de Supabase.
 */
export function readViajeActivoFromStorage() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(VIAJE_ACTIVO_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Una sola fuente de verdad de presentación: viaje Ruta (local) + servicio (Supabase).
 * Si no hay viaje con km válido, los textos “operativos” siguen el servicio.
 */
export function getUnifiedTripPresentation({
  viajeActivo,
  servicio,
  norma,
  etaSlot = null,
  etaLoading = false,
}) {
  const viajeSummary = getViajePlanningSummary(viajeActivo, norma ?? null);

  const origenRaw = viajeActivo?.origen?.trim?.() || servicio?.origen?.trim?.() || "";
  const destinoRaw = viajeActivo?.destino?.trim?.() || servicio?.destino?.trim?.() || "";
  const origenVisible = origenRaw || "—";
  const destinoVisible = destinoRaw || "—";
  const rutaHeadline = `${origenVisible} → ${destinoVisible}`;

  const kmRestantes =
    viajeActivo?.km != null && Number(viajeActivo.km) > 0 ? Number(viajeActivo.km) : null;

  const etaOperacionalLabel = etaLoading
    ? "…"
    : etaSlot?.label && etaSlot.label !== "Sin ETA"
      ? etaSlot.label
      : "Sin ETA";

  const tieneViajeRuta = Boolean(viajeSummary);

  let estadoViaje = "sin_datos";
  if (tieneViajeRuta) estadoViaje = "viaje_configurado";
  else if (servicio?.destino || servicio?.origen) estadoViaje = "solo_servicio";

  return {
    origenVisible,
    destinoVisible,
    rutaHeadline,
    kmRestantes,
    viajeSummary,
    etaOperacionalLabel,
    etaPlanNormativoLabel: viajeSummary?.etaPlanNormativoLabel ?? null,
    tiempoConduccionDisponible: formatTiempoConduccionDisponible(norma),
    estadoViaje,
    tieneViajeRuta,
    proximaParadaNormativa: viajeSummary?.proximaParadaNormativa ?? null,
  };
}
