import { useEffect, useMemo, useState } from "react";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import {
  checkDecaReadinessForCarga,
  defaultExpedienteDecaPartes,
  destinoForCarga,
  isCargaNacional,
} from "../../modules/autonomo-expediente/autonomoExpedienteDeca.js";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
  amber: "#b45309",
  amberSoft: "#fef3c7",
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

export function AutonomoGenerarDecaModal({
  open,
  onClose,
  cargaStop,
  workspace,
  profile = {},
  busy = false,
  onConfirm,
}) {
  const defaults = useMemo(() => defaultExpedienteDecaPartes(profile), [profile, open]);
  const [transportista, setTransportista] = useState(defaults.transportista);
  const [conductor, setConductor] = useState(defaults.conductor);
  const [error, setError] = useState("");

  const { servicio, stops } = workspace || {};
  const destino = useMemo(
    () => (cargaStop && stops ? destinoForCarga(stops, cargaStop) : null),
    [cargaStop, stops],
  );

  const readiness = useMemo(() => {
    if (!cargaStop) return { ok: false, missing: ["Carga no seleccionada"], datos: null };
    return checkDecaReadinessForCarga({
      cargaStop,
      destinoStop: destino,
      servicio,
      profile,
      transportista,
      conductor,
    });
  }, [cargaStop, destino, servicio, profile, transportista, conductor]);

  useEffect(() => {
    if (!open) return;
    setTransportista(defaults.transportista);
    setConductor(defaults.conductor);
    setError("");
  }, [open, defaults]);

  if (!open || !cargaStop) return null;

  const esNacional = isCargaNacional(cargaStop);

  async function handleSubmit() {
    setError("");
    if (!readiness.ok) {
      setError(`Faltan datos: ${readiness.missing.join(", ")}`);
      return;
    }
    try {
      await onConfirm?.({ transportista, conductor, cargaStopId: cargaStop.id });
    } catch (e) {
      setError(e?.message || "No se pudo generar DeCA");
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
          <div style={{ fontSize: 18, fontWeight: 800, color: UI.tx }}>Generar {DECA_SHORT_LABEL}</div>
          <div style={{ fontSize: 13, color: UI.su, marginTop: 4 }}>
            {cargaStop.nombre} · antes de iniciar viaje
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: "#f8fafc" }}>
          {!esNacional ? (
            <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.45 }}>
              Esta carga es internacional. Usa CMR u otros documentos en lugar de DeCA nacional.
            </div>
          ) : (
            <>
              {!readiness.ok ? (
                <div
                  style={{
                    background: UI.amberSoft,
                    border: "1px solid #fde68a",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 800, color: UI.amber, fontSize: 14, marginBottom: 8 }}>
                    Faltan datos para generar DeCA
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: UI.tx, lineHeight: 1.5 }}>
                    {readiness.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  {!destino ? (
                    <div style={{ fontSize: 12, color: UI.su, marginTop: 10 }}>
                      Añade un destino al expediente para completar el DeCA.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    background: UI.blueSoft,
                    border: "1px solid #bfdbfe",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 14,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 800, color: UI.tx }}>Listo para generar</div>
                  <div style={{ color: UI.su, marginTop: 4 }}>
                    {readiness.datos?.origen?.lugar || cargaStop.nombre} →{" "}
                    {readiness.datos?.destino?.lugar || destino?.nombre || "—"}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 8 }}>TRANSPORTISTA</div>
              <input
                style={inputStyle}
                placeholder="Nombre transportista"
                value={transportista.nombre}
                onChange={(e) => setTransportista((p) => ({ ...p, nombre: e.target.value }))}
              />
              <input
                style={inputStyle}
                placeholder="NIF / CIF"
                value={transportista.nif}
                onChange={(e) => setTransportista((p) => ({ ...p, nif: e.target.value }))}
              />

              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 8, marginTop: 4 }}>
                CONDUCTOR
              </div>
              <input
                style={inputStyle}
                placeholder="Nombre conductor"
                value={conductor.nombre}
                onChange={(e) => setConductor((p) => ({ ...p, nombre: e.target.value }))}
              />
            </>
          )}

          {error ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                color: "#b91c1c",
                marginTop: 8,
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${UI.line}`, background: UI.card }}>
          {esNacional ? (
            <button
              type="button"
              disabled={busy || !readiness.ok}
              onClick={() => void handleSubmit()}
              style={{
                width: "100%",
                minHeight: 50,
                borderRadius: 12,
                border: "none",
                background: readiness.ok ? UI.green : "#94a3b8",
                color: "#fff",
                fontSize: 16,
                fontWeight: 800,
                cursor: busy || !readiness.ok ? "default" : "pointer",
                opacity: busy ? 0.75 : 1,
                marginBottom: 8,
              }}
            >
              {busy ? "Generando…" : `Generar ${DECA_SHORT_LABEL}`}
            </button>
          ) : null}
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
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
