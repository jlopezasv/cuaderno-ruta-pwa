import React, { useState } from "react";
import { ServiceEmpresaDocumentsBlock } from "./ServiceEmpresaDocumentsBlock.jsx";
import { ServiceExtraDocumentsBlock } from "./ServiceExtraDocumentsBlock.jsx";

const PAGE = "#F8FAFC";
const UI = {
  tx: "#0F172A",
  su: "#64748B",
  line: "#E2E8F0",
  green: "#15803d",
};

export function ConductorMasServicioTab({
  servicio,
  loading,
  showToast,
  conductorNombre = "Conductor",
  onBackToTripPicker,
  showTripBack = false,
}) {
  const [openAddVersion, setOpenAddVersion] = useState(0);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: UI.su, fontSize: 13, background: PAGE, minHeight: "60vh" }}>
        Cargando…
      </div>
    );
  }

  if (!servicio) {
    return (
      <div style={{ padding: "28px 16px 88px", background: PAGE, minHeight: "60vh" }}>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${UI.line}`,
            borderRadius: 16,
            padding: "24px 18px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginBottom: 6 }}>Sin servicio activo</div>
          <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.5 }}>Cuando tengas un servicio asignado, aquí verás sus documentos.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 14px 88px", background: PAGE, minHeight: "60vh", display: "flex", flexDirection: "column", gap: 12 }}>
      {showTripBack ? (
        <button
          type="button"
          onClick={onBackToTripPicker}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            border: "none",
            color: "#f59e0b",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            padding: "4px 0",
          }}
        >
          ← Cambiar viaje
        </button>
      ) : null}

      <ServiceEmpresaDocumentsBlock servicio={servicio} showToast={showToast} role="conductor" tone="light" compact />

      <button
        type="button"
        onClick={() => setOpenAddVersion((v) => v + 1)}
        style={{
          width: "100%",
          background: UI.green,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "14px 12px",
          fontSize: 15,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        + Añadir foto o documento
      </button>

      <ServiceExtraDocumentsBlock
        servicio={servicio}
        showToast={showToast}
        uploaderName={conductorNombre}
        tone="light"
        compact
        hideInlineAdd
        openAddRequestVersion={openAddVersion}
      />
    </div>
  );
}
