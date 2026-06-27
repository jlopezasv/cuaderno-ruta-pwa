import { useEffect, useMemo, useRef, useState } from "react";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { SERVICIO_ALCANCE, SERVICIO_ALCANCE_LABELS } from "../../domain/service/servicioAlcance.js";
import {
  defaultExpedienteDecaPartes,
  listNacionalCargas,
  previewNacionalDecas,
} from "../../modules/autonomo-expediente/autonomoExpedienteDeca.js";
import { SignaturePad } from "../services/components/ExpedienteClosureBlock.jsx";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  greenSoft: "#dcfce7",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${UI.line}`,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 15,
  marginBottom: 8,
  color: UI.tx,
};

const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: UI.su,
  marginBottom: 4,
  letterSpacing: 0.3,
};

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: UI.blue, letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function AutonomoGenerarExpedienteModal({
  open,
  onClose,
  workspace,
  profile = {},
  busy = false,
  onConfirm,
}) {
  const defaults = useMemo(() => defaultExpedienteDecaPartes(profile), [profile, open]);
  const [transportista, setTransportista] = useState(defaults.transportista);
  const [conductor, setConductor] = useState(defaults.conductor);
  const [comentario, setComentario] = useState("");
  const [hasFirma, setHasFirma] = useState(false);
  const [error, setError] = useState("");
  const firmaRef = useRef(null);

  const { servicio, cargas, stops, evidenciasByStop } = workspace || {};
  const nacionalCargas = useMemo(() => listNacionalCargas(cargas || []), [cargas]);
  const decaPreviews = useMemo(
    () =>
      previewNacionalDecas({
        cargas: cargas || [],
        stops: stops || [],
        servicio,
        profile,
        evidenciasByStop: evidenciasByStop || {},
        transportista,
        conductor,
      }),
    [cargas, stops, servicio, profile, evidenciasByStop, transportista, conductor],
  );

  useEffect(() => {
    if (!open) return;
    setTransportista(defaults.transportista);
    setConductor(defaults.conductor);
    setComentario("");
    setHasFirma(false);
    setError("");
  }, [open, defaults]);

  if (!open) return null;

  async function handleSubmit() {
    setError("");
    if (!hasFirma) {
      setError("Añade tu firma para generar el expediente.");
      return;
    }
    if (!String(transportista.nombre || "").trim()) {
      setError("Indica el nombre del transportista.");
      return;
    }
    if (!String(conductor.nombre || "").trim()) {
      setError("Indica el nombre del conductor.");
      return;
    }
    try {
      await onConfirm?.({
        transportista,
        conductor,
        comentario,
        firmaCanvas: firmaRef.current,
      });
    } catch (e) {
      setError(e?.message || "No se pudo generar el expediente");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 14000,
        background: "rgba(15,23,42,.5)",
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
          maxHeight: "94vh",
          background: UI.card,
          borderRadius: "16px 16px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${UI.line}` }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: UI.tx }}>Finalizar expediente</div>
        <div style={{ fontSize: 13, color: UI.su, marginTop: 4, lineHeight: 1.45 }}>
          Firma de cierre{nacionalCargas.length ? ` y generación de ${nacionalCargas.length} DeCA` : ""}.
        </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: "#f8fafc" }}>
          <Section title="Transportista (autónomo)">
            <Field label="Nombre / razón social">
              <input
                style={inputStyle}
                value={transportista.nombre}
                onChange={(e) => setTransportista((p) => ({ ...p, nombre: e.target.value }))}
              />
            </Field>
            <Field label="NIF / CIF">
              <input
                style={inputStyle}
                value={transportista.nif}
                onChange={(e) => setTransportista((p) => ({ ...p, nif: e.target.value }))}
              />
            </Field>
            <Field label="Domicilio">
              <input
                style={inputStyle}
                value={transportista.domicilio}
                onChange={(e) => setTransportista((p) => ({ ...p, domicilio: e.target.value }))}
              />
            </Field>
          </Section>

          <Section title="Conductor del viaje">
            <div style={{ fontSize: 12, color: UI.su, marginBottom: 10, lineHeight: 1.4 }}>
              Puedes indicar otro chofer si no conduces tú.
            </div>
            <Field label="Nombre">
              <input
                style={inputStyle}
                value={conductor.nombre}
                onChange={(e) => setConductor((p) => ({ ...p, nombre: e.target.value }))}
              />
            </Field>
            <Field label="DNI / NIF">
              <input
                style={inputStyle}
                value={conductor.dni}
                onChange={(e) => setConductor((p) => ({ ...p, dni: e.target.value }))}
              />
            </Field>
            <Field label="Teléfono">
              <input
                style={inputStyle}
                value={conductor.telefono}
                onChange={(e) => setConductor((p) => ({ ...p, telefono: e.target.value }))}
              />
            </Field>
          </Section>

          {nacionalCargas.length ? (
            <Section title={`${DECA_SHORT_LABEL} nacional (${nacionalCargas.length})`}>
              {decaPreviews.map((p) => (
                <div
                  key={p.cargaStopId}
                  style={{
                    background: UI.blueSoft,
                    border: `1px solid #bfdbfe`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    marginBottom: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 800, color: UI.tx }}>{p.cargaNombre}</div>
                  <div style={{ color: UI.su, marginTop: 4 }}>
                    {p.origen} → {p.destino}
                  </div>
                  <div style={{ color: UI.su, fontSize: 12, marginTop: 2 }}>Matrícula: {p.matricula}</div>
                </div>
              ))}
            </Section>
          ) : (
            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                color: UI.su,
                marginBottom: 16,
                lineHeight: 1.45,
              }}
            >
              Sin cargas {SERVICIO_ALCANCE_LABELS[SERVICIO_ALCANCE.NACIONAL].toLowerCase()}es — no se generará {DECA_SHORT_LABEL}.
            </div>
          )}

          <Section title="Cierre">
            <Field label="Comentario final (opcional)">
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
              />
            </Field>
            <div style={labelStyle}>Firma</div>
            <SignaturePad canvasRef={firmaRef} onInkChange={setHasFirma} />
          </Section>

          {error ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${UI.line}`, background: UI.card }}>
          <button
            type="button"
            disabled={busy || !hasFirma}
            onClick={() => void handleSubmit()}
            style={{
              width: "100%",
              minHeight: 50,
              borderRadius: 12,
              border: "none",
              background: hasFirma ? UI.green : "#94a3b8",
              color: "#fff",
              fontSize: 16,
              fontWeight: 800,
              cursor: busy || !hasFirma ? "default" : "pointer",
              opacity: busy ? 0.75 : 1,
              marginBottom: 8,
            }}
          >
            {busy
              ? "Finalizando…"
              : nacionalCargas.length
                ? `Finalizar + ${nacionalCargas.length} DeCA`
                : "Finalizar expediente"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              width: "100%",
              minHeight: 44,
              borderRadius: 12,
              border: `1px solid ${UI.line}`,
              background: "#fff",
              color: UI.tx,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
