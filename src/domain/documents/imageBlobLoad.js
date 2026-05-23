/**
 * Carga remota de imágenes para PDF / canvas.
 * fetch() a signed URLs de Supabase a veces falla (CORS); <img> suele funcionar.
 */

function loadViaImageElement(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error("Timeout cargando imagen"));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        reject(new Error("Imagen sin dimensiones"));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob vacío"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("No se pudo cargar la imagen"));
    };
    img.src = url;
  });
}

/** @returns {Promise<Blob>} */
export async function loadRemoteImageBlob(url) {
  if (!url || typeof url !== "string") {
    throw new Error("URL vacía");
  }
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    return res.blob();
  }
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
    if (res.ok) {
      const blob = await res.blob();
      if (blob?.size > 0 && String(blob.type || "").startsWith("image/")) {
        return blob;
      }
    }
  } catch {
    /* fallback img */
  }
  return loadViaImageElement(url);
}

/** Decodifica File/Blob a drawable con orientación EXIF en iOS cuando el navegador lo soporta. */
export async function decodeImageFileForCanvas(file) {
  if (typeof createImageBitmap === "function" && file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { draw: bitmap, width: bitmap.width, height: bitmap.height, isBitmap: true };
    } catch {
      /* fallback */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Imagen no válida"));
      el.src = url;
    });
    return {
      draw: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      isBitmap: false,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function releaseDecodedImage(decoded) {
  if (decoded?.isBitmap && decoded.draw?.close) {
    try {
      decoded.draw.close();
    } catch {
      /* ignore */
    }
  }
}
