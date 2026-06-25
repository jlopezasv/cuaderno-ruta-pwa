import { useState } from "react";
import { saveManualConductorLocation } from "../../../domain/location/conductorManualLocation.js";

const UI = {
  card: "#FFFFFF",
  line: "#E2E8F0",
  tx: "#0F172A",
  su: "#64748B",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
};

export function ConductorManualLocationCard({ uid, showToast }) {
  const [loading, setLoading] = useState(false);

  async function handleUpdate() {
    if (!uid || loading) return;
    setLoading(true);
    try {
      const result = await saveManualConductorLocation(uid);
      if (result.ok) {
        showToast?.("Ubicación actualizada correctamente.");
        return;
      }
      if (result.code === "gps_permission") {
        showToast?.("No se pudo obtener la ubicación. Revisa permisos GPS.");
        return;
      }
      showToast?.("No se pudo guardar la ubicación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: UI.card,
        border: `1px solid ${UI.line}`,
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 2px 8px rgba(15,23,42,.04)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>📍 Actualizar ubicación</div>
      <div style={{ fontSize: 12, color: UI.su, lineHeight: 1.45, marginBottom: 12 }}>
        Guarda tu posición actual para que tráfico vea tu última ubicación conocida.
      </div>
      <button
        type="button"
        onClick={handleUpdate}
        disabled={!uid || loading}
        style={{
          width: "100%",
          background: loading ? "#94a3b8" : UI.accent,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 14,
          fontWeight: 800,
          cursor: !uid || loading ? "default" : "pointer",
        }}
      >
        {loading ? "Obteniendo ubicación…" : "Actualizar ubicación"}
      </button>
    </div>
  );
}
