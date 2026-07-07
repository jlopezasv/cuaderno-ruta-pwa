/**
 * Deriva origen/destino legibles desde líneas de obligación (Planning BC).
 *
 * @param {import('../types/transportObligation.types.js').TransportObligationLine[]} lines
 * @returns {{ origen: string, destino: string }}
 */
export function obligationRouteFromLines(lines) {
  const first = Array.isArray(lines) && lines.length ? lines[0] : null;
  if (!first) {
    return { origen: "Origen", destino: "Destino" };
  }
  const origen =
    String(first.originLocationRef || first.description || "Origen").trim() || "Origen";
  const destino =
    String(first.destinationLocationRef || "Destino").trim() || "Destino";
  return { origen, destino };
}
