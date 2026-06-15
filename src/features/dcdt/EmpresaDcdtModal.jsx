import { useEffect, useMemo, useState, useRef } from "react";
import { sbFetch } from "../../data/supabaseClient.js";
import {
  assignDcdtParte,
  buildMercanciaDatosPatch,
  computeDcdtEstado,
  ensureDcdtForServicio,
  extractLatestOcrFromEvidencias,
  isDcdtEstadoValidated,
  mergeOcrIntoDcdtDatos,
  mercanciaEditFromDatos,
  persistDcdtPartesFromStops,
  reconcileDcdtEstadoIfNeeded,
  saveDcdtDatos,
  fetchDcdtByServicio,
  validarDcdtTrafico,
} from "../../domain/dcdt/dcdtModel.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "../../domain/dcdt/dcdtReadiness.js";
import { getServicioMercanciaFromMeta } from "../../domain/dcdt/servicioMercanciaMeta.js";
import { fetchPartesTransporte } from "../../domain/dcdt/partesTransporteModel.js";
import { generateAndPersistDcdtPdf, downloadDcdtStoredPdf } from "../../domain/dcdt/dcdtPdfDocument.js";
import { formatDcdtDisplayValue, formatDcdtDisplayValueOrDash } from "../../domain/dcdt/dcdtDisplayText.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";
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

