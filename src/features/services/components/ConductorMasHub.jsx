import React from "react";

const UI = {
  page: "#F8FAFC",
  card: "#FFFFFF",
  line: "#E2E8F0",
  tx: "#0F172A",
  su: "#64748B",
  accent: "#F59E0B",
};

const HUB_ITEMS = [
  { id: "servicio", icon: "🚛", label: "Servicio", hint: "DeCA · Chat · Cliente · documentos" },
  { id: "hoy", icon: "◷", label: "Hoy", hint: "Jornada y tacógrafo" },
  { id: "resumen", icon: "▤", label: "Resumen", hint: "Actividad · IA · Historial" },
  { id: "ruta", icon: "◎", label: "Ruta", hint: "Mapa y navegación" },
  { id: "docs", icon: "▥", label: "Documentos", hint: "Expedientes · gastos · km" },
  { id: "perfil", icon: "◉", label: "Perfil", hint: "Datos y equipo" },
];

export function ConductorMasHub({ onSelect }) {
  return (
    <div style={{ padding: "16px 14px 88px", background: UI.page, minHeight: "70vh" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 1.2, marginBottom: 14 }}>MÁS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {HUB_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item.id)}
            style={{
              width: "100%",
              textAlign: "left",
              background: UI.card,
              border: `1px solid ${UI.line}`,
              borderRadius: 14,
              padding: "14px 16px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 14,
              boxShadow: "0 2px 8px rgba(15,23,42,.04)",
            }}
          >
            <span style={{ fontSize: 22, width: 32, textAlign: "center" }}>{item.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: UI.tx }}>{item.label}</div>
              <div style={{ fontSize: 12, color: UI.su, marginTop: 3, lineHeight: 1.35 }}>{item.hint}</div>
            </span>
            <span style={{ color: UI.accent, fontSize: 18, fontWeight: 700 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConductorMasBackBar({ title, onBack }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "#FFFFFF",
        borderBottom: `1px solid ${UI.line}`,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: UI.accent,
          fontSize: 15,
          fontWeight: 800,
          cursor: "pointer",
          padding: "6px 4px",
        }}
      >
        ← Más
      </button>
      <span style={{ fontSize: 14, fontWeight: 800, color: UI.tx }}>{title}</span>
    </div>
  );
}
