import { useCallback, useEffect, useMemo, useState } from "react";
import { sbFetch } from "../../data/supabaseClient.js";
import { DCDT_ESTADO, DCDT_ESTADO_LABELS } from "../../domain/dcdt/dcdtConstants.js";
import {
  computeDcdtEstado,
  ensureDcdtForServicio,
  extractLatestOcrFromEvidencias,
  mergeOcrIntoDcdtDatos,
  resolveDcdtDocument,
  saveDcdtDatos,
  validarDcdtTrafico,
  markDcdtPdfGenerado,
} from "../../domain/dcdt/dcdtModel.js";
import { fetchPartesTransporte } from "../../domain/dcdt/partesTransporteModel.js";
import { downloadDcdtPdf } from "../../domain/dcdt/generateDcdtPdf.js";

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
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${UI.border}`, fontSize: 13 }}>
      <div style={{ color: missing ? UI.red : UI.su, fontWeight: 700, fontSize: 11 }}>{label}</div>
      <div style={{ color: UI.tx }}>{value || "—"}</div>
    </div>
  );
}

function parteLine(parte) {
  if (!parte?.nombre) return "—";
  return [parte.nombre, parte.nif, parte.domicilio || parte.direccion].filter(Boolean).join(" · ");
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

  const empresaId = servicio?.empresa_id || empresa?.id;

  const load = useCallback(async () => {
    if (!servicio?.id || !empresaId) return;
    setLoading(true);
    try {
      let stopRows = stopsProp;
      if (!stopRows?.length) {
        const sr = await sbFetch(
          `/rest/v1/stops?servicio_id=eq.${servicio.id}&select=id,orden,tipo,nombre,direccion,notas&order=orden.asc`,
        );
        stopRows = sr.ok ? await sr.json() : [];
      }
      setStops(Array.isArray(stopRows) ? stopRows : []);
      const [row, master] = await Promise.all([
        ensureDcdtForServicio({ servicioId: servicio.id, empresaId, stops: stopRows }),
        fetchPartesTransporte(empresaId),
      ]);
      setDcdt(row);
      setPartes(master);
      const m = row?.datos?.mercancia || {};
      setMercanciaEdit({
        descripcion: m.descripcion || "",
        peso_kg: m.peso_kg != null ? String(m.peso_kg) : "",
        bultos: m.bultos != null ? String(m.bultos) : "",
        palets: m.palets != null ? String(m.palets) : "",
      });
    } catch (e) {
      showToast?.(e?.message || "No se pudo cargar DCDT");
    } finally {
      setLoading(false);
    }
  }, [servicio?.id, empresaId, stopsProp, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const masterById = useMemo(() => {
    const m = {};
    for (const p of partes) m[p.id] = p;
    return m;
  }, [partes]);

  const { doc, missing, datos } = useMemo(() => {
    if (!dcdt) return { doc: null, missing: [], datos: null };
    const datosMerged = {
      ...dcdt.datos,
      mercancia: {
        ...dcdt.datos?.mercancia,
        descripcion: mercanciaEdit.descripcion || dcdt.datos?.mercancia?.descripcion,
        peso_kg: mercanciaEdit.peso_kg !== "" ? Number(mercanciaEdit.peso_kg) : dcdt.datos?.mercancia?.peso_kg,
        bultos: mercanciaEdit.bultos !== "" ? Number(mercanciaEdit.bultos) : dcdt.datos?.mercancia?.bultos,
        palets: mercanciaEdit.palets !== "" ? Number(mercanciaEdit.palets) : dcdt.datos?.mercancia?.palets,
      },
    };
    return resolveDcdtDocument({
      servicio,
      stops,
      dcdt: { ...dcdt, datos: datosMerged },
      masterById,
      empresa,
      conductor,
    });
  }, [dcdt, servicio, stops, masterById, empresa, conductor, mercanciaEdit]);

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

  const estadoLabel = DCDT_ESTADO_LABELS[dcdt?.estado] || DCDT_ESTADO_LABELS[estadoAuto] || "Borrador";
  const puedeValidar = missing.length === 0 && dcdt?.estado !== DCDT_ESTADO.VALIDADO;
  const puedePdf =
    dcdt?.estado === DCDT_ESTADO.VALIDADO || dcdt?.estado === DCDT_ESTADO.EN_EXPEDIENTE;

  async function guardarMercancia() {
    if (!dcdt) return;
    setBusy("save");
    try {
      const nextDatos = {
        ...dcdt.datos,
        mercancia: {
          descripcion: mercanciaEdit.descripcion.trim() || null,
          peso_kg: mercanciaEdit.peso_kg !== "" ? Number(mercanciaEdit.peso_kg) : null,
          bultos: mercanciaEdit.bultos !== "" ? Number(mercanciaEdit.bultos) : null,
          palets: mercanciaEdit.palets !== "" ? Number(mercanciaEdit.palets) : null,
        },
      };
      const estado = computeDcdtEstado({
        missing: resolveDcdtDocument({
          servicio,
          stops,
          dcdt: { ...dcdt, datos: nextDatos },
          masterById,
          empresa,
          conductor,
        }).missing,
        evidenciasByStop: flotaEvs,
        datos: nextDatos,
        currentEstado: dcdt.estado,
      });
      const next = await saveDcdtDatos(dcdt.id, nextDatos, estado);
      setDcdt(next);
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
      const { missing: m2 } = resolveDcdtDocument({
        servicio,
        stops,
        dcdt: { ...dcdt, datos: nextDatos },
        masterById,
        empresa,
        conductor,
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
      setMercanciaEdit({
        descripcion: m.descripcion || "",
        peso_kg: m.peso_kg != null ? String(m.peso_kg) : "",
        bultos: m.bultos != null ? String(m.bultos) : "",
        palets: m.palets != null ? String(m.palets) : "",
      });
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
      const next = await validarDcdtTrafico(dcdt.id, userId);
      setDcdt(next);
      showToast?.("DCDT validado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo validar");
    } finally {
      setBusy("");
    }
  }

  async function generarPdf() {
    if (!dcdt || !doc || !puedePdf) {
      showToast?.("Valida el DCDT antes de generar PDF");
      return;
    }
    setBusy("pdf");
    try {
      await downloadDcdtPdf(doc, `dcdt-${servicio.referencia || servicio.id}.pdf`);
      await markDcdtPdfGenerado(dcdt.id);
      showToast?.("PDF DCDT generado");
    } catch (e) {
      showToast?.(e?.message || "Error al generar PDF");
    } finally {
      setBusy("");
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
            {servicio?.referencia || servicio?.id} · {estadoLabel}
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
                  Datos completos — listo para validación
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, marginBottom: 6 }}>DATOS ENCONTRADOS</div>
              <FieldRow label="Cargador" value={parteLine(doc?.cargador)} missing={missingKeys.has("cargador.nombre")} />
              <FieldRow label="Transportista" value={parteLine(doc?.transportista)} missing={missingKeys.has("transportista.nombre")} />
              <FieldRow label="Destinatario" value={parteLine(doc?.destinatario)} />
              <FieldRow label="Origen" value={doc?.origen} missing={missingKeys.has("origen")} />
              <FieldRow label="Destino" value={doc?.destino} missing={missingKeys.has("destino")} />
              <FieldRow label="Matrícula" value={doc?.vehiculo?.matricula} missing={missingKeys.has("vehiculo.matricula")} />
              <FieldRow label="Fecha" value={doc?.fecha_transporte ? new Date(doc.fecha_transporte).toLocaleDateString("es-ES") : ""} missing={missingKeys.has("fecha_transporte")} />

              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, margin: "14px 0 6px" }}>MERCANCÍA (tráfico / OCR)</div>
              <input value={mercanciaEdit.descripcion} onChange={(e) => setMercanciaEdit((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Naturaleza" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 8, boxSizing: "border-box" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input value={mercanciaEdit.peso_kg} onChange={(e) => setMercanciaEdit((p) => ({ ...p, peso_kg: e.target.value }))} placeholder="Peso kg" style={{ padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}` }} />
                <input value={mercanciaEdit.bultos} onChange={(e) => setMercanciaEdit((p) => ({ ...p, bultos: e.target.value }))} placeholder="Bultos" style={{ padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}` }} />
                <input value={mercanciaEdit.palets} onChange={(e) => setMercanciaEdit((p) => ({ ...p, palets: e.target.value }))} placeholder="Palets" style={{ padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}` }} />
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
          <button type="button" disabled={!!busy || loading || !puedeValidar} onClick={validarDcdt} style={btn(UI.green, "#fff")}>
            Validar DCDT
          </button>
          <button type="button" disabled={!!busy || loading || !puedePdf} onClick={generarPdf} style={btn("#0f172a", "#fff")}>
            Generar PDF DCDT
          </button>
          <button type="button" onClick={onClose} style={{ ...btn("#fff", UI.tx), marginLeft: "auto" }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(bg, color) {
  return { background: bg, color, border: bg === "#fff" ? `1px solid ${UI.border}` : "none", borderRadius: 9, padding: "10px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
}
