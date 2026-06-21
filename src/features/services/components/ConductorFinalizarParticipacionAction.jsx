import React, { useState } from "react";

const UI = {
  tx: "#0F172A",
  su: "#64748B",
  line: "#E2E8F0",
};

const DEFAULT_HINT =
  "Indicas que has terminado tu parte en este servicio. Otros conductores pueden seguir operando. Esta acción no cierra el expediente.";

/**
 * Botón + modal de confirmación para «Finalizar mi participación» (único punto compartido).
 */
export function ConductorFinalizarParticipacionAction({
  visible = false,
  onConfirm,
  showToast,
  successMessage = "Has finalizado tu participación en este servicio",
  buttonLabel = "Finalizar mi participación",
  listButtonLabel = null,
  dialogHint = DEFAULT_HINT,
  disabled = false,
  variant = "default",
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  async function handleConfirm() {
    if (!onConfirm || saving) return;
    setSaving(true);
    try {
      await onConfirm();
      showToast?.(successMessage);
      setOpen(false);
    } catch (error) {
      showToast?.(error?.message || "No se pudo finalizar tu participación");
    } finally {
      setSaving(false);
    }
  }

  const isDemo = variant === "demo";
  const isList = variant === "list";

  const buttonStyle = isList
    ? {
        width: "100%",
        marginBottom: 8,
        background: "#fef2f2",
        color: "#b91c1c",
        border: "1px solid rgba(185,28,28,.25)",
        borderRadius: 12,
        padding: "14px",
        fontSize: 14,
        fontWeight: 800,
        cursor: saving || disabled ? "default" : "pointer",
        opacity: saving || disabled ? 0.7 : 1,
      }
    : isDemo
      ? {
          width: "100%",
          padding: "13px 14px",
          borderRadius: 8,
          border: "0.5px solid rgba(185,28,28,.35)",
          background: "#fef2f2",
          color: "#b91c1c",
          fontSize: 13,
          fontWeight: 500,
          cursor: saving || disabled ? "default" : "pointer",
          opacity: saving || disabled ? 0.7 : 1,
        }
      : {
          width: "100%",
          marginTop: variant === "inline" ? 4 : 14,
          minHeight: 46,
          padding: "11px 14px",
          borderRadius: 12,
          border: "1px solid #fca5a5",
          background: "#fef2f2",
          color: "#b91c1c",
          fontSize: variant === "mas" ? 14 : 13,
          fontWeight: 800,
          cursor: saving || disabled ? "default" : "pointer",
          opacity: saving || disabled ? 0.7 : 1,
        };

  return (
    <>
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => setOpen(true)}
        style={buttonStyle}
      >
        {saving ? "Finalizando…" : listButtonLabel || buttonLabel}
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
              boxShadow: isDemo ? undefined : "0 20px 50px rgba(15,23,42,.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginBottom: 8 }}>Finalizar participación</div>
            <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.45, marginBottom: 16 }}>{dialogHint}</div>
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
                  background: "#b91c1c",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 800,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.75 : 1,
                }}
              >
                {saving ? "Finalizando…" : "Finalizar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
