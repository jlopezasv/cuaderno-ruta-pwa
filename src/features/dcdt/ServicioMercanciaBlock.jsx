import { SERVICIO_FORM_TONES } from "../services/servicioFormTheme.js";

const tone = SERVICIO_FORM_TONES.mercancia;

export function ServicioMercanciaBlock({ value, onChange, themeKey = "empresa" }) {
  const dark = themeKey === "dark";
  const m = value || {};
  const inp = {
    width: "100%",
    background: dark ? "#0f172a" : "#ffffff",
    border: `1px solid ${tone.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: dark ? "#f1f5f9" : "#0f172a",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 6,
  };
  const lbl = { fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 2 };

  function set(field, val) {
    onChange?.({ ...m, [field]: val });
  }

  return (
    <div
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: 14,
        padding: "14px 16px",
        background: tone.bg,
        marginTop: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: tone.header, marginBottom: 6 }}>📋 Mercancía</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.4 }}>
        Opcional al crear el servicio. Tráfico puede completar manualmente o desde OCR CMR/albarán.
      </div>
      <div style={lbl}>Naturaleza de la mercancía</div>
      <input
        value={m.descripcion || ""}
        onChange={(e) => set("descripcion", e.target.value)}
        placeholder="Ej. Palets hortícola, bobinas, ADR…"
        style={inp}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        <div>
          <div style={lbl}>Palets</div>
          <input value={m.palets ?? ""} onChange={(e) => set("palets", e.target.value)} placeholder="—" style={{ ...inp, marginBottom: 0 }} />
        </div>
        <div>
          <div style={lbl}>Bultos</div>
          <input value={m.bultos ?? ""} onChange={(e) => set("bultos", e.target.value)} placeholder="—" style={{ ...inp, marginBottom: 0 }} />
        </div>
        <div>
          <div style={lbl}>Peso kg</div>
          <input value={m.peso_kg ?? ""} onChange={(e) => set("peso_kg", e.target.value)} placeholder="—" style={{ ...inp, marginBottom: 0 }} />
        </div>
      </div>
    </div>
  );
}
