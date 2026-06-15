import { DECA_SHORT_LABEL } from "./decaBranding.js";
import { DCDT_ESTADO, DCDT_ESTADO_LABELS } from "./dcdtConstants.js";
import { formatDcdtDisplayValueOrDash } from "./dcdtDisplayText.js";

function formatFecha(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatFechaHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function isDcdtValidatedEstado(estado) {
  const e = String(estado || "").toLowerCase();
  return e === DCDT_ESTADO.VALIDADO || e === DCDT_ESTADO.EN_EXPEDIENTE;
}

function parteFields(parte, roleLabel) {
  return [
    { label: `${roleLabel} — razón social`, value: formatDcdtDisplayValueOrDash(parte?.nombre) },
    { label: `${roleLabel} — NIF/CIF`, value: formatDcdtDisplayValueOrDash(parte?.nif) },
    {
      label: `${roleLabel} — domicilio`,
      value: formatDcdtDisplayValueOrDash(parte?.domicilio || parte?.direccion),
    },
  ];
}

function mercanciaValue(val) {
  if (val == null || val === "") return "—";
  return formatDcdtDisplayValueOrDash(val);
}

/** Secciones de solo lectura a partir del documento resuelto (con validacion_snapshot aplicado). */
export function buildDcdtReadonlySections({ doc, dcdt = null, servicioReferencia = null }) {
  if (!doc) return { mode: "empty", banner: null, sections: [] };

  const estado = dcdt?.estado || doc?.estado;
  const validated = isDcdtValidatedEstado(estado);
  const ref = formatDcdtDisplayValueOrDash(doc.referencia || servicioReferencia);
  const validadoAt = dcdt?.validadoAt || doc?.validado_at;

  return {
    mode: validated ? "verification" : "preview",
    banner: validated ? "Documento en modo verificación. Solo lectura." : null,
    referencia: ref,
    estadoLabel: validated ? "Validado" : DCDT_ESTADO_LABELS[estado] || estado || "—",
    sections: [
      {
        title: "Identificación",
        fields: [
          { label: `Nº ${DECA_SHORT_LABEL} / referencia servicio`, value: ref },
          { label: "Estado", value: validated ? "Validado" : DCDT_ESTADO_LABELS[estado] || estado || "—" },
          { label: "Fecha de validación", value: validated ? formatFechaHora(validadoAt) : "—" },
          { label: "Empresa transportista", value: formatDcdtDisplayValueOrDash(doc.transportista?.nombre) },
        ],
      },
      {
        title: "Partes",
        fields: [
          ...parteFields(doc.cargador, "Cargador contractual"),
          ...parteFields(doc.transportista, "Transportista efectivo"),
          ...parteFields(doc.destinatario, "Destinatario"),
        ],
      },
      {
        title: "Transporte",
        fields: [
          { label: "Origen", value: formatDcdtDisplayValueOrDash(doc.origen) },
          { label: "Destino", value: formatDcdtDisplayValueOrDash(doc.destino) },
          { label: "Fecha transporte", value: formatFecha(doc.fecha_transporte) },
          { label: "Matrícula tractora", value: formatDcdtDisplayValueOrDash(doc.vehiculo?.matricula) },
          ...(doc.vehiculo?.remolque
            ? [{ label: "Matrícula remolque", value: formatDcdtDisplayValueOrDash(doc.vehiculo.remolque) }]
            : []),
        ],
      },
      {
        title: "Mercancía",
        fields: [
          { label: "Naturaleza mercancía", value: formatDcdtDisplayValueOrDash(doc.mercancia?.descripcion) },
          { label: "Peso (kg)", value: mercanciaValue(doc.mercancia?.peso_kg) },
          { label: "Bultos", value: mercanciaValue(doc.mercancia?.bultos) },
          { label: "Palets", value: mercanciaValue(doc.mercancia?.palets) },
        ],
      },
    ],
  };
}

/** Convierte snapshot QR/validación almacenado en forma de documento resuelto. */
export function docFromDcdtStoredSnapshot(snapshot, { estado = null, validadoAt = null } = {}) {
  if (!snapshot || typeof snapshot !== "object") return null;

  if (snapshot.referencia && !snapshot.numero) {
    return {
      referencia: snapshot.referencia,
      estado: estado || snapshot.estado,
      validado_at: validadoAt || snapshot.validado_at || snapshot.at,
      cargador: snapshot.cargador || null,
      transportista: snapshot.transportista || null,
      destinatario: snapshot.destinatario || null,
      origen: snapshot.origen,
      destino: snapshot.destino,
      fecha_transporte: snapshot.fecha_transporte,
      vehiculo: snapshot.vehiculo || null,
      mercancia: snapshot.mercancia || null,
    };
  }

  if (snapshot.schema_version >= 2 || snapshot.cargador) {
    return {
      referencia: snapshot.numero || snapshot.referencia,
      estado: snapshot.estado || estado,
      validado_at: snapshot.validado_at || validadoAt,
      cargador: snapshot.cargador || null,
      transportista: snapshot.transportista || {
        nombre: snapshot.empresa_transportista || snapshot.transportista,
      },
      destinatario: snapshot.destinatario || null,
      origen: snapshot.origen,
      destino: snapshot.destino,
      fecha_transporte: snapshot.fecha_transporte,
      vehiculo: {
        matricula: snapshot.matricula_tractora || snapshot.vehiculo?.matricula,
        remolque: snapshot.matricula_remolque || snapshot.vehiculo?.remolque || null,
      },
      mercancia: snapshot.mercancia || {
        descripcion: snapshot.mercancia_principal,
        peso_kg: snapshot.peso_kg,
        bultos: snapshot.bultos,
        palets: snapshot.palets,
      },
    };
  }

  return {
    referencia: snapshot.numero,
    estado: snapshot.estado || estado,
    validado_at: snapshot.validado_at || validadoAt,
    cargador: null,
    transportista: { nombre: snapshot.transportista },
    destinatario: null,
    origen: snapshot.origen,
    destino: snapshot.destino,
    fecha_transporte: snapshot.fecha_transporte,
    vehiculo: {
      matricula: snapshot.matricula_tractora,
      remolque: snapshot.matricula_remolque || null,
    },
    mercancia: { descripcion: snapshot.mercancia_principal },
  };
}

/** Vista pública a partir del snapshot almacenado (QR o validacion_snapshot). */
export function buildDcdtPublicSectionsFromSnapshot(snapshot, { estado = null, validadoAt = null } = {}) {
  const doc = docFromDcdtStoredSnapshot(snapshot, { estado, validadoAt });
  if (!doc) return null;
  return buildDcdtReadonlySections({
    doc,
    dcdt: { estado: estado || snapshot?.estado, validadoAt: validadoAt || snapshot?.validado_at },
  });
}
