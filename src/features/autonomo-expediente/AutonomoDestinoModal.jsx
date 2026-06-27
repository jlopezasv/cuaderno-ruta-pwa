import { useState } from "react";

const UI = { line: "#e2e8f0", tx: "#0f172a", su: "#64748b" };
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${UI.line}`,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 15,
  marginBottom: 8,
};

export function AutonomoDestinoModal({ open, onClose, onConfirm, busy = false }) {
  const [form, setForm] = useState({
    cliente: "",
    direccion: "",
    cp: "",
    ciudad: "",
    fecha: "",
  });

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13000,
        background: "rgba(15,23,42,.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: "16px 16px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 12 }}>Añadir destino</div>
        {[
          ["cliente", "Cliente / destinatario *"],
          ["direccion", "Dirección"],
          ["cp", "CP"],
          ["ciudad", "Ciudad"],
          ["fecha", "Fecha entrega (opcional)"],
        ].map(([k, label]) => (
          <label key={k} style={{ display: "block" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: UI.su }}>{label}</span>
            <input
              style={inputStyle}
              type={k === "fecha" ? "date" : "text"}
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={busy || !form.cliente.trim()}
          onClick={() => onConfirm?.({ ...form })}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "14px 12px",
            borderRadius: 12,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer",
            opacity: busy || !form.cliente.trim() ? 0.6 : 1,
          }}
        >
          Guardar destino
        </button>
      </div>
    </div>
  );
}
