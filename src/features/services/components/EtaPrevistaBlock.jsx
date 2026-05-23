import { formatOperationalEtaLabel } from "../../../domain/service/etaFormatter.js";
import {
  formatEtaPrevistaRestLine,
  getEtaPrevista,
} from "../../../domain/service/etaPrevista.js";

const lblStyle = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.35,
};

/**
 * ETA prevista fija: solo lectura de `eta_prevista` en el servicio.
 * Sin reloj, GPS, paradas ni motor operacional.
 */
export function EtaPrevistaBlock({ servicio, tx = "#0f172a", su = "#64748b", subtle = "#94a3b8" }) {
  const eta = getEtaPrevista(servicio);
  const arrival =
    eta?.arrival_label ||
    (eta?.arrival_at ? formatOperationalEtaLabel(eta.arrival_at) : null);
  const rest = formatEtaPrevistaRestLine(eta);

  if (!arrival) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ ...lblStyle, color: su }}>ETA prevista</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: tx, lineHeight: 1.2 }}>—</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: subtle, lineHeight: 1.35 }}>
          Calcula la ruta para ver hora, duración y kilómetros previstos.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, maxWidth: "100%" }}>
      <span style={{ ...lblStyle, color: su }}>ETA prevista</span>
      <span
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: tx,
          lineHeight: 1.25,
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {arrival}
      </span>
      {rest ? (
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 650,
            color: subtle,
            lineHeight: 1.35,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {rest}
        </span>
      ) : null}
    </div>
  );
}
