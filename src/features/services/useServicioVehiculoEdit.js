import { useState, useEffect, useRef, useMemo } from "react";
import { fetchConductorVehiculoForDcdt } from "../../domain/empresa/conductorVehiculoEmpresa.js";
import { resolveConductorVehiculo } from "./servicioFormTheme.js";

/** Matrícula/remolque editables en formulario de servicio; rellena desde flota + fetch DeCA. */
export function useServicioVehiculoEdit({ conductorId, conductores = [], empresaId = null }) {
  const [vehiculoEdit, setVehiculoEdit] = useState({ matricula: "", remolque: "" });
  const vehiculoDirtyRef = useRef(false);

  const conductorVehiculo = useMemo(
    () => resolveConductorVehiculo(conductores, conductorId),
    [conductores, conductorId],
  );

  useEffect(() => {
    vehiculoDirtyRef.current = false;
    if (!conductorId) {
      setVehiculoEdit({ matricula: "", remolque: "" });
      return;
    }

    const fromFlota = resolveConductorVehiculo(conductores, conductorId);
    setVehiculoEdit({
      matricula: fromFlota.matricula,
      remolque: fromFlota.remolque,
    });

    let cancelled = false;
    (async () => {
      try {
        const row = await fetchConductorVehiculoForDcdt(conductorId, empresaId);
        if (cancelled || vehiculoDirtyRef.current || !row) return;
        setVehiculoEdit({
          matricula: String(row.matricula ?? fromFlota.matricula ?? "").trim(),
          remolque: String(row.remolque ?? fromFlota.remolque ?? "").trim(),
        });
      } catch {
        /* perfil/flota opcional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conductorId, empresaId, conductores]);

  function setMatricula(value) {
    vehiculoDirtyRef.current = true;
    setVehiculoEdit((prev) => ({ ...prev, matricula: value }));
  }

  function setRemolque(value) {
    vehiculoDirtyRef.current = true;
    setVehiculoEdit((prev) => ({ ...prev, remolque: value }));
  }

  const vehiculoPreview = useMemo(
    () => ({
      matricula: String(vehiculoEdit.matricula ?? "").trim() || null,
      remolque: String(vehiculoEdit.remolque ?? "").trim() || null,
      tipoVehiculo: conductorVehiculo.tipoVehiculo,
    }),
    [vehiculoEdit, conductorVehiculo.tipoVehiculo],
  );

  return {
    vehiculoEdit,
    setMatricula,
    setRemolque,
    tipoVehiculo: conductorVehiculo.tipoVehiculo,
    vehiculoPreview,
  };
}
