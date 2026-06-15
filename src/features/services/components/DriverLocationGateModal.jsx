const UI = {
  overlay: "rgba(15,23,42,.45)",
  surface: "#ffffff",
  border: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  amber: "#b45309",
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
          padding: "20px 18px",
          maxWidth: 400,
          width: "100%",
          border: `1px solid ${UI.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,.12)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginBottom: 8 }}>
          {isRequesting ? "Obteniendo ubicación…" : "No se pudo obtener ubicación."}
        </div>
        <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.5, marginBottom: 14 }}>
          {isRequesting
            ? `Solicitando permiso de ubicación para ${actionLabel}.`
            : "Puedes intentar de nuevo o continuar sin ubicación."}
        </div>
        {!isRequesting && error ? (
          <div
            style={{
              fontSize: 12,
              color: UI.amber,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 12,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        ) : null}
        {!isRequesting ? (
          <div style={{ fontSize: 11, color: UI.su, lineHeight: 1.45, marginBottom: 16 }}>
            Activa la ubicación para esta app o navegador en ajustes del móvil si el permiso está bloqueado.
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!isRequesting ? (
            <>
              <button
                type="button"
                onClick={onRetry}
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
                Intentar de nuevo
              </button>
              <button
                type="button"
                onClick={onContinue}
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
                Continuar sin ubicación
              </button>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  width: "100%",
                  padding: "10px",
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
              Espera un momento…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
