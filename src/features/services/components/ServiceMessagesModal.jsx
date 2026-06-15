import { ServiceMessagesPanel } from "../../messages/ServiceMessagesPanel.jsx";

const OVERLAY = {
  position: "fixed",
  inset: 0,
  zIndex: 12000,
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
};

export function ServiceMessagesModal({
  open,
  onClose,
  servicio,
  senderName,
  senderRole = "conductor",
  showToast,
}) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Chat del servicio" style={OVERLAY}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          paddingTop: "max(12px, env(safe-area-inset-top))",
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", letterSpacing: 0.3 }}>
          CHAT DEL SERVICIO
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "#f1f5f9",
            border: "none",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 700,
            color: "#475569",
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </header>
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "12px 16px",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <ServiceMessagesPanel
          servicio={servicio}
          audience="conductor"
          senderName={senderName}
          senderRole={senderRole}
          showToast={showToast}
          modalLayout
        />
      </div>
    </div>
  );
}
