import { useEffect, useMemo, useState } from "react";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { getStopOperacionMeta, mergeStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
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

function SummaryRow({ label, value }) {
  if (!String(value || "").trim()) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: UI.su }}>{label}</span>
      <span style={{ fontWeight: 700, color: UI.tx, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function AutonomoGenerarDecaModal({
  open,
  onClose,
  cargaStop,
  workspace,
  profile = {},
  busy = false,
  onConfirm,
  onUpdateMercancia,
  onAddDestino,
}) {
  const defaults = useMemo(() => defaultExpedienteDecaPartes(profile), [profile, open]);
  const [transportista, setTransportista] = useState(defaults.transportista);
  const [conductor, setConductor] = useState(defaults.conductor);
  const [vehiculo, setVehiculo] = useState(defaults.vehiculo);
  const [editOpen, setEditOpen] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);
  const [error, setError] = useState("");
  const [mercanciaForm, setMercanciaForm] = useState({ descripcion: "", peso_kg: "", palets: "", bultos: "" });
  const [mercanciaDirty, setMercanciaDirty] = useState(false);

  const { servicio, stops } = workspace || {};
  const destino = useMemo(
    () => (cargaStop && stops ? destinoForCarga(stops, cargaStop) : null),
    [cargaStop, stops],
  );

  const cargaForCheck = useMemo(() => {
    if (!cargaStop) return null;
    const meta = getStopOperacionMeta(cargaStop.notas);
    const mergedMerc = { ...(meta.mercancia || {}), ...mercanciaForm };
    return {
      ...cargaStop,
      notas: mergeStopOperacionMeta(cargaStop.notas, { mercancia: mergedMerc }),
    };
  }, [cargaStop, mercanciaForm]);

  const readiness = useMemo(() => {
    if (!cargaForCheck) return { ok: false, missing: ["Carga no seleccionada"], datos: null };
    return checkDecaReadinessForCarga({
      cargaStop: cargaForCheck,
      destinoStop: destino,
      servicio,
      profile,
      transportista,
      conductor,
      vehiculo,
    });
  }, [cargaForCheck, destino, servicio, profile, transportista, conductor, vehiculo]);

  useEffect(() => {
    if (!open || !cargaStop) return;
    const meta = getStopOperacionMeta(cargaStop.notas);
    const merc = meta.mercancia || {};
    setMercanciaForm({
      descripcion: String(merc.descripcion || "").trim(),
      peso_kg: merc.peso_kg != null ? String(merc.peso_kg) : "",
      palets: merc.palets != null ? String(merc.palets) : "",
      bultos: merc.bultos != null ? String(merc.bultos) : "",
    });
    setMercanciaDirty(false);
  }, [open, cargaStop?.id, cargaStop?.notas]);

  useEffect(() => {
    if (!open) return;
    setTransportista(defaults.transportista);
    setConductor(defaults.conductor);
    setVehiculo(defaults.vehiculo);
    setEditOpen(false);
    setSaveProfile(false);
    setError("");
  }, [open, defaults]);

  if (!open || !cargaStop) return null;

  const esNacional = isCargaNacional(cargaStop);

  async function handleSaveMercancia() {
    setError("");
    try {
      const merc = {};
      if (mercanciaForm.descripcion?.trim()) merc.descripcion = mercanciaForm.descripcion.trim();
      if (mercanciaForm.peso_kg !== "") merc.peso_kg = mercanciaForm.peso_kg;
      if (mercanciaForm.palets !== "") merc.palets = mercanciaForm.palets;
      if (mercanciaForm.bultos !== "") merc.bultos = mercanciaForm.bultos;
      await onUpdateMercancia?.({ mercancia: merc });
      setMercanciaDirty(false);
    } catch (e) {
      setError(e?.message || "No se pudo guardar mercancía");
    }
  }

  async function handleSubmit() {
    setError("");
    if (mercanciaDirty) {
      await handleSaveMercancia();
    }
    if (!readiness.ok) {
      setError(`Faltan datos: ${readiness.missing.join(", ")}`);
      return;
    }
    try {
      await onConfirm?.({
        transportista,
        conductor,
        vehiculo,
        cargaStopId: cargaStop.id,
        saveProfile,
      });
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
            {cargaStop.nombre} · antes de circular
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: "#f8fafc" }}>
          {!esNacional ? (
            <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.45 }}>
              Transporte internacional: usa CMR / carta de porte.
            </div>
          ) : (
            <>
              <div
                style={{
                  background: UI.card,
                  border: `1px solid ${UI.line}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 12,
                }}
              >
                <SummaryRow label="Transportista" value={transportista.nombre} />
                <SummaryRow label="NIF/CIF" value={transportista.nif} />
                <SummaryRow label="Conductor" value={conductor.nombre} />
                <SummaryRow label="Tractora" value={vehiculo.matricula} />
                <SummaryRow label="Remolque" value={vehiculo.remolque} />
                <button
                  type="button"
                  onClick={() => setEditOpen((v) => !v)}
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${UI.line}`,
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  {editOpen ? "Ocultar datos" : "Editar datos"}
                </button>
              </div>

              {editOpen ? (
                <div style={{ marginBottom: 12 }}>
                  <input
                    style={inputStyle}
                    placeholder="Transportista"
                    value={transportista.nombre}
                    onChange={(e) => setTransportista((p) => ({ ...p, nombre: e.target.value }))}
                  />
                  <input
                    style={inputStyle}
                    placeholder="NIF / CIF"
                    value={transportista.nif}
                    onChange={(e) => setTransportista((p) => ({ ...p, nif: e.target.value }))}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Conductor"
                    value={conductor.nombre}
                    onChange={(e) => setConductor((p) => ({ ...p, nombre: e.target.value }))}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Teléfono conductor"
                    value={conductor.telefono}
                    onChange={(e) => setConductor((p) => ({ ...p, telefono: e.target.value }))}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Matrícula tractora"
                    value={vehiculo.matricula}
                    onChange={(e) => setVehiculo((p) => ({ ...p, matricula: e.target.value }))}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Matrícula remolque"
                    value={vehiculo.remolque}
                    onChange={(e) => setVehiculo((p) => ({ ...p, remolque: e.target.value }))}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: UI.tx }}>
                    <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
                    Guardar en mi perfil
                  </label>
                </div>
              ) : null}

              <div
                style={{
                  background: UI.card,
                  border: `1px solid ${UI.line}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 8 }}>MERCANCÍA</div>
                {[
                  ["descripcion", "Mercancía / naturaleza *"],
                  ["peso_kg", "Peso (kg) *"],
                  ["palets", "Palets"],
                  ["bultos", "Bultos"],
                ].map(([k, label]) => (
                  <input
                    key={k}
                    style={inputStyle}
                    placeholder={label}
                    value={mercanciaForm[k]}
                    onChange={(e) => {
                      setMercanciaForm((p) => ({ ...p, [k]: e.target.value }));
                      setMercanciaDirty(true);
                    }}
                  />
                ))}
                {mercanciaDirty ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveMercancia()}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 10,
                      border: "none",
                      background: UI.blue,
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Guardar mercancía
                  </button>
                ) : null}
              </div>

              {!destino ? (
                <div
                  style={{
                    background: UI.amberSoft,
                    border: "1px solid #fde68a",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, color: UI.amber, fontSize: 14, marginBottom: 8 }}>Falta destino</div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAddDestino?.()}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 10,
                      border: "none",
                      background: UI.blue,
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Añadir destino
                  </button>
                </div>
              ) : null}

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
                    Faltan datos para DeCA
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: UI.tx, lineHeight: 1.5 }}>
                    {readiness.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
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
