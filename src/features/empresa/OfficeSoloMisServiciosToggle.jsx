import { shouldShowSoloMisServiciosToggle } from "../../domain/empresa/officeUserFilters.js";

/** DEMO — tick «Ver solo mis servicios» (jefe_flota y tráfico con puede_ver_todos). */
export function OfficeSoloMisServiciosToggle({
  officeUser,
  checked = false,
  onChange,
  ui = {},
  variant = "card",
}) {
  if (!shouldShowSoloMisServiciosToggle(officeUser)) return null;

  const border = ui.border || "#dbe4ee";
  const surfaceSoft = ui.surfaceSoft || "#f8fafc";
  const tx = ui.tx || "#0f172a";
  const muted = ui.muted || "#64748b";
  const inline = variant === "inline";
  const statusLabel = checked ? "Solo mis servicios" : "Todos los servicios";

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: inline ? 6 : 8,
        marginBottom: inline ? 0 : 10,
        padding: inline ? "2px 0" : "8px 10px",
        background: inline ? "transparent" : surfaceSoft,
        border: inline ? "none" : `1px solid ${border}`,
        borderRadius: inline ? 0 : 10,
        cursor: "pointer",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: ui.accent || "#2563eb", cursor: "pointer", flexShrink: 0 }}
      />
      <span style={{ fontSize: inline ? 12 : 13, fontWeight: 600, color: tx, whiteSpace: "nowrap" }}>
        Ver solo mis servicios
      </span>
      <span
        style={{
          fontSize: 11,
          color: muted,
          fontWeight: 650,
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        {statusLabel}
        {!checked ? <span aria-hidden style={{ fontSize: 9, opacity: 0.75 }}>▼</span> : null}
      </span>
    </label>
  );
}
