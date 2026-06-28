import { useMemo } from "react";
import {
  OPERATION_KIND,
  resolveProximaAccionPrincipal,
  splitCargasByRole,
  splitStockForDisplay,
  visualForStop,
  evaluateCancelOperacion,
} from "../../domain/service/operationalVisualModel.js";
import { formatStockLineLabel } from "../../domain/dcdt/decaVivoStock.js";
import { muelleEntradaLabel, muelleSalidaLabel } from "../../domain/service/muelleLabels.js";
import {
  isDestinoEntregado,
  isCargaPendienteEntrada,
  isCargaEnMuelle,
  isCargaTerminada,
  getDestinoTiempoResumen,
  getCargaMuelleResumen,
} from "../../modules/autonomo-expediente/autonomoExpedienteStopModel.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";

function destinoEstadoChip(estado) {
  const st = String(estado || "").toLowerCase();
  if (st === "entregado") return { label: "Descargado", bg: "#dcfce7", color: "#166534" };
  if (st === "en_muelle") return { label: "En muelle descarga", bg: "#dbeafe", color: "#1d4ed8" };
  return { label: "Pendiente descarga", bg: "#dbeafe", color: "#1e40af" };
}

function OperationBadge({ stop }) {
  const vis = visualForStop(stop);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.6,
        padding: "4px 8px",
        borderRadius: 6,
        background: vis.bg,
        color: vis.color,
        border: `1px solid ${vis.border}`,
      }}
    >
      <span aria-hidden>{vis.icon}</span>
      {vis.label}
    </span>
  );
}

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
 * Dashboard operativo conductor — prioridad real, inventario y retornos en paralelo.
 */
