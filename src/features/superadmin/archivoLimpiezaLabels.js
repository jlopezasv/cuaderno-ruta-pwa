import { RETENTION_STATE, RETENTION_TIER } from "../../domain/retention/retentionConstants.js";

/** Textos de interfaz — lenguaje operativo (no técnico). */

export const ARCHIVO_LIMPIEZA = Object.freeze({
  menu: "Archivo y limpieza",
  titulo: "Archivo y limpieza de datos",
  subtitulo:
    "Consulta qué información se conservará, archivará o podrá eliminarse en el futuro. Actualmente no se realiza ningún borrado automático.",
  modoSeguro: "Modo seguro: no se elimina ningún dato",
  borradoAutomatico: "Borrado automático",
  desactivado: "DESACTIVADO",
  activado: "ACTIVADO",
  simular: "Simular limpieza",
  simulando: "Calculando…",
  simulacionAyuda:
    "La simulación no borra ningún dato. Solo muestra qué información podría archivarse o eliminarse según las políticas configuradas.",
  datosActivos: "Datos activos",
  datosArchivables: "Datos archivables",
  datosEliminables: "Datos eliminables",
  espacioRecuperable: "Espacio recuperable estimado",
});

export const ESTADO_UI = Object.freeze({
  [RETENTION_STATE.ACTIVO]: "En uso",
  [RETENTION_STATE.ARCHIVADO]: "En archivo",
  [RETENTION_STATE.BORRABLE]: "Eliminable",
});

export const TRATAMIENTO_UI = Object.freeze({
  [RETENTION_TIER.RETENIDO]: "Conservación permanente",
  [RETENTION_TIER.ARCHIVABLE]: "Archivable",
  [RETENTION_TIER.ELIMINABLE]: "Eliminable",
});

export function etiquetaEstado(estado) {
  return ESTADO_UI[estado] || estado;
}

export function etiquetaTratamiento(tier) {
  return TRATAMIENTO_UI[tier] || tier;
}
