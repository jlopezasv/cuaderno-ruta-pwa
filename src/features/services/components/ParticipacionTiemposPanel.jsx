import { useEffect, useMemo, useState } from "react";
import { loadParticipacionTiemposPorServicio } from "../../../domain/fleet/loadParticipacionTiemposServicio.js";

function fmtMs(ms) {
  const m = Math.max(0, Math.round(Number(ms) / 60000));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function tramoKindLabel(kind) {
  if (kind === "traslado" || kind === "traslado_abierto") return "En ruta";
  if (kind === "en_planta" || kind === "en_planta_abierto") return "En planta";
  if (kind === "servicio_inicio") return "Inicio";
  return "Tramo";
}

/**
 * Resumen por conductor: total operativo + tramos entre muelles (FASE 2B).
 */
export function ParticipacionTiemposPanel({ servicio, stops }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const show =
    servicio?.id &&
    (servicio.estado === "en_curso" ||
      servicio.estado === "completado" ||
      servicio.estado === "cerrado" ||
      !!servicio.fecha_inicio);

  const stopsKey = useMemo(
    () =>
      (stops || [])
        .map((s) => `${s.id}:${s.hora_llegada_real || ""}:${s.hora_salida_real || ""}:${s.estado || ""}`)
        .join("|"),
    [stops],
  );

  useEffect(() => {
    if (!show) {
      setRows([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const list = await loadParticipacionTiemposPorServicio(servicio, { stops });
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message || "Error al calcular tiempos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const reload = () => {
      loadParticipacionTiemposPorServicio(servicio, { stops })
        .then((list) => {
          if (!cancelled) setRows(list);
        })
        .catch(() => {});
    };
    const onRecarga = () => reload();
    window.addEventListener("cuaderno-recargar-servicio", onRecarga);
    const poll = servicio?.estado === "en_curso" ? setInterval(reload, 30000) : null;
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      window.removeEventListener("cuaderno-recargar-servicio", onRecarga);
    };
  }, [servicio?.id, servicio?.estado, servicio?.updated_at, servicio?.fecha_inicio, stopsKey, show]);

  if (!show) return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>
        Tiempos por conductor
      </div>
      {loading && rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>Calculando tramos…</div>
      ) : error ? (
        <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>Sin participaciones registradas.</div>
      ) : (
        rows.map((r) => (
          <div
            key={r.conductorId}
            style={{
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                {r.nombre}{" "}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                  ({r.estadoParticipacion})
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#2563eb" }}>
                Total {fmtMs(r.totalOperativoMs)}
              </div>
            </div>
            {(r.tramos || []).length === 0 ? (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Sin tramos en ventana.</div>
            ) : (
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
                {r.tramos.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      fontSize: 11,
                      color: "#475569",
                      padding: "4px 0",
                      borderTop: "1px dashed #e2e8f0",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#334155" }}>
                      {tramoKindLabel(t.kind)}
                      {t.abierto ? " · en curso" : ""}
                    </span>
                    {" — "}
                    {t.label}: <strong>{fmtMs(t.durationMs)}</strong>
                    {import.meta.env.DEV && t.tacografo ? (
                      <span style={{ color: "#94a3b8" }}>
                        {" "}
                        (⊙{fmtMs(t.tacografo.conduccionMs)} ⚒{fmtMs(t.tacografo.trabajoMs)})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {import.meta.env.DEV ? (
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                Tacógrafo total: ⊙{fmtMs(r.conduccionMs)} · ⚒{fmtMs(r.trabajoMs)} · ▨
                {fmtMs(r.disponibilidadMs)} · 🛌{fmtMs(r.descansoMs)}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
