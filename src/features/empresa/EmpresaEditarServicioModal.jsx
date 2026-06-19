import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import {
  getServiceClient,
  getServiceClientReference,
  getServiceNumber,
} from "../../domain/service/serviceIdentity.js";
import {
  mergeReferenciaOperacional,
  getServicioOperacionMeta,
  stripServicioOperacionDisplay,
} from "../../domain/service/serviceOperacionMeta.js";
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
import { normalizeDescargaCargadorLinks } from "../../domain/dcdt/descargaCargadorLink.js";
import { StopGeoFieldsForm } from "../services/components/StopGeoFieldsForm.jsx";
import { canPickOfficeServicioResponsable } from "../../domain/empresa/officeUserFilters.js";
import {
  buildResponsableServicioPayload,
  validateOfficeResponsableOnCreate,
} from "../../domain/empresa/empresaOfficeUsers.js";
import { OfficeResponsableServicioField } from "./OfficeResponsableServicioField.jsx";
import { DcdtReadinessPanel } from "../dcdt/DcdtReadinessPanel.jsx";
import { getServicioMercanciaFromMeta } from "../../domain/dcdt/servicioMercanciaMeta.js";
import {
  getStopMercanciaFromStop,
  mercanciaPreviewFromStops,
} from "../../domain/dcdt/stopMercanciaMeta.js";
import { stopContractualTitle } from "../../domain/dcdt/dcdtFormReadiness.js";
import { syncDcdtServiciosAfterStopsPersisted } from "../../domain/dcdt/dcdtServicioSync.js";
import { fetchPartesTransporte } from "../../domain/dcdt/partesTransporteModel.js";
import {
  getStopTone,
  primaryButtonStyle,
  resolveConductorVehiculo,
  secondaryButtonStyle,
  SERVICIO_MODAL_SHELL,
} from "../services/servicioFormTheme.js";
import { ServicioStopToolbar } from "../services/components/ServicioStopToolbar.jsx";
import { MatriculaVehiculoBadge } from "../services/components/MatriculaVehiculoBadge.jsx";

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

