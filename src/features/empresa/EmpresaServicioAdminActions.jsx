const UI = Object.freeze({
  accent: "#2563eb",
  accentSoft: "#eff6ff",
  border: "#dbe4ee",
  mutedBg: "#f1f5f9",
  mutedTx: "#475569",
  tx: "#0f172a",
});

function adminBtnStyle(variant = "neutral") {
  const variants = {
    neutral: {
      background: "#ffffff",
      color: UI.accent,
      border: `1px solid ${UI.border}`,
    },
    primary: {
      background: UI.accentSoft,
      color: UI.accent,
      border: "1px solid #bfdbfe",
    },
    danger: {
      background: UI.mutedBg,
      color: UI.mutedTx,
      border: "1px solid #cbd5e1",
    },
  };
  return {
    width: "100%",
    minWidth: 0,
    minHeight: 34,
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.25,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    WebkitTapHighlightColor: "transparent",
    ...variants[variant],
  };
}

/**
 * Acciones administrativas agrupadas (modificar, conductor, anular) debajo de DeCA/CHAT.
 */
export function EmpresaServicioAdminActions({
  servicio,
  puedeEditarAdmin = false,
  onEditarServicio,
  onAsignarConductor,
  onAnular,
}) {
  const showEditar = puedeEditarAdmin && !!onEditarServicio;
  const showConductor = !!onAsignarConductor;
  const showAnular = servicio?.estado !== "anulado" && !!onAnular;

  if (!showEditar && !showConductor && !showAnular) return null;

  const stopCardToggle = (e) => {
    e.stopPropagation();
  };

  const conductorLabel = servicio?.conductor_id ? "Gestionar conductor" : "Asignar conductor";

  return (
    <div
      style={{ marginTop: 8 }}
      onClick={stopCardToggle}
      onKeyDown={stopCardToggle}
      role="presentation"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
          gap: 6,
          width: "100%",
        }}
      >
        {showEditar ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditarServicio();
            }}
            style={adminBtnStyle("neutral")}
          >
            Modificar servicio
          </button>
        ) : null}
        {showConductor ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAsignarConductor();
            }}
            style={adminBtnStyle("primary")}
          >
            {conductorLabel}
          </button>
        ) : null}
        {showAnular ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAnular();
            }}
            style={adminBtnStyle("danger")}
          >
            Anular servicio
          </button>
        ) : null}
      </div>
    </div>
  );
}
