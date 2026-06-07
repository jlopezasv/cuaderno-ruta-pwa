/** Planificador mapa — layout compacto (más alto/ancho en escritorio). */
export const PLANIFICADOR_MAP_LAYOUT_CSS = `
.planificador-panel-outer {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  padding: 0 6px 8px;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 118px);
}
.planificador-panel__tabs {
  padding: 4px 6px 0 !important;
  flex-shrink: 0;
}
.planificador-panel__tabs-row {
  margin-bottom: 4px !important;
  gap: 6px !important;
}
.planificador-panel__tab-btn {
  padding: 6px 8px !important;
  font-size: 11px !important;
  border-radius: 8px !important;
}
.planificador-panel__body {
  padding: 0 6px 4px !important;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.planificador-panel__card {
  padding: 4px 6px 4px !important;
  border-radius: 10px !important;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.planificador-panel__title {
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  margin: 0 0 4px;
  flex-shrink: 0;
}
.planificador-mapa-beta-root--compact {
  gap: 4px !important;
  min-height: 0 !important;
  flex: 1;
  display: flex !important;
  flex-direction: column !important;
}
.planificador-mapa-beta-banner--compact {
  padding: 2px 6px !important;
  font-size: 9.5px !important;
  line-height: 1.25 !important;
  border-radius: 6px !important;
  flex-shrink: 0;
  margin: 0 !important;
}
.planificador-mapa-beta-layout--compact {
  grid-template-columns: minmax(180px, 280px) 1fr !important;
  gap: 6px !important;
  min-height: 0 !important;
  flex: 1 !important;
  align-items: stretch !important;
}
.planificador-mapa-beta-aside--compact {
  max-height: none !important;
  height: 100% !important;
  min-height: 0 !important;
}
.planificador-mapa-beta-map-host--compact .leaflet-container {
  height: 100% !important;
}
.planificador-mapa-beta-aside--compact > div:first-child {
  padding: 6px 8px !important;
  font-size: 11px !important;
}
.planificador-mapa-beta-map--compact {
  min-height: 0 !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}
.planificador-mapa-beta-map-host--compact {
  min-height: 0 !important;
  flex: 1 !important;
  height: 100% !important;
}
@media (max-width: 860px) {
  .planificador-panel-outer {
    min-height: calc(100vh - 132px);
  }
  .planificador-mapa-beta-layout--compact {
    grid-template-columns: 1fr !important;
  }
  .planificador-mapa-beta-map-host--compact {
    min-height: min(48vh, 420px) !important;
  }
}
`;
