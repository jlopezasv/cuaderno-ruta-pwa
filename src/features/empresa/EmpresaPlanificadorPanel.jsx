import { useState } from "react";
import { PlanificadorMapaBeta } from "./PlanificadorMapaBeta.jsx";

/**
 * Planificador empresa — planificación de ruta + mapa operativo beta.
 */
export function EmpresaPlanificadorPanel({
  dark = false,
  routePlanner,
  mapProps = {},
}) {
  const [subTab, setSubTab] = useState("mapa");
  const card = dark ? "#1E293B" : "#FFFFFF";
  const tx = dark ? "#F1F5F9" : "#0F172A";
  const su = dark ? "#94A3B8" : "#64748B";
  const border = dark ? "#334155" : "#DBE4EE";

  const tabBtn = (id, label) => {
    const active = subTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setSubTab(id)}
        style={{
          flex: 1,
          background: active ? (dark ? "#1e3a5f" : "#eff6ff") : "transparent",
          border: `1px solid ${active ? "#93c5fd" : border}`,
          borderRadius: 10,
          padding: "9px 10px",
          fontSize: 12,
          fontWeight: active ? 800 : 650,
          color: active ? (dark ? "#93c5fd" : "#1d4ed8") : tx,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {tabBtn("mapa", "◎ Mapa beta")}
          {tabBtn("ruta", "Planificación ruta")}
        </div>
      </div>

      {subTab === "mapa" ? (
        <div style={{ padding: "0 14px 84px" }}>
          <div
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 14,
              padding: "12px",
              boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,.05)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: tx, marginBottom: 2 }}>
              Mapa operativo (beta)
            </div>
            <div style={{ fontSize: 11, color: su, marginBottom: 12, lineHeight: 1.4 }}>
              Cargas sin conductor y conductores disponibles. No sustituye el listado ni la asignación
              actual.
            </div>
            <PlanificadorMapaBeta dark={dark} {...mapProps} />
          </div>
        </div>
      ) : (
        routePlanner
      )}
    </>
  );
}
