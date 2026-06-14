import { getServiceNumberForDisplay } from "../service/serviceIdentity.js";
import { buildDcdtPublicSectionsFromSnapshot } from "./dcdtReadonlyViewModel.js";

/** Snapshot inmutable para verificación pública (Guardia Civil / inspección). */
export function buildDcdtVerifySnapshot({ doc, dcdt, servicio, conductor = null }) {
  if (!doc) return null;

  const validSnap = dcdt?.datos?.validacion_snapshot;
  const useSnap = validSnap && typeof validSnap === "object";
  const base = useSnap
    ? {
        referencia: validSnap.referencia || doc.referencia,
        cargador: validSnap.cargador || doc.cargador,
        destinatario: validSnap.destinatario || doc.destinatario,
        transportista: validSnap.transportista || doc.transportista,
        origen: validSnap.origen || doc.origen,
        destino: validSnap.destino || doc.destino,
        mercancia: validSnap.mercancia || doc.mercancia,
        fecha_transporte: validSnap.fecha_transporte || doc.fecha_transporte,
        vehiculo: validSnap.vehiculo || doc.vehiculo,
      }
    : doc;

  const remolque =
    String(base?.vehiculo?.remolque || conductor?.remolque || "").trim() || null;

  return {
    schema_version: 2,
    numero: base.referencia || getServiceNumberForDisplay(servicio) || "—",
    estado: dcdt?.estado || null,
    validado_at: dcdt?.validadoAt || null,
    empresa_transportista: String(base?.transportista?.nombre || "").trim(),
    cargador: base.cargador || null,
    transportista: base.transportista || null,
    destinatario: base.destinatario || null,
    origen: String(base?.origen || "").trim(),
    destino: String(base?.destino || "").trim(),
    fecha_transporte: base?.fecha_transporte || null,
    matricula_tractora: String(base?.vehiculo?.matricula || "").trim(),
    matricula_remolque: remolque,
    mercancia: {
      descripcion: base?.mercancia?.descripcion ?? null,
      peso_kg: base?.mercancia?.peso_kg ?? null,
      bultos: base?.mercancia?.bultos ?? null,
      palets: base?.mercancia?.palets ?? null,
    },
  };
}

/** Formato legado + secciones completas para la vista pública. */
export function formatDcdtVerifyPublicRow(snapshot, { estado = null, validadoAt = null } = {}) {
  const sectionsModel = buildDcdtPublicSectionsFromSnapshot(snapshot, { estado, validadoAt });
  if (!sectionsModel) return null;

  const merc = snapshot?.mercancia || {};
  return {
    sections: sectionsModel,
    numero: sectionsModel.referencia,
    estado: sectionsModel.estadoLabel,
    validadoAt: snapshot?.validado_at || validadoAt || null,
    transportista: snapshot?.empresa_transportista || snapshot?.transportista?.nombre || "—",
    matriculaTractora: snapshot?.matricula_tractora || "—",
    matriculaRemolque: snapshot?.matricula_remolque || null,
    origen: snapshot?.origen || "—",
    destino: snapshot?.destino || "—",
    fechaTransporte: sectionsModel.sections
      .find((s) => s.title === "Transporte")
      ?.fields?.find((f) => f.label === "Fecha transporte")?.value || "—",
    mercanciaPrincipal: merc.descripcion || snapshot?.mercancia_principal || "—",
    pesoKg: merc.peso_kg ?? null,
    bultos: merc.bultos ?? null,
    palets: merc.palets ?? null,
  };
}
