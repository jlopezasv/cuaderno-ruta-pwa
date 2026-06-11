import { sbFetch } from "../../data/supabaseClient.js";
import { RETENTION_SCOPE, RETENTION_STATE } from "./retentionConstants.js";

const POLICY_COLS =
  "id,scope,empresa_id,asset_class,days_until_archivable,days_until_borable,min_retention_days,purge_enabled,notes,updated_at";

function isTableMissingResponse(r) {
  if (r.status === 404) return true;
  if (!r.ok) {
    const body = typeof r.text === "function" ? "" : "";
    return /retention_|42P01|PGRST205|does not exist/i.test(body);
  }
  return false;
}

export async function fetchRetentionAssetCatalog() {
  const r = await sbFetch(
    "/rest/v1/retention_asset_catalog?order=asset_class.asc&select=asset_class,label,tier,entity_hint,includes_storage,description"
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/retention_asset_catalog|42P01|PGRST205/i.test(body)) {
      return { catalog: [], tableMissing: true };
    }
    throw new Error("No se pudo cargar catálogo de retención");
  }
  const catalog = await r.json();
  return { catalog: Array.isArray(catalog) ? catalog : [], tableMissing: false };
}

export async function fetchRetentionFrameworkMeta() {
  const r = await sbFetch("/rest/v1/retention_framework_meta?key=eq.framework&select=key,value,updated_at");
  if (r.status === 404 || !r.ok) {
    const body = await r.text().catch(() => "");
    if (/retention_framework_meta|42P01|PGRST205/i.test(body) || r.status === 404) {
      return { tableMissing: true, purgeEnabled: false };
    }
    throw new Error("No se pudo leer configuración de retención");
  }
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  const purgeEnabled = !!row?.value?.purge_enabled;
  return { tableMissing: false, purgeEnabled, meta: row?.value || {} };
}

export async function fetchRetentionPolicies(empresaId = null) {
  let q = `/rest/v1/retention_policy_config?order=asset_class.asc&select=${POLICY_COLS}`;
  if (empresaId) {
    q += `&or=(scope.eq.global,and(scope.eq.empresa,empresa_id.eq.${empresaId}))`;
  } else {
    q += "&scope=eq.global";
  }
  const r = await sbFetch(q);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/retention_policy_config|42P01|PGRST205/i.test(body)) {
      return { policies: [], tableMissing: true };
    }
    throw new Error("No se pudieron cargar políticas");
  }
  const policies = await r.json();
  return { policies: Array.isArray(policies) ? policies : [], tableMissing: false };
}

export async function saveRetentionPolicy(policy) {
  const body = {
    scope: policy.scope || RETENTION_SCOPE.GLOBAL,
    empresa_id: policy.empresa_id || null,
    asset_class: policy.asset_class,
    days_until_archivable: Number(policy.days_until_archivable) || 0,
    days_until_borable: Number(policy.days_until_borable) || 0,
    min_retention_days: Number(policy.min_retention_days) || 0,
    purge_enabled: !!policy.purge_enabled,
    notes: policy.notes || null,
    updated_at: new Date().toISOString(),
  };

  if (policy.id) {
    const r = await sbFetch(`/rest/v1/retention_policy_config?id=eq.${policy.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("No se pudo actualizar la política");
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : null;
  }

  const r = await sbFetch("/rest/v1/retention_policy_config", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("No se pudo crear la política");
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}

export async function fetchRetentionMetrics(empresaId = null) {
  let q = "/rest/v1/v_retention_metrics_summary?select=*";
  if (empresaId) q += `&empresa_id=eq.${empresaId}`;
  const r = await sbFetch(q);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/v_retention_metrics_summary|42P01|PGRST205/i.test(body)) {
      return { rows: [], tableMissing: true };
    }
    throw new Error("No se pudieron cargar métricas");
  }
  const rows = await r.json();
  return { rows: Array.isArray(rows) ? rows : [], tableMissing: false };
}

export async function runRetentionSimulation({ empresaId = null, overrideDays = null } = {}) {
  const r = await sbFetch("/rest/v1/rpc/retention_run_simulation", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_empresa_id: empresaId || null,
      p_override_days: overrideDays || null,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/retention_run_simulation|42P01|PGRST205/i.test(body)) {
      return { tableMissing: true, result: null };
    }
    throw new Error(body || "Simulación fallida");
  }
  const result = await r.json();
  return { tableMissing: false, result };
}

export function aggregateMetricsByState(rows) {
  const out = {
    [RETENTION_STATE.ACTIVO]: { count: 0, bytes: 0 },
    [RETENTION_STATE.ARCHIVADO]: { count: 0, bytes: 0 },
    [RETENTION_STATE.BORRABLE]: { count: 0, bytes: 0 },
  };
  for (const row of rows || []) {
    const st = row.retention_state || RETENTION_STATE.ACTIVO;
    if (!out[st]) out[st] = { count: 0, bytes: 0 };
    out[st].count += Number(row.item_count) || 0;
    out[st].bytes += Number(row.estimated_bytes) || 0;
  }
  return out;
}

export async function fetchRetentionSimulationLog(limit = 10) {
  const r = await sbFetch(
    `/rest/v1/retention_simulation_log?order=created_at.desc&limit=${limit}&select=id,empresa_id,parameters,result,created_at`
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/retention_simulation_log|42P01|PGRST205/i.test(body)) {
      return { rows: [], tableMissing: true };
    }
    throw new Error("No se pudo cargar historial de simulaciones");
  }
  const rows = await r.json();
  return { rows: Array.isArray(rows) ? rows : [], tableMissing: false };
}

export function aggregateMetricsByClass(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = row.asset_class;
    if (!map.has(key)) {
      map.set(key, {
        asset_class: key,
        ACTIVO: 0,
        ARCHIVADO: 0,
        BORRABLE: 0,
        bytes: 0,
      });
    }
    const entry = map.get(key);
    const st = row.retention_state || RETENTION_STATE.ACTIVO;
    const cnt = Number(row.item_count) || 0;
    const bytes = Number(row.estimated_bytes) || 0;
    if (entry[st] !== undefined) entry[st] += cnt;
    entry.bytes += bytes;
  }
  return [...map.values()].sort((a, b) => a.asset_class.localeCompare(b.asset_class));
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