function hydrateMercanciaEdit(dcdtMercancia, servicio) {
  const fromDcdt = mercanciaEditFromDatos(dcdtMercancia);
  const hasDcdt =
    fromDcdt.descripcion ||
    fromDcdt.peso_kg ||
    fromDcdt.bultos ||
    fromDcdt.palets;
  if (hasDcdt) return fromDcdt;
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
  const [partes, setPartes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [mercanciaEdit, setMercanciaEdit] = useState({ descripcion: "", peso_kg: "", bultos: "", palets: "" });
  const [pickingRole, setPickingRole] = useState(null);
  const [confirmRole, setConfirmRole] = useState(null);
  const [empresaOwnerProfile, setEmpresaOwnerProfile] = useState(null);
  const [conductorEmpresa, setConductorEmpresa] = useState(conductor);
  const [qrOpen, setQrOpen] = useState(false);
  const mercanciaDirtyRef = useRef(false);
  const syncedPartesRef = useRef(false);
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
    if (!uid || conductor?.matricula) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await sbFetch(
          `/rest/v1/conductor_empresa?user_id=eq.${uid}&select=matricula,remolque,nombre,user_id&limit=1`,
        );
        if (!r.ok || cancelled) return;
        const rows = await r.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row && !cancelled) setConductorEmpresa(row);
      } catch {
        /* perfil opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [servicio?.conductor_id, conductor?.user_id, conductor?.matricula]);

  async function seleccionarParte(role, parteId, parteNueva = null) {
    if (!dcdt || !parteId) return;
    setBusy(`parte-${role}`);
    try {
      const masterMap = { ...masterById };
      if (parteNueva?.id) masterMap[parteNueva.id] = parteNueva;
      const next = await assignDcdtParte({
        dcdt,
        role,
        parteId,
        servicio,
        stops,
        flotaEvs,
        empresa,
        conductor: conductorEmpresa || conductor,
        masterById: masterMap,
      });
      setDcdt(next);
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

  function renderParteBlock(role, label, lineValue, missingField) {
    const isMissing = missingField || lineValue === "—";
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
            {isMissing ? "Completar dato" : "Cambiar"}
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
        setStops(Array.isArray(stopRows) ? stopRows : []);

        const [row, master] = await Promise.all([
          ensureDcdtForServicio({ servicioId: servicio.id, empresaId, stops: stopRows }),
          fetchPartesTransporte(empresaId),
        ]);
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

        const masterMap = {};
        for (const p of master || []) masterMap[p.id] = p;

        let persisted = row;
        if (!syncedPartesRef.current) {
          syncedPartesRef.current = true;
          persisted = await persistDcdtPartesFromStops({
            dcdt: row,
            servicio: servicioRef.current,
            stops: stopRows,
            flotaEvs: flotaEvsRef.current,
            empresa: empresaRef.current,
            conductor: conductorRef.current,
            masterById: masterMap,
          });
        }
        if (cancelled) return;

        const mercanciaForReadiness = hydrateMercanciaEdit(persisted?.datos?.mercancia, servicioRef.current);
        const readinessPreview = validateDcdtReadiness({
          servicio: servicioRef.current,
          dcdt: persisted,
          stops: stopRows,
          masterById: masterMap,
          empresa: empresaRef.current,
          empresaOwnerProfile: ownerProfile,
          conductor: conductorRef.current,
          mercanciaEdit: mercanciaForReadiness,
          flotaEvs: flotaEvsRef.current,
        });
        persisted = await reconcileDcdtEstadoIfNeeded({
          dcdt: persisted,
          missing: readinessPreview.missing,
          flotaEvs: flotaEvsRef.current,
          datos: persisted?.datos,
        });
        if (cancelled) return;

        setDcdt(persisted);
        setPartes(master);
        if (!mercanciaDirtyRef.current) {
          setMercanciaEdit(hydrateMercanciaEdit(persisted?.datos?.mercancia, servicioRef.current));
        }
      } catch (e) {
        if (!cancelled) showToastRef.current?.(e?.message || "No se pudo cargar DCDT");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [servicio?.id, empresaId]);

  const masterById = useMemo(() => {
    const m = {};
    for (const p of partes) m[p.id] = p;
    return m;
  }, [partes]);

  const readiness = useMemo(() => {
    if (!dcdt) {
      return validateDcdtReadiness({ servicio, dcdt: null });
    }
    return validateDcdtReadiness({
      servicio,
      dcdt,
      stops,
      masterById,
      empresa,
      empresaOwnerProfile,
      conductor: conductorEmpresa || conductor,
      mercanciaEdit,
      flotaEvs,
    });
  }, [dcdt, servicio, stops, masterById, empresa, empresaOwnerProfile, conductorEmpresa, conductor, mercanciaEdit, flotaEvs]);

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
  const pdfBtnHint = !puedePdf
    ? !isDcdtEstadoValidated(dcdt?.estado)
      ? "Paso 2: valida el DCDT para habilitar la generación del PDF"
      : missing.length
        ? `Faltan datos obligatorios: ${missing.map((m) => m.label).join(" · ")}`
        : ""
    : dcdt?.pdfGeneradoAt
      ? "Regenerar PDF DeCA (nueva versión con QR)"
      : "Paso 3: generar PDF DeCA con QR embebido";
  const downloadBtnHint = !puedeDescargarPdf
    ? puedePdf
      ? "Genera el PDF antes de descargarlo"
      : pdfBtnHint || "Valida y genera el PDF primero"
    : "Descargar el PDF guardado en storage";
  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";
  const decaDownloadUrl = dcdt?.datos?.deca_download_url || null;

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
          stops,
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
      setDcdt(next);
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
      const fresh = servicio?.id ? await fetchDcdtByServicio(servicio.id) : null;
      setDcdt(fresh || next);
      showToast?.("DCDT validado — ya puedes generar el PDF");
    } catch (e) {
      showToast?.(e?.message || "No se pudo validar");
    } finally {
      setBusy("");
    }
  }

  async function generarPdf() {
    if (!dcdt || !doc || !puedePdf) {
      showToast?.("Valida el DCDT y completa los datos obligatorios antes de generar PDF");
      return;
    }
    setBusy("pdf");
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
      showToast?.(`PDF DeCA generado con QR${kb ? ` · ${kb}` : ""}${when ? ` · ${when}` : ""}`);
    } catch (e) {
      showToast?.(e?.message || "Error al generar PDF");
    } finally {
      setBusy("");
    }
  }

  async function descargarPdfGuardado() {
    if (!dcdt || !puedeDescargarPdf) {
      showToast?.("Genera el PDF DCDT antes de descargarlo");
      return;
    }
    try {
      const name = dcdt.datos?.pdf_archivo_nombre || `dcdt-${serviceLabel}.pdf`;
      await downloadDcdtStoredPdf(dcdt, name);
      showToast?.("PDF DCDT descargado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo descargar el PDF");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: UI.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" onClick={(e) => e.stopPropagation()} style={{ background: UI.surface, borderRadius: 16, width: "min(96vw, 720px)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${UI.border}` }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${UI.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: UI.tx }}>DCDT</div>
          <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
            Documento de Control del Transporte · Orden FOM/2861/2012
          </div>
          <div style={{ fontSize: 13, color: UI.su, marginTop: 4 }}>
            {serviceLabel} · {statusLabel}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
          {loading ? (
            <div style={{ color: UI.su }}>Cargando…</div>
          ) : (
            <>
              {missing.length ? (
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: UI.amber }}>Pendientes ({missing.length})</div>
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>{missing.map((f) => f.label).join(" · ")}</div>
                </div>
              ) : (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12, fontWeight: 700, color: UI.green }}>
                  {isDcdtEstadoValidated(dcdt?.estado)
                    ? dcdt?.pdfGeneradoAt
                      ? `DCDT validado · PDF generado${dcdt?.datos?.pdf_size_bytes ? ` (${Math.round(dcdt.datos.pdf_size_bytes / 1024)} KB)` : ""}`
                      : "DCDT validado"
                    : "DCDT completo — listo para validar"}
                </div>
              )}

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
                "Destinatario",
                parteLine(doc?.destinatario),
                !doc?.destinatario?.nombre,
              )}
              <FieldRow label="Origen" value={doc?.origen} missing={missingKeys.has("origen")} />
              <FieldRow label="Destino" value={doc?.destino} missing={missingKeys.has("destino")} />
              <FieldRow label="Matrícula" value={doc?.vehiculo?.matricula} missing={missingKeys.has("vehiculo.matricula")} />
              <FieldRow label="Fecha" value={doc?.fecha_transporte ? new Date(doc.fecha_transporte).toLocaleDateString("es-ES") : ""} missing={missingKeys.has("fecha_transporte")} />

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
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${UI.border}`, display: "flex", flexWrap: "wrap", gap: 8, background: UI.soft }}>
          <button type="button" disabled={!!busy || loading} onClick={completarDesdeOcr} style={btn(UI.accent, "#fff")}>
            Completar desde OCR
          </button>
          <button
            type="button"
            disabled={!!busy || loading || !puedeValidar}
            onClick={validarDcdt}
            title={puedeValidar ? "Paso 1: congelar datos para tráfico" : missing.length ? `Completa: ${missing.map((m) => m.label).join(" · ")}` : "DCDT ya validado"}
            style={btn(UI.green, "#fff")}
          >
            Validar DCDT
          </button>
          <button
            type="button"
            disabled={!!busy || loading || !puedePdf}
            onClick={generarPdf}
            title={pdfBtnHint}
            style={btn("#166534", "#fff")}
          >
            Generar PDF DCDT
          </button>
          <button
            type="button"
            disabled={!!busy || loading || !puedeDescargarPdf}
            onClick={descargarPdfGuardado}
            title={downloadBtnHint}
            style={btn(UI.accent, "#fff")}
          >
            Descargar PDF DCDT
          </button>
          <button type="button" disabled={!!busy || loading || !decaDownloadUrl} onClick={() => setQrOpen(true)} style={btn("#0f766e", "#fff")}>
            Mostrar QR DeCA
          </button>
          <button type="button" onClick={onClose} style={{ ...btn("#fff", UI.tx), marginLeft: "auto" }}>
            Cerrar
          </button>
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

function btn(bg, color) {
  return { background: bg, color, border: bg === "#fff" ? `1px solid ${UI.border}` : "none", borderRadius: 9, padding: "10px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
}
