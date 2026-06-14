import { useEffect, useState } from "react";

const UI = {
  bg: "#f0f4f8",
  card: "#ffffff",
  tx: "#0f172a",
  su: "#64748b",
  border: "#dbe4ee",
  brand: "#f59e0b",
  brandDeep: "#b45309",
  green: "#16a34a",
};

function VerifyField({ label, value }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${UI.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: UI.su, letterSpacing: 0.6, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: UI.tx, marginTop: 4, lineHeight: 1.35 }}>{value || "—"}</div>
    </div>
  );
}

export function DcdtVerifyPublicPage({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [row, setRow] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Enlace de verificación no válido");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/dcdt-verify?token=${encodeURIComponent(token)}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.ok) {
          if (!cancelled) setError(data?.error || "No se pudo verificar el documento");
          return;
        }
        if (!cancelled) setRow(data.dcdt);
      } catch {
        if (!cancelled) setError("Error de conexión");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: UI.bg,
        padding: "20px 16px 32px",
        fontFamily: "system-ui, sans-serif",
        color: UI.tx,
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: UI.brandDeep, letterSpacing: 1.2 }}>CUADERNO DE RUTA</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>Verificación DCDT</div>
          <div style={{ fontSize: 12, color: UI.su, marginTop: 6, lineHeight: 1.45 }}>
            Documento de Control del Transporte · Orden FOM/2861/2012
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: 10,
              fontSize: 11,
              fontWeight: 700,
              color: "#166534",
              background: "#dcfce7",
              border: "1px solid #bbf7d0",
              borderRadius: 999,
              padding: "4px 10px",
            }}
          >
            Solo lectura · Inspección
          </div>
        </div>

        <div
          style={{
            background: UI.card,
            borderRadius: 16,
            border: `1px solid ${UI.border}`,
            padding: "18px 16px",
            boxShadow: "0 4px 16px rgba(15,23,42,.06)",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", color: UI.su, padding: "24px 0" }}>Verificando documento…</div>
          ) : error ? (
            <div style={{ textAlign: "center", color: "#b91c1c", padding: "24px 0", lineHeight: 1.5 }}>{error}</div>
          ) : row ? (
            <>
              <VerifyField label="Número DCDT" value={row.numero} />
              <VerifyField label="Estado" value={row.estado} />
              <VerifyField label="Empresa transportista" value={row.transportista} />
              <VerifyField label="Matrícula tractora" value={row.matriculaTractora} />
              {row.matriculaRemolque ? (
                <VerifyField label="Matrícula remolque" value={row.matriculaRemolque} />
              ) : null}
              <VerifyField label="Origen" value={row.origen} />
              <VerifyField label="Destino" value={row.destino} />
              <VerifyField label="Fecha transporte" value={row.fechaTransporte} />
              <VerifyField label="Mercancía principal" value={row.mercanciaPrincipal} />
            </>
          ) : null}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: UI.su, marginTop: 16, lineHeight: 1.5 }}>
          Vista segura de verificación. No permite edición ni acceso a datos operativos del servicio.
        </div>
      </div>
    </div>
  );
}
