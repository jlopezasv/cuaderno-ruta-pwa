import { useState } from "react";

const inputStyle = {
  width: "100%",
  background: "#F8FAFC",
  border: "1.5px solid #CBD5E1",
  borderRadius: 9,
  padding: "11px 13px",
  fontSize: 15,
  color: "#0F172A",
  outline: "none",
  marginBottom: 10,
  boxSizing: "border-box",
};

/**
 * Formulario reutilizable: contraseña actual + nueva + confirmación.
 */
export function ChangePasswordForm({
  onSubmit,
  submitLabel = "Cambiar contraseña",
  showCancel = false,
  onCancel,
  requireCurrent = true,
}) {
  const [passCurrent, setPassCurrent] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (requireCurrent && !passCurrent) {
      setMsg("Indica la contraseña actual");
      return;
    }
    if (!pass1 || pass1.length < 6) {
      setMsg("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (pass1 !== pass2) {
      setMsg("Las contraseñas nuevas no coinciden");
      return;
    }
    if (requireCurrent && passCurrent === pass1) {
      setMsg("La nueva contraseña debe ser distinta de la actual");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      await onSubmit({ currentPassword: passCurrent, newPassword: pass1 });
      setPassCurrent("");
      setPass1("");
      setPass2("");
    } catch (err) {
      setMsg(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  const msgOk = msg && !/error|incorrect|distinta|coincid|mínimo|indica/i.test(msg);

  return (
    <form onSubmit={handleSubmit}>
      {requireCurrent ? (
        <input
          type="password"
          value={passCurrent}
          onChange={(e) => setPassCurrent(e.target.value)}
          placeholder="Contraseña actual"
          style={inputStyle}
          autoComplete="current-password"
        />
      ) : null}
      <input
        type="password"
        value={pass1}
        onChange={(e) => setPass1(e.target.value)}
        placeholder="Nueva contraseña (mín. 6 caracteres)"
        style={inputStyle}
        autoComplete="new-password"
      />
      <input
        type="password"
        value={pass2}
        onChange={(e) => setPass2(e.target.value)}
        placeholder="Confirmar nueva contraseña"
        style={inputStyle}
        autoComplete="new-password"
      />
      {msg ? (
        <div
          style={{
            fontSize: 13,
            color: msgOk ? "#166534" : "#DC2626",
            marginBottom: 10,
            lineHeight: 1.4,
          }}
        >
          {msgOk ? `✅ ${msg}` : `❌ ${msg}`}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: showCancel ? "1fr 1fr" : "1fr", gap: 8 }}>
        {showCancel ? (
          <button
            type="button"
            onClick={() => {
              setPassCurrent("");
              setPass1("");
              setPass2("");
              setMsg("");
              onCancel?.();
            }}
            style={{
              background: "#F1F5F9",
              color: "#64748B",
              border: "none",
              borderRadius: 9,
              padding: "11px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? "#94A3B8" : "#0F172A",
            color: "white",
            border: "none",
            borderRadius: 9,
            padding: "11px",
            fontSize: 13,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
