import { resolveEvidenciaPdfEmbedUrl } from "../../domain/documents/operationalDocumentRecord.js";

function categoriaFromEv(ev) {
  if (ev.isPod) return "pod";
  if (ev.tipo === "cmr") return "cmr";
  if (ev.tipo === "foto") return "foto";
  return "documento";
}

/**
 * Lista plana de evidencias visuales para PDF (agrupables por parada).
 * Futuro multi-conductor: añadir `tramo_id` / `conductor_id` por ítem sin cambiar UI v1.
 */
export function collectLiteAnnexItems(doc) {
  if (!doc) return [];
  const items = [];

  for (const parada of doc.paradas || []) {
    for (const ev of parada.documentos || []) {
      const url = resolveEvidenciaPdfEmbedUrl(ev) || ev.url;
      if (!url) continue;
      items.push({
        id: ev.id,
        paradaId: parada.id,
        paradaLabel: parada.label,
        paradaTipo: parada.tipo,
        paradaUbicacion: parada.ubicacion,
        categoria: categoriaFromEv(ev),
        titulo: ev.titulo || ev.tipo,
        detalle: ev.detalle || "",
        hora: ev.hora || "—",
        url,
        raw: ev,
      });
    }
  }

  for (const inc of doc.documentos?.incidencias || []) {
    for (const foto of inc.fotos || []) {
      const url = resolveEvidenciaPdfEmbedUrl(foto) || foto.url;
      if (!url) continue;
      items.push({
        id: foto.id || `inc-${inc.id}-${items.length}`,
        paradaId: inc.stopId,
        paradaLabel: inc.stopId ? null : "Incidencia general",
        paradaTipo: "incidencia",
        paradaUbicacion: inc.titulo,
        categoria: "incidencia",
        titulo: inc.titulo,
        detalle: inc.descripcion || "",
        hora: foto.hora || inc.fechaLabel || "—",
        url,
        raw: foto,
      });
    }
  }

  for (const extra of doc.documentos?.extras || []) {
    const url = resolveEvidenciaPdfEmbedUrl(extra) || extra.url;
    if (!url) continue;
    const mime = String(extra.raw?.mime_type || extra.mime_type || "").toLowerCase();
    const name = String(extra.raw?.archivo_nombre || "").toLowerCase();
    const isImage =
      extra.tipo === "foto" ||
      extra.tipo === "cmr" ||
      mime.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp)(\?|$)/i.test(name);
    if (!isImage) continue;
    items.push({
      id: extra.id,
      paradaId: null,
      paradaLabel: "Documentos del servicio",
      paradaTipo: "extra",
      paradaUbicacion: extra.titulo,
      categoria: extra.tipo === "cmr" ? "cmr" : "documento",
      titulo: extra.titulo,
      detalle: extra.detalle || "",
      hora: extra.hora || "—",
      url,
      raw: extra,
    });
  }

  return items;
}

export function groupAnnexByParada(items) {
  const groups = [];
  const map = new Map();
  for (const item of items) {
    const key = item.paradaId || item.paradaLabel || "general";
    if (!map.has(key)) {
      const g = {
        key,
        label: item.paradaLabel || "General",
        tipo: item.paradaTipo,
        ubicacion: item.paradaUbicacion,
        items: [],
      };
      map.set(key, g);
      groups.push(g);
    }
    map.get(key).items.push(item);
  }
  return groups;
}
