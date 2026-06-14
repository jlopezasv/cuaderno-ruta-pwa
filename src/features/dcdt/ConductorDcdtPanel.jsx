import { useCallback, useEffect, useMemo, useState } from "react";

import { sbFetch } from "../../data/supabaseClient.js";

import {

  ensureDcdtForServicio,

  ensureDcdtQrVerification,

  fetchDcdtByServicio,

  dcdtStatusUxLabel,

  isDcdtFullyValidated,

  reconcileDcdtEstadoIfNeeded,

  resolveDcdtDocument,

} from "../../domain/dcdt/dcdtModel.js";

import { downloadDcdtPdf } from "../../domain/dcdt/generateDcdtPdf.js";

import { openDcdtStoredPdf } from "../../domain/dcdt/dcdtPdfDocument.js";

import { fetchPartesTransporte } from "../../domain/dcdt/partesTransporteModel.js";

import { getDcdtQrToken, isDcdtQrEligible } from "../../domain/dcdt/dcdtVerifyToken.js";

import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";

import { DcdtQrModal } from "./DcdtQrModal.jsx";

import { DcdtReadonlyViewModal } from "./DcdtReadonlyViewModal.jsx";



const UI = {

  surface: "#ffffff",

  soft: "#f8fafc",

  border: "#dbe4ee",

  tx: "#0f172a",

  su: "#64748b",

  doc: "#334155",

  greenSoft: "#dcfce7",

  amberSoft: "#fffbeb",

  amberBorder: "#fde68a",

  amberTx: "#92400e",

};



function docBtnStyle(variant = "default") {

  if (variant === "primary") {

    return {

      width: "100%",

      background: UI.greenSoft,

      color: "#166534",

      border: "1px solid #bbf7d0",

      borderRadius: 10,

      padding: "10px 12px",

      fontSize: 13,

      fontWeight: 700,

      cursor: "pointer",

      textAlign: "left",

    };

  }

  return {

    width: "100%",

    background: UI.surface,

    color: UI.doc,

    border: `1px solid ${UI.border}`,

    borderRadius: 10,

    padding: "10px 12px",

    fontSize: 13,

    fontWeight: 700,

    cursor: "pointer",

    textAlign: "left",

  };

}



function conductorDcdtPhase(estado, missing) {

  if (missing.length > 0) return "incomplete";

  if (isDcdtQrEligible(estado, { missing })) return "validated";

  if (String(estado || "").toLowerCase() === "pendiente_validacion") return "pending_validation";

  return "incomplete";

}



function phaseHint(phase) {

  if (phase === "validated") {

    return "Documento listo para inspección. Puedes mostrarlo sin depender de tráfico.";

  }

  if (phase === "pending_validation") {

    return "Tráfico debe validar el documento antes de que puedas mostrarlo en inspección.";

  }

  return "Tráfico está completando los datos del documento de control del transporte.";

}



