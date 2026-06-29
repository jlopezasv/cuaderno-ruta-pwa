import { getStopOperacionMeta } from "./stopOperacionMeta.js";
import { muelleEntradaLabel, muelleSalidaLabel } from "./muelleLabels.js";
import { getOperacionMuelleActiva } from "../../modules/autonomo-expediente/operacionMuelleModel.js";

function isRetornoStop(stop) {
  return getStopOperacionMeta(stop?.notas)?.es_retorno === true;
}

function getCargaEstadoFromMeta(stop) {
  const meta = getStopOperacionMeta(stop?.notas);
  const st = String(meta.carga_estado || "").toLowerCase();
  if (st === "completada") return "completada";
  if (st === "en_muelle") return "en_muelle";
  if (st === "pendiente_entrada") return "pendiente_entrada";
  if (meta.entrada_at && !meta.salida_at) return "en_muelle";
  return null;
}

function isCargaPendienteEntradaStop(stop) {
  return getCargaEstadoFromMeta(stop) === "pendiente_entrada";
}

function isCargaEnMuelleStop(stop) {
  return getCargaEstadoFromMeta(stop) === "en_muelle";
}

function isCargaTerminadaStop(stop) {
  return getCargaEstadoFromMeta(stop) === "completada";
}

function isDestinoEntregadoStop(stop) {
  return String(getStopOperacionMeta(stop?.notas)?.destino_estado || "").toLowerCase() === "entregado";
}

/** Tipos operativos visibles para el conductor. */
export const OPERATION_KIND = Object.freeze({
  CARGA: "carga",
  DESCARGA: "descarga",
  RETORNO: "retorno",
  DEVOLUCION: "devolucion",
  INCIDENCIA: "incidencia",
});

/** Tokens visuales — el conductor debe distinguir en 1 segundo. */
export const OPERATION_VISUAL = Object.freeze({
  [OPERATION_KIND.CARGA]: {
    label: "CARGA",
    icon: "↑",
    color: "#15803d",
    bg: "#dcfce7",
    border: "#86efac",
    btnBg: "#15803d",
  },
  [OPERATION_KIND.DESCARGA]: {
    label: "DESCARGA",
    icon: "↓",
    color: "#1d4ed8",
    bg: "#dbeafe",
    border: "#93c5fd",
    btnBg: "#1d4ed8",
  },
  [OPERATION_KIND.RETORNO]: {
    label: "RETORNO",
    icon: "↩",
    color: "#c2410c",
    bg: "#ffedd5",
    border: "#fdba74",
    btnBg: "#ea580c",
  },
  [OPERATION_KIND.DEVOLUCION]: {
    label: "DEVOLUCIÓN",
    icon: "⊘",
    color: "#6b21a8",
    bg: "#f3e8ff",
    border: "#d8b4fe",
    btnBg: "#7e22ce",
  },
  [OPERATION_KIND.INCIDENCIA]: {
    label: "INCIDENCIA",
    icon: "!",
    color: "#475569",
    bg: "#f1f5f9",
    border: "#cbd5e1",
    btnBg: "#475569",
  },
});

function stopTipo(stop) {
  return String(stop?.tipo || "").toLowerCase();
}

export function isOperacionAnulada(stop) {
  const st = String(getStopOperacionMeta(stop?.notas)?.operacion_estado || "").toLowerCase();
  return st === "anulada" || st === "cancelada";
}

/** Clasifica parada para UI (carga ida vs retorno vs descarga). */
export function classifyOperativeStop(stop) {
  if (!stop || isOperacionAnulada(stop)) return null;
  const meta = getStopOperacionMeta(stop?.notas);
  if (meta.es_devolucion === true) return OPERATION_KIND.DEVOLUCION;
  if (meta.es_retorno === true || isRetornoStop(stop)) return OPERATION_KIND.RETORNO;
  if (stopTipo(stop) === "descarga") return OPERATION_KIND.DESCARGA;
  if (stopTipo(stop) === "carga" || (stopTipo(stop).includes("carga") && !stopTipo(stop).includes("descarga"))) {
    return OPERATION_KIND.CARGA;
  }
  return OPERATION_KIND.INCIDENCIA;
}

export function visualForStop(stop) {
  const kind = classifyOperativeStop(stop) || OPERATION_KIND.INCIDENCIA;
  return { kind, ...OPERATION_VISUAL[kind] };
}

/** Separa cargas iniciales/principales de cargas de retorno. */
export function splitCargasByRole(cargas = []) {
  const cargasPrincipal = [];
  const cargasRetorno = [];
  for (const c of cargas) {
    if (isOperacionAnulada(c)) continue;
    if (isRetornoStop(c)) cargasRetorno.push(c);
    else cargasPrincipal.push(c);
  }
  return { cargasPrincipal, cargasRetorno };
}

