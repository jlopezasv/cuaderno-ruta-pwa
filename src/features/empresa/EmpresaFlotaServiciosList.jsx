import { memo, useCallback, useMemo } from "react";
import { EmpresaFlotaServicioCard } from "./EmpresaFlotaServicioCard.jsx";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../domain/service/serviceOperationalStatus.js";
import { getLastServiceActivity } from "../../domain/service/serviceActivity.js";
import { getAttentionReason, needsAttention } from "../../domain/service/serviceAttention.js";
import { servicioPendienteAsignacion } from "../../domain/fleet/servicioAssignment.js";
import { conductorUidOperativoServicio } from "../../domain/fleet/operationalPlaceholderConductor.js";

function evidenciasForServicioStops(servicioId, flotaStops, flotaEvs) {
  const stops = flotaStops[servicioId] || [];
  const o = {};
  for (const st of stops) {
    if (flotaEvs[st.id]) o[st.id] = flotaEvs[st.id];
  }
  return o;
}

const EmpresaFlotaServicioRow = memo(function EmpresaFlotaServicioRow({
  servicioId,
  servicio,
  stops,
  flotaEvs,
  flotaStopsMap,
  expanded,
  onToggleExpandId,
  nowMs,
  ubicInfo,
  ubicRefresh,
  normaC,
  conductor,
  nombreConductor,
  rowMeta,
  onRefreshServicioId,
  onAnularServicioId,
  onAsignarConductorServicioId,
  onEditarServicioId,
  fmtDur,
  tx,
  su,
}) {
  const onToggleExpand = useCallback(
    () => onToggleExpandId(servicioId),
    [onToggleExpandId, servicioId],
  );
  const onRefreshUbicacion = useCallback(
    () => onRefreshServicioId(servicioId),
    [onRefreshServicioId, servicioId],
  );
  const onAnular = useCallback(() => onAnularServicioId(servicioId), [onAnularServicioId, servicioId]);
  const onAsignarConductor = useCallback(
    () => onAsignarConductorServicioId?.(servicioId),
    [onAsignarConductorServicioId, servicioId],
  );
  const pendienteAsignacion = servicioPendienteAsignacion(servicio);
  return (
    <EmpresaFlotaServicioCard
      servicio={servicio}
      stops={stops}
      flotaEvs={flotaEvs}
      flotaStopsMap={flotaStopsMap}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      nowMs={nowMs}
      ubicInfo={ubicInfo}
      ubicRefresh={ubicRefresh}
      normaC={normaC}
      conductor={conductor}
      nombreConductor={nombreConductor}
      operationalMeta={rowMeta.operationalMeta}
      lastActivity={rowMeta.lastActivity}
      attention={rowMeta.attention}
      attentionReason={rowMeta.attentionReason}
      onRefreshUbicacion={onRefreshUbicacion}
      onAnular={onAnular}
      onAsignarConductor={pendienteAsignacion ? onAsignarConductor : undefined}
      onEditarServicio={onEditarServicioId ? () => onEditarServicioId(servicioId) : undefined}
      fmtDur={fmtDur}
      tx={tx}
      su={su}
    />
  );
});

function stopsOperativaSig(stops) {
  return (stops || [])
    .map(
      (s) =>
        `${s.id}:${s.estado}:${s.hora_llegada_real || ""}:${s.hora_salida_real || ""}`,
    )
    .join("|");
}

function operationalEtaSig(servicio) {
  const op = servicio?.operational_eta;
  if (!op || typeof op !== "object") return "";
  return `${op.updated_at || op.calculated_at || ""}:${op.eta || ""}:${op.remaining_km}:${op.remaining_mins}`;
}

