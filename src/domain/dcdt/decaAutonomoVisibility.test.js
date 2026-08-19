import { describe, it, expect } from "vitest";
import { canUseAutonomoDecaSync } from "./decaAutonomoVisibility.js";

describe("canUseAutonomoDecaSync", () => {
  it("autónomo PRO siempre ve Mis DeCA", () => {
    expect(canUseAutonomoDecaSync({ accountType: "autonomo_pro", hasFleetLink: true })).toBe(true);
    expect(canUseAutonomoDecaSync({ accountType: "autonomo" })).toBe(true);
  });

  it("conductor de flota también ve Mis DeCA", () => {
    expect(canUseAutonomoDecaSync({ accountType: "conductor", hasFleetLink: true })).toBe(true);
    expect(canUseAutonomoDecaSync({ accountType: "conductor", hasFleetLink: false })).toBe(true);
  });

  it("empresa que conduce ve Mis DeCA", () => {
    expect(canUseAutonomoDecaSync({ accountType: "empresa", canDrive: true })).toBe(true);
    expect(canUseAutonomoDecaSync({ accountType: "empresa", canDrive: false })).toBe(false);
  });
});
