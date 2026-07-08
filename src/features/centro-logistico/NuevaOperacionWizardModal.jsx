import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlanningCommands } from "../../domain/planning/commands/createPlanningCommands.js";
import { createPlanningQueries } from "../../domain/planning/queries/createPlanningQueries.js";
import { TRANSPORT_OBLIGATION_STATE } from "../../domain/planning/constants/EstadosTransportObligation.js";
import {
  buildCentroLogisticoObligationLines,
  centroLogisticoObservaciones,
  centroLogisticoOperacionLabel,
  destinosToRutaDestino,
  obligationStateLabel,
  resolveCentroLogisticoWizardStep,
} from "./centroLogisticoUi.js";
import { conductorAuthUid } from "../empresa/transportObligationOfficeUi.js";

const UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#0d9488",
  accentSoft: "#f0fdfa",
  green: "#16a34a",
  greenSoft: "#f0fdf4",
};

const STEP_TITLES = {
  datos: "1 · Datos básicos",
  plan: "2 · Planificar",
  recursos: "3 · Asignar recursos",
  generar: "4 · Generar expedición",
  enviar: "5 · Enviar al conductor",
  confirmacion: "Operación completada",
};

/**
 * Asistente Centro Logístico — reutiliza Transport Obligation y comandos Planning BC.
 */