export function ConductorOperativoDashboard({
  servicio,
  cargas = [],
  destinos = [],
  stockActual = [],
  busy = false,
  onPrimaryAction,
  onDescargaEntrada,
  onDescargaSalida,
  onCargaEntrada,
  onCargaOpen,
  onRegistrarRetorno,
  onRegistrarDevolucion,
  onVerRetornoAcumulado,
  onCancelOperacion,
  onVerDeca,
  compact = false,
}) {
  const proxima = useMemo(
    () => resolveProximaAccionPrincipal({ cargas, destinos, stockActual }),
    [cargas, destinos, stockActual],
  );

  const { mercanciaIda, retornos: stockRetorno, devoluciones } = useMemo(
    () => splitStockForDisplay(stockActual),
    [stockActual],
  );

  const { cargasRetorno } = useMemo(() => splitCargasByRole(cargas), [cargas]);
  const destinosPendientes = useMemo(
    () => destinos.filter((d) => !isDestinoEntregado(d)),
    [destinos],
  );

  const retornosParadas = cargasRetorno.filter((c) => !isCargaTerminada(c) || isCargaEnMuelle(c));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      {/* 1. Próxima acción principal */}
      <section
        style={{
          borderRadius: 14,
          padding: compact ? "12px 14px" : "14px 16px",
          background: proxima.visual?.bg || "#f0fdf4",
          border: `2px solid ${proxima.visual?.border || "#86efac"}`,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: 0.8, marginBottom: 6 }}>
          PRÓXIMA ACCIÓN
        </div>
        <div style={{ fontSize: compact ? 15 : 17, fontWeight: 800, color: proxima.visual?.color || "#0f172a" }}>
          {proxima.title}
        </div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{proxima.subtitle}</div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPrimaryAction?.(proxima)}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "14px 16px",
            borderRadius: 12,
            border: "none",
            background: proxima.visual?.btnBg || "#15803d",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {proxima.primaryLabel}
        </button>
      </section>

      {/* 2. Mercancía a bordo */}
      <section
        style={{
          borderRadius: 12,
          padding: "12px 14px",
          background: "#fff",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: 0.8, marginBottom: 8 }}>
          MERCANCÍA A BORDO
        </div>
        <StockBlock
          title="Pendiente de entregar (viaje principal)"
          lines={mercanciaIda}
          emptyText="Sin mercancía de ida a bordo"
          accent="#15803d"
        />
        <StockBlock
          title="Retornos / envases recogidos"
          lines={stockRetorno}
          emptyText="Sin retornos a bordo"
          accent="#ea580c"
        />
        <StockBlock
          title="Devoluciones"
          lines={devoluciones}
          emptyText="Sin devoluciones a bordo"
          accent="#7e22ce"
        />
        {onVerDeca ? (
          <button
            type="button"
            disabled={busy}
            onClick={onVerDeca}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Ver DeCA actual
          </button>
        ) : null}
      </section>

      {/* 3. Retornos recogidos / pendientes (paradas) */}
      {(retornosParadas.length > 0 || stockRetorno.length > 0) ? (
        <section style={{ borderRadius: 12, padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#92400e", letterSpacing: 0.8, marginBottom: 8 }}>
            RETORNOS RECOGIDOS / PENDIENTES
          </div>
          {retornosParadas.map((c) => {
            const vis = visualForStop(c);
            const pendiente = isCargaPendienteEntrada(c);
            const enMuelle = isCargaEnMuelle(c);
            return (
              <div key={c.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #fde68a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: vis.color }}>{c.nombre}</div>
                    <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>
                      {pendiente ? "Pendiente recogida" : enMuelle ? "En muelle retorno" : "Retorno registrado"}
                    </div>
                  </div>
                  <OperationBadge stop={c} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {pendiente ? (
                    <button type="button" disabled={busy} onClick={() => onCargaEntrada?.(c)} style={chipBtn(vis.btnBg)}>
                      {muelleEntradaLabel(c)}
                    </button>
                  ) : enMuelle ? (
                    <button type="button" disabled={busy} onClick={() => onCargaOpen?.(c)} style={chipBtn(vis.btnBg)}>
                      {muelleSalidaLabel(c)}
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => onCargaOpen?.(c)} style={chipBtn()}>
                      Ver retorno
                    </button>
                  )}
                  {onCancelOperacion ? (
                    <CancelBtn stop={c} servicio={servicio} busy={busy} onCancel={onCancelOperacion} />
                  ) : null}
                </div>
              </div>
            );
          })}
          {stockRetorno.length && onVerRetornoAcumulado ? (
            <button type="button" disabled={busy} onClick={onVerRetornoAcumulado} style={chipBtn("#ea580c", true)}>
              Ver retorno acumulado ({stockRetorno.length} líneas)
            </button>
          ) : null}
        </section>
      ) : null}

      {/* 4. Descargas pendientes */}
      {destinosPendientes.length ? (
        <section style={{ borderRadius: 12, padding: "12px 14px", background: "#eff6ff", border: "1px solid #93c5fd" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#1e40af", letterSpacing: 0.8, marginBottom: 8 }}>
            DESCARGAS PENDIENTES
          </div>
          {destinosPendientes.map((d) => {
            const meta = getStopOperacionMeta(d.notas);
            const chip = destinoEstadoChip(meta.destino_estado);
            const tiempo = getDestinoTiempoResumen(d);
            const vis = visualForStop(d);
            return (
              <div key={d.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1e3a8a" }}>{d.nombre}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: chip.bg, color: chip.color }}>
                    {chip.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  {d.direccion || "—"}
                  {tiempo.label ? ` · ${tiempo.label}` : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  <button type="button" disabled={busy} onClick={() => onDescargaEntrada?.(d)} style={chipBtn(vis.btnBg)}>
                    {muelleEntradaLabel(d)}
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDescargaSalida?.(d)} style={chipBtn()}>
                    {muelleSalidaLabel(d)}
                  </button>
                  {onCancelOperacion ? (
                    <CancelBtn stop={d} servicio={servicio} busy={busy} onCancel={onCancelOperacion} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* 5. Acciones secundarias */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: 0.8 }}>
          ACCIONES SECUNDARIAS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" disabled={busy} onClick={onRegistrarRetorno} style={chipBtn("#ea580c", true)}>
            Registrar retorno
          </button>
          <button type="button" disabled={busy} onClick={onRegistrarDevolucion} style={chipBtn("#7e22ce", true)}>
            Registrar devolución
          </button>
        </div>
      </section>
    </div>
  );
}

function chipBtn(bg = "#fff", full = false) {
  const isWhite = bg === "#fff";
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: isWhite ? "1px solid #e2e8f0" : "none",
    background: isWhite ? "#fff" : bg,
    color: isWhite ? "#334155" : "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    width: full ? "100%" : undefined,
    flex: full ? undefined : "1 1 auto",
  };
}

function CancelBtn({ stop, servicio, busy, onCancel }) {
  const ev = evaluateCancelOperacion(stop, servicio);
  if (!ev.allowed) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onCancel({ stop, ...ev })}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #fecaca",
        background: "#fef2f2",
        color: "#b91c1c",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {ev.mode === "delete" ? "Cancelar operación" : "Anular por error"}
    </button>
  );
}
