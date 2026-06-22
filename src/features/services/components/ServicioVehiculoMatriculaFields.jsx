const LBL = { fontSize: 10, fontWeight: 700, marginBottom: 4, display: "block" };

export function ServicioVehiculoMatriculaFields({
  matricula = "",
  remolque = "",
  tipoVehiculo = "articulado",
  onMatriculaChange,
  onRemolqueChange,
  inputStyle = {},
  labelStyle = {},
  showRemolque = true,
}) {
  const rigido = String(tipoVehiculo || "").toLowerCase() === "rigido";
  const lbl = { ...LBL, ...labelStyle };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: rigido || !showRemolque ? "1fr" : "1fr 1fr",
        gap: 8,
        marginTop: 8,
      }}
    >
      <div>
        <label style={lbl}>Matrícula tractora</label>
        <input
          value={matricula}
          onChange={(e) => onMatriculaChange?.(e.target.value)}
          placeholder="Ej. 1234 ABC"
          style={inputStyle}
        />
      </div>
      {!rigido && showRemolque ? (
        <div>
          <label style={lbl}>Matrícula remolque</label>
          <input
            value={remolque}
            onChange={(e) => onRemolqueChange?.(e.target.value)}
            placeholder="Ej. R-5678 DEF"
            style={inputStyle}
          />
        </div>
      ) : null}
    </div>
  );
}
