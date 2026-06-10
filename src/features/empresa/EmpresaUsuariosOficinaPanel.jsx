import { useCallback, useEffect, useState } from "react";
import { isDemoApp } from "../../config/appEnvironment.js";
import { DEMO_LOGIN_HINT } from "../../config/appEnvironment.js";
import {
  OFFICE_USER_ROLES,
  buildOfficeUserRow,
  canManageEmpresaOfficeUsers,
  createEmpresaOfficeUser,
  fetchEmpresaOfficeUsers,
  invalidateEmpresaOfficeUsersCache,
  mergeOfficeUserLists,
  resolveEmpresaOfficeUsersTenantId,
  officeUserRoleLabel,
  patchEmpresaOfficeUser,
  setEmpresaOfficeUserActivo,
  validateJefeFlotaGuard,
} from "../../domain/empresa/empresaOfficeUsers.js";
import { getStoredAuthSession } from "../../data/authContext.js";
import { ConfigCard, CONFIG_UI, configBtnPrimary, configBtnSecondary } from "./empresaConfigCards.jsx";

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        background: on ? "#2563eb" : "#cbd5e1",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

function UserFormModal({ mode, initial, onClose, onSave, saving, error }) {
  const [nombre, setNombre] = useState(initial?.nombre || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [rol, setRol] = useState(initial?.rol || "trafico");
  const [puedeVerTodos, setPuedeVerTodos] = useState(!!initial?.puedeVerTodos);
  const [activo, setActivo] = useState(initial?.activo !== false);
  const isAdd = mode === "add";
  const isAdministrativo = rol === "administrativo";

  useEffect(() => {
    setNombre(initial?.nombre || "");
    setEmail(initial?.email || "");
    setRol(initial?.rol || "trafico");
    setPuedeVerTodos(!!initial?.puedeVerTodos);
    setActivo(initial?.activo !== false);
  }, [initial, mode]);

  useEffect(() => {
    if (rol === "administrativo") setPuedeVerTodos(false);
  }, [rol]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: CONFIG_UI.surface,
          borderRadius: 14,
          padding: 20,
          width: "min(100%, 420px)",
          boxShadow: "0 16px 40px rgba(15,23,42,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: CONFIG_UI.tx, marginBottom: 4 }}>
          {isAdd ? "Añadir usuario" : "Editar usuario"}
        </div>
        <div style={{ fontSize: 12, color: CONFIG_UI.muted, marginBottom: 16 }}>
          {isAdd
            ? `Contraseña temporal: ${DEMO_LOGIN_HINT.password}`
            : "Cambios en rol, visibilidad y estado"}
        </div>

        {isAdd && (
          <>
            <label style={labelStyle}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inpStyle} placeholder="Nombre" />
            <label style={labelStyle}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inpStyle}
              placeholder="usuario@cuaderno.test"
              type="email"
            />
          </>
        )}

        <label style={labelStyle}>Rol</label>
        <select value={rol} onChange={(e) => setRol(e.target.value)} style={inpStyle}>
          {OFFICE_USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {officeUserRoleLabel(r)}
            </option>
          ))}
        </select>

        {!isAdministrativo ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0" }}>
            <span style={{ fontSize: 13, color: CONFIG_UI.tx }}>Puede ver todos los servicios</span>
            <Toggle on={puedeVerTodos} onChange={setPuedeVerTodos} />
          </div>
        ) : null}

        {!isAdd && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: CONFIG_UI.tx }}>Activo</span>
            <Toggle on={activo} onChange={setActivo} />
          </div>
        )}

        {error ? <div style={{ fontSize: 12, color: CONFIG_UI.red, marginBottom: 10 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" onClick={onClose} style={configBtnSecondary()}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave(
                isAdd
                  ? { nombre, email, rol, puedeVerTodos: isAdministrativo ? false : puedeVerTodos }
                  : { rol, puedeVerTodos: isAdministrativo ? false : puedeVerTodos, activo },
              )
            }
            style={{ ...configBtnPrimary(saving), width: "auto" }}
          >
            {saving ? "Guardando…" : isAdd ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserCard({ user, canManage, onEdit, onDeactivate, showToast }) {
  const isAdmin = user.rol === "administrativo";

  return (
    <div
      style={{
        border: `1px solid ${CONFIG_UI.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        background: CONFIG_UI.surfaceSoft,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 750, color: CONFIG_UI.tx }}>{user.nombre || "—"}</div>
          <div style={{ fontSize: 12, color: CONFIG_UI.muted, marginTop: 2, wordBreak: "break-all" }}>
            {user.email || "—"}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 999,
            background: user.activo ? "#dcfce7" : "#f1f5f9",
            color: user.activo ? CONFIG_UI.green : CONFIG_UI.muted,
            flexShrink: 0,
          }}
        >
          {user.activo ? "Activo" : "Inactivo"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 10px",
          marginTop: 10,
          fontSize: 12,
          color: CONFIG_UI.muted,
        }}
      >
        <div>
          <span style={{ fontWeight: 700 }}>Rol: </span>
          {officeUserRoleLabel(user.rol)}
        </div>
        <div>
          <span style={{ fontWeight: 700 }}>Ver todos: </span>
          {isAdmin ? "No aplica" : user.puedeVerTodos ? "Sí" : "No"}
        </div>
      </div>

      {canManage ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => onEdit(user)} style={{ ...configBtnSecondary(), flex: 1 }}>
            Editar
          </button>
          {user.activo ? (
            <button
              type="button"
              onClick={() => onDeactivate(user)}
              style={{
                ...configBtnSecondary(),
                flex: 1,
                color: CONFIG_UI.red,
                borderColor: "#fecaca",
              }}
            >
              Desactivar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: CONFIG_UI.muted, display: "block" };
const inpStyle = {
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 10,
  padding: "10px 12px",
  borderRadius: 9,
  border: `1px solid ${CONFIG_UI.border}`,
  fontSize: 14,
};

export function EmpresaUsuariosOficinaPanel({
  empresaId,
  officeUser = null,
  getUserId,
  sbSelect,
  showToast,
  variant = "legacy",
  span2 = false,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [loadDebug, setLoadDebug] = useState(null);

  const uid = getUserId?.() || null;
  const caps = getStoredAuthSession(uid)?.capabilities;
  const sessionOffice = caps?.officeUser || officeUser || null;
  const tenantEmpresaId = resolveEmpresaOfficeUsersTenantId(empresaId, sessionOffice);
  const canManage = canManageEmpresaOfficeUsers(caps);

  const reload = useCallback(async () => {
    if (!tenantEmpresaId) {
      setLoading(false);
      setLoadError("Sin empresaId (esperando sesión de oficina)");
      setLoadDebug(
        isDemoApp()
          ? JSON.stringify(
              {
                empresaIdProp: empresaId || null,
                officeUserEmpresaId: sessionOffice?.empresaId || null,
                uid,
                rol: sessionOffice?.rol || null,
              },
              null,
              2,
            )
          : null,
      );
      if (isDemoApp()) {
        console.warn("[DEMO officeUsers] sin tenantEmpresaId", {
          empresaIdProp: empresaId,
          officeUserEmpresaId: sessionOffice?.empresaId,
          uid,
          rol: sessionOffice?.rol,
        });
      }
      return;
    }
    setLoading(true);
    try {
      const result = await fetchEmpresaOfficeUsers(sbSelect, tenantEmpresaId, { force: true });
      const rows = result?.users || [];
      if (isDemoApp()) {
        console.warn("[DEMO officeUsers] panel reload", {
          tenantEmpresaId,
          uid,
          rol: sessionOffice?.rol || caps?.officeUser?.rol,
          rawCount: result?.debug?.rawCount,
          builtCount: result?.debug?.builtCount,
          httpStatus: result?.debug?.httpStatus,
          error: result?.error,
        });
      }
      const httpOk = result?.debug?.httpStatus === 200;
      if (httpOk && rows.length > 0) {
        setUsers(rows);
        setLoadError(null);
        setLoadDebug(null);
      } else {
        setLoadError(result?.error || "No se pudieron cargar usuarios de oficina");
        setLoadDebug(
          isDemoApp()
            ? JSON.stringify(
                {
                  tenantEmpresaId,
                  uid,
                  rol: sessionOffice?.rol || null,
                  ...result?.debug,
                },
                null,
                2,
              )
            : null,
        );
      }
    } catch (e) {
      setLoadError("No se pudieron cargar usuarios de oficina");
      setLoadDebug(isDemoApp() ? e?.message || String(e) : null);
    }
    setLoading(false);
  }, [tenantEmpresaId, empresaId, sessionOffice?.empresaId, sessionOffice?.rol, uid, sbSelect, caps?.officeUser?.rol]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!canManageEmpresaOfficeUsers(caps)) return null;

  async function handleCreate(form) {
    setSaving(true);
    setModalError("");
    try {
      if (!tenantEmpresaId) throw new Error("Sin empresaId para crear usuario");
      const result = await createEmpresaOfficeUser({
        empresaId: tenantEmpresaId,
        nombre: form.nombre,
        email: form.email,
        rol: form.rol,
        callerUid: uid,
      });
      invalidateEmpresaOfficeUsersCache(tenantEmpresaId);
      const eu = result.empresa_usuario || {};
      const puedeVer = form.rol === "administrativo" ? false : !!form.puedeVerTodos;
      let row =
        buildOfficeUserRow(eu) ||
        buildOfficeUserRow({
          id: eu.id || null,
          empresa_id: tenantEmpresaId,
          user_id: result.user_id || eu.user_id,
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          rol: form.rol,
          puede_ver_todos: puedeVer,
          activo: eu.activo !== false,
        });
      if (row?.id && puedeVer && form.rol === "trafico") {
        await patchEmpresaOfficeUser(row.id, { puede_ver_todos: true });
        row = { ...row, puedeVerTodos: true };
      } else if (row) {
        row = { ...row, puedeVerTodos: puedeVer };
      }
      if (row) {
        setUsers((prev) => mergeOfficeUserLists([row], prev));
      }
      showToast?.(
        result.message ||
          `Usuario creado con contraseña temporal: ${result.tempPassword || DEMO_LOGIN_HINT.password}`,
      );
      setModal(null);
      const freshResult = await fetchEmpresaOfficeUsers(sbSelect, tenantEmpresaId, { force: true });
      const fresh = freshResult?.users || [];
      setUsers((prev) => mergeOfficeUserLists(fresh, row ? mergeOfficeUserLists([row], prev) : prev));
      if (fresh.length > 0) {
        setLoadError(null);
        setLoadDebug(null);
      }
    } catch (e) {
      setModalError(e.message || "Error al crear");
    }
    setSaving(false);
  }

  async function handleEdit(form) {
    if (!modal?.user?.id) return;
    setSaving(true);
    setModalError("");
    try {
      const patch = {
        rol: form.rol,
        puede_ver_todos: form.rol === "administrativo" ? false : form.puedeVerTodos,
        activo: form.activo,
      };
      const guardMsg = validateJefeFlotaGuard(users, modal.user.id, patch);
      if (guardMsg) {
        setModalError(guardMsg);
        setSaving(false);
        return;
      }
      await patchEmpresaOfficeUser(modal.user.id, patch);
      invalidateEmpresaOfficeUsersCache(tenantEmpresaId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === modal.user.id
            ? {
                ...u,
                rol: form.rol,
                puedeVerTodos: form.rol === "administrativo" ? false : form.puedeVerTodos,
                activo: form.activo,
              }
            : u,
        ),
      );
      showToast?.("Usuario actualizado");
      setModal(null);
    } catch (e) {
      setModalError(e.message || "Error al guardar");
    }
    setSaving(false);
  }

  function handleDeactivate(user) {
    const guardMsg = validateJefeFlotaGuard(users, user.id, { activo: false });
    if (guardMsg) {
      showToast?.(guardMsg);
      return;
    }
    setEmpresaOfficeUserActivo(user.id, false)
      .then(() => {
        invalidateEmpresaOfficeUsersCache(tenantEmpresaId);
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, activo: false } : u)));
        showToast?.("Usuario desactivado");
      })
      .catch((e) => showToast?.(e.message));
  }

  const body = (
    <>
      {canManage ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              setModalError("");
              setModal({ mode: "add" });
            }}
            style={{ ...configBtnPrimary(), width: "auto" }}
          >
            + Añadir usuario
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: CONFIG_UI.red }}>
            No se pudieron cargar usuarios de oficina
          </div>
          {isDemoApp() && loadDebug ? (
            <pre
              style={{
                marginTop: 8,
                fontSize: 10,
                color: "#7f1d1d",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.4,
              }}
            >
              {loadDebug}
            </pre>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 13, color: CONFIG_UI.muted }}>Cargando usuarios…</div>
      ) : users.length === 0 && !loadError ? (
        <div style={{ fontSize: 13, color: CONFIG_UI.muted }}>No hay usuarios de oficina registrados.</div>
      ) : users.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          {users.map((u) => (
            <UserCard
              key={u.id || u.userId}
              user={u}
              canManage={canManage}
              onEdit={(user) => {
                setModalError("");
                setModal({ mode: "edit", user });
              }}
              onDeactivate={handleDeactivate}
              showToast={showToast}
            />
          ))}
        </div>
      ) : null}

      {modal ? (
        <UserFormModal
          mode={modal.mode}
          initial={modal.user}
          saving={saving}
          error={modalError}
          onClose={() => setModal(null)}
          onSave={modal.mode === "add" ? handleCreate : handleEdit}
        />
      ) : null}
    </>
  );

  if (variant === "card") {
    return (
      <ConfigCard
        title="Usuarios de oficina"
        description="Gestión de accesos para tráfico, administración y jefe de flota."
        span2={span2}
      >
        {body}
      </ConfigCard>
    );
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${CONFIG_UI.border}` }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: CONFIG_UI.tx, marginBottom: 14 }}>Usuarios de oficina</div>
      {body}
    </div>
  );
}
