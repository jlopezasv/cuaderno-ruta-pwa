import { ExpedienteActivoResumenCard } from "../ExpedienteActivoResumenCard.jsx";
import { buildResumenExpedienteActivo } from "../../../modules/autonomo-expediente/expedienteResumenModel.js";
import { createExpedicionQueries } from "../../../domain/expedicion/queries/createExpedicionQueries.js";
import { toLegacyInventarioPayload } from "../../../domain/expedicion/adapters/LegacyInventarioAdapter.js";
import { useEffect, useState } from "react";

const expedicionQueries = createExpedicionQueries();

/**
 * Lista de expedientes activos claramente diferenciados.
 */
export function ExpedientesActivosPanel({
  expedientes = [],
  archivedIds,
  busy,
  onContinuar,
  onAnular,
  onNuevo,
  profile,
  loadWorkspace,
}) {
  const activos = expedientes.filter((e) => {
    if (archivedIds?.has(e.id)) return false;
    const st = String(e.estado || "").toLowerCase();
    return st === "en_curso" || st === "asignado";
  });

  const [resumenes, setResumenes] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const exp of activos) {
        try {
          const ws = loadWorkspace ? await loadWorkspace(exp.id) : null;
          const servicio = ws?.servicio || exp;
          const inventario = await expedicionQueries.obtenerInventarioActual.execute(servicio?.id);
          const { stock, documento } = toLegacyInventarioPayload(inventario);
          const resumen = buildResumenExpedienteActivo({
            servicio,
            stock,
            documento,
            profile,
            timeline: ws?.timeline || [],
          });
          next[exp.id] = resumen;
        } catch {
          next[exp.id] = null;
        }
      }
      if (!cancelled) setResumenes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [activos.map((e) => e.id).join(","), profile]);

  if (!activos.length) {
    return (
      <button
        type="button"
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 12,
          border: "none",
          background: "#15803d",
          color: "#fff",
          fontWeight: 800,
          fontSize: 14,
          cursor: "pointer",
        }}
        disabled={busy}
        onClick={onNuevo}
      >
        + Nuevo expediente
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "#475569" }}>
        {activos.length === 1
          ? "Tienes 1 expediente en curso."
          : `Tienes ${activos.length} expedientes abiertos — elige cuál continuar.`}
      </div>

      {activos.map((exp, idx) => (
        <div key={exp.id}>
          {activos.length > 1 ? (
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#64748b",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              EXPEDIENTE {idx + 1}
              {exp.fecha_inicio
                ? ` · ${new Date(exp.fecha_inicio).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </div>
          ) : null}
          <ExpedienteActivoResumenCard
            resumen={resumenes[exp.id]}
            busy={busy}
            onContinuar={() => onContinuar(exp.id)}
            onAnular={() => onAnular(exp.id)}
          />
        </div>
      ))}

      <button
        type="button"
        disabled={busy}
        onClick={onNuevo}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 10,
          border: "1px dashed #94a3b8",
          background: "#fff",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          color: "#334155",
        }}
      >
        + Otro expediente nuevo
      </button>
    </div>
  );
}
