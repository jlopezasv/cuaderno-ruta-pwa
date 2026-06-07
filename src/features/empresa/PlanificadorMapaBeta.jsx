import { useEffect, useMemo, useRef, useState } from "react";
import { isLocalGeoCatalogEnabled } from "../../config/productFeatures.js";
import {
  buildPlanificadorDriverMarkers,
  buildPlanificadorPendingCargas,
} from "./planificadorMapBetaModel.js";

const EUROPE_CENTER = [40.4168, -3.7038];
const EUROPE_ZOOM = 6;
const MARKER_CARGA_BG = "#ea580c";
const MARKER_DRIVER_CLUSTER_BG = "#475569";

function ensureLeafletAssets() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    const done = () => {
      if (window.L && window.L.markerClusterGroup) resolve(window.L);
      else reject(new Error("Leaflet cluster no disponible"));
    };
    if (!document.getElementById("lf-css")) {
      const c = document.createElement("link");
      c.id = "lf-css";
      c.rel = "stylesheet";
      c.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(c);
    }
    if (!document.getElementById("lf-mc-css")) {
      const c = document.createElement("link");
      c.id = "lf-mc-css";
      c.rel = "stylesheet";
      c.href =
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css";
      document.head.appendChild(c);
      const c2 = document.createElement("link");
      c2.id = "lf-mc-css2";
      c2.rel = "stylesheet";
      c2.href =
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css";
      document.head.appendChild(c2);
    }
    const loadCluster = () => {
      if (window.L?.markerClusterGroup) {
        done();
        return;
      }
      if (!document.getElementById("lf-mc-js")) {
        const sc = document.createElement("script");
        sc.id = "lf-mc-js";
        sc.src =
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js";
        sc.onload = done;
        sc.onerror = () => reject(new Error("markercluster load failed"));
        document.head.appendChild(sc);
      }
    };
    if (window.L) {
      loadCluster();
      return;
    }
    if (!document.getElementById("lf-js")) {
      const sc = document.createElement("script");
      sc.id = "lf-js";
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      sc.onload = loadCluster;
      sc.onerror = () => reject(new Error("leaflet load failed"));
      document.head.appendChild(sc);
    } else {
      loadCluster();
    }
  });
}

