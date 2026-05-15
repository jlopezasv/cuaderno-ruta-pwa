import { useMemo, useState } from "react";
import { OperationalDocumentRow } from "./OperationalDocumentRow.jsx";

const GROUP_ORDER = ["cmr", "fotos", "incidencias", "documentos"];
const GROUP_LABEL = {
  cmr: "CMR y cartas de porte",
  fotos: "Fotos operativas",
  incidencias: "Incidencias",
  documentos: "Otros documentos y extras",
};

/**
 * Lista expediente agrupada, tamaño total, lazy thumbs.
 */
export function ExpedienteDocumentsPanel({ expediente, onOpenDocument, tone = "light" }) {
  const [openGroup, setOpenGroup] = useState(null);
  const panel =
    tone === "dark"
      ? { rowBg: "#f8fafc", border: "#e2e8f0", tx: "#0f172a", su: "#64748b", time: "#94a3b8" }
      : { rowBg: "#f8fafc", border: "#e2e8f0", tx: "#0f172a", su: "#64748b", time: "#94a3b8" };

  const groups = useMemo(() => {
    const g = { cmr: [], fotos: [], incidencias: [], documentos: [] };
    for (const ev of expediente?.evidencias || []) {
      const b = ev.bucket || ev.tipo;
      if (b === "cmr") g.cmr.push(ev);
      else if (b === "foto" || b === "fotos") g.fotos.push(ev);
      else if (b === "incidencia" || b === "incidencias") g.incidencias.push(ev);
      else if (b === "ticket" || b === "factura" || b === "otro") g.documentos.push(ev);
      else g.documentos.push(ev);
    }
    return g;
  }, [expediente?.evidencias]);

  const totalLabel = expediente?.storage?.totalLabel || "—";
  const count = expediente?.evidencias?.length || 0;

  if (!count) {
    return <div style={{ fontSize: 12, color: panel.su }}>Sin documentos en el expediente.</div>;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: panel.tx }}>Expediente · {totalLabel}</div>
        <div style={{ fontSize: 11, color: panel.su, fontWeight: 600 }}>{count} documento{count === 1 ? "" : "s"}</div>
      </div>

      {GROUP_ORDER.map((key) => {
        const items = groups[key];
        if (!items?.length) return null;
        const expanded = openGroup === key || openGroup === null;
        return (
          <div key={key} style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setOpenGroup((g) => (g === key ? null : key))}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "4px 0 6px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: panel.su, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {GROUP_LABEL[key]} ({items.length})
              </span>
              <span style={{ fontSize: 11, color: panel.time }}>{expanded ? "⌄" : "›"}</span>
            </button>
            {expanded
              ? items.map((ev) => (
                  <OperationalDocumentRow key={ev.id || `${ev.tipo}-${ev.created_at}`} ev={ev} panel={panel} onOpen={onOpenDocument} />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
