import {
  getOfficeServiciosVistaOptions,
  OFFICE_SERVICIOS_VISTA,
  shouldShowOfficeServiciosVistaSelector,
} from "../../domain/empresa/officeUserFilters.js";
import { officeUserRoleLabel } from "../../domain/empresa/empresaOfficeUsers.js";

export function OfficeServiciosVistaSelector({
  officeUser,
  vista,
  onVistaChange,
  responsableFiltroId = "",
  onResponsableFiltroChange,
  officeResponsables = [],
  ui = {},
}) {
  if (!shouldShowOfficeServiciosVistaSelector(officeUser)) return null;

  const border = ui.border || "#dbe4ee";
  const surfaceSoft = ui.surfaceSoft || "#f8fafc";
  const tx = ui.tx || "#0f172a";
  const muted = ui.muted || "#64748b";
  const options = getOfficeServiciosVistaOptions(officeUser);
  const selectStyle = {
    flex: 1,
    minWidth: 0,
    background: surfaceSoft,
    border: `1px solid ${border}`,
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    color: tx,
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: muted, fontWeight: 700, marginBottom: 4, letterSpacing: 0.2 }}>
        VER
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select value={vista} onChange={(e) => onVistaChange(e.target.value)} style={selectStyle}>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {vista === OFFICE_SERVICIOS_VISTA.POR_RESPONSABLE && (
          <select
            value={responsableFiltroId}
            onChange={(e) => onResponsableFiltroChange?.(e.target.value)}
            style={{ ...selectStyle, flex: "1 1 180px" }}
          >
            <option value="">Elige responsable…</option>
            {officeResponsables.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.nombre || r.email || "Usuario"} · {officeUserRoleLabel(r.rol)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
