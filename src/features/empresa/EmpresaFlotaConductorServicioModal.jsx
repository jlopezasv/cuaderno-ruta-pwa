import { useMemo } from "react";
import { EmpresaFlotaServicioCard } from "./EmpresaFlotaServicioCard.jsx";
import {
  getAttentionReason,
  needsAttention,
} from "../../domain/service/serviceAttention.js";
import { getLastServiceActivity } from "../../domain/service/serviceActivity.js";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../domain/service/serviceOperationalStatus.js";
import { officeResponsableServicioLine } from "../../domain/empresa/empresaOfficeUsers.js";
import { conductorUidOperativoServicio } from "../../domain/fleet/operationalPlaceholderConductor.js";

function evidenciasForServicioStops(servicioId, flotaStops, flotaEvs) {
  const stops = flotaStops[servicioId] || [];
  const o = {};
  for (const st of stops) {
    if (flotaEvs[st.id]) o[st.id] = flotaEvs[st.id];
  }
  return o;
}

export function EmpresaFlotaConductorServicioModal({
  open,
  onClose,
  conductorNombre,
  servicio,
  flotaStops,
  flotaEvs,
  nowMs,
  ubicInfo,
  ubicRefresh,
  normaC,
  conductor,
  nombreConductor,
  nombreResponsable,
  asignadosCount = 1,
  asignadosNombresStr = "",
  onRefreshUbicacion,
  onAnular,
  onAsignarConductor,
  onEditarServicio,
  onDcdt,
  empresaNombre,
  empresaUserId,
  showToast,
  fmtDur,
  ui,
}) {
  const stops = servicio?.id ? flotaStops[servicio.id] || [] : [];

  const rowMeta = useMemo(() => {
    if (!servicio?.id) return null;
    const evs = evidenciasForServicioStops(servicio.id, flotaStops, flotaEvs);
    const lastActivity = getLastServiceActivity({
      service: servicio,
      stops,
      evidencias: evs,
    });
    const attention = needsAttention({
      service: servicio,
      stops,
      evidencias: evs,
      lastActivity,
    });
    return {
      operationalMeta:
        OPERATIONAL_STATUS_META[
          getOperationalStatus({ service: servicio, stops, evidencias: evs })
        ],
      lastActivity,
      attention,
      attentionReason: attention
        ? getAttentionReason({ service: servicio, stops, evidencias: evs, lastActivity })
        : "",
    };
  }, [servicio, stops, flotaStops, flotaEvs]);

  if (!open || !servicio) return null;

  const responsableLine = officeResponsableServicioLine(servicio, (uid) =>
    nombreResponsable?.(uid),
  );
  const nombreCond =
    nombreConductor?.(conductorUidOperativoServicio(servicio)) ||
    conductorNombre ||
    "Conductor";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Servicio activo del conductor"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 420,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: ui?.surface || "#fff",
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(92vh, 900px)",
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -8px 40px rgba(15,23,42,.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderBottom: `1px solid ${ui?.border || "#dbe4ee"}`,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.8,
                color: ui?.muted || "#64748b",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Servicio · {conductorNombre || nombreCond}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 750,
                color: ui?.tx || "#0f172a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {servicio.referencia || "Servicio activo"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: ui?.surfaceSoft || "#f1f5f9",
              border: `1px solid ${ui?.border || "#dbe4ee"}`,
              borderRadius: 9,
              width: 34,
              height: 34,
              fontSize: 18,
              fontWeight: 800,
              color: ui?.subtle || "#475569",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div style={{ overflow: "auto", padding: "10px 12px 20px", flex: 1 }}>
          <EmpresaFlotaServicioCard
            servicio={servicio}
            stops={stops}
            flotaEvs={flotaEvs}
            flotaStopsMap={flotaStops}
            expanded
            onToggleExpand={() => {}}
            nowMs={nowMs}
            ubicInfo={ubicInfo}
            ubicRefresh={ubicRefresh}
            normaC={normaC}
            conductor={conductor}
            nombreConductor={nombreCond}
            responsableLine={responsableLine}
            operationalMeta={rowMeta?.operationalMeta}
            lastActivity={rowMeta?.lastActivity}
            attention={rowMeta?.attention}
            attentionReason={rowMeta?.attentionReason}
            onRefreshUbicacion={onRefreshUbicacion}
            onAnular={onAnular}
            onAsignarConductor={onAsignarConductor}
            onEditarServicio={onEditarServicio}
            onDcdt={onDcdt}
            asignadosCount={asignadosCount}
            asignadosNombresStr={asignadosNombresStr}
            empresaNombre={empresaNombre}
            empresaUserId={empresaUserId}
            showToast={showToast}
            fmtDur={fmtDur}
            tx={ui?.tx}
            su={ui?.muted}
          />
        </div>
      </div>
    </div>
  );
}
