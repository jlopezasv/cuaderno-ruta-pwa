import { describe, it, expect } from "vitest";
import { Result } from "./Result.js";
import { DomainError } from "./DomainError.js";
import { ValidationError } from "./ValidationError.js";
import { BusinessRuleError } from "./BusinessRuleError.js";
import { NotFoundError } from "./NotFoundError.js";

describe("domain/shared", () => {
  describe("Result", () => {
    it("ok carries value", () => {
      const r = Result.ok({ id: "1" });
      expect(r.ok).toBe(true);
      expect(r.value).toEqual({ id: "1" });
      expect(r.error).toBeNull();
    });

    it("fail carries error", () => {
      const r = Result.fail("fallo");
      expect(r.ok).toBe(false);
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe("fallo");
    });

    it("map transforms success value", () => {
      const r = Result.ok(2).map((n) => n * 3);
      expect(r.ok).toBe(true);
      expect(r.value).toBe(6);
    });

    it("map preserves failure", () => {
      const r = Result.fail(new Error("x")).map((n) => n * 2);
      expect(r.ok).toBe(false);
    });

    it("valueOr returns fallback on failure", () => {
      expect(Result.ok(5).valueOr(0)).toBe(5);
      expect(Result.fail("e").valueOr(0)).toBe(0);
    });
  });

  describe("errors", () => {
    it("DomainError has code", () => {
      const err = new DomainError("msg", "CUSTOM");
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("CUSTOM");
    });

    it("ValidationError includes fields", () => {
      const err = new ValidationError("invalid", { cantidad: "requerida" });
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields.cantidad).toBe("requerida");
    });

    it("BusinessRuleError includes ruleId", () => {
      const err = new BusinessRuleError("violación", "INV-03");
      expect(err.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(err.ruleId).toBe("INV-03");
    });

    it("NotFoundError formats message", () => {
      const err = new NotFoundError("Expedición", "s1");
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toContain("Expedición");
      expect(err.resourceId).toBe("s1");
    });
  });
});
