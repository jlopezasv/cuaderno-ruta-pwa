export function DecaVivoHistorialModal({ movimientos = [], versiones = [], labels = {}, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 760,
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
          maxWidth: 520,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Historial DeCA</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Trazabilidad completa — no se eliminan movimientos.
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>MOVIMIENTOS</div>
        {!movimientos.length ? (
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Sin movimientos registrados.</div>
        ) : (
          <ul style={{ margin: "0 0 16px", padding: 0, listStyle: "none" }}>
            {movimientos.map((m) => (
              <li
                key={m.id}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  padding: "10px 0",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {labels[m.tipo_movimiento] || m.tipo_movimiento} · {m.descripcion_mercancia}
                </div>
                <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                  {new Date(m.fecha_hora || m.created_at).toLocaleString("es-ES")}
                  {m.lugar_nombre ? ` · ${m.lugar_nombre}` : ""}
                </div>
                <div style={{ fontSize: 12, marginTop: 2 }}>
                  {m.cantidad != null ? `${m.cantidad} ${m.unidad || ""}` : ""}
                  {m.peso_kg != null ? ` · ${m.peso_kg} kg` : ""}
                  {m.destino_nombre ? ` → ${m.destino_nombre}` : ""}
                </div>
                {m.motivo_ajuste ? (
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>Motivo: {m.motivo_ajuste}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>VERSIONES ANTERIORES</div>
        {!versiones.length ? (
          <div style={{ fontSize: 13, color: "#64748b" }}>Sin versiones archivadas aún.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {versiones.map((v) => (
              <li key={v.id} style={{ borderBottom: "1px solid #e2e8f0", padding: "8px 0", fontSize: 12 }}>
                <strong>v{v.version}</strong>
                {" · "}
                {new Date(v.creado_en).toLocaleString("es-ES")}
                {v.motivo ? ` — ${v.motivo}` : ""}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
