import { useCallback, useEffect, useState } from "react";
import { DECA_AUTONOMO_ESTADO } from "../../domain/dcdt/decaAutonomoConstants.js";
import {
  archiveAutonomoDeca,
  autonomoDecaListSummary,
  canDeleteAutonomoDeca,
  canEditAutonomoDeca,
  deleteAutonomoDeca,
  duplicateAutonomoDeca,
  fetchAutonomoDecasForUser,
} from "../../domain/dcdt/decaAutonomoModel.js";
import { downloadAutonomoDecaPdf } from "../../domain/dcdt/decaAutonomoPdf.js";
import { AutonomoDecaFormModal } from "./AutonomoDecaFormModal.jsx";

const UI = {
  page: "#f8fafc",
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
  green: "#166534",
  greenBg: "#dcfce7",
  amber: "#92400e",
  amberBg: "#fffbeb",
};

const ESTADO_LABEL = {
  [DECA_AUTONOMO_ESTADO.BORRADOR]: "Borrador",
  [DECA_AUTONOMO_ESTADO.GENERADO]: "Generado",
  [DECA_AUTONOMO_ESTADO.ARCHIVADO]: "Archivado",
};

function estadoChip(estado) {
  const st = String(estado || "").toLowerCase();
  if (st === DECA_AUTONOMO_ESTADO.GENERADO) {
    return { bg: UI.greenBg, color: UI.green, label: ESTADO_LABEL[st] };
  }
  if (st === DECA_AUTONOMO_ESTADO.ARCHIVADO) {
    return { bg: "#f1f5f9", color: UI.su, label: ESTADO_LABEL[st] };
  }
  return { bg: UI.amberBg, color: UI.amber, label: ESTADO_LABEL[st] || "Borrador" };
}

function actionBtn(variant = "default") {
  const base = {
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${UI.line}`,
    background: UI.card,
    color: UI.tx,
  };
  if (variant === "primary") {
    return { ...base, background: UI.greenBg, color: UI.green, border: "1px solid #bbf7d0" };
  }
  if (variant === "danger") {
    return { ...base, color: "#b91c1c", border: "1px solid #fecaca" };
  }
  return base;
}

export function AutonomoDecaPanel({ uid, profile = {}, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editDeca, setEditDeca] = useState(null);

  const reload = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchAutonomoDecasForUser(uid);
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  function openCreate() {
    setEditDeca(null);
    setFormOpen(true);
  }

  function openEdit(deca) {
    setEditDeca(deca);
    setFormOpen(true);
  }

  async function runAction(id, fn) {
    setBusyId(id);
    try {
      await fn();
      await reload();
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ padding: "14px 14px 88px", background: UI.page, minHeight: "60vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 1.1 }}>MIS DECA</div>
          <div style={{ fontSize: 13, color: UI.su, marginTop: 4, lineHeight: 1.45 }}>
            Documentos de control para transportes propios.
          </div>
        </div>
        <button type="button" onClick={openCreate} style={actionBtn("primary")}>
          + Crear DeCA
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: UI.su }}>Cargando…</div>
      ) : !rows.length ? (
        <div
          style={{
            background: UI.card,
            border: `1px dashed ${UI.line}`,
            borderRadius: 14,
            padding: 24,
            textAlign: "center",
            color: UI.su,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Aún no tienes DeCA guardados.
          <br />
          Pulsa <strong>Crear DeCA</strong> para empezar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((deca) => {
            const sum = autonomoDecaListSummary(deca);
            const chip = estadoChip(sum.estado);
            const busy = busyId === deca.id;
            return (
              <div
                key={deca.id}
                style={{
                  background: UI.card,
                  border: `1px solid ${UI.line}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 2px 8px rgba(15,23,42,.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: UI.tx }}>
                    {sum.origen} → {sum.destino}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: chip.bg,
                      color: chip.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {chip.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: UI.su, lineHeight: 1.5, marginBottom: 10 }}>
                  {sum.fecha} · {sum.matricula}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={actionBtn("primary")}
                    onClick={() => runAction(deca.id, () => downloadAutonomoDecaPdf(deca))}
                  >
                    PDF
                  </button>
                  {canEditAutonomoDeca(deca) ? (
                    <button type="button" disabled={busy} style={actionBtn()} onClick={() => openEdit(deca)}>
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    style={actionBtn()}
                    onClick={() =>
                      runAction(deca.id, async () => {
                        await duplicateAutonomoDeca(deca);
                        showToast?.("DeCA duplicado");
                      })
                    }
                  >
                    Duplicar
                  </button>
                  {sum.estado !== DECA_AUTONOMO_ESTADO.ARCHIVADO ? (
                    <button
                      type="button"
                      disabled={busy}
                      style={actionBtn()}
                      onClick={() =>
                        runAction(deca.id, async () => {
                          await archiveAutonomoDeca(deca.id);
                          showToast?.("DeCA archivado");
                        })
                      }
                    >
                      Archivar
                    </button>
                  ) : null}
                  {canDeleteAutonomoDeca(deca) ? (
                    <button
                      type="button"
                      disabled={busy}
                      style={actionBtn("danger")}
                      onClick={() =>
                        runAction(deca.id, async () => {
                          await deleteAutonomoDeca(deca.id);
                          showToast?.("DeCA eliminado");
                        })
                      }
                    >
                      Borrar
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AutonomoDecaFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        deca={editDeca}
        profile={profile}
        showToast={showToast}
        onSaved={() => reload()}
      />
    </div>
  );
}
