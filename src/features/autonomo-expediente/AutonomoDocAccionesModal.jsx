import { useState } from "react";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
};

const MAIN_OPTIONS = [
  { id: "cmr", label: "CMR / OCR", hint: "Escanear documento" },
  { id: "foto", label: "Foto", hint: "Captura o galería" },
  { id: "incidencia", label: "Incidencia", hint: "Avería, daño, retraso…" },
];

const FOTO_SUB_OPTIONS = [
  { id: "foto_camara", label: "Hacer foto", hint: "Cámara del dispositivo" },
  { id: "foto_galeria", label: "Subir de galería", hint: "Elegir imagen guardada" },
];

export function AutonomoDocAccionesModal({
  open,
  onClose,
  onSelect,
  title = "Documentación",
  compact = false,
}) {
  const [fotoSub, setFotoSub] = useState(false);

  if (!open) return null;

  const options = fotoSub ? FOTO_SUB_OPTIONS : MAIN_OPTIONS;
  const heading = fotoSub ? "Foto" : title;

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
      onClick={() => {
        setFotoSub(false);
        onClose?.();
      }}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {fotoSub ? (
            <button
              type="button"
              onClick={() => setFotoSub(false)}
              style={{
                border: "none",
                background: "#f1f5f9",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ←
            </button>
          ) : null}
          <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx }}>{heading}</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: compact ? "row" : "column",
            gap: compact ? 6 : 8,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                if (opt.id === "foto") {
                  setFotoSub(true);
                  return;
                }
                onSelect?.(opt.id);
                setFotoSub(false);
                onClose?.();
              }}
              style={{
                flex: compact ? 1 : undefined,
                textAlign: compact ? "center" : "left",
                border: `1px solid ${UI.line}`,
                borderRadius: 12,
                padding: compact ? "12px 8px" : "12px 14px",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 800, color: UI.tx, fontSize: compact ? 12 : 14 }}>{opt.label}</div>
              {!compact ? (
                <div style={{ fontSize: 12, color: UI.su, marginTop: 2 }}>{opt.hint}</div>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mapeo acción → tipos permitidos y modal inicial en OperationalEvidenciasStop */
export function docActionToEvidenciaConfig(action) {
  switch (action) {
    case "cmr":
    case "ocr_cmr":
      return { modal: "cmr", tipos: ["cmr"] };
    case "foto":
    case "foto_camara":
      return { modal: "foto", tipos: ["foto"], fotoSource: "camera" };
    case "foto_galeria":
      return { modal: "foto", tipos: ["foto"], fotoSource: "gallery" };
    case "incidencia":
      return { modal: "incidencia", tipos: ["incidencia"] };
    default:
      return { modal: "foto", tipos: ["foto"] };
  }
}

/** Acciones de entrega en destino */
export const ENTREGA_DOC_OPTIONS = [
  { id: "foto_camara", label: "Foto POD / albarán" },
  { id: "incidencia", label: "Incidencia" },
];
