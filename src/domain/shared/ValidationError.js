import { DomainError } from "./DomainError.js";

export class ValidationError extends DomainError {
  /**
   * @param {string} message
   * @param {Record<string, string>|null} [fields]
   */
  constructor(message, fields = null) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.fields = fields;
  }
}
