import { useEffect, useMemo, useState } from "react";
import { STOP_COLOR, STOP_ICON } from "../../../domain/fleet/stopTypes";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../../domain/fleet/serviceStatus";
import {
  countServiceDocuments,
  getDocumentLabel,
} from "../../../domain/service/serviceDocuments";
import { getCurrentStop } from "../../../domain/service/serviceStops";
import { getLastServiceActivity } from "../../../domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "../../../domain/service/serviceAttention";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../../domain/service/serviceOperationalStatus";
import { getServiceEta } from "../../../domain/service/serviceEta";
import { getUnifiedTripPresentation } from "../../../domain/service/activeTripState";
import {
  getOperationalTripStartedAt,
  stripServicioOperacionDisplay,
} from "../../../domain/service/serviceOperacionMeta.js";
import { getInicioOperacionMs, stripOperacionMetaDisplay } from "../../../domain/service/stopOperacionMeta.js";

function flattenEvidencias(evidenciasByStop) {
  const out = [];
  if (!evidenciasByStop || typeof evidenciasByStop !== "object") return out;
  for (const arr of Object.values(evidenciasByStop)) {
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

function countIncidencias(evidenciasByStop) {
  return flattenEvidencias(evidenciasByStop).filter((e) => e?.tipo === "incidencia").length;
}

function recentEvidenciasFlat(evidenciasByStop, limit) {
  return flattenEvidencias(evidenciasByStop)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export function getCockpitSignals(servicio, stops, evidenciasByStop) {
  const lastActivity = getLastServiceActivity({
    service: servicio,
    stops,
    evidencias: evidenciasByStop,
  });
  const operationalStatus = getOperationalStatus({
    service: servicio,
    stops,
    evidencias: evidenciasByStop,
  });
  const operationalMeta = OPERATIONAL_STATUS_META[operationalStatus];
  const attention = needsAttention({
    service: servicio,
    stops,
    evidencias: evidenciasByStop,
    lastActivity,
  });
  const attentionReason = attention
    ? getAttentionReason({
        service: servicio,
        stops,
        evidencias: evidenciasByStop,
        lastActivity,
      })
    : "";
  const docTotal = countServiceDocuments(stops, evidenciasByStop);
  const incidenciasN = countIncidencias(evidenciasByStop);
  const recientes = recentEvidenciasFlat(evidenciasByStop, 4);
  return {
    lastActivity,
    operationalMeta,
    attention,
    attentionReason,
    docTotal,
    incidenciasN,
    recientes,
  };
}

function CockpitSection({ title, children, first }) {
  return (
    <div
      style={{
        paddingTop: first ? 0 : 18,
        marginTop: first ? 0 : 16,
        borderTop: first ? "none" : "1px solid rgba(51, 65, 85, 0.85)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#94A3B8",
          fontWeight: 800,
          letterSpacing: 1.2,
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/** Bloque compacto: mismo motor ETA/norma vía `presentation` (getServiceEta + getUnifiedTripPresentation). */
export function OperativaViajeBlock({
  servicio,
  presentation,
  tx,
  su,
  onOpenViajeModal,
  showViajeCta = true,
  viajeCtaLabel = "Añadir destino al viaje",
  hideEta = false,
  hideRuta = false,
  dense = false,
}) {
  const etaBig =
    presentation.etaOperacionalLabel === "…"
      ? "…"
      : presentation.etaOperacionalLabel === "Sin ETA"
        ? "—"
        : presentation.etaOperacionalLabel;

  const pad = dense ? "10px 11px 12px" : "14px 14px 16px";
  const etaSize = dense ? 24 : 28;

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.55)",
        borderRadius: dense ? 12 : 14,
        padding: pad,
        border: "1px solid rgba(51, 65, 85, 0.9)",
      }}
    >
      {showViajeCta ? (
        <button
          type="button"
          onClick={() =>
            onOpenViajeModal?.({
              destino: servicio?.destino?.trim() || "",
              origen: servicio?.origen?.trim() || "",
              servicioId: servicio?.id,
              referenciaActual: servicio?.referencia ?? null,
            })
          }
          style={{
            width: "100%",
            background: "transparent",
            color: "#F59E0B",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 4,
          }}
        >
          {viajeCtaLabel}
        </button>
      ) : null}

      {!hideEta ? (
        <div style={{ marginTop: showViajeCta ? 10 : 0 }}>
          <div style={{ fontSize: 11, color: su, fontWeight: 700, marginBottom: 6 }}>📍 Llegada estimada</div>
          <div
            style={{
              fontSize: etaSize,
              fontWeight: 900,
              color: tx,
              letterSpacing: -0.3,
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {etaBig}
          </div>
          <div style={{ fontSize: 11, color: su, marginTop: 6 }}>Estimación operacional</div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: hideEta ? (showViajeCta ? 10 : 0) : 16,
          paddingTop: hideEta ? 0 : 14,
          borderTop: hideEta && !showViajeCta ? "none" : "1px solid rgba(51, 65, 85, 0.65)",
        }}
      >
        <div style={{ fontSize: 11, color: su, fontWeight: 700, marginBottom: 4 }}>⏱ Conducción disponible</div>
        <div style={{ fontSize: dense ? 15 : 17, fontWeight: 800, color: "#22C55E" }}>
          {presentation.tiempoConduccionDisponible}
        </div>
      </div>

      {!hideRuta ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: su, fontWeight: 700, marginBottom: 4 }}>🚚 Ruta activa</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: tx, lineHeight: 1.35 }}>{presentation.rutaHeadline}</div>
        </div>
      ) : null}
    </div>
  );
}

