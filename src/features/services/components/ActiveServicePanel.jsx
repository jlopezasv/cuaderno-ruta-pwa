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

function getCockpitSignals(servicio, stops, evidenciasByStop) {
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

function CockpitShell({ children }) {
  return (
    <div
      style={{
        background: "#0F172A",
        borderRadius: 22,
        border: "1px solid #334155",
        boxShadow: "0 0 0 1px rgba(245, 158, 11, 0.1), 0 16px 48px rgba(0,0,0,.35)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          height: 5,
          background: "linear-gradient(90deg, #F59E0B, #EA580C, #22C55E)",
        }}
      />
      <div style={{ padding: "20px 18px 22px" }}>{children}</div>
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
}) {
  const sig = getCockpitSignals(servicio, stops, evidenciasByStop);
  const estadoColor = ESTADO_COLOR[servicio.estado] || su;

  if (mode === "asignado") {
    const nextStop = stops.find((s) => s.estado === "pendiente") || stops[0] || null;
    return (
      <div style={{ padding: "14px 12px 88px", maxWidth: 560, margin: "0 auto" }}>
        <CockpitShell>
          <CockpitSection title="CABECERA OPERACIONAL" first>
            <div style={{ fontSize: 22, fontWeight: 900, color: tx, lineHeight: 1.25, marginBottom: 10 }}>
              {servicio.origen} → {servicio.destino}
            </div>
            {servicio.referencia && (
              <div style={{ fontSize: 13, color: "#F59E0B", fontWeight: 600, marginBottom: 10 }}>
                Ref: {servicio.referencia}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <span
                style={{
                  background: sig.operationalMeta.color + "22",
                  color: sig.operationalMeta.color,
                  borderRadius: 8,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {sig.operationalMeta.icon} {sig.operationalMeta.label.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: su }}>Última actividad: {sig.lastActivity.label}</span>
            </div>
            {sig.attention && (
              <div style={{ marginTop: 8 }}>
                <span
                  style={{
                    background: "#F59E0B25",
                    color: "#FB923C",
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  ⚠ Atención requerida
                </span>
                {sig.attentionReason ? (
                  <div style={{ fontSize: 12, color: su, marginTop: 6, lineHeight: 1.45 }}>{sig.attentionReason}</div>
                ) : null}
              </div>
            )}
          </CockpitSection>

          <CockpitSection title="EJECUCIÓN">
            <div style={{ fontSize: 14, color: tx, marginBottom: 10 }}>
              <span style={{ color: su, fontSize: 12, fontWeight: 700 }}>Estado del servicio </span>
              <span style={{ color: estadoColor, fontWeight: 800 }}>{ESTADO_LABEL[servicio.estado] || servicio.estado}</span>
            </div>
            <div style={{ fontSize: 13, color: su, marginBottom: 8 }}>
              Progreso de paradas: <strong style={{ color: "#F59E0B" }}>0</strong>
              <span style={{ color: "#475569" }}> / {stops.length}</span>
            </div>
            <div style={{ background: card, borderRadius: 10, height: 8, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ background: "#334155", height: "100%", width: "0%", borderRadius: 10 }} />
            </div>
            {nextStop ? (
              <div>
                <div style={{ fontSize: 11, color: su, fontWeight: 700, marginBottom: 4 }}>Próxima parada</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: tx }}>{nextStop.nombre}</div>
                <div style={{ fontSize: 12, color: STOP_COLOR[nextStop.tipo] || "#06B6D4", marginTop: 4 }}>
                  {STOP_ICON[nextStop.tipo]} {nextStop.tipo.replace("_", " ").toUpperCase()} · Stop {nextStop.orden}/{stops.length}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: su }}>Sin paradas definidas.</div>
            )}
            {servicio.fecha_inicio && (
              <div style={{ fontSize: 12, color: su, marginTop: 12 }}>
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
          <div style={{ fontSize: 22, fontWeight: 900, color: tx, lineHeight: 1.25, marginBottom: 10 }}>
            {servicio.origen} → {servicio.destino}
          </div>
          {servicio.referencia && (
            <div style={{ fontSize: 13, color: "#F59E0B", fontWeight: 600, marginBottom: 10 }}>Ref: {servicio.referencia}</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <span
              style={{
                background: sig.operationalMeta.color + "22",
                color: sig.operationalMeta.color,
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {sig.operationalMeta.icon} {sig.operationalMeta.label.toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: su }}>Última actividad: {sig.lastActivity.label}</span>
          </div>
          {sig.attention && (
            <div style={{ marginTop: 6 }}>
              <span
                style={{
                  background: "#F59E0B25",
                  color: "#FB923C",
                  borderRadius: 8,
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                ⚠ Atención requerida
              </span>
              {sig.attentionReason ? (
                <div style={{ fontSize: 12, color: su, marginTop: 6, lineHeight: 1.45 }}>{sig.attentionReason}</div>
              ) : null}
            </div>
          )}
        </CockpitSection>

        <CockpitSection title="EJECUCIÓN">
          <div style={{ fontSize: 14, color: tx, marginBottom: 12 }}>
            <span style={{ color: su, fontSize: 12, fontWeight: 700 }}>Estado del servicio </span>
            <span style={{ color: estadoColor, fontWeight: 800 }}>{ESTADO_LABEL[servicio.estado] || servicio.estado}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: su, fontWeight: 700 }}>Progreso de paradas</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: "#F59E0B" }}>
              {completados}/{stops.length}
            </span>
          </div>
          <div style={{ background: card, borderRadius: 10, height: 10, overflow: "hidden", marginBottom: 18 }}>
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

          <div style={{ fontSize: 11, color: estaEnParada ? "#A78BFA" : su, fontWeight: 800, marginBottom: 8 }}>
            {estaEnParada ? "EN PARADA — " + stopMostrar.tipo.replace("_", " ").toUpperCase() : "PRÓXIMA PARADA"}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>{STOP_ICON[stopMostrar.tipo] || "📍"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: tx, lineHeight: 1.2 }}>{stopMostrar.nombre}</div>
              {stopMostrar.direccion && <div style={{ fontSize: 13, color: su, marginTop: 6 }}>{stopMostrar.direccion}</div>}
              {stopMostrar.notas && (
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>📝 {stopMostrar.notas}</div>
              )}
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
                onClick={() => marcarLlegado(stopMostrar.id).then(() => showToast("📍 Llegada registrada"))}
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
                ✅ HE LLEGADO
              </button>
            </div>
          ) : (
            <div>
              <Ev stopId={stopMostrar.id} showToast={showToast} />
              <button
                onClick={() =>
                  marcarCompletado(stopMostrar.id).then(() => {
                    showToast("✅ Stop completado");
                    recargar();
                  })
                }
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
                  marginTop: 14,
                }}
              >
                ✅ STOP COMPLETADO — SALIR
              </button>
            </div>
          )}
        </CockpitSection>
      </CockpitShell>

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
