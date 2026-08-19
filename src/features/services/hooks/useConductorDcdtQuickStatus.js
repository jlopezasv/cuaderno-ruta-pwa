import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveConductorDecaAccess } from "../../../domain/dcdt/conductorDecaAccess.js";
import { fetchAllDcdtByServicio, filterDcdtRowsForUiSelector } from "../../../domain/dcdt/dcdtModel.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "../../../domain/dcdt/dcdtReadiness.js";
import { isDecaAplicable } from "../../../domain/service/servicioAlcance.js";

/** @typedef {"validated"|"incomplete"|"none"} DcdtQuickVisual */

/**
 * Estado visual del botón DCDT (misma regla que ConductorDcdtPanel).
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
    if (!servicio?.id || !empresaId || !isDecaAplicable(servicio)) {
      setDcdt(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, ctx] = await Promise.all([
        fetchAllDcdtByServicio(servicio.id).then((all) => {
          const visible = filterDcdtRowsForUiSelector(all);
          return visible[0] || all[0] || null;
        }),
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

  const access = useMemo(
    () =>
      resolveConductorDecaAccess({
        hasDcdt: !!dcdt,
        isValidated: readiness.isValidated,
        hasPdfStorage: readiness.hasPdfStorage,
        downloadUrl: dcdt?.datos?.deca_download_url || null,
      }),
    [dcdt, readiness.isValidated, readiness.hasPdfStorage],
  );

  useEffect(() => {
    if (!pollWhileIncomplete || !servicio?.id || access.hasPdf) return;
    const t = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(t);
  }, [pollWhileIncomplete, servicio?.id, access.hasPdf, load]);

  const visual = useMemo(() => {
    if (!empresaId || !isDecaAplicable(servicio)) return "none";
    if (loading && !dcdt) return "none";
    return access.quickVisual;
  }, [empresaId, servicio, loading, dcdt, access.quickVisual]);

  return { visual, loading, hasDcdt: !!dcdt, readiness, reload: load };
}

export const useServiceDcdtQuickStatus = useConductorDcdtQuickStatus;
