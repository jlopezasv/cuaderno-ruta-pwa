import { useEffect, useRef, useState } from "react";
import { SignaturePad } from "./ExpedienteClosureBlock.jsx";
import { DRIVER_UI } from "./ActiveServicePanel.jsx";

/**
 * Firma obligatoria al completar una parada de descarga (prueba de entrega).
 * Reutiliza `SignaturePad` del cierre de expediente.
 */
export function DescargaEntregaFirmaModal({
  open,
  stopLabel = "Descarga",
  saving = false,
  onCancel,
  onConfirm,
}) {
  const firmaCanvasRef = useRef(null);
  const [hasFirma, setHasFirma] = useState(false);

  useEffect(() => {
    if (open) setHasFirma(false);
  }, [open, stopLabel]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        zIndex: 450,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={() => {
        if (!saving) onCancel?.();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="descarga-firma-title"
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "20px 18px",
          maxWidth: 420,
          width: "100%",
          border: `1px solid ${DRIVER_UI.line}`,
          boxShadow: "0 12px 40px rgba(15,23,42,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div id="descarga-firma-title" style={{ fontSize: 16, fontWeight: 800, color: DRIVER_UI.tx, marginBottom: 6 }}>
          Firma de entrega
        </div>
        <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.45, marginBottom: 14 }}>
          Confirma la entrega en <strong style={{ color: DRIVER_UI.tx }}>{stopLabel}</strong> con tu firma antes de
          completar esta descarga.
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: DRIVER_UI.su, letterSpacing: 0.5, marginBottom: 6 }}>
          FIRMA DEL CONDUCTOR
        </div>
        <SignaturePad canvasRef={firmaCanvasRef} onInkChange={setHasFirma} />

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => onCancel?.()}
            style={{
              flex: 1,
              background: DRIVER_UI.surfaceHi,
              border: `1px solid ${DRIVER_UI.line}`,
              borderRadius: 12,
              padding: "12px",
              fontWeight: 700,
              cursor: saving ? "default" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !hasFirma}
            onClick={() => onConfirm?.(firmaCanvasRef.current)}
            style={{
              flex: 1,
              background: hasFirma ? DRIVER_UI.green : "#94a3b8",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "12px",
              fontWeight: 800,
              cursor: saving || !hasFirma ? "default" : "pointer",
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saving ? "Guardando…" : "Firmar y completar"}
          </button>
        </div>
      </div>
    </div>
  );
}
