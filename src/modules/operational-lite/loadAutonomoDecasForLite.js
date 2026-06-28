import { fetchAutonomoDecaById } from "../../domain/dcdt/decaAutonomoModel.js";
import { buildDecaDownloadUrl } from "../../domain/dcdt/decaUrl.js";
import { getAutonomoExpedienteMeta, getExpedienteDecaLinks } from "../autonomo-expediente/autonomoExpedienteMeta.js";

/**
 * DeCA autónomo vinculados al expediente, ordenados por parada de carga.
 */
export async function loadAutonomoDecasForLite(servicio, stops = []) {
  const meta = getAutonomoExpedienteMeta(servicio);
  const links = getExpedienteDecaLinks(servicio);
  if (!links.length && !meta?.startedAt) return [];

  const ordenByStop = Object.fromEntries(stops.map((s) => [s.id, Number(s.orden) || 0]));

  const rows = await Promise.all(
    links.map(async (link) => {
      const deca = link.deca_id ? await fetchAutonomoDecaById(link.deca_id) : null;
      const publicId = deca?.decaPublicId || link.deca_public_id || null;
      const downloadUrl =
        deca?.datos?.deca_download_url ||
        link.download_url ||
        (publicId ? buildDecaDownloadUrl(publicId, { allowBrowserOriginFallback: true }) : null);
      return {
        cargaStopId: link.carga_stop_id,
        orden: ordenByStop[link.carga_stop_id] ?? 999,
        cargaNombre: link.carga_nombre || link.origen || "Carga",
        origen: link.origen || "—",
        destino: link.destino || "—",
        label: `${link.origen || link.carga_nombre || "—"} → ${link.destino || "—"}`,
        publicId,
        downloadUrl,
        deca,
        link,
      };
    }),
  );

  return rows.sort((a, b) => a.orden - b.orden);
}
