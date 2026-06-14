import { useState, useEffect, useCallback, useMemo } from "react";
import { sbFetch } from "../../data/supabaseClient.js";
import { getServiceClient, getServiceNumber } from "../../domain/service/serviceIdentity.js";
import { mergeReferenciaOperacional, getServicioOperacionMeta } from "../../domain/service/serviceOperacionMeta.js";
import {
  buildOperationalPlacesMetaPatch,
  operationalPlacesFromStops,
  routeTextFromStops,
} from "../../domain/service/serviceOperationalPlaces.js";
import { assignConductorPrincipalToServicio } from "../../domain/fleet/servicioAssignment.js";
import { asignarConductorEnServicioCreado } from "../../domain/fleet/servicioCreateFlow.js";
import { servicioAdminEditMode } from "../../domain/fleet/servicioAdminEdit.js";
import { insertServicioCambiosRows, fmtAuditVal } from "../../domain/fleet/servicioAudit.js";
import { replaceStopsForServicio } from "../../domain/fleet/servicioStopsInsert.js";
import { STOP_TIPOS_FORM } from "../../domain/fleet/stopTypes.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { emptyStopGeoForm, prepareStopsGeoForPersist, stopRowToGeoForm } from "../../domain/geo/stopGeoModel.js";
import { StopGeoFieldsForm } from "../services/components/StopGeoFieldsForm.jsx";
import { canPickOfficeServicioResponsable } from "../../domain/empresa/officeUserFilters.js";
import {
  buildResponsableServicioPayload,
  validateOfficeResponsableOnCreate,
} from "../../domain/empresa/empresaOfficeUsers.js";
import { OfficeResponsableServicioField } from "./OfficeResponsableServicioField.jsx";

function p2(n) {
  return String(n).padStart(2, "0");
}

function toDTL(d) {
  if (d == null || d === "") return "";
  const D = new Date(d);
  if (Number.isNaN(D.getTime())) return "";
  return `${D.getFullYear()}-${p2(D.getMonth() + 1)}-${p2(D.getDate())}T${p2(D.getHours())}:${p2(D.getMinutes())}`;
}

function stopRowToForm(row) {
  return stopRowToGeoForm(row);
}

const EMPRESA_UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  surfaceSoft: "#f8fafc",
  tx: "#0f172a",
  muted: "#64748B",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
  red: "#b91c1c",
  redSoft: "#fee2e2",
};

