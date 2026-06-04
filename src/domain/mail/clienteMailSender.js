/** Remitente canónico para envío de expedientes al cliente (demo / futuro prod). */

export const CLIENTE_MAIL_FROM_ADDRESS = "expedientes@cuadernoderutapro.es";

/**
 * From visible: «Transportes Beta vía Cuaderno de Ruta <expedientes@…>»
 */
export function buildClienteMailFrom(empresaNombre) {
  const name = String(empresaNombre || "").trim() || "Empresa";
  const display = `${name} vía Cuaderno de Ruta`;
  const from = `${display} <${CLIENTE_MAIL_FROM_ADDRESS}>`;
  return { from, remitenteMostrado: from, displayName: display };
}

/**
 * @param {string} serviceRef — ej. SERV-401
 */
export function buildClienteMailDefaults(serviceRef) {
  const ref = String(serviceRef || "").trim() || "SERV-000";
  return {
    subject: `Expediente operacional ${ref}`,
    message: `Buenos días,\n\nAdjuntamos el expediente operacional correspondiente al servicio ${ref}.\n\nQuedamos a su disposición para cualquier aclaración.\n\nUn saludo.`,
  };
}

export function normalizeReplyToEmail(email) {
  const e = String(email || "").trim();
  if (!e || !e.includes("@")) return "";
  return e;
}
