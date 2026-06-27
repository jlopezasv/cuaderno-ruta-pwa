const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
};

const OPTIONS = [
  { id: "ocr_cmr", label: "OCR CMR", hint: "Escanear y extraer datos" },
  { id: "foto_cmr", label: "Foto CMR", hint: "Sin OCR" },
  { id: "foto_carga", label: "Foto carga", hint: "Mercancía en muelle" },
  { id: "foto_mercancia", label: "Foto mercancía", hint: "Detalle de bultos" },
  { id: "documento", label: "Documento", hint: "PDF u otro archivo" },
  { id: "incidencia", label: "Incidencia", hint: "Avería, daño, retraso…" },
];

export function AutonomoDocAccionesModal({ open, onClose, onSelect, title = "¿Qué quieres hacer?" }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12500,
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
        <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginBottom: 12 }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onSelect?.(opt.id);
                onClose?.();
              }}
              style={{
                textAlign: "left",
                border: `1px solid ${UI.line}`,
                borderRadius: 12,
                padding: "12px 14px",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 800, color: UI.tx }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: UI.su, marginTop: 2 }}>{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mapeo acción → tipos permitidos en OperationalEvidenciasStop */
export function docActionToEvidenciaConfig(action) {
  switch (action) {
    case "ocr_cmr":
      return { modal: "cmr", ocr: true, tipos: ["cmr"] };
    case "foto_cmr":
      return { modal: "cmr", ocr: false, tipos: ["cmr"] };
    case "foto_carga":
    case "foto_mercancia":
      return { modal: "foto", tipos: ["foto"] };
    case "incidencia":
      return { modal: "incidencia", tipos: ["incidencia"] };
    default:
      return { modal: "foto", tipos: ["foto"] };
  }
}

/** Acciones de entrega en destino */
export const ENTREGA_DOC_OPTIONS = [
  { id: "pod", label: "Foto POD / albarán firmado" },
  { id: "foto_mercancia", label: "Foto mercancía descargada" },
  { id: "incidencia", label: "Incidencia" },
  { id: "comentario", label: "Comentario" },
];
