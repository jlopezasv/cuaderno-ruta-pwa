import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildDcdtVerifyUrl } from "../../domain/dcdt/dcdtVerifyToken.js";

const UI = {
  overlay: "rgba(15,23,42,.5)",
  surface: "#ffffff",
  tx: "#0f172a",
  su: "#64748b",
  border: "#dbe4ee",
};

export function DcdtQrModal({ token, numeroDcdt, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const verifyUrl = buildDcdtVerifyUrl(token);

  useEffect(() => {
    if (!verifyUrl) return;
    QRCode.toDataURL(verifyUrl, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [verifyUrl]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: UI.overlay,
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.surface,
          borderRadius: 18,
          padding: "22px 20px",
          maxWidth: 360,
          width: "100%",
          border: `1px solid ${UI.border}`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx }}>QR de verificación</div>
        <div style={{ fontSize: 12, color: UI.su, marginTop: 6, lineHeight: 1.45 }}>
          DCDT {numeroDcdt || ""} · Válido para inspección
        </div>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Código QR verificación DCDT"
            style={{ width: 280, height: 280, margin: "18px auto 8px", display: "block", borderRadius: 8 }}
          />
        ) : (
          <div style={{ padding: "40px 0", color: UI.su }}>Generando QR…</div>
        )}
        <div style={{ fontSize: 11, color: UI.su, lineHeight: 1.5, marginBottom: 16 }}>
          La autoridad puede escanear este código para ver los datos del documento en modo solo lectura.
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            background: "#f1f5f9",
            color: UI.tx,
            border: `1px solid ${UI.border}`,
            borderRadius: 12,
            padding: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
