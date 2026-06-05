import { useEffect, useMemo, useState } from "react";
import { asignarConductorEnServicioCreado } from "../../domain/fleet/servicioCreateFlow.js";
import {
  fetchServicioConductorIds,
  syncServicioColaboradores,
} from "../../domain/fleet/servicioAssignment.js";
import { getFixedServiceRoute } from "../../domain/service/serviceIdentity.js";
import { buildAsignarConductorPickerRows } from "./asignarConductorServicioModel.js";

const EMPRESA_UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  surfaceSoft: "#f8fafc",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
  red: "#dc2626",
  redSoft: "#fef2f2",
};

/** Por encima de Leaflet (.leaflet-pane ~400–700) y controles del mapa beta. */
const MODAL_Z_INDEX = 10000;

function useModalLayout() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [viewH, setViewH] = useState(
    () =>
      typeof window !== "undefined"
        ? window.visualViewport?.height || window.innerHeight
        : 600,
  );

  useEffect(() => {
    function update() {
      setIsMobile(window.innerWidth < 768);
      setViewH(window.visualViewport?.height || window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", update);
    };
  }, []);

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    zIndex: MODAL_Z_INDEX,
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    padding: isMobile ? 0 : 16,
    pointerEvents: "auto",
  };

  const modalStyle = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: `${Math.min(viewH * 0.95, viewH - 20)}px`,
        borderRadius: "20px 20px 0 0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: MODAL_Z_INDEX + 1,
      }
    : {
        position: "relative",
        width: "100%",
        maxWidth: 520,
        maxHeight: "88vh",
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 48px rgba(15, 23, 42, 0.18)",
        zIndex: MODAL_Z_INDEX + 1,
      };

  return { isMobile, overlayStyle, modalStyle };
}

function StatusBadge({ status }) {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 800,
        color: status.color,
        background: status.bg,
        border: `1px solid ${status.border}`,
        borderRadius: 999,
        padding: "3px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {status.label}
    </span>
  );
}

function AssignConductorCard({ row, disabled, onAssign }) {
  const { nombre, matricula, ciudad, telefono, status } = row;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: EMPRESA_UI.surfaceSoft,
        border: `1px solid ${EMPRESA_UI.border}`,
        borderRadius: 12,
        padding: "12px 12px",
        marginBottom: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800, color: EMPRESA_UI.tx, lineHeight: 1.25 }}>
            {status.dot} {nombre}
          </span>
          {matricula ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: EMPRESA_UI.muted }}>
              {matricula}
            </span>
          ) : null}
          <StatusBadge status={status} />
        </div>
        <div style={{ fontSize: 12, color: EMPRESA_UI.muted, lineHeight: 1.4 }}>
          <div>📍 {ciudad}</div>
          <div>📞 {telefono}</div>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAssign(row)}
        style={{
          flexShrink: 0,
          background: EMPRESA_UI.accentSoft,
          color: EMPRESA_UI.accent,
          border: "1px solid #bfdbfe",
          borderRadius: 9,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 800,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        Asignar
      </button>
    </div>
  );
}

