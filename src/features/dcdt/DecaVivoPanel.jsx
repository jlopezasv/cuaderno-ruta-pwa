import { useEffect, useMemo, useState } from "react";
import {
  DECA_VIVO_MOVIMIENTO,
  DECA_VIVO_MOVIMIENTO_LABELS,
} from "../../domain/dcdt/decaVivoConstants.js";
import {
  buildDecaVivoInspectUrl,
  fetchDecaActualVisible,
  fetchDecaMovimientos,
  fetchDecaVersionesHistorial,
  generarQrDecaActual,
  registrarMovimientoCarga,
} from "../../domain/dcdt/decaVivoModel.js";
import { formatStockLineLabel } from "../../domain/dcdt/decaVivoStock.js";
import { splitStockForDisplay } from "../../domain/service/operationalVisualModel.js";
import { downloadDecaVivoPdf } from "../../domain/dcdt/decaVivoPdf.js";
import { generateDecaQrDataUrl } from "../../domain/dcdt/decaQrImage.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";
import { DecaVivoMovimientoModal } from "./DecaVivoMovimientoModal.jsx";
import { DecaVivoHistorialModal } from "./DecaVivoHistorialModal.jsx";

const UI = {
  surface: "#ffffff",
  soft: "#f0fdf4",
  border: "#bbf7d0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#166534",
  blue: "#1d4ed8",
};

