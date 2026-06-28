import { useEffect, useState } from "react";
import { ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { SERVICIO_ESTADO_EN_CURSO } from "../../domain/fleet/serviceStatus.js";
import {
  archiveAutonomoExpediente,
  fetchAutonomoExpedientes,
} from "../../modules/autonomo-expediente/autonomoExpedienteApi.js";
import { loadArchivedAutonomoExpedienteIds } from "../../modules/autonomo-expediente/autonomoExpedienteArchive.js";

const UI = {
  page: "#f8fafc",
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  blue: "#2563eb",
};

export function AutonomoExpedienteHistoricoPanel({
  uid,
  showToast,
  onOpenExpediente,
  onOpenResumen,
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expedientes, setExpedientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => loadArchivedAutonomoExpedienteIds(uid));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await fetchAutonomoExpedientes(uid, { limit: 40 });
      if (!cancelled) {
        setExpedientes(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const filtered = expedientes.filter((ex) => {
    const archived = archivedIds.has(ex.id);
    if (showArchived && !archived) return false;
    if (!showArchived && archived) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const fecha = new Date(ex.fecha_inicio || ex.created_at).toLocaleDateString("es-ES");
    return fecha.includes(q) || String(ex.estado || "").toLowerCase().includes(q);
  });

  async function handleArchivar(id) {
    setBusy(true);
    try {
      await archiveAutonomoExpediente(id, uid);
      setArchivedIds(loadArchivedAutonomoExpedienteIds(uid));
      showToast?.("Expediente archivado");
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "14px 14px 88px", background: UI.page, minHeight: "60vh" }}>
      <input
        type="search"
        placeholder="Buscar por fecha o estado…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: `1px solid ${UI.line}`,
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 15,
          marginBottom: 12,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: UI.su }}>
          {showArchived ? "ARCHIVADOS" : "EXPEDIENTES CERRADOS Y RECIENTES"}
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          style={{ background: "transparent", border: "none", color: UI.blue, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
        >
          {showArchived ? "Ver activos" : "Ver archivados"}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: UI.su, padding: 24 }}>Cargando…</div>
      ) : (
        filtered.slice(0, 20).map((ex) => {
          const st = String(ex.estado || "").toLowerCase();
          const enCurso = st === SERVICIO_ESTADO_EN_CURSO || st === "asignado";
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => (enCurso ? onOpenExpediente?.(ex.id) : onOpenResumen?.(ex.id))}
              style={{
                width: "100%",
                textAlign: "left",
                background: UI.card,
                border: `1px solid ${UI.line}`,
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 800, color: UI.tx }}>
                {new Date(ex.fecha_inicio || ex.created_at).toLocaleDateString("es-ES")}
              </div>
              <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
                {ESTADO_LABEL[st] || ex.estado}
                {enCurso ? " · continuar" : ""}
              </div>
              {!showArchived && st === "completado" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleArchivar(ex.id);
                  }}
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${UI.line}`,
                    background: UI.page,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Archivar
                </button>
              ) : null}
            </button>
          );
        })
      )}
      {!loading && !filtered.length ? (
        <div style={{ textAlign: "center", color: UI.su, padding: 16, fontSize: 13 }}>Sin expedientes.</div>
      ) : null}
    </div>
  );
}
