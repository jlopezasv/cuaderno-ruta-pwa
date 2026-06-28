import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { getCargaMuelleResumen } from "../../modules/autonomo-expediente/autonomoExpedienteStopModel.js";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  blue: "#2563eb",
};

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/**
 * Checklist tras «Carga terminada»: destino → DeCA → documentos → seguir.
 */
export function AutonomoPostCargaModal({
  open,
  cargaStop,
  busy = false,
  showDeca = false,
  hasDeca = false,
  sinDestino = false,
  esInternacional = false,
  onClose,
  onAddDestino,
  onGenerarDeca,
  onScanCmr,
  onSeguir,
}) {
  if (!open || !cargaStop) return null;

  const muelle = getCargaMuelleResumen(cargaStop);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13600,
        background: "rgba(15,23,42,.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: UI.card,
          borderRadius: "16px 16px 0 0",
          padding: "16px 16px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>Carga terminada</div>
        <div style={{ fontSize: 13, color: UI.su, marginBottom: 12, lineHeight: 1.45 }}>
          {cargaStop.nombre} · entrada {fmtTime(muelle.entradaAt)} → salida {fmtTime(muelle.salidaAt)}
          {muelle.label ? ` · ${muelle.label} en muelle` : ""}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 10, letterSpacing: 0.4 }}>
          SIGUIENTE PASO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sinDestino ? (
            <button type="button" disabled={busy} onClick={() => onAddDestino?.()} style={btn(UI.blue)}>
              1. Añadir destino
            </button>
          ) : (
            <div style={{ fontSize: 12, color: UI.green, fontWeight: 700, padding: "6px 0" }}>
              ✓ Destino(s) definidos
            </div>
          )}
          {showDeca && !hasDeca ? (
            <button type="button" disabled={busy} onClick={() => onGenerarDeca?.()} style={btn(UI.green)}>
              2. Generar {DECA_SHORT_LABEL} antes de circular
            </button>
          ) : null}
          {showDeca && hasDeca ? (
            <div style={{ fontSize: 12, color: UI.green, fontWeight: 700, padding: "6px 0" }}>
              ✓ {DECA_SHORT_LABEL} generado
            </div>
          ) : null}
          <button type="button" disabled={busy} onClick={() => onScanCmr?.()} style={btnOutline()}>
            {esInternacional ? "Subir CMR / carta de porte (opcional)" : "Escanear CMR (opcional)"}
          </button>
          <button type="button" disabled={busy} onClick={() => onSeguir?.()} style={btnOutline()}>
            Seguir trabajando
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(bg) {
  return {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 12,
    border: "none",
    background: bg,
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    textAlign: "left",
  };
}

function btnOutline() {
  return {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 12,
    border: `1px solid ${UI.line}`,
    background: "#fff",
    color: UI.tx,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };
}
