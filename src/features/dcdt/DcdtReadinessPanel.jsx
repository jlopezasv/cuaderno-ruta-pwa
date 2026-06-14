import { useMemo } from "react";
import {
  assessDcdtFormReadiness,
  dcdtStatusIcon,
  dcdtStatusLabel,
} from "../../domain/dcdt/dcdtFormReadiness.js";
import { SERVICIO_FORM_TONES } from "../services/servicioFormTheme.js";
import { MatriculaVehiculoBadge } from "../services/components/MatriculaVehiculoBadge.jsx";

const tone = SERVICIO_FORM_TONES.dcdt;

function checklistRow(item) {
  const icon = dcdtStatusIcon(item.status);
  const label = dcdtStatusLabel(item.status);
  const color =
    item.status === "completo" ? "#15803d" : item.status === "parcial" ? "#b45309" : "#b91c1c";

  return (
    <div
      key={item.label}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        background: "#ffffff",
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        minHeight: 40,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1.2, flexShrink: 0 }} aria-hidden>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{item.label}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color, marginTop: 2, textTransform: "capitalize" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export function DcdtReadinessPanel({
  stops = [],
  mercancia = {},
  partesCatalog = [],
  fechaInicio = null,
  matricula = null,
  remolque = null,
  tipoVehiculo = "articulado",
}) {
  const partesById = useMemo(() => {
    const map = {};
    for (const p of partesCatalog || []) {
      if (p?.id) map[p.id] = p;
    }
    return map;
  }, [partesCatalog]);

  const readiness = useMemo(
    () =>
      assessDcdtFormReadiness({
        stops,
        mercancia,
        partesById,
        fechaInicio,
        matricula,
        remolque,
        tipoVehiculo,
      }),
    [stops, mercancia, partesById, fechaInicio, matricula, remolque, tipoVehiculo],
  );

  return (
    <div
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: 14,
        padding: "14px 16px",
        background: tone.bg,
        marginTop: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: tone.header, marginBottom: 4 }}>📄 DCDT — preparación</div>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            🟢 {readiness.completeCount} completos · 🟠 {readiness.partialCount} parciales · 🔴{" "}
            {readiness.totalCount - readiness.completeCount - readiness.partialCount} pendientes
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>No bloquea guardar el servicio</div>
        </div>
        <MatriculaVehiculoBadge
          matricula={matricula}
          remolque={remolque}
          tipoVehiculo={tipoVehiculo}
          compact
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        {readiness.items.map(checklistRow)}
      </div>
    </div>
  );
}
