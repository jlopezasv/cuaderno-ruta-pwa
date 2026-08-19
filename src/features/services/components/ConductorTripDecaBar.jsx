import { useState } from "react";
import { DECA_SHORT_LABEL } from "../../../domain/dcdt/decaBranding.js";
import { isDecaAplicable } from "../../../domain/service/servicioAlcance.js";
import { getServiceNumberForDisplay } from "../../../domain/service/serviceIdentity.js";
import { useConductorDcdtQuickStatus } from "../hooks/useConductorDcdtQuickStatus.js";
import { DriverDcdtActionModal } from "./DriverDcdtActionModal.jsx";
import { DriverQuickActionsBar } from "./ServiceQuickActionsBar.jsx";

/**
 * Acceso DeCA del viaje en la lista de paradas (sin abrir una parada).
 */
export function ConductorTripDecaBar({
  servicio,
  empresa = null,
  conductorUid = null,
  stops = [],
  showToast,
  tripLabel = null,
}) {
  const [open, setOpen] = useState(false);
  const applicable = !!servicio?.empresa_id && isDecaAplicable(servicio);
  const dcdtQuick = useConductorDcdtQuickStatus({
    servicio: applicable ? servicio : null,
    empresa,
    conductorUid,
    stops,
    pollWhileIncomplete: applicable,
  });

  if (!applicable) return null;

  const label = tripLabel || getServiceNumberForDisplay(servicio) || "Viaje";

  return (
    <>
      <div
        style={{
          background: "#fff",
          border: "1px solid #dbe4ee",
          borderRadius: 14,
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.4, marginBottom: 8 }}>
          {DECA_SHORT_LABEL} · {label}
        </div>
        <DriverQuickActionsBar
          showDcdt
          dcdtVisual={dcdtQuick.visual}
          onDcdtClick={() => setOpen(true)}
        />
      </div>
      <DriverDcdtActionModal
        open={open}
        onClose={() => {
          setOpen(false);
          void dcdtQuick.reload();
        }}
        servicio={servicio}
        empresa={empresa}
        conductorUid={conductorUid}
        stops={stops}
        showToast={showToast}
      />
    </>
  );
}
