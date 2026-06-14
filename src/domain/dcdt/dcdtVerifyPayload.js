import { DCDT_ESTADO_LABELS } from "./dcdtConstants.js";

import { getServiceNumberForDisplay } from "../service/serviceIdentity.js";

/** Snapshot inmutable para verificación pública (Guardia Civil / inspección). */
export function buildDcdtVerifySnapshot({ doc, dcdt, servicio, conductor = null }) {
  const remolque =
    String(conductor?.remolque || doc?.vehiculo?.remolque || "").trim() || null;
  return {
    numero: getServiceNumberForDisplay(servicio) || String(dcdt?.id || "—").slice(0, 8),
    estado: dcdt?.estado || null,
    transportista: String(doc?.transportista?.nombre || "").trim(),
    matricula_tractora: String(doc?.vehiculo?.matricula || "").trim(),
    matricula_remolque: remolque,
    origen: String(doc?.origen || "").trim(),
    destino: String(doc?.destino || "").trim(),
    fecha_transporte: doc?.fecha_transporte || null,
    mercancia_principal: String(doc?.mercancia?.descripcion || "").trim(),
    validado_at: dcdt?.validadoAt || null,
  };
}

export function formatDcdtVerifyPublicRow(snapshot) {
  if (!snapshot) return null;
  const estadoLabel = DCDT_ESTADO_LABELS[snapshot.estado] || snapshot.estado || "—";
  let fecha = "—";
  if (snapshot.fecha_transporte) {
    try {
      fecha = new Date(snapshot.fecha_transporte).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      fecha = String(snapshot.fecha_transporte);
    }
  }
  return {
    numero: snapshot.numero || "—",
    estado: estadoLabel,
    transportista: snapshot.transportista || "—",
    matriculaTractora: snapshot.matricula_tractora || "—",
    matriculaRemolque: snapshot.matricula_remolque || null,
    origen: snapshot.origen || "—",
    destino: snapshot.destino || "—",
    fechaTransporte: fecha,
    mercanciaPrincipal: snapshot.mercancia_principal || "—",
    validadoAt: snapshot.validado_at || null,
  };
}
