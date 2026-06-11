import { useCallback, useEffect, useMemo, useState } from "react";
import { PROP_UI, fmtT } from "./propietarioTheme.js";
import {
  ARCHIVO_LIMPIEZA,
  etiquetaEstado,
  etiquetaTratamiento,
} from "./archivoLimpiezaLabels.js";
import { RETENTION_STATE, RETENTION_TIER } from "../../domain/retention/retentionConstants.js";
import { catalogByClass } from "../../domain/retention/retentionPolicyCatalog.js";
import {
  aggregateMetricsByClass,
  aggregateMetricsByState,
  fetchRetentionAssetCatalog,
  fetchRetentionFrameworkMeta,
  fetchRetentionMetrics,
  fetchRetentionPolicies,
  fetchRetentionSimulationLog,
  formatBytes,
  runRetentionSimulation,
  saveRetentionPolicy,
} from "../../domain/retention/retentionModel.js";

const cardStyle = {
  background: PROP_UI.card,
  border: `1px solid ${PROP_UI.border}`,
  borderRadius: 12,
  padding: 16,
};

const btnSmall = {
  background: PROP_UI.card,
  color: PROP_UI.text,
  border: `1px solid ${PROP_UI.border}`,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnPrimary = {
  ...btnSmall,
  background: PROP_UI.navActive,
  color: "#fff",
  border: "none",
};

const STATE_COLORS = {
  [RETENTION_STATE.ACTIVO]: { bg: PROP_UI.successBg, color: PROP_UI.success },
  [RETENTION_STATE.ARCHIVADO]: { bg: PROP_UI.accentSoft, color: PROP_UI.accent },
  [RETENTION_STATE.BORRABLE]: { bg: PROP_UI.dangerBg, color: PROP_UI.danger },
};

function StateBadge({ state }) {
  const c = STATE_COLORS[state] || { bg: "#f1f5f9", color: PROP_UI.sub };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 999,
        background: c.bg,
        color: c.color,
      }}
    >
      {etiquetaEstado(state)}
    </span>
  );
}

function TierBadge({ tier }) {
  return (
    <span style={{ fontSize: 11, color: PROP_UI.sub, fontWeight: 600 }}>
      {etiquetaTratamiento(tier)}
    </span>
  );
}

