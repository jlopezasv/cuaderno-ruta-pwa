import { useState } from "react";

export function AnularExpedienteModal({ open, busy, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 840,
        background: "rgba(15,23,42,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!motivo.trim()) return;
          onConfirm(motivo.trim());
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Anular expediente</div>
        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, margin: "0 0 14px" }}>
          Este expediente dejará de estar activo. Si ya tenía movimientos, quedará guardado como anulado para
          trazabilidad.
        </p>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Motivo *</label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          required
          placeholder="Ej. iniciado por error"
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid #dbe4ee",
            borderRadius: 10,
            padding: 10,
            fontSize: 14,
            marginBottom: 12,
            resize: "vertical",
          }}
        />
        <button
          type="submit"
          disabled={busy || !motivo.trim()}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#b91c1c",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          {busy ? "Anulando…" : "Anular expediente"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </form>
    </div>
  );
}
