import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlanningCommands } from "../../domain/planning/commands/createPlanningCommands.js";
import { createPlanningQueries } from "../../domain/planning/queries/createPlanningQueries.js";
import { TRANSPORT_OBLIGATION_STATE } from "../../domain/planning/constants/EstadosTransportObligation.js";
import {
  OBLIGATION_STATE_LABELS,
  obligationRouteLabel,
  resolveWizardStep,
} from "./transportObligationOfficeUi.js";

const UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
  green: "#16a34a",
  greenSoft: "#f0fdf4",
};

const EMPTY_LINE = () => ({
  lineId: `line-${Date.now()}`,
  description: "",
  quantity: null,
  unit: "pal",
  originLocationRef: "",
  destinationLocationRef: "",
});

/**
 * Wizard mínimo: Obligación → Planificar → Expedición → Asignar → Enviar.
 * Toda persistencia vía Planning Commands / Queries.
 */
export function TransportObligationWizardModal({
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
  const [step, setStep] = useState("create");
  const [obligationId, setObligationId] = useState(initialObligationId);
  const [obligation, setObligation] = useState(null);
  const [expeditionId, setExpeditionId] = useState(null);
  const [servicio, setServicio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [descripcion, setDescripcion] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [referenciaExterna, setReferenciaExterna] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [cliente, setCliente] = useState("");
  const [conductorId, setConductorId] = useState("");
  const [matricula, setMatricula] = useState("");
  const [remolque, setRemolque] = useState("");

  const commands = useMemo(() => createPlanningCommands(), []);
  const queries = useMemo(() => createPlanningQueries(), []);

  const loadObligation = useCallback(
    async (id) => {
      if (!id) return null;
      const row = await queries.obtenerTransportObligation.execute(id);
      setObligation(row);
      if (row?.lines?.[0]) {
        setDescripcion(row.lines[0].description || "");
        setOrigen(row.lines[0].originLocationRef || "");
        setDestino(row.lines[0].destinationLocationRef || "");
      }
      const linkedExp = row?.expeditionIds?.[row.expeditionIds.length - 1] || null;
      if (linkedExp) {
        setExpeditionId(linkedExp);
      }
      setStep(resolveWizardStep(row, linkedExp));
      return row;
    },
    [queries]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    if (initialObligationId) {
      setObligationId(initialObligationId);
      void loadObligation(initialObligationId);
    } else {
      setStep("create");
      setObligationId(null);
      setObligation(null);
      setExpeditionId(null);
      setServicio(null);
      setDescripcion("");
      setOrigen("");
      setDestino("");
      setReferenciaExterna("");
    }
  }, [open, initialObligationId, loadObligation]);

  useEffect(() => {
    if (!conductorId) return;
    const c = conductores.find((x) => String(x.uid || x.id) === String(conductorId));
    if (c?.matricula) setMatricula(String(c.matricula));
    if (c?.remolque) setRemolque(String(c.remolque));
  }, [conductorId, conductores]);

  if (!open) return null;

  async function handleCreate() {
    setLoading(true);
    setError("");
    try {
      const result = await commands.crearTransportObligation.execute({
        empresaId,
        externalReference: referenciaExterna.trim()
          ? { source: "manual", externalId: referenciaExterna.trim(), correlationId: null }
          : null,
        lines: [
          {
            ...EMPTY_LINE(),
            description: descripcion.trim() || "Transporte",
            originLocationRef: origen.trim() || null,
            destinationLocationRef: destino.trim() || null,
          },
        ],
      });
      if (!result.ok) throw result.error;
      setObligationId(result.value.obligation.id);
      setObligation(result.value.obligation);
      setStep("edit");
    } catch (e) {
      setError(e?.message || "No se pudo crear la obligación");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (!obligationId) return;
    setLoading(true);
    setError("");
    try {
      const result = await commands.actualizarTransportObligation.execute(obligationId, {
        lines: [
          {
            lineId: obligation?.lines?.[0]?.lineId || EMPTY_LINE().lineId,
            description: descripcion.trim() || "Transporte",
            quantity: obligation?.lines?.[0]?.quantity ?? null,
            unit: obligation?.lines?.[0]?.unit ?? "pal",
            originLocationRef: origen.trim() || null,
            destinationLocationRef: destino.trim() || null,
          },
        ],
        externalReference: referenciaExterna.trim()
          ? { source: "manual", externalId: referenciaExterna.trim(), correlationId: null }
          : obligation?.externalReference ?? null,
      });
      if (!result.ok) throw result.error;
      setObligation(result.value.obligation);
      setStep("plan");
    } catch (e) {
      setError(e?.message || "No se pudo guardar");
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
      setStep("generate");
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
        destino: destino.trim() || null,
        fechaInicio: fechaInicio || null,
        cliente: cliente.trim() || null,
        referenciaCliente: referenciaExterna.trim() || null,
        responsableUserId,
        responsableNombre,
      });
      if (!result.ok) throw result.error;
      setExpeditionId(result.value.expeditionId);
      setServicio(result.value.servicio);
      setObligation(result.value.obligation);
      setStep("assign");
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
      const conductor = conductores.find((c) => String(c.uid || c.id) === String(conductorId));
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
      onSuccess?.({ obligationId, expeditionId, servicio: result.value.servicio });
      onClose?.();
    } catch (e) {
      setError(e?.message || "No se pudo enviar al conductor");
    } finally {
      setLoading(false);
    }
  }

  const stepTitle = {
    create: "1 · Nueva obligación",
    edit: "2 · Editar datos",
    plan: "3 · Planificar",
    generate: "4 · Generar expedición",
    assign: "5 · Asignar y enviar",
  }[step];

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
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: UI.tx, marginBottom: 4 }}>
          Obligación de transporte
        </div>
        <div style={{ fontSize: 12, color: UI.muted, marginBottom: 16 }}>{stepTitle}</div>

        {obligation && (
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
            {OBLIGATION_STATE_LABELS[obligation.state] || obligation.state} ·{" "}
            {obligationRouteLabel(obligation)}
          </div>
        )}

        {(step === "create" || step === "edit") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Descripción
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                style={inputStyle}
                placeholder="Mercancía / servicio"
              />
            </label>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Origen
              <input value={origen} onChange={(e) => setOrigen(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Destino
              <input value={destino} onChange={(e) => setDestino(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Ref. externa (opcional)
              <input
                value={referenciaExterna}
                onChange={(e) => setReferenciaExterna(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>
        )}

        {step === "plan" && (
          <p style={{ fontSize: 13, color: UI.muted, lineHeight: 1.5 }}>
            La obligación quedará lista para generar una expedición de flota.
          </p>
        )}

        {step === "generate" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Cliente (opcional)
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Fecha inicio
              <input
                type="datetime-local"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                style={inputStyle}
              />
            </label>
            <p style={{ fontSize: 12, color: UI.muted, margin: 0 }}>
              Ruta: {origen || "Origen"} → {destino || "Destino"}
            </p>
          </div>
        )}

        {step === "assign" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {expeditionId && (
              <div style={{ fontSize: 12, color: UI.green }}>
                Expedición creada · pendiente de envío al conductor
              </div>
            )}
            <label style={{ fontSize: 12, color: UI.muted }}>
              Conductor
              <select
                value={conductorId}
                onChange={(e) => setConductorId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Seleccionar…</option>
                {conductores.map((c) => (
                  <option key={c.uid || c.id} value={c.uid || c.id}>
                    {c.nombre || c.email || c.uid}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Matrícula tractora
              <input value={matricula} onChange={(e) => setMatricula(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: UI.muted }}>
              Matrícula remolque
              <input value={remolque} onChange={(e) => setRemolque(e.target.value)} style={inputStyle} />
            </label>
          </div>
        )}

        {error && (
          <div style={{ color: "#dc2626", fontSize: 12, marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onClose?.()} disabled={loading} style={btnSecondary}>
            Cancelar
          </button>
          {step === "create" && (
            <button type="button" onClick={handleCreate} disabled={loading} style={btnPrimary}>
              Crear obligación
            </button>
          )}
          {step === "edit" && (
            <>
              <button type="button" onClick={handleSaveEdit} disabled={loading} style={btnSecondary}>
                Guardar
              </button>
              {obligation?.state === TRANSPORT_OBLIGATION_STATE.RECEIVED && (
                <button type="button" onClick={handlePlanificar} disabled={loading} style={btnPrimary}>
                  Planificar →
                </button>
              )}
            </>
          )}
          {step === "plan" && (
            <button type="button" onClick={handlePlanificar} disabled={loading} style={btnPrimary}>
              Confirmar planificación
            </button>
          )}
          {step === "generate" && (
            <button type="button" onClick={handleGenerarExpedicion} disabled={loading} style={btnPrimary}>
              Generar expedición
            </button>
          )}
          {step === "assign" && (
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
  background: "#2563eb",
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
