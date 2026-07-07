import { DomainError } from "./DomainError.js";

export class NotFoundError extends DomainError {
  /**
   * @param {string} resource
   * @param {string} [id]
   */
  constructor(resource, id = null) {
    const suffix = id ? ` (${id})` : "";
    super(`${resource} no encontrado${suffix}`, "NOT_FOUND");
    this.name = "NotFoundError";
    this.resource = resource;
    this.resourceId = id;
  }
}
