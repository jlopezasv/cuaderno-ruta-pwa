/** Tipos de parte en catálogo master (DCDT: cargador / destinatario). */
export const PARTE_TIPO = Object.freeze({
  CARGADOR: "cargador",
  DESTINATARIO: "destinatario",
  OPERADOR: "operador",
});

export const PARTE_TIPO_LABELS = Object.freeze({
  cargador: "Cargador contractual",
  destinatario: "Destinatario",
  operador: "Operador / muelle",
});

/** Estados DCDT por servicio (Orden FOM/2861/2012). */
export const DCDT_ESTADO = Object.freeze({
  BORRADOR: "borrador",
  INCOMPLETO: "incompleto",
  PENDIENTE_OCR: "pendiente_ocr",
  PENDIENTE_VALIDACION: "pendiente_validacion",
  VALIDADO: "validado",
  EN_EXPEDIENTE: "incluido_en_expediente",
});

export const DCDT_ESTADO_LABELS = Object.freeze({
  borrador: "Borrador",
  incompleto: "Incompleto",
  pendiente_ocr: "Pendiente OCR",
  pendiente_validacion: "Pendiente validación",
  validado: "Validado",
  incluido_en_expediente: "Incluido en expediente",
});

/** Campos esenciales DCDT (FOM/2861/2012). */
export const DCDT_REQUIRED_FIELDS = Object.freeze([
  { key: "cargador.nombre", label: "Cargador — razón social" },
  { key: "cargador.nif", label: "Cargador — NIF/CIF" },
  { key: "cargador.domicilio", label: "Cargador — domicilio" },
  { key: "transportista.nombre", label: "Transportista — razón social" },
  { key: "transportista.nif", label: "Transportista — NIF/CIF" },
  { key: "transportista.domicilio", label: "Transportista — domicilio" },
  { key: "origen", label: "Lugar de origen / carga" },
  { key: "destino", label: "Lugar de destino / descarga" },
  { key: "mercancia.descripcion", label: "Naturaleza de la mercancía" },
  { key: "mercancia.peso_kg", label: "Peso (kg)" },
  { key: "fecha_transporte", label: "Fecha del transporte" },
  { key: "vehiculo.matricula", label: "Matrícula del vehículo" },
]);

export const DCDT_TABLE = "dcdt_servicio";
export const DCDT_TABLE_LEGACY = "carta_porte_servicio";
