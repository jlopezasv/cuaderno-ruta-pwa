import { SB_KEY, SB_URL, getUserId } from "./supabaseClient";
import {
  isHttpStorageUrl,
  logStorageDoc,
  logStorageDocFail,
} from "../domain/documents/storageDocumentUploadLog.js";
import {
  buildDataUrlStorageResult,
  buildStorageUploadResult,
  DEFAULT_OPERATIVE_BUCKET,
  storageUploadUrl,
  traceMediaV2,
} from "../domain/documents/mediaStorageV2.js";
import {
  decodeImageFileForCanvas,
  releaseDecodedImage,
} from "../domain/documents/imageBlobLoad.js";
import {
  isOperationalDocTraceEnabled,
  traceBlobColor,
  traceOperationalDoc,
} from "../domain/documents/operationalDocumentTrace.js";

/** Firmas cortas; evitar URLs públicas permanentes para CMR/fotos/PDF. */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 días
const SIGNED_URL_FALLBACK_SEC = 60 * 60 * 24; // 1 día (reintento)
export const USER_PHOTOS_BUCKET = DEFAULT_OPERATIVE_BUCKET;

const STORAGE_URL_ERROR = "Error generando URL del documento";

function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      reject(new Error("Blob vacío para base64"));
      return;
    }
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = () => reject(new Error("FileReader falló"));
    r.readAsDataURL(blob);
  });
}

function blobByteSize(blob) {
  if (!blob) return 0;
  if (typeof blob.size === "number") return blob.size;
  return 0;
}

function describeFileInput(file) {
  if (!file) return { valid: false, reason: "sin_file" };
  return {
    valid: true,
    name: file.name ?? null,
    size: file.size ?? null,
    mime: file.type ?? null,
    isFile: typeof File !== "undefined" && file instanceof File,
    isBlob: typeof Blob !== "undefined" && file instanceof Blob,
    lastModified: file.lastModified ?? null,
  };
}

function extFromMime(mime, originalName) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic") || m.includes("heif")) return "heic";
  if (originalName) {
    const lower = String(originalName).toLowerCase();
    if (lower.endsWith(".pdf")) return "pdf";
    const match = lower.match(/\.([a-z0-9]{2,5})$/);
    if (match) return match[1];
  }
  return "jpg";
}

function parseStorageJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function signedUrlFromSignBody(sd) {
  if (!sd || typeof sd !== "object") return null;
  const path = sd.signedURL ?? sd.signedUrl ?? null;
  if (!path || typeof path !== "string") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SB_URL}/storage/v1${path.startsWith("/") ? path : `/${path}`}`;
}

async function readResponseBody(res) {
  const text = await res.text();
  return { text, json: parseStorageJson(text), status: res.status, ok: res.ok };
}

function getStorageToken() {
  try {
    const session = JSON.parse(localStorage.getItem("sb_session") || "null");
    return session?.access_token || SB_KEY;
  } catch {
    return SB_KEY;
  }
}

/**
 * @param {Blob} blob
 * @param {string} mime
 * @param {string} folder
 * @param {string} [originalName]
 * @param {{ requireHttpUrl?: boolean, allowBase64Fallback?: boolean }} [options]
 * @returns {Promise<import("../domain/documents/mediaStorageV2.js").StorageUploadResult>}
 */
export async function uploadBlobToStorage(blob, mime, folder, originalName, options = {}) {
  const { requireHttpUrl = false, allowBase64Fallback = !requireHttpUrl } = options;
  const uid = getUserId() || "anon";
  const ext = extFromMime(mime, originalName);
  const objectPath = `${uid}/${folder}/${Date.now()}.${ext}`;
  const bucket = USER_PHOTOS_BUCKET;
  const sizeBytes = blobByteSize(blob);

  if (isOperationalDocTraceEnabled()) {
    traceOperationalDoc("uploadBlobToStorage:start", {
      bucket,
      path: objectPath,
      mime: mime || null,
      sizeBytes,
      folder,
    });
    if (blob && String(mime || "").startsWith("image/")) {
      await traceBlobColor("uploadBlobToStorage:input", blob, { path: objectPath, folder });
    }
  }

  logStorageDoc("DOCUMENT_STORAGE_START", {
    bucket,
    path: objectPath,
    mime: mime || null,
    sizeBytes,
    folder,
    uid,
    requireHttpUrl,
    allowBase64Fallback,
  });
  logStorageDoc("DOCUMENT_STORAGE_BUCKET", { bucket, publicHint: "RLS — requiere sign" });
  logStorageDoc("DOCUMENT_STORAGE_PATH", { path: objectPath, ext, originalName: originalName || null });

  if (!blob || sizeBytes <= 0) {
    logStorageDocFail("DOCUMENT_STORAGE_UPLOAD_FAIL", new Error("Blob inválido o vacío"), {
      bucket,
      path: objectPath,
      sizeBytes,
      mime,
    });
    if (requireHttpUrl) throw new Error(STORAGE_URL_ERROR);
    if (!allowBase64Fallback) throw new Error(STORAGE_URL_ERROR);
    return buildDataUrlStorageResult(await fileToBase64(blob));
  }

  const token = getStorageToken();
  const uploadUrl = `${SB_URL}/storage/v1/object/${bucket}/${objectPath}`;

  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SB_KEY,
        "Content-Type": mime || "application/octet-stream",
        "x-upsert": "true",
      },
      body: blob,
    });
    const uploadBody = await readResponseBody(res);

    if (!res.ok) {
      logStorageDocFail("DOCUMENT_STORAGE_UPLOAD_FAIL", new Error(`HTTP ${res.status}`), {
        bucket,
        path: objectPath,
        status: res.status,
        supabaseResponse: uploadBody.json ?? uploadBody.text,
      });
      if (requireHttpUrl || !allowBase64Fallback) throw new Error(STORAGE_URL_ERROR);
      logStorageDoc("DOCUMENT_STORAGE_FINAL_URL", { kind: "base64_fallback_after_upload_fail" });
      return buildDataUrlStorageResult(await fileToBase64(blob));
    }

    logStorageDoc("DOCUMENT_STORAGE_UPLOAD_OK", {
      bucket,
      path: objectPath,
      status: res.status,
      supabaseResponse: uploadBody.json ?? uploadBody.text,
    });

    const signOnce = async (expiresIn) => {
      const signRes = await fetch(`${SB_URL}/storage/v1/object/sign/${bucket}/${objectPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SB_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn }),
      });
      const signBody = await readResponseBody(signRes);
      return { signRes, signBody };
    };

    let signExpiresIn = SIGNED_URL_TTL_SEC;
    let { signRes, signBody } = await signOnce(SIGNED_URL_TTL_SEC);
    if (!signRes.ok) {
      logStorageDocFail("DOCUMENT_STORAGE_SIGNED_URL_FAIL", new Error(`HTTP ${signRes.status}`), {
        bucket,
        path: objectPath,
        expiresIn: SIGNED_URL_TTL_SEC,
        supabaseResponse: signBody.json ?? signBody.text,
      });
      signExpiresIn = SIGNED_URL_FALLBACK_SEC;
      ({ signRes, signBody } = await signOnce(SIGNED_URL_FALLBACK_SEC));
    }

    if (signRes.ok) {
      const finalUrl = signedUrlFromSignBody(signBody.json);
      const expiresInUsed = Number(signBody.json?.expiresIn) || signExpiresIn;
      if (isHttpStorageUrl(finalUrl)) {
        const result = buildStorageUploadResult({
          url: finalUrl,
          bucket,
          path: objectPath,
          signedExpiresInSec: expiresInUsed,
        });
        logStorageDoc("DOCUMENT_STORAGE_SIGNED_URL_OK", {
          bucket,
          path: objectPath,
          signedUrl: finalUrl,
          expiresIn: expiresInUsed,
        });
        logStorageDoc("DOCUMENT_STORAGE_FINAL_URL", {
          url: finalUrl,
          urlLength: finalUrl.length,
        });
        traceMediaV2("upload_complete", {
          bucket: result.bucket,
          path_preview: result.path,
          path_original: null,
          signed_expires_at: result.signedExpiresAt,
          folder,
        });
        if (isOperationalDocTraceEnabled()) {
          traceOperationalDoc("uploadBlobToStorage:final_url", {
            path: objectPath,
            folder,
            mime,
            sizeBytes,
            signedUrl: finalUrl,
            signed_expires_at: result.signedExpiresAt,
          });
        }
        return result;
      }
      logStorageDocFail("DOCUMENT_STORAGE_SIGNED_URL_FAIL", new Error("Respuesta sign sin URL"), {
        bucket,
        path: objectPath,
        supabaseResponse: signBody.json ?? signBody.text,
      });
    } else {
      logStorageDocFail("DOCUMENT_STORAGE_SIGNED_URL_FAIL", new Error(`HTTP ${signRes.status}`), {
        bucket,
        path: objectPath,
        expiresIn: SIGNED_URL_FALLBACK_SEC,
        supabaseResponse: signBody.json ?? signBody.text,
      });
    }

    console.warn(
      "[DOCUMENT_STORAGE] Upload OK pero sign falló; objeto en bucket sin URL HTTP.",
      { bucket, path: objectPath },
    );
  } catch (e) {
    logStorageDocFail("DOCUMENT_STORAGE_UPLOAD_FAIL", e, { bucket, path: objectPath });
    if (requireHttpUrl || !allowBase64Fallback) throw new Error(STORAGE_URL_ERROR);
    console.warn("Storage upload failed, using base64:", e.message);
  }

  if (requireHttpUrl || !allowBase64Fallback) {
    logStorageDocFail("DOCUMENT_STORAGE_FINAL_URL", new Error("Sin URL HTTP"), {
      bucket,
      path: objectPath,
    });
    throw new Error(STORAGE_URL_ERROR);
  }

  const dataUrl = await fileToBase64(blob);
  logStorageDoc("DOCUMENT_STORAGE_FINAL_URL", {
    kind: "data_url_fallback",
    urlLength: dataUrl ? String(dataUrl).length : 0,
    startsWithData: String(dataUrl || "").startsWith("data:"),
  });
  traceMediaV2("upload_data_url_fallback", {
    bucket: null,
    path_preview: objectPath,
    path_original: null,
    signed_expires_at: null,
    folder,
  });
  return buildDataUrlStorageResult(dataUrl);
}

