import { useEffect, useState } from "react";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { getCargaAlcance, isCargaNacional } from "../../modules/autonomo-expediente/autonomoExpedienteDeca.js";
import {
  getCargaMuelleResumen,
  isCargaEnMuelle,
  isCargaPendienteEntrada,
  isCargaTerminada,
  cargaMercanciaFromMeta,
} from "../../modules/autonomo-expediente/autonomoExpedienteStopModel.js";
import { SERVICIO_ALCANCE_LABELS } from "../../domain/service/servicioAlcance.js";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  amber: "#b45309",
  amberSoft: "#fffbeb",
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

function validateMercanciaNacional(mercancia) {
  const desc = String(mercancia?.descripcion || "").trim();
  const peso = String(mercancia?.peso_kg ?? "").trim();
  if (!desc) return "Indica la mercancía antes de terminar la carga";
  if (!peso || !Number.isFinite(Number(peso)) || Number(peso) <= 0) {
    return "Indica el peso (kg) antes de terminar la carga";
  }
  return null;
}

export function AutonomoCargaEnMuelleModal({
  open,
  onClose,
  cargaStop,
  busy = false,
  onUpdateMercancia,
  onTerminarCarga,
  onCargaTerminada,
  onEntradaPendiente,
  showToast,
}) {
  const [mercancia, setMercancia] = useState({});
  const [observaciones, setObservaciones] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!open || !cargaStop) return;
    const m = cargaMercanciaFromMeta(cargaStop);
    setMercancia({
      descripcion: m.descripcion || "",
      bultos: m.bultos ?? "",
      peso_kg: m.peso_kg ?? "",
      palets: m.palets ?? "",
    });
    setObservaciones(getStopOperacionMeta(cargaStop?.notas)?.observaciones_carga || "");
    setValidationError("");
  }, [open, cargaStop?.id, cargaStop?.notas]);

  if (!open || !cargaStop) return null;

  const muelle = getCargaMuelleResumen(cargaStop);
  const alcance = getCargaAlcance(cargaStop);
  const terminada = isCargaTerminada(cargaStop);
  const enMuelle = isCargaEnMuelle(cargaStop);
  const pendienteEntrada = isCargaPendienteEntrada(cargaStop);
  const esNacional = isCargaNacional(cargaStop);

  async function handleTerminar() {
    if (esNacional) {
      const err = validateMercanciaNacional(mercancia);
      if (err) {
        setValidationError(err);
        showToast?.(err);
        return;
      }
    }
    setValidationError("");
    await onUpdateMercancia?.({ mercancia, observaciones });
    await onTerminarCarga?.();
    onCargaTerminada?.(cargaStop);
  }

  if (pendienteEntrada) {
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
            background: UI.card,
            borderRadius: "16px 16px 0 0",
            padding: "16px 16px 24px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 8 }}>{cargaStop.nombre}</div>
          <div style={{ fontSize: 13, color: UI.su, marginBottom: 16, lineHeight: 1.45 }}>
            Almacén preparado. Registra la entrada en muelle para empezar a operar.
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onEntradaPendiente?.(cargaStop)}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: UI.green,
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Entrada en muelle
          </button>
        </div>
      </div>
    );
  }

  if (terminada) {
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
            background: UI.card,
            borderRadius: "16px 16px 0 0",
            padding: "16px 16px 24px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>{cargaStop.nombre}</div>
          <div style={{ fontSize: 13, color: UI.su, marginBottom: 8 }}>
            Carga terminada · {fmtTime(muelle.entradaAt)} → {fmtTime(muelle.salidaAt)}
            {muelle.label ? ` · ${muelle.label}` : ""}
          </div>
          <div style={{ fontSize: 12, color: UI.su }}>
            Usa los botones de la tarjeta para DeCA, destino o documentos.
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              marginTop: 14,
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
        <div
          style={{
            background: UI.amberSoft,
            border: "1px solid #fcd34d",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: UI.amber, letterSpacing: 0.5 }}>EN MUELLE</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, marginTop: 4 }}>{cargaStop.nombre}</div>
          <div style={{ fontSize: 13, color: UI.su, marginTop: 6 }}>
            Entrada {fmtTime(muelle.entradaAt)} · {SERVICIO_ALCANCE_LABELS[alcance] || alcance}
          </div>
        </div>

        <div style={{ fontSize: 12, color: UI.su, lineHeight: 1.45, marginBottom: 14 }}>
          Añade documentos desde la tarjeta de carga (CMR, fotos). Completa mercancía si es nacional y pulsa salida
          de muelle cuando termines.
        </div>

        {esNacional ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: UI.su, marginBottom: 6 }}>DATOS PARA DeCA</div>
            {[
              ["descripcion", "Mercancía *"],
              ["peso_kg", "Peso (kg) *"],
              ["palets", "Palets (opcional)"],
              ["bultos", "Bultos (opcional)"],
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
              placeholder="Observaciones (opcional)"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
            {validationError ? (
              <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 10 }}>{validationError}</div>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.45, marginBottom: 14 }}>
            Transporte internacional: sube CMR / carta de porte desde la tarjeta (documentos).
          </div>
        )}

        {enMuelle ? (
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
            Carga terminada · salida muelle
          </button>
        ) : null}

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
