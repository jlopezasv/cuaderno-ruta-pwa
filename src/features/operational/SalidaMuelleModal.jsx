export function SalidaMuelleModal({ open, operacion, busy, onClose, onConfirm }) {
  if (!open || !operacion) return null;

  const movs = operacion.movimientos || [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 830,
        background: "rgba(15,23,42,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          width: "100%",
          maxWidth: 420,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Salida de muelle</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>{operacion.lugar_nombre}</div>

        {!movs.length ? (
          <p style={{ fontSize: 13, color: "#64748b" }}>No hay movimientos registrados. Se cerrará como operación sin cambios de mercancía.</p>
        ) : (
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13 }}>
            {movs.map((m) => (
              <li key={m.id} style={{ marginBottom: 6 }}>
                <strong>{m.tipo}</strong>: {m.descripcion_mercancia}
                {m.cantidad != null ? ` · ${m.cantidad} ${m.unidad || ""}` : ""}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm({ sin_cambios: !movs.length })}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "none",
            background: "#0f766e",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          {busy ? "Cerrando…" : "Confirmar salida de muelle"}
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
          Seguir editando
        </button>
      </div>
    </div>
  );
}
