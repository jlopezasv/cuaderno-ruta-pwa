/** Cabecera operativa DEMO — una fila empresa + filtro visibilidad. */
export const EMPRESA_OPERATIVA_HEADER_CSS = `
.empresa-operativa-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding: 4px 8px !important;
}
.empresa-operativa-header__left {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empresa-operativa-header__right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
@media (max-width: 720px) {
  .empresa-operativa-header {
    flex-wrap: wrap;
  }
  .empresa-operativa-header__left {
    white-space: normal;
    flex: 1 1 100%;
  }
  .empresa-operativa-header__right {
    flex: 1 1 100%;
    justify-content: flex-start;
  }
}
`;