export function ConductorDcdtPanel({

  servicio,

  empresa = null,

  conductor = null,

  conductorUid = null,

  stops = [],

  showToast,

  compact = false,

}) {

  const [dcdt, setDcdt] = useState(null);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);

  const [masterById, setMasterById] = useState({});

  const [conductorProfile, setConductorProfile] = useState(conductor);



  const empresaId = servicio?.empresa_id || empresa?.id;



  useEffect(() => {

    setConductorProfile(conductor);

  }, [conductor]);



  useEffect(() => {

    const uid = conductorUid || servicio?.conductor_id;

    if (!uid || conductor?.matricula) return;

    let cancelled = false;

    (async () => {

      try {

        const r = await sbFetch(

          `/rest/v1/conductor_empresa?user_id=eq.${uid}&select=matricula,remolque,nombre&limit=1`,

        );

        if (!r.ok || cancelled) return;

        const rows = await r.json();

        const row = Array.isArray(rows) ? rows[0] : null;

        if (row && !cancelled) setConductorProfile(row);

      } catch {

        /* perfil opcional */

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [conductorUid, servicio?.conductor_id, conductor?.matricula]);



  const load = useCallback(async () => {

    if (!servicio?.id || !empresaId) {

      setDcdt(null);

      setLoading(false);

      return;

    }

    setLoading(true);

    try {

      const [row, master] = await Promise.all([

        fetchDcdtByServicio(servicio.id).then((r) => r || ensureDcdtForServicio({ servicioId: servicio.id, empresaId, stops })),

        fetchPartesTransporte(empresaId),

      ]);

      const map = {};

      for (const p of master || []) map[p.id] = p;

      setMasterById(map);



      let nextRow = row;

      if (row) {

        const preview = resolveDcdtDocument({

          servicio,

          stops,

          dcdt: row,

          masterById: map,

          empresa,

          conductor: conductorProfile,

        });

        nextRow = await reconcileDcdtEstadoIfNeeded({

          dcdt: row,

          missing: preview.missing,

          datos: row.datos,

        });

      }

      setDcdt(nextRow);

    } catch {

      setDcdt(null);

    } finally {

      setLoading(false);

    }

  }, [servicio, empresaId, stops, empresa, conductorProfile]);



  useEffect(() => {

    load();

  }, [load]);



  const resolved = useMemo(() => {

    if (!dcdt) return { doc: null, missing: [] };

    return resolveDcdtDocument({

      servicio,

      stops,

      dcdt,

      masterById,

      empresa,

      conductor: conductorProfile,

    });

  }, [dcdt, servicio, stops, masterById, empresa, conductorProfile]);



  const doc = resolved.doc;

  const missing = resolved.missing || [];

  const phase = conductorDcdtPhase(dcdt?.estado, missing);

  const validated = phase === "validated";

  const fullyValidated = isDcdtFullyValidated({ estado: dcdt?.estado, missing });

  const hasStoredPdf = !!dcdt?.pdfGeneradoAt || !!dcdt?.datos?.pdf_archivo_url;

  const statusLabel = dcdtStatusUxLabel({

    estado: dcdt?.estado,

    missing,

    pdfGeneradoAt: dcdt?.pdfGeneradoAt,

  });

  const qrToken = getDcdtQrToken(dcdt);

  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";



  useEffect(() => {

    if (!servicio?.id || fullyValidated) return;

    const t = setInterval(() => {

      void load();

    }, 20000);

    return () => clearInterval(t);

  }, [servicio?.id, fullyValidated, load]);



  async function openQr() {

    if (!dcdt || !fullyValidated || !doc) {

      showToast?.("No disponible hasta validar el DCDT.");

      return;

    }

    setBusy("qr");

    try {

      const next = await ensureDcdtQrVerification({

        dcdt,

        doc,

        servicio,

        conductor: conductorProfile,

        missing,

      });

      setDcdt(next);

      if (!getDcdtQrToken(next)) {

        showToast?.("No se pudo generar el QR");

        return;

      }

      setQrOpen(true);

    } catch (e) {

      showToast?.(e?.message || "Error al preparar QR");

    } finally {

      setBusy(false);

    }

  }



  async function descargarPdf() {

    if (!fullyValidated) {

      showToast?.("No disponible hasta validar el DCDT.");

      return;

    }

    setBusy("pdf");

    try {

      if (openDcdtStoredPdf(dcdt)) {

        showToast?.("Abriendo PDF DCDT");

        return;

      }

      if (!doc) throw new Error("Documento no disponible");

      await downloadDcdtPdf(doc, `dcdt-${serviceLabel}.pdf`);

      showToast?.("PDF DCDT descargado");

    } catch (e) {

      showToast?.(e?.message || "No se pudo obtener el PDF");

    } finally {

      setBusy(false);

    }

  }



  if (!servicio?.id) return null;



  if (loading && !dcdt) {

    return (

      <div style={{ padding: compact ? "10px 0" : "12px 14px", fontSize: 12, color: UI.su }}>

        Cargando DCDT…

      </div>

    );

  }



  if (!dcdt) return null;



  const boxStyle = validated

    ? { border: "1px solid #bbf7d0", background: UI.greenSoft }

    : { border: `1px solid ${UI.amberBorder}`, background: UI.amberSoft };



  return (

    <>

      <div

        style={{

          marginTop: compact ? 0 : 14,

          padding: compact ? "10px 0 4px" : "12px 14px",

          borderRadius: compact ? 0 : 12,

          ...boxStyle,

          ...(compact ? { border: "none", background: "transparent", padding: "10px 0 4px" } : {}),

        }}

      >

        <div style={{ fontSize: 12, fontWeight: 800, color: validated ? "#166534" : UI.amberTx, marginBottom: 6 }}>

          {statusLabel}

        </div>

        <div style={{ fontSize: 11, color: UI.su, marginBottom: 10, lineHeight: 1.4 }}>

          {phaseHint(phase)}

        </div>

        {!validated && missing.length ? (

          <div style={{ fontSize: 10, color: UI.amberTx, marginBottom: 10, lineHeight: 1.35 }}>

            Pendientes: {missing.slice(0, 4).map((m) => m.label).join(" · ")}

            {missing.length > 4 ? ` · +${missing.length - 4}` : ""}

          </div>

        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

          {fullyValidated ? (

            <>

              <button type="button" style={docBtnStyle("primary")} onClick={() => setViewOpen(true)} disabled={!doc}>

                Ver DCDT

              </button>

              <button type="button" style={docBtnStyle("default")} onClick={descargarPdf} disabled={!doc || busy === "pdf"}>

                {busy === "pdf" ? "Obteniendo PDF…" : hasStoredPdf ? "Descargar PDF" : "Descargar PDF (generar si falta)"}

              </button>

              <button

                type="button"

                disabled={busy === "qr"}

                style={docBtnStyle("default")}

                onClick={openQr}

              >

                {busy === "qr" ? "Preparando QR…" : "Mostrar QR"}

              </button>

            </>

          ) : (

            <button type="button" style={docBtnStyle("default")} onClick={() => setViewOpen(true)}>

              Ver estado

            </button>

          )}

        </div>

      </div>



      {viewOpen ? (

        <DcdtReadonlyViewModal

          servicio={servicio}

          doc={doc}

          dcdt={dcdt}

          missing={missing}

          onClose={() => setViewOpen(false)}

        />

      ) : null}



      {qrOpen && qrToken ? (

        <DcdtQrModal token={getDcdtQrToken(dcdt)} numeroDcdt={serviceLabel} onClose={() => setQrOpen(false)} />

      ) : null}

    </>

  );

}


