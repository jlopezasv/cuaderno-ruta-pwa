const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  blue: "#2563eb",
};

export function AutonomoPostEntregaModal({
  open,
  onClose,
  destinoNombre,
  busy = false,
  onRetorno,
  onPod,
  onFinalizar,
  onSeguir,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13500,
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
          background: UI.card,
          borderRadius: "16px 16px 0 0",
          padding: "16px 16px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>Descarga completada</div>
        <div style={{ fontSize: 13, color: UI.su, marginBottom: 16, lineHeight: 1.45 }}>
          {destinoNombre ? `${destinoNombre} · ` : ""}¿Tienes retorno o nueva carga?
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRetorno?.()}
            style={btn(UI.green)}
          >
            Registrar retorno / nueva carga
          </button>
          <button type="button" disabled={busy} onClick={() => onPod?.()} style={btn(UI.blue)}>
            Añadir POD / albarán (opcional)
          </button>
          <button type="button" disabled={busy} onClick={() => onFinalizar?.()} style={btnOutline()}>
            Finalizar expediente
          </button>
          <button type="button" disabled={busy} onClick={() => onSeguir?.()} style={btnOutline()}>
            Seguir trabajando
          </button>
        </div>      </div>
    </div>
  );
}

function btn(bg) {
  return {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 12,
    border: "none",
    background: bg,
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  };
}

function btnOutline() {
  return {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 12,
    border: `1px solid ${UI.line}`,
    background: "#fff",
    color: UI.tx,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };
}
