import { useState } from "react";
import { PROP_UI, fmtD, fmtT } from "./propietarioTheme.js";
import {
  fetchSupportEmpresaDiagnostic,
  fetchSupportSearch,
  fetchSupportServicioDiagnostic,
  fetchSupportUserDetail,
  resetSuperadminPassword,
  toggleSuperadminConductor,
  toggleSuperadminOfficeUser,
} from "./superadminApi.js";

const cardStyle = {
  background: PROP_UI.card,
  border: `1px solid ${PROP_UI.border}`,
  borderRadius: 12,
  padding: 16,
};

const btnSmall = {
  background: PROP_UI.card,
  color: PROP_UI.text,
  border: `1px solid ${PROP_UI.border}`,
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: PROP_UI.sub, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, color: PROP_UI.text, wordBreak: "break-word" }}>{value ?? "—"}</div>
    </div>
  );
}

export function PropietarioSoporte({ showToast, busy, setBusy, runReload, onVerEmpresaServicios }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showTecnico, setShowTecnico] = useState(false);

  async function doSearch() {
    const q = query.trim();
    if (q.length < 2) {
      showToast("Escribe al menos 2 caracteres");
      return;
    }
    setSearching(true);
    setSelection(null);
    setDetail(null);
    try {
      const data = await fetchSupportSearch(q);
      setResults(data.results || []);
    } catch (e) {
      showToast(e.message);
    }
    setSearching(false);
  }

  async function loadDetail(item) {
    setSelection(item);
    setDetail(null);
    setShowTecnico(false);
    setBusy(true);
    try {
      if (item.type === "usuario") {
        const data = await fetchSupportUserDetail(item.id);
        setDetail({ kind: "usuario", ...data });
      } else if (item.type === "empresa") {
        const data = await fetchSupportEmpresaDiagnostic(item.id);
        setDetail({ kind: "empresa", ...data });
      } else if (item.type === "servicio") {
        const data = await fetchSupportServicioDiagnostic(item.id);
        setDetail({ kind: "servicio", ...data });
      }
    } catch (e) {
      showToast(e.message);
    }
    setBusy(false);
  }

  async function runAction(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (selection) await loadDetail(selection);
      if (runReload) await runReload();
      showToast("Hecho");
    } catch (e) {
      showToast(e.message);
    }
    setBusy(false);
  }

  function copyText(text, label) {
    if (!text) return;
    navigator.clipboard?.writeText(String(text)).then(() => showToast(`${label} copiado`)).catch(() => {});
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Soporte operativo</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="¿Qué cliente o usuario te llama?"
            style={{
              flex: "1 1 280px",
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${PROP_UI.border}`,
              fontSize: 16,
            }}
          />
          <button type="button" style={btnSmall} disabled={searching} onClick={doSearch}>
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: 10, width: "18%" }}>Tipo</th>
                <th style={{ padding: 10, width: "32%" }}>Nombre</th>
                <th style={{ padding: 10 }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={`${r.type}-${r.id}`}
                  onClick={() => loadDetail(r)}
                  style={{
                    borderTop: `1px solid ${PROP_UI.border}`,
                    cursor: "pointer",
                    background: selection?.id === r.id && selection?.type === r.type ? "#f8fafc" : "transparent",
                  }}
                >
                  <td style={{ padding: 10, textTransform: "capitalize" }}>{r.type}</td>
                  <td style={{ padding: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label}
                  </td>
                  <td style={{ padding: 10, color: PROP_UI.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.sublabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail?.kind === "usuario" && detail.usuario && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Estado del usuario</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Field label="Email" value={detail.usuario.email} />
            <Field label="UID" value={detail.usuario.uid} />
            <Field label="Tipo cuenta" value={detail.usuario.tipoCuenta} />
            <Field label="Último acceso" value={detail.usuario.ultimoAcceso ? fmtT(detail.usuario.ultimoAcceso) : "No registrado"} />
            <Field label="Empresa vinculada" value={detail.usuario.empresaVinculada} />
            <Field label="Estado" value={detail.usuario.activo ? "Activo" : "Inactivo"} />
            {detail.usuario.rolOficina && <Field label="Rol oficina" value={detail.usuario.rolOficina} />}
            {detail.usuario.puedeVerTodos != null && (
              <Field label="Puede ver todos" value={detail.usuario.puedeVerTodos ? "Sí" : "No"} />
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" style={btnSmall} onClick={() => copyText(detail.usuario.uid, "UID")}>
              Copiar UID
            </button>
            {detail.usuario.codigoEmpresa && (
              <button type="button" style={btnSmall} onClick={() => copyText(detail.usuario.codigoEmpresa, "Código empresa")}>
                Copiar código empresa
              </button>
            )}
            <button
              type="button"
              style={btnSmall}
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const r = await resetSuperadminPassword(detail.usuario.userId);
                  showToast(r.message);
                })
              }
            >
              Reset contraseña temporal
            </button>
            {detail.usuario.officeUserId && (
              <button
                type="button"
                style={btnSmall}
                disabled={busy}
                onClick={() =>
                  runAction(() =>
                    toggleSuperadminOfficeUser(detail.usuario.officeUserId, !detail.usuario.officeActivo),
                  )
                }
              >
                {detail.usuario.officeActivo ? "Desactivar" : "Activar"}
              </button>
            )}
            {detail.usuario.empresaId && onVerEmpresaServicios && (
              <button
                type="button"
                style={btnSmall}
                onClick={() => onVerEmpresaServicios(detail.usuario.empresaId)}
              >
                Ver servicios empresa
              </button>
            )}
          </div>
          {detail.usuario.serviciosVisibles?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Servicios visibles</div>
              {detail.usuario.serviciosVisibles.map((s) => (
                <div key={s.id} style={{ fontSize: 13, padding: "4px 0" }}>
                  {s.refServicio} · {s.cliente} · {s.estado}
                </div>
              ))}
            </div>
          )}
          {detail.usuario.conductoresVinculos?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Vínculos conductor</div>
              {detail.usuario.conductoresVinculos.map((c) => (
                <div key={c.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${PROP_UI.border}` }}>
                  {c.empresaNombre} · {c.matricula || c.nombre} · {c.activo ? "Activo" : "Inactivo"}
                  <button
                    type="button"
                    style={{ ...btnSmall, marginLeft: 8 }}
                    disabled={busy}
                    onClick={() => runAction(() => toggleSuperadminConductor(c.id, !c.activo))}
                  >
                    {c.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {detail.usuario.serviciosAsignados?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Servicios asignados</div>
              {detail.usuario.serviciosAsignados.map((s) => (
                <div key={s.id} style={{ fontSize: 13, padding: "4px 0" }}>
                  {s.refServicio} · {s.cliente} · {s.estado}
                </div>
              ))}
            </div>
          )}
          {detail.usuario.ultimosDocumentos?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Últimos documentos</div>
              {detail.usuario.ultimosDocumentos.map((d) => (
                <div key={d.id} style={{ fontSize: 13, padding: "4px 0" }}>
                  {d.nombre} · {fmtT(d.createdAt)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {detail?.kind === "empresa" && detail.empresa && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Diagnóstico empresa</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Field label="Empresa" value={detail.empresa.nombre} />
            <Field label="Estado" value={detail.empresa.activa ? "Activa" : "Inactiva"} />
            <Field label="Código" value={detail.empresa.codigoEquipo} />
            <Field label="Conductores activos" value={detail.resumen?.conductoresActivos} />
            <Field label="Conductores inactivos" value={detail.resumen?.conductoresInactivos} />
            <Field label="Oficina activos" value={detail.resumen?.officeActivos} />
            <Field label="Oficina inactivos" value={detail.resumen?.officeInactivos} />
            <Field label="Servicios activos" value={detail.resumen?.serviciosActivos} />
          </div>
          <button
            type="button"
            style={{ ...btnSmall, marginTop: 12 }}
            onClick={() => copyText(detail.empresa.codigoEquipo, "Código empresa")}
          >
            Copiar código empresa
          </button>
          {(detail.officeUsers || []).map((u) => (
            <div key={u.id} style={{ marginTop: 10, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{u.nombre} · {u.email} · {u.rol}</span>
              <button type="button" style={btnSmall} disabled={busy} onClick={() => runAction(() => toggleSuperadminOfficeUser(u.id, !u.activo))}>
                {u.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {detail?.kind === "servicio" && detail.servicio && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Diagnóstico servicio</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Field label="Ref." value={detail.servicio.refServicio} />
            <Field label="Cliente" value={detail.servicio.cliente} />
            <Field label="Ruta" value={detail.servicio.ruta} />
            <Field label="Estado" value={detail.servicio.estado} />
            <Field label="Conductor principal" value={detail.conductorPrincipal || "—"} />
            <Field label="Última actualización" value={fmtT(detail.servicio.updatedAt)} />
          </div>
          {detail.colaboradores?.length > 0 && (
            <Field
              label="Colaboradores"
              value={detail.colaboradores.map((c) => c.nombre).join(", ")}
            />
          )}
          {detail.paradas?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Paradas ({detail.paradas.length})</div>
              {detail.paradas.map((p) => (
                <div key={p.id} style={{ fontSize: 13, padding: "4px 0" }}>
                  {p.nombre} · {p.tipo} · {p.estado}
                </div>
              ))}
            </div>
          )}
          {detail.evidencias?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Evidencias ({detail.evidencias.length})</div>
              {detail.evidencias.map((ev) => (
                <div key={ev.id} style={{ fontSize: 13 }}>{ev.tipo} · {fmtT(ev.createdAt)}</div>
              ))}
            </div>
          )}
          {detail.documentos?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Documentos</div>
              {detail.documentos.map((d) => (
                <div key={d.id} style={{ fontSize: 13 }}>{d.nombre} · {fmtT(d.createdAt)}</div>
              ))}
            </div>
          )}
          <button type="button" style={{ ...btnSmall, marginTop: 12 }} onClick={() => setShowTecnico((v) => !v)}>
            {showTecnico ? "Ocultar técnico" : "Ver datos técnicos"}
          </button>
          {showTecnico && detail.tecnico && (
            <pre style={{ marginTop: 10, fontSize: 11, background: "#f1f5f9", padding: 12, borderRadius: 8, overflow: "auto", maxHeight: 200 }}>
              {JSON.stringify(detail.tecnico, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Errores recientes</div>
        <div style={{ fontSize: 14, color: PROP_UI.sub }}>
          Aún no hay registro automático de errores.
        </div>
      </div>
    </div>
  );
}