function destinoPhase(stop) {
  const meta = getStopOperacionMeta(stop?.notas);
  if (isDestinoEntregadoStop(stop)) return "completada";
  if (meta.entrada_at && !meta.salida_at) return "en_muelle";
  return "pendiente";
}

function cargaPhase(stop) {
  if (isCargaTerminadaStop(stop)) return "completada";
  if (isCargaEnMuelleStop(stop)) return "en_muelle";
  if (isCargaPendienteEntradaStop(stop)) return "pendiente";
  return "pendiente";
}

/**
 * Próxima acción principal — regla de oro transporte real.
 * Operación muelle abierta > descargas ida > cargas > retorno acumulado.
 */
export function resolveProximaAccionPrincipal({ servicio = null, cargas = [], destinos = [], stockActual = [] } = {}) {
  const opMuelle = servicio ? getOperacionMuelleActiva(servicio) : null;
  if (opMuelle) {
    return {
      kind: "en_muelle",
      phase: "en_muelle",
      stop: null,
      operacionMuelle: opMuelle,
      title: "En muelle",
      subtitle: opMuelle.lugar_nombre,
      primaryLabel: "Salida de muelle",
      secondaryLabel: null,
      visual: OPERATION_VISUAL[OPERATION_KIND.CARGA],
    };
  }

  const destinosActivos = destinos.filter((d) => !isDestinoEntregadoStop(d) && !isOperacionAnulada(d));
  const { cargasPrincipal, cargasRetorno } = splitCargasByRole(cargas);

  // 1) Descarga pendiente del viaje principal
  if (destinosActivos.length) {
    const d = destinosActivos[0];
    const phase = destinoPhase(d);
    const vis = visualForStop(d);
    if (phase === "en_muelle") {
      return {
        kind: OPERATION_KIND.DESCARGA,
        phase,
        stop: d,
        title: `${vis.label} · ${d.nombre}`,
        subtitle: "En muelle — completar descarga",
        primaryLabel: muelleSalidaLabel(d),
        secondaryLabel: null,
        visual: vis,
      };
    }
    return {
      kind: OPERATION_KIND.DESCARGA,
      phase,
      stop: d,
      title: `${vis.label} · ${d.nombre}`,
      subtitle: "Pendiente descarga",
      primaryLabel: muelleEntradaLabel(d),
      secondaryLabel: null,
      visual: vis,
    };
  }

  // 2) Carga principal pendiente (no retorno)
  const cargaPrincipalPendiente = cargasPrincipal.find(
    (c) => isCargaPendienteEntradaStop(c) || isCargaEnMuelleStop(c),
  );
  if (cargaPrincipalPendiente) {
    const phase = cargaPhase(cargaPrincipalPendiente);
    const vis = visualForStop(cargaPrincipalPendiente);
    return {
      kind: OPERATION_KIND.CARGA,
      phase,
      stop: cargaPrincipalPendiente,
      title: `${vis.label} · ${cargaPrincipalPendiente.nombre}`,
      subtitle: phase === "en_muelle" ? "En muelle carga" : "Pendiente entrada muelle carga",
      primaryLabel: phase === "en_muelle" ? muelleSalidaLabel(cargaPrincipalPendiente) : muelleEntradaLabel(cargaPrincipalPendiente),
      secondaryLabel: null,
      visual: vis,
    };
  }

  // 3) Viaje principal cerrado — retorno acumulado como acción principal
  const hayIdaEnCamion = (stockActual || []).some((l) => isStockLineIda(l));
  if (!hayIdaEnCamion) {
    const retornoPendiente = cargasRetorno.find((c) => isCargaPendienteEntradaStop(c) || isCargaEnMuelleStop(c));
    if (retornoPendiente) {
      const phase = cargaPhase(retornoPendiente);
      const vis = visualForStop(retornoPendiente);
      return {
        kind: OPERATION_KIND.RETORNO,
        phase,
        stop: retornoPendiente,
        title: `${vis.label} · ${retornoPendiente.nombre}`,
        subtitle: phase === "en_muelle" ? "En muelle retorno" : "Pendiente recogida retorno",
        primaryLabel: phase === "en_muelle" ? muelleSalidaLabel(retornoPendiente) : muelleEntradaLabel(retornoPendiente),
        secondaryLabel: "Registrar retorno",
        visual: vis,
      };
    }

    const hayRetornoStock = (stockActual || []).some((l) => isStockLineRetorno(l));
    if (hayRetornoStock) {
      return {
        kind: OPERATION_KIND.RETORNO,
        phase: "acumulado",
        stop: null,
        title: "Viaje de retorno activo",
        subtitle: "Mercancía de retorno a bordo — entregar en almacén",
        primaryLabel: "Entregar retorno acumulado",
        secondaryLabel: "Ver retorno acumulado",
        visual: OPERATION_VISUAL[OPERATION_KIND.RETORNO],
      };
    }
  }

  // 4) Servicio listo para cerrar
  const hayCargas = cargasPrincipal.some((c) => isCargaTerminadaStop(c));
  const hayEntregas = destinos.some((d) => isDestinoEntregadoStop(d));
  if (hayCargas && hayEntregas) {
    return {
      kind: "cerrar",
      phase: "listo",
      stop: null,
      title: "Servicio listo",
      subtitle: "Viaje principal completado",
      primaryLabel: "Finalizar expediente",
      secondaryLabel: null,
      visual: OPERATION_VISUAL[OPERATION_KIND.CARGA],
    };
  }

  return {
    kind: "idle",
    phase: "idle",
    stop: null,
    title: "Sin acción pendiente",
    subtitle: "Registre lo que hace al llegar a un punto",
    primaryLabel: "Entrada en muelle",
    secondaryLabel: "Añadir carga prevista",
    visual: OPERATION_VISUAL[OPERATION_KIND.CARGA],
  };
}