export function CockpitShell({ children, dense = false }) {
  return (
    <div
      style={{
        background: "#151d2e",
        borderRadius: dense ? 16 : 22,
        border: "1px solid rgba(51, 65, 85, 0.65)",
        boxShadow: dense
          ? "0 0 0 1px rgba(245, 158, 11, 0.06)"
          : "0 0 0 1px rgba(245, 158, 11, 0.1), 0 16px 48px rgba(0,0,0,.35)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          height: dense ? 3 : 5,
          background: "linear-gradient(90deg, #F59E0B, #EA580C, #22C55E)",
        }}
      />
      <div style={{ padding: dense ? "10px 12px 12px" : "20px 18px 22px" }}>{children}</div>
    </div>
  );
}

/**
 * Cockpit operativo — tab Servicio. Solo presentación; handlers del padre.
 */
export function ActiveServicePanel({
  mode,
  servicio,
  stops,
  completados,
  evidenciasByStop,
  showToast,
  onIniciarServicio,
  marcarLlegado,
  marcarCompletado,
  recargar,
  EvidenciasStopComponent,
  card = "#1E293B",
  tx = "#F1F5F9",
  su = "#64748B",
  norma,
  viajeActivo = null,
  onOpenViajeModal,
  conductorNombre = "Conductor",
  marcarInicioOperacion = async () => {},
}) {
  const sig = getCockpitSignals(servicio, stops, evidenciasByStop);
  const estadoColor = ESTADO_COLOR[servicio.estado] || su;
  const [etaSlot, setEtaSlot] = useState(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [confirmMuelle, setConfirmMuelle] = useState(null);
  const viajeOpIniciado = !!getOperationalTripStartedAt(servicio);
  const presentation = useMemo(
    () =>
      getUnifiedTripPresentation({
        viajeActivo,
        servicio,
        norma,
        etaSlot,
        etaLoading,
      }),
    [viajeActivo, servicio, norma, etaSlot, etaLoading],
  );

  useEffect(() => {
    let cancelled = false;
    setEtaLoading(true);
    setEtaSlot(null);

    const run = async (pos) => {
      try {
        const r = await getServiceEta({
          service: servicio,
          stops,
          norma: norma ?? null,
          currentPosition: pos,
          operationalTripStarted: viajeOpIniciado,
        });
        if (!cancelled) setEtaSlot(r);
      } catch {
        if (!cancelled) setEtaSlot(null);
      } finally {
        if (!cancelled) setEtaLoading(false);
      }
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => run({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => run(null),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
      );
    } else {
      run(null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    servicio?.id,
    servicio?.origen,
    servicio?.destino,
    servicio?.estado,
    servicio?.fecha_inicio,
    servicio?.referencia,
    stops,
    norma,
    viajeOpIniciado,
  ]);

  useEffect(() => {
    if (!viajeOpIniciado || servicio?.estado !== "en_curso") return;
    const t = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            getServiceEta({
              service: servicio,
              stops,
              norma: norma ?? null,
              currentPosition: { lat: p.coords.latitude, lon: p.coords.longitude },
              operationalTripStarted: true,
            })
              .then((r) => setEtaSlot(r))
              .catch(() => {});
          },
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
        );
      }
    }, 75000);
    return () => clearInterval(t);
  }, [viajeOpIniciado, servicio?.estado, servicio?.id, stops, norma, servicio?.referencia]);

  if (import.meta.env.DEV) {
    console.log("[AUDIT PR-22B] RENDER ActiveServicePanel", {
      mode,
      servicioEstado: servicio?.estado,
      bloqueOperativa: true,
    });
  }

  if (mode === "asignado") {
    const nextStop = stops.find((s) => s.estado === "pendiente") || stops[0] || null;
    return (
      <div style={{ padding: "14px 12px 88px", maxWidth: 560, margin: "0 auto" }}>
        <CockpitShell>
          <CockpitSection title="CABECERA OPERACIONAL" first>
            <div style={{ fontSize: 17, fontWeight: 900, color: tx, lineHeight: 1.25, marginBottom: 12 }}>
              {servicio.origen} → {servicio.destino}
            </div>
            <div style={{ fontSize: 13, color: su, marginBottom: 6 }}>
              <span style={{ color: "#94A3B8" }}>Cliente · </span>
              <span style={{ color: tx, fontWeight: 600 }}>{stripServicioOperacionDisplay(servicio.referencia) || "—"}</span>
            </div>
            <div style={{ fontSize: 13, color: su, marginBottom: 8 }}>
              <span style={{ color: "#94A3B8" }}>Conductor · </span>
              <span style={{ color: tx, fontWeight: 600 }}>{conductorNombre}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <span style={{ background: estadoColor + "28", color: estadoColor, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>
                {ESTADO_LABEL[servicio.estado] || servicio.estado}
              </span>
              <span style={{ fontSize: 12, color: su }}>
                <span style={{ color: sig.operationalMeta.color }}>{sig.operationalMeta.icon}</span> {sig.operationalMeta.label} · {sig.lastActivity.label}
              </span>
            </div>
            {!viajeOpIniciado && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 1.45, background: "rgba(245,158,11,0.08)", borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(245,158,11,0.25)" }}>
                Viaje operacional pendiente: pulsa <strong style={{ color: "#F59E0B" }}>Añadir destino al viaje</strong> cuando inicies la ruta principal (antes cuenta solo para tacógrafo personal).
              </div>
            )}
            <div style={{ fontSize: 12, color: su, marginBottom: 6 }}>
              Próxima parada ·{" "}
              <strong style={{ color: tx }}>{nextStop ? nextStop.nombre : "—"}</strong>
              {nextStop && (
                <span style={{ color: "#64748B" }}>
                  {" "}
                  · {nextStop.orden}/{stops.length}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: su }}>
              Progreso paradas · <strong style={{ color: "#F59E0B" }}>0</strong>/{stops.length || "0"}
            </div>
            {sig.attention && (
              <div style={{ marginTop: 10 }}>
                <span style={{ background: "#F59E0B25", color: "#FB923C", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 800 }}>⚠ Atención requerida</span>
                {sig.attentionReason ? <div style={{ fontSize: 12, color: su, marginTop: 6, lineHeight: 1.45 }}>{sig.attentionReason}</div> : null}
              </div>
            )}
          </CockpitSection>

          <CockpitSection title="PLANIFICACIÓN DEL VIAJE">
            <OperativaViajeBlock servicio={servicio} presentation={presentation} tx={tx} su={su} onOpenViajeModal={onOpenViajeModal} />
          </CockpitSection>

          <CockpitSection title="EJECUCIÓN">
            {nextStop ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: STOP_COLOR[nextStop.tipo] || "#06B6D4", marginBottom: 4 }}>
                  {STOP_ICON[nextStop.tipo]} {nextStop.tipo.replace("_", " ").toUpperCase()}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: tx }}>{nextStop.nombre}</div>
                {nextStop.direccion && <div style={{ fontSize: 13, color: su, marginTop: 4 }}>{nextStop.direccion}</div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: su }}>Sin paradas definidas.</div>
            )}
            {servicio.fecha_inicio && (
              <div style={{ fontSize: 12, color: su, marginBottom: 12 }}>
                Salida prevista:{" "}
                {new Date(servicio.fecha_inicio).toLocaleString("es-ES", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </CockpitSection>

          <CockpitSection title="DOCUMENTACIÓN">
            <div style={{ fontSize: 15, color: tx, marginBottom: 6 }}>
              <strong style={{ color: "#0EA5E9" }}>{sig.docTotal}</strong>{" "}
              <span style={{ color: su, fontSize: 13 }}>evidencias totales</span>
            </div>
            <div style={{ fontSize: 15, color: tx, marginBottom: 12 }}>
              <strong style={{ color: sig.incidenciasN ? "#F97316" : su }}>{sig.incidenciasN}</strong>{" "}
              <span style={{ color: su, fontSize: 13 }}>incidencias</span>
            </div>
            {sig.recientes.length ? (
              <div>
                <div style={{ fontSize: 11, color: su, fontWeight: 700, marginBottom: 8 }}>Recientes</div>
                {sig.recientes.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      fontSize: 13,
                      color: "#CBD5E1",
                      padding: "8px 0",
                      borderBottom: "1px solid #1E293B",
                    }}
                  >
                    <span style={{ color: "#F59E0B", fontWeight: 700 }}>{getDocumentLabel(ev)}</span>
                    <span style={{ color: "#475569", fontSize: 11, marginLeft: 8 }}>
                      {new Date(ev.created_at).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: su }}>Sin evidencias aún.</div>
            )}
          </CockpitSection>

          <CockpitSection title="ACCIONES">
            <button
              onClick={() => onIniciarServicio(servicio.id).then(() => showToast("▶ Servicio iniciado"))}
              style={{
                width: "100%",
                background: "#22C55E",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "17px",
                fontSize: 17,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              ▶ INICIAR SERVICIO
            </button>
          </CockpitSection>
        </CockpitShell>
      </div>
    );
  }

  const stopMostrar = getCurrentStop(stops);
  if (!stopMostrar) return null;
  const estaEnParada = stopMostrar.estado === "llegado";
  const Ev = EvidenciasStopComponent;

  return (
    <div style={{ padding: "14px 12px 88px", maxWidth: 560, margin: "0 auto" }}>
      <CockpitShell>
        <CockpitSection title="CABECERA OPERACIONAL" first>
          <div style={{ fontSize: 17, fontWeight: 900, color: tx, lineHeight: 1.25, marginBottom: 12 }}>
            {servicio.origen} → {servicio.destino}
          </div>
          <div style={{ fontSize: 13, color: su, marginBottom: 6 }}>
            <span style={{ color: "#94A3B8" }}>Cliente · </span>
            <span style={{ color: tx, fontWeight: 600 }}>{stripServicioOperacionDisplay(servicio.referencia) || "—"}</span>
          </div>
          <div style={{ fontSize: 13, color: su, marginBottom: 8 }}>
            <span style={{ color: "#94A3B8" }}>Conductor · </span>
            <span style={{ color: tx, fontWeight: 600 }}>{conductorNombre}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ background: estadoColor + "28", color: estadoColor, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>
              {ESTADO_LABEL[servicio.estado] || servicio.estado}
            </span>
            <span style={{ fontSize: 12, color: su }}>
              <span style={{ color: sig.operationalMeta.color }}>{sig.operationalMeta.icon}</span> {sig.operationalMeta.label} · {sig.lastActivity.label}
            </span>
          </div>
          {!viajeOpIniciado && (
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 1.45, background: "rgba(245,158,11,0.08)", borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(245,158,11,0.25)" }}>
              Viaje operacional pendiente: pulsa <strong style={{ color: "#F59E0B" }}>Añadir destino al viaje</strong> cuando inicies la ruta principal.
            </div>
          )}
          <div style={{ fontSize: 12, color: su, marginBottom: 6 }}>
            {estaEnParada ? "En parada · " : "Próxima parada · "}
            <strong style={{ color: tx }}>{stopMostrar.nombre}</strong>
            <span style={{ color: "#64748B" }}>
              {" "}
              · {stopMostrar.orden}/{stops.length}
            </span>
          </div>
          <div style={{ fontSize: 12, color: su, marginBottom: 6 }}>
            Progreso paradas ·{" "}
            <strong style={{ color: "#F59E0B" }}>
              {completados}/{stops.length || "0"}
            </strong>
          </div>
          <div style={{ background: card, borderRadius: 10, height: 8, overflow: "hidden", marginBottom: 12 }}>
            <div
              style={{
                background: "linear-gradient(90deg, #22C55E, #4ADE80)",
                height: "100%",
                width: `${stops.length ? (completados / stops.length) * 100 : 0}%`,
                borderRadius: 10,
                transition: "width .5s ease",
              }}
            />
          </div>
          {sig.attention && (
            <div style={{ marginTop: 6 }}>
              <span style={{ background: "#F59E0B25", color: "#FB923C", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 800 }}>⚠ Atención requerida</span>
              {sig.attentionReason ? <div style={{ fontSize: 12, color: su, marginTop: 6, lineHeight: 1.45 }}>{sig.attentionReason}</div> : null}
            </div>
          )}
        </CockpitSection>

        <CockpitSection title="PLANIFICACIÓN DEL VIAJE">
          <OperativaViajeBlock servicio={servicio} presentation={presentation} tx={tx} su={su} onOpenViajeModal={onOpenViajeModal} />
          {presentation.proximaParadaNormativa && presentation.proximaParadaNormativa !== "—" ? (
            <div style={{ marginTop: 14, fontSize: 12, color: su, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 700 }}>Descansos / hitos normativos · </span>
              {presentation.proximaParadaNormativa}
            </div>
          ) : null}
        </CockpitSection>

        <CockpitSection title="EJECUCIÓN">
          <div style={{ fontSize: 11, color: estaEnParada ? "#A78BFA" : su, fontWeight: 800, marginBottom: 8 }}>
            {estaEnParada ? "EN PARADA — " + stopMostrar.tipo.replace("_", " ").toUpperCase() : "PARADA ACTIVA"}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>{STOP_ICON[stopMostrar.tipo] || "📍"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: tx, lineHeight: 1.2 }}>{stopMostrar.nombre}</div>
              {stopMostrar.direccion && <div style={{ fontSize: 13, color: su, marginTop: 6 }}>{stopMostrar.direccion}</div>}
              {stripOperacionMetaDisplay(stopMostrar.notas) ? (
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>📝 {stripOperacionMetaDisplay(stopMostrar.notas)}</div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: STOP_COLOR[stopMostrar.tipo] || "#06B6D4", fontWeight: 800 }}>
                  Stop {stopMostrar.orden}/{stops.length}
                </span>
                {stopMostrar.lat && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#22C55E",
                      background: "#22C55E18",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontWeight: 700,
                    }}
                  >
                    🗺 GPS listo
                  </span>
                )}
              </div>
              {stopMostrar.hora_llegada_real && (
                <div style={{ fontSize: 12, color: su, marginTop: 8 }}>
                  Llegada:{" "}
                  {new Date(stopMostrar.hora_llegada_real).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          </div>
        </CockpitSection>

        <CockpitSection title="DOCUMENTACIÓN">
          <div style={{ fontSize: 15, color: tx, marginBottom: 6 }}>
            <strong style={{ color: "#0EA5E9" }}>{sig.docTotal}</strong>{" "}
            <span style={{ color: su, fontSize: 13 }}>evidencias totales</span>
          </div>
          <div style={{ fontSize: 15, color: tx, marginBottom: 12 }}>
            <strong style={{ color: sig.incidenciasN ? "#F97316" : su }}>{sig.incidenciasN}</strong>{" "}
            <span style={{ color: su, fontSize: 13 }}>incidencias</span>
          </div>
          {sig.recientes.length ? (
            <div>
              <div style={{ fontSize: 11, color: su, fontWeight: 700, marginBottom: 8 }}>Recientes</div>
              {sig.recientes.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    fontSize: 13,
                    color: "#CBD5E1",
                    padding: "8px 0",
                    borderBottom: "1px solid #1E293B",
                  }}
                >
                  <span style={{ color: "#F59E0B", fontWeight: 700 }}>{getDocumentLabel(ev)}</span>
                  <span style={{ color: "#475569", fontSize: 11, marginLeft: 8 }}>
                    {new Date(ev.created_at).toLocaleString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: su }}>Sin evidencias registradas.</div>
          )}
        </CockpitSection>

        <CockpitSection title="ACCIONES">
          {!estaEnParada ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(stopMostrar.lat && stopMostrar.lon) || stopMostrar.direccion ? (
                <a
                  href={
                    stopMostrar.lat
                      ? `https://maps.google.com/maps?daddr=${stopMostrar.lat},${stopMostrar.lon}`
                      : `https://maps.google.com/maps?daddr=${encodeURIComponent(stopMostrar.direccion)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    background: "#1E40AF",
                    color: "white",
                    borderRadius: 14,
                    padding: "16px",
                    fontSize: 16,
                    fontWeight: 800,
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  🗺 NAVEGAR {stopMostrar.lat ? "(GPS preciso)" : "(por dirección)"}
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirmMuelle({ kind: "entrada", stopId: stopMostrar.id })}
                style={{
                  width: "100%",
                  background: "#22C55E",
                  color: "white",
                  border: "none",
                  borderRadius: 14,
                  padding: "16px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                📍 Entrada en muelle
              </button>
            </div>
          ) : (
            <div>
              <Ev stopId={stopMostrar.id} showToast={showToast} />
              {!getInicioOperacionMs(stopMostrar) && (
                <button
                  type="button"
                  onClick={() =>
                    marcarInicioOperacion(stopMostrar.id).then(() => showToast("⚙ Inicio de operación registrado"))
                  }
                  style={{
                    width: "100%",
                    background: "#334155",
                    color: "#E2E8F0",
                    border: "1px solid #475569",
                    borderRadius: 12,
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    marginBottom: 10,
                  }}
                >
                  ⚙ Marcar inicio de operación
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmMuelle({ kind: "salida", stopId: stopMostrar.id })}
                style={{
                  width: "100%",
                  background: "#F59E0B",
                  color: "#0F172A",
                  border: "none",
                  borderRadius: 14,
                  padding: "16px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                  marginTop: 8,
                }}
              >
                🚪 Salida de muelle
              </button>
            </div>
          )}
        </CockpitSection>
      </CockpitShell>

      {confirmMuelle && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.72)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setConfirmMuelle(null)}
        >
          <div
            role="dialog"
            style={{
              background: "#1c2738",
              borderRadius: 16,
              padding: "20px 18px",
              maxWidth: 400,
              width: "100%",
              border: "1px solid rgba(51,65,85,0.85)",
              boxShadow: "0 20px 50px rgba(0,0,0,.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: tx, marginBottom: 8 }}>
              {confirmMuelle.kind === "entrada" ? "¿Confirmar entrada en muelle?" : "¿Confirmar salida de muelle?"}
            </div>
            <div style={{ fontSize: 13, color: su, lineHeight: 1.45, marginBottom: 18 }}>
              {confirmMuelle.kind === "entrada"
                ? "Se registrará la hora de entrada en el expediente operacional."
                : "Se registrará la salida y, si corresponde, se avanzará la parada."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmMuelle(null)}
                style={{
                  flex: 1,
                  background: "#334155",
                  color: tx,
                  border: "none",
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const { kind, stopId } = confirmMuelle;
                  setConfirmMuelle(null);
                  if (kind === "entrada") {
                    marcarLlegado(stopId).then(() => showToast("📍 Entrada en muelle registrada"));
                  } else {
                    marcarCompletado(stopId).then(() => {
                      showToast("✅ Salida de muelle registrada");
                      recargar();
                    });
                  }
                }}
                style={{
                  flex: 1,
                  background: confirmMuelle.kind === "entrada" ? "#22C55E" : "#F59E0B",
                  color: confirmMuelle.kind === "entrada" ? "white" : "#0F172A",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: su, fontWeight: 800, marginTop: 20, marginBottom: 10, letterSpacing: 0.8 }}>
        ITINERARIO
      </div>
      {stops.map((stop) => {
        const esActual = stop.id === stopMostrar.id;
        const icono = stop.estado === "completado" ? "✅" : esActual ? "▶" : "○";
        const colorTx = stop.estado === "completado" ? "#22C55E" : esActual ? "#F59E0B" : su;
        return (
          <div
            key={stop.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "11px 0",
              borderBottom: "1px solid #1E293B",
            }}
          >
            <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{icono}</span>
            <span style={{ fontSize: 14, color: colorTx, fontWeight: esActual ? 700 : 500, flex: 1 }}>
              {stop.orden}. {stop.nombre}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
              {stop.lat && <span style={{ fontSize: 9, color: "#22C55E" }}>🗺</span>}
              <span style={{ fontSize: 12, color: su }}>
                {stop.hora_llegada_real
                  ? new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : stop.estado === "pendiente"
                    ? "—"
                    : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
