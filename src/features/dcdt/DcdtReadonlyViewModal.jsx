import { DCDT_ESTADO_LABELS } from "../../domain/dcdt/dcdtConstants.js";
import { formatDcdtDisplayValueOrDash } from "../../domain/dcdt/dcdtDisplayText.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";

const UI = {
  overlay: "rgba(15,23,42,.45)",
  surface: "#ffffff",
  soft: "#f8fafc",
  border: "#dbe4ee",
  tx: "#0f172a",
  su: "#64748b",
};

function FieldRow({ label, value }) {
  const text = formatDcdtDisplayValueOrDash(value);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "130px 1fr",
        gap: 8,
        padding: "6px 0",
        borderBottom: `1px solid ${UI.border}`,
        fontSize: 13,
      }}
    >
      <div style={{ color: UI.su, fontWeight: 700, fontSize: 11 }}>{label}</div>
      <div style={{ color: UI.tx }}>{text}</div>
    </div>
  );
}

function parteLine(parte) {
  const nombre = formatDcdtDisplayValueOrDash(parte?.nombre);
  if (nombre === "—") return "—";
  const bits = [
    nombre,
    formatDcdtDisplayValueOrDash(parte?.nif),
    formatDcdtDisplayValueOrDash(parte?.domicilio || parte?.direccion),
  ].filter((x) => x && x !== "—");
  return bits.length ? bits.join(" · ") : "—";
}

export function DcdtReadonlyViewModal({ servicio, doc, dcdt, missing = [], onClose }) {
  const estadoLabel = DCDT_ESTADO_LABELS[dcdt?.estado] || dcdt?.estado || "—";
  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";
  const pending = Array.isArray(missing) ? missing : [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: UI.overlay,
        zIndex: 550,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.surface,
          borderRadius: 16,
          width: "min(96vw, 640px)",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${UI.border}`,
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${UI.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: UI.tx }}>DCDT</div>
          <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
            {serviceLabel} · {estadoLabel}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
          {pending.length ? (
            <div
              style={{
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 12,
                fontSize: 11,
                color: "#92400e",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Pendientes ({pending.length})</div>
              {pending.map((m) => m.label).join(" · ")}
            </div>
          ) : null}
          <FieldRow label="Cargador" value={parteLine(doc?.cargador)} />
          <FieldRow label="Transportista" value={parteLine(doc?.transportista)} />
          <FieldRow label="Destinatario" value={parteLine(doc?.destinatario)} />
          <FieldRow label="Origen" value={doc?.origen} />
          <FieldRow label="Destino" value={doc?.destino} />
          <FieldRow label="Matrícula tractora" value={doc?.vehiculo?.matricula} />
          {doc?.vehiculo?.remolque ? <FieldRow label="Matrícula remolque" value={doc.vehiculo.remolque} /> : null}
          <FieldRow
            label="Fecha transporte"
            value={doc?.fecha_transporte ? new Date(doc.fecha_transporte).toLocaleDateString("es-ES") : ""}
          />
          <FieldRow label="Mercancía" value={doc?.mercancia?.descripcion} />
          {doc?.mercancia?.peso_kg != null ? <FieldRow label="Peso (kg)" value={String(doc.mercancia.peso_kg)} /> : null}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${UI.border}`, background: UI.soft }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              background: "#f1f5f9",
              color: UI.tx,
              border: `1px solid ${UI.border}`,
              borderRadius: 12,
              padding: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
