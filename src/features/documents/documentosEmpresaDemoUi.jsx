import { isDemoApp } from "../../config/appEnvironment.js";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { resolveEnvioClienteEstado } from "../../domain/mail/clienteMailEnvioStatus.js";

const DOCS_ROW_BORDER = "1px solid #d1dae6";

export function isDocumentosEmpresaDemoUi() {
  return isDemoApp();
}

export const DOCUMENTOS_DEMO_ROW_CSS = `
@media (max-width: 960px) {
  .docs-expediente-row-demo {
    grid-template-columns: minmax(72px,.85fr) minmax(96px,1.15fr) minmax(88px,1fr) minmax(72px,.85fr) minmax(72px,.8fr) minmax(80px,.75fr) minmax(72px,.7fr) auto !important;
    gap: 8px !important;
  }
}
@media (max-width: 720px) {
  .docs-expediente-row-demo {
    grid-template-columns: 1fr 1fr !important;
    row-gap: 10px !important;
  }
  .docs-expediente-row-demo > *:nth-child(n+6) {
    grid-column: 1 / -1;
  }
}
`;

/** Misma píldora de estado que Servicios / Dashboard (ESTADO_LABEL + ESTADO_COLOR). */
export function DocsServicioEstadoPill({ servicioEstado, archived }) {
  const label = archived ? "Archivado" : ESTADO_LABEL[servicioEstado] || servicioEstado || "—";
  const color = archived ? "#64748b" : ESTADO_COLOR[servicioEstado] || "#64748b";
  return (
    <span
      style={{
        display: "inline-block",
        maxWidth: "100%",
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `${color}20`,
        border: `1px solid ${color}55`,
        borderRadius: 6,
        padding: "3px 8px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}

/** Cabecera empresa compacta (identidad + equipo + acciones) — demo y producción. */
export function EmpresaIdentityBarCompact({
  empresaNombre,
  empresaCif,
  serviciosEnRuta,
  codigoEquipoShow,
  generandoCodigoEquipo,
  onCopy,
  onShare,
  onQrInvite,
  tx,
  su,
  accent,
  surfaceSoft,
  border,
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderBottom: `1px solid ${border}`,
        padding: "8px 14px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px 10px",
      }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12, color: su, lineHeight: 1.45 }}>
        <span style={{ fontWeight: 650, color: tx }}>{empresaNombre}</span>
        {empresaCif ? <span> · CIF {empresaCif}</span> : null}
        <span>
          {" "}
          · <strong style={{ color: accent }}>{serviciosEnRuta}</strong> en ruta
        </span>
        <span style={{ color: su }}>
          {" "}
          · Equipo:{" "}
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontWeight: 750,
              color: tx,
              letterSpacing: 0.3,
            }}
          >
            {generandoCodigoEquipo ? "…" : codigoEquipoShow || "—"}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flexShrink: 0 }}>
        <button
          type="button"
          disabled={generandoCodigoEquipo || !codigoEquipoShow}
          onClick={onCopy}
          style={equipoBtnStyle(surfaceSoft, border, tx, generandoCodigoEquipo)}
        >
          Copiar
        </button>
        <button
          type="button"
          disabled={generandoCodigoEquipo || !codigoEquipoShow}
          onClick={onShare}
          style={equipoBtnStyle(surfaceSoft, border, tx, generandoCodigoEquipo)}
        >
          Compartir
        </button>
        <button
          type="button"
          disabled={generandoCodigoEquipo || !codigoEquipoShow}
          onClick={onQrInvite}
          style={{
            ...equipoBtnStyle("#0f172a", "none", "#fff", generandoCodigoEquipo),
            border: "none",
            background: generandoCodigoEquipo ? "#94a3b8" : "#0f172a",
            color: "#fff",
          }}
        >
          QR invitar
        </button>
      </div>
    </div>
  );
}

function equipoBtnStyle(bg, border, color, disabled) {
  return {
    background: bg,
    border: border === "none" ? "none" : `1px solid ${border}`,
    borderRadius: 8,
    color,
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    padding: "6px 10px",
    opacity: disabled ? 0.55 : 1,
  };
}

