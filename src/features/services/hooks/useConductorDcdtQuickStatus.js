import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAllDcdtByServicio, fetchDcdtByServicio } from "../../../domain/dcdt/dcdtModel.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "../../../domain/dcdt/dcdtReadiness.js";

/** @typedef {"validated"|"incomplete"|"none"} DcdtQuickVisual */

/**
 * Estado visual del botón DCDT (misma validación que ConductorDcdtPanel).
 * @returns {{ visual: DcdtQuickVisual, loading: boolean, hasDcdt: boolean, readiness: object|null }}
 */
export function useConductorDcdtQuickStatus({
  servicio,
  empresa,
  conductorUid,
  stops = [],
  pollWhileIncomplete = true,
}) {
  const empresaId = servicio?.empresa_id || empresa?.id;
  const [dcdt, setDcdt] = useState(null);
  const [loading, setLoading] = useState(!!empresaId);
  const [resolveCtx, setResolveCtx] = useState({
    stops,
    empresa,
    empresaOwnerProfile: null,
    conductor: null,
    masterById: {},
  });

  const load = useCallback(async () => {
    if (!servicio?.id || !empresaId) {
      setDcdt(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, ctx] = await Promise.all([
        fetchAllDcdtByServicio(servicio.id).then((all) => all[0] || fetchDcdtByServicio(servicio.id)),
        fetchDcdtResolveContext({
          servicio,
          stops,
          empresa,
          conductorUid: conductorUid || servicio?.conductor_id,
        }),
      ]);
      setResolveCtx(ctx);
      setDcdt(rows);
    } catch {
      setDcdt(null);
    } finally {
      setLoading(false);
    }
  }, [servicio, empresaId, stops, empresa, conductorUid]);

  useEffect(() => {
    void load();
  }, [load]);

  const readiness = useMemo(() => {
    if (!dcdt) return validateDcdtReadiness({ servicio, dcdt: null });
    return validateDcdtReadiness({
      servicio,
      dcdt,
      stops: resolveCtx.stops,
      masterById: resolveCtx.masterById,
      empresa: resolveCtx.empresa,
      empresaOwnerProfile: resolveCtx.empresaOwnerProfile,
      conductor: resolveCtx.conductor,
    });
  }, [dcdt, servicio, resolveCtx]);

  useEffect(() => {
    if (!pollWhileIncomplete || !servicio?.id || readiness.isValidated) return;
    const t = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(t);
  }, [pollWhileIncomplete, servicio?.id, readiness.isValidated, load]);

  const visual = useMemo(() => {
    if (!empresaId) return "none";
    if (loading && !dcdt) return "none";
    if (!dcdt) return "none";
    if (readiness.isValidated) return "validated";
    return "incomplete";
  }, [empresaId, loading, dcdt, readiness.isValidated]);

  return { visual, loading, hasDcdt: !!dcdt, readiness, reload: load };
}

export const useServiceDcdtQuickStatus = useConductorDcdtQuickStatus;
