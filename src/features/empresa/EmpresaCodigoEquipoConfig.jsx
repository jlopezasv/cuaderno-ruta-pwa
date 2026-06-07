import { useEffect, useState } from "react";
import { buildEquipoDeepLink, EquipoInvitacionModal } from "../../components/EquipoInvitacionModal.jsx";
import {
  getEmpresaCodigoEquipoDisplay,
  getEmpresaEquipoCodeStrict,
  isEmpresaCodigoTemporal,
} from "../../domain/empresa/empresaCodigoEquipo.js";
import {
  enrichEmpresaRecordFromOffice,
  fetchEmpresaRecordById,
} from "../../domain/empresa/empresaRecordCache.js";
import { ConfigCard, CONFIG_UI, configBtnSecondary } from "./empresaConfigCards.jsx";

/**
 * Bloque «Código de empresa» — solo Configuración (DEMO).
 * Campo canónico: empresas.codigo_equipo (fallback codigo_corto).
 */
export function EmpresaCodigoEquipoConfig({
  empresaId,
  initialEmpresa = null,
  empresaNombreFallback = "",
  officeUser = null,
  variant = "legacy",
  sbSelect,
  showToast,
}) {
  const [empresa, setEmpresa] = useState(() =>
    enrichEmpresaRecordFromOffice(initialEmpresa, officeUser),
  );
  const [loading, setLoading] = useState(!initialEmpresa?.id && !!empresaId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);

  useEffect(() => {
    const enriched = enrichEmpresaRecordFromOffice(initialEmpresa, officeUser);
    if (enriched?.id && enriched.id === empresaId) {
      setEmpresa(enriched);
      setLoading(false);
      return;
    }
    if (!empresaId || !sbSelect) {
      setEmpresa(enrichEmpresaRecordFromOffice(null, officeUser));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmpresaRecordById(sbSelect, empresaId)
      .then((row) => {
        if (!cancelled) {
          setEmpresa(
            enrichEmpresaRecordFromOffice(row, officeUser) || {
              id: empresaId,
              nombre: empresaNombreFallback || "Empresa",
            },
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmpresa(
            enrichEmpresaRecordFromOffice(null, officeUser) || {
              id: empresaId,
              nombre: empresaNombreFallback || "Empresa",
            },
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [empresaId, initialEmpresa, officeUser, empresaNombreFallback, sbSelect]);

  const codigoStrict = empresa ? getEmpresaEquipoCodeStrict(empresa) : "";
  const codigoDisplay = empresa ? getEmpresaCodigoEquipoDisplay(empresa) : "";
  const generando = !!empresa?.id && !codigoStrict && !pollExhausted && !officeUser?.codigoEquipo;
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
        const merged = enrichEmpresaRecordFromOffice(row, officeUser);
        if (merged && getEmpresaEquipoCodeStrict(merged)) {
          setEmpresa(merged);
          setPollExhausted(false);
        }
      });
    }, 650);
    return () => clearInterval(timer);
  }, [empresa?.id, codigoStrict, sbSelect, officeUser]);

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

  function enviarWhatsApp() {
    const code = codigoStrict || codigoDisplay;
    if (!code) return;
    const url = buildEquipoDeepLink(code);
    const text = `Únete a ${empresa?.nombre || "nuestra empresa"} en Cuaderno de Ruta.\nCódigo de empresa: ${code}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  if (!empresaId) return null;

  const inner = loading ? (
    <div style={{ fontSize: 13, color: CONFIG_UI.muted }}>Cargando código…</div>
  ) : (
    <>
      <div
        style={{
          background: CONFIG_UI.surfaceSoft,
          borderRadius: 12,
          padding: "14px 12px",
          border: `1px solid ${CONFIG_UI.border}`,
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
            <span style={{ fontSize: 14, fontWeight: 700, color: CONFIG_UI.muted }}>Generando código…</span>
          </div>
        ) : sinCodigoReal ? (
          <div style={{ fontSize: 14, fontWeight: 650, color: CONFIG_UI.warn }}>Empresa sin código asignado</div>
        ) : (
          <div
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 24,
              fontWeight: 800,
              color: CONFIG_UI.accent,
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
          {copied ? "Copiado ✓" : "Copiar"}
        </button>
        <button
          type="button"
          onClick={enviarWhatsApp}
          disabled={generando || !codigoUsable}
          style={btnStyle(generando || !codigoUsable)}
        >
          Enviar
        </button>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          disabled={generando || !codigoUsable}
          style={{
            ...btnStyle(generando || !codigoUsable),
            background: generando || !codigoUsable ? "#e2e8f0" : CONFIG_UI.tx,
            color: generando || !codigoUsable ? "#94a3b8" : "#fff",
            border: "none",
          }}
        >
          QR
        </button>
      </div>

      {inviteOpen && codigoUsable && (
        <EquipoInvitacionModal
          onClose={() => setInviteOpen(false)}
          equipoNombre={empresa?.nombre}
          equipoCode={codigoStrict || codigoDisplay}
          linkUrl={buildEquipoDeepLink(codigoStrict || codigoDisplay)}
        />
      )}

      <style>{`@keyframes empresa-codigo-pulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}`}</style>
    </>
  );

  if (variant === "card") {
    return (
      <ConfigCard
        title="Código de empresa"
        description={`Los conductores usan este código para vincularse a ${empresa?.nombre || empresaNombreFallback || "tu empresa"}.`}
      >
        {inner}
      </ConfigCard>
    );
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${CONFIG_UI.border}` }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: CONFIG_UI.tx, marginBottom: 4 }}>Código de empresa</div>
      {inner}
    </div>
  );
}

function btnStyle(disabled) {
  return {
    ...configBtnSecondary(),
    padding: "11px 8px",
    fontSize: 12,
    fontWeight: 750,
    background: disabled ? "#f1f5f9" : "#fff",
    color: disabled ? "#94a3b8" : CONFIG_UI.tx,
    cursor: disabled ? "default" : "pointer",
  };
}
