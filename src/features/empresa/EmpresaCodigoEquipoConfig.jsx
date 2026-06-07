import { useEffect, useState } from "react";
import { buildEquipoDeepLink, EquipoInvitacionModal } from "../../components/EquipoInvitacionModal.jsx";
import {
  getEmpresaCodigoEquipoDisplay,
  getEmpresaEquipoCodeStrict,
  isEmpresaCodigoTemporal,
} from "../../domain/empresa/empresaCodigoEquipo.js";
import { fetchEmpresaRecordById } from "../../domain/empresa/empresaRecordCache.js";

const UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  muted: "#64748b",
  tx: "#0f172a",
  accent: "#c2410c",
  warn: "#b45309",
};

/**
 * Bloque «Código de empresa» — solo Configuración (DEMO panel empresa).
 * @param {string} empresaId
 * @param {object|null} [initialEmpresa] — fila empresas ya cargada (evita consulta extra)
 * @param {Function} sbSelect
 * @param {Function} [showToast]
 */
export function EmpresaCodigoEquipoConfig({
  empresaId,
  initialEmpresa = null,
  sbSelect,
  showToast,
}) {
  const [empresa, setEmpresa] = useState(initialEmpresa);
  const [loading, setLoading] = useState(!initialEmpresa?.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);

  useEffect(() => {
    if (initialEmpresa?.id && initialEmpresa.id === empresaId) {
      setEmpresa(initialEmpresa);
      setLoading(false);
      return;
    }
    if (!empresaId || !sbSelect) {
      setEmpresa(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmpresaRecordById(sbSelect, empresaId)
      .then((row) => {
        if (!cancelled) {
          setEmpresa(row);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmpresa(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [empresaId, initialEmpresa?.id, sbSelect]);

  const codigoStrict = empresa ? getEmpresaEquipoCodeStrict(empresa) : "";
  const codigoDisplay = empresa ? getEmpresaCodigoEquipoDisplay(empresa) : "";
  const generando = !!empresa?.id && !codigoStrict && !pollExhausted;
  const sinCodigoReal = !!empresa?.id && !codigoStrict && pollExhausted;
  const codigoUsable = codigoStrict || (codigoDisplay && !isEmpresaCodigoTemporal(codigoDisplay) ? codigoDisplay : "");

  useEffect(() => {
    if (!empresa?.id || codigoStrict || !sbSelect) return undefined;
    setPollExhausted(false);
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      if (n > 12) {
        clearInterval(timer);
        setPollExhausted(true);
        return;
      }
      fetchEmpresaRecordById(sbSelect, empresa.id, { force: true }).then((row) => {
        if (row && getEmpresaEquipoCodeStrict(row)) {
          setEmpresa(row);
          setPollExhausted(false);
        }
      });
    }, 650);
    return () => clearInterval(timer);
  }, [empresa?.id, codigoStrict, sbSelect]);

  function toast(msg) {
    showToast?.(msg);
  }

  function copiarCodigo() {
    const t = codigoStrict || codigoDisplay;
    if (!t) return;
    navigator.clipboard
      ?.writeText(t)
      .then(() => {
        setCopied(true);
        toast("Código copiado ✓");
        setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => toast("No se pudo copiar"));
  }

  async function compartirCodigo() {
    const code = codigoStrict || codigoDisplay;
    if (!code) return;
    const url = buildEquipoDeepLink(code);
    const title = `Únete a ${empresa?.nombre || "nuestra empresa"}`;
    const text = `Código de empresa: ${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast("Enlace copiado para compartir");
      }
    } catch {
      /* cancelado */
    }
  }

  function enviarWhatsApp() {
    const code = codigoStrict || codigoDisplay;
    if (!code) return;
    const url = buildEquipoDeepLink(code);
    const text = `Únete a ${empresa?.nombre || "nuestra empresa"} en Cuaderno de Ruta.\nCódigo de empresa: ${code}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${UI.border}` }}>
        <div style={{ fontSize: 13, color: UI.muted }}>Cargando código de empresa…</div>
      </div>
    );
  }

  if (!empresaId || !empresa) {
    return (
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${UI.border}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: UI.tx, marginBottom: 8 }}>Código de empresa</div>
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 13,
            color: "#b91c1c",
            fontWeight: 600,
          }}
        >
          No se pudo cargar la empresa. Cierra sesión e inténtalo de nuevo.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${UI.border}` }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: UI.tx, marginBottom: 4 }}>Código de empresa</div>
      <div style={{ fontSize: 12, color: UI.muted, marginBottom: 14, lineHeight: 1.45 }}>
        Los conductores usan este código en su perfil para vincularse a {empresa.nombre || "tu empresa"}.
      </div>

      <div
        style={{
          background: UI.surface,
          borderRadius: 14,
          padding: "16px 14px",
          border: `1px solid ${UI.border}`,
          marginBottom: 12,
        }}
      >
        {generando ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#f59e0b",
                animation: "empresa-codigo-pulse 1s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700, color: UI.muted }}>Generando código…</span>
          </div>
        ) : sinCodigoReal ? (
          <div style={{ fontSize: 14, fontWeight: 650, color: UI.warn }}>Empresa sin código asignado</div>
        ) : (
          <div
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 26,
              fontWeight: 800,
              color: UI.accent,
              letterSpacing: 1,
              lineHeight: 1.1,
            }}
          >
            {codigoStrict || codigoDisplay}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <button
          type="button"
          onClick={copiarCodigo}
          disabled={generando || !codigoUsable}
          style={btnStyle(generando || !codigoUsable)}
        >
          {copied ? "Copiado ✓" : "Copiar código"}
        </button>
        <button
          type="button"
          onClick={enviarWhatsApp}
          disabled={generando || !codigoUsable}
          style={btnStyle(generando || !codigoUsable)}
        >
          Enviar código
        </button>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          disabled={generando || !codigoUsable}
          style={{
            ...btnStyle(generando || !codigoUsable),
            background: generando || !codigoUsable ? "#e2e8f0" : "#0f172a",
            color: generando || !codigoUsable ? "#94a3b8" : "#fff",
            border: "none",
          }}
        >
          Ver QR
        </button>
      </div>

      <button
        type="button"
        onClick={compartirCodigo}
        disabled={generando || !codigoUsable}
        style={{
          ...btnStyle(generando || !codigoUsable),
          width: "100%",
          marginTop: 8,
        }}
      >
        Compartir enlace de invitación
      </button>

      {inviteOpen && codigoUsable && (
        <EquipoInvitacionModal
          onClose={() => setInviteOpen(false)}
          equipoNombre={empresa.nombre}
          equipoCode={codigoStrict || codigoDisplay}
          linkUrl={buildEquipoDeepLink(codigoStrict || codigoDisplay)}
        />
      )}

      <style>{`@keyframes empresa-codigo-pulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}`}</style>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    borderRadius: 12,
    padding: "12px 8px",
    fontSize: 12,
    fontWeight: 750,
    border: `1px solid ${UI.border}`,
    background: disabled ? "#f1f5f9" : "#fff",
    color: disabled ? "#94a3b8" : UI.tx,
    cursor: disabled ? "default" : "pointer",
  };
}
