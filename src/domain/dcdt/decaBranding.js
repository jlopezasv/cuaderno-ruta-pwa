/**
 * Etiquetas visibles DeCA (UI, PDF, informes).
 * Los identificadores técnicos (tablas, rutas API, tipos) siguen siendo `dcdt`.
 */

export const DECA_SHORT_LABEL = "DeCA";

export const DECA_FULL_NAME = "Documento electrónico de Control Administrativo";

/** Encabezado canónico en modales, informes y PDF. */
export const DECA_FULL_TITLE = `${DECA_SHORT_LABEL} — ${DECA_FULL_NAME}`;

export const DECA_LEGAL_REF = "Orden FOM/2861/2012";

/** Referencias normativas ampliadas (DeCA electrónico 2026). */
export const DECA_LEGAL_REF_FULL =
  "Orden FOM/2861/2012 · Orden TRM/282/2026 · Resolución BOE-A-2026-12784";

export const DECA_TITLE_WITH_LEGAL = `${DECA_FULL_TITLE} · ${DECA_LEGAL_REF}`;

/** Botones compactos (iconos en tarjetas servicio). */
export const DECA_BTN_OK = `✓ ${DECA_SHORT_LABEL}`;
export const DECA_BTN_WARN = `⚠ ${DECA_SHORT_LABEL}`;
export const DECA_BTN_NONE = `— ${DECA_SHORT_LABEL}`;
