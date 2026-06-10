import { isDemoApp } from "../../config/appEnvironment.js";

/** Aviso grande en demo: función completa solo en producción. */
export function DemoProductionOnlyBanner({ message }) {
  if (!isDemoApp() || !message) return null;
  return (
    <div
      style={{
        padding: "22px 24px",
        marginBottom: 18,
        background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
        border: "2px solid #60a5fa",
        borderRadius: 14,
        textAlign: "center",
        boxShadow: "0 4px 14px rgba(37, 99, 235, 0.12)",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a8a", lineHeight: 1.4, letterSpacing: 0.2 }}>
        {message}
      </div>
    </div>
  );
}
