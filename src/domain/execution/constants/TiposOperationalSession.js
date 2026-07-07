/**
 * Tipos de sesión operativa (genéricos, multi-sector).
 * Alias legacy: tipo_previsto en operación de muelle.
 */

export const OPERATIONAL_SESSION_KIND = Object.freeze({
  LOAD: "load",
  UNLOAD: "unload",
  PICKUP: "pickup",
  TRANSFER: "transfer",
  INVENTORY: "inventory",
  INSPECTION: "inspection",
  SEAL: "seal",
  UNSEAL: "unseal",
  UNSPECIFIED: "unspecified",
});

/** Mapeo legacy tipo_previsto → session kind. */
export const LEGACY_TIPO_PREVISTO_TO_KIND = Object.freeze({
  carga: OPERATIONAL_SESSION_KIND.LOAD,
  descarga: OPERATIONAL_SESSION_KIND.UNLOAD,
  carga_descarga: OPERATIONAL_SESSION_KIND.TRANSFER,
  retorno: OPERATIONAL_SESSION_KIND.PICKUP,
  devolucion: OPERATIONAL_SESSION_KIND.UNLOAD,
  indefinido: OPERATIONAL_SESSION_KIND.UNSPECIFIED,
});

/**
 * @param {string|null|undefined} legacyTipoPrevisto
 * @returns {string}
 */
export function mapLegacyTipoPrevistoToSessionKind(legacyTipoPrevisto) {
  const key = String(legacyTipoPrevisto || "").toLowerCase();
  return LEGACY_TIPO_PREVISTO_TO_KIND[key] || OPERATIONAL_SESSION_KIND.UNSPECIFIED;
}