export function EmpresaEditarServicioModal({
  servicio,
  conductores = [],
  officeResponsables = [],
  officeUser = null,
  userId = null,
  onClose,
  onApplied,
  onNotifyAssignment,
}) {
  const mode = servicio ? servicioAdminEditMode(servicio.estado) : null;
  const canEditResponsable =
    officeResponsables.length > 0 && canPickOfficeServicioResponsable(officeUser);
  const responsableLockedUid =
    officeUser?.rol === "trafico" && !officeUser?.puedeVerTodos
      ? officeUser.userId || userId
      : null;
  const wide = mode === "wide";

  const [stops, setStops] = useState([
    emptyStopGeoForm({ orden: 1, tipo: "carga" }),
    emptyStopGeoForm({ orden: 2, tipo: "descarga" }),
  ]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [fechaInicioLocal, setFechaInicioLocal] = useState("");
  const [serviceNumber, setServiceNumber] = useState("");
  const [cliente, setCliente] = useState("");
  const [refCliente, setRefCliente] = useState("");
  const [adminNotas, setAdminNotas] = useState("");
  const [conductorSel, setConductorSel] = useState("");
  const [responsableSel, setResponsableSel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rutaDesdeParadas = useMemo(() => routeTextFromStops(stops), [stops]);

  useEffect(() => {
    if (!servicio?.id) return;
    setFechaInicioLocal(servicio.fecha_inicio ? toDTL(servicio.fecha_inicio) : "");
    setServiceNumber(String(servicio.service_number ?? "").trim());
    setCliente(String(getServiceClient(servicio) || "").trim());
    setRefCliente(String(servicio.referencia_cliente ?? "").trim());
    setAdminNotas(String(getServicioOperacionMeta(servicio).admin_notas ?? "").trim());
    setConductorSel(servicio.conductor_id ? servicio.conductor_id : "");
    const resp = servicio.responsable_user_id ? servicio.responsable_user_id : "";
    setResponsableSel(responsableLockedUid || resp);
    setError("");
  }, [servicio, responsableLockedUid]);

  useEffect(() => {
    if (!servicio?.id || !wide) return;
    let cancelled = false;
    setStopsLoading(true);
    (async () => {
      try {
        const res = await sbFetch(
          `/rest/v1/stops?servicio_id=eq.${servicio.id}&select=id,orden,tipo,nombre,direccion,notas&order=orden.asc`,
        );
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const rows = await res.json().catch(() => []);
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length) {
          setStops(rows.map(stopRowToForm));
        } else {
          setStops([
            emptyStopGeoForm({ orden: 1, tipo: "carga" }),
            emptyStopGeoForm({ orden: 2, tipo: "descarga" }),
          ]);
        }
      } catch {
        if (!cancelled) setError("No se pudieron cargar las paradas");
      } finally {
        if (!cancelled) setStopsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [servicio?.id, wide]);

  const listaConductores = (conductores || []).filter((c) => c.user_id);

  function addStop() {
    setStops((prev) => [...prev, emptyStopGeoForm({ orden: prev.length + 1, tipo: "descarga" })]);
  }
  function removeStop(i) {
    setStops((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveStop(i, dir) {
    setStops((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const tmpOrden = arr[i].orden;
      arr[i] = { ...arr[i], orden: arr[j].orden };
      arr[j] = { ...arr[j], orden: tmpOrden };
      return [...arr].sort((a, b) => a.orden - b.orden);
    });
  }
  function changeStop(i, field, val) {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  }

  const guardar = useCallback(async () => {
    if (!servicio?.id || !mode || saving) return;
    setSaving(true);
    setError("");
    const auditRows = [];
    const patch = {};

    const pushAudit = (campo, before, after) => {
      const va = fmtAuditVal(before);
      const vn = fmtAuditVal(after);
      if (va === vn) return;
      auditRows.push({
        servicio_id: servicio.id,
        campo,
        valor_anterior: va || null,
        valor_nuevo: vn || null,
        user_id: userId || null,
      });
    };

    try {
      if (officeUser?.activo) {
        if (officeUser?.rol === "administrativo") {
          setError("No tienes permiso para editar servicios.");
          return;
        }
        const respErr = validateOfficeResponsableOnCreate({
          officeUser,
          responsableId: responsableSel,
          officeResponsables,
        });
        if (respErr) {
          setError(respErr);
          return;
        }
      }

      if (wide) {
        const { origen: origenRuta, destino: destinoRuta } = routeTextFromStops(stops);
        if (!origenRuta || !destinoRuta) {
          setError("Indica ciudad y país en las paradas de carga y descarga");
          return;
        }
        if (stops.some((s) => !s.nombre.trim())) {
          setError("Todas las paradas necesitan ciudad / localidad");
          return;
        }

        const operationalPlaces = operationalPlacesFromStops(stops, cliente);
        const placesMetaPatch = buildOperationalPlacesMetaPatch(operationalPlaces);
        const prevMeta = getServicioOperacionMeta(servicio);
        const prevPlaces = prevMeta.lugares_operativos && typeof prevMeta.lugares_operativos === "object"
          ? prevMeta.lugares_operativos
          : {};
        const placesChanged =
          operationalPlaces.cliente_nombre !== String(prevPlaces.cliente_nombre || "").trim() ||
          operationalPlaces.carga_nombre !== String(prevPlaces.carga_nombre || "").trim() ||
          operationalPlaces.carga_empresa !== String(prevPlaces.carga_empresa || "").trim() ||
          operationalPlaces.carga_direccion !== String(prevPlaces.carga_direccion || "").trim() ||
          operationalPlaces.descarga_nombre !== String(prevPlaces.descarga_nombre || "").trim() ||
          operationalPlaces.descarga_empresa !== String(prevPlaces.descarga_empresa || "").trim() ||
          operationalPlaces.descarga_direccion !== String(prevPlaces.descarga_direccion || "").trim();

        if (placesChanged) {
          patch.referencia = mergeReferenciaOperacional(servicio.referencia || "", placesMetaPatch);
        }

        const o0 = String(servicio.origen || "").trim();
        const o1 = String(origenRuta || "").trim();
        if (o1 !== o0) {
          patch.origen = o1;
          pushAudit("origen", o0, o1);
        }
        const d0 = String(servicio.destino || "").trim();
        const d1 = String(destinoRuta || "").trim();
        if (d1 !== d0) {
          patch.destino = d1;
          pushAudit("destino", d0, d1);
        }
        const fi0 = servicio.fecha_inicio ? String(servicio.fecha_inicio) : "";
        let fi1 = "";
        if (fechaInicioLocal) {
          const dt = new Date(fechaInicioLocal);
          if (!Number.isNaN(dt.getTime())) fi1 = dt.toISOString();
        }
        if (fi1 !== fi0) {
          patch.fecha_inicio = fi1 || null;
          pushAudit("fecha_inicio", fi0, fi1);
        }

        const stopsResult = await replaceStopsForServicio(servicio.id, prepareStopsGeoForPersist(stops));
        if (!stopsResult.ok) throw new Error(stopsResult.error || "No se pudieron guardar las paradas");
      }

      const sn0 = String(servicio.service_number ?? "").trim();
      const sn1 = String(serviceNumber || "").trim();
      if (sn1 !== sn0) {
        patch.service_number = sn1 || null;
        pushAudit("service_number", sn0, sn1);
      }

      const cl0 = String(servicio.cliente ?? "").trim();
      const cl1 = String(cliente || "").trim();
      if (cl1 !== cl0) {
        patch.cliente = cl1 || null;
        pushAudit("cliente", cl0, cl1);
      }

      const rc0 = String(servicio.referencia_cliente ?? "").trim();
      const rc1 = String(refCliente || "").trim();
      if (rc1 !== rc0) {
        patch.referencia_cliente = rc1 || null;
        pushAudit("referencia_cliente", rc0, rc1);
      }

      const prevMeta = getServicioOperacionMeta(servicio).admin_notas;
      const prevAdm = prevMeta == null ? "" : String(prevMeta).trim();
      const adm1 = String(adminNotas || "").trim();
      if (adm1 !== prevAdm) {
        patch.referencia = mergeReferenciaOperacional(
          (patch.referencia ?? servicio.referencia) || "",
          { admin_notas: adm1 || null },
        );
        pushAudit("admin_notas", prevAdm, adm1);
      }

      if (canEditResponsable) {
        const r0 = servicio.responsable_user_id || null;
        const r1 = responsableSel || null;
        if (r1 !== r0) {
          Object.assign(patch, buildResponsableServicioPayload(r1, officeResponsables));
          pushAudit("responsable_user_id", r0, r1);
        }
      }

      if (Object.keys(patch).length) {
        const res = await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Error ${res.status}`);
        }
      }

      let merged = { ...servicio, ...patch };
      const prevCid = servicio.conductor_id;
      if (
        wide &&
        conductorSel &&
        conductorSel !== prevCid
      ) {
        const assignArgs = {
          servicioId: servicio.id,
          servicio: { ...servicio, ...merged },
          conductorId: conductorSel,
          conductorNombre:
            conductores.find((c) => c.user_id === conductorSel)?.nombre || "Conductor",
          origen: merged.origen,
          destino: merged.destino,
          fechaInicio: merged.fecha_inicio,
        };
        const assignResult = !prevCid
          ? await asignarConductorEnServicioCreado(assignArgs)
          : await assignConductorPrincipalToServicio(assignArgs);
        pushAudit("conductor_id", prevCid, conductorSel);
        merged = {
          ...merged,
          conductor_id: conductorSel,
          estado: "asignado",
          referencia: assignResult.referencia ?? merged.referencia,
        };
        onNotifyAssignment?.({
          conductorId: conductorSel,
          origen: merged.origen,
          destino: merged.destino,
          fechaInicio: merged.fecha_inicio,
          servicioId: servicio.id,
        });
      }

      if (auditRows.length) {
        await insertServicioCambiosRows(auditRows);
      }

      onApplied?.(merged);
    } catch (e) {
      setError(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }, [
    servicio,
    mode,
    wide,
    stops,
    fechaInicioLocal,
    serviceNumber,
    cliente,
    refCliente,
    adminNotas,
    conductorSel,
    responsableSel,
    canEditResponsable,
    saving,
    userId,
    onApplied,
    onNotifyAssignment,
    conductores,
  ]);

  if (!servicio || !mode) return null;

  const paradaInputStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${EMPRESA_UI.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: EMPRESA_UI.tx,
    background: EMPRESA_UI.surfaceSoft,
    marginBottom: 6,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          width: "min(520px, 100%)",
          maxHeight: "min(88vh, 720px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: EMPRESA_UI.surface,
          borderRadius: 14,
          border: `1px solid ${EMPRESA_UI.border}`,
          boxShadow: "0 24px 60px rgba(15,23,42,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${EMPRESA_UI.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: EMPRESA_UI.tx }}>Editar servicio</div>
          <div style={{ fontSize: 12, color: EMPRESA_UI.muted, marginTop: 4 }}>
            {getServiceNumber(servicio)} · {wide ? "Edición amplia" : "Edición limitada (en curso)"}
          </div>
        </div>

        <div style={{ padding: "12px 16px", overflowY: "auto", flex: 1 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px 12px",
              marginBottom: 12,
            }}
          >
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Cliente (comercial)
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                style={inputStyle}
                placeholder="Ej. Mercadona"
              />
            </label>
            <OfficeResponsableServicioField
              officeUser={officeUser}
              officeResponsables={officeResponsables}
              value={responsableSel}
              onChange={setResponsableSel}
              lblStyle={{ fontSize: 11, fontWeight: 700, color: EMPRESA_UI.muted, marginBottom: 4, display: "block" }}
              fieldStyle={inputStyle}
              surfaceSoft={EMPRESA_UI.surfaceSoft}
              border={EMPRESA_UI.border}
            />
          </div>

          {wide ? (
            <>
              <label style={labelStyle}>
                Salida prevista
                <input
                  type="datetime-local"
                  value={fechaInicioLocal}
                  onChange={(e) => setFechaInicioLocal(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <div style={{ fontSize: 11, fontWeight: 700, color: EMPRESA_UI.muted, margin: "4px 0 8px", letterSpacing: 0.4 }}>
                PARADAS · {stops.length}
              </div>
              {stopsLoading ? (
                <div style={{ fontSize: 12, color: EMPRESA_UI.muted, marginBottom: 12 }}>Cargando paradas…</div>
              ) : (
                <>
                  {(rutaDesdeParadas.origen || rutaDesdeParadas.destino) ? (
                    <div style={{ fontSize: 11, color: EMPRESA_UI.accent, marginBottom: 10, fontWeight: 600 }}>
                      Ruta: {rutaDesdeParadas.origen || "—"} → {rutaDesdeParadas.destino || "—"}
                    </div>
                  ) : null}
                  {stops.map((stop, i) => (
                    <div
                      key={`${stop.orden}-${i}`}
                      style={{
                        background: EMPRESA_UI.surfaceSoft,
                        borderRadius: 10,
                        padding: "8px 10px",
                        marginBottom: 8,
                        border: `1px solid ${EMPRESA_UI.border}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: EMPRESA_UI.muted }}>{i + 1}</span>
                          <select
                            value={stop.tipo}
                            onChange={(e) => changeStop(i, "tipo", e.target.value)}
                            style={{ ...paradaInputStyle, marginBottom: 0, width: "auto", flex: 1 }}
                          >
                            {STOP_TIPOS_FORM.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.icon} {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" onClick={() => moveStop(i, -1)} disabled={i === 0} style={stopBtnStyle}>
                            ↑
                          </button>
                          <button type="button" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} style={stopBtnStyle}>
                            ↓
                          </button>
                          {stops.length > 1 ? (
                            <button type="button" onClick={() => removeStop(i)} style={{ ...stopBtnStyle, color: EMPRESA_UI.red }}>
                              ✕
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <StopGeoFieldsForm
                        stop={stop}
                        index={i}
                        onChange={changeStop}
                        themeKey="empresa"
                        compact
                        showGeoStatus={false}
                        empresaId={servicio?.empresa_id}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addStop}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: `1.5px dashed ${EMPRESA_UI.border}`,
                      borderRadius: 9,
                      padding: "8px",
                      fontSize: 13,
                      color: EMPRESA_UI.accent,
                      cursor: "pointer",
                      marginBottom: 12,
                    }}
                  >
                    + Añadir parada
                  </button>
                </>
              )}
            </>
          ) : null}

          <label style={labelStyle}>
            Nº referencia / servicio
            <input
              value={serviceNumber}
              onChange={(e) => setServiceNumber(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Referencia cliente
            <input value={refCliente} onChange={(e) => setRefCliente(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Notas administrativas
            <textarea
              value={adminNotas}
              onChange={(e) => setAdminNotas(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
            />
          </label>

          {wide ? (
            <label style={labelStyle}>
              Conductor
              <select
                value={conductorSel}
                onChange={(e) => setConductorSel(e.target.value)}
                style={inputStyle}
              >
                {!servicio.conductor_id || servicio.estado === "pendiente_asignacion" ? (
                  <option value="">Sin conductor</option>
                ) : null}
                {listaConductores.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.nombre || "Conductor"}
                    {c.matricula ? ` · ${c.matricula}` : ""}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: EMPRESA_UI.muted, marginTop: 4 }}>
                Si eliges un conductor, el servicio pasará a «Asignado».
              </div>
            </label>
          ) : null}

          {error ? (
            <div
              style={{
                marginTop: 10,
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
              background: EMPRESA_UI.surfaceSoft,
              border: `1px solid ${EMPRESA_UI.border}`,
              borderRadius: 10,
              padding: "11px",
              fontSize: 13,
              color: EMPRESA_UI.muted,
              cursor: saving ? "default" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving || (wide && stopsLoading)}
            style={{
              flex: 1,
              background: EMPRESA_UI.accentSoft,
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              padding: "11px",
              fontSize: 13,
              fontWeight: 800,
              color: EMPRESA_UI.accent,
              cursor: saving || (wide && stopsLoading) ? "default" : "pointer",
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const stopBtnStyle = {
  background: "#e2e8f0",
  border: "none",
  borderRadius: 4,
  width: 22,
  height: 22,
  fontSize: 11,
  cursor: "pointer",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  color: EMPRESA_UI.muted,
  marginBottom: 12,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${EMPRESA_UI.border}`,
  borderRadius: 9,
  padding: "10px 11px",
  fontSize: 14,
  color: EMPRESA_UI.tx,
  background: "#fff",
};
