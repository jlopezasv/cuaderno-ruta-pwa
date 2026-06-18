import { useEffect, useMemo, useState, useRef } from "react";
import { sbFetch } from "../../data/supabaseClient.js";
import {
  assignDcdtParte,
  buildMercanciaDatosPatch,
  computeDcdtEstado,
  extractLatestOcrFromEvidencias,
  isDcdtEstadoValidated,
  mergeOcrIntoDcdtDatos,
  mercanciaEditFromDatos,
  persistDcdtPartesFromStops,
  reconcileDcdtEstadoIfNeeded,
  refreshValidacionSnapshotIfStale,
  saveDcdtDatos,
  fetchAllDcdtByServicio,
  fetchDcdtById,
  validarDcdtTrafico,
  recordDecaPreStartGapIfNeeded,
} from "../../domain/dcdt/dcdtModel.js";
import { syncDcdtServiciosAfterStopsPersisted } from "../../domain/dcdt/dcdtServicioSync.js";
import { decaSelectorLabel, stopsLinkedToDcdt } from "../../domain/dcdt/dcdtMultiDeCaUi.js";
import {
  getStopMercanciaFromStop,
  mergeMercanciaIntoStopNotas,
  primaryCargaStopForCargador,
} from "../../domain/dcdt/stopMercanciaMeta.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "../../domain/dcdt/dcdtReadiness.js";
import { getServicioMercanciaFromMeta } from "../../domain/dcdt/servicioMercanciaMeta.js";
import { fetchPartesTransporte } from "../../domain/dcdt/partesTransporteModel.js";
import { generateAndPersistDcdtPdf, downloadDcdtStoredPdf, openDcdtStoredPdf } from "../../domain/dcdt/dcdtPdfDocument.js";
import { isDcdtPdfStale } from "../../domain/dcdt/decaPdfStale.js";
import {
  buildRutaModFormFromDoc,
  canModificarDecaEnRuta,
  confirmDecaRouteModification,
  getModificarEnRutaBlockedReason,
  isDecaRouteModificationDemoSurface,
} from "../../domain/dcdt/decaRouteModification.js";
import { formatDcdtDisplayValue, formatDcdtDisplayValueOrDash } from "../../domain/dcdt/dcdtDisplayText.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";
import { fetchConductorVehiculoForDcdt } from "../../domain/empresa/conductorVehiculoEmpresa.js";
import { DECA_FULL_TITLE, DECA_LEGAL_REF, DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { DcdtParteConfirmFlash, DcdtPartePicker } from "./DcdtPartePicker.jsx";
import { DcdtQrModal } from "./DcdtQrModal.jsx";

const UI = {
  overlay: "rgba(15,23,42,.45)",
  surface: "#ffffff",
  soft: "#f8fafc",
  border: "#dbe4ee",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
  green: "#15803d",
  amber: "#b45309",
  red: "#b91c1c",
};

function FieldRow({ label, value, missing }) {
  const text = formatDcdtDisplayValueOrDash(value);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${UI.border}`, fontSize: 13 }}>
      <div style={{ color: missing ? UI.red : UI.su, fontWeight: 700, fontSize: 11 }}>{label}</div>
      <div style={{ color: UI.tx }}>{text}</div>
    </div>
  );
}

function hydrateMercanciaEdit(dcdtMercancia, servicio, stops, dcdt, multiDeca) {
  const fromDcdt = mercanciaEditFromDatos(dcdtMercancia);
  const hasDcdt =
    fromDcdt.descripcion ||
    fromDcdt.peso_kg ||
    fromDcdt.bultos ||
    fromDcdt.palets;
  if (hasDcdt) return fromDcdt;
  const cargaStop = primaryCargaStopForCargador(stops, dcdt?.datos?.partes?.cargador_id);
  const fromStop = getStopMercanciaFromStop(cargaStop);
  const hasStop =
    fromStop.descripcion ||
    fromStop.peso_kg ||
    fromStop.bultos ||
    fromStop.palets;
  if (hasStop) return fromStop;
  if (multiDeca) return { descripcion: "", peso_kg: "", bultos: "", palets: "" };
  const fromSvc = getServicioMercanciaFromMeta(servicio);
  return {
    descripcion: fromSvc.descripcion || "",
    peso_kg: fromSvc.peso_kg ?? "",
    bultos: fromSvc.bultos ?? "",
    palets: fromSvc.palets ?? "",
  };
}

const MERC_LBL = { fontSize: 10, color: UI.su, fontWeight: 700, marginBottom: 4 };

function parteLine(parte) {
  const nombre = formatDcdtDisplayValueOrDash(parte?.nombre);
  if (nombre === "—") return "—";
  const bits = [
    nombre,
    formatDcdtDisplayValueOrDash(parte?.nif),
    formatDcdtDisplayValueOrDash(parte?.domicilio || parte?.direccion),
  ].filter((x) => x && x !== "—");
  return bits.length ? bits.join(" · ") : "—";
}

export function EmpresaDcdtModal({
  servicio,
  empresa,
  conductor = null,
  flotaEvs = {},
  stops: stopsProp = null,
  userId,
  onClose,
  showToast,
}) {
  const [stops, setStops] = useState(stopsProp || []);
  const [dcdt, setDcdt] = useState(null);
  const [allDcdts, setAllDcdts] = useState([]);
  const [selectedDcdtId, setSelectedDcdtId] = useState(null);
  const [partes, setPartes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [mercanciaEdit, setMercanciaEdit] = useState({ descripcion: "", peso_kg: "", bultos: "", palets: "" });
  const [pickingRole, setPickingRole] = useState(null);
  const [confirmRole, setConfirmRole] = useState(null);
  const [empresaOwnerProfile, setEmpresaOwnerProfile] = useState(null);
  const [conductorEmpresa, setConductorEmpresa] = useState(conductor);
  const [qrOpen, setQrOpen] = useState(false);
  const [rutaModOpen, setRutaModOpen] = useState(false);
  const [rutaModForm, setRutaModForm] = useState({
    matricula: "",
    remolque: "",
    descripcion: "",
    peso_kg: "",
    bultos: "",
    palets: "",
  });
  const [rutaModMotivo, setRutaModMotivo] = useState("");
  const [actionFeedback, setActionFeedback] = useState(null);
  const mercanciaDirtyRef = useRef(false);
  const syncedPartesRef = useRef(false);
  const allDcdtsRef = useRef([]);
  allDcdtsRef.current = allDcdts;
  const flotaEvsRef = useRef(flotaEvs);
  flotaEvsRef.current = flotaEvs;
  const servicioRef = useRef(servicio);
  servicioRef.current = servicio;
  const conductorRef = useRef(conductor);
  conductorRef.current = conductorEmpresa || conductor;
  const empresaRef = useRef(empresa);
  empresaRef.current = empresa;
  const stopsPropRef = useRef(stopsProp);
  stopsPropRef.current = stopsProp;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const empresaId = servicio?.empresa_id || empresa?.id;

  function setMercanciaField(field, value) {
    mercanciaDirtyRef.current = true;
    setMercanciaEdit((p) => ({ ...p, [field]: value }));
  }

  useEffect(() => {
    if (!confirmRole) return;
    const t = setTimeout(() => setConfirmRole(null), 2500);
    return () => clearTimeout(t);
  }, [confirmRole]);

  useEffect(() => {
    setConductorEmpresa(conductor);
  }, [conductor]);

  useEffect(() => {
    const uid = servicio?.conductor_id || conductor?.user_id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchConductorVehiculoForDcdt(uid, empresaId);
        if (!cancelled && row) setConductorEmpresa(row);
      } catch {
        /* perfil opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [servicio?.conductor_id, conductor?.user_id, empresaId]);

  async function seleccionarParte(role, parteId, parteNueva = null) {
    if (!dcdt || !parteId) return;
    setBusy(`parte-${role}`);
    try {
      const masterMap = { ...masterById };
      if (parteNueva?.id) masterMap[parteNueva.id] = parteNueva;
      const linked = stopsLinkedToDcdt(stops, dcdt);
      const scope = linked.length ? linked : stops;
      const next = await assignDcdtParte({
        dcdt,
        role,
        parteId,
        servicio,
        stops: scope,
        flotaEvs,
        empresa,
        conductor: conductorEmpresa || conductor,
        masterById: masterMap,
      });
      setDcdt(next);
      setAllDcdts((prev) => prev.map((r) => (r.id === next.id ? next : r)));
      if (parteNueva) setPartes((prev) => (prev.some((p) => p.id === parteNueva.id) ? prev : [...prev, parteNueva]));
      setPickingRole(null);
      setConfirmRole(role);
      showToast?.(role === "cargador" ? "Cargador asignado" : "Destinatario asignado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo guardar");
    } finally {
      setBusy("");
    }
  }

  function renderParteBlock(role, label, lineValue, missingField, { optional = false } = {}) {
    const isMissing = optional ? false : missingField || lineValue === "—";
    const showPicker = pickingRole === role;
    return (
      <div key={role}>
        {confirmRole === role ? <DcdtParteConfirmFlash label={label} /> : null}
        <FieldRow label={label} value={lineValue} missing={isMissing} />
        {showPicker ? (
          <DcdtPartePicker
            label={label}
            role={role}
            empresaId={empresaId}
            partes={partes}
            selectedParteId={dcdt?.datos?.partes?.[role === "cargador" ? "cargador_id" : "destinatario_id"]}
            busy={!!busy}
            onSelect={(id, nueva) => seleccionarParte(role, id, nueva)}
            onCancel={() => setPickingRole(null)}
          />
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => setPickingRole(role)}
            style={{
              margin: "0 0 8px",
              background: isMissing ? "#fff7ed" : UI.soft,
              color: isMissing ? UI.amber : UI.accent,
              border: `1px solid ${isMissing ? "#fed7aa" : UI.border}`,
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {optional && lineValue === "—"
              ? "Añadir (opcional)"
              : isMissing
                ? "Completar dato"
                : "Cambiar"}
          </button>
        )}
      </div>
    );
  }

  useEffect(() => {
    if (!servicio?.id || !empresaId) return;
    let cancelled = false;
    mercanciaDirtyRef.current = false;
    syncedPartesRef.current = false;
    setLoading(true);
    setSelectedDcdtId(null);
    setAllDcdts([]);
    setDcdt(null);

    (async () => {
      try {
        let stopRows = stopsPropRef.current;
        if (!stopRows?.length) {
          const sr = await sbFetch(
            `/rest/v1/stops?servicio_id=eq.${servicio.id}&select=id,orden,tipo,nombre,direccion,notas&order=orden.asc`,
          );
          stopRows = sr.ok ? await sr.json() : [];
        }
        if (cancelled) return;
        const normalizedStops = Array.isArray(stopRows) ? stopRows : [];
        setStops(normalizedStops);

        const [master] = await Promise.all([fetchPartesTransporte(empresaId)]);
        if (cancelled) return;

        let ownerProfile = null;
        const ownerId = empresaRef.current?.owner_id;
        if (ownerId) {
          const pr = await sbFetch(
            `/rest/v1/profiles?id=eq.${ownerId}&select=id,nombre,cif,direccion,cp,ciudad&limit=1`,
          );
          if (pr.ok) {
            const profileRows = await pr.json().catch(() => []);
            ownerProfile = Array.isArray(profileRows) ? profileRows[0] : null;
          }
        }
        if (cancelled) return;
        setEmpresaOwnerProfile(ownerProfile);

        await syncDcdtServiciosAfterStopsPersisted({
          servicioId: servicio.id,
          empresaId,
          servicio: servicioRef.current,
          stops: normalizedStops,
        });
        console.error("[DCDT sync] EmpresaDcdtModal open sync done", { servicioId: servicio.id });
        if (cancelled) return;

        const rows = await fetchAllDcdtByServicio(servicio.id);
        if (cancelled) return;
        setAllDcdts(rows);
        setPartes(master);
        if (!rows.length) {
          throw new Error(`No se pudo cargar ningún ${DECA_SHORT_LABEL} para este servicio`);
        }
        setSelectedDcdtId(rows[0].id);
      } catch (e) {
        if (!cancelled) showToastRef.current?.(e?.message || `No se pudo cargar ${DECA_SHORT_LABEL}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [servicio?.id, empresaId]);

  useEffect(() => {
    if (!selectedDcdtId || !servicio?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const row = await fetchDcdtById(selectedDcdtId);
        if (!row || cancelled) return;

        const masterMap = {};
        for (const p of partes) masterMap[p.id] = p;

        const linkedStops = stopsLinkedToDcdt(stops, row);
        const scopeStops = linkedStops.length ? linkedStops : stops;
        const multiDeca = allDcdtsRef.current.length > 1;

        let persisted = await persistDcdtPartesFromStops({
          dcdt: row,
          servicio: servicioRef.current,
          stops: scopeStops,
          cargadorId: row?.datos?.partes?.cargador_id,
          flotaEvs: flotaEvsRef.current,
          empresa: empresaRef.current,
          conductor: conductorRef.current,
          masterById: masterMap,
        });
        if (cancelled) return;

        const mercanciaForReadiness = hydrateMercanciaEdit(
          persisted?.datos?.mercancia,
          servicioRef.current,
          stops,
          persisted,
          multiDeca,
        );
        const readinessPreview = validateDcdtReadiness({
          servicio: servicioRef.current,
          dcdt: persisted,
          stops: scopeStops,
          masterById: masterMap,
          empresa: empresaRef.current,
          empresaOwnerProfile,
          conductor: conductorRef.current,
          mercanciaEdit: mercanciaForReadiness,
          flotaEvs: flotaEvsRef.current,
        });
        persisted = await refreshValidacionSnapshotIfStale({
          dcdt: persisted,
          doc: readinessPreview.doc,
        });
        if (cancelled) return;
        persisted = await reconcileDcdtEstadoIfNeeded({
          dcdt: persisted,
          missing: readinessPreview.missing,
          flotaEvs: flotaEvsRef.current,
          datos: persisted?.datos,
        });
        if (cancelled) return;

        setDcdt(persisted);
        setAllDcdts((prev) => prev.map((r) => (r.id === persisted.id ? persisted : r)));
        if (!mercanciaDirtyRef.current) {
          setMercanciaEdit(mercanciaForReadiness);
        }
      } catch (e) {
        if (!cancelled) showToastRef.current?.(e?.message || `No se pudo cargar ${DECA_SHORT_LABEL}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDcdtId, stops, partes, empresaOwnerProfile, servicio?.id]);

  const masterById = useMemo(() => {
    const m = {};
    for (const p of partes) m[p.id] = p;
    return m;
  }, [partes]);

  const scopeStops = useMemo(() => {
    if (!dcdt) return stops;
    const linked = stopsLinkedToDcdt(stops, dcdt);
    return linked.length ? linked : stops;
  }, [dcdt, stops]);

  const readiness = useMemo(() => {
    if (!dcdt) {
      return validateDcdtReadiness({ servicio, dcdt: null });
    }
    return validateDcdtReadiness({
      servicio,
      dcdt,
      stops: scopeStops,
      masterById,
      empresa,
      empresaOwnerProfile,
      conductor: conductorEmpresa || conductor,
      mercanciaEdit,
      flotaEvs,
    });
  }, [dcdt, servicio, scopeStops, masterById, empresa, empresaOwnerProfile, conductorEmpresa, conductor, mercanciaEdit, flotaEvs]);

  const { doc, missing, datos } = readiness;
  const missingKeys = useMemo(() => new Set(missing.map((f) => f.key)), [missing]);
  const estadoAuto = useMemo(
    () =>
      computeDcdtEstado({
        missing,
        evidenciasByStop: flotaEvs,
        datos: dcdt?.datos,
        currentEstado: dcdt?.estado,
      }),
    [missing, flotaEvs, dcdt?.datos, dcdt?.estado],
  );

  const statusLabel = readiness.statusLabel;
  const puedeValidar = readiness.canValidate;
  const puedePdf = readiness.canGeneratePdf;
  const puedeDescargarPdf = readiness.canDownloadPdf;
  const warnDecaPreStart = readiness.warnDecaMissingPdfBeforeStart;
  const pdfStale = readiness.pdfStale;
  const demoRutaSurface = isDecaRouteModificationDemoSurface();
  const puedeModificarEnRuta = demoRutaSurface && canModificarDecaEnRuta({ servicio, dcdt });
  const puedeEditarMercanciaSimple =
    !readiness.hasPdfStorage && !isDcdtEstadoValidated(dcdt?.estado);
  const rutaModBlockedReason =
    !puedeModificarEnRuta && dcdt?.id
      ? getModificarEnRutaBlockedReason({ servicio, dcdt, demoSurface: demoRutaSurface })
      : null;
  const modificacionesRuta = Array.isArray(dcdt?.datos?.modificaciones_ruta) ? dcdt.datos.modificaciones_ruta : [];

  useEffect(() => {
    if (!dcdt?.id || !servicio?.id || !warnDecaPreStart) return;
    let cancelled = false;
    recordDecaPreStartGapIfNeeded(dcdt, servicio)
      .then((next) => {
        if (!cancelled && next?.id) setDcdt(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dcdt, servicio, warnDecaPreStart]);

  const pdfBtnHint = !puedePdf
    ? missing.length
      ? `Faltan datos obligatorios: ${missing.map((m) => m.label).join(" · ")}`
      : "Completa los campos del art. 6 antes de generar el DeCA"
    : !readiness.hasPdfStorage && !readiness.isValidated
      ? "Generar DeCA ahora (validación de tráfico puede ser posterior)"
      : dcdt?.pdfGeneradoAt
        ? "Regenerar PDF DeCA (nueva versión con QR)"
        : "Generar PDF DeCA con QR embebido";
  const pdfBtnLabel =
    busy === "pdf"
      ? "Generando PDF…"
      : puedePdf && !readiness.hasPdfStorage && !readiness.isValidated
        ? "Generar DeCA ahora"
        : `Generar PDF ${DECA_SHORT_LABEL}`;
  const downloadBtnHint = !puedeDescargarPdf
    ? puedePdf
      ? "Genera el PDF antes de descargarlo"
      : pdfBtnHint
    : "Descargar el PDF guardado en storage";
  const accionMensaje =
    actionFeedback?.text ||
    (pdfStale
      ? "Los datos han cambiado desde la última generación del PDF — regenera antes de que el conductor lo use"
      : warnDecaPreStart
      ? "DeCA no generado antes del inicio del servicio — generar ahora"
      : busy === "pdf"
      ? "Generando PDF DeCA… (puede tardar unos segundos)"
      : busy === "validar"
        ? `Validando ${DECA_SHORT_LABEL}…`
        : puedeDescargarPdf
          ? "PDF listo — puedes descargarlo o mostrar el QR DeCA"
          : puedePdf
            ? pdfBtnHint
            : puedeValidar
              ? `Paso 1: valida el ${DECA_SHORT_LABEL} cuando no queden pendientes`
              : pdfBtnHint || statusLabel);
  const accionColor =
    actionFeedback?.kind === "error" || pdfStale || warnDecaPreStart
      ? UI.red
      : actionFeedback?.kind === "ok"
        ? UI.green
        : actionFeedback?.kind === "progress" || busy
          ? UI.accent
          : puedePdf && !puedeDescargarPdf
            ? "#166534"
            : UI.su;
  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";
  const decaDownloadUrl = dcdt?.datos?.deca_download_url || null;

  function notifyAction(text, kind = "info") {
    setActionFeedback({ text, kind });
    showToast?.(text);
  }

  async function guardarMercancia() {
    if (!dcdt) return;
    setBusy("save");
    try {
      const nextDatos = {
        ...dcdt.datos,
        mercancia: buildMercanciaDatosPatch(mercanciaEdit),
      };
      const estado = computeDcdtEstado({
        missing: validateDcdtReadiness({
          servicio,
          dcdt: { ...dcdt, datos: nextDatos },
          stops: scopeStops,
          masterById,
          empresa,
          empresaOwnerProfile,
          conductor: conductorEmpresa || conductor,
          mercanciaEdit,
          flotaEvs,
        }).missing,
        evidenciasByStop: flotaEvs,
        datos: nextDatos,
        currentEstado: dcdt.estado,
      });
      const next = await saveDcdtDatos(dcdt.id, nextDatos, estado);
      const cargaStop = primaryCargaStopForCargador(stops, dcdt?.datos?.partes?.cargador_id);
      if (cargaStop?.id) {
        const notas = mergeMercanciaIntoStopNotas(cargaStop.notas, mercanciaEdit);
        await sbFetch(`/rest/v1/stops?id=eq.${cargaStop.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ notas }),
        });
        setStops((prev) =>
          prev.map((s) => (s.id === cargaStop.id ? { ...s, notas } : s)),
        );
      }
      setDcdt(next);
      setAllDcdts((prev) => prev.map((r) => (r.id === next.id ? next : r)));
      setMercanciaEdit(mercanciaEditFromDatos(next?.datos?.mercancia));
      mercanciaDirtyRef.current = false;
      showToast?.("Mercancía guardada");
    } catch (e) {
      showToast?.(e?.message || "Error al guardar");
    } finally {
      setBusy("");
    }
  }

  async function completarDesdeOcr() {
    if (!dcdt) return;
    const ocr = extractLatestOcrFromEvidencias(flotaEvs);
    if (!ocr) {
      showToast?.("No hay OCR de CMR/albarán en este servicio");
      return;
    }
    setBusy("ocr");
    try {
      const nextDatos = mergeOcrIntoDcdtDatos(dcdt.datos, ocr);
      const { missing: m2 } = validateDcdtReadiness({
        servicio,
        dcdt: { ...dcdt, datos: nextDatos },
        stops,
        masterById,
        empresa,
        empresaOwnerProfile,
        conductor: conductorEmpresa || conductor,
        flotaEvs,
      });
      const estado = computeDcdtEstado({
        missing: m2,
        evidenciasByStop: flotaEvs,
        datos: nextDatos,
        currentEstado: dcdt.estado,
      });
      const next = await saveDcdtDatos(dcdt.id, nextDatos, estado);
      setDcdt(next);
      const m = next.datos?.mercancia || {};
      mercanciaDirtyRef.current = false;
      setMercanciaEdit(mercanciaEditFromDatos(m));
      showToast?.("Datos completados desde OCR");
    } catch (e) {
      showToast?.(e?.message || "Error OCR");
    } finally {
      setBusy("");
    }
  }

  async function validarDcdt() {
    if (!dcdt || missing.length) {
      showToast?.("Completa los campos pendientes antes de validar");
      return;
    }
    setBusy("validar");
    try {
      const next = await validarDcdtTrafico(dcdt.id, userId, {
        doc,
        servicio,
        conductor: conductorEmpresa || conductor,
        missing,
        dcdt,
      });
      const fresh = dcdt?.id ? await fetchDcdtById(dcdt.id) : null;
      const resolved = fresh || next;
      setDcdt(resolved);
      setAllDcdts((prev) => prev.map((r) => (r.id === resolved.id ? resolved : r)));
      const regenMsg = isDcdtPdfStale(dcdt) && !isDcdtPdfStale(resolved)
        ? " — PDF DeCA actualizado con los datos corregidos"
        : "";
      notifyAction(`${DECA_SHORT_LABEL} validado${regenMsg}`, "ok");
    } catch (e) {
      notifyAction(e?.message || "No se pudo validar", "error");
    } finally {
      setBusy("");
    }
  }

  async function generarPdf() {
    if (!dcdt || !doc) {
      notifyAction(`${DECA_SHORT_LABEL} no cargado — cierra y vuelve a abrir el modal`, "error");
      return;
    }
    if (!puedePdf) {
      notifyAction(pdfBtnHint || `Valida el ${DECA_SHORT_LABEL} antes de generar el PDF`, "error");
      return;
    }
    setBusy("pdf");
    setActionFeedback({ text: "Generando PDF DeCA…", kind: "progress" });
    notifyAction("Generando PDF DeCA…", "progress");
    try {
      const { dcdt: next, pdfSizeBytes, generatedAt } = await generateAndPersistDcdtPdf({
        servicio,
        dcdt,
        doc,
        userId,
        downloadAfter: true,
      });
      setDcdt(next);
      const kb = pdfSizeBytes ? `${Math.round(pdfSizeBytes / 1024)} KB` : "";
      const when = generatedAt ? new Date(generatedAt).toLocaleTimeString("es-ES") : "";
      notifyAction(`PDF DeCA generado${kb ? ` · ${kb}` : ""}${when ? ` · ${when}` : ""} — revisa tu carpeta de descargas`, "ok");
      try {
        await openDcdtStoredPdf(next);
      } catch {
        /* descarga directa del blob ya intentada */
      }
    } catch (e) {
      const msg = e?.message || "Error al generar PDF";
      notifyAction(msg, "error");
      if (isDemoApp()) console.error("[DCDT PDF empresa]", e);
    } finally {
      setBusy("");
    }
  }

  async function descargarPdfGuardado() {
    if (!dcdt || !puedeDescargarPdf) {
      showToast?.(`Genera el PDF ${DECA_SHORT_LABEL} antes de descargarlo`);
      return;
    }
    try {
      const name = dcdt.datos?.pdf_archivo_nombre || `dcdt-${serviceLabel}.pdf`;
      await downloadDcdtStoredPdf(dcdt, name);
      showToast?.(`PDF ${DECA_SHORT_LABEL} descargado`);
    } catch (e) {
      showToast?.(e?.message || "No se pudo descargar el PDF");
    }
  }

  function abrirModificacionEnRuta() {
    if (!doc) return;
    setRutaModForm(buildRutaModFormFromDoc(doc));
    setRutaModMotivo("");
    setRutaModOpen(true);
  }

  function setRutaModField(field, value) {
    setRutaModForm((p) => ({ ...p, [field]: value }));
  }

  async function confirmarModificacionEnRuta() {
    if (!dcdt || !doc) return;
    setBusy("ruta-mod");
    setActionFeedback({ text: "Aplicando modificación en ruta y regenerando PDF…", kind: "progress" });
    try {
      const { dcdt: next, entries } = await confirmDecaRouteModification({
        dcdt,
        servicio,
        docBefore: doc,
        form: rutaModForm,
        motivo: rutaModMotivo,
        userId,
        stops,
        masterById,
        empresa,
        empresaOwnerProfile,
        conductor: conductorEmpresa || conductor,
      });
      setDcdt(next);
      setRutaModOpen(false);
      setRutaModMotivo("");
      setMercanciaEdit(mercanciaEditFromDatos(next?.datos?.mercancia));
      mercanciaDirtyRef.current = false;
      notifyAction(
        `Modificación en ruta registrada (${entries.length} cambio${entries.length > 1 ? "s" : ""}) — PDF DeCA actualizado`,
        "ok",
      );
      try {
        await openDcdtStoredPdf(next);
      } catch {
        /* opcional */
      }
    } catch (e) {
      notifyAction(e?.message || "No se pudo aplicar la modificación en ruta", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: UI.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" onClick={(e) => e.stopPropagation()} style={{ background: UI.surface, borderRadius: 16, width: "min(98vw, 1040px)", maxHeight: "96vh", minHeight: "min(88vh, 820px)", overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${UI.border}` }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${UI.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: UI.tx }}>{DECA_SHORT_LABEL}</div>
          <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
            {DECA_FULL_TITLE} · {DECA_LEGAL_REF}
          </div>
          <div style={{ fontSize: 13, color: UI.su, marginTop: 4 }}>
            {serviceLabel} · {statusLabel}
            {allDcdts.length > 1 ? ` · ${allDcdts.length} documentos` : ""}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px 20px", minHeight: 0 }}>
          {loading ? (
            <div style={{ color: UI.su }}>Cargando…</div>
          ) : (
            <>
              {allDcdts.length > 1 ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 8 }}>
                    DOCUMENTO DeCA
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {allDcdts.map((row, idx) => {
                      const active = row.id === selectedDcdtId;
                      const label = decaSelectorLabel(row, idx, masterById);
                      return (
                        <button
                          key={row.id}
                          type="button"
                          disabled={!!busy}
                          onClick={() => {
                            mercanciaDirtyRef.current = false;
                            setSelectedDcdtId(row.id);
                          }}
                          style={{
                            background: active ? UI.accent : UI.soft,
                            color: active ? "#fff" : UI.tx,
                            border: `1px solid ${active ? UI.accent : UI.border}`,
                            borderRadius: 10,
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: busy ? "not-allowed" : "pointer",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {pdfStale ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "2px solid #fca5a5",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: UI.red, lineHeight: 1.4 }}>
                    Los datos han cambiado desde la última generación del PDF — regenera antes de que el
                    conductor lo use
                  </div>
                  <div style={{ fontSize: 11, color: "#991b1b", marginTop: 6, lineHeight: 1.45 }}>
                    La URL pública sigue sirviendo la versión anterior hasta que pulses «Generar DeCA ahora» o
                    valides en tráfico (regeneración automática al validar).
                  </div>
                  <button
                    type="button"
                    disabled={!!busy || !puedePdf}
                    onClick={generarPdf}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      background: "#166534",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: busy || !puedePdf ? "not-allowed" : "pointer",
                      opacity: busy || !puedePdf ? 0.55 : 1,
                    }}
                  >
                    {busy === "pdf" ? "Regenerando PDF…" : "Regenerar PDF DeCA ahora"}
                  </button>
                </div>
              ) : null}
              {warnDecaPreStart ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "2px solid #fca5a5",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: UI.red, lineHeight: 1.4 }}>
                    DeCA no generado antes del inicio del servicio — generar ahora
                  </div>
                  <div style={{ fontSize: 11, color: "#991b1b", marginTop: 6, lineHeight: 1.45 }}>
                    La fecha planificada de inicio ya pasó y aún no hay PDF DeCA generado.
                    Genera el documento cuanto antes; la validación de tráfico puede completarse después.
                  </div>
                </div>
              ) : null}
              {missing.length ? (
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: UI.amber }}>Pendientes ({missing.length})</div>
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>{missing.map((f) => f.label).join(" · ")}</div>
                </div>
              ) : (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12, fontWeight: 700, color: UI.green }}>
                  {isDcdtEstadoValidated(dcdt?.estado)
                    ? dcdt?.pdfGeneradoAt || dcdt?.datos?.pdf_storage_path
                      ? `${DECA_SHORT_LABEL} validado · PDF generado${dcdt?.datos?.pdf_size_bytes ? ` (${Math.round(dcdt.datos.pdf_size_bytes / 1024)} KB)` : ""}`
                      : `${DECA_SHORT_LABEL} validado`
                    : `${DECA_SHORT_LABEL} completo — listo para validar`}
                </div>
              )}
              {rutaModBlockedReason && puedeDescargarPdf ? (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fcd34d",
                    borderRadius: 10,
                    padding: "10px 12px",
                    marginBottom: 14,
                    fontSize: 11,
                    color: "#92400e",
                    lineHeight: 1.45,
                  }}
                >
                  <strong>Modificar en ruta no disponible:</strong> {rutaModBlockedReason}
                  {isDemoApp() ? (
                    <div style={{ marginTop: 4, fontSize: 10, color: UI.su }}>
                      Servicio estado={String(servicio?.estado || "—")} · PDF=
                      {dcdt?.datos?.pdf_storage_path || dcdt?.datos?.pdf_archivo_url ? "sí" : "no"}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 6 }}>DATOS ENCONTRADOS</div>
              {renderParteBlock(
                "cargador",
                "Cargador",
                parteLine(doc?.cargador),
                missingKeys.has("cargador.nombre") || missingKeys.has("cargador.nif") || missingKeys.has("cargador.domicilio"),
              )}
              <FieldRow
                label="Transportista"
                value={parteLine(doc?.transportista)}
                missing={
                  missingKeys.has("transportista.nombre") ||
                  missingKeys.has("transportista.nif") ||
                  missingKeys.has("transportista.domicilio")
                }
              />
              {renderParteBlock(
                "destinatario",
                "Destinatario (opcional)",
                parteLine(doc?.destinatario),
                false,
                { optional: true },
              )}
              <FieldRow label="Origen" value={doc?.origen} missing={missingKeys.has("origen")} />
              <FieldRow label="Destino" value={doc?.destino} missing={missingKeys.has("destino")} />
              <FieldRow label="Matrícula" value={doc?.vehiculo?.matricula} missing={missingKeys.has("vehiculo.matricula")} />
              {doc?.vehiculo?.remolque ? (
                <FieldRow label="Remolque" value={doc?.vehiculo?.remolque} missing={false} />
              ) : null}
              <FieldRow label="Fecha" value={doc?.fecha_transporte ? new Date(doc.fecha_transporte).toLocaleDateString("es-ES") : ""} missing={missingKeys.has("fecha_transporte")} />

              {modificacionesRuta.length ? (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 10,
                    padding: "10px 12px",
                    margin: "12px 0",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: UI.accent, marginBottom: 6 }}>
                    Modificaciones en ruta ({modificacionesRuta.length})
                  </div>
                  {modificacionesRuta.map((entry, idx) => (
                    <div key={`${entry.modificado_at || idx}-${entry.campo_key || entry.campo}`} style={{ fontSize: 11, color: UI.tx, marginBottom: 6, lineHeight: 1.4 }}>
                      <strong>{entry.campo}</strong>: {entry.valor_anterior} → {entry.valor_nuevo}
                      <div style={{ color: UI.su, fontSize: 10 }}>
                        {entry.motivo}
                        {entry.modificado_at ? ` · ${new Date(entry.modificado_at).toLocaleString("es-ES")}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {rutaModOpen ? (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "2px solid #fcd34d",
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: UI.amber, marginBottom: 8 }}>
                    Modificar en ruta (art. 6)
                  </div>
                  <div style={{ fontSize: 11, color: "#92400e", marginBottom: 10, lineHeight: 1.45 }}>
                    Cambio durante el servicio en curso. El motivo es obligatorio; el PDF se regenera al instante
                    con la misma URL pública y QR.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={MERC_LBL}>Matrícula tractora</div>
                      <input
                        value={rutaModForm.matricula}
                        onChange={(e) => setRutaModField("matricula", e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <div style={MERC_LBL}>Matrícula remolque</div>
                      <input
                        value={rutaModForm.remolque}
                        onChange={(e) => setRutaModField("remolque", e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                  <div style={MERC_LBL}>Naturaleza de la mercancía</div>
                  <input
                    value={rutaModForm.descripcion}
                    onChange={(e) => setRutaModField("descripcion", e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 8, boxSizing: "border-box" }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={MERC_LBL}>Peso (kg)</div>
                      <input
                        value={rutaModForm.peso_kg}
                        onChange={(e) => setRutaModField("peso_kg", e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <div style={MERC_LBL}>Bultos</div>
                      <input
                        value={rutaModForm.bultos}
                        onChange={(e) => setRutaModField("bultos", e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <div style={MERC_LBL}>Palets</div>
                      <input
                        value={rutaModForm.palets}
                        onChange={(e) => setRutaModField("palets", e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                  <div style={MERC_LBL}>Motivo del cambio *</div>
                  <textarea
                    value={rutaModMotivo}
                    onChange={(e) => setRutaModMotivo(e.target.value)}
                    placeholder='Ej. cambio de vehículo por avería'
                    rows={2}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 10, boxSizing: "border-box", resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={confirmarModificacionEnRuta}
                      style={btn(UI.amber, "#fff")}
                    >
                      {busy === "ruta-mod" ? "Guardando y regenerando PDF…" : "Confirmar modificación en ruta"}
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => setRutaModOpen(false)}
                      style={btn("#fff", UI.tx)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {puedeEditarMercanciaSimple ? (
                <>
              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, margin: "14px 0 6px" }}>MERCANCÍA (tráfico / OCR)</div>
              <div style={MERC_LBL}>Naturaleza de la mercancía</div>
              <input
                value={mercanciaEdit.descripcion}
                onChange={(e) => setMercanciaField("descripcion", e.target.value)}
                placeholder="Ej. Sandía, patatas, palets hortícola…"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 8, boxSizing: "border-box" }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={MERC_LBL}>Peso (kg)</div>
                  <input
                    value={mercanciaEdit.peso_kg}
                    onChange={(e) => setMercanciaField("peso_kg", e.target.value)}
                    placeholder="Ej. 2000"
                    style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <div style={MERC_LBL}>Bultos</div>
                  <input
                    value={mercanciaEdit.bultos}
                    onChange={(e) => setMercanciaField("bultos", e.target.value)}
                    placeholder="Ej. 12"
                    style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <div style={MERC_LBL}>Palets</div>
                  <input
                    value={mercanciaEdit.palets}
                    onChange={(e) => setMercanciaField("palets", e.target.value)}
                    placeholder="Ej. 23"
                    style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                  />
                </div>
              </div>
              <button type="button" disabled={busy === "save"} onClick={guardarMercancia} style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, cursor: "pointer" }}>
                Guardar mercancía
              </button>
                </>
              ) : null}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${UI.border}`, background: UI.soft }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: accionColor,
              marginBottom: 10,
              lineHeight: 1.45,
              padding: actionFeedback?.kind === "error" ? "8px 10px" : 0,
              background: actionFeedback?.kind === "error" ? "#fef2f2" : "transparent",
              borderRadius: actionFeedback?.kind === "error" ? 8 : 0,
              border: actionFeedback?.kind === "error" ? "1px solid #fecaca" : "none",
            }}
          >
            {accionMensaje}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" disabled={!!busy || loading} onClick={completarDesdeOcr} style={btn(UI.accent, "#fff")}>
            Completar desde OCR
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={validarDcdt}
            title={puedeValidar ? "Paso 1: congelar datos para tráfico" : missing.length ? `Completa: ${missing.map((m) => m.label).join(" · ")}` : `${DECA_SHORT_LABEL} ya validado`}
            style={btn(UI.green, "#fff", !puedeValidar && !busy && !loading)}
          >
            {busy === "validar" ? "Validando…" : `Validar ${DECA_SHORT_LABEL}`}
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={generarPdf}
            title={pdfBtnHint}
            style={btn("#166534", "#fff", !puedePdf && !busy && !loading)}
          >
            {pdfBtnLabel}
          </button>
          {puedeModificarEnRuta ? (
            <button
              type="button"
              disabled={!!busy || loading || rutaModOpen}
              onClick={abrirModificacionEnRuta}
              title="Cambio en ruta con motivo obligatorio — regenera PDF al instante (misma URL/QR)"
              style={btn(UI.amber, "#fff", rutaModOpen && !busy && !loading)}
            >
              {busy === "ruta-mod" ? "Modificando…" : "Modificar en ruta"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={descargarPdfGuardado}
            title={downloadBtnHint}
            style={btn(UI.accent, "#fff", !puedeDescargarPdf && !busy && !loading)}
          >
            Descargar PDF {DECA_SHORT_LABEL}
          </button>
          <button
            type="button"
            disabled={!!busy || loading || !puedeDescargarPdf}
            onClick={() => setQrOpen(true)}
            title={puedeDescargarPdf ? "QR con URL de descarga directa" : "Genera el PDF antes de mostrar el QR"}
            style={btn("#0f766e", "#fff", !puedeDescargarPdf && !busy && !loading)}
          >
            Mostrar QR DeCA
          </button>
          <button type="button" onClick={onClose} style={{ ...btn("#fff", UI.tx), marginLeft: "auto" }}>
            Cerrar
          </button>
          </div>
        </div>
      </div>
      {qrOpen ? (
        <DcdtQrModal
          decaPublicId={dcdt?.decaPublicId}
          downloadUrl={decaDownloadUrl}
          dcdt={dcdt}
          numeroDcdt={serviceLabel}
          showToast={showToast}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
    </div>
  );
}

function btn(bg, color, muted = false) {
  return {
    background: bg,
    color,
    border: bg === "#fff" ? `1px solid ${UI.border}` : "none",
    borderRadius: 9,
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 800,
    cursor: muted ? "not-allowed" : "pointer",
    opacity: muted ? 0.55 : 1,
  };
}
