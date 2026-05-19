import { useEffect, useState } from "react";
import { ETA_UI_VISUAL_TICK_MS } from "./operationalEtaPresentation.js";

/** Reloj compartido para “Actualizado hace…” (no mueve la hora de ETA). */
export function useEtaVisualClockMs() {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMs(Date.now()), ETA_UI_VISUAL_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return ms;
}
