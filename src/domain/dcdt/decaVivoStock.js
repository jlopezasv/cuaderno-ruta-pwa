import {
  DECA_VIVO_MOVIMIENTO,
  DECA_VIVO_RESTA_TIPOS,
  DECA_VIVO_SUMA_TIPOS,
} from "./decaVivoConstants.js";

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Clave de línea de stock (descripción + categoría + unidad; Orden FOM/2861/2012). */
export function decaStockLineKey({
  descripcion_mercancia,
  categoria_mercancia,
  unidad,
}) {
  return [norm(descripcion_mercancia), norm(categoria_mercancia), norm(unidad)].join("|");
}

function emptyLine(key, mov) {
  return {
    line_key: key,
    descripcion_mercancia: mov.descripcion_mercancia,
    categoria_mercancia: mov.categoria_mercancia ?? null,
    unidad: mov.unidad ?? null,
    cantidad_actual: 0,
    peso_kg_actual: null,
    origen_trazable: mov.origen_nombre ?? mov.origen_trazable ?? null,
    destino_previsto: mov.destino_nombre ?? mov.destino_previsto ?? null,
    ultimo_movimiento_id: mov.id ?? null,
  };
}

/**
 * Recalcula inventario a bordo desde movimientos ordenados cronológicamente.
 * Espejo de deca_recalcular_stock_internal (PostgreSQL).
 *
 * @param {Array<object>} movimientos
 * @returns {Array<object>} líneas con cantidad > 0 o peso > 0
 */
export function recalcularStockDesdeMovimientos(movimientos) {
  const sorted = [...(movimientos || [])].sort((a, b) => {
    const ta = new Date(a.fecha_hora || a.created_at || 0).getTime();
    const tb = new Date(b.fecha_hora || b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  const map = new Map();

  for (const mov of sorted) {
    const tipo = String(mov.tipo_movimiento || "").toUpperCase();
    const key = decaStockLineKey(mov);
    const line = map.get(key) || emptyLine(key, mov);

    let deltaQty = 0;
    let deltaPeso = null;

    if (tipo === DECA_VIVO_MOVIMIENTO.AJUSTE_MANUAL) {
      deltaQty = Number(mov.cantidad) || 0;
      deltaPeso = mov.peso_kg != null ? Number(mov.peso_kg) : null;
    } else if (DECA_VIVO_SUMA_TIPOS.has(tipo)) {
      deltaQty = Number(mov.cantidad) || 0;
      deltaPeso = mov.peso_kg != null ? Number(mov.peso_kg) : null;
    } else if (DECA_VIVO_RESTA_TIPOS.has(tipo)) {
      deltaQty = -(Number(mov.cantidad) || 0);
      deltaPeso = mov.peso_kg != null ? -Number(mov.peso_kg) : null;
    } else {
      continue;
    }

    line.cantidad_actual = (Number(line.cantidad_actual) || 0) + deltaQty;
    if (deltaPeso != null) {
      line.peso_kg_actual =
        line.peso_kg_actual == null
          ? deltaPeso
          : Number(line.peso_kg_actual) + deltaPeso;
    }
    if (mov.destino_nombre) line.destino_previsto = mov.destino_nombre;
    if (mov.origen_nombre) line.origen_trazable = mov.origen_nombre;
    line.ultimo_movimiento_id = mov.id ?? line.ultimo_movimiento_id;
    map.set(key, line);
  }

  return [...map.values()].filter(
    (l) =>
      (Number(l.cantidad_actual) || 0) > 0 ||
      (l.peso_kg_actual != null && Number(l.peso_kg_actual) > 0),
  );
}

/**
 * Valida un movimiento antes de persistir (reglas de negocio DeCA vivo).
 * @returns {{ ok: boolean, error?: string }}
 */
export function validarMovimientoDeCaVivo(payload, stockActual = []) {
  const desc = String(payload?.descripcion_mercancia ?? "").trim();
  if (!desc) return { ok: false, error: "Indique la mercancía o elemento." };

  const tipo = String(payload?.tipo_movimiento ?? "").toUpperCase();
  if (!tipo) return { ok: false, error: "Seleccione el tipo de movimiento." };

  const qty = payload?.cantidad != null && payload.cantidad !== "" ? Number(payload.cantidad) : null;
  const unidad = String(payload?.unidad ?? "").trim();
  const peso = payload?.peso_kg != null && payload.peso_kg !== "" ? Number(payload.peso_kg) : null;

  if (peso == null && (qty == null || !unidad)) {
    return { ok: false, error: "Indique peso (kg) o cantidad con unidad." };
  }

  if (tipo === DECA_VIVO_MOVIMIENTO.AJUSTE_MANUAL && !String(payload?.motivo_ajuste ?? "").trim()) {
    return { ok: false, error: "El ajuste manual requiere motivo." };
  }

  if (tipo === DECA_VIVO_MOVIMIENTO.DEVOLUCION) {
    if (!String(payload?.origen_nombre ?? "").trim()) {
      return { ok: false, error: "Indique el origen de la devolución." };
    }
    if (!String(payload?.destino_nombre ?? "").trim()) {
      return { ok: false, error: "Indique el destino de la devolución." };
    }
  }

  if (
    [DECA_VIVO_MOVIMIENTO.CARGA_RETORNO, DECA_VIVO_MOVIMIENTO.RECOGIDA_ENVASES].includes(tipo) &&
    !String(payload?.destino_nombre ?? "").trim()
  ) {
    return { ok: false, error: "Indique el destino previsto del retorno/envases." };
  }

  if (DECA_VIVO_RESTA_TIPOS.has(tipo) && qty != null) {
    const key = decaStockLineKey(payload);
    const line = (stockActual || []).find(
      (s) => decaStockLineKey(s) === key || s.line_key === key,
    );
    const disponible = Number(line?.cantidad_actual) || 0;
    if (qty > disponible) {
      return {
        ok: false,
        error: `Cantidad (${qty}) supera lo a bordo (${disponible}). Use ajuste manual si procede.`,
      };
    }
  }

  return { ok: true };
}

/** Formato legible de línea de stock para UI / PDF. */
export function formatStockLineLabel(line) {
  const parts = [line.descripcion_mercancia];
  if (line.categoria_mercancia) parts[0] = `${line.categoria_mercancia}: ${parts[0]}`;
  const qty = line.cantidad_actual != null ? `${line.cantidad_actual} ${line.unidad || "ud."}` : "";
  const peso =
    line.peso_kg_actual != null ? `${Number(line.peso_kg_actual).toLocaleString("es-ES")} kg` : "";
  const magnitud = [qty, peso].filter(Boolean).join(" / ");
  const dest = line.destino_previsto ? ` — destino ${line.destino_previsto}` : "";
  return `${parts[0]}${magnitud ? `: ${magnitud}` : ""}${dest}`;
}
