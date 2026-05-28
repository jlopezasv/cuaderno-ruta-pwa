/**
 * Fase 1 — metadata storage v2 (paths + bucket + expiry).
 * Sin re-sign ni cambios de lectura UI/PDF.
 */

import { isOperationalDocTraceEnabled, traceOperationalDoc } from "./operationalDocumentTrace.js";

/** Bucket operativo canónico (fase 1). */
export const DEFAULT_OPERATIVE_BUCKET = "user-photos";

/** @typedef {{ url: string, bucket: string|null, path: string|null, signedExpiresAt: string|null }} StorageUploadResult */

/**
 * URL utilizable desde resultado de upload (compat string legacy).
 * @param {string|StorageUploadResult|null|undefined} result
 */
export function storageUploadUrl(result) {
  if (result == null) return null;
  if (typeof result === "string") return result;
  return result.url ?? null;
}

/**
 * @param {number} expiresInSec
 * @returns {string}
 */
export function signedExpiresAtFromTtl(expiresInSec) {
  const sec = Number(expiresInSec);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Date(Date.now() + sec * 1000).toISOString();
}

/**
 * @param {{ url: string, bucket?: string, path?: string, signedExpiresInSec?: number, signedExpiresAt?: string|null }} p
 * @returns {StorageUploadResult}
 */
export function buildStorageUploadResult({ url, bucket, path, signedExpiresInSec, signedExpiresAt }) {
  const expires =
    signedExpiresAt ??
    (signedExpiresInSec != null ? signedExpiresAtFromTtl(signedExpiresInSec) : null);
  return {
    url: url ?? "",
    bucket: bucket ?? null,
    path: path ?? null,
    signedExpiresAt: expires,
  };
}

/** Fallback data: URL sin objeto en storage. */
export function buildDataUrlStorageResult(dataUrl) {
  return buildStorageUploadResult({ url: dataUrl, bucket: null, path: null, signedExpiresAt: null });
}

/**
 * Campos v2 para doc_meta (schema_version 2).
 * @param {{ storagePreview?: StorageUploadResult|null, storageOriginal?: StorageUploadResult|null }} storage
 */
export function docMetaV2StorageFields({ storagePreview = null, storageOriginal = null } = {}) {
  const preview = storagePreview && typeof storagePreview === "object" ? storagePreview : null;
  const original = storageOriginal && typeof storageOriginal === "object" ? storageOriginal : null;
  return {
    bucket: preview?.bucket ?? original?.bucket ?? DEFAULT_OPERATIVE_BUCKET,
    path_preview: preview?.path ?? null,
    path_original: original?.path ?? null,
    signed_expires_at: preview?.signedExpiresAt ?? original?.signedExpiresAt ?? null,
  };
}

/** Log [MEDIA_V2] en consola + buffer docTrace si activo. */
export function traceMediaV2(step, payload = {}) {
  const entry = { step, ...payload };
  if (isOperationalDocTraceEnabled()) {
    traceOperationalDoc(`[MEDIA_V2] ${step}`, entry);
  }
}

/** Trazar doc_meta v2 tras persistencia. */
export function traceMediaV2DocMeta(docMeta, context = {}) {
  if (!docMeta || docMeta.schema_version !== 2) return;
  traceMediaV2("doc_meta_persisted", {
    ...context,
    schema_version: docMeta.schema_version,
    bucket: docMeta.bucket ?? null,
    path_preview: docMeta.path_preview ?? null,
    path_original: docMeta.path_original ?? null,
    signed_expires_at: docMeta.signed_expires_at ?? null,
    preview_url: docMeta.preview_url ?? null,
    original_url: docMeta.original_url ?? null,
  });
}
