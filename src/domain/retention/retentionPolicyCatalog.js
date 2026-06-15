import { RETENTION_TIER } from "./retentionConstants.js";
import { DECA_SHORT_LABEL } from "../dcdt/decaBranding.js";

/**
 * Catálogo canónico de clases de dato (alineado con retention_asset_catalog en SQL).
 * Solo documentación + defaults de UI; la fuente de verdad en runtime es Supabase.
 */
export const RETENTION_ASSET_CATALOG = Object.freeze([
  {
    asset_class: "servicio_metadata",
    label: "Metadatos de servicio / expediente",
    tier: RETENTION_TIER.RETENIDO,
    includes: "Referencia, cliente, fechas, estados, asignaciones",
    storage: false,
    notes: "Nunca eliminable automáticamente.",
  },
  {
    asset_class: "documentacion_envios",
    label: "Log envíos documentación (email)",
    tier: RETENTION_TIER.RETENIDO,
    includes: "destinatarios, asunto, provider, adjuntos meta",
    storage: false,
    notes: "Auditoría legal de comunicaciones.",
  },
  {
    asset_class: "evidencia_cmr_ocr",
    label: "CMR + datos OCR",
    tier: RETENTION_TIER.RETENIDO,
    includes: "evidencias.tipo=cmr, datos JSON OCR",
    storage: true,
    notes: "Mínimo 2 años recomendado; imagen + texto estructurado.",
  },
  {
    asset_class: "evidencia_foto",
    label: "Fotos operativas (parada)",
    tier: RETENTION_TIER.ARCHIVABLE,
    includes: "evidencias.tipo=foto, preview/original en storage",
    storage: true,
    notes: "Archivable tras cierre de servicio; borrable solo tras período en frío.",
  },
  {
    asset_class: "evidencia_pdf",
    label: "PDF operativo (parada / extra)",
    tier: RETENTION_TIER.ARCHIVABLE,
    includes: "PDF en user-photos, servicio_documentos_extra",
    storage: true,
    notes: "Mismo ciclo que fotos.",
  },
  {
    asset_class: "servicio_documentos_extra",
    label: "Documentos extra del viaje",
    tier: RETENTION_TIER.ARCHIVABLE,
    includes: "servicio_documentos_extra + storage",
    storage: true,
    notes: "Expediente ampliado no ligado a parada.",
  },
  {
    asset_class: "dcdt_pdf",
    label: `PDF ${DECA_SHORT_LABEL} (documento legal)`,
    tier: RETENTION_TIER.RETENIDO,
    includes: "servicio_documentos_extra.tipo=dcdt + storage",
    storage: true,
    notes: "Conservación mínima 365 días; no purgar antes de retention_until.",
  },
  {
    asset_class: "servicio_documentos_empresa",
    label: "Documentos empresa del servicio",
    tier: RETENTION_TIER.ARCHIVABLE,
    includes: "servicio_documentos_empresa",
    storage: true,
    notes: "Panel empresa / compliance.",
  },
  {
    asset_class: "gps_ubicacion_viva",
    label: "GPS vivo (última posición)",
    tier: RETENTION_TIER.RETENIDO,
    includes: "ubicaciones (UPSERT conductor)",
    storage: false,
    notes: "Solo posición actual; no histórico denso.",
  },
  {
    asset_class: "gps_trazas_historicas",
    label: "Trazas / histórico GPS denso",
    tier: RETENTION_TIER.ELIMINABLE,
    includes: "Futuro: series temporales si se activan",
    storage: false,
    notes: "Reservado; hoy volumen bajo en ubicaciones.",
  },
  {
    asset_class: "incidencia_nota",
    label: "Incidencias y notas (sin archivo)",
    tier: RETENTION_TIER.RETENIDO,
    includes: "evidencias incidencia/nota, incidencias tabla",
    storage: false,
    notes: "Texto ligero; retención larga.",
  },
  {
    asset_class: "perfil_foto",
    label: "Foto de perfil conductor",
    tier: RETENTION_TIER.ARCHIVABLE,
    includes: "user-photos perfil",
    storage: true,
    notes: "Archivable si perfil is_archived.",
  },
]);

export function catalogByClass(assetClass) {
  return RETENTION_ASSET_CATALOG.find((c) => c.asset_class === assetClass) || null;
}

export function catalogByTier(tier) {
  return RETENTION_ASSET_CATALOG.filter((c) => c.tier === tier);
}
