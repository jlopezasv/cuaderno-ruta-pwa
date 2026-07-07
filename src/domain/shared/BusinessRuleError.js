import { DomainError } from "./DomainError.js";

export class BusinessRuleError extends DomainError {
  /**
   * @param {string} message
   * @param {string} [ruleId]
   */
  constructor(message, ruleId = null) {
    super(message, "BUSINESS_RULE_VIOLATION");
    this.name = "BusinessRuleError";
    this.ruleId = ruleId;
  }
}
