import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlanningQueries } from "../../domain/planning/queries/createPlanningQueries.js";
import { TRANSPORT_OBLIGATION_STATE } from "../../domain/planning/constants/EstadosTransportObligation.js";
import { NuevaOperacionWizardModal } from "./NuevaOperacionWizardModal.jsx";
import {
  CENTRO_LOGISTICO_BUCKETS_ORDER,
  CENTRO_LOGISTICO_BUCKET_LABELS,
  centroLogisticoClienteLabel,
  centroLogisticoOperacionLabel,
  filterObligationsByCentroBucket,
  obligationCentroLogisticoBucket,
  obligationStateLabel,
} from "./centroLogisticoUi.js";

const UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#0d9488",
  accentSoft: "#f0fdfa",
};

/**
 * Pantalla principal Centro Logístico — operaciones agrupadas por estado (Planning BC).
 */
export function CentroLogisticoPanel({
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
  const [activeBucket, setActiveBucket] = useState(CENTRO_LOGISTICO_BUCKETS_ORDER[0]);
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
        limit: 80,
      });
      setObligations(rows);
    } catch {
      showToast?.("No se pudieron cargar las operaciones");
      setObligations([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, queries, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const bucketCounts = useMemo(() => {
    const counts = Object.fromEntries(CENTRO_LOGISTICO_BUCKETS_ORDER.map((b) => [b, 0]));
    for (const ob of obligations) {
      if (ob.state === TRANSPORT_OBLIGATION_STATE.SUPERSEDED) continue;
      const bucket = obligationCentroLogisticoBucket(ob);
      counts[bucket] = (counts[bucket] || 0) + 1;
    }
    return counts;
  }, [obligations]);

  const visibleObligations = useMemo(
    () => filterObligationsByCentroBucket(obligations, activeBucket),
    [obligations, activeBucket]
  );

  function openNew() {
    setWizardObligationId(null);
    setWizardOpen(true);
  }

  function openContinue(id) {
    setWizardObligationId(id);
    setWizardOpen(true);
  }

  function handleSuccess(payload) {
    if (payload?.sent) {
      showToast?.("Expedición enviada al conductor");
    } else if (payload?.generated) {
      showToast?.("Expedición generada correctamente");
    } else {
      showToast?.("Operación actualizada");
    }
    void load();
    onFlotaRefresh?.();
  }

  return (
    <div style={{ padding: "6px 12px 72px" }}>
      <div
        style={{
          background: UI.surface,
          border: `1px solid ${UI.border}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
          boxShadow: "0 1px 2px rgba(15,23,42,.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: UI.tx }}>Centro Logístico</div>
            <div style={{ fontSize: 11, color: UI.muted, marginTop: 4, lineHeight: 1.45 }}>
              Preparar expediciones desde oficina · Planning BC
            </div>
          </div>
          <button type="button" onClick={openNew} style={btnPrimary}>
            + Nueva operación
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {CENTRO_LOGISTICO_BUCKETS_ORDER.map((bucket) => (
          <button
            key={bucket}
            type="button"
            onClick={() => setActiveBucket(bucket)}
            style={{
              flexShrink: 0,
              background: activeBucket === bucket ? UI.accentSoft : "#f8fafc",
              border: `1px solid ${activeBucket === bucket ? "#5eead4" : UI.border}`,
              borderRadius: 20,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: activeBucket === bucket ? 700 : 550,
              color: activeBucket === bucket ? "#0f766e" : UI.muted,
              cursor: "pointer",
            }}
          >
            {CENTRO_LOGISTICO_BUCKET_LABELS[bucket]} ({bucketCounts[bucket] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: UI.muted, fontSize: 13 }}>
          Cargando operaciones…
        </div>
      ) : visibleObligations.length === 0 ? (
        <div
          style={{
            background: UI.surface,
            border: `1px solid ${UI.border}`,
            borderRadius: 12,
            padding: 28,
            textAlign: "center",
            color: UI.muted,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Sin operaciones en «{CENTRO_LOGISTICO_BUCKET_LABELS[activeBucket]}».
          {activeBucket === CENTRO_LOGISTICO_BUCKETS_ORDER[0] ? (
            <>
              <br />
              <button type="button" onClick={openNew} style={{ ...btnPrimary, marginTop: 12 }}>
                Crear primera operación
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleObligations.map((ob) => {
            const cliente = centroLogisticoClienteLabel(ob);
            const terminal =
              ob.state === TRANSPORT_OBLIGATION_STATE.FULFILLED ||
              ob.state === TRANSPORT_OBLIGATION_STATE.CANCELLED;
            return (
              <div
                key={ob.id}
                style={{
                  background: UI.surface,
                  border: `1px solid ${UI.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, color: UI.tx }}>
                      {centroLogisticoOperacionLabel(ob)}
                    </div>
                    {cliente ? (
                      <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>{cliente}</div>
                    ) : null}
                    <div style={{ fontSize: 11, color: UI.muted, marginTop: 6 }}>
                      {obligationStateLabel(ob.state)}
                      {ob.expeditionIds?.length
                        ? ` · ${ob.expeditionIds.length} expedición(es)`
                        : ""}
                    </div>
                  </div>
                  {!terminal ? (
                    <button type="button" onClick={() => openContinue(ob.id)} style={btnSecondary}>
                      Continuar
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: UI.muted, fontWeight: 600 }}>Cerrada</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NuevaOperacionWizardModal
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
  background: "#0d9488",
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
  flexShrink: 0,
};
