import { SB_KEY, SB_URL, getUserId } from "./supabaseClient";

/** Firmas cortas; evitar URLs públicas permanentes para CMR/fotos/PDF. */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 días
const SIGNED_URL_FALLBACK_SEC = 60 * 60 * 24; // 1 día (reintento)

function fileToBase64(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.readAsDataURL(blob);
  });
}

function compressImage(file, maxWidth = 800, quality = 0.72) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function extFromMime(mime, originalName) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (originalName && String(originalName).toLowerCase().endsWith(".pdf")) return "pdf";
  return "jpg";
}

async function uploadBlobToUserPhotos(blob, mime, folder, originalName) {
  const uid = getUserId() || "anon";
  const ext = extFromMime(mime, originalName);
  const name = `${uid}/${folder}/${Date.now()}.${ext}`;

  try {
    const session = JSON.parse(localStorage.getItem("sb_session") || "null");
    const token = session?.access_token || SB_KEY;
    const res = await fetch(`${SB_URL}/storage/v1/object/user-photos/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SB_KEY,
        "Content-Type": mime || "application/octet-stream",
        "x-upsert": "true",
      },
      body: blob,
    });
    if (res.ok) {
      const signOnce = (expiresIn) =>
        fetch(`${SB_URL}/storage/v1/object/sign/user-photos/${name}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SB_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expiresIn }),
        });
      let signRes = await signOnce(SIGNED_URL_TTL_SEC);
      if (!signRes.ok) signRes = await signOnce(SIGNED_URL_FALLBACK_SEC);
      if (signRes.ok) {
        const sd = await signRes.json();
        return `${SB_URL}/storage/v1${sd.signedURL}`;
      }
      console.warn("Storage: no se pudo firmar URL; se evita URL /public permanente.");
    }
  } catch (e) {
    console.warn("Storage upload failed, using base64:", e.message);
  }
  return fileToBase64(blob);
}

/** Sube imagen comprimida a `user-photos` en Supabase Storage. */
export async function uploadUserPhoto(file, folder = "misc") {
  const compressed = await compressImage(file, 800, 0.72);
  return uploadBlobToUserPhotos(compressed, file.type || "image/jpeg", folder, file.name);
}

/** Imagen (comprimida) o PDF (binario) en `user-photos`. */
export async function uploadUserFile(file, folder = "misc") {
  if (!file) throw new Error("Sin archivo");
  if (String(file.type || "").includes("pdf") || String(file.name || "").toLowerCase().endsWith(".pdf")) {
    return uploadBlobToUserPhotos(file, file.type || "application/pdf", folder, file.name);
  }
  return uploadUserPhoto(file, folder);
}
