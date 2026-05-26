import { JOURNEY_STATUS_CLOSED, JOURNEY_STATUS_NONE } from "./journeyStatus";

/** Transición directa conductor: Disponible / Pausa / Trabajo / Conducción. */
export const DRIVER_QUICK_OPS = new Set([
  "inicio_disponibilidad",
  "inicio_pausa",
  "inicio_otros",
  "inicio_conduccion",
]);

export function createIsAvail(EV) {
  return function isAvail(type, active, jState) {
    const T = EV[type];
    if (!T) return false;
    if (
      DRIVER_QUICK_OPS.has(type) &&
      jState !== JOURNEY_STATUS_CLOSED &&
      jState !== JOURNEY_STATUS_NONE
    ) {
      return true;
    }
    if (type === "art12") return true;
    if (type === "continuar_jornada") return jState === JOURNEY_STATUS_CLOSED;
    if (jState === JOURNEY_STATUS_CLOSED || jState === JOURNEY_STATUS_NONE) return type === "inicio_jornada";
    if (T.kind === "solo") return true;
    if (!active) return true;
    const aT = EV[active.type];
    if (!aT) return true;

    // Si hay actividad abierta
    if (aT.kind === "open") {
      // Siempre se puede cerrar la actividad actual
      if (type === aT.pair) return true;
      // No se puede iniciar conducción si hay otra actividad abierta
      if (type === "inicio_conduccion") return false;
      // Si está conduciendo, solo puede cerrar o pausar
      if (active.type === "inicio_conduccion") {
        return ["fin_conduccion", "inicio_pausa", "inicio_descanso"].includes(type);
      }
      // Si está en pausa/descanso, no puede iniciar otra actividad hasta cerrarla
      if (["inicio_pausa", "inicio_descanso"].includes(active.type)) {
        return type === aT.pair;
      }
      // Si está en disponible, carga, descarga, otros, ferry, pasajero, repostaje, inspección
      // puede iniciar otras actividades del mismo grupo (cierre implícito)
      return true;
    }
    return true;
  };
}
