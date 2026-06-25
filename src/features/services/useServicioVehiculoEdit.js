import { useState, useEffect, useRef, useMemo } from "react";
import { fetchConductorVehiculoForDcdt } from "../../domain/empresa/conductorVehiculoEmpresa.js";
import { fetchDcdtByServicio } from "../../domain/dcdt/dcdtModel.js";
import {
  pickVehiculoStr,
  resolveEffectiveServicioVehiculo,
  vehiculoOverridesFromDcdtDatos,
} from "../../domain/service/servicioVehiculoMatriculas.js";
import { resolveConductorVehiculo } from "./servicioFormTheme.js";

/** Matrícula/remolque editables en formulario de servicio; rellena desde DeCA, flota y conductor. */
export function useServicioVehiculoEdit({
  conductorId,
  conductores = [],
  empresaId = null,
  servicioId = null,
}) {
  const [vehiculoEdit, setVehiculoEdit] = useState({ matricula: "", remolque: "" });
  const vehiculoDirtyRef = useRef(false);
  const servicioInitRef = useRef(null);

  const conductorVehiculo = useMemo(
    () => resolveConductorVehiculo(conductores, conductorId),
    [conductores, conductorId],
  );

  useEffect(() => {
    if (servicioId && servicioInitRef.current !== servicioId) {
      servicioInitRef.current = servicioId;
      vehiculoDirtyRef.current = false;
    }
  }, [servicioId]);

  useEffect(() => {
    if (!conductorId) {
      vehiculoDirtyRef.current = false;
      setVehiculoEdit({ matricula: "", remolque: "" });
      return;
    }

    if (!vehiculoDirtyRef.current) {
      const fromFlota = resolveConductorVehiculo(conductores, conductorId);
      setVehiculoEdit({
        matricula: fromFlota.matricula,
        remolque: fromFlota.remolque,
      });
    }

    let cancelled = false;
    (async () => {
      try {
        const [conductorRow, dcdt] = await Promise.all([
          fetchConductorVehiculoForDcdt(conductorId, empresaId),
          servicioId ? fetchDcdtByServicio(servicioId).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled || vehiculoDirtyRef.current) return;

        const fromFlota = resolveConductorVehiculo(conductores, conductorId);
        const conductorMerged = {
          matricula: pickVehiculoStr(conductorRow?.matricula, fromFlota.matricula),
          remolque: pickVehiculoStr(conductorRow?.remolque, fromFlota.remolque),
          tipo_vehiculo: conductorRow?.tipo_vehiculo || fromFlota.tipoVehiculo,
        };

        const overrides = vehiculoOverridesFromDcdtDatos(dcdt?.datos?.vehiculo);
        const effective = resolveEffectiveServicioVehiculo({
          ...overrides,
          conductor: conductorMerged,
        });

        setVehiculoEdit({
          matricula: effective.matricula,
          remolque: effective.remolque,
        });
      } catch {
        /* perfil/flota opcional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conductorId, empresaId, conductores, servicioId]);

  function setMatricula(value) {
    vehiculoDirtyRef.current = true;
    setVehiculoEdit((prev) => ({ ...prev, matricula: value }));
  }

  function setRemolque(value) {
    vehiculoDirtyRef.current = true;
    setVehiculoEdit((prev) => ({ ...prev, remolque: value }));
  }

  const tipoVehiculo = useMemo(() => {
    const fromList = conductorVehiculo.tipoVehiculo;
    return String(fromList || "articulado").trim() || "articulado";
  }, [conductorVehiculo.tipoVehiculo]);

  const vehiculoPreview = useMemo(
    () => ({
      matricula: String(vehiculoEdit.matricula ?? "").trim() || null,
      remolque: String(vehiculoEdit.remolque ?? "").trim() || null,
      tipoVehiculo,
    }),
    [vehiculoEdit, tipoVehiculo],
  );

  return {
    vehiculoEdit,
    setMatricula,
    setRemolque,
    tipoVehiculo,
    vehiculoPreview,
  };
}