function MetricTile({ label, value, sub }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 16px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: PROP_UI.text }}>{value}</div>
      <div style={{ fontSize: 12, color: PROP_UI.sub, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: PROP_UI.sub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PolicyRow({ policy, catalogRow, onSave, saving }) {
  const [draft, setDraft] = useState({
    days_until_archivable: policy.days_until_archivable,
    days_until_borable: policy.days_until_borable,
    min_retention_days: policy.min_retention_days,
    notes: policy.notes || "",
  });
  const tier = catalogRow?.tier;

  const dirty =
    draft.days_until_archivable !== policy.days_until_archivable ||
    draft.days_until_borable !== policy.days_until_borable ||
    draft.min_retention_days !== policy.min_retention_days ||
    (draft.notes || "") !== (policy.notes || "");

  return (
    <tr>
      <td style={{ padding: "10px 12px", verticalAlign: "middle" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{catalogRow?.label || policy.asset_class}</div>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <TierBadge tier={tier} />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <input
          type="number"
          min={0}
          value={draft.min_retention_days}
          onChange={(e) => setDraft((d) => ({ ...d, min_retention_days: Number(e.target.value) }))}
          style={{ width: 72, padding: "6px 8px", borderRadius: 6, border: `1px solid ${PROP_UI.border}` }}
          disabled={tier === RETENTION_TIER.RETENIDO}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <input
          type="number"
          min={0}
          value={draft.days_until_archivable}
          onChange={(e) => setDraft((d) => ({ ...d, days_until_archivable: Number(e.target.value) }))}
          style={{ width: 72, padding: "6px 8px", borderRadius: 6, border: `1px solid ${PROP_UI.border}` }}
          disabled={tier === RETENTION_TIER.RETENIDO}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <input
          type="number"
          min={0}
          value={draft.days_until_borable}
          onChange={(e) => setDraft((d) => ({ ...d, days_until_borable: Number(e.target.value) }))}
          style={{ width: 72, padding: "6px 8px", borderRadius: 6, border: `1px solid ${PROP_UI.border}` }}
          disabled={tier === RETENTION_TIER.RETENIDO}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <button
          type="button"
          style={{ ...btnSmall, opacity: dirty && !saving ? 1 : 0.45 }}
          disabled={!dirty || saving || tier === RETENTION_TIER.RETENIDO}
          onClick={() =>
            onSave({
              ...policy,
              ...draft,
            })
          }
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}

export function PropietarioRetencionPanel({ showToast, empresasOptions = [] }) {
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState("");
  const [meta, setMeta] = useState({ purgeEnabled: false, tableMissing: false });
  const [policies, setPolicies] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [simLog, setSimLog] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const catalogMap = useMemo(() => {
    const m = new Map();
    for (const c of catalog) m.set(c.asset_class, c);
    return m;
  }, [catalog]);

  const byState = useMemo(() => aggregateMetricsByState(metrics), [metrics]);
  const byClass = useMemo(() => aggregateMetricsByClass(metrics), [metrics]);
  const reclaimableBytes = byState[RETENTION_STATE.BORRABLE]?.bytes || 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const eid = empresaId || null;
      const [metaRes, polRes, catRes, metRes, logRes] = await Promise.all([
        fetchRetentionFrameworkMeta(),
        fetchRetentionPolicies(eid),
        fetchRetentionAssetCatalog(),
        fetchRetentionMetrics(eid),
        fetchRetentionSimulationLog(8),
      ]);
      if (metaRes.tableMissing || polRes.tableMissing) {
        setMeta({ ...metaRes, tableMissing: true });
        setPolicies([]);
        setCatalog([]);
        setMetrics([]);
        setSimLog([]);
        return;
      }
      setMeta(metaRes);
      setPolicies(polRes.policies);
      setCatalog(catRes.catalog);
      setMetrics(metRes.rows);
      setSimLog(logRes.rows);
    } catch (e) {
      showToast(e.message || "No se pudo cargar la información");
    }
    setLoading(false);
  }, [empresaId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSavePolicy(policy) {
    setSavingId(policy.id);
    try {
      await saveRetentionPolicy({ ...policy, purge_enabled: false });
      showToast("Plazos actualizados. No se ha activado ningún borrado.");
      await load();
    } catch (e) {
      showToast(e.message);
    }
    setSavingId(null);
  }

  async function handleSimulate() {
    setSimulating(true);
    try {
      const { result, tableMissing } = await runRetentionSimulation({
        empresaId: empresaId || null,
      });
      if (tableMissing) {
        showToast("Este módulo aún no está disponible en este entorno");
        return;
      }
      setSimulation(result);
      showToast("Simulación completada. No se ha borrado ningún dato.");
      const logRes = await fetchRetentionSimulationLog(8);
      setSimLog(logRes.rows);
    } catch (e) {
      showToast(e.message);
    }
    setSimulating(false);
  }

  if (loading && !policies.length && !meta.tableMissing) {
    return <div style={{ color: PROP_UI.sub, fontSize: 14 }}>Cargando información…</div>;
  }

  if (meta.tableMissing) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{ARCHIVO_LIMPIEZA.titulo}</div>
        <p style={{ fontSize: 14, color: PROP_UI.sub, margin: 0, lineHeight: 1.5 }}>
          Este módulo aún no está activo en este servidor. Cuando se active, podrá consultar plazos y simular
          archivo y limpieza sin que se elimine ningún dato.
        </p>
      </div>
    );
  }

  const borradoLabel = meta.purgeEnabled
    ? ARCHIVO_LIMPIEZA.activado
    : ARCHIVO_LIMPIEZA.desactivado;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: PROP_UI.text, margin: 0 }}>
              {ARCHIVO_LIMPIEZA.titulo}
            </h1>
            <p style={{ fontSize: 14, color: PROP_UI.sub, margin: "8px 0 0", lineHeight: 1.5, maxWidth: 640 }}>
              {ARCHIVO_LIMPIEZA.subtitulo}
            </p>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 999,
              background: PROP_UI.successBg,
              color: PROP_UI.success,
              border: `1px solid ${PROP_UI.success}`,
              whiteSpace: "nowrap",
            }}
          >
            {ARCHIVO_LIMPIEZA.modoSeguro}
          </span>
        </div>
        <div style={{ fontSize: 13, color: PROP_UI.text, fontWeight: 600 }}>
          {ARCHIVO_LIMPIEZA.borradoAutomatico}:{" "}
          <span style={{ color: meta.purgeEnabled ? PROP_UI.danger : PROP_UI.success }}>{borradoLabel}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label style={{ fontSize: 13, color: PROP_UI.sub }}>
          Empresa{" "}
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${PROP_UI.border}`,
              fontSize: 13,
            }}
          >
            <option value="">Todas las empresas</option>
            {empresasOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre || e.id}
              </option>
            ))}
          </select>
        </label>
        <button type="button" style={btnSmall} onClick={load} disabled={loading}>
          Actualizar
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" style={btnPrimary} onClick={handleSimulate} disabled={simulating}>
            {simulating ? ARCHIVO_LIMPIEZA.simulando : ARCHIVO_LIMPIEZA.simular}
          </button>
          <p style={{ fontSize: 12, color: PROP_UI.sub, margin: 0, maxWidth: 420, lineHeight: 1.45 }}>
            {ARCHIVO_LIMPIEZA.simulacionAyuda}
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <MetricTile
          label={ARCHIVO_LIMPIEZA.datosActivos}
          value={(byState[RETENTION_STATE.ACTIVO]?.count || 0).toLocaleString("es-ES")}
          sub={formatBytes(byState[RETENTION_STATE.ACTIVO]?.bytes)}
        />
        <MetricTile
          label={ARCHIVO_LIMPIEZA.datosArchivables}
          value={(byState[RETENTION_STATE.ARCHIVADO]?.count || 0).toLocaleString("es-ES")}
          sub={formatBytes(byState[RETENTION_STATE.ARCHIVADO]?.bytes)}
        />
        <MetricTile
          label={ARCHIVO_LIMPIEZA.datosEliminables}
          value={(byState[RETENTION_STATE.BORRABLE]?.count || 0).toLocaleString("es-ES")}
          sub={formatBytes(byState[RETENTION_STATE.BORRABLE]?.bytes)}
        />
        <MetricTile
          label={ARCHIVO_LIMPIEZA.espacioRecuperable}
          value={formatBytes(reclaimableBytes)}
          sub="Estimación orientativa"
        />
      </div>

      {simulation && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Resultado de la última simulación</div>
          <div style={{ fontSize: 13, color: PROP_UI.sub, marginBottom: 8 }}>
            {simulation.simulated_at} · {simulation.reclaimable_human || formatBytes(simulation.reclaimable_bytes)}{" "}
            de espacio recuperable estimado
          </div>
          {Array.isArray(simulation.by_class) && simulation.by_class.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${PROP_UI.border}`, textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Tipo de información</th>
                  <th style={{ padding: "8px 12px" }}>Situación</th>
                  <th style={{ padding: "8px 12px" }}>Registros</th>
                  <th style={{ padding: "8px 12px" }}>Tamaño est.</th>
                </tr>
              </thead>
              <tbody>
                {simulation.by_class.map((row, i) => (
                  <tr key={`${row.asset_class}-${row.retention_state}-${i}`} style={{ borderBottom: `1px solid ${PROP_UI.border}` }}>
                    <td style={{ padding: "8px 12px" }}>{catalogByClass(row.asset_class)?.label || row.asset_class}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <StateBadge state={row.retention_state} />
                    </td>
                    <td style={{ padding: "8px 12px" }}>{Number(row.items || 0).toLocaleString("es-ES")}</td>
                    <td style={{ padding: "8px 12px" }}>{formatBytes(row.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Resumen por tipo de información</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${PROP_UI.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Tipo</th>
              <th style={{ padding: "8px 12px" }}>Tratamiento</th>
              <th style={{ padding: "8px 12px" }}>En uso</th>
              <th style={{ padding: "8px 12px" }}>En archivo</th>
              <th style={{ padding: "8px 12px" }}>Eliminable</th>
              <th style={{ padding: "8px 12px" }}>Tamaño est.</th>
            </tr>
          </thead>
          <tbody>
            {byClass.map((row) => {
              const cat = catalogMap.get(row.asset_class) || catalogByClass(row.asset_class);
              return (
                <tr key={row.asset_class} style={{ borderBottom: `1px solid ${PROP_UI.border}` }}>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{cat?.label || row.asset_class}</div>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <TierBadge tier={cat?.tier} />
                  </td>
                  <td style={{ padding: "8px 12px" }}>{row.ACTIVO.toLocaleString("es-ES")}</td>
                  <td style={{ padding: "8px 12px" }}>{row.ARCHIVADO.toLocaleString("es-ES")}</td>
                  <td style={{ padding: "8px 12px" }}>{row.BORRABLE.toLocaleString("es-ES")}</td>
                  <td style={{ padding: "8px 12px" }}>{formatBytes(row.bytes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Plazos de conservación (todas las empresas)</div>
        <p style={{ fontSize: 12, color: PROP_UI.sub, margin: "0 0 12px" }}>
          Días contados desde el cierre del servicio. Los cambios solo ajustan plazos; no eliminan información.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PROP_UI.border}`, textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Tipo de información</th>
                <th style={{ padding: "8px 12px" }}>Tratamiento</th>
                <th style={{ padding: "8px 12px" }}>Mín. en uso</th>
                <th style={{ padding: "8px 12px" }}>Hasta archivo</th>
                <th style={{ padding: "8px 12px" }}>Hasta eliminación</th>
                <th style={{ padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {policies
                .filter((p) => p.scope === "global")
                .map((policy) => (
                  <PolicyRow
                    key={policy.id}
                    policy={policy}
                    catalogRow={catalogMap.get(policy.asset_class) || catalogByClass(policy.asset_class)}
                    onSave={handleSavePolicy}
                    saving={savingId === policy.id}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {simLog.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Simulaciones anteriores</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: PROP_UI.sub }}>
            {simLog.map((entry) => (
              <li key={entry.id} style={{ marginBottom: 6 }}>
                {fmtT(entry.created_at)} —{" "}
                {entry.result?.reclaimable_human || formatBytes(entry.result?.reclaimable_bytes)}{" "}
                recuperables estimados
                {entry.empresa_id ? ` (empresa filtrada)` : " (todas las empresas)"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
