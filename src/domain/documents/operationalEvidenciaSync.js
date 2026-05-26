export const EVIDENCIA_SAVED_EVENT = "cuaderno:evidencia-saved";
export const INCIDENCIA_SAVED_EVENT = "cuaderno:incidencia-saved";

/** Fusiona una evidencia en el mapa stop_id → evidencias[]. */
export function mergeEvidenciaIntoByStop(prev, stopId, ev) {
  if (!ev?.id || !stopId) return prev;
  const cur = prev[stopId] || [];
  if (cur.some((x) => x.id === ev.id)) return prev;
  return { ...prev, [stopId]: [...cur, ev] };
}

/** Notifica a Documentos, flota empresa y demás vistas que escuchan el evento. */
export function notifyEvidenciaSaved({ ev, stopId, servicioId = null }) {
  if (typeof window === "undefined" || !ev?.id || !stopId) return;
  window.dispatchEvent(
    new CustomEvent(EVIDENCIA_SAVED_EVENT, {
      detail: { ev, stopId, servicioId },
    }),
  );
}

export function notifyIncidenciaSaved({ incidencia, servicioId = null }) {
  if (typeof window === "undefined" || !incidencia?.id) return;
  window.dispatchEvent(
    new CustomEvent(INCIDENCIA_SAVED_EVENT, {
      detail: { incidencia, servicioId: servicioId || incidencia?.servicio_id || null },
    }),
  );
}
