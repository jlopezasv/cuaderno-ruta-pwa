import { useCallback, useRef, useState } from "react";
import { isDemoApp } from "../../../config/appEnvironment.js";
import { requestActionLocation } from "../../../data/driverActionGps.js";

/**
 * Solicita ubicación antes de una acción operativa (desde gesto del usuario).
 * Devuelve resultado GPS o null si el usuario cancela.
 */
export function useDriverActionLocation() {
  const [gate, setGate] = useState(null);
  const gateRef = useRef(null);
  gateRef.current = gate;

  const runAttempt = useCallback(async (actionLabel, resolve) => {
    setGate({ actionLabel, phase: "requesting", resolve });
    const result = await requestActionLocation();
    const current = gateRef.current;
    if (!current || current.resolve !== resolve) return;

    if (result.ok) {
      if (isDemoApp()) console.log("[GPS acción] guardando evento con ubicación");
      resolve(result);
      setGate(null);
      return;
    }

    setGate({
      actionLabel,
      phase: "failed",
      resolve,
      error: result.error || "No se pudo obtener ubicación",
      lastResult: result,
    });
  }, []);

  const acquireLocation = useCallback(
    (actionLabel = "esta acción") =>
      new Promise((resolve) => {
        void runAttempt(actionLabel, resolve);
      }),
    [runAttempt],
  );

  const retry = useCallback(() => {
    const g = gateRef.current;
    if (!g?.resolve) return;
    void runAttempt(g.actionLabel, g.resolve);
  }, [runAttempt]);

  const continueWithout = useCallback(() => {
    const g = gateRef.current;
    if (!g?.resolve) return;
    if (isDemoApp()) console.log("[GPS acción] evento guardado sin ubicación");
    g.resolve(g.lastResult || { ok: false, location_status: "unavailable", error: g.error });
    setGate(null);
  }, []);

  const cancelGate = useCallback(() => {
    const g = gateRef.current;
    if (g?.resolve) g.resolve(null);
    setGate(null);
  }, []);

  return {
    gate,
    acquireLocation,
    retry,
    continueWithout,
    cancelGate,
  };
}
