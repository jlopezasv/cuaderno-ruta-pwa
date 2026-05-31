import { useEffect, useState } from "react";
import { getTramoEnRutaAbierto } from "../../../domain/fleet/participacionTramosOperativos.js";

function fmtElapsed(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return `${h}h ${String(r).padStart(2, "0")}m`;
  return `${r} min`;
}

/**
 * Cronómetro visible tras «Salida de muelle» hasta la siguiente entrada.
 */
export function EnRutaHastaProximaEntrada({ servicio, stops, tone = "light" }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const abierto = getTramoEnRutaAbierto(servicio, stops, nowMs);

  useEffect(() => {
    if (!abierto) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [abierto?.fromMs, abierto?.stopDestinoId]);

  if (!abierto || servicio?.estado !== "en_curso") return null;

  const isDark = tone === "dark";
  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 4,
        padding: "12px 14px",
        borderRadius: 12,
        background: isDark ? "rgba(245,158,11,.12)" : "#fffbeb",
        border: `1px solid ${isDark ? "rgba(245,158,11,.35)" : "#fcd34d"}`,
      }}
      data-live="tramo-en-ruta"
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309", letterSpacing: 0.3 }}>
        EN RUTA · HASTA PRÓXIMA ENTRADA
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#92400e", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {fmtElapsed(abierto.elapsedMs)}
      </div>
      <div style={{ fontSize: 12, color: "#78716c", marginTop: 4, lineHeight: 1.4 }}>
        Desde salida de muelle → entrada en {abierto.destinoLabel}
      </div>
    </div>
  );
}
