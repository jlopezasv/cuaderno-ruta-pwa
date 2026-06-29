import { useMemo, useState } from "react";
import {
  resolveProximaAccionPrincipal,
  splitStockForDisplay,
} from "../../domain/service/operationalVisualModel.js";
import { formatStockLineLabel } from "../../domain/dcdt/decaVivoStock.js";
import { getOperacionMuelleActiva } from "../../modules/autonomo-expediente/operacionMuelleModel.js";
import { EntradaMuelleModal } from "./EntradaMuelleModal.jsx";
import { EnMuellePanel } from "./EnMuellePanel.jsx";
import { RegistroMovimientoModal } from "./RegistroMovimientoModal.jsx";
import { SalidaMuelleModal } from "./SalidaMuelleModal.jsx";
import { AnularExpedienteModal } from "./AnularExpedienteModal.jsx";
import { OperationalEvidenciasStop } from "../documents/OperationalEvidenciasStop.jsx";
import { DecaVivoPanel } from "../dcdt/DecaVivoPanel.jsx";

function StockBlock({ title, lines, emptyText, accent }) {
  if (!lines?.length) {
    return (
      <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", marginBottom: 8 }}>{emptyText}</div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: accent || "#64748b", letterSpacing: 0.5, marginBottom: 6 }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: "#0f172a" }}>
        {lines.map((line, i) => (
          <li key={line.line_key || line.id || i} style={{ marginBottom: 4 }}>
            {formatStockLineLabel(line)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Flujo operativo conductor — expediente único, una acción principal, sin duplicidades.
 */
export function ExpedienteOperacionalConductor({
  servicio,
  stockActual = [],
  busy = false,
  uid,
  conductorNombre,
  showToast,
  acquireLocation,
  onReload,
  onEntradaMuelle,
  onRegistrarMovimiento,
  onSalidaMuelle,
  onCancelarEntradaMuelle,
  onAnularExpediente,
  onAñadirCargaPrevista,
  onAñadirDestinoPrevisto,
  onFinalizar,
  onStockChange,
  canFinalizar = false,
  stops = [],
}) {
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [movTipo, setMovTipo] = useState(null);
  const [anularOpen, setAnularOpen] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const operacion = useMemo(() => getOperacionMuelleActiva(servicio), [servicio]);
  const proxima = useMemo(
    () => resolveProximaAccionPrincipal({ servicio, stockActual }),
    [servicio, stockActual],
  );
  const { mercanciaIda, retornos, devoluciones } = useMemo(
    () => splitStockForDisplay(stockActual),
    [stockActual],
  );

  const sinDestino = mercanciaIda.filter((l) => {
    const d = String(l.destino_previsto || "").toLowerCase();
    return !d || d.includes("pendiente");
  });
  const idaConDestino = mercanciaIda.filter((l) => !sinDestino.includes(l));

  const sessionStopId = operacion?.stop_session_id;
  const hayStock = stockActual?.length > 0;

  async function confirmEntrada(payload) {
    let geo = null;
    try {
      const loc = await acquireLocation?.("entrada_muelle", "Entrada en muelle");
      if (loc === null) return;
      if (loc?.ok) {
        const { geoPayloadFromLocationResult } = await import("../../data/driverActionGps.js");
        geo = geoPayloadFromLocationResult(loc);
      }
    } catch {
      /* GPS opcional */
    }
    await onEntradaMuelle({ ...payload, geo });
    setEntradaOpen(false);
  }

  async function confirmSalida(opts) {
    let geo = null;
    try {
      const loc = await acquireLocation?.("salida_muelle", "Salida de muelle");
      if (loc === null) return;
      if (loc?.ok) {
        const { geoPayloadFromLocationResult } = await import("../../data/driverActionGps.js");
        geo = geoPayloadFromLocationResult(loc);
      }
    } catch {
      /* GPS opcional */
    }
    await onSalidaMuelle({ ...opts, geo });
    setSalidaOpen(false);
  }

  function handlePrimary() {
    if (operacion) {
      setSalidaOpen(true);
      return;
    }
    if (proxima.kind === "cerrar" && canFinalizar) {
      onFinalizar?.();
      return;
    }
    setEntradaOpen(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 1. Acción principal única */}
      {!operacion ? (
        <section
          style={{
            borderRadius: 14,
            padding: "16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#047857", letterSpacing: 0.8, marginBottom: 6 }}>
            PRÓXIMA ACCIÓN
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>{proxima.title}</div>
          {proxima.subtitle ? (
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>{proxima.subtitle}</div>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={handlePrimary}
            style={{
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
            {proxima.primaryLabel}
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <SecondaryBtn label="Añadir carga prevista" onClick={onAñadirCargaPrevista} disabled={busy} />
            <SecondaryBtn label="Añadir destino previsto" onClick={onAñadirDestinoPrevisto} disabled={busy} />
            <SecondaryBtn
              label="Registrar incidencia"
              onClick={() => setMovTipo("incidencia")}
              disabled={busy}
            />
            <SecondaryBtn label="Anular expediente" onClick={() => setAnularOpen(true)} disabled={busy} danger />
          </div>
        </section>
      ) : null}

      {/* 2. En muelle */}
      {operacion ? (
        <>
          <EnMuellePanel
            operacion={operacion}
            busy={busy}
            onRegistrar={(tipo) => setMovTipo(tipo)}
            onSalida={() => setSalidaOpen(true)}
            onCancelarEntrada={onCancelarEntradaMuelle}
            onSubirFoto={() => setShowDocs(true)}
            onSubirDocumento={() => setShowDocs(true)}
            onIncidencia={() => setMovTipo("incidencia")}
          />
          {showDocs && sessionStopId ? (
            <section
              style={{
                borderRadius: 12,
                padding: 12,
                border: "1px solid #e2e8f0",
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>
                FOTOS / CMR / ALBARANES
              </div>
              <OperationalEvidenciasStop
                stopId={sessionStopId}
                servicioId={servicio?.id}
                servicio={servicio}
                conductorName={conductorNombre}
                conductorId={uid}
                showToast={showToast}
                variant="docsShell"
                hideIa
                tiposPermitidos={["cmr", "foto", "albaran", "incidencia"]}
                acquireActionLocation={(type, label) => acquireLocation?.(type, label)}
                onEvidenciaSaved={() => {
                  onReload?.();
                  showToast?.("Documento guardado");
                }}
              />
              <button
                type="button"
                onClick={() => setShowDocs(false)}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cerrar documentos
              </button>
            </section>
          ) : null}
        </>
      ) : null}

      {/* 3. Mercancía a bordo */}
      <section style={{ borderRadius: 12, padding: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.6, marginBottom: 10 }}>
          MERCANCÍA A BORDO
        </div>
        {!hayStock ? (
          <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
            Camión vacío según expediente
          </div>
        ) : (
          <>
            <StockBlock title="MERCANCÍA DE IDA" lines={idaConDestino} emptyText="" accent="#15803d" />
            <StockBlock
              title="SIN DESTINO ASIGNADO"
              lines={sinDestino}
              emptyText=""
              accent="#b45309"
            />
            <StockBlock title="RETORNOS" lines={retornos} emptyText="" accent="#ea580c" />
            <StockBlock title="DEVOLUCIONES" lines={devoluciones} emptyText="" accent="#7e22ce" />
          </>
        )}
      </section>

      {/* 4. DeCA actual — solo consulta */}
      <DecaVivoPanel
        servicio={servicio}
        stops={stops}
        conductorNombre={conductorNombre}
        showToast={showToast}
        conductorMode
        onStockChange={onStockChange}
      />

      {canFinalizar && !operacion ? (
        <button
          type="button"
          disabled={busy}
          onClick={onFinalizar}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Finalizar expediente
        </button>
      ) : null}

      <EntradaMuelleModal
        open={entradaOpen}
        uid={uid}
        busy={busy}
        onClose={() => setEntradaOpen(false)}
        onConfirm={confirmEntrada}
      />
      <SalidaMuelleModal
        open={salidaOpen}
        operacion={operacion}
        busy={busy}
        onClose={() => setSalidaOpen(false)}
        onConfirm={confirmSalida}
      />
      <RegistroMovimientoModal
        open={!!movTipo}
        tipo={movTipo}
        stockActual={stockActual}
        busy={busy}
        onClose={() => setMovTipo(null)}
        onConfirm={async (payload) => {
          await onRegistrarMovimiento({ ...payload, tipo: movTipo });
          setMovTipo(null);
        }}
      />
      <AnularExpedienteModal
        open={anularOpen}
        busy={busy}
        onClose={() => setAnularOpen(false)}
        onConfirm={async (motivo) => {
          await onAnularExpediente(motivo);
          setAnularOpen(false);
        }}
      />
    </div>
  );
}

function SecondaryBtn({ label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "10px 8px",
        borderRadius: 10,
        border: danger ? "1px solid #fecaca" : "1px solid #e2e8f0",
        background: danger ? "#fef2f2" : "#fff",
        color: danger ? "#b91c1c" : "#334155",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}
