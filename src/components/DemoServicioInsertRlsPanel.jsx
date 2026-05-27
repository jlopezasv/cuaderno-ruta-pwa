/**
 * TEMP DEMO: panel on-screen — contexto RLS INSERT servicios (JWT real vía RPC).
 * Solo visible cuando VITE_APP_ENV=demo. Quitar tras cerrar diagnóstico 42501.
 */
import { useCallback, useState } from "react";
import { isDemoApp } from "../config/appEnvironment.js";
import { fetchDebugServicioInsertRlsContext } from "../data/debugServicioInsertRls.js";
import { getAuthUid, getSupabasePublicHost, getUserId } from "../data/supabaseClient.js";

function fmtBool(v) {
  if (v === true) return "true";
  if (v === false) return "false";
  return "null";
}

function Row({ label, value, mono = true }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
      <div style={{ minWidth: 168, fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          color: "#F8FAFC",
          wordBreak: "break-all",
          fontFamily: mono ? "JetBrains Mono, monospace" : "inherit",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function DemoServicioInsertRlsPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const authUid = getAuthUid();
      const rpc = await fetchDebugServicioInsertRlsContext({
        empresaId: null,
        conductorId: authUid,
      });
      setResult({
        fetchedAt: new Date().toISOString(),
        clientAuthUid: authUid,
        clientSessionUserId: getUserId(),
        rpc,
      });
    } catch (e) {
      setResult({
        fetchedAt: new Date().toISOString(),
        clientAuthUid: getAuthUid(),
        clientSessionUserId: getUserId(),
        rpc: { ok: false, error: String(e?.message || e) },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  if (!isDemoApp()) return null;

  const data = result?.rpc?.ok ? result.rpc.data : null;
  const err = result?.rpc?.ok === false ? result.rpc.error : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next && !result && !loading) void refresh();
            return next;
          });
        }}
        style={{
          position: "fixed",
          bottom: 72,
          right: 12,
          zIndex: 9998,
          background: "#7C2D12",
          color: "#FFEDD5",
          border: "1px solid #EA580C",
          borderRadius: 999,
          padding: "8px 12px",
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,.35)",
          letterSpacing: 0.3,
        }}
        title="Diagnóstico RLS INSERT servicios (solo Demo)"
      >
        RLS DEBUG
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 112,
            right: 12,
            left: 12,
            maxWidth: 520,
            marginLeft: "auto",
            zIndex: 9999,
            background: "#0B1220",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: "12px 14px",
            boxShadow: "0 8px 28px rgba(0,0,0,.45)",
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#FB923C" }}>RLS INSERT — sesión real</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                style={{
                  background: "#1E293B",
                  border: "1px solid #475569",
                  color: "#E2E8F0",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "…" : "Refrescar"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #475569",
                  color: "#94A3B8",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#64748B", marginBottom: 10 }}>
            Supabase: {getSupabasePublicHost()} · RPC con JWT activo
          </div>

          {!result && !loading && (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Pulsa Refrescar para consultar Postgres.</div>
          )}

          {loading && <div style={{ fontSize: 12, color: "#94A3B8" }}>Consultando RPC…</div>}

          {err && (
            <div
              style={{
                fontSize: 11,
                color: "#FCA5A5",
                background: "#450A0A",
                border: "1px solid #991B1B",
                borderRadius: 8,
                padding: 8,
                marginBottom: 8,
                wordBreak: "break-all",
              }}
            >
              RPC error: {err}
            </div>
          )}

          {data && (
            <>
              <Row label="auth.uid() [Postgres]" value={data.auth_uid ?? "null"} />
              <Row label="tipo_cuenta [profiles]" value={data.tipo_cuenta_invoker ?? "null"} />
              <Row label="user_profile_is_autonomo_pro()" value={fmtBool(data.user_profile_is_autonomo_pro)} />
              <Row
                label="user_can_insert_servicio(null, auth.uid())"
                value={fmtBool(data.user_can_insert_servicio_null_auth_uid ?? data.user_can_insert_servicio)}
              />

              <div style={{ borderTop: "1px solid #1E293B", margin: "10px 0" }} />

              <Row label="auth.role()" value={data.auth_role ?? "null"} />
              <Row label="jwt.sub" value={data.jwt_sub ?? "null"} />
              <Row label="profile_exists (invoker)" value={fmtBool(data.profile_exists_invoker)} />
              <Row label="insert_policy_count" value={String(data.insert_policy_count ?? "—")} />
              <Row
                label="autonomo_branch_checks"
                value={JSON.stringify(data.autonomo_branch_checks ?? {})}
              />
              <Row label="client getAuthUid()" value={result.clientAuthUid ?? "null"} />
              <Row label="client session.user.id" value={result.clientSessionUserId ?? "null"} />
              <Row label="consultado" value={result.fetchedAt} mono={false} />
            </>
          )}
        </div>
      )}
    </>
  );
}