/** Estado envío cliente: icono + texto corto; clic abre detalle si hay registro. */
export function EnvioClienteEstadoCompact({ envioRow, onOpenDetail }) {
  const meta = resolveEnvioClienteEstado(envioRow?.estado);
  const short = meta.labelShort || meta.label;
  const clickable = !!envioRow && typeof onOpenDetail === "function";

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onOpenDetail()}
      title={clickable ? "Ver detalle del envío" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px",
        borderRadius: 999,
        border: `1px solid ${meta.bg === "#f8fafc" ? "#e2e8f0" : meta.color + "33"}`,
        background: meta.bg,
        color: meta.color,
        fontSize: 11.5,
        fontWeight: 700,
        cursor: clickable ? "pointer" : "default",
        maxWidth: "100%",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      <span>{short}</span>
    </button>
  );
}

const ACTION_STYLES = {
  secondary: { background: "#e2e8f0", color: "#0f172a", border: "1px solid #cbd5e1" },
  primary: { background: "#2563eb", color: "#fff", border: "none" },
  dark: { background: "#0f172a", color: "#fff", border: "none" },
  ghost: { background: "#fff", color: "#475569", border: "1px solid #cbd5e1" },
};

/**
 * Botonera expediente — extensible (WhatsApp, enlace, etc.) sin romper layout.
 * @param {{ id: string, label: string, onClick?: () => void, variant?: keyof ACTION_STYLES, hidden?: boolean, disabled?: boolean }[]} actions
 */
export function DocsExpedienteActionBar({ actions = [] }) {
  const visible = actions.filter((a) => !a.hidden);
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        justifyContent: "flex-end",
        alignItems: "center",
        flexWrap: "wrap",
        minWidth: 0,
      }}
    >
      {visible.map((a) => {
        const st = ACTION_STYLES[a.variant] || ACTION_STYLES.secondary;
        return (
          <button
            key={a.id}
            type="button"
            disabled={a.disabled}
            onClick={a.onClick}
            style={{
              ...st,
              borderRadius: 8,
              padding: "6px 9px",
              fontSize: 11.5,
              fontWeight: 800,
              cursor: a.disabled ? "default" : "pointer",
              opacity: a.disabled ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/** Fila expediente horizontal (aprovecha ancho en demo). */
export function DocsExpedienteRowDemo({
  refVisible,
  clienteDoc,
  ruta,
  totalEvs,
  incN,
  conductor,
  matricula,
  servicioEstado,
  envioRow,
  onOpenEnvioDetail,
  archived,
  actions,
}) {
  const cliente =
    String(clienteDoc || "").trim() && clienteDoc !== "—" ? String(clienteDoc).trim() : "—";

  return (
    <div
      className="docs-expediente-row-demo"
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(80px,.9fr) minmax(108px,1.25fr) minmax(100px,1.15fr) minmax(88px,.95fr) minmax(88px,.85fr) minmax(92px,.8fr) minmax(140px,auto)",
        gap: "8px 12px",
        alignItems: "center",
        padding: "9px 12px",
        borderBottom: DOCS_ROW_BORDER,
        background: "#fff",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {refVisible}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1e293b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.3,
          }}
          title={cliente}
        >
          {cliente}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={ruta}
        >
          {ruta}
        </div>
        <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
          {totalEvs} doc{totalEvs !== 1 ? "s" : ""}
          {incN > 0 ? ` · ⚠ ${incN}` : ""}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {conductor}
        </div>
        {matricula ? (
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{matricula}</div>
        ) : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <DocsServicioEstadoPill servicioEstado={servicioEstado} archived={archived} />
      </div>
      <div style={{ minWidth: 0 }}>
        <EnvioClienteEstadoCompact envioRow={envioRow} onOpenDetail={onOpenEnvioDetail} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <DocsExpedienteActionBar actions={actions} />
      </div>
    </div>
  );
}
