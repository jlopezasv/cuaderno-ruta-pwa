import { useEffect, useState } from "react";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { getCargaAlcance, isCargaNacional } from "../../modules/autonomo-expediente/autonomoExpedienteDeca.js";
import {
  getCargaMuelleResumen,
  isCargaTerminada,
  cargaMercanciaFromMeta,
} from "../../modules/autonomo-expediente/autonomoExpedienteStopModel.js";
import { decaLinkForCarga } from "../../modules/autonomo-expediente/autonomoExpedienteUiModel.js";
import { SERVICIO_ALCANCE_LABELS } from "../../domain/service/servicioAlcance.js";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${UI.line}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  marginBottom: 8,
};

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function AutonomoCargaEnMuelleModal({
  open,
  onClose,
  cargaStop,
  servicio,
  destinos = [],
  busy = false,
  onUpdateMercancia,
  onTerminarCarga,
  onGenerarDeca,
  onAddDestino,
  onScanCmr,
  onSeguir,
}) {
  const [mercancia, setMercancia] = useState({});
  const [observaciones, setObservaciones] = useState("");
  const [phase, setPhase] = useState("muelle");

  useEffect(() => {
    if (!open || !cargaStop) return;
    const m = cargaMercanciaFromMeta(cargaStop);
    const meta = getStopOperacionMeta(cargaStop.notas);
    setMercancia({
      descripcion: m.descripcion || "",
      bultos: m.bultos ?? "",
      peso_kg: m.peso_kg ?? "",
      palets: m.palets ?? "",
    });
    setObservaciones(meta.observaciones_carga || "");
    setPhase(isCargaTerminada(cargaStop) ? "post" : "muelle");
  }, [open, cargaStop?.id, cargaStop?.notas]);

  if (!open || !cargaStop) return null;

  const muelle = getCargaMuelleResumen(cargaStop);
  const alcance = getCargaAlcance(cargaStop);
  const terminada = isCargaTerminada(cargaStop);
  const decaLink = servicio ? decaLinkForCarga(servicio, cargaStop.id) : null;
  const esNacional = isCargaNacional(cargaStop);
  const sinDestino = !destinos?.length;

  async function handleTerminar() {
    await onUpdateMercancia?.({ mercancia, observaciones });
    await onTerminarCarga?.();
    setPhase("post");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13500,
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
          maxHeight: "92vh",
          background: UI.card,
          borderRadius: "16px 16px 0 0",
          overflow: "auto",
          padding: "16px 16px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>{cargaStop.nombre}</div>
        <div style={{ fontSize: 13, color: UI.su, marginBottom: 14 }}>
          {SERVICIO_ALCANCE_LABELS[alcance] || alcance}
          {terminada && muelle.label ? ` · ${muelle.label} en muelle` : ""}
        </div>

        {phase === "muelle" && !terminada ? (
          <>
            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: UI.su }}>Llegada muelle</span>
                <span style={{ fontWeight: 800, color: UI.tx }}>{fmtTime(muelle.entradaAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: UI.su }}>GPS registrado si estaba disponible</div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: UI.su, marginBottom: 6 }}>MERCANCÍA (opcional)</div>
            {[
              ["descripcion", "Mercancía"],
              ["palets", "Palets"],
              ["bultos", "Bultos"],
              ["peso_kg", "Peso (kg)"],
            ].map(([k, label]) => (
              <input
                key={k}
                style={inputStyle}
                placeholder={label}
                value={mercancia[k] ?? ""}
                onChange={(e) => setMercancia((m) => ({ ...m, [k]: e.target.value }))}
              />
            ))}
            <textarea
              style={{ ...inputStyle, minHeight: 56, resize: "vertical" }}
              placeholder="Observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleTerminar()}
              style={{
                width: "100%",
                padding: "14px 12px",
                borderRadius: 12,
                border: "none",
                background: UI.green,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              Terminar carga
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                background: UI.blueSoft,
                border: "1px solid #bfdbfe",
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 800, color: UI.tx, fontSize: 14 }}>Carga registrada</div>
              <div style={{ fontSize: 13, color: UI.su, marginTop: 4 }}>
                {fmtTime(muelle.entradaAt)} → {fmtTime(muelle.salidaAt)}
                {muelle.label ? ` · ${muelle.label}` : ""}
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 10 }}>SIGUIENTE PASO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {esNacional && !decaLink ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onGenerarDeca?.()}
                  style={suggestBtn(UI.green)}
                >
                  Generar {DECA_SHORT_LABEL} antes del viaje
                </button>
              ) : null}
              {decaLink ? (
                <div style={{ fontSize: 13, color: UI.green, fontWeight: 700, padding: "8px 0" }}>
                  {DECA_SHORT_LABEL} ya generado
                </div>
              ) : null}
              {sinDestino ? (
                <button type="button" disabled={busy} onClick={() => onAddDestino?.()} style={suggestBtn(UI.blue)}>
                  Añadir destino
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => onScanCmr?.()} style={suggestBtn("#64748b")}>
                Escanear CMR / carta de porte (opcional)
              </button>
              <button type="button" disabled={busy} onClick={() => onSeguir?.()} style={suggestBtn("#fff", true)}>
                Seguir trabajando
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "12px",
            borderRadius: 12,
            border: `1px solid ${UI.line}`,
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function suggestBtn(bg, outline = false) {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: outline ? `1px solid ${UI.line}` : "none",
    background: outline ? "#fff" : bg,
    color: outline ? UI.tx : "#fff",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    textAlign: "left",
  };
}
