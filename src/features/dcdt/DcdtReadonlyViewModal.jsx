import { buildDcdtReadonlySections } from "../../domain/dcdt/dcdtReadonlyViewModel.js";
import { DECA_FULL_TITLE, DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";
import { DcdtReadonlyContent } from "./DcdtReadonlyContent.jsx";

const UI = {
  overlay: "rgba(15,23,42,.45)",
  surface: "#ffffff",
  soft: "#f8fafc",
  border: "#dbe4ee",
  tx: "#0f172a",
  su: "#64748b",
};

export function DcdtReadonlyViewModal({ servicio, doc, dcdt, missing = [], onClose }) {
  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";
  const sectionsModel = buildDcdtReadonlySections({ doc, dcdt, servicioReferencia: serviceLabel });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: UI.overlay,
        zIndex: 550,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.surface,
          borderRadius: 16,
          width: "min(96vw, 640px)",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${UI.border}`,
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${UI.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: UI.tx }}>{DECA_SHORT_LABEL}</div>
          <div style={{ fontSize: 11, color: UI.su, marginTop: 4, lineHeight: 1.35 }}>{DECA_FULL_TITLE}</div>
          <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
            {sectionsModel.referencia || serviceLabel} · {sectionsModel.estadoLabel || "—"}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
          <DcdtReadonlyContent sectionsModel={sectionsModel} missing={missing} variant="modal" />
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${UI.border}`, background: UI.soft }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              background: "#f1f5f9",
              color: UI.tx,
              border: `1px solid ${UI.border}`,
              borderRadius: 12,
              padding: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
