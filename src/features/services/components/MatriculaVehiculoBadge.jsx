export function MatriculaVehiculoBadge({ matricula, remolque, tipoVehiculo = "articulado", compact = false }) {
  const rigido = String(tipoVehiculo || "").toLowerCase() === "rigido";
  const hasTractora = Boolean(String(matricula || "").trim());
  const hasRemolque = Boolean(String(remolque || "").trim());

  if (!hasTractora && !hasRemolque) return null;

  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: compact ? "4px 8px" : "6px 10px",
    fontSize: compact ? 10 : 11,
    color: "#334155",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    marginRight: 8,
    marginTop: compact ? 0 : 4,
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: compact ? 0 : 6 }}>
      {hasTractora ? (
        <span style={chip} title="Matrícula tractora">
          🚛 {matricula}
        </span>
      ) : (
        <span style={{ ...chip, color: "#b45309", borderColor: "#fed7aa", background: "#fffbeb" }} title="Sin matrícula tractora">
          🚛 Sin tractora
        </span>
      )}
      {!rigido ? (
        hasRemolque ? (
          <span style={chip} title="Matrícula remolque">
            🔗 {remolque}
          </span>
        ) : (
          <span style={{ ...chip, color: "#b45309", borderColor: "#fed7aa", background: "#fffbeb" }} title="Sin matrícula remolque">
            🔗 Sin remolque
          </span>
        )
      ) : null}
    </div>
  );
}
