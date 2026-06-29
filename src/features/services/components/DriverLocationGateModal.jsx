const UI = {
  overlay: "rgba(15,23,42,.45)",
  surface: "#ffffff",
  border: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  blue: "#2563eb",
};

/**
 * Modal cuando falla la ubicación: reintentar o continuar sin GPS.
 */
export function DriverLocationGateModal({
  open,
  phase = "failed",
  actionLabel = "esta acción",
  error = "",
  onRetry,
  onContinue,
  onCancel,
}) {
  if (!open) return null;

  const isRequesting = phase === "requesting";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: UI.overlay,
        zIndex: 450,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={() => !isRequesting && onCancel?.()}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.surface,
          borderRadius: 16,
          padding: "18px 16px",
          maxWidth: 360,
          width: "100%",
          border: `1px solid ${UI.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,.12)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginBottom: 8 }}>
          {isRequesting ? "Ubicación…" : "Sin ubicación"}
        </div>
        {!isRequesting ? (
          <div style={{ fontSize: 13, color: UI.su, marginBottom: 14 }}>
            Puedes continuar sin GPS.
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!isRequesting ? (
            <>
              <button
                type="button"
                onClick={onContinue}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  border: "none",
                  background: UI.blue,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Continuar sin ubicación
              </button>
              <button
                type="button"
                onClick={onRetry}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  border: `1px solid ${UI.border}`,
                  background: "#f8fafc",
                  color: UI.tx,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "none",
                  background: "transparent",
                  color: UI.su,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: UI.su, textAlign: "center", padding: "8px 0" }}>
              Espera…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
