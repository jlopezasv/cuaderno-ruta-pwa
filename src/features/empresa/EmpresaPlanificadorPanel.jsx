import { useState } from "react";
import { PLANIFICADOR_MAP_LAYOUT_CSS } from "./planificadorMapLayout.css.js";
import { PlanificadorMapaBeta } from "./PlanificadorMapaBeta.jsx";

/**
 * Planificador empresa — planificación de ruta + mapa operativo.
 */
export function EmpresaPlanificadorPanel({
  dark = false,
  routePlanner,
  mapProps = {},
}) {
  const [subTab, setSubTab] = useState("mapa");
  const card = dark ? "#1E293B" : "#FFFFFF";
  const tx = dark ? "#F1F5F9" : "#0F172A";
  const border = dark ? "#334155" : "#DBE4EE";

  const tabBtn = (id, label) => {
    const active = subTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setSubTab(id)}
        className="planificador-panel__tab-btn"
        style={{
          flex: 1,
          background: active ? (dark ? "#1e3a5f" : "#eff6ff") : "transparent",
          border: `1px solid ${active ? "#93c5fd" : border}`,
          borderRadius: 10,
          padding: "6px 8px",
          fontSize: 11,
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
    <div className="planificador-panel-outer">
      <style>{PLANIFICADOR_MAP_LAYOUT_CSS}</style>
      <div className="planificador-panel__tabs" style={{ padding: "4px 6px 0" }}>
        <div
          className="planificador-panel__tabs-row"
          style={{ display: "flex", gap: 6, marginBottom: 4 }}
        >
          {tabBtn("mapa", "◎ Mapa operativo")}
          {tabBtn("ruta", "Planificación ruta")}
        </div>
      </div>

      {subTab === "mapa" ? (
        <div
          className="planificador-panel__body"
          style={{
            padding: "0 6px 4px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            className="planificador-panel__card"
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 10,
              padding: "4px 6px 4px",
              boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,.05)",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div className="planificador-panel__title" style={{ color: tx }}>
              Mapa operativo
            </div>
            <PlanificadorMapaBeta dark={dark} compactLayout {...mapProps} />
          </div>
        </div>
      ) : (
        routePlanner
      )}
    </div>
  );
}
