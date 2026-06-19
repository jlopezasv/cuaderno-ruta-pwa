import { useCallback, useEffect, useState } from "react";
import {
  fetchConductorNameMapForServicios,
  fetchDriverOperationalCandidates,
  resolveDriverFlatPendingStops,
  serviciosPendientesFinalizarParticipacion,
} from "../../../domain/service/driverFlatStopList.js";

export function useDriverFlatPendingStops(uid) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [participacionBySvId, setParticipacionBySvId] = useState({});
  const [finalizarServicios, setFinalizarServicios] = useState([]);

  const reload = useCallback(async () => {
    if (!uid) {
      setItems([]);
      setCandidates([]);
      setParticipacionBySvId({});
      setFinalizarServicios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { candidates: cands } = await fetchDriverOperationalCandidates(uid);
      const conductorNameById = await fetchConductorNameMapForServicios(cands);
      const data = await resolveDriverFlatPendingStops(uid, { conductorNameById });
      setItems(data.items);
      setCandidates(data.candidates);
      setParticipacionBySvId(data.participacionBySvId);
      setFinalizarServicios(
        serviciosPendientesFinalizarParticipacion(data.candidates, data.participacionBySvId, data.items),
      );
    } catch {
      setItems([]);
      setCandidates([]);
      setParticipacionBySvId({});
      setFinalizarServicios([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onReload = () => void reload();
    window.addEventListener("cuaderno-recargar-servicio", onReload);
    return () => window.removeEventListener("cuaderno-recargar-servicio", onReload);
  }, [reload]);

  return { loading, items, candidates, participacionBySvId, finalizarServicios, reload };
}
