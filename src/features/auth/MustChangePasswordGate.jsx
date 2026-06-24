import { getSession, getUserId } from "../../data/supabaseClient.js";
import { completeMandatoryPasswordChange } from "../../data/session.js";
import { ChangePasswordForm } from "./ChangePasswordForm.jsx";

/**
 * Pantalla bloqueante tras login con contraseña temporal.
 */
export function MustChangePasswordGate({ onComplete, onSignOut }) {
  const session = getSession();
  const email = session?.user?.email || session?.user?.user_metadata?.email || "";
  const displayName =
    session?.user?.user_metadata?.nombre ||
    session?.user?.user_metadata?.full_name ||
    email ||
    "Usuario";

  async function handleChange({ currentPassword, newPassword }) {
    const uid = getUserId();
    await completeMandatoryPasswordChange({
      email,
      currentPassword,
      newPassword,
      userId: uid,
      accessToken: session?.access_token,
    });
    await onComplete?.();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(100%, 440px)",
          background: "white",
          borderRadius: 16,
          padding: "24px 22px",
          boxShadow: "0 16px 40px rgba(15,23,42,.12)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 1.2, marginBottom: 8 }}>
          SEGURIDAD
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Cambia tu contraseña</div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 18 }}>
          Hola <strong style={{ color: "#0f172a" }}>{displayName}</strong>. Tu cuenta usa una contraseña temporal.
          Debes elegir una nueva antes de acceder al panel.
        </div>
        <ChangePasswordForm
          requireCurrent
          submitLabel="Guardar y continuar"
          onSubmit={async (payload) => {
            await handleChange(payload);
          }}
        />
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            style={{
              width: "100%",
              marginTop: 14,
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Cerrar sesión
          </button>
        ) : null}
      </div>
    </div>
  );
}
