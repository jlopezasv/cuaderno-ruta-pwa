import { describe, it, expect } from "vitest";
import {
  BOOTSTRAP_ERRORS,
  resolveOfficeAccessBootstrapError,
} from "./officeAccessBootstrap.js";

const empresaAccount = { accountType: "empresa", canDrive: false };

describe("resolveOfficeAccessBootstrapError", () => {
  it("alta empresa nueva sin empresas ni empresa_usuarios no bloquea", () => {
    const code = resolveOfficeAccessBootstrapError({
      hasProfile: true,
      officeUser: null,
      accountType: empresaAccount.accountType,
      canDrive: empresaAccount.canDrive,
      isEmpresaOwner: false,
      linkState: { status: "empty", row: null },
      mustChangePassword: false,
    });
    expect(code).toBe(null);
  });

  it("oficina invitada sin vínculo sigue OFFICE_LINK_BROKEN", () => {
    const code = resolveOfficeAccessBootstrapError({
      hasProfile: true,
      officeUser: null,
      accountType: "empresa",
      canDrive: false,
      isEmpresaOwner: false,
      linkState: { status: "empty", row: null },
      mustChangePassword: true,
    });
    expect(code).toBe(BOOTSTRAP_ERRORS.OFFICE_LINK_BROKEN);
  });

  it("oficina con vínculo activo no bloquea", () => {
    const code = resolveOfficeAccessBootstrapError({
      hasProfile: true,
      officeUser: { empresaId: "emp-1", activo: true },
      accountType: "empresa",
      canDrive: false,
      isEmpresaOwner: false,
      linkState: null,
      mustChangePassword: false,
    });
    expect(code).toBe(null);
  });

  it("owner de empresa no bloquea", () => {
    const code = resolveOfficeAccessBootstrapError({
      hasProfile: true,
      officeUser: null,
      accountType: "empresa",
      canDrive: false,
      isEmpresaOwner: true,
      linkState: { status: "empty", row: null },
      mustChangePassword: false,
    });
    expect(code).toBe(null);
  });

  it("oficina inactiva muestra OFFICE_INACTIVE", () => {
    const code = resolveOfficeAccessBootstrapError({
      hasProfile: true,
      officeUser: null,
      accountType: "empresa",
      canDrive: false,
      isEmpresaOwner: false,
      linkState: { status: "ok", row: { empresa_id: "emp-1", activo: false } },
      mustChangePassword: false,
    });
    expect(code).toBe(BOOTSTRAP_ERRORS.OFFICE_INACTIVE);
  });

  it("vínculo sin empresa_id sigue OFFICE_LINK_BROKEN", () => {
    const code = resolveOfficeAccessBootstrapError({
      hasProfile: true,
      officeUser: null,
      accountType: "empresa",
      canDrive: false,
      isEmpresaOwner: false,
      linkState: { status: "ok", row: { user_id: "u1", activo: true } },
      mustChangePassword: false,
    });
    expect(code).toBe(BOOTSTRAP_ERRORS.OFFICE_LINK_BROKEN);
  });
});
