import { useEffect, useMemo, useState } from "react";
import { fetchEmpresaOriginLabels, getCachedEmpresaOriginLabels, syncFleetTenantCacheForCurrentUser } from "../data/empresaOriginLookup.js";
import { normalizeServicioEmpresaId } from "../domain/service/serviceOwnership.js";

function collectEmpresaIds(servicios) {
  const ids = new Set();
  (Array.isArray(servicios) ? servicios : [servicios])
    .filter(Boolean)
    .forEach((sv) => {
      const id = normalizeServicioEmpresaId(sv?.empresa_id);
      if (id) ids.add(id);
    });
  return [...ids];
}

/**
 * Mapa empresa_id → { nombre, logo_url } para badges de origen.
 */
export function useEmpresaOriginLookup(servicios) {
  const list = useMemo(
    () => (Array.isArray(servicios) ? servicios : servicios ? [servicios] : []),
    [servicios],
  );

  const idsKey = useMemo(() => {
    const ids = collectEmpresaIds(list);
    ids.sort();
    return ids.join(",");
  }, [list]);

  const metaKey = useMemo(() => {
    return list
      .map((sv) => {
        const id = normalizeServicioEmpresaId(sv?.empresa_id);
        if (!id) return "";
        const ref = String(sv?.referencia || "").length;
        return `${id}:${ref}`;
      })
      .join("|");
  }, [list]);

  const [empresaById, setEmpresaById] = useState(() => getCachedEmpresaOriginLabels());

  useEffect(() => {
    void syncFleetTenantCacheForCurrentUser();
  }, []);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",").filter(Boolean) : [];
    setEmpresaById(getCachedEmpresaOriginLabels());
    if (!ids.length && !list.length) return;
    let cancelled = false;
    fetchEmpresaOriginLabels(ids, list).then((map) => {
      if (!cancelled) setEmpresaById(map);
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey, metaKey, list]);

  return empresaById;
}
