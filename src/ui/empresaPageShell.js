/**
 * Contenedor principal de pestañas Empresa (dashboard, servicios, documentos, planificador).
 * Escritorio: ~95% del ancho, tope 1600px. Tablet/móvil: padding fluido.
 */

export const EMPRESA_PAGE_SHELL_CLASS = "empresa-page-shell";

export const EMPRESA_PAGE_SHELL_CSS = `
  .empresa-page-shell {
    width: min(95%, 1600px);
    max-width: 1600px;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
    padding: clamp(14px, 2vw, 28px) clamp(12px, 2.5vw, 36px) clamp(40px, 5vw, 60px);
  }
  @media (max-width: 767px) {
    .empresa-page-shell {
      width: 100%;
      max-width: none;
      padding-left: clamp(12px, 4vw, 16px);
      padding-right: clamp(12px, 4vw, 16px);
    }
  }
  @media (min-width: 768px) and (max-width: 1100px) {
    .empresa-page-shell {
      width: min(92%, 1600px);
    }
  }
`;

export function empresaPageShellStyle(overrides = {}) {
  return {
    boxSizing: "border-box",
    ...overrides,
  };
}
