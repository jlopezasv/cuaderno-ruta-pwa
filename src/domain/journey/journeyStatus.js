export const JOURNEY_STATUS_OPEN = "open";
export const JOURNEY_STATUS_CLOSED = "closed";
export const JOURNEY_STATUS_NONE = "none";

export function jornadaState(sorted) {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i].type;
    if (t === "inicio_jornada" || t === "continuar_jornada") return JOURNEY_STATUS_OPEN;
    if (t === "fin_jornada") return JOURNEY_STATUS_CLOSED;
  }
  return JOURNEY_STATUS_NONE;
}