export function AsignarConductorServicioModal({
  servicio,
  conductores,
  flotaServicios = [],
  flotaIncidenciasResumen = {},
  ubicacionConductorByUid = {},
  formatLugar = null,
  flotaStops = {},
  onClose,
  onAsignado,
  onNotifyAssignment,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const { overlayStyle, modalStyle } = useModalLayout();

  const principalId = servicio?.conductor_id || null;
  const isAssignMode = !principalId;
  const lista = (conductores || []).filter((c) => c.user_id);
  const stops = flotaStops[servicio?.id] || [];
  const rutaLabel = getFixedServiceRoute(servicio, "Origen", "Destino", stops);

  const pickerRows = useMemo(
    () =>
      buildAsignarConductorPickerRows({
        conductores: lista,
        flotaServicios,
        incidenciasByServicioId: flotaIncidenciasResumen,
        ubicacionByUid: ubicacionConductorByUid,
        formatLugar,
        searchQuery: search,
      }),
    [
      lista,
      flotaServicios,
      flotaIncidenciasResumen,
      ubicacionConductorByUid,
      formatLugar,
      search,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    setError("");
    setLoadingExisting(true);
    setSearch("");
    setPendingConfirm(null);
    setSelected(new Set(principalId ? [principalId] : []));
    if (!servicio?.id) {
      setLoadingExisting(false);
      return;
    }
    (async () => {
      const ids = await fetchServicioConductorIds(servicio.id);
      if (cancelled) return;
      setSelected(new Set([...(principalId ? [principalId] : []), ...ids]));
      setLoadingExisting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [servicio?.id, principalId]);

  const toggle = (uid) => {
    if (!uid || uid === principalId || saving) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selCount = selected.size;

  async function persistAssignment(principal, ids) {
    if (!servicio?.id || !principal) return;
    let referencia = servicio.referencia;
    let principalAssigned = false;
    const c = lista.find((x) => x.user_id === principal);

    if (!principalId) {
      const assignResult = await asignarConductorEnServicioCreado({
        servicioId: servicio.id,
        servicio,
        conductorId: principal,
        conductorNombre: c?.nombre || "Conductor",
        origen: servicio.origen,
        destino: servicio.destino,
        fechaInicio: servicio.fecha_inicio,
      });
      referencia = assignResult.referencia ?? referencia;
      principalAssigned = true;
      onNotifyAssignment?.({
        conductorId: principal,
        origen: servicio.origen,
        destino: servicio.destino,
        fechaInicio: servicio.fecha_inicio,
        servicioId: servicio.id,
      });
    }

    const colaboradorIds = ids.filter((id) => id !== principal);
    const sync = await syncServicioColaboradores(servicio.id, principal, colaboradorIds);
    for (const id of sync?.added || []) {
      onNotifyAssignment?.({
        conductorId: id,
        origen: servicio.origen,
        destino: servicio.destino,
        fechaInicio: servicio.fecha_inicio,
        servicioId: servicio.id,
      });
    }

    const principalNombre = c?.nombre || "Conductor";
    onAsignado?.({
      servicioId: servicio.id,
      conductorId: principal,
      conductorNombre: principalNombre,
      referencia,
      principalAssigned,
      totalConductores: 1 + colaboradorIds.length,
    });
  }

  async function confirmAssign() {
    if (!pendingConfirm?.uid || saving) return;
    setSaving(true);
    setError("");
    try {
      await persistAssignment(pendingConfirm.uid, [pendingConfirm.uid]);
    } catch (e) {
      setError(e?.message || "No se pudo asignar");
      setSaving(false);
    }
  }

  async function guardarManage() {
    if (!servicio?.id || saving) return;
    const ids = [...selected];
    if (!principalId && ids.length === 0) {
      setError("Selecciona al menos un conductor");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await persistAssignment(principalId, ids);
    } catch (e) {
      setError(e?.message || "No se pudo guardar");
      setSaving(false);
    }
  }

  const headerTitle = isAssignMode ? "Asignar conductor" : "Conductores del servicio";
  const busy = saving || loadingExisting;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{ ...modalStyle, background: EMPRESA_UI.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${EMPRESA_UI.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 750, color: EMPRESA_UI.tx }}>{headerTitle}</div>
          <div style={{ fontSize: 12, color: EMPRESA_UI.muted, marginTop: 6, lineHeight: 1.45 }}>
            Servicio:
            <br />
            <span style={{ fontWeight: 700, color: EMPRESA_UI.tx }}>{rutaLabel}</span>
          </div>
          {!isAssignMode ? (
            <div style={{ fontSize: 11, color: EMPRESA_UI.muted, marginTop: 6, lineHeight: 1.4 }}>
              Marca uno o varios conductores. El principal no se puede quitar aquí.
            </div>
          ) : null}
        </div>

        {pendingConfirm && isAssignMode ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                textAlign: "center",
                gap: 12,
                minHeight: 160,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: EMPRESA_UI.tx, lineHeight: 1.45 }}>
                Asignar este servicio a {pendingConfirm.nombre}?
              </div>
              <div style={{ fontSize: 12, color: EMPRESA_UI.muted }}>{rutaLabel}</div>
            </div>
            {error ? (
              <div
                style={{
                  background: EMPRESA_UI.redSoft,
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: EMPRESA_UI.red,
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setPendingConfirm(null);
                  setError("");
                }}
                disabled={saving}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: `1px solid ${EMPRESA_UI.border}`,
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: EMPRESA_UI.muted,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmAssign()}
                disabled={saving}
                style={{
                  flex: 1,
                  background: EMPRESA_UI.accent,
                  border: "none",
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#fff",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Asignando…" : "Confirmar"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conductor..."
                autoComplete="off"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: EMPRESA_UI.surfaceSoft,
                  border: `1px solid ${EMPRESA_UI.border}`,
                  borderRadius: 10,
                  padding: "11px 12px",
                  fontSize: 14,
                  color: EMPRESA_UI.tx,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", minHeight: 0 }}>
              {!lista.length ? (
                <div style={{ fontSize: 13, color: EMPRESA_UI.muted, lineHeight: 1.45 }}>
                  Añade un conductor en la pestaña Conductores para poder asignarlo.
                </div>
              ) : isAssignMode ? (
                pickerRows.length ? (
                  pickerRows.map((row) => (
                    <AssignConductorCard
                      key={row.uid}
                      row={row}
                      disabled={busy}
                      onAssign={(r) => {
                        setError("");
                        setPendingConfirm({ uid: r.uid, nombre: r.nombre });
                      }}
                    />
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: EMPRESA_UI.muted, lineHeight: 1.45 }}>
                    Ningún conductor coincide con la búsqueda.
                  </div>
                )
              ) : (
                pickerRows.map((row) => {
                  const isPrincipal = row.uid === principalId;
                  const checked = selected.has(row.uid);
                  return (
                    <button
                      key={row.uid}
                      type="button"
                      disabled={busy || isPrincipal}
                      onClick={() => toggle(row.uid)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: checked ? EMPRESA_UI.accentSoft : EMPRESA_UI.surfaceSoft,
                        border: `1px solid ${checked ? "#bfdbfe" : EMPRESA_UI.border}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        fontSize: 14,
                        fontWeight: 700,
                        color: EMPRESA_UI.tx,
                        cursor: busy || isPrincipal ? "default" : "pointer",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          flexShrink: 0,
                          borderRadius: 6,
                          border: `2px solid ${checked ? EMPRESA_UI.accent : "#cbd5e1"}`,
                          background: checked ? EMPRESA_UI.accent : "#fff",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 900,
                          lineHeight: 1,
                        }}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>
                            {row.status.dot} {row.nombre}
                          </span>
                          <StatusBadge status={row.status} />
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: EMPRESA_UI.muted,
                            fontWeight: 500,
                            marginTop: 3,
                            lineHeight: 1.35,
                          }}
                        >
                          📍 {row.ciudad} · 📞 {row.telefono}
                        </div>
                      </span>
                      {isPrincipal ? (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: 10,
                            fontWeight: 800,
                            color: EMPRESA_UI.accent,
                            background: "#fff",
                            border: "1px solid #bfdbfe",
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          PRINCIPAL
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
              {error && !pendingConfirm ? (
                <div
                  style={{
                    background: EMPRESA_UI.redSoft,
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    color: EMPRESA_UI.red,
                  }}
                >
                  {error}
                </div>
              ) : null}
            </div>

            {!isAssignMode ? (
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: `1px solid ${EMPRESA_UI.border}`,
                  display: "flex",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: `1px solid ${EMPRESA_UI.border}`,
                    borderRadius: 10,
                    padding: "11px",
                    fontSize: 13,
                    color: EMPRESA_UI.muted,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void guardarManage()}
                  disabled={saving || loadingExisting || !lista.length}
                  style={{
                    flex: 1,
                    background: EMPRESA_UI.accentSoft,
                    border: "1px solid #bfdbfe",
                    borderRadius: 10,
                    padding: "11px",
                    fontSize: 13,
                    fontWeight: 800,
                    color: EMPRESA_UI.accent,
                    cursor: saving || loadingExisting ? "default" : "pointer",
                    opacity: saving || loadingExisting ? 0.6 : 1,
                  }}
                >
                  {saving ? "Guardando…" : `Guardar${selCount ? ` (${selCount})` : ""}`}
                </button>
              </div>
            ) : (
              <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${EMPRESA_UI.border}` }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: `1px solid ${EMPRESA_UI.border}`,
                    borderRadius: 10,
                    padding: "11px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: EMPRESA_UI.muted,
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  Cerrar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
