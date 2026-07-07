import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlanningQueries } from "../../domain/planning/queries/createPlanningQueries.js";
import { TransportObligationWizardModal } from "./TransportObligationWizardModal.jsx";
import {
  OBLIGATION_STATE_LABELS,
  obligationRouteLabel,
} from "./transportObligationOfficeUi.js";

const UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
};

/**
 * Panel mínimo Oficina — Obligaciones de transporte (Planning BC).
 */
export function EmpresaTransportObligationsPanel({
  empresaId,
  authUid,
  conductores = [],
  showToast,
  onFlotaRefresh,
  onNotifyAssignment,
  responsableUserId = null,
  responsableNombre = null,
}) {
  const [obligations, setObligations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardObligationId, setWizardObligationId] = useState(null);

  const queries = useMemo(() => createPlanningQueries(), []);

  const load = useCallback(async () => {
    if (!empresaId) {
      setObligations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await queries.listarTransportObligationsPorEmpresa.execute(empresaId, {
        limit: 40,
      });
      setObligations(rows);
    } catch {
      showToast?.("No se pudieron cargar las obligaciones");
      setObligations([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, queries, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setWizardObligationId(null);
    setWizardOpen(true);
  }

  function openContinue(id) {
    setWizardObligationId(id);
    setWizardOpen(true);
  }

  function handleSuccess() {
    showToast?.("Expedición enviada al conductor");
    void load();
    onFlotaRefresh?.();
  }

  return (
    <div style={{ padding: "0 0 24px" }}>
      <div
        style={{
          background: UI.surface,
          border: `1px solid ${UI.border}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 650, color: UI.tx }}>Obligaciones de transporte</div>
            <div style={{ fontSize: 11, color: UI.muted, marginTop: 4, lineHeight: 1.45 }}>
              Crear, planificar y convertir en expedición asignada — Planning BC
            </div>
          </div>
          <button type="button" onClick={openNew} style={btnPrimary}>
            + Nueva
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: UI.muted, fontSize: 13 }}>
          Cargando obligaciones…
        </div>
      ) : obligations.length === 0 ? (
        <div
          style={{
            background: UI.surface,
            border: `1px solid ${UI.border}`,
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            color: UI.muted,
            fontSize: 13,
          }}
        >
          Sin obligaciones. Crea la primera para iniciar el flujo.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {obligations.map((ob) => (
            <div
              key={ob.id}
              style={{
                background: UI.surface,
                border: `1px solid ${UI.border}`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: UI.tx }}>
                    {obligationRouteLabel(ob)}
                  </div>
                  <div style={{ fontSize: 11, color: UI.muted, marginTop: 4 }}>
                    {OBLIGATION_STATE_LABELS[ob.state] || ob.state}
                    {ob.expeditionIds?.length
                      ? ` · ${ob.expeditionIds.length} expedición(es)`
                      : ""}
                  </div>
                </div>
                <button type="button" onClick={() => openContinue(ob.id)} style={btnSecondary}>
                  Continuar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TransportObligationWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        empresaId={empresaId}
        authUid={authUid}
        conductores={conductores}
        obligationId={wizardObligationId}
        onSuccess={handleSuccess}
        onNotifyAssignment={onNotifyAssignment}
        responsableUserId={responsableUserId}
        responsableNombre={responsableNombre}
      />
    </div>
  );
}

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const btnSecondary = {
  background: "#f8fafc",
  color: "#0f172a",
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
};
