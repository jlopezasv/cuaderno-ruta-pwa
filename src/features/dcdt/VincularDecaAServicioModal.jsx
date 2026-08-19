import { useEffect, useState } from "react";
import { masTripPickerCardLines } from "../../domain/service/driverFlatStopList.js";
import { listServiciosSinDecaForConductor, linkAutonomoDecaToServicio } from "../../domain/dcdt/emitConductorServicioDeca.js";

const UI = {
  card: "#ffffff",
  border: "#dbe4ee",
  tx: "#0f172a",
  muted: "#64748b",
  page: "#f8fafc",
};

export function VincularDecaAServicioModal({ open, onClose, deca, uid, showToast, onLinked }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    listServiciosSinDecaForConductor(uid)
      .then((list) => setRows(list))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, uid]);

  async function pick(servicio) {
    if (!deca || busyId) return;
    setBusyId(servicio.id);
    setError("");
    try {
      await linkAutonomoDecaToServicio({ deca, servicio, conductorUid: uid });
      showToast?.("DeCA copiado al viaje. PDF y QR están en la barra DeCA del servicio.");
      onLinked?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || "No se pudo vincular");
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13100,
        background: "rgba(15,23,42,.45)",
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
          maxHeight: "88vh",
          background: UI.card,
          borderRadius: "16px 16px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${UI.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx }}>Usar en un servicio</div>
            <div style={{ fontSize: 12, color: UI.muted, marginTop: 2, lineHeight: 1.4 }}>
              Solo viajes de empresa sin DeCA. No se crea un segundo documento si ya existe.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: UI.muted }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, background: UI.page }}>
          {loading ? (
            <div style={{ fontSize: 13, color: UI.muted }}>Buscando viajes…</div>
          ) : !rows.length ? (
            <div style={{ fontSize: 13, color: UI.muted, lineHeight: 1.5 }}>
              No tienes viajes de empresa activos sin DeCA. Si el viaje ya tiene documento, ábrelo desde la barra DeCA
              del servicio.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((sv) => {
                const { codigo, routeLine, clienteLine } = masTripPickerCardLines(sv);
                const busy = busyId === sv.id;
                return (
                  <button
                    key={sv.id}
                    type="button"
                    disabled={!!busyId}
                    onClick={() => pick(sv)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: UI.card,
                      border: `1px solid ${UI.border}`,
                      borderRadius: 14,
                      padding: "14px 16px",
                      cursor: busyId ? "default" : "pointer",
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {routeLine ? (
                      <div style={{ fontSize: 15, fontWeight: 800, color: UI.tx }}>{routeLine}</div>
                    ) : null}
                    {clienteLine ? (
                      <div style={{ fontSize: 13, color: UI.tx, marginTop: 4 }}>{clienteLine}</div>
                    ) : null}
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginTop: 6, fontFamily: "monospace" }}>
                      {codigo}
                    </div>
                    {busy ? (
                      <div style={{ fontSize: 12, color: UI.muted, marginTop: 6 }}>Copiando y generando PDF…</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {error ? (
            <div
              style={{
                marginTop: 12,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
