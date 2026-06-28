import { DecaVivoPanel } from "../../dcdt/DecaVivoPanel.jsx";
import { DECA_SHORT_LABEL } from "../../../domain/dcdt/decaBranding.js";

const OVERLAY = {
  position: "fixed",
  inset: 0,
  zIndex: 12000,
  background: "rgba(15,23,42,.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 0,
};

export function DriverDcdtActionModal({
  open,
  onClose,
  servicio,
  empresa,
  conductorUid,
  stops,
  showToast,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${DECA_SHORT_LABEL} del servicio`}
      style={OVERLAY}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          width: "100%",
          maxWidth: 480,
          maxHeight: "min(92vh, 720px)",
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -8px 40px rgba(15,23,42,.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid #e2e8f0",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{DECA_SHORT_LABEL}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
              color: "#475569",
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "12px 16px 20px", flex: 1 }}>
          <DecaVivoPanel
            servicio={servicio}
            stops={stops}
            showToast={showToast}
            compact
          />
        </div>
      </div>
    </div>
  );
}