function btnStyle(variant = "default") {
  const base = {
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${UI.border}`,
    background: UI.surface,
    color: UI.tx,
    textAlign: "left",
  };
  if (variant === "primary") {
    return { ...base, background: UI.soft, color: UI.green, border: `1px solid ${UI.border}` };
  }
  if (variant === "full") {
    return { ...base, width: "100%" };
  }
  return base;
}

/**
 * Panel DeCA vivo — un único documento actual visible para conductor/inspección.
 */
export function DecaVivoPanel({
  servicio,
  stops = [],
  conductorNombre = null,
  showToast,
  modoEmpresa = false,
  compact = false,
  hideStockList = false,
  hidden = false,
  onStockChange,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [movModal, setMovModal] = useState(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [historial, setHistorial] = useState({ movimientos: [], versiones: [] });

  const servicioId = servicio?.id;
  const doc = data?.documento;
  const stock = data?.stock_actual || [];

  const servicioRef = useMemo(
    () => getServiceNumberForDisplay(servicio) || servicioId?.slice(0, 8),
    [servicio, servicioId],
  );

  const reload = async () => {
    if (!servicioId) return;
    setLoading(true);
    try {
      const next = await fetchDecaActualVisible(servicioId);
      setData(next);
      onStockChange?.(next?.stock_actual || []);
    } catch (e) {
      if (showToast) showToast(e.message || "No se pudo cargar DeCA actual", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [servicioId]);

  async function openHistorial() {
    if (!servicioId) return;
    setBusy(true);
    try {
      const [movimientos, versiones] = await Promise.all([
        fetchDecaMovimientos(servicioId),
        fetchDecaVersionesHistorial(servicioId),
      ]);
      setHistorial({ movimientos, versiones });
      setHistorialOpen(true);
    } catch (e) {
      if (showToast) showToast(e.message || "Error al cargar historial", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegistrar(payload) {
    setBusy(true);
    try {
      const next = await registrarMovimientoCarga(
        { ...payload, servicio_id: servicioId },
        stock,
      );
      setData(next);
      setMovModal(null);
      if (showToast) showToast("Movimiento registrado · DeCA actualizado", "ok");
    } catch (e) {
      if (showToast) showToast(e.message || "Error al registrar", "error");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleQr() {
    setBusy(true);
    try {
      const qr = await generarQrDecaActual(servicioId);
      const url = buildDecaVivoInspectUrl(qr.qr_token);
      setQrUrl(url);
      setQrOpen(true);
    } catch (e) {
      if (showToast) showToast(e.message || "Error al generar QR", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePdf() {
    setBusy(true);
    try {
      let inspectUrl = qrUrl;
      if (!inspectUrl && doc?.qr_token) {
        inspectUrl = buildDecaVivoInspectUrl(doc.qr_token);
      }
      let qrPngBytes = null;
      if (inspectUrl) {
        const dataUrl = await generateDecaQrDataUrl(inspectUrl);
        const b64 = dataUrl.split(",")[1];
        if (b64) qrPngBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      }
      await downloadDecaVivoPdf(
        {
          servicioRef,
          documento: doc,
          stockActual: stock,
          conductor: conductorNombre ? { nombre: conductorNombre } : null,
        },
        `DeCA-actual-${servicioRef}.pdf`,
        { qrPngBytes },
      );
    } catch (e) {
      if (showToast) showToast(e.message || "Error al generar PDF", "error");
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  if (loading) {
    return <div style={{ fontSize: 13, color: UI.su, padding: compact ? 0 : 8 }}>Cargando DeCA actual…</div>;
  }

  const stockSplit = splitStockForDisplay(stock);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          background: UI.soft,
          border: `1px solid ${UI.border}`,
          borderRadius: 12,
          padding: compact ? "10px 12px" : "12px 14px",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: compact ? 13 : 14, color: UI.green }}>
          DeCA actual vigente
          {doc?.version ? ` · v${doc.version}` : ""}
        </div>
        <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
          {doc?.fecha_actualizacion
            ? `Actualizado ${new Date(doc.fecha_actualizacion).toLocaleString("es-ES")}`
            : "Sin movimientos aún — registre la primera carga"}
        </div>
        {doc?.matricula_tractora ? (
          <div style={{ fontSize: 12, color: UI.tx, marginTop: 6 }}>
            {doc.matricula_tractora}
            {doc.matricula_remolque ? ` · ${doc.matricula_remolque}` : ""}
          </div>
        ) : null}
      </div>

      {!hideStockList ? (
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 0.4, marginBottom: 6 }}>
          MERCANCÍA A BORDO (DeCA)
        </div>
        {!stock.length ? (
          <div style={{ fontSize: 13, color: UI.su, fontStyle: "italic" }}>
            Vacío — sin mercancía registrada a bordo
          </div>
        ) : (
          <>
            {stockSplit.mercanciaIda.length ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#15803d", marginBottom: 4 }}>Pendiente de entrega</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: UI.tx }}>
                  {stockSplit.mercanciaIda.map((line, i) => (
                    <li key={line.line_key || i}>{formatStockLineLabel(line)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {stockSplit.retornos.length ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#ea580c", marginBottom: 4 }}>Retornos / envases</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: UI.tx }}>
                  {stockSplit.retornos.map((line, i) => (
                    <li key={line.line_key || i}>{formatStockLineLabel(line)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {stockSplit.devoluciones.length ? (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#7e22ce", marginBottom: 4 }}>Devoluciones</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: UI.tx }}>
                  {stockSplit.devoluciones.map((line, i) => (
                    <li key={line.line_key || i}>{formatStockLineLabel(line)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          style={btnStyle("primary")}
          disabled={busy}
          onClick={() => setMovModal({ tipo: DECA_VIVO_MOVIMIENTO.CARGA })}
        >
          Registrar carga
        </button>
        <button
          type="button"
          style={btnStyle("full")}
          disabled={busy}
          onClick={() => setMovModal({ tipo: DECA_VIVO_MOVIMIENTO.DESCARGA })}
        >
          He descargado
        </button>
        <button
          type="button"
          style={btnStyle("full")}
          disabled={busy}
          onClick={() =>
            setMovModal({ tipo: DECA_VIVO_MOVIMIENTO.CARGA_RETORNO, presetUnidad: "palets" })
          }
        >
          He cargado retorno / envases
        </button>
        <button
          type="button"
          style={btnStyle("full")}
          disabled={busy}
          onClick={() => setMovModal({ tipo: DECA_VIVO_MOVIMIENTO.DEVOLUCION })}
        >
          Hay devolución / incidencia
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: modoEmpresa ? "1fr 1fr" : "1fr", gap: 8 }}>
        <button type="button" style={btnStyle("full")} disabled={busy} onClick={handleQr}>
          QR inspección
        </button>
        <button type="button" style={btnStyle("full")} disabled={busy} onClick={handlePdf}>
          Descargar PDF
        </button>
      </div>

      <button type="button" style={btnStyle("full")} disabled={busy} onClick={openHistorial}>
        Ver historial
      </button>

      {modoEmpresa ? (
        <button
          type="button"
          style={btnStyle("full")}
          disabled={busy}
          onClick={() => setMovModal({ tipo: DECA_VIVO_MOVIMIENTO.AJUSTE_MANUAL })}
        >
          Ajuste manual (tráfico)
        </button>
      ) : null}

      {movModal ? (
        <DecaVivoMovimientoModal
          initialTipo={movModal.tipo}
          presetUnidad={movModal.presetUnidad}
          stops={stops}
          stockActual={stock}
          labels={DECA_VIVO_MOVIMIENTO_LABELS}
          onClose={() => setMovModal(null)}
          onSubmit={handleRegistrar}
          busy={busy}
        />
      ) : null}

      {historialOpen ? (
        <DecaVivoHistorialModal
          movimientos={historial.movimientos}
          versiones={historial.versiones}
          labels={DECA_VIVO_MOVIMIENTO_LABELS}
          onClose={() => setHistorialOpen(false)}
        />
      ) : null}

      {qrOpen && qrUrl ? (
        <DecaVivoQrOverlay url={qrUrl} onClose={() => setQrOpen(false)} />
      ) : null}
    </div>
  );
}

function DecaVivoQrOverlay({ url, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    generateDecaQrDataUrl(url).then(setDataUrl).catch(() => setDataUrl(""));
  }, [url]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 800,
        background: "rgba(15,23,42,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, padding: 20, maxWidth: 360, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>DeCA · inspección</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          Muestra este QR en un control — solo refleja la carga actual del camión.
        </div>
        {dataUrl ? (
          <img src={dataUrl} alt="QR DeCA" style={{ width: "100%", maxWidth: 240, display: "block", margin: "0 auto" }} />
        ) : (
          <div style={{ textAlign: "center", color: "#64748b" }}>Generando QR…</div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", marginTop: 12, fontSize: 11, color: "#1d4ed8", wordBreak: "break-all" }}
        >
          Abrir vista inspección
        </a>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#166534",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