/**
 * JPEG con createImageBitmap (orientación EXIF) u objectURL — evita FileReader+dataURL en iOS (B/N).
 */
export async function compressImageToJpegBlob(file, maxWidth = 800, quality = 0.72) {
  const traceOn = isOperationalDocTraceEnabled();
  if (traceOn) {
    traceOperationalDoc("compressImage:enter", {
      fn: "compressImageToJpegBlob",
      pipeline: "imageBitmap_or_objectUrl",
      maxWidth,
      quality,
      fileName: file?.name,
      fileMime: file?.type,
      fileSize: file?.size,
    });
  }

  const decoded = await decodeImageFileForCanvas(file);
  try {
    let w = decoded.width;
    let h = decoded.height;
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(decoded.draw, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b && b.size > 0 ? resolve(b) : reject(new Error("Compresión devolvió blob vacío"))),
        "image/jpeg",
        quality,
      );
    });

    if (traceOn) {
      await traceBlobColor("compressImage:output", blob, { pipeline: "imageBitmap_or_objectUrl" });
    }
    return blob;
  } finally {
    releaseDecodedImage(decoded);
  }
}

/** Sube imagen comprimida a `user-photos`. Devuelve URL string (compat monolito). */
export async function uploadUserPhoto(file, folder = "misc", options = {}) {
  const compressed = await compressImageToJpegBlob(file, 800, 0.72);
  const result = await uploadBlobToStorage(compressed, file.type || "image/jpeg", folder, file.name, options);
  return storageUploadUrl(result);
}

/**
 * Imagen (comprimida) o PDF (binario) en `user-photos`.
 * @param {File} file
 * @param {string} [folder]
 * @param {{ requireHttpUrl?: boolean }} [options] — documentos extra: requireHttpUrl: true
 */
export async function uploadUserFile(file, folder = "misc", options = {}) {
  const fileInfo = describeFileInput(file);
  logStorageDoc("DOCUMENT_STORAGE_START", {
    phase: "uploadUserFile_input",
    folder,
    ...fileInfo,
  });

  if (!file || !fileInfo.valid) {
    logStorageDocFail("DOCUMENT_STORAGE_UPLOAD_FAIL", new Error("Sin archivo"), { folder });
    throw new Error("Sin archivo");
  }

  const isPdf =
    String(file.type || "").includes("pdf") || String(file.name || "").toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return uploadBlobToStorage(file, file.type || "application/pdf", folder, file.name, options);
  }
  return uploadUserPhoto(file, folder, options);
}

/** @deprecated alias */
export const uploadBlobToUserPhotos = uploadBlobToStorage;