/** ¿Línea de stock es mercancía de ida pendiente de entregar? */
export function isStockLineIda(line) {
  const desc = String(line?.descripcion_mercancia || "").toLowerCase();
  const cat = String(line?.categoria_mercancia || "").toLowerCase();
  if (cat.includes("retorno") || desc.includes("retorno")) return false;
  if (cat.includes("devoluc") || desc.includes("devoluc")) return false;
  if (desc.includes("palet") && desc.includes("vac")) return false;
  if (desc.includes("caja") && desc.includes("reutiliz")) return false;
  if (desc.includes("envase")) return false;
  return true;
}

export function isStockLineRetorno(line) {
  const desc = String(line?.descripcion_mercancia || "").toLowerCase();
  const cat = String(line?.categoria_mercancia || "").toLowerCase();
  return (
    cat.includes("retorno") ||
    desc.includes("retorno") ||
    desc.includes("palet") && desc.includes("vac") ||
    desc.includes("caja") ||
    desc.includes("envase")
  );
}

export function isStockLineDevolucion(line) {
  const desc = String(line?.descripcion_mercancia || "").toLowerCase();
  const cat = String(line?.categoria_mercancia || "").toLowerCase();
  return cat.includes("devoluc") || desc.includes("devoluc");
}

/** Agrupa inventario DeCA para pantalla conductor. */
export function splitStockForDisplay(stock = []) {
  const ida = [];
  const retorno = [];
  const devolucion = [];
  for (const line of stock || []) {
    if (isStockLineDevolucion(line)) devolucion.push(line);
    else if (isStockLineRetorno(line)) retorno.push(line);
    else ida.push(line);
  }
  return { mercanciaIda: ida, retornos: retorno, devoluciones: devolucion };
}

/** ¿Se puede cancelar/anular la parada sin romper trazabilidad? */
export function evaluateCancelOperacion(stop, servicio = null) {
  if (!stop) return { allowed: false, mode: null, reason: "Parada no válida" };
  if (isOperacionAnulada(stop)) return { allowed: false, mode: null, reason: "Ya anulada" };

  const kind = classifyOperativeStop(stop);
  const decaLink = servicio ? getStopOperacionMeta(stop.notas)?.deca_id : null;
  const meta = getStopOperacionMeta(stop?.notas);

  if (decaLink) {
    return { allowed: false, mode: "ajuste", reason: "DeCA generado — use ajuste manual con motivo" };
  }

  if (kind === OPERATION_KIND.DESCARGA) {
    if (isDestinoEntregadoStop(stop)) return { allowed: false, mode: "ajuste", reason: "Descarga confirmada" };
    if (meta.entrada_at || meta.salida_at) {
      return { allowed: true, mode: "anular", reason: "Anular por error (queda en historial)" };
    }
    return { allowed: true, mode: "delete", reason: "Eliminar destino no iniciado" };
  }

  if (kind === OPERATION_KIND.CARGA || kind === OPERATION_KIND.RETORNO) {
    if (isCargaTerminadaStop(stop)) return { allowed: false, mode: "ajuste", reason: "Carga confirmada" };
    if (isCargaEnMuelleStop(stop)) return { allowed: true, mode: "anular", reason: "Anular operación en muelle" };
    if (isCargaPendienteEntradaStop(stop)) return { allowed: true, mode: "delete", reason: "Cancelar operación no iniciada" };
  }

  return { allowed: true, mode: "delete", reason: "Cancelar operación" };
}
