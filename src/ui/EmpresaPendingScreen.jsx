import { EMPRESA_STATUS } from "../auth/accountModel.js";
import { BrandMark } from "./BrandHeader.jsx";

/**
 * Cuenta empresa sin shell disponible (p. ej. pending en producción sin can_drive).
 */
export function EmpresaPendingScreen({ empresaStatus, onSignOut }) {
  const rejected = empresaStatus === EMPRESA_STATUS.REJECTED;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Outfit, sans-serif",
      }}
    >
      <BrandMark size={56} rounded={14} />
      <h1
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: "#F1F5F9",
          marginTop: 20,
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        {rejected ? "Cuenta empresa no aprobada" : "Cuenta empresa en revisión"}
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "#94A3B8",
          textAlign: "center",
          maxWidth: 360,
          lineHeight: 1.55,
          marginBottom: 28,
        }}
      >
        {rejected
          ? "Tu solicitud de cuenta empresa no ha sido aprobada. Contacta con administración si crees que es un error."
          : "Tu cuenta de empresa está pendiente de validación. Te avisaremos cuando puedas acceder al panel de gestión."}
      </p>
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          style={{
            background: "#334155",
            color: "#F1F5F9",
            border: "none",
            borderRadius: 12,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
