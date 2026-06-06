import { useCallback, useEffect, useState } from "react";
import { isDemoApp } from "../../config/appEnvironment.js";
import { DEMO_LOGIN_HINT } from "../../config/appEnvironment.js";
import {
  OFFICE_USER_ROLES,
  canManageEmpresaOfficeUsers,
  createEmpresaOfficeUserDemo,
  fetchEmpresaOfficeUsers,
  officeUserRoleLabel,
  patchEmpresaOfficeUser,
  setEmpresaOfficeUserActivo,
  setEmpresaOfficeUserPuedeVerTodos,
  validateJefeFlotaGuard,
} from "../../domain/empresa/empresaOfficeUsers.js";
import { getStoredAuthSession } from "../../data/authContext.js";

const UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  surfaceSoft: "#f8fafc",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
  green: "#15803d",
  red: "#b91c1c",
};

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
        background: on ? UI.accent : "#cbd5e1",
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

  useEffect(() => {
    setNombre(initial?.nombre || "");
    setEmail(initial?.email || "");
    setRol(initial?.rol || "trafico");
    setPuedeVerTodos(!!initial?.puedeVerTodos);
    setActivo(initial?.activo !== false);
  }, [initial, mode]);

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
          background: UI.surface,
          borderRadius: 14,
          padding: 20,
          width: "min(100%, 420px)",
          boxShadow: "0 16px 40px rgba(15,23,42,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: UI.tx, marginBottom: 4 }}>
          {isAdd ? "Añadir usuario demo" : "Editar usuario"}
        </div>
        <div style={{ fontSize: 12, color: UI.muted, marginBottom: 16 }}>
          {isAdd
            ? `Se creará con contraseña demo: ${DEMO_LOGIN_HINT.password}`
            : "Cambios en rol, visibilidad y estado"}
        </div>

        {isAdd && (
          <>
            <label style={{ fontSize: 11, fontWeight: 700, color: UI.muted }}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={inpStyle}
              placeholder="Nombre"
            />
            <label style={{ fontSize: 11, fontWeight: 700, color: UI.muted }}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inpStyle}
              placeholder="usuario@cuaderno.test"
              type="email"
            />
          </>
        )}

        <label style={{ fontSize: 11, fontWeight: 700, color: UI.muted }}>Rol</label>
        <select value={rol} onChange={(e) => setRol(e.target.value)} style={inpStyle}>
          {OFFICE_USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {officeUserRoleLabel(r)}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0" }}>
          <span style={{ fontSize: 13, color: UI.tx }}>Puede ver todos los servicios</span>
          <Toggle on={puedeVerTodos} onChange={setPuedeVerTodos} />
        </div>

        {!isAdd && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: UI.tx }}>Activo</span>
            <Toggle on={activo} onChange={setActivo} />
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: UI.red, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave(
                isAdd
                  ? { nombre, email, rol, puedeVerTodos }
                  : { rol, puedeVerTodos, activo },
              )
            }
            style={btnPrimary}
          >
            {saving ? "Guardando…" : isAdd ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inpStyle = {
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 10,
  padding: "10px 12px",
  borderRadius: 9,
  border: `1px solid ${UI.border}`,
  fontSize: 14,
};

const btnPrimary = {
  background: UI.accent,
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "9px 16px",
  fontWeight: 700,
  cursor: "pointer",
};

const btnSecondary = {
  background: UI.surfaceSoft,
  color: UI.tx,
  border: `1px solid ${UI.border}`,
  borderRadius: 9,
  padding: "9px 16px",
  fontWeight: 600,
  cursor: "pointer",
};

export function EmpresaUsuariosOficinaPanel({
  empresaId,
  getUserId,
  sbSelect,
  showToast,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const caps = getStoredAuthSession(getUserId())?.capabilities;
  const canManage = canManageEmpresaOfficeUsers(caps);

  const reload = useCallback(async () => {
    if (!empresaId) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchEmpresaOfficeUsers(sbSelect, empresaId);
      setUsers(rows);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }, [empresaId, sbSelect]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!isDemoApp()) return null;

  async function handleCreate(form) {
    setSaving(true);
    setModalError("");
    try {
      const result = await createEmpresaOfficeUserDemo({
        empresaId,
        nombre: form.nombre,
        email: form.email,
        rol: form.rol,
        callerUid: getUserId(),
      });
      showToast?.(
        `Usuario creado. Email: ${form.email} · Contraseña: ${result.demoPassword}`,
      );
      setModal(null);
      await reload();
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
        puede_ver_todos: form.puedeVerTodos,
        activo: form.activo,
      };
      const guardMsg = validateJefeFlotaGuard(users, modal.user.id, patch);
      if (guardMsg) {
        setModalError(guardMsg);
        setSaving(false);
        return;
      }
      await patchEmpresaOfficeUser(modal.user.id, patch);
      showToast?.("Usuario actualizado");
      setModal(null);
      await reload();
    } catch (e) {
      setModalError(e.message || "Error al guardar");
    }
    setSaving(false);
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${UI.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: UI.tx }}>Usuarios de oficina</div>
          <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>
            Solo DEMO · gestión básica de roles
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setModalError("");
              setModal({ mode: "add" });
            }}
            style={btnPrimary}
          >
            + Añadir usuario demo
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: UI.muted }}>Cargando usuarios…</div>
      ) : users.length === 0 ? (
        <div style={{ fontSize: 13, color: UI.muted }}>No hay usuarios de oficina registrados.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: UI.muted, fontSize: 11 }}>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Rol</th>
                <th style={thStyle}>Ver todos</th>
                <th style={thStyle}>Activo</th>
                {canManage && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: `1px solid ${UI.border}` }}>
                  <td style={tdStyle}>{u.nombre || "—"}</td>
                  <td style={tdStyle}>{u.email || "—"}</td>
                  <td style={tdStyle}>{officeUserRoleLabel(u.rol)}</td>
                  <td style={tdStyle}>
                    {canManage ? (
                      <Toggle
                        on={u.puedeVerTodos}
                        onChange={(v) =>
                          setEmpresaOfficeUserPuedeVerTodos(u.id, v)
                            .then(reload)
                            .catch((e) => showToast?.(e.message))
                        }
                      />
                    ) : u.puedeVerTodos ? "Sí" : "No"}
                  </td>
                  <td style={tdStyle}>
                    {canManage ? (
                      <Toggle
                        on={u.activo}
                        onChange={(v) => {
                          const guardMsg = validateJefeFlotaGuard(users, u.id, { activo: v });
                          if (guardMsg) {
                            showToast?.(guardMsg);
                            return;
                          }
                          setEmpresaOfficeUserActivo(u.id, v)
                            .then(reload)
                            .catch((e) => showToast?.(e.message));
                        }}
                      />
                    ) : u.activo ? "Sí" : "No"}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => {
                          setModalError("");
                          setModal({ mode: "edit", user: u });
                        }}
                        style={{
                          ...btnSecondary,
                          padding: "5px 10px",
                          fontSize: 12,
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UserFormModal
          mode={modal.mode}
          initial={modal.user}
          saving={saving}
          error={modalError}
          onClose={() => setModal(null)}
          onSave={modal.mode === "add" ? handleCreate : handleEdit}
        />
      )}
    </div>
  );
}

const thStyle = { padding: "8px 6px", fontWeight: 700 };
const tdStyle = { padding: "10px 6px", color: UI.tx, verticalAlign: "middle" };
