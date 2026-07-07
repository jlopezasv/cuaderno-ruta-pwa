/**
 * Error base del dominio. Sin dependencias de infraestructura.
 */
export class DomainError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = "DOMAIN_ERROR") {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
