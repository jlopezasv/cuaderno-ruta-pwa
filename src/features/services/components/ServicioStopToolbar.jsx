import { CORPORATE_BTN } from "../servicioFormTheme.js";

const toolBtn = (disabled, variant = "default") => ({
  background: variant === "danger" ? CORPORATE_BTN.danger.bg : "#ffffff",
  color: variant === "danger" ? CORPORATE_BTN.danger.color : "#475569",
  border: `1px solid ${variant === "danger" ? CORPORATE_BTN.danger.border : "#cbd5e1"}`,
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.45 : 1,
  whiteSpace: "nowrap",
});

export function ServicioStopToolbar({ index, total, onMoveUp, onMoveDown, onRemove }) {
  const canUp = index > 0;
  const canDown = index < total - 1;
  const canRemove = total > 1;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <button type="button" disabled={!canUp} onClick={onMoveUp} style={toolBtn(!canUp)} title="Subir parada">
        ↑ Subir
      </button>
      <button type="button" disabled={!canDown} onClick={onMoveDown} style={toolBtn(!canDown)} title="Bajar parada">
        ↓ Bajar
      </button>
      {canRemove ? (
        <button type="button" onClick={onRemove} style={toolBtn(false, "danger")} title="Eliminar parada">
          ✕ Eliminar
        </button>
      ) : null}
    </div>
  );
}
