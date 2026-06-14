import { useCallback, useRef, useState } from "react";
import { requestActionLocation } from "../../../data/driverActionGps.js";

/**
 * Solicita ubicación antes de una acción operativa (desde gesto del usuario).
 * Devuelve resultado GPS o null si el usuario cancela.
 */
export function useDriverActionLocation() {
  const [gate, setGate] = useState(null);
  const gateRef = useRef(null);
  gateRef.current = gate;

  const runAttempt = useCallback(async (eventType, actionLabel, resolve) => {
    setGate({ actionLabel, phase: "requesting", resolve, eventType });
    const result = await requestActionLocation(eventType, { callingFunction: "useDriverActionLocation" });
    const current = gateRef.current;
    if (!current || current.resolve !== resolve) return;

    if (result.ok) {
      resolve(result);
      setGate(null);
      return;
    }

    setGate({
      actionLabel,
      phase: "failed",
      resolve,
      eventType,
      error: result.error || "No se pudo obtener ubicación",
      lastResult: result,
    });
  }, []);

  const acquireLocation = useCallback(
    (eventType, actionLabel = "esta acción") =>
      new Promise((resolve) => {
        void runAttempt(eventType, actionLabel, resolve);
      }),
    [runAttempt],
  );

  const retry = useCallback(() => {
    const g = gateRef.current;
    if (!g?.resolve) return;
    void runAttempt(g.eventType || "retry", g.actionLabel, g.resolve);
  }, [runAttempt]);

  const continueWithout = useCallback(() => {
    const g = gateRef.current;
    if (!g?.resolve) return;
    g.resolve(
      g.lastResult || {
        ok: false,
        location_status: "unavailable",
        error: g.error || "No se pudo obtener ubicación",
        location_error: g.error || "No se pudo obtener ubicación",
      },
    );
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
