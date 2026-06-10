import { canPickOfficeServicioResponsable } from "../../domain/empresa/officeUserFilters.js";
import { officeUserRoleLabel } from "../../domain/empresa/empresaOfficeUsers.js";

/** Campo Responsable del servicio (crear/editar). */
export function OfficeResponsableServicioField({
  officeUser = null,
  officeResponsables = [],
  value = "",
  onChange,
  lblStyle,
  fieldStyle,
  surfaceSoft = "#f8fafc",
  border = "#dbe4ee",
}) {
  const labelStyle = lblStyle || {
    fontSize: 10,
    color: "#64748B",
    fontWeight: 700,
    marginBottom: 2,
    letterSpacing: 0.2,
  };
  const inputStyle = fieldStyle || {
    width: "100%",
    background: surfaceSoft,
    border: `1px solid ${border}`,
    borderRadius: 9,
    padding: "7px 9px",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 0,
  };

  if (!officeResponsables.length) {
    return (
      <div>
        <div style={labelStyle}>Responsable del servicio</div>
        <div
          style={{
            ...inputStyle,
            color: "#b91c1c",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          No hay responsables activos (jefe de flota o tráfico)
        </div>
      </div>
    );
  }

  const canPick = canPickOfficeServicioResponsable(officeUser);
  const selected = officeResponsables.find((r) => r.userId === value);

  return (
    <div>
      <div style={labelStyle}>Responsable del servicio</div>
      {canPick ? (
        <select value={value} onChange={(e) => onChange?.(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          {officeUser?.rol === "jefe_flota" ? <option value="">Sin responsable</option> : null}
          {officeResponsables.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.nombre || r.email || "Usuario"} · {officeUserRoleLabel(r.rol)}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ ...inputStyle, fontWeight: 650, cursor: "default" }}>
          {selected?.nombre || selected?.email || "Tú"}
        </div>
      )}
    </div>
  );
}
