import { useEffect, useState } from "react";
import {
  formatMuelleTimer,
  muelleElapsedMinutes,
  summarizeMovimientos,
} from "../../modules/autonomo-expediente/operacionMuelleModel.js";

export function EnMuellePanel({
  operacion,
  busy,
  onRegistrar,
  onSalida,
  onCancelarEntrada,
  onSubirFoto,
  onSubirDocumento,
  onIncidencia,
  stopId,
  servicio,
  uid,
  conductorNombre,
  showToast,
  acquireLocation,
  onEvidenciaSaved,
}) {
  const [minutes, setMinutes] = useState(() => muelleElapsedMinutes(operacion?.entrada_at));

  useEffect(() => {
    const t = setInterval(() => setMinutes(muelleElapsedMinutes(operacion?.entrada_at)), 30000);
    return () => clearInterval(t);
  }, [operacion?.entrada_at]);

  const counts = summarizeMovimientos(operacion?.movimientos);

  return (
    <section
      style={{
        borderRadius: 14,
        padding: 16,
        background: "#ecfdf5",
        border: "2px solid #6ee7b7",
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: "#047857", letterSpacing: 1, marginBottom: 6 }}>
        EN MUELLE
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{operacion.lugar_nombre}</div>
      <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
        Entrada:{" "}
        {operacion.entrada_at
          ? new Date(operacion.entrada_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
          : "—"}
        {" · "}
        Tiempo: {formatMuelleTimer(minutes)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        <ActionBtn label="Registrar carga" onClick={() => onRegistrar("carga")} color="#15803d" disabled={busy} />
        <ActionBtn label="Registrar descarga" onClick={() => onRegistrar("descarga")} color="#1d4ed8" disabled={busy} />
        <ActionBtn label="Registrar retorno" onClick={() => onRegistrar("retorno")} color="#ea580c" disabled={busy} />
        <ActionBtn label="Registrar devolución" onClick={() => onRegistrar("devolucion")} color="#7e22ce" disabled={busy} />
        <ActionBtn label="Subir foto" onClick={onSubirFoto} disabled={busy} />
        <ActionBtn label="Subir documento" onClick={onSubirDocumento} disabled={busy} />
        <ActionBtn label="Registrar incidencia" onClick={onIncidencia} disabled={busy} />
      </div>

      {counts.carga + counts.descarga + counts.retorno + counts.devolucion > 0 ? (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
          En esta operación:{" "}
          {[
            counts.carga ? `${counts.carga} carga(s)` : "",
            counts.descarga ? `${counts.descarga} descarga(s)` : "",
            counts.retorno ? `${counts.retorno} retorno(s)` : "",
            counts.devolucion ? `${counts.devolucion} devolución(es)` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onSalida}
        style={{
          marginTop: 14,
          width: "100%",
          padding: 14,
          borderRadius: 12,
          border: "none",
          background: "#0f766e",
          color: "#fff",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Salida de muelle
      </button>

      {countMovimientosZero(operacion) ? (
        <button
          type="button"
          disabled={busy}
          onClick={onCancelarEntrada}
          style={{
            marginTop: 8,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancelar entrada en muelle
        </button>
      ) : null}
    </section>
  );
}

function countMovimientosZero(op) {
  return !Array.isArray(op?.movimientos) || op.movimientos.length === 0;
}

function ActionBtn({ label, onClick, color = "#334155", disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "11px 10px",
        borderRadius: 10,
        border: color ? "none" : "1px solid #e2e8f0",
        background: color || "#fff",
        color: color ? "#fff" : "#334155",
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "wait" : "pointer",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}
