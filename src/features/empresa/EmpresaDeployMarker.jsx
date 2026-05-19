import {
  EMPRESA_BUILD_MARKER,
  getClientDeployKind,
  getSupabaseProjectRef,
} from "../../config/env.js";

/**
 * Banner fijo en panel empresa (jefe) para confirmar que el build desplegado es el esperado.
 */
export function EmpresaDeployMarker() {
  const deploy = getClientDeployKind();
  const supabaseRef = getSupabaseProjectRef();
  const { tag, rev, date } = EMPRESA_BUILD_MARKER;

  return (
    <div
      role="status"
      aria-label={`Build ${tag} rev ${rev}`}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        background: "linear-gradient(90deg, #ecfdf5 0%, #eff6ff 100%)",
        border: "2px solid #22c55e",
        boxShadow: "0 0 0 1px rgba(34,197,94,.15)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 0.6,
          color: "#166534",
          textTransform: "uppercase",
        }}
      >
        Build activo
      </span>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>
        {tag} · r{rev}
      </span>
      <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>{date}</span>
      <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>
        {deploy} · supabase:{supabaseRef}
      </span>
    </div>
  );
}
