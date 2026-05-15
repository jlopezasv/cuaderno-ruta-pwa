import { LazyDocumentThumb } from "./LazyDocumentThumb.jsx";

const TIPO_COLOR = {
  cmr: "#0EA5E9",
  foto: "#22C55E",
  incidencia: "#EF4444",
  nota: "#64748B",
  ticket: "#0EA5E9",
  factura: "#6366F1",
  otro: "#64748B",
};

export function OperationalDocumentRow({ ev, panel, onOpen, compact = false }) {
  const title = ev.displayTitle || ev.titulo || ev.tipo;
  const subtitle = ev.displaySubtitle || ev.detalle || "";
  const line2 = ev.displayLine2 || "";
  const color = TIPO_COLOR[ev.tipo] || panel?.tx || "#334155";
  const thumbSrc = ev.previewUrl || ev.url;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(ev)}
      style={{
        width: "100%",
        background: panel?.rowBg || "#f8fafc",
        border: `1px solid ${panel?.border || "#e2e8f0"}`,
        borderRadius: compact ? 8 : 10,
        padding: compact ? "8px 10px" : "10px 12px",
        marginBottom: compact ? 5 : 6,
        display: "flex",
        gap: compact ? 8 : 10,
        alignItems: "center",
        textAlign: "left",
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      <LazyDocumentThumb
        src={thumbSrc}
        alt=""
        style={compact ? { width: 40, height: 40 } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.(ev);
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color, lineHeight: 1.3 }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: panel?.su || "#64748b", marginTop: 2, lineHeight: 1.35 }}>{subtitle}</div>
        ) : null}
        {line2 ? (
          <div style={{ fontSize: 10, color: panel?.time || "#94a3b8", marginTop: 2, fontWeight: 600 }}>{line2}</div>
        ) : null}
      </div>
    </button>
  );
}