function rowPropsEqual(prev, next) {
  if (prev.expanded !== next.expanded) return false;
  if (prev.expanded && prev.nowMs !== next.nowMs) return false;
  if (prev.servicio?.id !== next.servicio?.id) return false;
  if (prev.servicio?.estado !== next.servicio?.estado) return false;
  if (prev.servicio?.referencia !== next.servicio?.referencia) return false;
  if (prev.servicio?.conductor_id !== next.servicio?.conductor_id) return false;
  if (operationalEtaSig(prev.servicio) !== operationalEtaSig(next.servicio)) return false;
  if (stopsOperativaSig(prev.stops) !== stopsOperativaSig(next.stops)) return false;
  if (prev.ubicRefresh !== next.ubicRefresh) return false;
  if (prev.rowMeta !== next.rowMeta) return false;
  const la = prev.ubicInfo;
  const lb = next.ubicInfo;
  if (la !== lb) {
    if (!la || !lb) return false;
    if (la.lat !== lb.lat || la.lon !== lb.lon) return false;
    if ((la.ts || la.updatedAt) !== (lb.ts || lb.updatedAt)) return false;
  }
  if (prev.normaC !== next.normaC) {
    if (!prev.normaC || !next.normaC) return false;
    if (prev.normaC.isDriving !== next.normaC.isDriving) return false;
  }
  return true;
}

const EmpresaFlotaServicioRowMemo = memo(EmpresaFlotaServicioRow, rowPropsEqual);

function EmpresaFlotaServiciosListImpl({
  servicios,
  flotaStops,
  flotaEvs,
  expandedId,
  onToggleExpandId,
  nowMs,
  ubicacionConductorByUid,
  ubicacionRefreshByUid,
  conductoresByUid,
  nombreConductor,
  onRefreshServicioId,
  onAnularServicioId,
  onAsignarConductorServicioId,
  onEditarServicioId,
  fmtDur,
  tx,
  su,
}) {
  const rowMetaById = useMemo(() => {
    const meta = {};
    for (const sv of servicios) {
      const svStops = flotaStops[sv.id] || [];
      const evs = evidenciasForServicioStops(sv.id, flotaStops, flotaEvs);
      const lastActivity = getLastServiceActivity({ service: sv, stops: svStops, evidencias: evs });
      const attention = needsAttention({
        service: sv,
        stops: svStops,
        evidencias: evs,
        lastActivity,
      });
      meta[sv.id] = {
        operationalMeta: OPERATIONAL_STATUS_META[getOperationalStatus({ service: sv, stops: svStops, evidencias: evs })],
        lastActivity,
        attention,
        attentionReason: attention
          ? getAttentionReason({ service: sv, stops: svStops, evidencias: evs, lastActivity })
          : "",
      };
    }
    return meta;
  }, [servicios, flotaStops, flotaEvs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "6px 0 10px" }}>
      {servicios.map((sv) => {
        const uid = conductorUidOperativoServicio(sv);
        const normaC = uid ? conductoresByUid[uid]?.norma : null;
        return (
          <EmpresaFlotaServicioRowMemo
            key={sv.id}
            servicioId={sv.id}
            servicio={sv}
            stops={flotaStops[sv.id] || []}
            flotaEvs={flotaEvs}
            flotaStopsMap={flotaStops}
            expanded={expandedId === sv.id}
            onToggleExpandId={onToggleExpandId}
            nowMs={expandedId === sv.id ? nowMs : 0}
            ubicInfo={uid ? ubicacionConductorByUid[uid] : null}
            ubicRefresh={uid ? ubicacionRefreshByUid[uid] : null}
            normaC={normaC}
            conductor={uid ? conductoresByUid[uid] : null}
            nombreConductor={nombreConductor}
            rowMeta={rowMetaById[sv.id]}
            onRefreshServicioId={onRefreshServicioId}
            onAnularServicioId={onAnularServicioId}
            onAsignarConductorServicioId={onAsignarConductorServicioId}
            onEditarServicioId={onEditarServicioId}
            fmtDur={fmtDur}
            tx={tx}
            su={su}
          />
        );
      })}
    </div>
  );
}

export const EmpresaFlotaServiciosList = memo(EmpresaFlotaServiciosListImpl);