function stopsFromRowsWithMercanciaMigration(rows, servicio) {
  const forms = (Array.isArray(rows) ? rows : []).map(stopRowToForm);
  const svcMerc = getServicioMercanciaFromMeta(servicio);
  const hasSvc =
    svcMerc.descripcion ||
    svcMerc.peso_kg ||
    svcMerc.bultos ||
    svcMerc.palets;
  if (!hasSvc) return forms;
  const idx = forms.findIndex((s) => String(s.tipo || "").toLowerCase() === "carga");
  if (idx < 0) return forms;
  const cur = getStopMercanciaFromStop(forms[idx]);
  const hasStop =
    cur.descripcion ||
    cur.peso_kg ||
    cur.bultos ||
    cur.palets;
  if (hasStop) return forms;
  const next = [...forms];
  next[idx] = { ...next[idx], mercancia: svcMerc };
  return next;
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
  onDcdtSyncWarning = null,
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
  const [partesCatalog, setPartesCatalog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formInitRef = useRef(null);
  const stopsLoadedRef = useRef(null);

  const rutaDesdeParadas = useMemo(() => routeTextFromStops(stops), [stops]);
  const mercanciaPreview = useMemo(() => mercanciaPreviewFromStops(stops), [stops]);

  useEffect(() => {
    if (!servicio?.id) return;
    if (formInitRef.current === servicio.id) return;
    formInitRef.current = servicio.id;
    stopsLoadedRef.current = null;
    setFechaInicioLocal(servicio.fecha_inicio ? toDTL(servicio.fecha_inicio) : "");
    setServiceNumber(
      stripServicioOperacionDisplay(servicio.referencia || "") ||
        String(servicio.service_number ?? "").trim(),
    );
    setCliente(String(getServiceClient(servicio) || "").trim());
    setRefCliente(String(getServiceClientReference(servicio) || "").trim());
    setAdminNotas(String(getServicioOperacionMeta(servicio).admin_notas ?? "").trim());
    setConductorSel(servicio.conductor_id ? servicio.conductor_id : "");
    const resp = servicio.responsable_user_id ? servicio.responsable_user_id : "";
    setResponsableSel(responsableLockedUid || resp);
    setError("");
  }, [servicio?.id, responsableLockedUid]);

  useEffect(() => {
    if (!servicio?.empresa_id) return;
    let cancelled = false;
    fetchPartesTransporte(servicio.empresa_id)
      .then((rows) => {
        if (!cancelled) setPartesCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setPartesCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [servicio?.empresa_id]);

  useEffect(() => {
    if (!servicio?.id || !wide) return;
    if (stopsLoadedRef.current === servicio.id) return;
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
        stopsLoadedRef.current = servicio.id;
        if (Array.isArray(rows) && rows.length) {
          setStops(stopsFromRowsWithMercanciaMigration(rows, servicio));
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
  }, [servicio?.id, wide, servicio]);

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
  const patchStop = useCallback((i, patch) => {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }, []);

  const changeStop = useCallback((i, field, val) => {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  }, []);

  const handlePartesCatalog = useCallback((next) => {
    setPartesCatalog((prev) => {
      const a = prev || [];
      const b = next || [];
      if (a.length === b.length && a.every((p, i) => p?.id === b[i]?.id)) return prev;
      return b;
    });
  }, []);

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

        const stopsPayload = prepareStopsGeoForPersist(normalizeDescargaCargadorLinks(stops));
        if (isDemoApp()) {
          const carga = stops.find((s) => String(s.tipo).toLowerCase() === "carga");
          const descarga = [...stops].reverse().find((s) => String(s.tipo).toLowerCase() === "descarga");
          console.log("[DEMO editar-servicio] guardar", {
            servicio_id: servicio.id,
            stops_payload: stopsPayload,
            cargador_parte_id: carga?.parte_transporte_id ?? null,
            destinatario_parte_id: descarga?.parte_transporte_id ?? null,
            mercancia_payload: mercanciaPreviewFromStops(stops),
            servicio_patch_keys: Object.keys(patch),
          });
        }

        const stopsResult = await replaceStopsForServicio(servicio.id, stopsPayload);
        if (isDemoApp()) {
          console.log("[DEMO editar-servicio] stops resultado", {
            servicio_id: servicio.id,
            ok: stopsResult.ok,
            error: stopsResult.error || null,
          });
        }
        if (!stopsResult.ok) throw new Error(stopsResult.error || "No se pudieron guardar las paradas");
        try {
          await syncDcdtServiciosAfterStopsPersisted({
            servicioId: servicio.id,
            empresaId: servicio.empresa_id,
            servicio,
            stops: stopsResult.rows?.length ? stopsResult.rows : stopsPayload,
          });
        } catch (syncErr) {
          const message = syncErr?.message || String(syncErr);
          console.error("[DCDT sync] editar-servicio", message);
          onDcdtSyncWarning?.(
            "El servicio se guardó, pero no se sincronizaron todos los DeCA. " +
              "Ábrelo desde el modal DeCA para reparar." +
              (message ? ` (${message})` : ""),
          );
        }
      }

      const sn0 =
        stripServicioOperacionDisplay(servicio.referencia || "") ||
        String(servicio.service_number ?? "").trim();
      const sn1 = String(serviceNumber || "").trim();
      const cl0 = String(getServiceClient(servicio) || "").trim();
      const cl1 = String(cliente || "").trim();
      const rc0 = String(getServiceClientReference(servicio) || "").trim();
      const rc1 = String(refCliente || "").trim();

      const identityMetaPatch = {};
      if (cl1 !== cl0) {
        identityMetaPatch.cliente = cl1 || null;
        identityMetaPatch.cliente_nombre = cl1 || null;
      }
      if (rc1 !== rc0) {
        identityMetaPatch.referencia_cliente = rc1 || null;
      }

      const referenciaBeforeIdentity = patch.referencia ?? servicio.referencia ?? "";
      let referenciaAfterIdentity = referenciaBeforeIdentity;

      if (sn1 !== sn0) {
        referenciaAfterIdentity = mergeReferenciaOperacional(
          sn1,
          getServicioOperacionMeta(referenciaAfterIdentity),
        );
        pushAudit("service_number", sn0, sn1);
      }

      if (Object.keys(identityMetaPatch).length) {
        referenciaAfterIdentity = mergeReferenciaOperacional(
          referenciaAfterIdentity,
          identityMetaPatch,
        );
        if (cl1 !== cl0) pushAudit("cliente", cl0, cl1);
        if (rc1 !== rc0) pushAudit("referencia_cliente", rc0, rc1);
      }

      if (referenciaAfterIdentity !== referenciaBeforeIdentity) {
        patch.referencia = referenciaAfterIdentity;
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
          if (isDemoApp()) {
            console.log("[DEMO editar-servicio] servicio PATCH error", { servicio_id: servicio.id, status: res.status, body: t });
          }
          throw new Error(t || `Error ${res.status}`);
        }
        if (isDemoApp()) {
          const rows = await res.json().catch(() => []);
          console.log("[DEMO editar-servicio] servicio PATCH ok", { servicio_id: servicio.id, rows });
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

  const conductorVehiculo = resolveConductorVehiculo(conductores, conductorSel);

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
        padding: 10,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          width: SERVICIO_MODAL_SHELL.width,
          maxWidth: SERVICIO_MODAL_SHELL.maxWidth,
          maxHeight: SERVICIO_MODAL_SHELL.maxHeight,
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
          <style>{`
@media (max-width: 900px) { .servicio-stops-grid-edit { grid-template-columns: 1fr !important; } }
@media (min-width: 901px) { .servicio-stops-grid-edit { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
`}</style>
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
              <DcdtReadinessPanel
                stops={stops}
                mercancia={mercanciaPreview}
                partesCatalog={partesCatalog}
                fechaInicio={fechaInicioLocal}
                matricula={conductorVehiculo.matricula || null}
                remolque={conductorVehiculo.remolque || null}
                tipoVehiculo={conductorVehiculo.tipoVehiculo}
              />
              {stopsLoading ? (
                <div style={{ fontSize: 12, color: EMPRESA_UI.muted, marginBottom: 12 }}>Cargando paradas…</div>
              ) : (
                <>
                  {(rutaDesdeParadas.origen || rutaDesdeParadas.destino) ? (
                    <div style={{ fontSize: 11, color: EMPRESA_UI.accent, marginBottom: 10, fontWeight: 600 }}>
                      Ruta: {rutaDesdeParadas.origen || "—"} → {rutaDesdeParadas.destino || "—"}
                    </div>
                  ) : null}
                  <div className="servicio-stops-grid-edit" style={{ display: "grid", gap: 12, marginBottom: 8 }}>
                  {stops.map((stop, i) => {
                    const tone = getStopTone(stop);
                    return (
                    <div
                      key={`${stop.orden}-${i}`}
                      style={{
                        background: tone.bg,
                        borderRadius: 14,
                        padding: "12px 14px",
                        border: `1px solid ${tone.border}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: tone.header }}>
                            {stopContractualTitle(stop, i)}
                          </div>
                          <select
                            value={stop.tipo}
                            onChange={(e) => changeStop(i, "tipo", e.target.value)}
                            style={{ ...paradaInputStyle, marginTop: 6, marginBottom: 0, width: "auto", minWidth: 140, background: "#fff" }}
                          >
                            {STOP_TIPOS_FORM.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.icon} {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <ServicioStopToolbar
                          index={i}
                          total={stops.length}
                          onMoveUp={() => moveStop(i, -1)}
                          onMoveDown={() => moveStop(i, 1)}
                          onRemove={() => removeStop(i)}
                        />
                      </div>
                      <StopGeoFieldsForm
                        stop={stop}
                        index={i}
                        onChange={changeStop}
                        onPatchStop={patchStop}
                        themeKey="empresa"
                        layout="servicio-grid"
                        showGeoStatus={false}
                        empresaId={servicio?.empresa_id}
                        onPartesChange={handlePartesCatalog}
                        allStops={stops}
                        partesCatalog={partesCatalog}
                      />
                    </div>
                  );
                  })}
                  </div>
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
              <MatriculaVehiculoBadge
                matricula={conductorVehiculo.matricula}
                remolque={conductorVehiculo.remolque}
                tipoVehiculo={conductorVehiculo.tipoVehiculo}
              />
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
            style={secondaryButtonStyle(saving)}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving || (wide && stopsLoading)}
            style={primaryButtonStyle(saving || (wide && stopsLoading))}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
