import React, { useState } from "react";

const UI = {
  tx: "#0F172A",
  su: "#64748B",
  line: "#E2E8F0",
};

/**
 * Confirmación para quitar una parada concreta de la lista del conductor.
 */
export function ConductorDropStopAction({
  visible = false,
  stopLabel = "esta parada",
  onConfirm,
  showToast,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  async function handleConfirm() {
    if (!onConfirm || saving) return;
    setSaving(true);
    try {
      await onConfirm();
      showToast?.("Parada quitada de tu lista");
      setOpen(false);
    } catch (error) {
      showToast?.(error?.message || "No se pudo quitar la parada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #cbd5e1",
          background: "#f8fafc",
          color: "#475569",
          fontSize: 13,
          fontWeight: 700,
          cursor: saving || disabled ? "default" : "pointer",
          opacity: saving || disabled ? 0.7 : 1,
        }}
      >
        No voy a hacer esta parada
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.4)",
            zIndex: 420,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !saving && setOpen(false)}
        >
          <div
            role="dialog"
            style={{
              background: "#fff",
              borderRadius: 18,
              padding: "20px 18px",
              maxWidth: 400,
              width: "100%",
              border: `1px solid ${UI.line}`,
              boxShadow: "0 20px 50px rgba(15,23,42,.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginBottom: 8 }}>Quitar de mi lista</div>
            <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.45, marginBottom: 16 }}>
              ¿Confirmas que no harás <strong>{stopLabel}</strong>? La parada seguirá disponible para otros conductores.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  background: "#f1f5f9",
                  border: `1px solid ${UI.line}`,
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
                disabled={saving}
                onClick={() => void handleConfirm()}
                style={{
                  flex: 1,
                  background: "#475569",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 800,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.75 : 1,
                }}
              >
                {saving ? "Quitando…" : "Quitar de mi lista"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