function emojiIcon(L, emoji, bg, size = 34) {
  return L.divIcon({
    html: `<div style="background:${bg};width:${size}px;height:${size}px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;font-size:${size * 0.48}px;line-height:1">${emoji}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createTypedClusterGroup(L, clusterBg) {
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 52,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      const size = count < 10 ? 36 : count < 100 ? 42 : 48;
      return L.divIcon({
        html: `<div style="background:${clusterBg};width:${size}px;height:${size}px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${size < 42 ? 13 : 14}px;line-height:1">${count}</div>`,
        className: "planificador-map-cluster",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    },
  });
}

export function PlanificadorMapaBeta({
  servicios = [],
  flotaStops = {},
  conductores = [],
  ubicacionConductorByUid = {},
  flotaIncidenciasResumen = {},
  formatLugar = null,
  onBuscarConductor,
  dark = false,
  compactLayout = true,
}) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const cargoClusterRef = useRef(null);
  const driverClusterRef = useRef(null);
  const [selectedCargoId, setSelectedCargoId] = useState(null);
  const [selectedDriverUid, setSelectedDriverUid] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const card = dark ? "#1E293B" : "#FFFFFF";
  const bg = dark ? "#0F172A" : "#F8FAFC";
  const tx = dark ? "#F1F5F9" : "#0F172A";
  const su = dark ? "#94A3B8" : "#64748B";
  const border = dark ? "#334155" : "#DBE4EE";

  const useLocalGeoFallback = isLocalGeoCatalogEnabled();

  const cargas = useMemo(
    () => buildPlanificadorPendingCargas({ servicios, flotaStops, useLocalGeoFallback }),
    [servicios, flotaStops, useLocalGeoFallback],
  );

  const drivers = useMemo(
    () =>
      buildPlanificadorDriverMarkers({
        conductores,
        flotaServicios: servicios,
        ubicacionByUid: ubicacionConductorByUid,
        incidenciasByServicioId: flotaIncidenciasResumen,
        formatLugar,
      }),
    [conductores, servicios, ubicacionConductorByUid, flotaIncidenciasResumen, formatLugar],
  );

  const selectedCargo = cargas.find((c) => c.id === selectedCargoId) || null;
  const selectedDriver = drivers.find((d) => d.uid === selectedDriverUid) || null;

  useEffect(() => {
    let cancelled = false;
    setMapError("");
    ensureLeafletAssets()
      .then((L) => {
        if (cancelled || !mapDivRef.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
          cargoClusterRef.current = null;
          driverClusterRef.current = null;
        }
        const map = L.map(mapDivRef.current, { zoomControl: true }).setView(
          EUROPE_CENTER,
          EUROPE_ZOOM,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OSM",
        }).addTo(map);
        const cargoCluster = createTypedClusterGroup(L, MARKER_CARGA_BG);
        const driverCluster = createTypedClusterGroup(L, MARKER_DRIVER_CLUSTER_BG);
        map.addLayer(cargoCluster);
        map.addLayer(driverCluster);
        mapRef.current = map;
        cargoClusterRef.current = cargoCluster;
        driverClusterRef.current = driverCluster;
        setMapReady(true);
      })
      .catch((e) => {
        if (!cancelled) setMapError(e?.message || "No se pudo cargar el mapa");
      });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        cargoClusterRef.current = null;
        driverClusterRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    const cargoCluster = cargoClusterRef.current;
    const driverCluster = driverClusterRef.current;
    if (!mapReady || !L || !map || !cargoCluster || !driverCluster) return;

    cargoCluster.clearLayers();
    driverCluster.clearLayers();
    const bounds = [];

    for (const cargo of cargas) {
      if (!cargo.hasCoords) continue;
      const { lat, lon } = cargo.coords;
      const marker = L.marker([lat, lon], {
        icon: emojiIcon(L, "📦", MARKER_CARGA_BG),
      });
      marker.bindPopup(
        `<b>📦 Servicio pendiente</b><br>${cargo.origenLabel}<br>→ ${cargo.destinoLabel}<br>${cargo.cliente}`,
      );
      marker.on("click", () => {
        setSelectedCargoId(cargo.id);
        setSelectedDriverUid(null);
      });
      cargoCluster.addLayer(marker);
      bounds.push([lat, lon]);
    }

    for (const driver of drivers) {
      if (!driver.hasCoords) continue;
      const { lat, lon } = driver.coords;
      const marker = L.marker([lat, lon], {
        icon: emojiIcon(L, "🚚", driver.status.mapColor || driver.status.color),
      });
      marker.bindPopup(
        `<b>🚚 ${driver.nombre}</b><br>${driver.ubicLabel}<br>${driver.status.label}`,
      );
      marker.on("click", () => {
        setSelectedDriverUid(driver.uid);
        setSelectedCargoId(null);
      });
      driverCluster.addLayer(marker);
      bounds.push([lat, lon]);
    }

    if (bounds.length) {
      try {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 8 });
      } catch (_) {
        map.setView(EUROPE_CENTER, EUROPE_ZOOM);
      }
    } else {
      map.setView(EUROPE_CENTER, EUROPE_ZOOM);
    }
  }, [mapReady, cargas, drivers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const target = selectedCargo?.hasCoords
      ? selectedCargo
      : selectedDriver?.hasCoords
        ? selectedDriver
        : null;
    if (!target?.coords) return;
    const { lat, lon } = target.coords;
    try {
      map.flyTo([lat, lon], Math.max(map.getZoom(), 8), { duration: 0.6 });
    } catch (_) {
      map.setView([lat, lon], 8);
    }
  }, [mapReady, selectedCargoId, selectedCargo, selectedDriverUid, selectedDriver]);

  const cargasConCoords = cargas.filter((c) => c.hasCoords).length;
  const driversConCoords = drivers.filter((d) => d.hasCoords).length;
  const driversDisponibles = drivers.filter((d) => d.status?.key === "disponible").length;

  return (
    <div
      className={
        compactLayout
          ? "planificador-mapa-beta-root planificador-mapa-beta-root--compact"
          : "planificador-mapa-beta-root"
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compactLayout ? 4 : 10,
        minHeight: compactLayout ? 0 : 420,
        flex: compactLayout ? 1 : undefined,
        position: "relative",
        zIndex: 0,
        isolation: "isolate",
      }}
    >
      <div
        className={compactLayout ? "planificador-mapa-beta-banner--compact" : undefined}
        style={{
          fontSize: compactLayout ? 10 : 11,
          color: su,
          lineHeight: 1.45,
          background: dark ? "#172033" : "#eff6ff",
          border: `1px solid ${dark ? "#334155" : "#bfdbfe"}`,
          borderRadius: compactLayout ? 8 : 10,
          padding: compactLayout ? "2px 6px" : "8px 10px",
        }}
      >
        {`${cargas.length} carga${cargas.length !== 1 ? "s" : ""} sin conductor · ${driversDisponibles} sin servicio · ${driversConCoords} en mapa · 🟢 sin servicio · 🟠 asignado · 🔵 en curso · ⚪ sin GPS`}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compactLayout ? "minmax(180px, 280px) 1fr" : "minmax(220px, 300px) 1fr",
          gap: compactLayout ? 6 : 10,
          minHeight: compactLayout ? 0 : 380,
          flex: compactLayout ? 1 : undefined,
        }}
        className={
          compactLayout
            ? "planificador-mapa-beta-layout planificador-mapa-beta-layout--compact"
            : "planificador-mapa-beta-layout"
        }
      >
        <aside
          className={compactLayout ? "planificador-mapa-beta-aside--compact" : undefined}
          style={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: compactLayout ? undefined : 480,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${border}`,
              fontSize: 12,
              fontWeight: 800,
              color: tx,
            }}
          >
            Cargas pendientes ({cargas.length})
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            {!cargas.length ? (
              <div style={{ fontSize: 12, color: su, lineHeight: 1.45, padding: "8px 4px" }}>
                No hay cargas sin conductor en este momento.
              </div>
            ) : (
              cargas.map((cargo) => {
                const active = selectedCargoId === cargo.id;
                return (
                  <button
                    key={cargo.id}
                    type="button"
                    onClick={() => {
                      setSelectedCargoId(cargo.id);
                      setSelectedDriverUid(null);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: active ? (dark ? "#1e3a5f" : "#eff6ff") : bg,
                      border: `1px solid ${active ? "#93c5fd" : border}`,
                      borderRadius: 10,
                      padding: "9px 10px",
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                  >
                    {cargo.empresaOrigen ? (
                      <div style={{ fontSize: 10, color: su, marginBottom: 3, fontWeight: 600 }}>
                        {cargo.empresaOrigen}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 12, fontWeight: 800, color: tx, marginBottom: 4 }}>
                      📦 {cargo.origenLabel} → {cargo.destinoLabel}
                    </div>
                    <div style={{ fontSize: 11, color: su, marginTop: 3 }}>
                      {cargo.cliente} · {cargo.salidaLabel}
                    </div>
                    {cargo.pendingValidation ? (
                      <div style={{ fontSize: 10, color: "#b45309", marginTop: 4, fontWeight: 700 }}>
                        Ubicación pendiente de validar
                      </div>
                    ) : cargo.pendingGeocode ? (
                      <div style={{ fontSize: 10, color: "#b45309", marginTop: 4, fontWeight: 700 }}>
                        Ubicación pendiente
                      </div>
                    ) : null}
                    {onBuscarConductor ? (
                      <span
                        role="presentation"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuscarConductor(cargo.id);
                        }}
                        style={{
                          display: "inline-block",
                          marginTop: 8,
                          background: "#2563eb",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "5px 9px",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        Buscar conductor
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div
          className={
            compactLayout
              ? "planificador-mapa-beta-map planificador-mapa-beta-map--compact"
              : "planificador-mapa-beta-map"
          }
          style={{
            position: "relative",
            minHeight: compactLayout ? 0 : 320,
            flex: compactLayout ? 1 : undefined,
            display: compactLayout ? "flex" : undefined,
            flexDirection: compactLayout ? "column" : undefined,
          }}
        >
          <div
            ref={mapDivRef}
            className={
              compactLayout
                ? "planificador-mapa-beta-map-host planificador-mapa-beta-map-host--compact"
                : "planificador-mapa-beta-map-host"
            }
            style={{
              height: "100%",
              minHeight: compactLayout ? 0 : 320,
              flex: compactLayout ? 1 : undefined,
              borderRadius: 12,
              border: `1px solid ${border}`,
              background: "#dde8f0",
              overflow: "hidden",
            }}
          />
          {mapError ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(15,23,42,.08)",
                borderRadius: 12,
                padding: 16,
                fontSize: 12,
                color: "#b91c1c",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              {mapError}
            </div>
          ) : null}

          {selectedCargo ? (
            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                left: 10,
                maxWidth: 300,
                marginLeft: "auto",
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 12,
                padding: "10px 12px",
                boxShadow: "0 8px 24px rgba(15,23,42,.15)",
                zIndex: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: tx }}>📦 Servicio pendiente</div>
                <button
                  type="button"
                  onClick={() => setSelectedCargoId(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: su,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: tx, marginTop: 6, lineHeight: 1.4 }}>
                {selectedCargo.origenLabel} → {selectedCargo.destinoLabel}
              </div>
              <div style={{ fontSize: 11, color: su, marginTop: 4, lineHeight: 1.45 }}>
                {selectedCargo.cliente} · {selectedCargo.salidaLabel}
              </div>
              {onBuscarConductor ? (
                <button
                  type="button"
                  onClick={() => onBuscarConductor(selectedCargo.id)}
                  style={{
                    marginTop: 8,
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Buscar conductor
                </button>
              ) : null}
            </div>
          ) : selectedDriver ? (
            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                left: 10,
                maxWidth: 280,
                marginLeft: "auto",
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 12,
                padding: "10px 12px",
                boxShadow: "0 8px 24px rgba(15,23,42,.15)",
                zIndex: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: tx }}>
                  🚚 {selectedDriver.nombre}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDriverUid(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: su,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 11, color: su, marginTop: 4, lineHeight: 1.45 }}>
                📍 {selectedDriver.ubicLabel}
              </div>
              <div style={{ fontSize: 11, color: su, marginTop: 2 }}>📞 {selectedDriver.telefono}</div>
              <div
                style={{
                  marginTop: 6,
                  display: "inline-block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: selectedDriver.status.color,
                  background: selectedDriver.status.bg,
                  borderRadius: 999,
                  padding: "3px 8px",
                }}
              >
                {selectedDriver.status.label}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {import.meta.env.DEV && cargas.length ? (
        <details
          style={{
            fontSize: 10,
            color: su,
            background: dark ? "#172033" : "#f8fafc",
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: "6px 8px",
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Depuración geocodificación (dev)</summary>
          <pre
            style={{
              margin: "8px 0 0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 9.5,
              lineHeight: 1.4,
              maxHeight: 160,
              overflow: "auto",
            }}
          >
            {cargas
              .map((c) =>
                JSON.stringify(
                  {
                    id: c.id,
                    empresa: c.empresaOrigen || c.origenGeoTrace?.empresa,
                    ORIGEN: {
                      texto: c.origenGeoTrace?.geocodeText || c.origenGeocode,
                      coordenadas: c.origenGeoTrace?.coords,
                      confianza: c.origenGeoTrace?.confidence,
                    },
                    DESTINO: {
                      texto: c.destinoGeoTrace?.geocodeText || c.destinoGeocode,
                      coordenadas: c.destinoGeoTrace?.coords,
                      confianza: c.destinoGeoTrace?.confidence,
                    },
                    display: `${c.origenLabel} → ${c.destinoLabel}`,
                    pending: c.pendingGeocode,
                    pendingValidation: c.pendingValidation,
                    stopLat: c.geoTrace?.stopLat,
                    stopLon: c.geoTrace?.stopLon,
                  },
                  null,
                  0,
                ),
              )
              .join("\n\n")}
          </pre>
        </details>
      ) : null}

      <style>{`
@media (max-width: 860px) {
  .planificador-mapa-beta-layout {
    grid-template-columns: 1fr !important;
  }
}
/* Leaflet: capas contenidas en el panel (modales app usan z-index 10000+) */
.planificador-mapa-beta-map .leaflet-container {
  z-index: 0 !important;
}
.planificador-mapa-beta-map .leaflet-pane {
  z-index: auto !important;
}
.planificador-mapa-beta-map .leaflet-tile-pane { z-index: 1 !important; }
.planificador-mapa-beta-map .leaflet-overlay-pane { z-index: 2 !important; }
.planificador-mapa-beta-map .leaflet-shadow-pane { z-index: 3 !important; }
.planificador-mapa-beta-map .leaflet-marker-pane { z-index: 4 !important; }
.planificador-mapa-beta-map .leaflet-tooltip-pane { z-index: 5 !important; }
.planificador-mapa-beta-map .leaflet-popup-pane { z-index: 6 !important; }
`}</style>
    </div>
  );
}