export function NuevaOperacionWizardModal({
  open,
  onClose,
  empresaId,
  authUid,
  conductores = [],
  obligationId: initialObligationId = null,
  onSuccess,
  onNotifyAssignment,
  responsableUserId = null,
  responsableNombre = null,
}) {
  const [step, setStep] = useState("datos");
  const [obligationId, setObligationId] = useState(initialObligationId);
  const [obligation, setObligation] = useState(null);
  const [expeditionId, setExpeditionId] = useState(null);
  const [servicio, setServicio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedConfirmation, setGeneratedConfirmation] = useState(false);

  const [cliente, setCliente] = useState("");
  const [origen, setOrigen] = useState("");
  const [destinos, setDestinos] = useState([""]);
  const [fecha, setFecha] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [conductorId, setConductorId] = useState("");
  const [matricula, setMatricula] = useState("");
  const [remolque, setRemolque] = useState("");

  const commands = useMemo(() => createPlanningCommands(), []);
  const queries = useMemo(() => createPlanningQueries(), []);

  const hydrateFormFromObligation = useCallback((row) => {
    if (!row) return;
    const line = row.lines?.[0];
    if (line?.description && line.description !== "Transporte") {
      setCliente(line.description);
    }
    setOrigen(line?.originLocationRef || "");
    const destList = (row.lines || [])
      .map((l) => l.destinationLocationRef)
      .filter(Boolean);
    setDestinos(destList.length ? destList : [""]);
    setObservaciones(centroLogisticoObservaciones(row) || "");
  }, []);

  const loadObligation = useCallback(
    async (id) => {
      if (!id) return null;
      const row = await queries.obtenerTransportObligation.execute(id);
      setObligation(row);
      hydrateFormFromObligation(row);
      const linkedExp = row?.expeditionIds?.[row.expeditionIds.length - 1] || null;
      setExpeditionId(linkedExp);
      setStep(resolveCentroLogisticoWizardStep(row, linkedExp));
      return row;
    },
    [queries, hydrateFormFromObligation]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setGeneratedConfirmation(false);
    if (initialObligationId) {
      setObligationId(initialObligationId);
      void loadObligation(initialObligationId);
    } else {
      setStep("datos");
      setObligationId(null);
      setObligation(null);
      setExpeditionId(null);
      setServicio(null);
      setCliente("");
      setOrigen("");
      setDestinos([""]);
      setFecha("");
      setObservaciones("");
      setConductorId("");
      setMatricula("");
      setRemolque("");
    }
  }, [open, initialObligationId, loadObligation]);

  useEffect(() => {
    if (!conductorId) return;
    const c = conductores.find((x) => conductorAuthUid(x) === String(conductorId));
    if (c?.matricula) setMatricula(String(c.matricula));
    if (c?.remolque) setRemolque(String(c.remolque));
  }, [conductorId, conductores]);

  if (!open) return null;

  function updateDestino(index, value) {
    setDestinos((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  function addDestino() {
    setDestinos((prev) => [...prev, ""]);
  }

  function removeDestino(index) {
    setDestinos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSaveDatos() {
    setLoading(true);
    setError("");
    const lines = buildCentroLogisticoObligationLines({
      cliente,
      origen,
      destinos,
      observaciones,
      existingLines: obligation?.lines,
    });
    try {
      if (!obligationId) {
        const result = await commands.crearTransportObligation.execute({
          empresaId,
          externalReference: {
            source: "centro_logistico",
            externalId: `cl-${Date.now()}`,
            correlationId: null,
          },
          lines,
        });
        if (!result.ok) throw result.error;
        setObligationId(result.value.obligation.id);
        setObligation(result.value.obligation);
      } else {
        const result = await commands.actualizarTransportObligation.execute(obligationId, {
          lines,
          externalReference: obligation?.externalReference ?? {
            source: "centro_logistico",
            externalId: `cl-${obligationId}`,
            correlationId: null,
          },
        });
        if (!result.ok) throw result.error;
        setObligation(result.value.obligation);
      }
      setStep("plan");
    } catch (e) {
      setError(e?.message || "No se pudieron guardar los datos");
    } finally {
      setLoading(false);
    }
  }

  async function handlePlanificar() {
    if (!obligationId) return;
    setLoading(true);
    setError("");
    try {
      const result = await commands.planificarTransportObligation.execute(obligationId);
      if (!result.ok) throw result.error;
      setObligation(result.value.obligation);
      setStep("recursos");
    } catch (e) {
      setError(e?.message || "No se pudo planificar");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerarExpedicion() {
    if (!obligationId) return;
    setLoading(true);
    setError("");
    try {
      const result = await commands.generarExpedicionDesdeObligation.execute({
        transportObligationId: obligationId,
        empresaId,
        authUid,
        linkedBy: authUid,
        origen: origen.trim() || null,
        destino: destinosToRutaDestino(destinos),
        fechaInicio: fecha || null,
        cliente: cliente.trim() || null,
        referenciaCliente: observaciones.trim() || null,
        responsableUserId,
        responsableNombre,
      });
      if (!result.ok) throw result.error;
      setExpeditionId(result.value.expeditionId);
      setServicio(result.value.servicio);
      setObligation(result.value.obligation);
      setGeneratedConfirmation(true);
      setStep("enviar");
      onSuccess?.({ generated: true, obligationId, expeditionId: result.value.expeditionId });
    } catch (e) {
      setError(e?.message || "No se pudo generar la expedición");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnviar() {
    if (!obligationId || !expeditionId || !conductorId) return;
    setLoading(true);
    setError("");
    try {
      const conductor = conductores.find((c) => conductorAuthUid(c) === String(conductorId));
      const result = await commands.enviarExpedicionObligation.execute({
        transportObligationId: obligationId,
        expeditionId,
        conductorId,
        conductorNombre: conductor?.nombre || null,
        matricula: matricula.trim() || null,
        remolque: remolque.trim() || null,
        servicio,
        notifyAssignment: onNotifyAssignment,
      });
      if (!result.ok) throw result.error;
      setServicio(result.value.servicio);
      setStep("confirmacion");
      onSuccess?.({ sent: true, obligationId, expeditionId, servicio: result.value.servicio });
    } catch (e) {
      setError(e?.message || "No se pudo enviar al conductor");
    } finally {
      setLoading(false);
    }
  }

  const canPlan =
    obligation?.state === TRANSPORT_OBLIGATION_STATE.RECEIVED ||
    obligation?.state === TRANSPORT_OBLIGATION_STATE.PLANNED;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(15,23,42,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={() => !loading && onClose?.()}
    >
      <div
        style={{
          background: UI.surface,
          borderRadius: 14,
          border: `1px solid ${UI.border}`,
          width: "100%",
          maxWidth: 500,
          maxHeight: "90vh",
          overflow: "auto",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: UI.tx, marginBottom: 4 }}>
          Nueva operación
        </div>
        <div style={{ fontSize: 12, color: UI.muted, marginBottom: 16 }}>{STEP_TITLES[step]}</div>

        {obligation && step !== "confirmacion" && (
          <div
            style={{
              background: UI.accentSoft,
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              color: UI.tx,
              marginBottom: 12,
            }}
          >
            {obligationStateLabel(obligation.state)} · {centroLogisticoOperacionLabel(obligation)}
          </div>
        )}

        {step === "datos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={labelStyle}>
              Cliente
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Origen
              <input value={origen} onChange={(e) => setOrigen(e.target.value)} style={inputStyle} />
            </label>
            <div>
              <div style={{ fontSize: 12, color: UI.muted, marginBottom: 6 }}>Destinos</div>
              {destinos.map((dest, index) => (
                <div key={`dest-${index}`} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    value={dest}
                    onChange={(e) => updateDestino(index, e.target.value)}
                    style={{ ...inputStyle, marginTop: 0, flex: 1 }}
                    placeholder={`Destino ${index + 1}`}
                  />
                  {destinos.length > 1 ? (
                    <button type="button" onClick={() => removeDestino(index)} style={btnGhost}>
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
              <button type="button" onClick={addDestino} style={btnGhost}>
                + Añadir destino
              </button>
            </div>
            <label style={labelStyle}>
              Fecha
              <input
                type="datetime-local"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Observaciones
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              />
            </label>
          </div>
        )}

        {step === "plan" && (
          <p style={{ fontSize: 13, color: UI.muted, lineHeight: 1.55, margin: 0 }}>
            La operación quedará planificada y lista para asignar recursos y generar la expedición.
          </p>
        )}

        {step === "recursos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: UI.muted, margin: 0, lineHeight: 1.5 }}>
              Ruta: {origen || "Origen"} → {destinosToRutaDestino(destinos)}
              {fecha ? ` · ${fecha.replace("T", " ")}` : ""}
            </p>
            <label style={labelStyle}>
              Conductor
              <select
                value={conductorId}
                onChange={(e) => setConductorId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Seleccionar…</option>
                {conductores.filter((c) => conductorAuthUid(c)).map((c) => {
                  const uid = conductorAuthUid(c);
                  return (
                    <option key={uid} value={uid}>
                      {c.nombre || c.email || uid}
                    </option>
                  );
                })}
              </select>
            </label>
            <label style={labelStyle}>
              Matrícula tractora
              <input value={matricula} onChange={(e) => setMatricula(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Matrícula remolque
              <input value={remolque} onChange={(e) => setRemolque(e.target.value)} style={inputStyle} />
            </label>
          </div>
        )}

        {step === "generar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13, color: UI.muted, lineHeight: 1.5, margin: 0 }}>
              Se creará la expedición en flota con los datos planificados.
            </p>
            <div style={{ fontSize: 12, color: UI.tx, background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div>
                <strong>Cliente:</strong> {cliente || "—"}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Ruta:</strong> {origen || "Origen"} → {destinosToRutaDestino(destinos)}
              </div>
              {conductorId ? (
                <div style={{ marginTop: 4 }}>
                  <strong>Conductor:</strong>{" "}
                  {conductores.find((c) => conductorAuthUid(c) === String(conductorId))?.nombre ||
                    conductorId}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {step === "enviar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {generatedConfirmation && (
              <div
                style={{
                  background: UI.greenSoft,
                  color: UI.green,
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Expedición generada · ID {expeditionId?.slice(0, 8)}…
              </div>
            )}
            <p style={{ fontSize: 13, color: UI.muted, margin: 0, lineHeight: 1.5 }}>
              Confirma el envío al conductor seleccionado.
            </p>
            <div style={{ fontSize: 12, color: UI.tx }}>
              {conductores.find((c) => conductorAuthUid(c) === String(conductorId))?.nombre ||
                "Conductor no seleccionado"}
              {matricula ? ` · ${matricula}` : ""}
              {remolque ? ` · ${remolque}` : ""}
            </div>
          </div>
        )}

        {step === "confirmacion" && (
          <div
            style={{
              background: UI.greenSoft,
              borderRadius: 10,
              padding: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: UI.green }}>Expedición enviada</div>
            <div style={{ fontSize: 12, color: UI.muted, marginTop: 8, lineHeight: 1.5 }}>
              El conductor recibirá la asignación. La operación aparece en «En ejecución».
            </div>
          </div>
        )}

        {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onClose?.()} disabled={loading} style={btnSecondary}>
            {step === "confirmacion" ? "Cerrar" : "Cancelar"}
          </button>

          {step === "datos" && (
            <button
              type="button"
              onClick={handleSaveDatos}
              disabled={loading || !origen.trim() || !destinos.some((d) => d.trim())}
              style={btnPrimary}
            >
              Guardar y continuar
            </button>
          )}

          {step === "plan" && canPlan && (
            <button type="button" onClick={handlePlanificar} disabled={loading} style={btnPrimary}>
              Planificar →
            </button>
          )}

          {step === "recursos" && (
            <button
              type="button"
              onClick={() => setStep("generar")}
              disabled={loading || !conductorId}
              style={btnPrimary}
            >
              Continuar →
            </button>
          )}

          {step === "generar" && (
            <button type="button" onClick={handleGenerarExpedicion} disabled={loading} style={btnPrimary}>
              Generar expedición
            </button>
          )}

          {step === "enviar" && (
            <button
              type="button"
              onClick={handleEnviar}
              disabled={loading || !conductorId}
              style={btnPrimary}
            >
              Enviar al conductor
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 12, color: UI.muted, display: "block" };

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #dbe4ee",
  fontSize: 14,
  boxSizing: "border-box",
};

const btnPrimary = {
  background: "#0d9488",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  background: "#f8fafc",
  color: "#0f172a",
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const btnGhost = {
  background: "#f8fafc",
  color: "#0f172a",
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  padding: "6px 10px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
};
