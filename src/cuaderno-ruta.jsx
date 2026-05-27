import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import React from "react";
import {
  SB_URL,
  SB_KEY,
  getSession,
  getUserId,
  getAccessToken,
  setSessionExpiredHandler,
  sbFetch,
  sbSelect,
  sbUpsert,
  sbDelete,
} from "./data/supabaseClient";
import {
  signIn as sbSignIn,
  signOut as sbSignOut,
  signUp as sbSignUp,
  refreshSession as sbRefreshSession,
  resetPassword as sbResetPassword,
} from "./data/session";
import { isDemoApp, isPublicRegistrationAllowed, DEMO_LOGIN_HINT } from "./config/appEnvironment.js";
import { demoDevError, demoDevWarn, isDemoDevUnlocked } from "./lib/demoDevUnlock.js";
import { guardDemoCannotUseProduction } from "./lib/demoSafety.js";
import {
  loadLocalDb as loadDB,
  saveLocalDb as saveDB,
  loadLocalProfile as loadProf,
  saveLocalProfile as saveProf,
  mergeRemoteWithLocalToday,
} from "./data/sync";
import {
  contextKindFromProfileTipo,
  getStoredAuthSession,
  isHybridSession,
} from "./data/authContext";
import { bootstrapAuthSession } from "./auth/resolveAccountCapabilities.js";
import {
  ACCOUNT_TYPES,
  FEATURE_KEYS,
  hasFeature,
  isEmpresaPendingBlocked,
  registrationProfilePayload,
} from "./auth/accountModel.js";
import { isPlatformAdminUid } from "./config/adminUsers.js";
import { ModeSwitchButton } from "./ui/ModeSwitchButton.jsx";
import { EmpresaPendingScreen } from "./ui/EmpresaPendingScreen.jsx";
import { getPushClientContext, initFcmPush } from "./data/fcmPush";
import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  ESTADO_ICON,
  SERVICIO_ESTADOS_ACTIVOS,
} from "./domain/fleet/serviceStatus";
import {
  STOP_COLOR,
  STOP_ICON,
  STOP_TIPOS_FORM,
  STOP_TIPOS_CON_AUTOTACO,
  STOP_TIPO_TO_FIN_EV,
  STOP_TIPO_TO_INICIO_EV,
  formatStopTipoLabel,
} from "./domain/fleet/stopTypes";
import {
  jornadaState,
} from "./domain/journey/journeyStatus";
import { createIsAvail } from "./domain/journey/availability";
import { countCompletedStops, getCurrentStop } from "./domain/service/serviceStops";
import {
  DOCUMENT_TYPES,
  countServiceDocuments,
  getDocumentLabel,
  groupDocumentsByStop,
  fetchEvidenciasGroupedByStop,
  isIncidentDocument,
} from "./domain/service/serviceDocuments";
import {
  countOperationalDocuments,
  filterOperationalEvidencias,
} from "./domain/service/operationalServicioDocs";
import { uploadUserPhoto as uploadPhoto } from "./data/uploadUserPhoto";
import {
  getDriverMediaDisplayBlob,
  runRetentionSweep,
  syncArchivedServicesFromList,
  markServiceArchived,
  getConductorStorageStats,
  purgeAllConductorLocalMediaCaches,
  formatStorageMb,
  touchServiceDocumentAccess,
} from "./data/conductorLocalMediaRetention";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "./domain/service/serviceOperationalStatus";
import { getLastServiceActivity } from "./domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "./domain/service/serviceAttention";
import {
  OPERATIONAL_GROUP_LABEL,
  computeTripOperationalMetrics,
  incidenciaLinesForStop,
} from "./domain/service/tripOperationalDossier.js";
import {
  buildServiceExpediente,
  buildServiceExpedienteListPreview,
  downloadServiceExpedientePdf,
} from "./domain/service/serviceExpediente.js";
import { buildExpedienteForServicio } from "./domain/service/buildExpedienteForServicio.js";
import { geoFromGpsPoint } from "./domain/service/operationalGeo.js";
import { ActiveServicePanel } from "./features/services/components/ActiveServicePanel";
import { cerrarExpedienteServicio } from "./domain/service/cerrarExpedienteServicio.js";
import { getExpedienteCierre, isConductorServicioOperativoActivo, isServicioExpedienteCerrado } from "./domain/service/expedienteCierre.js";
import {
  mergeDriverActiveViewFromResolution,
  pickNextAssignedService,
  sortDriverOperationalCandidates,
} from "./domain/service/driverServiceQueue.js";
import { OperationalEtaSnapshotBlock } from "./features/services/components/OperationalEtaSnapshotBlock.jsx";
import { EmpresaFlotaServiciosList } from "./features/empresa/EmpresaFlotaServiciosList.jsx";
import { EmpresaEditarServicioModal } from "./features/empresa/EmpresaEditarServicioModal.jsx";
import { OperationalEvidenciasStop } from "./features/documents/OperationalEvidenciasStop.jsx";
import {
  fetchIncidenciasExpedientePayload,
  fetchIncidenciasResumenByEmpresa,
} from "./domain/incidencias/incidenciasApi.js";
import {
  EVIDENCIA_SAVED_EVENT,
  INCIDENCIA_SAVED_EVENT,
  mergeEvidenciaIntoByStop,
} from "./domain/documents/operationalEvidenciaSync.js";
import { ExpedienteDocumentsPanel } from "./features/documents/ExpedienteDocumentsPanel.jsx";
import { resolveEvidenciaDisplayImageUrl } from "./domain/documents/operationalDocumentRecord.js";
import {
  EMPRESA_ETA_VISUAL_TICK_MS,
  EMPRESA_FLOTA_DATA_POLL_MS,
  EMPRESA_UBICACION_POLL_MS,
  mergeFlotaServicios,
  mergeFlotaStopsMap,
  mergeFlotaEvsMap,
  patchUbicacionMap,
  stopsRowsToMap,
  servicioIdsForLightStopsRefresh,
  servicioIdsForInitialStopsLoad,
  formatFlotaManualRefreshLabel,
  patchFlotaServicioTrasAsignar,
  filterServiciosForEmpresaVistaTab,
  resolveEmpresaVistaTabKeepingExpandedServicio,
  stopsOperativaSig,
} from "./features/empresa/empresaFlotaRefresh.js";
import {
  ETA_LABEL_INICIAL,
  getOperationalEtaUiState,
  OPERATIONAL_ETA_CALCULATING,
  formatOperationalEtaSnapshotLine,
} from "./domain/service/operationalEtaPresentation.js";
import { useEtaVisualClockMs } from "./domain/service/useEtaVisualClock.js";
import { SendDocumentationModal } from "./features/mail/SendDocumentationModal";
import {
  fetchEmpresaDocumentosExtra,
  fetchServicioDocumentosExtra,
} from "./domain/service/serviceExtraDocuments.js";
import { groupExtraDocsByServicioId } from "./domain/service/extraDocumentExpediente.js";
import { sanitizeDocumentCommentText } from "./domain/documents/documentCommentSanitize.js";
import {
  fetchFlotaServiciosForEmpresa,
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
  servicioPendienteAsignacion,
} from "./domain/fleet/servicioAssignment.js";
import {
  asignarConductorEnServicioCreado,
  mergeServicioTrasAsignacion,
} from "./domain/fleet/servicioCreateFlow.js";
import { insertStopsForServicio } from "./domain/fleet/servicioStopsInsert.js";
import { ensureServicioHasStops } from "./domain/fleet/servicioAssignment.js";
import { conductorUidOperativoServicio } from "./domain/fleet/operationalPlaceholderConductor.js";
import { readViajeActivoFromStorage, getUnifiedTripPresentation } from "./domain/service/activeTripState.js";
import { getServiceEta } from "./domain/service/serviceEta.js";
import {
  formatOperationalEtaLabel,
  isRelativeEtaLabel,
} from "./domain/service/etaFormatter.js";
import { shouldPersistOperationalEtaRefresh } from "./domain/service/operationalEtaRefreshPolicy.js";
import {
  mergeReferenciaOperacional,
  getServicioOperacionMeta,
  getOperationalTripStartedAt,
  getOperationalPlanSnapshot,
  getOperationalEtaSnapshot,
  getOperationalPlanConfirmedAt,
} from "./domain/service/serviceOperacionMeta.js";
import { buildEtaPrevistaFromRoutePlan } from "./domain/service/etaPrevista.js";
import {
  buildServiceIdentityMeta,
  getFixedServiceRoute,
  getServiceClient,
  getServiceClientReference,
  getServiceNumber,
  resolveServiceRouteEndpoints,
} from "./domain/service/serviceIdentity.js";
import {
  buildOperationalPlacesMetaPatch,
  routeTextFromOperationalPlaces,
  servicioMatchesSearchQuery,
} from "./domain/service/serviceOperationalPlaces.js";
import { formatStopNotesForDisplay, getInicioOperacionMs, mergeStopOperacionMeta } from "./domain/service/stopOperacionMeta.js";
import EmpresaLayout from "./layouts/EmpresaLayout";
import { EquipoInvitacionModal, buildEquipoDeepLink } from "./components/EquipoInvitacionModal.jsx";
import { getConductorTabs } from "./navigation/conductorTabs";
import { BrandHeader, BrandMark } from "./ui/BrandHeader.jsx";
import { STATE_TONES, UI_TOKENS } from "./ui/visualTokens.js";
import {
  LIM,
  geocode,
  localFind,
  getRoute,
  buildPlan,
  fmtT,
  fmtDur,
  TRUCK_KMH,
  haverDist,
  p2,
  revGeo,
} from "./domain/route/routePlanning.js";
import { bootstrapOperationalFlowOnConductorAssign } from "./domain/fleet/servicioOperationalBootstrap.js";
import {
  SERVICIO_OWNERSHIP,
  buildConductorOwnServiciosQuery,
  normalizeServicioConductorIdForInsert,
  normalizeServicioEmpresaId,
  resolveServicioInsertContext,
} from "./domain/service/serviceOwnership.js";

// ─────────────────────────────────────────────────────────────
//  ERROR BOUNDARY — evita pantalla negra en errores de render
// ─────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(e){return{error:e};}
  componentDidCatch(e,info){console.error("App error:",e,info);}
  render(){
    if(this.state.error){
      return(
        <div style={{background:"#0F172A",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"sans-serif"}}>
          <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
          <div style={{fontSize:18,fontWeight:800,color:"#F59E0B",marginBottom:8}}>Algo ha fallado</div>
          <div style={{fontSize:13,color:"#64748B",marginBottom:24,textAlign:"center",maxWidth:320,lineHeight:1.6}}>{this.state.error?.message||"Error desconocido"}</div>
          <button onClick={()=>{this.setState({error:null});window.location.reload();}} style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:10,padding:"12px 28px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
            Reiniciar app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────
//  PANTALLA DE LOGIN / REGISTRO
// ─────────────────────────────────────────────────────────────
function PaywallScreen({status,user,email}){
  const[loading,setLoading]=useState(null);
  const[error,setError]=useState("");

  async function checkout(plan){
    setLoading(plan);setError("");
    try{
      const tok=getAccessToken();
      const r=await fetch("/api/stripe",{method:"POST",headers:{"Content-Type":"application/json",...(tok?{Authorization:`Bearer ${tok}`}:{})},
        body:JSON.stringify({action:"create_checkout",user_id:user,email,plan})});
      const d=await r.json();
      if(d.url)window.location.href=d.url;
      else setError(d.error||"Error al crear sesión de pago");
    }catch(e){setError("Error de conexión");}
    setLoading(null);
  }

  const isExpired=status.status==="expired";
  const isCancelled=status.status==="cancelled";
  const isPayFailed=status.status==="payment_failed";

  return(
    <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <BrandMark size={56} rounded={14}/>
      <div style={{fontSize:22,fontWeight:800,color:"#F59E0B",marginTop:12,marginBottom:6}}>CUADERNO DE RUTA</div>

      <div style={{width:"100%",maxWidth:380,background:"#1E293B",borderRadius:18,padding:"28px 24px",boxShadow:"0 8px 32px rgba(0,0,0,.4)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:8}}>{isExpired?"⏰":isCancelled?"❌":"⚠️"}</div>
          <div style={{fontSize:18,fontWeight:800,color:"white",marginBottom:6}}>
            {isExpired?"Periodo de prueba terminado":isCancelled?"Suscripción cancelada":"Pago fallido"}
          </div>
          <div style={{fontSize:14,color:"#64748B",lineHeight:1.6}}>
            {isExpired?"Tu prueba gratuita de 14 días ha terminado. Elige un plan para seguir usando la app.":
             isCancelled?"Tu suscripción ha sido cancelada. Reactívala para seguir usando la app.":
             "No se pudo procesar el último pago. Actualiza tu método de pago."}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
          {/* Plan mensual */}
          <button onClick={()=>checkout("monthly")} disabled={loading==="monthly"}
            style={{background:loading==="monthly"?"#334155":"#F59E0B",color:loading==="monthly"?"#64748B":"#0F172A",border:"none",borderRadius:14,padding:"18px 20px",cursor:loading?"default":"pointer",textAlign:"left"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:16,fontWeight:800}}>{loading==="monthly"?"⏳ Redirigiendo...":"Plan Mensual"}</div>
                <div style={{fontSize:13,opacity:.8,marginTop:2}}>Cancela cuando quieras</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:24,fontWeight:800}}>7,99€</div>
                <div style={{fontSize:11,opacity:.7}}>/ mes</div>
              </div>
            </div>
          </button>

          {/* Plan anual */}
          <button onClick={()=>checkout("annual")} disabled={loading==="annual"}
            style={{background:loading==="annual"?"#334155":"#1E3A5F",color:"white",border:"2px solid #3B82F6",borderRadius:14,padding:"18px 20px",cursor:loading?"default":"pointer",textAlign:"left",position:"relative"}}>
            <div style={{position:"absolute",top:-10,right:16,background:"#22C55E",color:"white",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800}}>AHORRA 28%</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:16,fontWeight:800}}>{loading==="annual"?"⏳ Redirigiendo...":"Plan Anual"}</div>
                <div style={{fontSize:13,color:"#94A3B8",marginTop:2}}>Equivale a 5,75€/mes</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:24,fontWeight:800,color:"#F59E0B"}}>69€</div>
                <div style={{fontSize:11,color:"#64748B"}}>/ año</div>
              </div>
            </div>
          </button>
        </div>

        {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#DC2626",marginBottom:12}}>{error}</div>}

        <div style={{fontSize:11,color:"#475569",textAlign:"center",lineHeight:1.6}}>
          🔒 Pago seguro con Stripe · Cancela en cualquier momento<br/>
          Incluye tacógrafo digital, planificación de rutas y normativa EU 561/2006
        </div>

        <button onClick={()=>{sbSignOut();window.location.reload();}}
          style={{width:"100%",background:"transparent",color:"#475569",border:"none",marginTop:16,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const demoMode = isDemoApp();
  const allowRegister = isPublicRegistrationAllowed();
  const [mode, setMode] = useState("login");
  const [tipo, setTipo] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const iStyle = { width:"100%", background:"#0F172A", border:"1.5px solid #334155", borderRadius:11, padding:"12px 14px", fontSize:16, color:"#F1F5F9", outline:"none", fontFamily:"Outfit, sans-serif", boxSizing:"border-box" };

  // Validación contraseña
  const pwdChecks = {
    length:   password.length >= 8,
    upper:    /[A-Z]/.test(password),
    special:  /[^A-Za-z0-9]/.test(password),
  };
  const pwdOk = Object.values(pwdChecks).every(Boolean);

  async function handleSubmit() {
    setError(""); setOk("");
    if (!email.trim()) { setError("Introduce tu email"); return; }
    if (mode === "forgot") {
      setLoading(true);
      try {
        await sbResetPassword(email.trim());
        setOk("Te hemos enviado un email para recuperar tu contraseña.");
      } catch(e) { setError(e.message); }
      finally { setLoading(false); }
      return;
    }
    if (!password) { setError("Introduce tu contraseña"); return; }
    if (mode === "register") {
      if (!allowRegister) { setError("Registro desactivado en este entorno"); return; }
      if (!nombre.trim()) { setError("El nombre es obligatorio"); return; }
      if (!tipo) { setError("Elige tu tipo de cuenta: Conductor, Autónomo PRO o Empresa"); return; }
      if (!pwdOk) { setError("La contraseña no cumple los requisitos"); return; }
      if (password !== password2) { setError("Las contraseñas no coinciden"); return; }
    }
    setLoading(true);
    try {
      if (mode === "register") {
        await sbSignUp(email.trim(), password);
        await sbSignIn(email.trim(), password);
        const uid = getUserId();
        if (!uid) {
          throw new Error(
            "Registro sin sesión. En Supabase demo: activa sign-ups, desactiva confirmación por email y revisa rate limits.",
          );
        }
        const profRes = await sbFetch("/rest/v1/profiles", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            id: uid,
            nombre: nombre.trim(),
            ...registrationProfilePayload(tipo),
          }),
        });
        if (!profRes.ok) {
          const profErr = await profRes.text().catch(() => "");
          if (isDemoDevUnlocked()) {
            demoDevError("profiles POST", profRes.status, profErr);
          }
          throw new Error(
            `No se pudo crear el perfil (HTTP ${profRes.status}). ${isDemoDevUnlocked() ? profErr.slice(0, 120) : ""}`.trim(),
          );
        }
        await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "bienvenida",
            email: email.trim(),
            nombre: nombre.trim(),
            tipo,
          }),
        }).catch((e) => {
          if (isDemoDevUnlocked()) demoDevWarn("bienvenida email omitido:", e?.message);
        });
        await bootstrapAuthSession(uid, sbSelect, {
          preferMode: contextKindFromProfileTipo(tipo),
        });
        onAuth();
        setTimeout(() => window.location.reload(), 500);
      } else {
        await sbSignIn(email.trim(), password);
        const uid = getUserId();
        const profLogin = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
        if (profLogin[0]?.is_archived) {
          await sbSignOut();
          throw new Error("Esta cuenta está archivada. Contacta con administración.");
        }
        await bootstrapAuthSession(uid, sbSelect);
        onAuth();
        setTimeout(()=>window.location.reload(), 100);
      }
    } catch(e) {
      if (isDemoDevUnlocked()) {
        demoDevError("AuthScreen catch", { mode, message: e?.message, error: e });
      }
      setError(mode === "login" ? "Email o contraseña incorrectos" : e.message);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0F172A", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", fontFamily:"Outfit, sans-serif" }}>
      <BrandMark size={64} rounded={16} />
      <div style={{ fontSize:24, fontWeight:800, color:"#F1F5F9", marginTop:12, marginBottom:4, letterSpacing:.4 }}>CUADERNO DE RUTA{demoMode?" · DEMO":""}</div>
      <div style={{ fontSize:13, color:"#94A3B8", marginBottom:demoMode?12:32 }}>El copiloto del transportista · EU 561/2006</div>

      {demoMode?(
        <div style={{ width:"100%", maxWidth:390, background:STATE_TONES.info.bg, border:`1.5px solid ${STATE_TONES.info.border}`, borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:800, color:STATE_TONES.info.fg, marginBottom:6 }}>Entorno demo aislado</div>
          <div style={{ fontSize:11, color:"#334155", lineHeight:1.5 }}>
            Empresa: <strong>{DEMO_LOGIN_HINT.empresa}</strong><br/>
            Autónomo PRO: <strong>{DEMO_LOGIN_HINT.autonomoPro}</strong><br/>
            Conductor: <strong>{DEMO_LOGIN_HINT.conductor}</strong><br/>
            Contraseña: <strong>{DEMO_LOGIN_HINT.password}</strong>
          </div>
        </div>
      ):null}

      <div style={{ width:"100%", maxWidth:390, background:"#1E293B", borderRadius:18, padding:"28px 24px", boxShadow:"0 10px 36px rgba(2,6,23,.45)", border:"1px solid #334155" }}>

        {mode !== "forgot" && allowRegister && (
          <div style={{ display:"flex", background:"#0F172A", borderRadius:10, padding:4, marginBottom:24 }}>
            {[["login","Iniciar sesión"],["register","Crear cuenta"]].map(([m,l])=>(
              <button key={m} onClick={()=>{setMode(m);setError("");setOk("");setTipo("");setNombre("");setPassword("");setPassword2("");}}
                style={{ flex:1, background:mode===m?UI_TOKENS.brand:"transparent", color:mode===m?"#0F172A":"#94A3B8", border:"none", borderRadius:8, padding:"9px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Outfit, sans-serif" }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {mode === "forgot" && (
          <div style={{ marginBottom:20 }}>
            <button onClick={()=>{setMode("login");setError("");setOk("");}} style={{ background:"transparent", border:"none", color:"#94A3B8", fontSize:13, cursor:"pointer", fontFamily:"Outfit, sans-serif", marginBottom:12 }}>← Volver</button>
            <div style={{ fontSize:16, fontWeight:800, color:"#F1F5F9", fontFamily:"Outfit, sans-serif" }}>Recuperar contraseña</div>
            <div style={{ fontSize:12, color:"#94A3B8", marginTop:4, fontFamily:"Outfit, sans-serif" }}>Te enviaremos un email de recuperación</div>
          </div>
        )}

        {/* Tipo usuario */}
        {mode === "register" && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, color:"#64748B", fontWeight:700, marginBottom:8, fontFamily:"sans-serif" }}>¿QUIÉN ERES?</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:8 }}>
              {[
                {id:ACCOUNT_TYPES.CONDUCTOR, icon:"◎", title:"Conductor", sub:"Servicios asignados por tu empresa"},
                {id:ACCOUNT_TYPES.AUTONOMO_PRO, icon:"◉", title:"Autónomo PRO", sub:"Tus servicios y documentación propia"},
                {id:ACCOUNT_TYPES.EMPRESA, icon:"◇", title:"Empresa", sub:"Gestión de flota y equipo"},
              ].map(({id,icon,title,sub})=>(
                <button key={id} onClick={()=>setTipo(id)}
                  style={{ background:tipo===id?"#F59E0B15":"#0F172A", border:`2px solid ${tipo===id?"#F59E0B":"#334155"}`, borderRadius:10, padding:"12px 8px", cursor:"pointer", textAlign:"center" }}>
                  <div style={{ fontSize:20, marginBottom:4, color:tipo===id?"#F59E0B":"#64748B" }}>{icon}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:tipo===id?"#F59E0B":"#F1F5F9", fontFamily:"sans-serif", lineHeight:1.3 }}>{title}</div>
                  <div style={{ fontSize:10, color:"#64748B", marginTop:3, fontFamily:"sans-serif" }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nombre */}
        {mode === "register" && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, color:"#64748B", fontWeight:700, marginBottom:6, fontFamily:"sans-serif" }}>
              {tipo==="empresa" ? "NOMBRE DE LA EMPRESA *" : "TU NOMBRE *"}
            </div>
            <input type="text" value={nombre} onChange={e=>setNombre(e.target.value)}
              placeholder={tipo==="empresa" ? "Transportes García S.L." : "Juan García López"}
              style={iStyle}/>
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"#64748B", fontWeight:700, marginBottom:6, fontFamily:"sans-serif" }}>EMAIL</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            placeholder="tu@email.com" style={iStyle}/>
        </div>

        {/* Contraseña con ojo */}
        {mode !== "forgot" && (
          <div style={{ marginBottom:mode==="register"?8:16 }}>
            <div style={{ fontSize:12, color:"#64748B", fontWeight:700, marginBottom:6, fontFamily:"sans-serif" }}>CONTRASEÑA</div>
            <div style={{ position:"relative" }}>
              <input type={showPwd?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                placeholder={mode==="register"?"Mínimo 8 caracteres":"Tu contraseña"}
                style={{...iStyle, paddingRight:"44px"}}/>
              <button onClick={()=>setShowPwd(v=>!v)}
                style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:18, color:"#64748B", padding:0, lineHeight:1 }}>
                {showPwd?"🙈":"👁️"}
              </button>
            </div>
            {/* Requisitos contraseña solo en registro */}
            {mode==="register" && password.length>0 && (
              <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                {[
                  [pwdChecks.length,  "Mínimo 8 caracteres"],
                  [pwdChecks.upper,   "Al menos una mayúscula"],
                  [pwdChecks.special, "Al menos un símbolo (!, @, #...)"],
                ].map(([ok, txt])=>(
                  <div key={txt} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:ok?"#22C55E":"#EF4444", fontFamily:"sans-serif" }}>
                    <span>{ok?"✓":"✗"}</span><span>{txt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Repetir contraseña con ojo */}
        {mode === "register" && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, color:"#64748B", fontWeight:700, marginBottom:6, fontFamily:"sans-serif" }}>REPITE CONTRASEÑA</div>
            <div style={{ position:"relative" }}>
              <input type={showPwd2?"text":"password"} value={password2} onChange={e=>setPassword2(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                placeholder="Repite tu contraseña"
                style={{...iStyle, paddingRight:"44px", borderColor:password2&&password2!==password?"#EF4444":"#334155"}}/>
              <button onClick={()=>setShowPwd2(v=>!v)}
                style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:18, color:"#64748B", padding:0, lineHeight:1 }}>
                {showPwd2?"🙈":"👁️"}
              </button>
            </div>
            {password2 && password2!==password && (
              <div style={{ fontSize:12, color:"#EF4444", marginTop:4, fontFamily:"sans-serif" }}>✗ Las contraseñas no coinciden</div>
            )}
            {password2 && password2===password && pwdOk && (
              <div style={{ fontSize:12, color:"#22C55E", marginTop:4, fontFamily:"sans-serif" }}>✓ Contraseñas coinciden</div>
            )}
          </div>
        )}

        {mode === "login" && (
          <button onClick={()=>{setMode("forgot");setError("");setOk("");}}
            style={{ background:"transparent", border:"none", color:"#64748B", fontSize:12, cursor:"pointer", fontFamily:"sans-serif", marginBottom:16, textDecoration:"underline", padding:0 }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {error && <div style={{ background:STATE_TONES.danger.bg, border:`1.5px solid ${STATE_TONES.danger.border}`, borderRadius:9, padding:"10px 14px", fontSize:14, color:STATE_TONES.danger.fg, marginBottom:14, fontFamily:"Outfit, sans-serif" }}>⚠️ {error}</div>}
        {ok    && <div style={{ background:STATE_TONES.success.bg, border:`1.5px solid ${STATE_TONES.success.border}`, borderRadius:9, padding:"10px 14px", fontSize:14, color:STATE_TONES.success.fg, marginBottom:14, fontFamily:"Outfit, sans-serif" }}>✅ {ok}</div>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", background:loading?"#475569":UI_TOKENS.brand, color:"#0F172A", border:"none", borderRadius:12, padding:"15px", fontSize:17, fontWeight:800, cursor:loading?"default":"pointer", fontFamily:"Outfit, sans-serif", marginTop:4, boxShadow:loading?"none":"0 8px 18px rgba(245,158,11,.25)" }}>
          {loading ? "⏳ Espera..." : mode==="login" ? "▶ ENTRAR" : mode==="register" ? "✓ CREAR CUENTA" : "📧 ENVIAR EMAIL"}
        </button>

        {mode === "register" && (
          <div style={{ fontSize:12, color:"#64748B", textAlign:"center", marginTop:14, lineHeight:1.7, fontFamily:"sans-serif" }}>
            Al crear tu cuenta recibirás un email de bienvenida.<br/>
            {tipo==="empresa" && <span style={{color:"#F59E0B"}}>📧 Te contactaremos para configurar tu flota.</span>}
          </div>
        )}
      </div>
    </div>
  );
}
const KM_KEY="cuaderno_km_v1";
const PROF0={nombre:"",dni:"",empresa:"",matricula:"",remolque:"",tipoVehiculo:"articulado",licencia:"",paisBase:"ES",ccaa:"AN",abroadNow:false,tipoServicio:"nacional",lang:"es",cif:"",direccion:"",telefono:"",emailEmpresa:"",cp:"",ciudad:"",tipo_cuenta:ACCOUNT_TYPES.CONDUCTOR,canDrive:false};

// Símbolos oficiales tacógrafo EU (renderizados como SVG inline en los botones)
// ⊙ conducción · ⊓ pausa/descanso · ⊠ disponibilidad · ✱ otros trabajos
const EV={
  inicio_jornada:        {label:"Inicio Jornada",         icon:"▶",  color:"#22C55E",kind:"solo"},
  fin_jornada:           {label:"Fin Jornada",            icon:"■",  color:"#475569",kind:"solo"},
  continuar_jornada:     {label:"Continuar Jornada",      icon:"↩",  color:"#22C55E",kind:"solo"},
  inicio_conduccion:     {label:"Conducción",             icon:"⊙",  color:"#F59E0B",kind:"open", pair:"fin_conduccion"},   // ⊙ = volante
  fin_conduccion:        {label:"Fin Conducción",         icon:"⊙",  color:"#EF4444",kind:"close",pair:"inicio_conduccion"},
  inicio_pausa:          {label:"Pausa / Descanso",       icon:"🛌", color:"#6366F1",kind:"open", pair:"fin_pausa",minDur:45}, // 🛌 = cama
  fin_pausa:             {label:"Fin Pausa",              icon:"🛌", color:"#818CF8",kind:"close",pair:"inicio_pausa"},
  inicio_descanso:       {label:"Descanso",               icon:"🛌", color:"#7C3AED",kind:"open", pair:"fin_descanso",minDur:540},
  fin_descanso:          {label:"Fin Descanso",           icon:"✓",  color:"#16A34A",kind:"close",pair:"inicio_descanso"},
  inicio_descanso_frac:  {label:"Descanso frac. 1ª parte",icon:"🛌", color:"#A78BFA",kind:"open", pair:"fin_descanso_frac",minDur:180},
  fin_descanso_frac:     {label:"Fin Descanso frac. 1ª",  icon:"✓",  color:"#7C3AED",kind:"close",pair:"inicio_descanso_frac"},
  inicio_disponibilidad: {label:"Disponible",             icon:"▨",  color:"#06B6D4",kind:"open", pair:"fin_disponibilidad"}, // ▨ = cuadrado tachado
  fin_disponibilidad:    {label:"Fin Disponible",         icon:"▨",  color:"#0891B2",kind:"close",pair:"inicio_disponibilidad"},
  inicio_pasajero:       {label:"Acompañante / pasajero", icon:"▨",  color:"#0EA5E9",kind:"open", pair:"fin_pasajero"},       // también disponibilidad
  fin_pasajero:          {label:"Fin Acompañante",        icon:"▨",  color:"#0284C7",kind:"close",pair:"inicio_pasajero"},
  inicio_otros:          {label:"Otros Trabajos",         icon:"⚒",  color:"#F97316",kind:"open", pair:"fin_otros"},          // ⚒ = martillos
  fin_otros:             {label:"Fin Otros Trab.",        icon:"⚒",  color:"#EA580C",kind:"close",pair:"inicio_otros"},
  inicio_repostaje:      {label:"Repostaje",              icon:"⚒",  color:"#F59E0B",kind:"open", pair:"fin_repostaje"},
  fin_repostaje:         {label:"Fin Repostaje",          icon:"⚒",  color:"#D97706",kind:"close",pair:"inicio_repostaje"},
  inicio_inspeccion:     {label:"Inspección pre-viaje",   icon:"⚒",  color:"#64748B",kind:"open", pair:"fin_inspeccion"},
  fin_inspeccion:        {label:"Fin Inspección",         icon:"⚒",  color:"#475569",kind:"close",pair:"inicio_inspeccion"},
  inicio_carga:          {label:"Carga",                  icon:"⚒",  color:"#84CC16",kind:"open", pair:"fin_carga"},
  fin_carga:             {label:"Fin Carga",              icon:"⚒",  color:"#65A30D",kind:"close",pair:"inicio_carga"},
  inicio_descarga:       {label:"Descarga",               icon:"⚒",  color:"#14B8A6",kind:"open", pair:"fin_descarga"},
  fin_descarga:          {label:"Fin Descarga",           icon:"⚒",  color:"#0F766E",kind:"close",pair:"inicio_descarga"},
  inicio_carga_descarga: {label:"Carga+Descarga",         icon:"⚒",  color:"#8B5CF6",kind:"open", pair:"fin_carga_descarga"},
  fin_carga_descarga:    {label:"Fin Carga+Descarga",     icon:"⚒",  color:"#7C3AED",kind:"close",pair:"inicio_carga_descarga"},
  inicio_ferry:          {label:"Ferry / Tren",           icon:"⛴",  color:"#0EA5E9",kind:"open", pair:"fin_ferry"},          // ⛴ = barco
  fin_ferry:             {label:"Fin Ferry / Tren",       icon:"⛴",  color:"#0284C7",kind:"close",pair:"inicio_ferry"},
  nota:                  {label:"Nota",                   icon:"📝", color:"#64748B",kind:"solo"},
  incidencia:            {label:"Incidencia",             icon:"⚠️", color:"#F97316",kind:"solo"},
  art12:                 {label:"Art.12 — Fuerza Mayor",  icon:"🚨", color:"#DC2626",kind:"solo"},
};

const GROUPS=[
  {label:"JORNADA",          color:"#22C55E",info:"Inicio/fin de jornada laboral",btns:["inicio_jornada","fin_jornada","continuar_jornada"]},
  {label:"⊙ CONDUCCIÓN",     color:"#F59E0B",info:"Máx. 4h30 continua · 9h/10h · Superar = MULTA",btns:["inicio_conduccion","fin_conduccion"]},
  {label:"🛌 PAUSA/DESCANSO", color:"#6366F1",info:"Pausa ≥45 min (o 15+30 en ese orden) · Descanso ≥9h entre jornadas",btns:["inicio_pausa","fin_pausa","inicio_descanso","fin_descanso","inicio_descanso_frac","fin_descanso_frac"]},
  {label:"▨ DISPONIBLE",     color:"#06B6D4",info:"Espera sin conducir — frontera, cola, acompañante. También ferry ⛴",btns:["inicio_disponibilidad","fin_disponibilidad","inicio_pasajero","fin_pasajero","inicio_ferry","fin_ferry"]},
  {label:"⚒ OTROS TRABAJOS", color:"#F97316",info:"Carga, descarga, mecánica — cuenta en ventana diaria pero no como conducción",btns:["inicio_repostaje","fin_repostaje","inicio_inspeccion","fin_inspeccion","inicio_carga","fin_carga","inicio_descarga","fin_descarga","inicio_carga_descarga","fin_carga_descarga","inicio_otros","fin_otros"]},
  {label:"ANOTACIONES",      color:"#64748B",info:"Notas, incidencias, Art.12 fuerza mayor",btns:["nota","incidencia","art12"]},
];

const TMPLS=[
  {id:"cmr",       icon:"📄",label:"CMR — Carta de Porte",color:"#0EA5E9",fields:[
    {key:"num_cmr",        label:"Nº CMR",              type:"text", required:true},
    {key:"lugar_fecha",    label:"Lugar y fecha",        type:"text", placeholder:"Madrid, 24/04/2026"},
    {key:"remitente",      label:"Remitente",            type:"textarea",required:true,placeholder:"Nombre, dirección..."},
    {key:"destinatario",   label:"Destinatario",         type:"textarea",required:true,placeholder:"Nombre, dirección..."},
    {key:"lugar_entrega",  label:"Lugar de entrega",     type:"text"},
    {key:"lugar_carga",    label:"Lugar de carga",       type:"text"},
    {key:"fecha_carga",    label:"Fecha de carga",       type:"date"},
    {key:"naturaleza",     label:"Naturaleza mercancía", type:"textarea"},
    {key:"peso_bruto",     label:"Peso bruto (kg)",      type:"text"},
    {key:"matricula",      label:"Matrícula vehículo",   type:"text"},
    {key:"observations",   label:"Observaciones",        type:"textarea"},
  ]},
  {id:"accidente",icon:"🚨",label:"Parte de Accidente", color:"#EF4444",fields:[
    {key:"fecha",      label:"Fecha y hora",    type:"datetime-local", required:true},
    {key:"lugar",      label:"Lugar exacto",   type:"text",  required:true, placeholder:"Autopista AP-7 km 234"},
    {key:"descripcion",label:"Descripción",    type:"textarea",required:true,placeholder:"¿Qué pasó?"},
    {key:"terceros",   label:"Terceros implicados",type:"textarea",placeholder:"Matrícula, nombre, seguro..."},
    {key:"lesiones",   label:"Heridos",        type:"text",  placeholder:"Sin heridos / describir"},
    {key:"policia",    label:"Policía / Atestado",type:"text",placeholder:"Nº atestado, cuerpo..."},
  ]},
  {id:"carga_inc",icon:"📦",label:"Incidencia de Carga",color:"#F59E0B",fields:[
    {key:"fecha",      label:"Fecha y hora",    type:"datetime-local", required:true},
    {key:"lugar",      label:"Lugar",           type:"text",  required:true},
    {key:"tipo",       label:"Mercancía",       type:"text",  required:true},
    {key:"descripcion",label:"Descripción del problema",type:"textarea",required:true},
    {key:"albaran",    label:"Nº Albarán / CMR",type:"text"},
  ]},
  {id:"policia",  icon:"🚔",label:"Control Policial / Multa",color:"#3B82F6",fields:[
    {key:"fecha",      label:"Fecha y hora",    type:"datetime-local", required:true},
    {key:"lugar",      label:"Lugar",           type:"text",  required:true},
    {key:"cuerpo",     label:"Cuerpo policial", type:"text",  placeholder:"Guardia Civil, Mossos..."},
    {key:"resultado",  label:"Resultado / Observaciones",type:"textarea",required:true},
    {key:"multa",      label:"Importe multa (€)",type:"text", placeholder:"0 si sin multa"},
    {key:"boletín",    label:"Nº boletín / expediente",type:"text"},
  ]},
  {id:"tacografo",icon:"⏱",label:"Revisión Tacógrafo",color:"#6366F1",fields:[
    {key:"fecha",      label:"Fecha",           type:"date",  required:true},
    {key:"taller",     label:"Taller / Empresa",type:"text",  required:true},
    {key:"tipo",       label:"Tipo revisión",   type:"text",  placeholder:"Calibración, inspección..."},
    {key:"resultado",  label:"Resultado",       type:"textarea"},
    {key:"proxima",    label:"Próxima revisión",type:"date"},
  ]},
  {id:"averia",   icon:"🔧",label:"Avería",            color:"#64748B",fields:[
    {key:"fecha",      label:"Fecha y hora",    type:"datetime-local", required:true},
    {key:"lugar",      label:"Lugar",           type:"text",  required:true},
    {key:"descripcion",label:"Descripción",     type:"textarea",required:true},
    {key:"taller",     label:"Taller / Grúa",  type:"text"},
    {key:"km",         label:"Km actuales",     type:"text"},
  ]},
  {id:"revision", icon:"🔍",label:"Revisión Camión",   color:"#14B8A6",fields:[
    {key:"fecha",      label:"Fecha",           type:"date",  required:true},
    {key:"km",         label:"Kilómetros",      type:"text",  required:true},
    {key:"taller",     label:"Taller",          type:"text"},
    {key:"trabajos",   label:"Trabajos realizados",type:"textarea",required:true},
    {key:"proxima_km", label:"Próxima revisión (km)",type:"text"},
    {key:"coste",      label:"Coste (€)",       type:"text"},
  ]},
  {id:"frontera", icon:"🛃",label:"Retraso en Frontera",color:"#A78BFA",fields:[
    {key:"fecha",      label:"Llegada frontera",type:"datetime-local", required:true},
    {key:"frontera",   label:"Paso fronterizo", type:"text",  required:true,placeholder:"Irún, La Jonquera..."},
    {key:"espera",     label:"Espera real (h)", type:"text",  required:true},
    {key:"motivo",     label:"Motivo",          type:"textarea"},
  ]},
  {id:"otros",    icon:"📝",label:"Otros",              color:"#94A3B8",fields:[
    {key:"fecha",      label:"Fecha",           type:"date",  required:true},
    {key:"tipo",       label:"Tipo de documento",type:"text", required:true},
    {key:"descripcion",label:"Descripción",     type:"textarea",required:true},
    {key:"referencia", label:"Referencia / Nº", type:"text"},
  ]},
];

// ── TRADUCCIONES ──
const LANGS=[
  {code:"es",label:"Español",flag:"🇪🇸"},{code:"en",label:"English",flag:"🇬🇧"},
  {code:"pt",label:"Português",flag:"🇵🇹"},{code:"ro",label:"Română",flag:"🇷🇴"},
  {code:"pl",label:"Polski",flag:"🇵🇱"},{code:"de",label:"Deutsch",flag:"🇩🇪"},
];
const TX={
  appName:{es:"CUADERNO DE RUTA",en:"ROUTE LOGBOOK",pt:"CADERNO DE ROTA",ro:"JURNAL DE RUTĂ",pl:"DZIENNIK TRASY",de:"FAHRTENBUCH"},
  tabHoy:{es:"HOY",en:"TODAY",pt:"HOJE",ro:"AZI",pl:"DZIŚ",de:"HEUTE"},
  tabResumen:{es:"RESUMEN",en:"SUMMARY",pt:"RESUMO",ro:"REZUMAT",pl:"PODSUMOW.",de:"ÜBERSICHT"},
  tabDocs:{es:"DOCS",en:"DOCS",pt:"DOCS",ro:"DOCUM.",pl:"DOKUMENTY",de:"DOKUM."},
  tabPerfil:{es:"PERFIL",en:"PROFILE",pt:"PERFIL",ro:"PROFIL",pl:"PROFIL",de:"PROFIL"},
  jornadaAbierta:{es:"🟢 ABIERTA",en:"🟢 OPEN",pt:"🟢 ABERTA",ro:"🟢 DESCHIS",pl:"🟢 OTWARTA",de:"🟢 OFFEN"},
  jornadaCerrada:{es:"🔴 CERRADA",en:"🔴 CLOSED",pt:"🔴 FECHADA",ro:"🔴 ÎNCHIS",pl:"🔴 ZAMKNIĘTA",de:"🔴 GESCHL."},
  sinJornada:{es:"⚪ SIN JORNADA",en:"⚪ NO SHIFT",pt:"⚪ SEM TURNO",ro:"⚪ FĂRĂ TURĂ",pl:"⚪ BEZ ZMIANY",de:"⚪ KEINE S."},
  iniciarJornada:{es:"▶ INICIAR JORNADA",en:"▶ START SHIFT",pt:"▶ INICIAR TURNO",ro:"▶ ÎNCEPE TURA",pl:"▶ ROZPOCZNIJ ZMIANĘ",de:"▶ SCHICHT STARTEN"},
  nuevaJornada:{es:"▶ Nueva jornada",en:"▶ New shift",pt:"▶ Novo turno",ro:"▶ Tură nouă",pl:"▶ Nowa zmiana",de:"▶ Neue Schicht"},
  continuar:{es:"↩ Continuar",en:"↩ Continue",pt:"↩ Continuar",ro:"↩ Continuă",pl:"↩ Kontynuuj",de:"↩ Fortsetzen"},
  salir:{es:"Salir",en:"Log out",pt:"Sair",ro:"Ieșire",pl:"Wyloguj",de:"Abmelden"},
  puedoConducir:{es:"puedo conducir",en:"can drive",pt:"posso conduzir",ro:"pot conduce",pl:"mogę jechać",de:"kann fahren"},
  paraConducir:{es:"para conducir",en:"until drive",pt:"para conduzir",ro:"până la condus",pl:"do jazdy",de:"bis Fahrt"},
  paraAhora:{es:"🚨 PARA AHORA · Límite superado",en:"🚨 STOP NOW · Limit exceeded",pt:"🚨 PARA JÁ · Limite excedido",ro:"🚨 OPREȘTE ACUM",pl:"🚨 ZATRZYMAJ SIĘ",de:"🚨 JETZT STOPPEN"},
  paraEn:{es:"⏰ Para en",en:"⏰ Stop in",pt:"⏰ Para em",ro:"⏰ Oprește-te în",pl:"⏰ Zatrzymaj się za",de:"⏰ Stopp in"},
  mas:{es:"☰ Más...",en:"☰ More...",pt:"☰ Mais...",ro:"☰ Mai mult...",pl:"☰ Więcej...",de:"☰ Mehr..."},
  guardarPerfil:{es:"GUARDAR PERFIL",en:"SAVE PROFILE",pt:"GUARDAR PERFIL",ro:"SALVEAZĂ PROFIL",pl:"ZAPISZ PROFIL",de:"PROFIL SPEICHERN"},
  guardado:{es:"✓ GUARDADO",en:"✓ SAVED",pt:"✓ GUARDADO",ro:"✓ SALVAT",pl:"✓ ZAPISANO",de:"✓ GESPEICHERT"},
  idioma:{es:"IDIOMA",en:"LANGUAGE",pt:"IDIOMA",ro:"LIMBĂ",pl:"JĘZYK",de:"SPRACHE"},
  matricula:{es:"MATRÍCULA",en:"PLATE NUMBER",pt:"MATRÍCULA",ro:"NR. ÎNMATRICULARE",pl:"NR. REJESTRACYJNY",de:"KENNZEICHEN"},
  planMensual:{es:"Plan Mensual",en:"Monthly Plan",pt:"Plano Mensal",ro:"Plan Lunar",pl:"Plan Miesięczny",de:"Monatstarif"},
  planAnual:{es:"Plan Anual",en:"Annual Plan",pt:"Plano Anual",ro:"Plan Anual",pl:"Plan Roczny",de:"Jahrestarif"},
  cancelaCuando:{es:"Cancela cuando quieras",en:"Cancel anytime",pt:"Cancela quando queiras",ro:"Anulează oricând",pl:"Anuluj kiedy chcesz",de:"Jederzeit kündbar"},
  ahorras:{es:"AHORRA 28%",en:"SAVE 28%",pt:"POUPA 28%",ro:"ECONOMIȚI 28%",pl:"OSZCZĘDŹ 28%",de:"SPARE 28%"},
  pruebaCaducada:{es:"Periodo de prueba terminado",en:"Trial period ended",pt:"Período de teste terminado",ro:"Perioada de probă s-a încheiat",pl:"Okres próbny zakończony",de:"Testzeitraum abgelaufen"},
  iniciarSesion:{es:"Iniciar sesión",en:"Log in",pt:"Iniciar sessão",ro:"Autentificare",pl:"Zaloguj się",de:"Anmelden"},
  crearCuenta:{es:"Crear cuenta",en:"Create account",pt:"Criar conta",ro:"Creare cont",pl:"Utwórz konto",de:"Konto erstellen"},
  entrar:{es:"▶ ENTRAR",en:"▶ LOGIN",pt:"▶ ENTRAR",ro:"▶ INTRĂ",pl:"▶ ZALOGUJ",de:"▶ ANMELDEN"},
  pararDormir:{es:"🛏 Parar a dormir",en:"🛏 Stop to rest",pt:"🛏 Parar para dormir",ro:"🛏 Oprire odihnă",pl:"🛏 Zatrzymaj się odpocząć",de:"🛏 Pause zum Schlafen"},
  finSemana:{es:"🏨 Es fin de semana",en:"🏨 Weekend rest",pt:"🏨 Fim de semana",ro:"🏨 Sfârșit de săptămână",pl:"🏨 Weekend",de:"🏨 Wochenende"},
  descFrac:{es:"🔀 Descanso fraccionado",en:"🔀 Split rest",pt:"🔀 Descanso fracionado",ro:"🔀 Repaus fracționat",pl:"🔀 Podzielony odpoczynek",de:"🔀 Geteilte Ruhezeit"},
  jornadaCerradaMsg:{es:"Jornada cerrada — inicia nueva o usa Continuar",en:"Shift closed — start new or continue",pt:"Turno fechado",ro:"Tura închisă",pl:"Zmiana zamknięta",de:"Schicht geschlossen"},
  primeroJornada:{es:"Primero inicia la jornada",en:"Start your shift first",pt:"Primeiro inicia o turno",ro:"Începe mai întâi tura",pl:"Najpierw rozpocznij zmianę",de:"Zuerst Schicht starten"},
  semana:{es:"SEMANA",en:"WEEK",pt:"SEMANA",ro:"SĂPTĂMÂNĂ",pl:"TYDZIEŃ",de:"WOCHE"},
  conduccionHoy:{es:"HOY",en:"TODAY",pt:"HOJE",ro:"AZI",pl:"DZIŚ",de:"HEUTE"},
  continua:{es:"CONTINUA",en:"CONT.",pt:"CONTÍNUA",ro:"CONTINUĂ",pl:"CIĄGŁA",de:"LENKZEIT"},
  // EV labels
  ev_inicio_jornada:{es:"Inicio Jornada",en:"Start Shift",pt:"Início Turno",ro:"Început tură",pl:"Początek zmiany",de:"Schichtbeginn"},
  ev_fin_jornada:{es:"Fin Jornada",en:"End Shift",pt:"Fim Turno",ro:"Sfârșit tură",pl:"Koniec zmiany",de:"Schichtende"},
  ev_continuar_jornada:{es:"Continuar Jornada",en:"Continue Shift",pt:"Continuar Turno",ro:"Continuă tura",pl:"Kontynuuj zmianę",de:"Schicht fortsetzen"},
  ev_inicio_conduccion:{es:"Conduciendo",en:"Driving",pt:"Conduzindo",ro:"Conduc",pl:"Jadę",de:"Fahre"},
  ev_fin_conduccion:{es:"Fin Conducción",en:"End Driving",pt:"Fim Condução",ro:"Sfârşit condus",pl:"Koniec jazdy",de:"Fahrt Ende"},
  ev_inicio_pausa:{es:"Pausa",en:"Break",pt:"Pausa",ro:"Pauză",pl:"Przerwa",de:"Pause"},
  ev_fin_pausa:{es:"Fin Pausa",en:"End Break",pt:"Fim Pausa",ro:"Sfârşit pauză",pl:"Koniec przerwy",de:"Pause Ende"},
  ev_inicio_descanso:{es:"Descanso",en:"Rest",pt:"Descanso",ro:"Odihnă",pl:"Odpoczynek",de:"Ruhe"},
  ev_fin_descanso:{es:"Fin Descanso",en:"End Rest",pt:"Fim Descanso",ro:"Sfârşit odihnă",pl:"Koniec odpocz.",de:"Ruhe Ende"},
  ev_inicio_descanso_frac:{es:"Descanso fraccionado 1ª",en:"Split rest 1st",pt:"Descanso fracionado 1ª",ro:"Repaus fracționat 1",pl:"Podzielony odpocz. 1",de:"Geteilte Ruhe 1"},
  ev_fin_descanso_frac:{es:"Fin Descanso frac. 1ª",en:"End split rest 1st",pt:"Fim Descanso frac. 1ª",ro:"Sfârşit repaus frac.",pl:"Koniec podz. odpocz.",de:"Geteilte Ruhe Ende"},
  ev_inicio_disponibilidad:{es:"Disponible",en:"Available",pt:"Disponível",ro:"Disponibil",pl:"Dyspozycja",de:"Bereitschaft"},
  ev_fin_disponibilidad:{es:"Fin Disponible",en:"End Available",pt:"Fim Disponível",ro:"Sfârşit disponibil",pl:"Koniec dyspozycji",de:"Bereitschaft Ende"},
  ev_inicio_pasajero:{es:"Desplaz. pasajero",en:"Passenger travel",pt:"Viagem passageiro",ro:"Călătorie pasag.",pl:"Jazda pasażerem",de:"Mitfahrt"},
  ev_fin_pasajero:{es:"Fin Desplaz. pasajero",en:"End passenger travel",pt:"Fim viagem passageiro",ro:"Sfârşit călătorie",pl:"Koniec jazdy pasaż.",de:"Mitfahrt Ende"},
  ev_inicio_carga:{es:"Carga",en:"Loading",pt:"Carga",ro:"Încărcare",pl:"Załadunek",de:"Beladen"},
  ev_fin_carga:{es:"Fin Carga",en:"End Loading",pt:"Fim Carga",ro:"Sfârşit încărcare",pl:"Koniec załadunku",de:"Beladen Ende"},
  ev_inicio_descarga:{es:"Descarga",en:"Unloading",pt:"Descarga",ro:"Descărcare",pl:"Rozładunek",de:"Entladen"},
  ev_fin_descarga:{es:"Fin Descarga",en:"End Unloading",pt:"Fim Descarga",ro:"Sfârşit descărcare",pl:"Koniec rozładunku",de:"Entladen Ende"},
  ev_inicio_carga_descarga:{es:"Carga+Descarga",en:"Load+Unload",pt:"Carga+Descarga",ro:"Încărcare+Descărcare",pl:"Załadunek+Rozład.",de:"Be+Entladen"},
  ev_fin_carga_descarga:{es:"Fin Carga+Descarga",en:"End Load+Unload",pt:"Fim Carga+Descarga",ro:"Sfârşit înc+desc.",pl:"Koniec załad.+rozł.",de:"Be+Entladen Ende"},
  ev_inicio_repostaje:{es:"Repostaje",en:"Refueling",pt:"Abastecimento",ro:"Alimentare",pl:"Tankowanie",de:"Tanken"},
  ev_fin_repostaje:{es:"Fin Repostaje",en:"End Refueling",pt:"Fim Abastecimento",ro:"Sfârşit alimentare",pl:"Koniec tankowania",de:"Tanken Ende"},
  ev_inicio_inspeccion:{es:"Inspección pre-viaje",en:"Pre-trip inspection",pt:"Inspeção pré-viagem",ro:"Inspecție pre-drum",pl:"Kontrola przed jazdą",de:"Vorfahrtkontrolle"},
  ev_fin_inspeccion:{es:"Fin Inspección",en:"End Inspection",pt:"Fim Inspeção",ro:"Sfârşit inspecție",pl:"Koniec kontroli",de:"Kontrolle Ende"},
  ev_inicio_ferry:{es:"Ferry / Tren",en:"Ferry / Train",pt:"Ferry / Comboio",ro:"Feribot / Tren",pl:"Prom / Pociąg",de:"Fähre / Zug"},
  ev_fin_ferry:{es:"Fin Ferry / Tren",en:"End Ferry / Train",pt:"Fim Ferry / Comboio",ro:"Sfârşit feribot",pl:"Koniec promu",de:"Fähre Ende"},
  ev_inicio_otros:{es:"Otros Trabajos",en:"Other Work",pt:"Outros Trabalhos",ro:"Alte activități",pl:"Inne prace",de:"Andere Arbeit"},
  ev_fin_otros:{es:"Fin Otros Trab.",en:"End Other Work",pt:"Fim Outros Trab.",ro:"Sfârşit alte activ.",pl:"Koniec innych prac",de:"Andere Arbeit Ende"},
  ev_nota:{es:"Nota",en:"Note",pt:"Nota",ro:"Notă",pl:"Notatka",de:"Notiz"},
  ev_incidencia:{es:"Incidencia",en:"Incident",pt:"Incidente",ro:"Incident",pl:"Zdarzenie",de:"Vorfall"},
  ev_art12:{es:"Art.12 — Fuerza Mayor",en:"Art.12 — Force Majeure",pt:"Art.12 — Força Maior",ro:"Art.12 — Forță majoră",pl:"Art.12 — Siła wyższa",de:"Art.12 — Höhere Gewalt"},
};
function useT(lang="es"){return(key)=>{const e=TX[key];if(!e)return key;return e[lang]||e.es||key;};}
function evLabel(type,lang="es"){const k="ev_"+type;const e=TX[k];if(!e)return EV[type]?.label||type;return e[lang]||e.es||EV[type]?.label||type;}

function ptAlongRoute(coords,tkm){let acc=0;for(let i=1;i<coords.length;i++){const[lo1,la1]=coords[i-1],[lo2,la2]=coords[i];const seg=haverDist(la1,lo1,la2,lo2);if(acc+seg>=tkm){const t=(tkm-acc)/seg;return{lat:la1+(la2-la1)*t,lon:lo1+(lo2-lo1)*t};}acc+=seg;}const last=coords[coords.length-1];return{lat:last[1],lon:last[0]};}

const DAYS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],MONTHS=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fmtD=d=>`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtFull=d=>`${fmtD(d)} · ${fmtT(d)}`;

const toDate=d=>d instanceof Date?d:new Date(d);
const sameDay=(a,b)=>new Date(a).toDateString()===new Date(b).toDateString();
const dayKey=d=>new Date(d).toISOString().slice(0,10);
const diffMin=(a,b)=>Math.max(0,Math.round((toDate(b)-toDate(a))/60000));
const fmtLive=m=>{const h=Math.floor(m/60),r=m%60;return`${p2(h)}:${p2(r)}`;};
const toDTL=d=>{const D=new Date(d);return`${D.getFullYear()}-${p2(D.getMonth()+1)}-${p2(D.getDate())}T${p2(D.getHours())}:${p2(D.getMinutes())}`;};
function getMon(d){const d2=new Date(d);d2.setHours(0,0,0,0);const day=d2.getDay()||7;d2.setDate(d2.getDate()-(day-1));return d2;}
function useWidth(){const[w,setW]=useState(()=>typeof window!=="undefined"?window.innerWidth:800);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return w;}

function findActive(sorted){const open={};for(const e of sorted){const T=EV[e.type];if(!T)continue;if(T.kind==="open")open[e.type]=e;else if(T.kind==="close"&&T.pair)delete open[T.pair];}return Object.values(open).sort((a,b)=>+toDate(b.ts)-+toDate(a.ts))[0]||null;}
function findDuration(sorted,ce){const T=EV[ce.type];if(!T||T.kind!=="close")return null;const before=sorted.filter(e=>e.ts<ce.ts||(toDate(e.ts).getTime()===ce.ts.getTime()&&e.id<ce.id));for(let i=before.length-1;i>=0;i--){const e=before[i];if(e.type===T.pair)return diffMin(e.ts,ce.ts);if(e.type===ce.type)return null;}return null;}
const isAvail=createIsAvail(EV);

function calcNorma(entries,now=new Date(),abroadNow=false){
  const sorted=[...entries].sort((a,b)=>+toDate(a.ts)-+toDate(b.ts));
  const todayStart=new Date(now);todayStart.setHours(0,0,0,0);
  const thisMon=getMon(now),prevMon=new Date(+thisMon-7*24*3600*1000);
  const STOP_TYPES=["fin_conduccion","inicio_pausa","inicio_descanso","inicio_descanso_frac","inicio_disponibilidad","inicio_pasajero","inicio_carga","inicio_descarga","inicio_carga_descarga","inicio_otros","inicio_repostaje","inicio_inspeccion","inicio_ferry","fin_jornada"];
  function driveIn(pS,pE){let m=0,s=null;for(const e of sorted){if(e.ts>pE)break;if(e.type==="inicio_conduccion")s=e.ts>=pS?e.ts:pS;else if(s&&STOP_TYPES.includes(e.type)){const end=Math.min(+e.ts,+pE);if(end>+s)m+=diffMin(s,new Date(end));s=null;}}if(s){const end=Math.min(+now,+pE);if(end>+s)m+=diffMin(s,new Date(end));}return Math.max(0,m);}
  function extDays(){const days={};let s=null;for(const e of sorted){if(e.ts<thisMon)continue;if(e.type==="inicio_conduccion")s=e.ts;else if(s&&STOP_TYPES.includes(e.type)){const k=dayKey(s);days[k]=(days[k]||0)+diffMin(s,e.ts);s=null;}}if(s)days[dayKey(s)]=(days[dayKey(s)]||0)+diffMin(s,now);return Object.values(days).filter(m=>m>LIM.DAY).length;}
  let cont=0,driveStart=null,sp=0,redRests=0,crStart=null,crType=null,crFerryDescAcum=0,crFerryTs=null,jornadaCount=0,lastDescansoTs=null;
  const debts=[];
  for(const e of sorted){
    switch(e.type){
      case"inicio_jornada":jornadaCount++;break;
      case"inicio_conduccion":driveStart=e.ts;break;
      case"fin_conduccion":case"inicio_pausa":case"inicio_descanso":case"inicio_descanso_frac":case"inicio_disponibilidad":case"inicio_carga":case"inicio_descarga":case"inicio_otros":case"fin_jornada":
        if(driveStart){cont+=diffMin(driveStart,e.ts);driveStart=null;}
        if(e.type==="inicio_pausa"||e.type==="inicio_descanso"||e.type==="inicio_descanso_frac"){crStart=e.ts;crType=e.type;}
        break;
      case"fin_pausa":{
        if(crStart){
          const dur=diffMin(crStart,e.ts);
          // Recopilar todas las pausas consecutivas (sin conducción entre medias) hasta este momento
          // para detectar el patrón 15+30 más favorable
          const pausasConsec=[];
          let scanning=true;
          for(let j=sorted.indexOf(e);j>=0&&scanning;j--){
            const ev=sorted[j];
            if(ev.type==="fin_pausa"){
              const ini=sorted.slice(0,j).reverse().find(x=>x.type==="inicio_pausa");
              if(ini)pausasConsec.unshift({dur:diffMin(ini.ts,ev.ts),ts:ini.ts});
            } else if(ev.type==="inicio_conduccion"){scanning=false;}
          }
          // Buscar patrón válido más favorable dentro de las pausas consecutivas
          let valido=false;
          // 1. ¿Alguna pausa ≥45 min sola?
          if(dur>=45)valido=true;
          // 2. ¿Patrón 15+30 en orden correcto en la secuencia?
          if(!valido){
            for(let a=0;a<pausasConsec.length-1&&!valido;a++){
              if(pausasConsec[a].dur>=15){
                for(let b=a+1;b<pausasConsec.length&&!valido;b++){
                  if(pausasConsec[b].dur>=30)valido=true;
                }
              }
            }
            // También incluir la pausa actual
            if(!valido&&dur>=30){
              if(pausasConsec.some(p=>p.dur>=15))valido=true;
            }
            if(!valido&&dur>=15){
              sp=1; // primera parte válida
            }
          }
          if(valido){cont=0;sp=0;}
          crStart=null;crType=null;
        }
        break;
      }
      case"fin_descanso_frac":
        if(crStart){cont=0;sp=0;crStart=null;crType=null;}
        break;
      case"fin_descanso":
        if(crStart){const dur=diffMin(crStart,e.ts);cont=0;sp=0;
          if(dur>=LIM.WREST){redRests=0;jornadaCount=0;lastDescansoTs=e.ts;} // descanso semanal reset jornadas
          else if(abroadNow&&dur>=LIM.WREST_R&&dur<LIM.WREST){debts.push({takenMin:dur,debtMin:LIM.WREST-dur,takenAt:e.ts,dueBy:new Date(+e.ts+21*24*3600*1000)});}
          else if(dur>=LIM.REST_R&&dur<LIM.REST){redRests++;lastDescansoTs=e.ts;}
          else if(dur>=LIM.REST){lastDescansoTs=e.ts;}
          crStart=null;crType=null;crFerryDescAcum=0;}
        break;
      // ── FERRY / TREN Art. 9 EU 561/2006 ──────────────────────────────
      // Solo válido como descanso si: camarote/litera + travesía ≥8h + total ≥9h
      case"inicio_ferry":{
        const ferryNote=(e.note||"").toLowerCase();
        const tieneCamarote=ferryNote.includes("camarote")||ferryNote.includes("litera")||ferryNote.includes("cama")||e.ferry_camarote===true;
        if(tieneCamarote&&crStart&&crType==="inicio_descanso"){
          // Art.9: interrumpir descanso para embarcar (máx 1h antes)
          const descAcum=diffMin(crStart,e.ts);
          crFerryDescAcum=(crFerryDescAcum||0)+descAcum;
          crFerryTs=e.ts; // guardar momento de embarque
          crStart=null;
        } else if(!tieneCamarote){
          // Sin camarote: cuenta como disponible, NO como descanso
          if(crStart&&crType==="inicio_descanso"){
            crStart=null;crType=null; // pierde el descanso acumulado
          }
        }
        break;
      }
      case"fin_ferry":{
        if(crFerryDescAcum>0&&crFerryTs){
          const travesiaMins=diffMin(crFerryTs,e.ts);
          if(travesiaMins>=480){ // ≥8 horas de travesía
            crFerryDescAcum+=travesiaMins;
            crStart=e.ts;crType="inicio_descanso"; // reanudar descanso
          } else {
            // Travesía <8h: no válida como descanso Art.9
            crFerryDescAcum=0;crFerryTs=null;
            crStart=null;crType=null;
          }
        }
        crFerryTs=null;
        break;
      }
    }
  }
  if(driveStart)cont+=diffMin(driveStart,now);
  const ext=extDays(),canExt=ext<LIM.MAX_EXT,maxDay=canExt?LIM.DAY_X:LIM.DAY;
  const todayDrive=driveIn(todayStart,now),weekDrive=driveIn(thisMon,now),biweekDrive=driveIn(prevMon,now);
  const rCont=Math.max(0,LIM.CONT-cont),rDay=Math.max(0,maxDay-todayDrive),rWeek=Math.max(0,LIM.WEEK-weekDrive),rBiweek=Math.max(0,LIM.BIWEEK-biweekDrive);
  const canDrive=Math.min(rCont,rDay,rWeek,rBiweek);
  const crDur=crStart?diffMin(crStart,now):0,rRest=crStart?Math.max(0,(crType==="inicio_pausa"?45:LIM.REST_R)-crDur):0;
  const active=findActive(sorted.filter(e=>sameDay(e.ts,now)));
  const isDriving=active?.type==="inicio_conduccion";
  const alerts=[];
  if(isDriving){const km=Math.round(canDrive*80/60);
    if(canDrive<=0)alerts.push({level:"CRITICO",icon:"🚨",msg:"¡PARA AHORA! Límite superado"});
    else if(canDrive<=5)alerts.push({level:"CRITICO",icon:"🚨",msg:`Para en ${canDrive} min · ~${km} km`});
    else if(canDrive<=20)alerts.push({level:"PELIGRO",icon:"⚠️",msg:`Para en ${fmtDur(canDrive)} · ~${km} km`});
    else if(canDrive<=40)alerts.push({level:"AVISO",icon:"⏰",msg:`Pausa en ${fmtDur(canDrive)} · ~${km} km`});
    if(rWeek<120)alerts.push({level:"AVISO",icon:"📅",msg:`Semana: ${fmtDur(rWeek)} restantes`});
    if(rBiweek<240)alerts.push({level:"AVISO",icon:"📅",msg:`Bisemanal: ${fmtDur(rBiweek)} restantes`});
  }
  if(crStart&&crType==="inicio_pausa"&&rRest>0)alerts.push({level:"INFO",icon:"⏸",msg:`Pausa: ${fmtDur(crDur)} · faltan ${fmtDur(rRest)}`});
  // Calcular ventana disponible basada en último descanso
  let ventanaDisp=null;
  const lastDescansoFin=sorted.slice().reverse().find(e=>e.type==="fin_descanso");
  const lastJornadaInicio=sorted.slice().reverse().find(e=>e.type==="inicio_jornada"||e.type==="continuar_jornada");
  if(lastDescansoFin&&lastJornadaInicio&&lastJornadaInicio.ts>=lastDescansoFin.ts){
    // Calcular duración del último descanso
    const descInicio=sorted.slice().reverse().find(e=>e.type==="inicio_descanso"&&e.ts<lastDescansoFin.ts);
    if(descInicio){
      const durDesc=diffMin(descInicio.ts,lastDescansoFin.ts);
      const ventanaMax=durDesc>=LIM.REST?13*60:15*60; // 11h→13h, 9h→15h
      const tiempoDesdeJornada=diffMin(lastJornadaInicio.ts,now);
      ventanaDisp={
        durDesc,
        ventanaMax,
        usado:tiempoDesdeJornada,
        restante:Math.max(0,ventanaMax-tiempoDesdeJornada),
        tipo:durDesc>=LIM.REST?"normal":"extendida",
        descTipo:durDesc>=LIM.REST?"11h":"9h"
      };
    }
  }
  const totalDebt=debts.reduce((a,d)=>a+d.debtMin,0);
  if(totalDebt>0)alerts.push({level:"AVISO",icon:"📋",msg:`Compensar ${fmtDur(totalDebt)} (desc. semanal reducido)`});
  const ud=debts.find(d=>diffMin(now,d.dueBy)<7*24*60);
  if(ud)alerts.push({level:"PELIGRO",icon:"⏰",msg:`Compensar ${fmtDur(ud.debtMin)} antes del ${fmtD(ud.dueBy)}`});
  if(jornadaCount>=6)alerts.push({level:"PELIGRO",icon:"📅",msg:`6ª jornada — descanso semanal obligatorio antes de la próxima`});
  if(jornadaCount>=7)alerts.push({level:"CRITICO",icon:"🚨",msg:`¡Superadas 6 jornadas! Descanso semanal obligatorio`});
  const lastJ=sorted.filter(e=>e.type==="inicio_jornada"&&sameDay(e.ts,now)).sort((a,b)=>b.ts-a.ts)[0];
  let dispInfo=null;
  if(lastJ){
    const jS=lastJ.ts;
    let jRest=0,rS=null,rType=null,jPausa=0,pS=null,jOtros=0,oS=null;
    for(const e of sorted.filter(x=>x.ts>=jS)){
      // Descanso real
      if(e.type==="inicio_descanso"){rS=e.ts;rType="full";}
      else if(e.type==="fin_descanso"&&rS&&rType==="full"){jRest+=diffMin(rS,e.ts);rS=null;rType=null;}
      else if(e.type==="fin_descanso_frac"){rS=null;rType=null;}
      // Pausa
      if(e.type==="inicio_pausa")pS=e.ts;
      else if(e.type==="fin_pausa"&&pS){jPausa+=diffMin(pS,e.ts);pS=null;}
      // Otros trabajos (todos los tipos de work)
      const OTROS_TIPOS=["inicio_carga","inicio_descarga","inicio_carga_descarga","inicio_repostaje","inicio_inspeccion","inicio_otros","inicio_disponibilidad","inicio_pasajero"];
      const OTROS_FIN=["fin_carga","fin_descarga","fin_carga_descarga","fin_repostaje","fin_inspeccion","fin_otros","fin_disponibilidad","fin_pasajero"];
      if(OTROS_TIPOS.includes(e.type))oS=e.ts;
      else if(OTROS_FIN.includes(e.type)&&oS){jOtros+=diffMin(oS,e.ts);oS=null;}
    }
    if(rS&&rType==="full")jRest+=diffMin(rS,now);
    if(pS)jPausa+=diffMin(pS,now);
    if(oS)jOtros+=diffMin(oS,now);
    const actUsed=Math.max(0,diffMin(jS,now)-jRest);
    // ventanaMax: 15h si no hay descanso previo o fue reducido (9h), 13h si fue completo (11h)
    const vMax=ventanaDisp?.ventanaMax??(15*60);
    dispInfo={jStart:jS,windowEnd:new Date(+jS+vMax*60000),restMin:jRest,pausaMin:jPausa,otrosMin:jOtros,activeUsed:actUsed,dispRemain:Math.max(0,vMax-actUsed),ventanaMax:vMax,closed:sorted.filter(e=>e.ts>=jS&&e.type==="fin_jornada").length>0};
  }
  return{cont,todayDrive,weekDrive,biweekDrive,rCont,rDay,rWeek,rBiweek,canDrive,canExt,extUsed:ext,redRests,sp,crDur,rRest,crType,maxDay,alerts,isDriving,dispInfo,debts,totalDebt,abroadNow,ventanaDisp,jornadaCount};
}

function buildTxt(entries,label){const sorted=[...entries].sort((a,b)=>a.ts-b.ts);let t=`📋 CUADERNO DE RUTA\n${label}\n${"─".repeat(28)}\n`;sorted.forEach(e=>{const T=EV[e.type];const dur=findDuration(sorted,e);t+=`\n${fmtT(e.ts)}  ${T?.icon||"•"} ${T?.label||e.type}`;if(dur!=null)t+=` (${fmtDur(dur)})`;if(e.late)t+=` ⚠`;if(e.location)t+=`\n  📍 ${e.location}`;if(e.note)t+=`\n  📝 ${e.note}`;});return t;}


function exportCMRPDF(fields,prof){
  const f=fields||{};
  const w=window.open("","_blank","width=900,height=700");
  if(!w){alert("Activa ventanas emergentes");return;}
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>CMR - Carta de Porte</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:11px;padding:10px;}
    .header{text-align:center;border:2px solid #000;padding:8px;margin-bottom:0;}
    .header h1{font-size:18px;font-weight:bold;}
    .header p{font-size:10px;}
    table{width:100%;border-collapse:collapse;}
    td,th{border:1px solid #000;padding:5px 7px;vertical-align:top;}
    .num{font-size:9px;color:#666;display:block;}
    .label{font-weight:bold;font-size:9px;text-transform:uppercase;color:#333;}
    .val{font-size:12px;min-height:20px;}
    .wide{width:60%;}
    .tall td{height:60px;}
    .section{background:#f0f0f0;font-weight:bold;text-align:center;font-size:10px;}
    @media print{body{padding:0;}}
  </style></head><body>
  <div class="header">
    <h1>CARTA DE PORTE INTERNACIONAL CMR</h1>
    <p>Convenio relativo al Contrato de Transporte Internacional de Mercancías por Carretera</p>
  </div>
  <table>
    <tr>
      <td style="width:50%;border-top:2px solid #000">
        <span class="label">1. Remitente (nombre, dirección, país)</span>
        <div class="val" style="min-height:50px">${f.remitente||""}</div>
      </td>
      <td style="border-top:2px solid #000">
        <span class="label">Nº CMR</span>
        <div class="val" style="font-size:16px;font-weight:bold">${f.num_cmr||""}</div>
        <span class="label" style="margin-top:8px;display:block">Lugar y fecha de emisión</span>
        <div class="val">${f.lugar_fecha||""}</div>
      </td>
    </tr>
    <tr>
      <td>
        <span class="label">3. Destinatario (nombre, dirección, país)</span>
        <div class="val" style="min-height:50px">${f.destinatario||""}</div>
      </td>
      <td>
        <span class="label">16b. Transportista (nombre, dirección, país)</span>
        <div class="val" style="min-height:50px">${f.transportista||prof.empresa||""}</div>
      </td>
    </tr>
    <tr>
      <td><span class="label">4. Lugar de entrega</span><div class="val">${f.lugar_entrega||""}</div></td>
      <td><span class="label">23. Matrícula vehículo</span><div class="val">${f.matricula||prof.matricula||""}</div></td>
    </tr>
    <tr>
      <td><span class="label">5. Lugar de carga</span><div class="val">${f.lugar_carga||""}</div></td>
      <td><span class="label">6. Fecha de carga</span><div class="val">${f.fecha_carga||""}</div></td>
    </tr>
    <tr><td colspan="2" class="section">DESCRIPCIÓN DE LA MERCANCÍA</td></tr>
    <tr>
      <td><span class="label">8. Marcas y números</span><div class="val">${f.marcas||""}</div></td>
      <td><span class="label">7. Documentos adjuntos</span><div class="val">${f.documentos||""}</div></td>
    </tr>
    <tr>
      <td><span class="label">9. Nº de bultos</span><div class="val">${f.bultos||""}</div></td>
      <td><span class="label">10. Clase de embalaje</span><div class="val">${f.embalaje||""}</div></td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">11. Denominación de la mercancía</span><div class="val" style="min-height:40px">${f.naturaleza||""}</div></td>
    </tr>
    <tr>
      <td><span class="label">12. Peso bruto (kg)</span><div class="val">${f.peso_bruto||""}</div></td>
      <td><span class="label">13. Cubicaje (m³)</span><div class="val">${f.cubicaje||""}</div></td>
    </tr>
    <tr><td colspan="2" class="section">ESTIPULACIONES</td></tr>
    <tr>
      <td colspan="2"><span class="label">14. Instrucciones del remitente</span><div class="val" style="min-height:35px">${f.instrucciones||""}</div></td>
    </tr>
    <tr>
      <td><span class="label">15. Franqueo</span><div class="val">${f.franqueo||""}</div></td>
      <td><span class="label">16. Reembolso</span><div class="val">${f.reembolso||""}</div></td>
    </tr>
    <tr>
      <td><span class="label">17. Valor declarado</span><div class="val">${f.valor_mercanc||""}</div></td>
      <td><span class="label">18. Estipulaciones particulares</span><div class="val">${f.estipulaciones||""}</div></td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Observaciones</span><div class="val">${f.observations||""}</div></td>
    </tr>
    <tr><td colspan="2" class="section">FIRMAS</td></tr>
    <tr style="height:70px">
      <td><span class="label">Remitente</span></td>
      <td><span class="label">Transportista / Conductor: ${prof.nombre||""}</span></td>
    </tr>
    <tr style="height:70px">
      <td colspan="2"><span class="label">Destinatario</span></td>
    </tr>
  </table>
  <div style="text-align:right;margin-top:4px;font-size:9px;color:#666">Generado por Cuaderno de Ruta · ${new Date().toLocaleDateString("es-ES")}</div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`);
  w.document.close();
}

function exportPDF(entries,norma,prof,label){
  const sorted=[...entries].sort((a,b)=>a.ts-b.ts);
  const hasLate=sorted.some(e=>e.late);
  const hasPais=sorted.some(e=>e.pais);
  const rows=sorted.map(e=>{
    const T=EV[e.type];const dur=findDuration(sorted,e);
    const simbolos=[e.late?"⚠":"",e.corrected_by?"✏":""].filter(Boolean).join(" ");
    return`<tr>
      <td>${fmtT(e.ts)}</td>
      <td>${T?.icon||""} ${T?.label||e.type}${simbolos?" <span style='color:#F97316'>"+simbolos+"</span>":""}</td>
      <td>${dur!=null?fmtDur(dur):""}</td>
      <td>${e.location||""}</td>
      <td>${e.pais||""}</td>
      <td>${e.note||""}</td>
    </tr>`;
  }).join("");
  const w=window.open("","_blank","width=900,height=700");
  if(!w){alert("Activa ventanas emergentes");return;}
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Cuaderno — ${label}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;margin:20px}
    h1{font-size:17px}h2{font-size:12px;color:#64748b;font-weight:normal;margin-bottom:14px}
    .prow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:14px}
    .pc label{font-size:9px;color:#94a3b8;font-weight:700;display:block}.pc span{font-size:13px;font-weight:700}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .sc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:7px;text-align:center}
    .sc label{font-size:9px;color:#94a3b8;display:block}.sc span{font-size:15px;font-weight:800;color:#f59e0b}
    table{width:100%;border-collapse:collapse}
    th{background:#1e293b;color:white;padding:5px 7px;text-align:left;font-size:10px}
    td{padding:4px 7px;border-bottom:1px solid #f1f5f9;font-size:11px}
    tr:nth-child(even) td{background:#f8fafc}
    .leyenda{margin-top:14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px;padding:10px 14px;font-size:11px;color:#92400E}
    .leyenda strong{display:block;margin-bottom:6px;font-size:12px}
    .ft{margin-top:10px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
    @media print{body{margin:8mm}}
  </style></head><body>
  <h1>📋 CUADERNO DE RUTA</h1><h2>${label} · ${fmtFull(new Date())}</h2>
  <div class="prow">
    <div class="pc"><label>CONDUCTOR</label><span>${prof.nombre||"—"}</span></div>
    <div class="pc"><label>DNI</label><span>${prof.dni||"—"}</span></div>
    <div class="pc"><label>EMPRESA</label><span>${prof.empresa||"—"}</span></div>
    <div class="pc"><label>🚛 CAMIÓN</label><span>${prof.matricula||"—"}</span></div>
    ${prof.tipoVehiculo!=="rigido"?`<div class="pc"><label>🔗 REMOLQUE</label><span>${prof.remolque||"—"}</span></div>`:""}
    <div class="pc"><label>LICENCIA CAP</label><span>${prof.licencia||"—"}</span></div>
    <div class="pc"><label>PAÍS/CCAA</label><span>${prof.paisBase||"ES"}${prof.ccaa&&prof.paisBase==="ES"?"-"+prof.ccaa:""}</span></div>
  </div>
  <div class="stats">
    <div class="sc"><label>COND. HOY</label><span>${fmtDur(norma.todayDrive)}</span></div>
    <div class="sc"><label>CONTINUA</label><span>${fmtDur(norma.cont)}</span></div>
    <div class="sc"><label>SEMANA</label><span>${fmtDur(norma.weekDrive)}</span></div>
    <div class="sc"><label>BISEMANAL</label><span>${fmtDur(norma.biweekDrive)}</span></div>
  </div>
  <table><thead><tr><th>HORA</th><th>ACTIVIDAD</th><th>DURACIÓN</th><th>UBICACIÓN</th><th>PAÍS</th><th>NOTA</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="leyenda">
    <strong>⚠️ LEYENDA DE SÍMBOLOS</strong>
    <span>⚠ Registro tardío — el evento fue registrado con posterioridad al momento real. Queda anotado para auditoría.</span><br/>
    <span>✏ Registro corregido — el evento original fue modificado. El registro original se conserva en el historial de auditoría.</span><br/>
    <span>Países: ES=España · PT=Portugal · FR=Francia · DE=Alemania · IT=Italia · EU=Otro país UE</span><br/>
    <span>CCAA España: AN=Andalucía · CT=Cataluña · MD=Madrid · VC=Valencia · GA=Galicia · PV=País Vasco · CM=C-La Mancha · CL=Castilla y León · AR=Aragón · EX=Extremadura · AS=Asturias · CB=Cantabria · RI=La Rioja · MC=Murcia · NC=Navarra · CN=Canarias · IB=Baleares</span>
  </div>
  <div class="ft">Cuaderno de Ruta Digital · EU 561/2006 · Documento orientativo — conservar junto al tacógrafo digital</div>
  </body></html>`);
  w.document.close();w.onload=()=>setTimeout(()=>w.print(),300);
}

function exportGastosPDF(gastos,prof,label){
  if(!gastos.length){alert("Selecciona al menos un gasto");return;}
  const total=gastos.reduce((a,g)=>a+(parseFloat(g.importe)||0),0);
  const porCat={};gastos.forEach(g=>{porCat[g.cat]=(porCat[g.cat]||0)+(parseFloat(g.importe)||0);});
  const catNames={combustible:"Combustible",peaje:"Peajes",comida:"Comida/Dietas",parking:"Parking",reparacion:"Reparaciones",alojamiento:"Alojamiento",otros:"Otros"};
  const catIcons={combustible:"⛽",peaje:"🛣️",comida:"🍽️",parking:"🅿️",reparacion:"🔧",alojamiento:"🏨",otros:"📋"};
  const rows=gastos.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(g=>`
    <tr>
      <td>${g.fecha.slice(0,10)}</td>
      <td>${catIcons[g.cat]||""} ${catNames[g.cat]||g.cat}</td>
      <td>${g.desc||"—"}</td>
      <td>${g.factura||"—"}</td>
      <td style="text-align:right;font-weight:700;color:#f59e0b">${parseFloat(g.importe).toFixed(2)} €</td>
    </tr>
    ${g.photo?`<tr><td colspan="5" style="padding:6px 7px;background:#f8fafc"><img src="${g.photo}" style="max-height:120px;max-width:100%;border-radius:6px;display:block"/></td></tr>`:""}
  `).join("");
  const resumen=Object.entries(porCat).map(([cat,amt])=>`<div class="sc"><label>${catIcons[cat]||""} ${catNames[cat]||cat}</label><span>${amt.toFixed(2)} €</span></div>`).join("");
  const w=window.open("","_blank","width=900,height=700");
  if(!w){alert("Activa ventanas emergentes");return;}
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Gastos — ${label}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;margin:20px}
  h1{font-size:17px;margin-bottom:4px}h2{font-size:12px;color:#64748b;font-weight:normal;margin-bottom:14px}
  .prow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:14px}
  .pc label{font-size:9px;color:#94a3b8;font-weight:700;display:block}.pc span{font-size:13px;font-weight:700}
  .total{background:#1e293b;color:white;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
  .total-label{font-size:11px;color:#94a3b8}.total-val{font-size:28px;font-weight:800;color:#f59e0b}
  .cats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
  .sc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;text-align:center;min-width:80px}
  .sc label{font-size:9px;color:#94a3b8;display:block;margin-bottom:2px}.sc span{font-size:14px;font-weight:800;color:#f59e0b}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{background:#1e293b;color:white;padding:6px 8px;text-align:left;font-size:10px}
  td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:11px}
  tr:nth-child(even) td{background:#f8fafc}
  .ft{margin-top:14px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
  @media print{body{margin:8mm}}</style></head><body>
  <h1>💰 NOTA DE GASTOS</h1><h2>${label} · Generado: ${fmtFull(new Date())}</h2>
  <div class="prow">
    <div class="pc"><label>CONDUCTOR</label><span>${prof.nombre||"—"}</span></div>
    <div class="pc"><label>DNI</label><span>${prof.dni||"—"}</span></div>
    <div class="pc"><label>EMPRESA</label><span>${prof.empresa||"—"}</span></div>
    <div class="pc"><label>MATRÍCULA</label><span>${prof.matricula||"—"}</span></div>
    <div class="pc"><label>Nº GASTOS</label><span>${gastos.length}</span></div>
    <div class="pc"><label>PERÍODO</label><span>${label}</span></div>
  </div>
  <div class="total"><div><div class="total-label">TOTAL GASTOS</div></div><div class="total-val">${total.toFixed(2)} €</div></div>
  <div class="cats">${resumen}</div>
  <table><thead><tr><th>FECHA</th><th>CATEGORÍA</th><th>DESCRIPCIÓN</th><th>Nº FACTURA</th><th>IMPORTE</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="ft">Cuaderno de Ruta Digital · Documento para liquidación de gastos · ${gastos.length} gastos seleccionados</div>
  </body></html>`);
  w.document.close();w.onload=()=>setTimeout(()=>w.print(),300);
}

function buildTimeline(entries,now){
  const sorted=[...entries].sort((a,b)=>a.ts-b.ts);
  if(!sorted.length)return{segs:[],start:now,end:now,totalMs:1};
  const start=sorted[0].ts,end=now,totalMs=Math.max(1,end-start);
  return{segs:sorted.map((e,i,a)=>{const from=e.ts,to=i<a.length-1?a[i+1].ts:now;return{type:e.type,from,to,pct:Math.max(0,(to-from)/totalMs)*100,last:i===a.length-1};}),start,end,totalMs};
}

// ─────────────────────────────────────────────────────────────
//  INFO EMERGENCIAS — Teléfonos por país
// ─────────────────────────────────────────────────────────────
const EMERGENCIAS=[
  {pais:"🇪🇸 España",items:[
    {cat:"Emergencias",tel:"112",desc:"Emergencias generales (policía, bomberos, ambulancia)"},
    {cat:"DGT Incidencias",tel:"900 123 505",desc:"Información tráfico y accidentes en carretera"},
    {cat:"Guardia Civil Tráfico",tel:"062",desc:"Accidentes, infracciones, ayuda en carretera"},
    {cat:"RACE Asistencia",tel:"900 100 992",desc:"Grúa y asistencia en carretera 24h"},
    {cat:"Intoxicaciones",tel:"91 562 04 20",desc:"Instituto Nacional de Toxicología"},
    {cat:"DGT Multas",tel:"060",desc:"Consultas administrativas DGT"},
  ]},
  {pais:"🇫🇷 Francia",items:[
    {cat:"Emergencias",tel:"112",desc:"Número europeo de emergencias"},
    {cat:"SAMU (ambulancia)",tel:"15",desc:"Urgencias médicas"},
    {cat:"Policía",tel:"17",desc:"Gendarmería y policía"},
    {cat:"Autopistas ASFA",tel:"3605",desc:"Asistencia en autopistas francesas 24h"},
    {cat:"AXA Asistencia",tel:"+33 1 55 92 40 40",desc:"Asistencia vehículos internacionales"},
  ]},
  {pais:"🇩🇪 Alemania",items:[
    {cat:"Emergencias",tel:"112",desc:"Bomberos y ambulancias"},
    {cat:"Policía",tel:"110",desc:"Policía federal y de tráfico"},
    {cat:"ADAC Asistencia",tel:"0800 5 10 11 12",desc:"Asistencia en carretera (grúa, mecánico)"},
    {cat:"Info tráfico",tel:"0800 000 5000",desc:"BASt — información carreteras alemanas"},
  ]},
  {pais:"🇮🇹 Italia",items:[
    {cat:"Emergencias",tel:"112",desc:"Número único de emergencias"},
    {cat:"Ambulancia",tel:"118",desc:"Urgencias médicas"},
    {cat:"Policía carretera",tel:"113",desc:"Polizia Stradale"},
    {cat:"ACI Asistencia",tel:"803 116",desc:"Automóvil Club Italia — grúa 24h"},
    {cat:"Autopistas",tel:"840 04 21 21",desc:"Autostrade per l'Italia — incidencias"},
  ]},
  {pais:"🇵🇹 Portugal",items:[
    {cat:"Emergencias",tel:"112",desc:"Emergencias generales"},
    {cat:"GNR Carreteras",tel:"213 217 170",desc:"Guardia Nacional Republicana — tráfico"},
    {cat:"ACP Asistencia",tel:"808 222 222",desc:"Automóvil Club Portugal"},
  ]},
  {pais:"🇧🇪 Bélgica",items:[
    {cat:"Emergencias",tel:"112",desc:"Emergencias generales"},
    {cat:"Policía",tel:"101",desc:"Policía federal"},
    {cat:"VAB/Touring",tel:"070 344 777",desc:"Asistencia en carretera"},
  ]},
  {pais:"🇳🇱 Países Bajos",items:[
    {cat:"Emergencias",tel:"112",desc:"Emergencias generales"},
    {cat:"ANWB Asistencia",tel:"0800 0503",desc:"Wegenwacht — asistencia carretera 24h"},
  ]},
  {pais:"🇵🇱 Polonia",items:[
    {cat:"Emergencias",tel:"112",desc:"Emergencias generales"},
    {cat:"Policía",tel:"997",desc:"Policía nacional"},
    {cat:"Ambulancia",tel:"999",desc:"Urgencias médicas"},
    {cat:"PZM Asistencia",tel:"196 37",desc:"Asistencia en carretera Polonia"},
  ]},
];

const INFO_GENERAL=[
  {icon:"🔧",titulo:"Avería mecánica",pasos:[
    "1. Señaliza con triángulos a 50m del vehículo y ponte el chaleco reflectante",
    "2. Llama a tu seguro o asistencia en carretera antes que a grúa particular",
    "3. Guarda la hoja de asistencia — la necesitas para reclamar al cliente por demora",
    "4. Documenta con fotos fecha/hora del incidente para justificar el retraso",
  ]},
  {icon:"🚑",titulo:"Accidente de tráfico",pasos:[
    "1. Llama al 112 si hay heridos — no muevas a nadie hasta que lleguen",
    "2. Señaliza la zona y enciende las luces de emergencia",
    "3. Intercambia datos: nombre, DNI, matrícula, seguro de la otra parte",
    "4. Fotografía los daños, la posición de los vehículos y la señalización",
    "5. Llama a tu empresa — el accidente debe notificarse en el acto",
    "6. Rellena el parte europeo de accidente (constat amiable)",
  ]},
  {icon:"🦺",titulo:"Robo de mercancía",pasos:[
    "1. No intervengas si sorprendes a los ladrones — llama al 112",
    "2. Denuncia en la comisaría más cercana — necesitas el atestado policial",
    "3. Fotografía la zona forzada y el estado de los sellos/precintos",
    "4. Notifica a tu empresa y al cargador inmediatamente",
    "5. Guarda el CMR — es el documento clave para el seguro de carga",
  ]},
  {icon:"🏥",titulo:"Urgencia médica propia",pasos:[
    "1. Para el vehículo en un lugar seguro antes de llamar",
    "2. Llama al 112 — en toda Europa funciona aunque no tengas cobertura local",
    "3. Di que eres conductor profesional — es relevante para el diagnóstico",
    "4. Lleva siempre el carnet de conducir y la tarjeta sanitaria europea (TSE)",
    "5. Informa a tu empresa — no puedes conducir bajo medicación sedante",
  ]},
  {icon:"⛽",titulo:"Rotura de combustible / avería ADR",pasos:[
    "1. Aleja el vehículo del tráfico y señaliza la zona",
    "2. Llama a emergencias (112) — indica que es mercancía peligrosa",
    "3. Consulta los paneles naranja del vehículo para dar el número de peligro y ONU",
    "4. No intentes limpiar derrames de mercancías peligrosas sin equipo adecuado",
  ]},
];

function InfoEmergencias({dark}){
  const[pais,setPais]=useState(null);
  const[seccion,setSeccion]=useState(null);
  const bg=dark?"#0F172A":"#F8FAFC";
  const card=dark?"#1E293B":"white";
  const txt=dark?"#F1F5F9":"#0F172A";
  const sub=dark?"#94A3B8":"#64748B";

  return(
    <div style={{background:bg,minHeight:"calc(100vh - 120px)",padding:"14px 14px 80px"}}>

      {/* Protocolo de emergencia */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:800,color:sub,letterSpacing:1,marginBottom:10}}>¿QUÉ HAGO SI...?</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {INFO_GENERAL.map(({icon,titulo,pasos})=>(
            <div key={titulo} style={{background:card,borderRadius:14,overflow:"hidden",border:`1px solid ${dark?"#1E293B":"#E2E8F0"}`}}>
              <button onClick={()=>setSeccion(seccion===titulo?null:titulo)}
                style={{width:"100%",background:"transparent",border:"none",padding:"13px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
                <span style={{flex:1,fontSize:14,fontWeight:700,color:txt}}>{titulo}</span>
                <span style={{fontSize:12,color:sub}}>{seccion===titulo?"▲":"▼"}</span>
              </button>
              {seccion===titulo&&(
                <div style={{padding:"0 14px 14px",borderTop:`1px solid ${dark?"#1E293B":"#F1F5F9"}`}}>
                  {pasos.map((p,i)=>(
                    <div key={i} style={{fontSize:13,color:dark?"#CBD5E1":"#334155",lineHeight:1.7,padding:"4px 0",borderBottom:i<pasos.length-1?`1px solid ${dark?"#1E293B":"#F8FAFC"}`:"none"}}>
                      {p}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Teléfonos por país */}
      <div>
        <div style={{fontSize:11,fontWeight:800,color:sub,letterSpacing:1,marginBottom:10}}>TELÉFONOS POR PAÍS</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {EMERGENCIAS.map(({pais:p,items})=>(
            <div key={p} style={{background:card,borderRadius:14,overflow:"hidden",border:`1px solid ${dark?"#1E293B":"#E2E8F0"}`}}>
              <button onClick={()=>setPais(pais===p?null:p)}
                style={{width:"100%",background:"transparent",border:"none",padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",textAlign:"left"}}>
                <span style={{fontSize:15,fontWeight:700,color:txt}}>{p}</span>
                <span style={{fontSize:12,color:sub}}>{pais===p?"▲":"▼"}</span>
              </button>
              {pais===p&&(
                <div style={{borderTop:`1px solid ${dark?"#1E293B":"#F1F5F9"}`}}>
                  {items.map(({cat,tel,desc})=>(
                    <div key={cat} style={{padding:"10px 14px",borderBottom:`1px solid ${dark?"#1E293B":"#F8FAFC"}`,display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:dark?"#94A3B8":"#64748B",marginBottom:2}}>{cat}</div>
                        <div style={{fontSize:11,color:sub,lineHeight:1.4}}>{desc}</div>
                      </div>
                      <a href={"tel:"+tel.replace(/\s/g,"")}
                        style={{background:"#22C55E",color:"white",borderRadius:10,padding:"8px 14px",fontSize:14,fontWeight:800,textDecoration:"none",flexShrink:0,display:"flex",alignItems:"center",gap:4}}>
                        📞 {tel}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{marginTop:16,padding:"10px 14px",background:dark?"#1E293B":"#FEF3C7",borderRadius:10,fontSize:12,color:dark?"#94A3B8":"#78350F",lineHeight:1.6}}>
        ⚠️ El <strong>112</strong> funciona en toda Europa sin cobertura propia. Siempre disponible.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ESCÁNER CMR
function CmrScanner({prof,dark}){
  const[fase,setFase]=useState("lista"); // lista | scan | revisar | guardando
  const[foto,setFoto]=useState(null); // base64
  const[fotoUrl,setFotoUrl]=useState(null);
  const[campos,setCampos]=useState({});
  const[error,setError]=useState("");
  const[docs,setDocs]=useState([]);
  const[cargando,setCargando]=useState(true);
  const[saving,setSaving]=useState(false);
  const fileRef=useRef(null);

  const uid=getUserId();

  // Cargar CMR guardados
  useEffect(()=>{
    if(!uid)return;
    sbFetch(`/rest/v1/cmr_docs?user_id=eq.${uid}&order=created_at.desc&limit=20`)
      .then(r=>r.json()).then(d=>{setDocs(Array.isArray(d)?d:[]);setCargando(false);})
      .catch(()=>setCargando(false));
  },[uid]);

  async function escanear(e){
    const file=e.target.files?.[0];
    if(!file)return;
    setError("");setFase("procesando");
    // Convertir a base64
    const b64=await new Promise(res=>{
      const r=new FileReader();
      r.onload=()=>res(r.result.split(",")[1]);
      r.readAsDataURL(file);
    });
    setFoto(b64);
    setFotoUrl(URL.createObjectURL(file));
    // Llamar a la API de CMR
    try{
      const resp=await fetch("/api/cmr",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({image:b64,mediaType:file.type||"image/jpeg"}),
      });
      const data=await resp.json();
      if(data.ok&&data.campos){
        setCampos(data.campos);
        setFase("revisar");
      } else {
        setError(data.campos?.error||data.error||"No se pudo leer el documento");
        setFase("scan");
      }
    }catch(e){
      setError("Error de conexión: "+e.message);
      setFase("scan");
    }
  }

  async function guardar(){
    if(!uid){setError("Debes iniciar sesión");return;}
    setSaving(true);
    try{
      // Subir foto a Supabase Storage
      let foto_url=null;
      if(foto){
        const ext="jpg";
        const path=`${uid}/${Date.now()}.${ext}`;
        const bytes=Uint8Array.from(atob(foto),c=>c.charCodeAt(0));
        const session=getSession();
        const token=session?.access_token||"";
        guardDemoCannotUseProduction(SB_URL,"storage:cmr-upload");
        const uploadRes=await fetch(`${SB_URL}/storage/v1/object/cmr/${path}`,{
          method:"POST",
          headers:{
            "Content-Type":"image/jpeg",
            "Authorization":`Bearer ${token}`,
            "apikey":SB_KEY,
          },
          body:bytes,
        });
        if(uploadRes.ok){
          const signRes=await fetch(`${SB_URL}/storage/v1/object/sign/cmr/${path}`,{
            method:"POST",
            headers:{
              "Authorization":`Bearer ${token}`,
              "apikey":SB_KEY,
              "Content-Type":"application/json",
            },
            body:JSON.stringify({expiresIn:60*60*24*7}),
          });
          if(signRes.ok){
            const sd=await signRes.json();
            foto_url=`${SB_URL}/storage/v1${sd.signedURL}`;
          }
        }
      }
      // Guardar en tabla cmr_docs
      const doc={
        id:String(Date.now()),
        user_id:uid,
        foto_url,
        ...campos,
        created_at:new Date().toISOString(),
      };
      await sbFetch("/rest/v1/cmr_docs",{
        method:"POST",
        headers:{"Prefer":"resolution=merge-duplicates"},
        body:JSON.stringify(doc),
      });
      setDocs(p=>[doc,...p]);
      setFase("lista");
      setFoto(null);setFotoUrl(null);setCampos({});
    }catch(e){
      setError("Error al guardar: "+e.message);
    }finally{setSaving(false);}
  }

  const inp={width:"100%",background:"#1E293B",border:"1px solid #334155",borderRadius:9,padding:"10px 12px",fontSize:15,color:"#F1F5F9",outline:"none",boxSizing:"border-box",marginBottom:8};
  const CAMPOS_LABELS=[
    {k:"num_cmr",l:"Nº CMR"},
    {k:"fecha",l:"Fecha"},
    {k:"remitente",l:"Remitente"},
    {k:"destinatario",l:"Destinatario"},
    {k:"transportista",l:"Transportista"},
    {k:"lugar_carga",l:"Lugar de carga"},
    {k:"lugar_entrega",l:"Lugar de entrega"},
    {k:"mercancia",l:"Mercancía"},
    {k:"peso_kg",l:"Peso (kg)"},
    {k:"bultos",l:"Bultos"},
    {k:"matricula",l:"Matrícula"},
    {k:"observaciones",l:"Observaciones"},
  ];

  return(
    <div style={{background:"#0F172A",minHeight:"calc(100vh - 120px)",padding:"16px 14px 80px"}}>

      {/* ── BOTÓN ESCANEAR ── */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={escanear} style={{display:"none"}}/>

      {(fase==="lista"||fase==="scan")&&(
        <button onClick={()=>fileRef.current?.click()}
          style={{width:"100%",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:14,padding:"20px",fontSize:17,fontWeight:800,cursor:"pointer",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          📷 FOTOGRAFIAR CMR
        </button>
      )}

      {fase==="procesando"&&(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:16}}>🤖</div>
          <div style={{fontSize:16,fontWeight:700,color:"#F59E0B",marginBottom:8}}>Analizando documento...</div>
          <div style={{fontSize:13,color:"#64748B"}}>Claude está extrayendo los datos del CMR</div>
        </div>
      )}

      {/* ── REVISAR CAMPOS ── */}
      {fase==="revisar"&&(
        <div>
          {fotoUrl&&<img src={fotoUrl} style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:12,marginBottom:16}}/>}
          <div style={{background:"#1E293B",borderRadius:12,padding:"12px 14px",marginBottom:14,fontSize:12,color:"#22C55E",display:"flex",gap:8,alignItems:"center"}}>
            <span>✓</span><span>Datos extraídos por IA — revisa y corrige si es necesario</span>
          </div>
          {CAMPOS_LABELS.map(({k,l})=>(
            <div key={k} style={{marginBottom:8}}>
              <div style={{fontSize:11,color:"#64748B",fontWeight:700,marginBottom:3}}>{l.toUpperCase()}</div>
              <input value={campos[k]||""} onChange={e=>setCampos(p=>({...p,[k]:e.target.value}))}
                placeholder={`${l}...`} style={inp}/>
            </div>
          ))}
          {error&&<div style={{background:"#450a0a",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#EF4444",marginBottom:12}}>{error}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
            <button onClick={()=>{setFase("scan");setError("");}}
              style={{background:"#1E293B",color:"#94A3B8",border:"1px solid #334155",borderRadius:10,padding:"14px",fontSize:14,cursor:"pointer"}}>
              ✕ Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              style={{background:saving?"#334155":"#22C55E",color:"white",border:"none",borderRadius:10,padding:"14px",fontSize:14,fontWeight:800,cursor:"pointer"}}>
              {saving?"⏳ Guardando...":"✅ Guardar CMR"}
            </button>
          </div>
        </div>
      )}

      {/* ── LISTA CMR GUARDADOS ── */}
      {fase==="lista"&&(
        <div>
          <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:12}}>CMR GUARDADOS</div>
          {cargando&&<div style={{color:"#64748B",fontSize:14,textAlign:"center",padding:20}}>Cargando...</div>}
          {!cargando&&docs.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:40,marginBottom:12}}>📄</div>
              <div style={{fontSize:14,color:"#475569"}}>Aún no tienes CMR guardados</div>
              <div style={{fontSize:12,color:"#334155",marginTop:4}}>Fotografía el primero con el botón de arriba</div>
            </div>
          )}
          {docs.map(d=>(
            <div key={d.id} style={{background:"#1E293B",borderRadius:12,padding:"14px",marginBottom:10,display:"flex",gap:12,alignItems:"flex-start"}}>
              {d.foto_url&&<img src={d.foto_url} style={{width:56,height:56,objectFit:"cover",borderRadius:8,flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9",marginBottom:2}}>{d.num_cmr||"CMR sin número"}</div>
                <div style={{fontSize:12,color:"#64748B"}}>{d.remitente||"—"} → {d.destinatario||"—"}</div>
                <div style={{fontSize:11,color:"#475569",marginTop:2}}>{d.lugar_carga||"—"} → {d.lugar_entrega||"—"}</div>
                <div style={{fontSize:11,color:"#334155",marginTop:4}}>{d.mercancia&&`📦 ${d.mercancia}`} {d.peso_kg&&`· ${d.peso_kg} kg`}</div>
              </div>
              <div style={{fontSize:11,color:"#334155",flexShrink:0,textAlign:"right"}}>
                {d.fecha||new Date(d.created_at).toLocaleDateString("es-ES")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  QR MUELLE — Escanea QR del muelle, registra carga y extrae CMR
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
//  CLICK SOUND — sonido suave al pulsar botones
// ─────────────────────────────────────────────────────────────
function playClick(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(1200,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800,ctx.currentTime+0.04);
    gain.gain.setValueAtTime(0.08,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.06);
    osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.06);
    osc.onended=()=>ctx.close();
  }catch(_){}
}

// ─────────────────────────────────────────────────────────────
//  QR MUELLE — Llegada y salida
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
//  CLICK SOUND
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
//  QR MUELLE — Llegada y salida
// ─────────────────────────────────────────────────────────────
function QrMuelleModal({onClose,showToast,setDb}){
  const[fase,setFase]=useState("inicio");
  const[camError,setCamError]=useState("");
  const[camLoading,setCamLoading]=useState(false);
  const[camDenied,setCamDenied]=useState(false);
  const[activeStream,setActiveStream]=useState(null);
  const[manual,setManual]=useState("");
  const[muelleActivo,setMuelleActivo]=useState(()=>{
    try{const v=localStorage.getItem("muelle_activo");return v?JSON.parse(v):null;}catch{return null;}
  });
  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const activeRef=useRef(true);
  const detectRafRef=useRef(null);
  const modalLiveRef=useRef(true);
  const procesarQRRef=useRef(()=>{});

  function parsearQR(txt){
    const d={raw:txt,muelle:"",referencia:"",empresa:"",mercancia:""};
    try{const j=JSON.parse(txt);Object.assign(d,j);}catch(_){}
    try{
      const isUrl=txt.startsWith("http")||txt.startsWith("?");
      const url=new URL(isUrl?txt:"https://x.com?"+txt);
      url.searchParams.forEach((v,k)=>{d[k]=v;});
    }catch(_){}
    const mM=txt.match(/muelle[^a-z]*([0-9A-Z]+)/i);
    const rM=txt.match(/ref[^a-z]*([0-9A-Z-]+)/i);
    const eM=txt.match(/empresa[^a-z]*([^\n,|]+)/i);
    const mcM=txt.match(/mercanc[^a-z]*([^\n,|]+)/i);
    if(mM)d.muelle=mM[1];
    if(rM)d.referencia=rM[1];
    if(eM)d.empresa=eM[1].trim();
    if(mcM)d.mercancia=mcM[1].trim();
    if(!d.muelle&&!d.referencia)d.muelle=txt.substring(0,40);
    return d;
  }

  function registrarLlegada(d){
    const ahora=new Date();
    const partes=[d.muelle&&"Muelle "+d.muelle,d.referencia&&"Ref:"+d.referencia,d.empresa,d.mercancia].filter(Boolean);
    const nota=partes.join(" · ");
    const reg={id:String(Date.now()),muelle:d.muelle,referencia:d.referencia,empresa:d.empresa,mercancia:d.mercancia,raw:d.raw,llegada:ahora.toISOString(),nota};
    localStorage.setItem("muelle_activo",JSON.stringify(reg));
    setMuelleActivo(reg);
    // NO registra evento de disponibilidad — el conductor elige después
    showToast("Llegada al muelle · "+ahora.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}));
    setFase("llegada_ok");
  }

  function registrarSalida(){
    const ahora=new Date();
    const llegada=new Date(muelleActivo.llegada);
    const min=Math.round((ahora-llegada)/60000);
    const h=Math.floor(min/60),m=min%60;
    const durStr=h?h+"h "+m+"min":m+"min";
    const reg=Object.assign({},muelleActivo,{salida:ahora.toISOString(),durMin:min});
    setDb(p=>({...p,muelleLog:[...(p.muelleLog||[]),reg]}));
    localStorage.setItem("muelle_log_last",JSON.stringify(reg));
    localStorage.removeItem("muelle_activo");
    setMuelleActivo(null);
    showToast("Salida del muelle · "+durStr+" en total");
    setFase("salida_ok");
  }

  function procesarQR(txt){
    if(!txt||!txt.trim())return;
    stopCam();
    if(!muelleActivo)registrarLlegada(parsearQR(txt.trim()));
    else registrarSalida();
  }
  procesarQRRef.current=procesarQR;

  function stopCam(){
    activeRef.current=false;
    if(detectRafRef.current){
      cancelAnimationFrame(detectRafRef.current);
      detectRafRef.current=null;
    }
    if(streamRef.current){
      streamRef.current.getTracks().forEach(function(t){t.stop();});
      streamRef.current=null;
    }
    setActiveStream(null);
    if(videoRef.current){
      try{videoRef.current.srcObject=null;}catch(_){}
    }
  }

  useEffect(function(){
    modalLiveRef.current=true;
    return function(){
      modalLiveRef.current=false;
      activeRef.current=false;
      stopCam();
    };
  },[]);

  function openScannerFromUserGesture(){
    playClick();
    setCamError("");
    setCamDenied(false);
    const gUM=navigator.mediaDevices&&navigator.mediaDevices.getUserMedia;
    if(typeof gUM!=="function"){
      setCamError("Cámara no disponible en este navegador.");
      return;
    }
    setCamLoading(true);
    gUM
      .call(navigator.mediaDevices,{
        video:{
          facingMode:{ideal:"environment"},
          width:{ideal:1280},
          height:{ideal:720},
        },
        audio:false,
      })
      .then(function(stream){
        if(!modalLiveRef.current){
          stream.getTracks().forEach(function(t){t.stop();});
          return;
        }
        streamRef.current=stream;
        setActiveStream(stream);
        setFase("scan");
      })
      .catch(function(e){
        const n=e&&e.name||"";
        if(n==="NotAllowedError"||n==="PermissionDeniedError"){
          setCamDenied(true);
          setCamError("Permiso cancelado o denegado. Pulsa de nuevo para reintentar o usa el campo manual.");
        }else if(n==="NotFoundError"||n==="DevicesNotFoundError"){
          setCamError("No se encontró cámara en este dispositivo.");
        }else{
          setCamError("No se pudo abrir la cámara: "+(e&&e.message||n||"error"));
        }
        setFase("inicio");
      })
      .finally(function(){setCamLoading(false);});
  }

  useLayoutEffect(function(){
    if(fase!=="scan"||!activeStream)return undefined;
    const v=videoRef.current;
    if(!v)return undefined;
    v.srcObject=activeStream;
    v.muted=true;
    v.defaultMuted=true;
    v.setAttribute("playsinline","");
    v.setAttribute("webkit-playsinline","");
    void v.play().catch(function(){});
    activeRef.current=true;
    if(!window.BarcodeDetector){
      setCamError("Tu navegador no detecta QR automáticamente. Usa el campo manual.");
      return undefined;
    }
    const bd=new window.BarcodeDetector({formats:["qr_code"]});
    function tick(){
      if(!activeRef.current||!videoRef.current)return;
      bd.detect(videoRef.current).then(function(codes){
        if(codes&&codes.length>0){procesarQRRef.current(codes[0].rawValue);}
        else{detectRafRef.current=requestAnimationFrame(tick);}
      }).catch(function(){detectRafRef.current=requestAnimationFrame(tick);});
    }
    function onLoaded(){
      if(activeRef.current)tick();
    }
    v.addEventListener("loadeddata",onLoaded,{once:true});
    if(v.readyState>=2)onLoaded();
    return function(){
      activeRef.current=false;
      if(detectRafRef.current){
        cancelAnimationFrame(detectRafRef.current);
        detectRafRef.current=null;
      }
      v.removeEventListener("loadeddata",onLoaded);
    };
  },[fase,activeStream]);

  var esLlegada=!muelleActivo;
  var col=esLlegada?"#84CC16":"#14B8A6";
  var hora=function(t){return new Date(t).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.94)",zIndex:2100,display:"flex",flexDirection:"column"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#0F172A",overflow:"hidden"}}>

        <div style={{background:"#1E293B",padding:"14px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0,borderBottom:"2px solid "+col}}>
          <span style={{fontSize:22}}>{esLlegada?"📥":"📤"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:col}}>{esLlegada?"LLEGADA AL MUELLE":"SALIDA DEL MUELLE"}</div>
            <div style={{fontSize:11,color:"#64748B"}}>{esLlegada?"Escanea el QR al llegar":"Escanea el mismo QR al salir"}</div>
          </div>
          <button onClick={function(){stopCam();onClose();}} style={{background:"transparent",border:"none",color:"#64748B",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>

        {muelleActivo&&fase!=="salida_ok"&&(
          <div style={{margin:"12px 16px 0",background:"#0D2010",border:"1px solid #84CC16",borderRadius:10,padding:"10px 14px",flexShrink:0}}>
            <div style={{fontSize:11,color:"#84CC16",fontWeight:800,marginBottom:4}}>MUELLE ACTIVO</div>
            <div style={{fontSize:13,color:"#F1F5F9"}}>{muelleActivo.nota||muelleActivo.muelle}</div>
            <div style={{fontSize:11,color:"#64748B",marginTop:2}}>Llegada: {hora(muelleActivo.llegada)}</div>
          </div>
        )}

        {(fase==="inicio"||fase==="scan"||camLoading)&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",padding:16,gap:12,overflowY:"auto"}}>
            {fase==="inicio"&&!camLoading&&(
              <button type="button" onClick={openScannerFromUserGesture}
                style={{background:col,color:"#0A0A0A",border:"none",borderRadius:16,padding:"22px",fontSize:18,fontWeight:900,cursor:"pointer",flexShrink:0}}>
                ABRIR CAMARA Y ESCANEAR
              </button>
            )}
            {camLoading&&(
              <div style={{background:"#1E293B",borderRadius:14,padding:"20px 16px",flexShrink:0,textAlign:"center",border:"1px solid #334155"}}>
                <div style={{fontSize:14,fontWeight:800,color:"#E2E8F0",marginBottom:8}}>Solicitando acceso a la cámara…</div>
                <div style={{fontSize:12,color:"#94A3B8",lineHeight:1.5}}>
                  Si aparece el aviso del sistema, pulsa <strong style={{color:"#FCD34D"}}>Permitir</strong>. En iPhone, el permiso se gestiona en Ajustes → Safari → Cámara (o la app instalada).
                </div>
              </div>
            )}
            {camDenied&&!camLoading&&fase==="inicio"&&(
              <div style={{background:"#422006",border:"1px solid #F59E0B55",borderRadius:12,padding:"12px 14px",fontSize:12,color:"#FDE68A",lineHeight:1.45,flexShrink:0}}>
                Sin permiso de cámara no se puede mostrar el visor. Reintenta con el botón o pega el texto del QR abajo.
              </div>
            )}
            {fase==="scan"&&activeStream&&(
              <div style={{position:"relative",flexShrink:0}}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{width:"100%",maxHeight:280,objectFit:"cover",borderRadius:16,background:"#000"}}
                />
                <div style={{position:"absolute",inset:"10%",border:"3px solid "+col,borderRadius:12,pointerEvents:"none"}}/>
                <div style={{textAlign:"center",marginTop:10,fontSize:12,color:"#64748B"}}>Centra el QR en el recuadro</div>
              </div>
            )}
            {camError&&<div style={{background:"#450a0a",borderRadius:10,padding:"10px 12px",fontSize:13,color:"#FCA5A5",flexShrink:0}}>{camError}</div>}
            <div style={{flexShrink:0}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:6}}>O escribe el contenido del QR:</div>
              <textarea value={manual} onChange={function(e){setManual(e.target.value);}} placeholder="Texto del QR..."
                style={{width:"100%",background:"#1E293B",border:"1px solid #334155",borderRadius:10,padding:"12px",fontSize:14,color:"#F1F5F9",outline:"none",minHeight:70,resize:"none",boxSizing:"border-box"}}/>
              <button onClick={function(){playClick();procesarQR(manual);}} disabled={!manual.trim()}
                style={{width:"100%",marginTop:8,background:manual.trim()?col:"#334155",color:"#0A0A0A",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:800,cursor:manual.trim()?"pointer":"default"}}>
                Usar este texto
              </button>
            </div>
          </div>
        )}

        {fase==="llegada_ok"&&muelleActivo&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",padding:"16px 16px 32px",gap:12,overflowY:"auto"}}>
            <div style={{background:"#0D2010",border:"1px solid #84CC1640",borderRadius:12,padding:"12px 14px",flexShrink:0}}>
              <div style={{fontSize:12,color:"#84CC16",fontWeight:800,marginBottom:6}}>✓ MUELLE REGISTRADO</div>
              {muelleActivo.muelle&&<div style={{fontSize:14,color:"#F1F5F9"}}>Muelle: <strong>{muelleActivo.muelle}</strong></div>}
              {muelleActivo.referencia&&<div style={{fontSize:13,color:"#94A3B8",marginTop:2}}>Ref: {muelleActivo.referencia}</div>}
              {muelleActivo.empresa&&<div style={{fontSize:13,color:"#94A3B8"}}>{muelleActivo.empresa}</div>}
              <div style={{fontSize:11,color:"#64748B",marginTop:4}}>Llegada: {hora(muelleActivo.llegada)}</div>
            </div>

            <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9",marginTop:4}}>¿Qué haces ahora?</div>

            {[
              {k:"inicio_carga",        icon:"📦",label:"CARGA",          col:"#84CC16"},
              {k:"inicio_disponibilidad",icon:"⏳",label:"DISPONIBILIDAD", col:"#F59E0B"},
              {k:"inicio_descarga",     icon:"📤",label:"DESCARGA",        col:"#14B8A6"},
              {k:"inicio_carga_descarga",icon:"⚒", label:"CARGA + DESCARGA",col:"#8B5CF6"},
            ].map(({k,icon,label,col})=>(
              <button key={k} onClick={()=>{
                const ahora=new Date();
                const nota="QR "+(muelleActivo.nota||muelleActivo.muelle||"");
                setDb(p=>({...p,entries:[...p.entries,{id:String(Date.now()),type:k,ts:ahora,nota,manual:false}]}));
                showToast(icon+" "+label+" iniciada");
                onClose();
              }} style={{background:"#1E293B",border:"2px solid "+col+"40",borderRadius:14,padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,color:col,textAlign:"left"}}>
                <span style={{fontSize:28,flexShrink:0}}>{icon}</span>
                <div>
                  <div style={{fontSize:16,fontWeight:800}}>{label}</div>
                  <div style={{fontSize:11,color:"#64748B",marginTop:2}}>Se anotará en el registro con el muelle</div>
                </div>
              </button>
            ))}

            <button onClick={onClose}
              style={{background:"transparent",color:"#64748B",border:"1px solid #1E293B",borderRadius:12,padding:"12px",fontSize:13,cursor:"pointer",marginTop:4}}>
              Cerrar — decido después
            </button>
          </div>
        )}

        {fase==="salida_ok"&&(()=>{
          const logs=JSON.parse(localStorage.getItem("muelle_log_last")||"{}");
          const min=logs.durMin||0;
          const h=Math.floor(min/60),m=min%60;
          const durStr=h?h+"h "+m+"min":m+"min";
          return(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16}}>
              <div style={{fontSize:56}}>🏁</div>
              <div style={{fontSize:22,fontWeight:900,color:"#14B8A6",textAlign:"center"}}>Salida registrada</div>
              <div style={{background:"#0D1E1C",border:"1px solid #14B8A640",borderRadius:14,padding:"18px 20px",width:"100%",textAlign:"center"}}>
                <div style={{fontSize:13,color:"#64748B",marginBottom:6}}>Tiempo total en muelle</div>
                <div style={{fontSize:42,fontWeight:900,color:"#14B8A6",fontFamily:"monospace"}}>{durStr}</div>
                {logs.muelle&&<div style={{fontSize:13,color:"#64748B",marginTop:6}}>Muelle {logs.muelle}</div>}
                <div style={{fontSize:11,color:"#334155",marginTop:4}}>
                  {logs.llegada&&hora(logs.llegada)} → {logs.salida&&hora(logs.salida)}
                </div>
              </div>
              <div style={{fontSize:13,color:"#475569",textAlign:"center"}}>Queda guardado en el registro para auditoría.</div>
              <button onClick={()=>onClose(true)}
                style={{width:"100%",background:"#14B8A6",color:"white",border:"none",borderRadius:12,padding:"16px",fontSize:16,fontWeight:800,cursor:"pointer"}}>
                ¿Qué hago ahora? →
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function AppInner(){
  const[db,setDb]=useState({entries:[],docs:[]});
  const[prof,setProf]=useState(PROF0);
  const[loaded,setLoaded]=useState(false);
  const[authChecked,setAuthChecked]=useState(false);
  const[user,setUser]=useState(null);
  const[tab,setTab]=useState("servicio");
  const[viajeActivo,setViajeActivo]=useState(()=>{try{const v=localStorage.getItem("viaje_activo");return v?JSON.parse(v):null;}catch{return null;}});
  useEffect(()=>{
    if(!navigator.serviceWorker)return;
    function onSwMessage(e){
      if(e?.data?.type==="OPEN_TAB"&&e?.data?.payload?.tab==="servicio"){
        setTab("servicio");
      }
    }
    navigator.serviceWorker.addEventListener("message",onSwMessage);
    return()=>navigator.serviceWorker.removeEventListener("message",onSwMessage);
  },[]);
  useEffect(()=>{
    function sweep(){void runRetentionSweep().catch(()=>{});}
    sweep();
    const t=setInterval(sweep,6*60*60*1000);
    function onVis(){if(document.visibilityState==="visible")sweep();}
    document.addEventListener("visibilitychange",onVis);
    return()=>{clearInterval(t);document.removeEventListener("visibilitychange",onVis);};
  },[]);
  useEffect(()=>{
    function onStorage(e){
      if(e.key!=="viaje_activo")return;
      try{setViajeActivo(e.newValue?JSON.parse(e.newValue):null);}
      catch{setViajeActivo(null);}
    }
    window.addEventListener("storage",onStorage);
    return()=>window.removeEventListener("storage",onStorage);
  },[]);
  const[modalViaje,setModalViaje]=useState(false);
  const[viajePrefill,setViajePrefill]=useState(null);
  const viajePrefillRef=useRef(null);
  useEffect(()=>{viajePrefillRef.current=viajePrefill;},[viajePrefill]);
  const[clock,setClock]=useState(new Date());
  const[dark,setDark]=useState(()=>{
    const d=localStorage.getItem("dark");
    if(d==="1")return true;
    if(d==="0")return false;
    return false;
  });
  const[modal,setModal]=useState(null);
  const[editId,setEditId]=useState(null);
  const[evType,setEvType]=useState(null);
  const[evNote,setEvNote]=useState("");
  const[evLoc,setEvLoc]=useState("");
  const[gpsLoading,setGpsLoading]=useState(false);
  const[subStatus,setSubStatus]=useState(null); // null=loading, objeto=cargado

  // Detectar sesión caducada y forzar re-login
  useEffect(()=>{
    // Verificar sesión al arrancar
    const uid=getUserId();
    setUser(uid);
    setAuthChecked(true);
    // Si viene de Stripe con pago ok, refrescar suscripción
    const params=new URLSearchParams(window.location.search);
    const pagoOk=params.get("pago")==="ok";
    const equipoJoin=params.get("equipo")||params.get("join")||params.get("code");
    if(equipoJoin){
      sessionStorage.setItem("cuaderno_pending_equipo_vinculo", normalizeEmpresaVinculoCode(equipoJoin));
      params.delete("equipo");
      params.delete("join");
      params.delete("code");
    }
    if(pagoOk){
      params.delete("pago");
      const uidPay=getUserId();
      if(uidPay){
        sbFetch(`/rest/v1/subscriptions?user_id=eq.${uidPay}`,{
          method:"PATCH",
          body:JSON.stringify({status:"active",plan:"monthly"})
        }).then(()=>setSubStatus({status:"active"})).catch(()=>setSubStatus({status:"active"}));
      } else {
        setSubStatus({status:"active"});
      }
    }
    if(pagoOk||equipoJoin){
      const qs=params.toString();
      window.history.replaceState({},document.title,`${window.location.pathname}${qs?`?${qs}`:""}`);
    }
    if(equipoJoin&&getUserId())setTab("perfil");
    setSessionExpiredHandler(()=>{
      setUser(null);
      setTab("servicio");
    });
    return()=>{setSessionExpiredHandler(null);};
  },[]);
  const[evPhoto,setEvPhoto]=useState(null);
  const[tMode,setTMode]=useState("now");
  const[tOff,setTOff]=useState(0);
  const[tExact,setTExact]=useState("");
  const[tmplId,setTmplId]=useState(null);
  const[tmplF,setTmplF]=useState({});
  const[tmplPhoto,setTmplPhoto]=useState(null);
  const[tmplLoc,setTmplLoc]=useState("");
  const[histDay,setHistDay]=useState(null);
  const[searchQ,setSearchQ]=useState("");
  const[docDetail,setDocDetail]=useState(null);
  const[toast,setToast]=useState("");
  const[toastColor,setToastColor]=useState("#1E293B");
  const[countryModal,setCountryModal]=useState(false);
  const[equipoActivo,setEquipoActivo]=useState(false);
  const[equipoModal,setEquipoModal]=useState(false);
  const[equipoConductor,setEquipoConductor]=useState("");
  const[pendingJornada,setPendingJornada]=useState(null);
  const[resumenTab,setResumenTab]=useState("resumen");
  const[rolEmpresa,setRolEmpresa]=useState(null);
  const[docsTab,setDocsTab]=useState("home");
  const[stopO,setStopO]=useState("");
  const[stopD,setStopD]=useState("");
  const[stopRes,setStopRes]=useState(null);
  const[stopLoad,setStopLoad]=useState(false);
  const[stopErr,setStopErr]=useState("");
  const photoRef=useRef(null),tmplPhotoR=useRef(null);
  const geoRef=useRef(null);
  const jStateRef=useRef("none");
  const width=useWidth(),isWide=width>=768;
  const showToast=useCallback((m,color="#1E293B",ms=2500)=>{setToast(m);setToastColor(color);setTimeout(()=>setToast(""),ms);},[]);
  const docsUi={
    page:"#F0F4F8",
    card:"#FFFFFF",
    border:"#DBE4EE",
    text:"#0F172A",
    muted:"#64748B",
    heading:"#334155",
  };

  // Cargar datos — Supabase si hay sesión, local si no
  const syncingRef=useRef(false); // evita que el save se dispare durante un sync

  async function syncFromSupabase(){
    const uid=getUserId();
    if(!uid)return;
    try{
      syncingRef.current=true;
      await sbRefreshSession().catch(()=>{});
      const profRows=await sbSelect("profiles",`id=eq.${uid}`);
      if(profRows[0]?.is_archived){
        showToast("Esta cuenta está archivada y no puede usarse. Contacta con administración.","#B91C1C",5200);
        await sbSignOut();
        setUser(null);
        return;
      }
      if(profRows.length){
        const p=profRows[0];
        setProf(prev=>({...prev,nombre:p.nombre||"",dni:p.dni||"",empresa:p.empresa||"",matricula:p.matricula||"",remolque:p.remolque||"",tipoVehiculo:p.tipo_vehiculo||"articulado",licencia:p.licencia||"",paisBase:p.pais_base||"ES",tipoServicio:p.tipo_servicio||"nacional",lang:p.lang||"es",cif:p.cif||"",direccion:p.direccion||"",telefono:p.telefono||"",emailEmpresa:p.email_empresa||"",cp:p.cp||"",ciudad:p.ciudad||"",tipo_cuenta:p.tipo_cuenta||ACCOUNT_TYPES.CONDUCTOR,canDrive:!!p.can_drive}));
      }
      const entRows=await sbSelect("entries",`user_id=eq.${uid}&limit=5000&order=ts.asc`);
      const sbEntries=entRows.map(r=>({
        id:r.id,type:r.type,ts:new Date(r.ts),
        note:r.note||"",location:r.location||"",
        photo:r.photo||null,late:r.late||false,
        deleted:r.deleted||false,
        corrected_by:r.corrected_by||null,
        corrects:r.corrects||null,
        pais:r.pais||null,
        corrected_at:r.corrected_at||null,
      }));
      const docRows=await sbSelect("documentos",`user_id=eq.${uid}&limit=1000`);
      const docs=docRows.map(r=>({id:r.id,templateId:r.template_id,templateLabel:r.template_label,templateIcon:r.template_icon,templateColor:"#64748B",ts:new Date(r.ts),fields:r.fields||{},photo:r.photo||null,location:r.location||""}));

      // Merge: mantener entradas locales de HOY que aún no están en Supabase
      setDb(prev=>{
        return mergeRemoteWithLocalToday({
          remoteEntries: sbEntries,
          remoteDocs: docs,
          localEntries: prev.entries,
          toDate,
        });
      });
    }catch(_){}finally{
      setTimeout(()=>{syncingRef.current=false;},500);
    }
  }

  useEffect(()=>{
    async function load(){
      const uid=getUserId();
      if(uid){
        try{ await syncFromSupabase(); }
        catch(e){
          const[d,p]=await Promise.all([loadDB(),loadProf()]);
          setDb({entries:(d.entries||[]).map(e=>({...e,ts:new Date(e.ts)})),docs:(d.docs||[]).map(x=>({...x,ts:new Date(x.ts)}))});
          setProf({...PROF0,...p});
        }
      } else {
        const[d,p]=await Promise.all([loadDB(),loadProf()]);
        setDb({entries:(d.entries||[]).map(e=>({...e,ts:new Date(e.ts)})),docs:(d.docs||[]).map(x=>({...x,ts:new Date(x.ts)}))});
        setProf({...PROF0,...p});
      }
      setLoaded(true);
      // Detectar vínculo conductor ↔ flota (no define el shell activo)
      const uidRol=getUserId();
      if(uidRol){
        const detectarRol=async(intento=0)=>{
          try{
            const rels=await sbSelect("conductor_empresa",`user_id=eq.${uidRol}&activo=eq.true`);
            if(rels.length){setRolEmpresa("conductor");return;}
            setRolEmpresa(null);
          }catch(e){
            if(intento<2)setTimeout(()=>detectarRol(intento+1),2000);
          }
        };
        detectarRol();
      }
    }
    load();
  },[]);

  // Sincronizar al volver a la app
  useEffect(()=>{
    function onVisible(){
      if(document.visibilityState==="visible"&&getUserId())syncFromSupabase();
    }
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[]);

  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t);},[]);

  // ── GEOLOCALIZACIÓN — guarda posición cada 10 min con jornada abierta ──
  useEffect(()=>{
    return()=>{if(geoRef.current){clearInterval(geoRef.current);geoRef.current=null;}};
  },[]);

  // Guardar — NO disparar durante un sync para evitar sobreescribir
  useEffect(()=>{
    if(!loaded||syncingRef.current)return;
    const uid=getUserId();
    saveDB({entries:db.entries.map(e=>({...e,ts:toDate(e.ts).toISOString()})),docs:db.docs.map(d=>({...d,ts:toDate(d.ts).toISOString()}))});
    if(uid){
      const rows=db.entries.map(e=>({id:String(e.id),user_id:uid,type:e.type,ts:toDate(e.ts).toISOString(),note:e.note||null,location:e.location||null,photo:e.photo||null,late:e.late||false}));
      if(rows.length)sbUpsert("entries",rows).catch(()=>{});
    }
  },[db,loaded]);

  useEffect(()=>{
    if(!loaded)return;
    saveProf(prof);
    const uid=getUserId();
    if(uid){
      sbUpsert("profiles",[{id:uid,nombre:prof.nombre||null,dni:prof.dni||null,empresa:prof.empresa||null,matricula:prof.matricula||null,remolque:prof.remolque||null,tipo_vehiculo:prof.tipoVehiculo||"articulado",licencia:prof.licencia||null,pais_base:prof.paisBase||"ES",tipo_servicio:prof.tipoServicio||"nacional",lang:prof.lang||"es",cif:prof.cif||null,direccion:prof.direccion||null,telefono:prof.telefono||null,email_empresa:prof.emailEmpresa||null,cp:prof.cp||null,ciudad:prof.ciudad||null,updated_at:new Date().toISOString()}]).catch(()=>{});
    }
  },[prof,loaded]);

  const today=new Date();
  const allSorted=[...db.entries].sort((a,b)=>+toDate(a.ts)-+toDate(b.ts));
  const activeEntries=allSorted.filter(e=>!e.deleted&&!e.corrected_by);
  const todayEnts=allSorted.filter(e=>sameDay(e.ts,today));
  const todayActive=activeEntries.filter(e=>sameDay(e.ts,today));
  const active=findActive(todayActive);
  const actMins=active?diffMin(active.ts,clock):0;
  const jState=jornadaState(activeEntries);
  const[manualOffset,setManualOffset]=useState(()=>{
    try{const v=localStorage.getItem("manual_offset");return v?JSON.parse(v):null;}catch{return null;}
  });

  const normaRaw=calcNorma(activeEntries,clock,prof.abroadNow||false);
  // Aplicar offset manual si existe y es del mismo día
  const norma=useMemo(()=>{
    if(!manualOffset)return normaRaw;
    const offsetDay=new Date(manualOffset.ts);
    const isSameWeek=getMon(offsetDay)<=new Date()&&new Date()<=new Date(+getMon(offsetDay)+7*24*3600*1000);
    // Ventana: si tiene descansos reducidos usados → alguno fue de 9h → 15h
    // Si no → asume descansos completos de 11h → 13h
    // Pero si hay redRests > 0, la última podría haber sido reducida → 15h
    // Conservador: usar 15h si hay offset (el conductor acaba de empezar)
    const ventanaMax=(manualOffset.red||0)>0?15*60:13*60;
    const hoyUsado=Math.max(normaRaw.todayDrive,manualOffset.hoy||0);
    const ventanaDispOffset=normaRaw.ventanaDisp??{
      ventanaMax,
      restante:Math.max(0,ventanaMax-hoyUsado),
      tipo:(manualOffset.red||0)>0?"extendida":"normal",
      descTipo:(manualOffset.red||0)>0?"9h":"11h",
    };
    // cont y todayDrive: SUMAR offset + lo nuevo conducido (no Math.max)
    // El offset es el punto de partida, los registros nuevos se suman encima
    const contTotal=( manualOffset.cont||0)+normaRaw.cont;
    const hoyTotal=(manualOffset.hoy||0)+normaRaw.todayDrive;
    const semTotal=Math.max(normaRaw.weekDrive,(isSameWeek?manualOffset.sem:0)||0);
    return{
      ...normaRaw,
      cont:contTotal,
      todayDrive:hoyTotal,
      weekDrive:semTotal,
      biweekDrive:Math.max(normaRaw.biweekDrive,(manualOffset.bisem)||0),
      extUsed:Math.max(normaRaw.extUsed||0,manualOffset.ext||0),
      redRests:Math.max(normaRaw.redRests||0,manualOffset.red||0),
      jornadaCount:Math.max(normaRaw.jornadaCount||0,manualOffset.jornadaCount||0),
      canExt:Math.max(normaRaw.extUsed||0,manualOffset.ext||0)<2,
      rCont:Math.max(0,270-contTotal),
      rDay:Math.max(0,540-hoyTotal),
      rWeek:Math.max(0,3360-semTotal),
      ventanaDisp:ventanaDispOffset,
    };
  },[normaRaw,manualOffset]);
  const T=useT(prof.lang||"es");

  // Actualizar ref de jState para el efecto de geolocalización
  jStateRef.current=jState;

  /** Ubicación conductor: se captura puntualmente al registrar una acción, sin tracking continuo. */
  const tl=buildTimeline(todayEnts,clock);
  const dayMap={};db.entries.forEach(e=>{const k=dayKey(e.ts);if(!dayMap[k])dayMap[k]={date:new Date(e.ts),list:[]};dayMap[k].list.push(e);});
  const days=Object.entries(dayMap).sort((a,b)=>b[0].localeCompare(a[0]));
  const srch=searchQ.trim().length>1?db.entries.filter(e=>{const q=searchQ.toLowerCase(),T=EV[e.type];return T?.label.toLowerCase().includes(q)||e.note?.toLowerCase().includes(q)||fmtD(e.ts).toLowerCase().includes(q)||e.location?.toLowerCase().includes(q);}).sort((a,b)=>b.ts-a.ts):[];

  const getTs=()=>{if(tMode==="now")return new Date();if(tMode==="offset")return new Date(Date.now()-tOff*60000);return tExact?new Date(tExact):new Date();};
  const prevTs=tMode==="now"?clock:tMode==="offset"?new Date(+clock-tOff*60000):(tExact?new Date(tExact):clock);
  const isLate=tMode!=="now";

  const openServicioViajeModal=useCallback((hint)=>{
    setViajePrefill(hint||null);
    setModalViaje(true);
  },[]);

  // ── SW KEEPALIVE — mantener el SW vivo para notificaciones ─────
  useEffect(()=>{
    if(jState!=="open")return;
    // Ping al SW cada 20 segundos para que no se duerma y revise timers
    const interval=setInterval(()=>{
      swRef.current?.active?.postMessage({type:"KEEPALIVE"});
    },20000);
    return()=>clearInterval(interval);
  },[jState]);
  useEffect(()=>{
    function handleBeforeUnload(e){
      if(!active||jState!=="open")return;
      const T=EV[active.type];
      const msg=`${T?.label||active.type} seguirá registrado mientras la app esté cerrada. Al volver verás el tiempo acumulado correctamente.`;
      e.preventDefault();
      e.returnValue=msg;
      return msg;
    }
    window.addEventListener("beforeunload",handleBeforeUnload);
    return()=>window.removeEventListener("beforeunload",handleBeforeUnload);
  },[active,jState]);

  // Al volver a la app — mostrar qué ha estado pasando
  useEffect(()=>{
    function handleVisibilityChange(){
      if(document.visibilityState!=="visible")return;
      if(!active||jState!=="open")return;
      const minAusente=diffMin(new Date(active.ts),new Date());
      if(minAusente>2){
        const T=EV[active.type];
        showToast(
          `${T?.icon||""} ${T?.label||""} — ${fmtDur(Math.round(minAusente))} registrados`,
          T?.color||"#22C55E", 4000
        );
      }
    }
    document.addEventListener("visibilitychange",handleVisibilityChange);
    return()=>document.removeEventListener("visibilitychange",handleVisibilityChange);
  },[active,jState]);
  const swRef=useRef(null);
  const notifSent=useRef(new Set());

  // ── PUSH NOTIFICATIONS (FCM) — Android + iOS PWA ──
  // Depende de `user`: tras login `setUser(getUserId())` debe volver a ejecutar init (antes quedaba en no_user).
  useEffect(()=>{
    if(prof?.tipo_cuenta==="empresa")return;
    if(!user)return;
    if(!('serviceWorker' in navigator))return;
    navigator.serviceWorker.register('/sw.js').then(async reg=>{
      swRef.current=reg;
      try{
        console.log("[push] initFcmPush invoked after conductor session (user state set)",{uid:String(user).slice(0,8)+"…"});
        const ctx=getPushClientContext();
        if(ctx.ios&&!ctx.standalone){
          showToast("Instala la app en pantalla de inicio para recibir servicios en tiempo real.");
        }
        const init=await initFcmPush({showToast});
        if(init?.ok)console.log("[push] FCM listo tras login");
        else console.log("[push] initFcmPush finished without token",{reason:init?.reason,traceKeys:init?.trace?Object.keys(init.trace):[]});
      }catch(e){
        console.log("[push] Push registration exception",e?.message||String(e),e);
      }
    }).catch((e)=>{
      console.log("[push] serviceWorker.register failed (AppInner effect)",e?.message||String(e),e);
    });
  },[user,prof?.tipo_cuenta,showToast]);

  function urlBase64ToUint8Array(base64String){
    const padding='='.repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const rawData=window.atob(base64);
    return new Uint8Array([...rawData].map(c=>c.charCodeAt(0)));
  }

  // Programar notificación push desde servidor
  function scheduleServerPush(title, body, tag, delayMs){
    const uid=getUserId();
    if(!uid||delayMs<=0)return;
    const fire_at=new Date(Date.now()+delayMs).toISOString();
    fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'schedule',payload:{user_id:uid,fire_at,title,body,tag}})
    }).catch(()=>{});
    // También programar localmente como respaldo
    swMsg('SCHEDULE_NOTIFICATION',{title,body,tag,delay:delayMs});
  }

  function cancelServerPush(tag){
    const uid=getUserId();
    if(!uid)return;
    fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'cancel',payload:{user_id:uid,tag}})
    }).catch(()=>{});
    swMsg('CANCEL_NOTIFICATION',{tag});
  }

  function askNotifPermission(){
    if(!('Notification' in window))return;
    if(((typeof Notification!=="undefined")?Notification.permission:"denied")==="default"){
      if(typeof Notification!=="undefined") Notification.requestPermission().then(p=>{
        if(p==="granted"){
          showToast("Notificaciones activadas","#22C55E");
          // Intentar registrar periodic background sync (Chrome Android)
          swRef.current?.periodicSync?.register?.("check-notifs",{minInterval:60000}).catch(()=>{});
        }
      });
    }
  }

  function swMsg(type,payload){
    if(!swRef.current?.active)return;
    swRef.current.active.postMessage({type,payload});
  }

  function scheduleNotif(tag,title,body,delayMs=0){
    // Server push primero (funciona con pantalla apagada), SW local como respaldo
    scheduleServerPush(title,body,tag,delayMs);
  }

  function cancelNotif(tag){
    cancelServerPush(tag);
  }

  // Programar notificaciones basadas en el estado normativo
  useEffect(()=>{
    if(!norma||((typeof Notification!=="undefined")?Notification.permission:"denied")!=="granted")return;
    const key=`${norma.canDrive}_${norma.crDur}_${jState}`;
    if(notifSent.current.has(key))return;
    notifSent.current.add(key);

    // Cancelar todas las anteriores para reprogramar
    swMsg("CANCEL_ALL",{});

    if(jState!=="open")return;

    const isDriving=norma.isDriving;
    const isPausing=norma.crType==="inicio_pausa"||norma.crType==="inicio_descanso";

    if(isDriving){
      // Alerta 30 min antes del límite
      if(norma.canDrive>30){
        scheduleNotif(
          "alerta_30",
          "⏰ Para en 30 minutos",
          `Llevas conduciendo y debes parar pronto. Busca un área de descanso.`,
          (norma.canDrive-30)*60000
        );
      }
      // Alerta 10 min antes
      if(norma.canDrive>10){
        scheduleNotif(
          "alerta_10",
          "🚨 ¡Para en 10 minutos!",
          `Límite de conducción casi alcanzado. Detente ya.`,
          (norma.canDrive-10)*60000
        );
      }
      // Alerta límite superado
      if(norma.canDrive>0){
        scheduleNotif(
          "alerta_0",
          "🚨 PARA AHORA — Límite superado",
          `Has alcanzado el límite de conducción. Debes parar inmediatamente.`,
          norma.canDrive*60000
        );
      }
    }

    if(isPausing&&norma.rRest>0){
      // Notificar cuando termina la pausa obligatoria
      scheduleNotif(
        "fin_pausa",
        "✅ Ya puedes conducir",
        `Pausa completada. Puedes reanudar la conducción.`,
        norma.rRest*60000
      );
      // Aviso 5 min antes de que termine la pausa
      if(norma.rRest>5){
        scheduleNotif(
          "casi_fin_pausa",
          "⏰ Pausa casi terminada",
          `En 5 minutos puedes volver a conducir.`,
          (norma.rRest-5)*60000
        );
      }
      // Si es descanso largo — avisar cuando llegue a 9h
      if(norma.crType==="inicio_descanso"){
        const rRestCompleto=Math.max(0,540-norma.crDur); // 9h
        if(rRestCompleto>0){
          scheduleNotif(
            "descanso_9h",
            "✅ Descanso completo — 9 horas",
            `Has descansado 9 horas. Nueva jornada disponible con ventana de 15h.`,
            rRestCompleto*60000
          );
        }
        const rRestNormal=Math.max(0,660-norma.crDur); // 11h
        if(rRestNormal>0){
          scheduleNotif(
            "descanso_11h",
            "✅ Descanso completo — 11 horas",
            `Has descansado 11 horas. Nueva jornada con ventana de 13h.`,
            rRestNormal*60000
          );
        }
      }
    }

    // Alerta jornadas
    if((norma.jornadaCount||0)>=6){
      scheduleNotif(
        "jornadas_6",
        "📅 Llevas 6 jornadas seguidas",
        `Debes tomar el descanso semanal antes de continuar.`,
        0
      );
    }

  },[norma?.canDrive,norma?.crDur,norma?.isDriving,norma?.crType,jState]);

  // Cancelar notificaciones al cerrar jornada o cambiar estado
  useEffect(()=>{
    if(jState==="closed"||jState==="none"){
      swMsg("CANCEL_ALL",{});
    }
  },[jState]);
  function openAdd(type){
    if(type==="__parar__"){setModal("parar_modal");return;}
    if(type==="__accion__"){setModal("accion_modal");return;}
    if(type==="__inspeccion__"){setModal("inspeccion");return;}
    if(type==="__datos_actuales__"){setModal("datos_actuales");return;}
    if(type==="__cancel_viaje__"){setViajeActivo(null);localStorage.removeItem("viaje_activo");showToast("Ruta operacional cancelada");return;}
    if(type==="__cambiar_viaje__"){setViajeActivo(null);localStorage.removeItem("viaje_activo");setModalViaje(true);return;}
    if(type==="__nora__"){setModal("nora");return;}
    if(type==="__parking_cercano__"){setModal("parking_cercano");return;}
    if(type==="__fin_silencioso__"){
      if(active&&EV[active.type]?.pair){
        const paisInfo=prof.abroadNow?prof.paisBase||"EU":`ES-${prof.ccaa||""}`;
        const pairType=EV[active.type].pair;
        const ne={id:Date.now()+Math.random(),type:pairType,ts:new Date(),note:"",location:"",photo:null,late:false,pais:paisInfo};
        setDb(p=>({...p,entries:[...p.entries,ne]}));
        if(getUserId()) sbUpsert("entries",[{id:ne.id,user_id:getUserId(),type:ne.type,ts:(ne.ts instanceof Date?(toDate(ne.ts).toISOString()):ne.ts),note:"",location:"",photo:null,late:false,pais:paisInfo}]).catch(()=>{});
        if(navigator.geolocation){
          navigator.geolocation.getCurrentPosition(
            async pos=>{
              const{latitude:lat,longitude:lon}=pos.coords;
              let loc=`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
              try{const r=await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
                if(r.ok){const d=await r.json();const p=d.features?.[0]?.properties;loc=p?.city||p?.town||p?.village||p?.name||loc;}
              }catch(_){}
              setDb(p=>({...p,entries:p.entries.map(e=>String(e.id)===String(ne.id)?{...e,location:loc}:e)}));
              if(getUserId())sbFetch(`/rest/v1/entries?id=eq.${ne.id}`,{method:"PATCH",body:JSON.stringify({location:loc})}).catch(()=>{});
            },
            ()=>{},
            {enableHighAccuracy:false,timeout:8000,maximumAge:60000}
          );
        }
        const lab=evLabel(pairType,prof.lang||"es")||EV[pairType]?.label||"";
        showToast(lab?`✅ ${lab}`:"✅ Registrado","#166534",2400);
        void registerDriverEventOperationalPoint({uid:getUserId(),norma,eventType:pairType,showToast});
        promptNextActivity(pairType);
      }
      return;
    }
    if(type==="__more__"){setModal("more");return;}
    if(type==="__otros__"){setModal("otros");return;}
    if(type==="__pausa__"){setModal("pausa_sel");return;}
    if(type==="inicio_ferry"){setModal("ferry_sel");return;}
    if(!isAvail(type,active,jState)){
      showToast(jState==="closed"?T("jornadaCerradaMsg"):jState==="none"?T("primeroJornada"):`Finaliza primero: ${EV[active?.type]?.label}`);
      return;
    }
    // Descanso cierra la jornada automáticamente
    if(type==="inicio_descanso"){
      const tsNow=new Date();
      const cierre={id:Date.now()+Math.random(),type:"fin_jornada",ts:tsNow,note:"Cierre automático al iniciar descanso",location:"",photo:null,late:false};
      setDb(p=>({...p,entries:[...p.entries,cierre]}));
      if(getUserId())sbUpsert("entries",[{id:cierre.id,user_id:getUserId(),type:"fin_jornada",ts:tsNow.toISOString(),note:cierre.note,location:"",photo:null,late:false}]).catch(()=>{});
    }
    // Si hay actividad abierta compatible, cerrarla automáticamente primero
    if(active&&EV[active.type]?.kind==="open"&&type!==EV[active.type]?.pair&&type!=="inicio_conduccion"){
      const pairType=EV[active.type]?.pair;
      if(pairType){
        const cierre={id:Date.now()+Math.random(),type:pairType,ts:new Date(),note:"Cierre automático",location:"",photo:null,late:false};
        setDb(p=>({...p,entries:[...p.entries,cierre]}));
        if(getUserId())sbUpsert("entries",[{id:cierre.id,user_id:getUserId(),type:cierre.type,ts:(cierre.ts instanceof Date?(toDate(cierre.ts).toISOString()):cierre.ts),note:cierre.note,location:"",photo:null,late:false}]).catch(()=>{});
      }
    }
    if(type==="inicio_jornada"||type==="fin_jornada"){
      setPendingJornada(type);setCountryModal(true);
      askNotifPermission();
      return;
    }
    if(type==="art12"){
      setEditId(null);setEvType(type);setEvPhoto(null);setTMode("now");setTOff(0);setTExact(toDTL(new Date()));
      setEvNote("Motivo Art.12: ");
      setEvLoc("");
      setModal("event");
      if(navigator.geolocation){
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
          async pos=>{
            const{latitude:lat,longitude:lon}=pos.coords;
            try{
              const r=await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
              if(r.ok){const d=await r.json();const p=d.features?.[0]?.properties;const name=p?.city||p?.town||p?.village||p?.name||`${lat.toFixed(4)},${lon.toFixed(4)}`;setEvLoc(name);}
              else setEvLoc(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
            }catch(_){setEvLoc(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);}
            setGpsLoading(false);
          },
          ()=>{setGpsLoading(false);},
          {enableHighAccuracy:false,timeout:8000,maximumAge:60000}
        );
      }
      return;
    }
    registerEventInstant(type);
  }
  function confirmCountry(country){
    const isAbroad=country!=="ES"&&country!=="";
    setProf(p=>({...p,paisBase:country||p.paisBase,abroadNow:isAbroad}));
    setCountryModal(false);
    const type=pendingJornada;setPendingJornada(null);

    // Calcular descanso desde última jornada
    let notaDescanso="";
    if(type==="inicio_jornada"){
      const ultFinJornada=[...allSorted].reverse().find(e=>e.type==="fin_jornada");
      if(ultFinJornada){
        const minDescanso=diffMin(ultFinJornada.ts,new Date());
        const horasDescanso=minDescanso/60;
        const hStr=`${Math.floor(horasDescanso)}h ${Math.round((horasDescanso%1)*60)}min`;
        if(horasDescanso<9){
          // Descanso insuficiente — mostrar aviso prominente
          const minFaltan=Math.round(9*60-minDescanso);
          notaDescanso=`⚠️ Descanso insuficiente: ${hStr} (mín. 9h). Los contadores del día anterior se mantienen.`;
          showToast(`⚠️ Solo llevas ${hStr} de descanso. Faltan ${fmtDur(minFaltan)} para el mínimo de 9h. Los contadores NO se resetean.`,"#7F1D1D",6000);
        } else if(horasDescanso<11){
          notaDescanso=`✓ Descanso reducido: ${hStr} (mín. 9h OK). País: ${country||"ES"}`;
          showToast(`✅ Descanso reducido: ${hStr}. Ventana de 15h disponible.`,"#14532D",4000);
        } else {
          notaDescanso=`✓ Descanso completo: ${hStr}. País: ${country||"ES"}`;
          showToast(`✅ Descanso completo: ${hStr}. Ventana de 13h disponible.`,"#14532D",4000);
        }
      } else {
        showToast("✅ Jornada abierta — ventana de 15h iniciada.","#14532D",3000);
      }
      // Cerrar descanso activo automáticamente si existe
      const descansoActivo=activeEntries.slice().reverse().find(e=>e.type==="inicio_descanso");
      const finDescansoExiste=descansoActivo&&activeEntries.find(e=>e.type==="fin_descanso"&&new Date(e.ts)>new Date(descansoActivo.ts));
      if(descansoActivo&&!finDescansoExiste){
        const finDesc={id:Date.now()+Math.random(),type:"fin_descanso",ts:new Date(),note:"Fin automático al iniciar jornada",location:"",photo:null,late:false};
        setDb(p=>({...p,entries:[...p.entries,finDesc]}));
      }
    }

    const noteJ=notaDescanso||`País: ${country||"ES"}`;
    setTimeout(()=>registerEventInstant(type,{note:noteJ}),80);
  }
  const[nextModal,setNextModal]=useState(false);
  const[descansoModal,setDescansoModal]=useState(false);

  /** Tras estos cierres no puede quedar sin actividad abierta: obliga elegir la siguiente. */
  const MANDATORY_NEXT_AFTER=new Set(["fin_conduccion","fin_pausa","fin_disponibilidad","fin_otros"]);
  const OPTIONAL_NEXT_TRIGGERS=[
    "fin_descanso","fin_carga","fin_descarga","fin_carga_descarga",
    "fin_repostaje","fin_inspeccion","fin_pasajero","fin_ferry",
  ];
  function promptNextActivity(finishType,delayMs=150){
    if(!finishType)return;
    if(MANDATORY_NEXT_AFTER.has(finishType)||OPTIONAL_NEXT_TRIGGERS.includes(finishType)){
      setTimeout(()=>setNextModal(finishType),delayMs);
    }
  }

  // Alertas de voz — se disparan una vez por sesión
  const voiceAlerted=useRef({m20:false,m45jornada:false,superado:false});
  useEffect(()=>{
    if(!norma.isDriving)return;
    function speak(txt){
      if(!window.speechSynthesis)return;
      window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(txt);
      u.lang="es-ES";u.rate=0.88;u.pitch=1.15;
      // Seleccionar voz femenina en español
      const voices=window.speechSynthesis.getVoices();
      const femVoice=voices.find(v=>v.lang.startsWith("es")&&/female|mujer|mónica|monica|lucia|lucía|paula|elena|google esp/i.test(v.name))
        ||voices.find(v=>v.lang.startsWith("es")&&v.name.includes("Google"))
        ||voices.find(v=>v.lang.startsWith("es"));
      if(femVoice)u.voice=femVoice;
      window.speechSynthesis.speak(u);
    }
    // Las voces pueden no estar cargadas aún — cargarlas
    if(window.speechSynthesis&&window.speechSynthesis.getVoices().length===0){
      window.speechSynthesis.addEventListener("voiceschanged",()=>{},{ once:true });
    }
    // 20 min antes de pausa obligatoria
    if(norma.rCont<=20&&norma.rCont>15&&!voiceAlerted.current.m20){
      voiceAlerted.current.m20=true;
      speak(`Atención. Te quedan ${Math.round(norma.rCont)} minutos de conducción continua. Si no paras te pueden multar.`);
    }
    if(norma.rCont>20)voiceAlerted.current.m20=false;
    // Límite superado
    if(norma.rCont<=0&&!voiceAlerted.current.superado){
      voiceAlerted.current.superado=true;
      speakNatural("Límite de conducción continua superado. Para el vehículo ahora mismo. Riesgo de multa grave.");
    }
    if(norma.rCont>0)voiceAlerted.current.superado=false;
    // 45 min antes de fin de jornada diaria
    if(norma.rDay<=45&&norma.rDay>40&&!voiceAlerted.current.m45jornada){
      voiceAlerted.current.m45jornada=true;
      speak(`Atención. Te quedan ${Math.round(norma.rDay)} minutos de jornada diaria. Superar el límite puede suponer una multa.`);
    }
    if(norma.rDay>45)voiceAlerted.current.m45jornada=false;
    // Pausa completada — ya puedes conducir
    const isPausing=norma.crType==="inicio_pausa"||norma.crType==="inicio_descanso_frac";
    const crDur=norma.crDur||0;
    if(isPausing&&crDur>=45&&!voiceAlerted.current.pausaOk){
      voiceAlerted.current.pausaOk=true;
      speakNatural("Pausa completada. Ya puedes continuar conduciendo.");
    }
    if(!isPausing)voiceAlerted.current.pausaOk=false;
    // Descanso diario completado
    const isResting=norma.crType==="inicio_descanso"||norma.crType==="inicio_descanso_semanal_r";
    if(isResting&&crDur>=540&&!voiceAlerted.current.descansoOk){
      voiceAlerted.current.descansoOk=true;
      speakNatural("Descanso completado. Ya tienes la jornada disponible para conducir.");
    }
    if(!isResting)voiceAlerted.current.descansoOk=false;
    // 5 minutos para que termine la pausa
    if(isPausing&&crDur>=40&&crDur<42&&!voiceAlerted.current.pausaCasi){
      voiceAlerted.current.pausaCasi=true;
      speakNatural("Faltan cinco minutos para completar la pausa obligatoria.");
    }
    if(!isPausing||crDur<40)voiceAlerted.current.pausaCasi=false;
  },[norma.isDriving,norma.rCont,norma.rDay]);

  function openEdit(e){setEditId(e.id);setEvType(e.type);setEvNote(e.note||"");setEvLoc(e.location||"");setEvPhoto(e.photo||null);setTMode("exact");setTExact(toDTL(e.ts));setTOff(0);setModal("event");}
  function interpretarDescanso(tipo, entries){
    // Buscar el inicio correspondiente
    const sorted=[...entries].sort((a,b)=>a.ts-b.ts);
    const par={fin_pausa:"inicio_pausa",fin_descanso:"inicio_descanso",fin_descanso_frac:"inicio_descanso_frac"};
    const inicioTipo=par[tipo];
    if(!inicioTipo)return null;
    const inicio=[...sorted].reverse().find(e=>e.type===inicioTipo);
    if(!inicio)return null;
    const dur=diffMin(inicio.ts,new Date());

    if(tipo==="fin_pausa"){
      if(dur>=45){
        return{msg:"✅ Pausa completa (≥45 min) — contador de conducción reiniciado",color:"#22C55E"};
      } else {
        // Recopilar todas las pausas consecutivas sin conducción entre medias
        const sortedE=[...entries].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
        const pausasConsec=[];
        let foundInicio=false;
        for(let i=sortedE.length-1;i>=0;i--){
          const ev=sortedE[i];
          if(ev.type==="inicio_conduccion")break; // conducción → paramos
          if(ev.type==="fin_pausa"){
            const ini=sortedE.slice(0,i).reverse().find(x=>x.type==="inicio_pausa");
            if(ini)pausasConsec.unshift({dur:diffMin(new Date(ini.ts),new Date(ev.ts))});
          }
        }
        pausasConsec.push({dur}); // añadir la pausa actual
        // Buscar patrón ≥15 seguido de ≥30 en cualquier posición
        let patron=false;
        for(let a=0;a<pausasConsec.length-1&&!patron;a++){
          if(pausasConsec[a].dur>=15){
            for(let b=a+1;b<pausasConsec.length;b++){
              if(pausasConsec[b].dur>=30){patron=true;break;}
            }
          }
        }
        if(patron){
          return{msg:"✅ Pausa fraccionada válida (15+30 min en orden correcto) — contador reiniciado",color:"#22C55E"};
        }
        // ¿Es la segunda parte de 30 pero sin 15 previo?
        if(dur>=30){
          return{msg:`⏸ ${fmtDur(dur)} de pausa — necesitas hacer primero ≥15 min para que sea fraccionada válida`,color:"#F97316"};
        }
        if(dur>=15){
          return{msg:"⏸ Primera parte (≥15 min) ✓ — ahora conduce y para ≥30 min más para completar",color:"#6366F1"};
        }
        return{msg:`⚠️ Solo ${fmtDur(dur)} — insuficiente. Mínimo 45 min seguidos o ≥15 min + ≥30 min en ese orden`,color:"#EF4444"};
      }
    }

    if(tipo==="fin_descanso_frac"){
      if(dur>=180){
        return{msg:`✅ Primera parte del descanso fraccionado (${fmtDur(dur)}) ✓ — cuando duermas 9h más el descanso es completo`,color:"#7C3AED"};
      } else {
        return{msg:`⚠️ Solo ${fmtDur(dur)} — la primera parte necesita mínimo 3h`,color:"#F97316"};
      }
    }

    if(tipo==="fin_descanso"){
      if(dur>=660){ // 11h
        return{msg:`✅ Descanso completo (${fmtDur(dur)}) — nueva jornada con 13h de ventana`,color:"#22C55E"};
      } else if(dur>=540){ // 9h
        return{msg:`✅ Descanso reducido (${fmtDur(dur)}) — nueva jornada con 15h de ventana`,color:"#16A34A"};
      } else if(dur>=180){ // 3h
        return{msg:`🔀 ${fmtDur(dur)} — válido como 1ª parte fraccionada. Necesitas 9h más para completar`,color:"#7C3AED"};
      } else {
        return{msg:`⚠️ Solo ${fmtDur(dur)} — descanso insuficiente. Minimo 9h`,color:"#EF4444"};
      }
    }

    if(tipo==="fin_ferry"){
      // Calcular descanso total Art.9: tierra antes + travesia + tierra despues
      const ferryStart=sortedE.slice().reverse().find(e=>e.type==="inicio_ferry");
      if(ferryStart){
        const ferryNote=(ferryStart.note||"").toLowerCase();
        const conCamarote=ferryNote.includes("camarote")||ferryNote.includes("litera")||ferryNote.includes("cama");
        if(!conCamarote){
          return{msg:"⛴ Ferry sin camarote — cuenta como disponible, no como descanso (Art.9)",color:"#F97316"};
        }
        const travesiaMins=diffMin(new Date(ferryStart.ts),new Date(currentEntries.find(e=>e.type==="fin_ferry")?.ts||new Date()));
        // Buscar descanso en tierra antes del ferry
        const antesStart=sortedE.slice().reverse().find(e=>e.type==="inicio_descanso"&&new Date(e.ts)<new Date(ferryStart.ts));
        const tierraAntes=antesStart?diffMin(new Date(antesStart.ts),new Date(ferryStart.ts)):0;
        const totalParcial=tierraAntes+travesiaMins;
        if(travesiaMins<480){
          return{msg:`⛴ Travesia de ${fmtDur(travesiaMins)} — necesitas ≥8h de travesia para que sea valido (Art.9)`,color:"#EF4444"};
        }
        if(totalParcial>=660){
          return{msg:`✅ Ferry Art.9 valido — ${fmtDur(tierraAntes)} tierra + ${fmtDur(travesiaMins)} travesia = descanso completo`,color:"#22C55E"};
        }
        if(totalParcial>=540){
          const faltan=540-totalParcial;
          return{msg:`⛴ Ferry valido (Art.9) — descansa ${fmtDur(faltan)} mas en tierra para completar el descanso`,color:"#0EA5E9"};
        }
        return{msg:`⛴ ${fmtDur(totalParcial)} acumulados — necesitas ${fmtDur(540-totalParcial)} mas de descanso en tierra`,color:"#F97316"};
      }
    }
    return null;
  }

  function confirmEvent(){
    if(evType==="art12"&&evNote.trim().length<20){showToast("Art.12: describe el motivo (mín 20 caracteres)");return;}
    const paisInfo=prof.abroadNow?prof.paisBase||"EU":`ES-${prof.ccaa||""}`;
    const now=new Date();

    if(editId){
      // ── CORRECCIÓN: guardar original tachado + nuevo con referencia cruzada ──
      const original=db.entries.find(e=>e.id===editId);
      if(!original){setModal(null);return;}
      const corrId=String(Date.now()+Math.random());
      const corrected={
        ...original,
        corrected_by:corrId,           // el original apunta al nuevo
        corrected_at:now.toISOString(),
      };
      const newEntry={
        id:corrId,
        type:evType,
        ts:getTs(),
        note:evNote.trim(),
        location:evLoc.trim(),
        photo:evPhoto,
        late:isLate,
        pais:paisInfo,
        corrects:editId,               // el nuevo apunta al original
        corrected_at:now.toISOString(),
        corrected_by_user:prof.nombre||"conductor",
        original_ts:original.ts,       // hora original para auditoría
        original_note:original.note,
      };
      setDb(p=>({...p,entries:[
        ...p.entries.map(e=>e.id===editId?corrected:e),
        newEntry
      ]}));
      if(getUserId()){
        sbFetch(`/rest/v1/entries?id=eq.${editId}`,{method:"PATCH",
          body:JSON.stringify({corrected_by:corrId,corrected_at:now.toISOString()})}).catch(()=>{});
        sbUpsert("entries",[{
          id:corrId,user_id:getUserId(),
          type:evType,ts:newEntry.ts instanceof Date?newEntry.ts.toISOString():new Date(newEntry.ts).toISOString(),
          note:newEntry.note||null,location:newEntry.location||null,
          photo:newEntry.photo||null,late:newEntry.late||false,
          pais:paisInfo,corrects:editId,
          corrected_at:now.toISOString(),
        }]).catch(()=>{});
      }
      showToast("✏️ Corrección guardada — original conservado en auditoría","#3B82F6",3000);
      void registerDriverEventOperationalPoint({uid:getUserId(),norma,eventType:`event_correction:${evType}`,showToast});
      setModal(null);
      setEditId(null);
      return;
    }

    // ── NUEVO REGISTRO ──
    const ne={id:Date.now()+Math.random(),type:evType,ts:getTs(),note:evNote.trim(),location:evLoc.trim(),photo:evPhoto,late:isLate,pais:paisInfo};
    const currentEntries=[...db.entries,ne];
    setDb(p=>({...p,entries:[...p.entries,ne]}));
    if(getUserId()){
      sbUpsert("entries",[{id:ne.id,user_id:getUserId(),type:ne.type,ts:ne.ts instanceof Date?(ne.ts instanceof Date?(toDate(ne.ts).toISOString()):ne.ts):new Date(ne.ts).toISOString(),note:ne.note||null,location:ne.location||null,photo:ne.photo||null,late:ne.late||false,pais:paisInfo}]).catch(()=>{});
    }
    setModal(null);
    void registerDriverEventOperationalPoint({uid:getUserId(),norma,eventType:evType,showToast});

    const interp=interpretarDescanso(evType,currentEntries);
    if(interp) setTimeout(()=>showToast(interp.msg,interp.color,5000),200);
    promptNextActivity(evType,interp?1500:150);
  }

  /** Registro inmediato (sin modal): GPS en segundo plano, nota opcional editable después. */
  function registerEventInstant(type, opts = {}){
    const ts = opts.ts != null ? (opts.ts instanceof Date ? opts.ts : new Date(opts.ts)) : new Date();
    const late = !!opts.late;
    let note = "";
    if (opts.note !== undefined) note = String(opts.note);
    else if (type === "continuar_jornada") note = "Reanudación de jornada";
    else if (type === "inicio_conduccion") {
      note = prof.matricula
        ? `Matrícula: ${prof.matricula}${equipoActivo ? ` · 2C con ${equipoConductor}` : ""}`
        : equipoActivo
          ? `2C con ${equipoConductor}`
          : "";
    }
    note = note.trim();
    const photo = opts.photo != null ? opts.photo : null;
    const paisInfo = prof.abroadNow ? prof.paisBase || "EU" : `ES-${prof.ccaa || ""}`;
    const ne = {
      id: Date.now() + Math.random(),
      type,
      ts,
      note,
      location: "",
      photo,
      late,
      pais: paisInfo,
    };
    const currentEntries = [...db.entries, ne];
    setDb((p) => ({ ...p, entries: [...p.entries, ne] }));
    if (getUserId()) {
      sbUpsert("entries", [
        {
          id: ne.id,
          user_id: getUserId(),
          type: ne.type,
          ts: toDate(ne.ts).toISOString(),
          note: ne.note || null,
          location: null,
          photo: ne.photo || null,
          late: ne.late || false,
          pais: paisInfo,
        },
      ]).catch(() => {});
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          let loc = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          try {
            const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
            if (r.ok) {
              const d = await r.json();
              const p = d.features?.[0]?.properties;
              loc = p?.city || p?.town || p?.village || p?.name || loc;
            }
          } catch (_) {}
          setDb((p) => ({
            ...p,
            entries: p.entries.map((e) => (String(e.id) === String(ne.id) ? { ...e, location: loc } : e)),
          }));
          if (getUserId())
            sbFetch(`/rest/v1/entries?id=eq.${ne.id}`, {
              method: "PATCH",
              body: JSON.stringify({ location: loc }),
            }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    }
    if (!opts.quiet) {
      const lab = evLabel(type, prof.lang || "es") || EV[type]?.label || type;
      showToast(opts.toastText || `✅ ${lab}`, "#166534", 2600);
    }
    void registerDriverEventOperationalPoint({
      uid: getUserId(),
      norma,
      eventType: type,
      showToast,
    });
    const interp = interpretarDescanso(type, currentEntries);
    if (interp) setTimeout(() => showToast(interp.msg, interp.color, 5000), 200);
    if (!opts.skipNextModal) promptNextActivity(type, interp ? 1500 : 150);
  }

  function quickNext(type){
    if(type==="inicio_descanso"){setNextModal(false);setDescansoModal(true);return;}
    if(type==="__otros__"){setNextModal(false);openAdd("__otros__");return;}
    setNextModal(false);
    const icon = EV[type]?.icon || "";
    const label = EV[type]?.label || type;
    registerEventInstant(type, {
      note: "",
      toastText: `${icon} ${label} iniciado`.trim(),
    });
  }
  function deleteEntry(id){
    // Toggle: si ya está eliminado, restaurar; si no, marcar como eliminado
    const entry=db.entries.find(e=>e.id===id);
    if(!entry)return;
    const wasDeleted=!!entry.deleted;
    setDb(p=>({...p,entries:p.entries.map(e=>e.id===id?{...e,deleted:!wasDeleted,deleted_at:wasDeleted?null:new Date().toISOString()}:e)}));
    if(getUserId()){
      sbFetch(`/rest/v1/entries?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({deleted:!wasDeleted})}).catch(()=>{});
    }
    showToast(wasDeleted?"↩ Entrada restaurada":"🗑 Entrada tachada — pulsa 🗑 de nuevo para restaurar","#475569",3000);
  }

  function correctEntry(original, newEntry){
    // Añadir el nuevo evento marcando que corrige al original
    const corrId=String(Date.now()+Math.random());
    const corr={...newEntry,id:corrId,corrected_by:original.id};
    // Marcar el original como corregido
    setDb(p=>({
      ...p,
      entries:[
        ...p.entries.map(e=>e.id===original.id?{...e,corrected_by:corrId}:e),
        corr
      ]
    }));
    if(getUserId()){
      sbFetch(`/rest/v1/entries?id=eq.${original.id}`,{method:"PATCH",body:JSON.stringify({corrected_by:corrId})}).catch(()=>{});
      const row={id:corrId,user_id:getUserId(),type:corr.type,ts:corr.ts instanceof Date?corr.ts.toISOString():new Date(corr.ts).toISOString(),note:corr.note||null,location:corr.location||null,photo:corr.photo||null,late:corr.late||false,corrected_by:original.id};
      sbUpsert("entries",[row]).catch(()=>{});
    }
  }
  function openTmpl(id){const t=TMPLS.find(x=>x.id===id);const def={};t.fields.forEach(f=>{if(f.type==="datetime")def[f.key]=toDTL(new Date());});setTmplId(id);setTmplF(def);setTmplPhoto(null);setTmplLoc("");setModal("template");}
  function confirmTmpl(){const t=TMPLS.find(x=>x.id===tmplId);setDb(p=>({...p,docs:[...p.docs,{id:Date.now()+Math.random(),templateId:tmplId,templateLabel:t.label,templateIcon:t.icon,templateColor:t.color,ts:new Date(),fields:tmplF,photo:tmplPhoto,location:tmplLoc}]}));setModal(null);}
  function handlePhoto(e,tgt){const f=e.target.files?.[0];if(!f)return;uploadPhoto(f,'entries').then(url=>{if(tgt==="ev")setEvPhoto(url);else setTmplPhoto(url);});}
  function doShare(txt){if(navigator.share)navigator.share({title:"Cuaderno de Ruta",text:txt}).catch(()=>{});else{navigator.clipboard?.writeText(txt);showToast("¡Copiado!");}}
  function shareWhatsApp(txt){
    // Intentar Web Share API nativo (funciona en móvil)
    if(navigator.share){
      navigator.share({text:txt}).catch(()=>{
        window.open("https://wa.me/?text="+encodeURIComponent(txt),"_blank");
      });
    } else {
      window.open("https://wa.me/?text="+encodeURIComponent(txt),"_blank");
    }
  }
  async function calcStop(){
    if(!stopO.trim()){setStopErr("Escribe tu ubicación actual");return;}
    setStopErr("");setStopLoad(true);setStopRes(null);
    try{const origin=await geocode(stopO.trim()),dest=stopD.trim()?await geocode(stopD.trim()):null;
      const distKm=Math.round(norma.canDrive*80/60);let routeCoords=null,stopPt=null,stopName="",routeKm=0,reach=false;
      if(dest){const route=await getRoute(origin,dest);routeCoords=route.coords;routeKm=route.km;if(distKm>=routeKm){reach=true;stopPt={lat:dest.lat,lon:dest.lon};stopName=dest.name;}else{stopPt=ptAlongRoute(route.coords,distKm);stopName=await revGeo(stopPt.lat,stopPt.lon);}}
      setStopRes({origin,dest,stopPt,stopName,distKm,remainMins:norma.canDrive,routeCoords,routeKm,reach});
    }catch(e){setStopErr(e.message);}finally{setStopLoad(false);}
  }

  if(!loaded)return <div style={s.splash}><BrandMark size={54} rounded={14}/><p style={{color:"#F59E0B",fontFamily:"Outfit, sans-serif",fontWeight:700,marginTop:12,letterSpacing:1,fontSize:12}}>CARGANDO...</p></div>;

  // Mostrar login si no hay sesión
  if(!authChecked)return <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:14,color:"#475569"}}>Cargando...</div></div>;
  if(!user||!getSession())return <AuthScreen onAuth={()=>{setUser(getUserId());setSubStatus(null);}}/>;
  // ── PAGOS DESACTIVADOS — acceso libre para todos ──
  // Activar cuando esté dado de alta como autónomo
  // if(subStatus===null){ ... check stripe ... }
  // if(subStatus.status==="expired"){ return <PaywallScreen/> }

  // Activo — continúa a la app

  const selTmpl=TMPLS.find(t=>t.id===tmplId);
  const authSession=getStoredAuthSession(getUserId());
  const showModeSwitch=isHybridSession(authSession);
  const isAdmin=!!authSession?.capabilities?.admin;
  const canCreateServices=hasFeature(authSession?.capabilities,FEATURE_KEYS.CAN_CREATE_SERVICES);
  const canViewAdvancedDocs=hasFeature(authSession?.capabilities,FEATURE_KEYS.CAN_VIEW_ADVANCED_DOCS);
  const canViewEnterpriseDocs=hasFeature(authSession?.capabilities,FEATURE_KEYS.CAN_VIEW_ENTERPRISE_DOCS);
  const showEmpresaPendingBanner=
    authSession?.capabilities?.accountType===ACCOUNT_TYPES.EMPRESA&&
    authSession?.capabilities?.empresaStatus==="pending"&&
    !authSession?.capabilities?.empresa;

  return(
    <div style={{...s.app,background:dark?"#0F172A":"#F0F4F8",minHeight:"100vh"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}body{font-family:'Outfit',sans-serif;background:${dark?"#0F172A":"#F0F4F8"};-webkit-tap-highlight-color:transparent;overflow-x:hidden}html{overflow-x:hidden}
        input,textarea,select,button{font-family:'Outfit',sans-serif}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
        @media(orientation:landscape)and(max-height:500px){body{font-size:13px}.nav-tab{padding:3px 2px 2px!important;font-size:10px!important}.nav-tab span:first-child{font-size:14px!important}}
        @keyframes ping{0%{transform:scale(1);opacity:.6}100%{transform:scale(2);opacity:0}}
        textarea{resize:vertical}input[type=datetime-local]{color-scheme:${dark?"dark":"light"}}input:focus,textarea:focus{outline:2px solid #F59E0B;outline-offset:-1px}
        .pw{display:flex;flex-direction:column}.sb{padding:14px 14px 0;width:100%}.mc{padding:8px 14px 80px;min-width:0}
        .bg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        @media(min-width:768px){.pw{flex-direction:row;align-items:flex-start}.sb{width:320px;flex-shrink:0;position:sticky;top:108px;max-height:calc(100vh-116px);overflow-y:auto;padding:14px 10px 14px 14px}.mc{flex:1;padding:14px 14px 80px}.bg{grid-template-columns:repeat(3,1fr)}}
        @media(min-width:1200px){.sb{width:360px}.bg{grid-template-columns:repeat(4,1fr)}}`}</style>

      <header style={{...s.hdr,background:dark?"#020817":"#0F172A"}}>
        <BrandHeader
          panelLabel="Panel Conductor"
          nameLabel={prof.nombre||getSession()?.user?.email||"—"}
          titleColor="#F1F5F9"
          subColor="#64748B"
        />
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Botón conducción en equipo — icono personas */}
          <button onClick={()=>{if(!equipoActivo){setEquipoModal(true);}else{setEquipoActivo(false);setEquipoConductor("");showToast("Conducción individual");} }}
            title={equipoActivo?`2 conductores · ${equipoConductor}`:"Solo"}
            style={{background:equipoActivo?"#F59E0B20":"transparent",color:equipoActivo?"#F59E0B":"#64748B",border:`1.5px solid ${equipoActivo?"#F59E0B":"#334155"}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>
            {/* Icono persona 1 */}
            <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
              <circle cx="7" cy="4" r="3"/>
              <path d="M1 15c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
            </svg>
            {equipoActivo&&(
              <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" style={{marginLeft:1}}>
                <circle cx="7" cy="4" r="3"/>
                <path d="M1 15c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
              </svg>
            )}
          </button>
          <button onClick={()=>{const nd=!dark;setDark(nd);localStorage.setItem("dark",nd?"1":"0");}} style={{background:"transparent",border:"1.5px solid #334155",borderRadius:8,padding:"5px 8px",fontSize:15,cursor:"pointer",color:"#F59E0B"}}>
            {dark?"☀️":"🌙"}
          </button>
          {showModeSwitch&&<ModeSwitchButton uid={getUserId()} targetMode="empresa" compact dark />}
          {getSession()&&<button onClick={async()=>{await sbSignOut();setUser(null);}} style={{background:"#EF444420",border:"1.5px solid #EF444440",borderRadius:8,padding:"5px 8px",fontSize:12,cursor:"pointer",color:"#EF4444",fontWeight:700}}>
            {T("salir")}
          </button>}
        </div>
      </header>

      {showEmpresaPendingBanner&&(
        <div style={{background:"#422006",borderBottom:"1px solid #92400E",padding:"10px 16px",fontSize:13,color:"#FDE68A",lineHeight:1.45}}>
          Tu cuenta empresa está en revisión. Puedes operar como conductor; el panel de gestión estará disponible tras la validación.
        </div>
      )}

      {/* Banner trial — desactivado hasta activar pagos */}
      {false&&subStatus?.status==="trial"&&subStatus.days_left<=5&&(
        <div style={{background:subStatus.days_left<=2?"#EF4444":"#F59E0B",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,fontWeight:700,color:"white"}}>
            ⏰ {subStatus.days_left<=0?"Prueba terminada":`Prueba: ${subStatus.days_left} día${subStatus.days_left===1?"":"s"} restante${subStatus.days_left===1?"":"s"}`}
          </span>
          <button onClick={async()=>{
            const tok=getAccessToken();
            const r=await fetch("/api/stripe",{method:"POST",headers:{"Content-Type":"application/json",...(tok?{Authorization:`Bearer ${tok}`}:{})},body:JSON.stringify({action:"create_checkout",user_id:getUserId(),email:prof.email||getSession()?.user?.email||"",plan:"monthly"})});
            const d=await r.json();if(d.url)window.location.href=d.url;
          }} style={{background:"white",color:"#0F172A",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:800,cursor:"pointer"}}>
            Suscribirse
          </button>
        </div>
      )}

      <nav style={s.nav}>
        {getConductorTabs({isAdmin,T}).map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);if(t.id==="docs")setDocsTab("home");}}
            style={{...s.navBtn,color:tab===t.id?"#F59E0B":"#64748B",
              background:tab===t.id?"rgba(245,158,11,.10)":"transparent",
              borderRadius:10,transition:"all .15s",
              border:tab===t.id?"1px solid rgba(245,158,11,.25)":"1px solid transparent"}}>
            <span style={{fontSize:22,fontWeight:tab===t.id?"900":"400",lineHeight:1,fontFamily:"system-ui"}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:.3,marginTop:1}}>{t.label}</span>
            {tab===t.id&&<div style={s.navLine}/>}
          </button>
        ))}
      </nav>

      <main style={s.main}>
        {tab==="hoy"&&(
          <div className="pw">
            {isWide&&<div className="sb"><LiveCard active={active} actMins={actMins} norma={norma} jState={jState} onAct={openAdd} matricula={prof.matricula} equipoActivo={equipoActivo} equipoConductor={equipoConductor} clock={clock} lang={prof.lang||"es"} showToast={showToast} activeEntries={activeEntries} onOpenServicio={()=>setTab("servicio")}/><Alerts alerts={norma.alerts}/></div>}
            <div className="mc">
              {!isWide&&<><LiveCard active={active} actMins={actMins} norma={norma} jState={jState} onAct={openAdd} matricula={prof.matricula} equipoActivo={equipoActivo} equipoConductor={equipoConductor} clock={clock} lang={prof.lang||"es"} showToast={showToast} activeEntries={activeEntries} onOpenServicio={()=>setTab("servicio")}/><Alerts alerts={norma.alerts}/></>}
              <div style={{ padding: "0 14px 14px" }}>
                {todayEnts.length > 0 ? (
                  <div
                    style={{
                      background: "white",
                      borderRadius: 12,
                      padding: "12px 14px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.6 }}>Registro del día</div>
                      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 650, marginTop: 4 }}>
                        {todayEnts.length} movimiento{todayEnts.length === 1 ? "" : "s"} · línea temporal en Resumen
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setTMode("offset");
                          setTOff(60);
                          setEditId(null);
                          setModal("entrada");
                        }}
                        title="Añadir entrada manual"
                        style={{ ...s.shareBtn, background: "#7c3aed", color: "white", border: "none", minWidth: 44, minHeight: 44 }}
                      >
                        ➕
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTab("resumen");
                          setResumenTab("resumen");
                        }}
                        style={{
                          minHeight: 44,
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#0f172a",
                          cursor: "pointer",
                        }}
                      >
                        Ver registro →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: "10px 8px 4px" }}>Sin movimientos registrados hoy. Usa «Comenzar jornada» arriba cuando empieces.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab==="servicio"&&(
          <TabServicio uid={getUserId()} norma={norma} conductorNombre={prof.nombre?.trim()||"Conductor"} showToast={showToast} onOpenViajeModal={openServicioViajeModal} canCreateServices={canCreateServices}/>
        )}

        {tab==="resumen"&&(
          <div>
            <div style={{background:"#1E293B",display:"flex",borderBottom:"1px solid #334155",position:"sticky",top:108,zIndex:98}}>
              {[
                {id:"resumen",   label:"Resumen",   icon:"📊"},
                {id:"ia",        label:"IA",         icon:"🤖"},
                {id:"historial", label:"Historial",  icon:"📋"},
              ].map(t=>(
                <button key={t.id} onClick={()=>setResumenTab(t.id)}
                  style={{flex:1,background:resumenTab===t.id?"#FFF7ED":"transparent",border:"none",
                    borderBottom:`3px solid ${resumenTab===t.id?"#F59E0B":"transparent"}`,
                    padding:"12px 4px 10px",cursor:"pointer",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:18}}>{t.icon}</span>
                  <span style={{fontSize:11,fontWeight:800,color:resumenTab===t.id?"#F59E0B":"#64748B",letterSpacing:.3}}>{t.label.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {resumenTab==="resumen"&&(
              <>
                <div style={{ padding: "12px 14px 8px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
                  <style>{`
                    .res-act-hoy > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; font-size: 14px; font-weight: 800; color: #0f172a; user-select: none; -webkit-tap-highlight-color: transparent; }
                    .res-act-hoy > summary::-webkit-details-marker { display: none; }
                    .res-act-hoy > summary::marker { content: ""; }
                    .res-act-hoy .res-act-chev { font-size: 12px; font-weight: 700; color: #64748b; }
                    .res-act-hoy[open] .res-act-chev { transform: rotate(180deg); display: inline-block; }
                  `}</style>
                  <details className="res-act-hoy" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 10 }}>
                    <summary>
                      <span>Actividad de hoy</span>
                      <span className="res-act-chev" aria-hidden>
                        ▼ Ver actividad
                      </span>
                    </summary>
                    <div style={{ padding: "0 12px 14px", borderTop: "1px solid #f1f5f9" }}>
                      <DayTL tl={tl} />
                      <RegistroDiaCronologico
                        todayEnts={todayEnts}
                        today={today}
                        fmtD={fmtD}
                        norma={norma}
                        prof={prof}
                        s={s}
                        setTMode={setTMode}
                        setTOff={setTOff}
                        setEditId={setEditId}
                        setModal={setModal}
                        openEdit={openEdit}
                        deleteEntry={deleteEntry}
                        exportPDF={exportPDF}
                        shareWhatsApp={shareWhatsApp}
                        buildTxt={buildTxt}
                        doShare={doShare}
                      />
                    </div>
                  </details>
                  <details className="res-act-hoy" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 10 }}>
                    <summary>
                      <span>Límites y desglose</span>
                      <span className="res-act-chev" aria-hidden>
                        ▼ Ver detalle
                      </span>
                    </summary>
                    <div style={{ padding: "0 12px 14px", borderTop: "1px solid #f1f5f9" }}>
                      <ResumenDetalleTiemposTecnico norma={norma} />
                    </div>
                  </details>
                </div>
                <details
                  className="res-semana-sum"
                  style={{ margin: "0 14px 14px", borderRadius: 14, border: "1px solid #1e293b", overflow: "hidden", background: "#080e1a" }}
                >
                  <style>{`
                    .res-semana-sum > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; font-size: 15px; font-weight: 800; color: #e2e8f0; user-select: none; -webkit-tap-highlight-color: transparent; background: #0f172a; border-bottom: 1px solid #1e293b; }
                    .res-semana-sum > summary::-webkit-details-marker { display: none; }
                    .res-semana-sum > summary::marker { content: ""; }
                    .res-semana-sum .res-sem-chev { font-size: 12px; font-weight: 700; color: #94a3b8; }
                    .res-semana-sum[open] .res-sem-chev { transform: rotate(180deg); display: inline-block; }
                  `}</style>
                  <summary>
                    <span>Esta semana</span>
                    <span className="res-sem-chev" aria-hidden>
                      ▼ Ver resumen semanal
                    </span>
                  </summary>
                  <div>
                    <ResumenView db={db} norma={norma} prof={prof} clock={clock} />
                  </div>
                </details>
              </>
            )}
            {resumenTab==="ia"&&<ChatTab norma={norma} prof={prof} todayEnts={todayEnts} clock={clock}/>}
            {resumenTab==="historial"&&<HistorialView db={db} norma={norma} prof={prof} allSorted={allSorted} dayMap={dayMap} days={days} srch={srch} searchQ={searchQ} setSearchQ={setSearchQ} openEdit={openEdit} deleteEntry={deleteEntry}/>}
          </div>
        )}
        {tab==="admin"&&isAdmin&&<AdminPanel dark={dark}/>}
        {tab==="perfil"&&<ProfView prof={prof} onSave={p=>{setProf(p);showToast("Perfil guardado ✓");}} norma={norma} db={db} showToast={showToast}/>}
        {tab==="ruta"&&<MapTab norma={norma} prof={prof} dark={dark} viajeActivo={viajeActivo}/>}
        {tab==="docs"&&(
          <div>
            {docsTab==="home"&&(
              <div style={{padding:"20px 14px max(80px, calc(72px + env(safe-area-inset-bottom)))",background:docsUi.page,minHeight:"calc(100vh - 120px)"}}>
                <div style={{fontSize:11,color:docsUi.muted,fontWeight:700,letterSpacing:1.5,marginBottom:20}}>DOCUMENTOS</div>
                <div style={{fontSize:14,color:docsUi.muted,lineHeight:1.55,marginBottom:22,maxWidth:480}}>
                  Aquí solo consultas y abres archivos ya guardados. La subida en parada (foto, CMR, etc.) va en la pestaña <strong style={{color:docsUi.text}}>Servicio</strong>, dentro del flujo de cada carga o descarga.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <button onClick={()=>setDocsTab("servicio_docs")} style={{background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:18,padding:"22px 14px",cursor:"pointer",textAlign:"center",gridColumn:"1/-1",boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:32,marginBottom:8}}>📦</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#22C55E",letterSpacing:.3}}>Por servicio</div>
                    <div style={{fontSize:12,color:docsUi.muted,marginTop:6,lineHeight:1.4}}>Ver documentos del servicio en curso o recientes</div>
                  </button>
                  <button onClick={()=>setDocsTab("gastos")} style={{background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:18,padding:"22px 14px",cursor:"pointer",textAlign:"center",gridColumn:"1/-1",boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:32,marginBottom:8}}>💰</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#22C55E",letterSpacing:.3}}>Gastos</div>
                    <div style={{fontSize:12,color:docsUi.muted,marginTop:6,lineHeight:1.4}}>Consultar combustible, peajes y dietas</div>
                  </button>
                  {canViewAdvancedDocs&&(
                  <button onClick={()=>setDocsTab("documentos")} style={{background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:18,padding:"20px 12px",cursor:"pointer",textAlign:"center",boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:28,marginBottom:6}}>📄</div>
                    <div style={{fontSize:14,fontWeight:800,color:"#3B82F6"}}>Plantillas</div>
                    <div style={{fontSize:11,color:docsUi.muted,marginTop:4,lineHeight:1.35}}>Partes e informes guardados</div>
                  </button>
                  )}
                  {canViewEnterpriseDocs&&(
                  <button onClick={()=>setDocsTab("empresa_home")} style={{background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:18,padding:"20px 12px",cursor:"pointer",textAlign:"center",boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:28,marginBottom:6}}>🏢</div>
                    <div style={{fontSize:14,fontWeight:800,color:"#F59E0B"}}>Empresa</div>
                    <div style={{fontSize:11,color:docsUi.muted,marginTop:4,lineHeight:1.35}}>Cargas e informes de empresa</div>
                  </button>
                  )}
                </div>
                <button onClick={()=>setDocsTab("km")} style={{width:"100%",background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:14,padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,marginBottom:8,boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                  <span style={{fontSize:28}}>🛣️</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#A78BFA"}}>LIBRO DE KM</div>
                    <div style={{fontSize:11,color:docsUi.muted,marginTop:2}}>Registro de kilómetros diarios</div>
                  </div>
                  <span style={{marginLeft:"auto",color:docsUi.heading,fontSize:18}}>›</span>
                </button>
                <button onClick={()=>setDocsTab("info")} style={{width:"100%",background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:14,padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                  <span style={{fontSize:28}}>ℹ️</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#3B82F6"}}>EMERGENCIAS</div>
                    <div style={{fontSize:11,color:docsUi.muted,marginTop:2}}>Teléfonos · Protocolos · Por país</div>
                  </div>
                  <span style={{marginLeft:"auto",color:docsUi.heading,fontSize:18}}>›</span>
                </button>
              </div>
            )}
            {docsTab==="gastos"&&(
              <div>
                <div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}>
                  <button onClick={()=>setDocsTab("home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button>
                  <span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>💰 GASTOS</span>
                </div>
                <GastosView db={db} setDb={setDb} prof={prof} norma={norma}/>
              </div>
            )}
            {docsTab==="documentos"&&(
              <div>
                <div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}>
                  <button onClick={()=>{if(tmplId){setTmplId(null);}else{setDocsTab("home");}}} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button>
                  <span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>
                    {tmplId?`${TMPLS.find(x=>x.id===tmplId)?.icon||"📄"} ${TMPLS.find(x=>x.id===tmplId)?.label||"Documento"}`:"📄 DOCUMENTOS"}
                  </span>
                </div>
                {docDetail?<div style={{padding:"10px 14px"}}>
                  <button onClick={()=>setDocDetail(null)} style={{...s.backBtn,color:"#F59E0B"}}>← Volver</button>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={s.secLbl}>{docDetail.templateIcon} {docDetail.templateLabel}</span>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{const t=TMPLS.find(x=>x.id===docDetail.templateId);let txt=`${docDetail.templateIcon} ${docDetail.templateLabel}\n${fmtFull(docDetail.ts)}\n${"─".repeat(26)}\n`;t?.fields.forEach(f=>{if(docDetail.fields[f.key])txt+=`\n${f.label}:\n${docDetail.fields[f.key]}`;});if(docDetail.location)txt+=`\n\n📍 ${docDetail.location}`;shareWhatsApp(txt);}} style={{...s.shareBtn,background:"#25D366",color:"white",border:"none"}}>📱 WA</button>
                      <button onClick={()=>{const t=TMPLS.find(x=>x.id===docDetail.templateId);let txt=`${docDetail.templateIcon} ${docDetail.templateLabel}\n${fmtFull(docDetail.ts)}\n${"─".repeat(26)}\n`;t?.fields.forEach(f=>{if(docDetail.fields[f.key])txt+=`\n${f.label}:\n${docDetail.fields[f.key]}`;});if(docDetail.location)txt+=`\n\n📍 ${docDetail.location}`;doShare(txt);}} style={s.shareBtn}>↗</button>
                    </div>
                  </div>
                  <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
                    <div style={{fontSize:11,color:"#94A3B8",fontWeight:700,marginBottom:12}}>{fmtFull(docDetail.ts)}</div>
                    {(()=>{const t=TMPLS.find(x=>x.id===docDetail.templateId);return t?.fields.map(f=>docDetail.fields[f.key]?<div key={f.key} style={{marginBottom:10,paddingBottom:10,borderBottom:"1px solid #F1F5F9"}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:800,letterSpacing:1,marginBottom:3}}>{f.label}</div><div style={{fontSize:14,color:"#1E293B",lineHeight:1.5}}>{docDetail.fields[f.key]}</div></div>:null);})()}
                    {docDetail.location&&<div style={{fontSize:13,color:"#475569",marginTop:6}}>📍 {docDetail.location}</div>}
                    {docDetail.photo&&<img src={docDetail.photo} style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:9,marginTop:8}} alt="foto"/>}
                  </div>
                </div>:(
                  <div style={{padding:"14px 14px 80px"}}>
                    {!tmplId?(
                      <div>
                        {/* Filtros */}
                        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                          <input type="date" id="docFiltroDesde" placeholder="Desde"
                            style={{flex:1,minWidth:120,border:"1.5px solid #E2E8F0",borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",colorScheme:"light"}}
                            onChange={e=>{const el=document.getElementById("docFiltroTipo");el&&el.dispatchEvent(new Event("change"));}}/>
                          <input type="date" id="docFiltroHasta" placeholder="Hasta"
                            style={{flex:1,minWidth:120,border:"1.5px solid #E2E8F0",borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",colorScheme:"light"}}/>
                          <select id="docFiltroTipo" defaultValue=""
                            style={{flex:1,minWidth:120,border:"1.5px solid #E2E8F0",borderRadius:8,padding:"7px 10px",fontSize:13,background:"white",outline:"none"}}>
                            <option value="">Todos los tipos</option>
                            {TMPLS.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                          </select>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                          {TMPLS.map(t=>(
                            <button key={t.id} onClick={()=>setTmplId(t.id)}
                              style={{background:"white",border:`1.5px solid ${t.color}30`,borderRadius:14,padding:"16px 10px",cursor:"pointer",textAlign:"center",boxShadow:"0 2px 4px rgba(0,0,0,.04)"}}>
                              <div style={{fontSize:28,marginBottom:6}}>{t.icon}</div>
                              <div style={{fontSize:12,fontWeight:700,color:"#0F172A",lineHeight:1.3}}>{t.label}</div>
                              {t.id==="policia"&&<div style={{fontSize:10,color:"#22C55E",marginTop:3,fontWeight:600}}>📱 WhatsApp</div>}
                            </button>
                          ))}
                        </div>
                        <div style={{fontSize:11,fontWeight:800,color:"#94A3B8",marginBottom:10,letterSpacing:1}}>GUARDADOS</div>
                        {(()=>{
                          // Apply filters reactively via DOM read — simple approach
                          const docs=[...(db.docs||[])].sort((a,b)=>new Date(b.ts)-new Date(a.ts));
                          if(docs.length===0) return <Empty icon="📄" title="Sin documentos" sub="Pulsa un tipo para crear uno"/>;
                          return docs.map(d=>{
                            const t=TMPLS.find(x=>x.id===d.templateId);
                            return(
                              <div key={d.id} onClick={()=>setDocDetail(d)}
                                style={{background:"white",borderRadius:12,padding:"12px 14px",marginBottom:8,cursor:"pointer",boxShadow:"0 2px 4px rgba(0,0,0,.04)",display:"flex",alignItems:"center",gap:12,border:"1.5px solid #F1F5F9"}}>
                                <span style={{fontSize:24}}>{d.templateIcon||t?.icon}</span>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{d.templateLabel||t?.label}</div>
                                  <div style={{fontSize:12,color:"#64748B",marginTop:2}}>{fmtFull(new Date(d.ts))}</div>
                                  {d.location&&<div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>📍 GPS registrado</div>}
                                </div>
                                <span style={{color:"#CBD5E1",fontSize:16}}>›</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ):(()=>{const tmpl=TMPLS.find(x=>x.id===tmplId);return tmpl?<DocForm tmpl={tmpl} onSave={d=>{setDb(p=>({...p,docs:[...(p.docs||[]),d]}));setTmplId(null);}} onCancel={()=>setTmplId(null)} />:null;})()}
                    {!tmplId&&<div>
                      <div style={{fontSize:11,fontWeight:800,color:"#94A3B8",marginBottom:10,letterSpacing:1}}>GUARDADOS</div>
                      {(db.docs||[]).length===0?<Empty icon="📄" title="Sin documentos" sub="Pulsa un tipo para crear uno"/>:
                        [...(db.docs||[])].sort((a,b)=>new Date(b.ts)-new Date(a.ts)).map(d=>{const t=TMPLS.find(x=>x.id===d.templateId);return(
                          <div key={d.id} onClick={()=>setDocDetail(d)} style={{background:"white",borderRadius:12,padding:"12px 14px",marginBottom:8,cursor:"pointer",boxShadow:"0 2px 4px rgba(0,0,0,.04)",display:"flex",alignItems:"center",gap:12,border:"1.5px solid #F1F5F9"}}>
                            <span style={{fontSize:24}}>{d.templateIcon||t?.icon}</span>
                            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{d.templateLabel||t?.label}</div><div style={{fontSize:12,color:"#64748B",marginTop:2}}>{fmtFull(new Date(d.ts))}</div>{d.location&&<div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>📍 {d.location}</div>}</div>
                            <span style={{color:"#CBD5E1",fontSize:16}}>›</span>
                          </div>);})
                      }
                    </div>}
                  </div>
                )}
              </div>
            )}
            {docsTab==="empresa_home"&&(
              <div>
                <div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}>
                  <button onClick={()=>setDocsTab("home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button>
                  <span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>🏢 EMPRESA</span>
                </div>
                <div style={{padding:"20px 14px 80px",background:docsUi.page,minHeight:"calc(100vh - 160px)"}}>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {[{id:"cargas",icon:"📦",label:"CARGAS",sub:"Registro de cargas y descargas",color:"#14B8A6"},{id:"empresa",icon:"📊",label:"INFORME SEMANAL",sub:"Genera el informe para la empresa",color:"#F59E0B"},{id:"auditoria",icon:"🔍",label:"AUDITORÍA",sub:"Trazabilidad y correcciones",color:"#6366F1"}].map(item=>(
                      <button key={item.id} onClick={()=>setDocsTab(item.id)} style={{background:docsUi.card,border:`1px solid ${docsUi.border}`,borderRadius:16,padding:"20px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,textAlign:"left",boxShadow:"0 3px 10px rgba(15,23,42,.06)"}}>
                        <span style={{fontSize:32}}>{item.icon}</span>
                        <div style={{flex:1}}><div style={{fontSize:16,fontWeight:800,color:item.color}}>{item.label}</div><div style={{fontSize:12,color:docsUi.muted,marginTop:3}}>{item.sub}</div></div>
                        <span style={{color:docsUi.heading,fontSize:20}}>›</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {docsTab==="cargas"&&<div><div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}><button onClick={()=>setDocsTab("empresa_home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button><span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>📦 CARGAS</span></div><CargasView db={db} prof={prof} dark={dark}/></div>}
            {docsTab==="empresa"&&<div><div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}><button onClick={()=>setDocsTab("empresa_home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button><span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>📊 INFORME</span></div><EmpresaReport db={db} prof={prof} dark={dark} norma={norma}/></div>}
            {docsTab==="auditoria"&&<div><div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}><button onClick={()=>setDocsTab("empresa_home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button><span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>🔍 AUDITORÍA</span></div><AuditoriaView db={db} prof={prof} dark={dark}/></div>}
            {docsTab==="info"&&<div><div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}><button onClick={()=>setDocsTab("home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button><span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>ℹ️ EMERGENCIAS</span></div><InfoEmergencias dark={dark}/></div>}
            {docsTab==="servicio_docs"&&<ServicioDocsView uid={getUserId()} showToast={showToast} onBack={()=>setDocsTab("home")}/>}
            {docsTab==="km"&&<div><div style={{background:"#FFFFFF",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #DBE4EE"}}><button onClick={()=>setDocsTab("home")} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px"}}>←</button><span style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>🛣️ LIBRO KM</span></div><LibroKm dark={dark} prof={prof}/></div>}
          </div>
        )}
      </main>

      {nextModal&&(()=>{
        const obligatorio=MANDATORY_NEXT_AFTER.has(nextModal);
        const esFinTrabajo=["fin_carga","fin_descarga","fin_carga_descarga","fin_repostaje","fin_inspeccion","fin_otros"].includes(nextModal);
        const esFinDisponible=["fin_disponibilidad","fin_pasajero","fin_ferry"].includes(nextModal);
        const opts = nextModal==="fin_conduccion"
          ? [{type:"inicio_pausa",    label:"Pausa",      sub:"≥45 min obligatoria",  icon:"🛌",color:"#6366F1"},
             {type:"inicio_descanso", label:"Descanso",   sub:"≥9h · cierra jornada", icon:"🛌",color:"#7C3AED"},
             {type:"inicio_disponibilidad",label:"Disponible",sub:"Espera, frontera", icon:"▨", color:"#06B6D4"},
             {type:"__otros__",       label:"Otros",      sub:"Carga, repostaje...",  icon:"⚒", color:"#F97316"}]
          : nextModal==="fin_pausa"
          ? [{type:"inicio_conduccion",label:"Conduccion",sub:"Continuar viaje",      icon:"⊙", color:"#F59E0B"},
             {type:"inicio_disponibilidad",label:"Disponible",sub:"Espera, frontera", icon:"▨", color:"#06B6D4"},
             {type:"inicio_descanso", label:"Descanso",   sub:"≥9h · cierra jornada", icon:"🛌",color:"#7C3AED"},
             {type:"__otros__",       label:"Otros",      sub:"Carga, repostaje...",  icon:"⚒", color:"#F97316"}]
          : nextModal==="fin_descanso"
          ? [{type:"inicio_conduccion",label:"Conduccion",sub:"Iniciar jornada",      icon:"⊙", color:"#F59E0B"},
             {type:"inicio_disponibilidad",label:"Disponible",sub:"Espera, frontera", icon:"▨", color:"#06B6D4"},
             {type:"__otros__",       label:"Otros",      sub:"Carga, repostaje...",  icon:"⚒", color:"#F97316"}]
          : esFinTrabajo
          ? [{type:"inicio_conduccion",label:"Conduccion",sub:"Salir a ruta",         icon:"⊙", color:"#F59E0B"},
             {type:"__otros__",       label:"Otro trabajo",sub:"Mas carga, repostaje",icon:"⚒", color:"#F97316"},
             {type:"inicio_disponibilidad",label:"Disponible",sub:"Espera, frontera", icon:"▨", color:"#06B6D4"},
             {type:"inicio_descanso", label:"Descanso",   sub:"≥9h · cierra jornada", icon:"🛌",color:"#7C3AED"}]
          : esFinDisponible
          ? [{type:"inicio_conduccion",label:"Conduccion",sub:"Continuar viaje",      icon:"⊙", color:"#F59E0B"},
             {type:"__otros__",       label:"Otros",      sub:"Carga, repostaje...",  icon:"⚒", color:"#F97316"},
             {type:"inicio_pausa",    label:"Pausa",      sub:"Descanso obligatorio",  icon:"🛌",color:"#6366F1"},
             {type:"inicio_descanso", label:"Descanso",   sub:"≥9h · cierra jornada", icon:"🛌",color:"#7C3AED"}]
          : [{type:"inicio_conduccion",label:"Conduccion",sub:"Continuar viaje",      icon:"⊙", color:"#F59E0B"},
             {type:"inicio_pausa",    label:"Pausa",      sub:"Descanso obligatorio",  icon:"🛌",color:"#6366F1"},
             {type:"inicio_disponibilidad",label:"Disponible",sub:"Espera, frontera", icon:"▨", color:"#06B6D4"},
             {type:"inicio_descanso", label:"Descanso",   sub:"≥9h · cierra jornada", icon:"🛌",color:"#7C3AED"}];
        return(
          <div style={s.overlay} onClick={obligatorio?undefined:()=>setNextModal(false)}>
            <div style={{...s.sheet,maxWidth:700}} onClick={e=>e.stopPropagation()}>
              <div style={{background:"#0F172A",padding:"18px 20px 14px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:18,fontWeight:800,color:"#F59E0B"}}>
                    {obligatorio?"Siguiente actividad obligatoria":"¿Qué haces ahora?"}
                  </div>
                  <div style={{fontSize:12,color:"#64748B",marginTop:2}}>
                    {obligatorio?"Selecciona y se abrirá automáticamente":"Toca para registrar con notas y ubicación"}
                  </div>
                </div>
                {!obligatorio?(<button onClick={()=>setNextModal(false)} style={s.xBtn}>✕</button>):null}
              </div>
              <div style={{padding:"16px 16px 32px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:obligatorio?0:14}}>
                  {opts.map(o=>(
                    <button key={o.type} onClick={()=>quickNext(o.type)}
                      style={{border:`2px solid ${o.color}50`,background:`${o.color}15`,borderRadius:16,padding:"20px 10px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                      <span style={{fontSize:36,lineHeight:1}}>{o.icon}</span>
                      <span style={{fontSize:16,fontWeight:800,color:o.color}}>{o.label}</span>
                      <span style={{fontSize:12,color:"#64748B",textAlign:"center",lineHeight:1.4}}>{o.sub}</span>
                    </button>
                  ))}
                </div>
                {!obligatorio?(
                  <button onClick={()=>setNextModal(false)} style={{width:"100%",background:"#1E293B",border:"1.5px solid #334155",borderRadius:12,padding:"14px",fontSize:14,fontWeight:600,color:"#64748B",cursor:"pointer"}}>
                    Registraré más tarde
                  </button>
                ):null}
              </div>
            </div>
          </div>
        );
      })()}

      {descansoModal&&(
        <div style={s.overlay} onClick={()=>setDescansoModal(false)}>
          <div style={{...s.sheet,maxWidth:700}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"#1E293B",padding:"18px 20px 14px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:"#7C3AED"}}>🛏 ¿Qué vas a hacer?</div>
                <div style={{fontSize:12,color:"#64748B",marginTop:2}}>Elige según lo que necesitas</div>
              </div>
              <button onClick={()=>setDescansoModal(false)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"16px 20px 32px"}}>
              {(()=>{
                const reducidos=norma?.redRests||0;
                const puedeReducir=reducidos<3;
                const esFueraDEsp=prof?.abroadNow;
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>

                    {/* Opción 1: Parar a dormir — la más común */}
                    <button onClick={()=>{
                      const now=new Date();
                      setDb(p=>({...p,entries:[...p.entries,
                        {id:Date.now()+Math.random(),type:"fin_jornada",ts:now,note:"Fin de jornada",location:"",photo:null,late:false},
                        {id:Date.now()+Math.random()+1,type:"inicio_descanso",ts:new Date(+now+1000),note:puedeReducir?"Descanso reducido 9h":"Descanso completo 11h",location:"",photo:null,late:false}
                      ]}));
                      setDescansoModal(false);
                      showToast(`🛏 Descansa mínimo ${puedeReducir?"9h → mañana tendrás 15h de ventana":"11h → mañana tendrás 13h de ventana"}`);
                    }} style={{background:"#7C3AED",color:"white",border:"none",borderRadius:14,padding:"16px",cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontSize:16,fontWeight:800}}>🛏 Parar a dormir</div>
                      <div style={{fontSize:13,opacity:.9,marginTop:4}}>Cierro la jornada y me voy a descansar</div>
                      <div style={{background:"rgba(255,255,255,.15)",borderRadius:8,padding:"8px 10px",marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:11,opacity:.8}}>Si descansas</div>
                          <div style={{fontSize:18,fontWeight:800}}>{puedeReducir?"9h mín":"11h mín"}</div>
                          <div style={{fontSize:10,opacity:.7}}>{puedeReducir?"reducido":"completo"}</div>
                        </div>
                        <div style={{textAlign:"center",background:"rgba(255,255,255,.1)",borderRadius:6,padding:"4px"}}>
                          <div style={{fontSize:11,opacity:.8}}>Mañana tendrás</div>
                          <div style={{fontSize:18,fontWeight:800}}>{puedeReducir?"15h":"13h"}</div>
                          <div style={{fontSize:10,opacity:.7}}>de ventana</div>
                        </div>
                      </div>
                      {!puedeReducir&&<div style={{fontSize:11,background:"rgba(255,255,255,.1)",borderRadius:6,padding:"5px 8px",marginTop:6}}>⚠️ Ya has usado 3 descansos reducidos esta semana</div>}
                      {puedeReducir&&<div style={{fontSize:11,background:"rgba(255,255,255,.1)",borderRadius:6,padding:"5px 8px",marginTop:6}}>
                        Quedan {3-reducidos} descansos reducidos · Si descansas fuera de jornada ≥11h = descanso completo
                      </div>}
                    </button>

                    {/* Opción 2: Fin de semana */}
                    <button onClick={()=>{
                      const now=new Date();
                      setDb(p=>({...p,entries:[...p.entries,
                        {id:Date.now()+Math.random(),type:"fin_jornada",ts:now,note:"Fin de semana",location:"",photo:null,late:false},
                        {id:Date.now()+Math.random()+1,type:"inicio_descanso",ts:new Date(+now+1000),note:esFueraDEsp?"Descanso semanal reducido 24h (fuera de España)":"Descanso semanal completo 45h",location:"",photo:null,late:false}
                      ]}));
                      setDescansoModal(false);
                      showToast(`🏨 Descanso semanal · Mínimo ${esFueraDEsp?"24h (compensar después)":"45h"}`);
                    }} style={{background:"#0F172A",color:"white",border:"1.5px solid #334155",borderRadius:14,padding:"16px",cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontSize:16,fontWeight:800}}>🏨 Es fin de semana</div>
                      <div style={{fontSize:13,color:"#94A3B8",marginTop:4}}>Descanso semanal completo</div>
                      <div style={{fontSize:12,background:"#1E293B",borderRadius:8,padding:"8px 10px",marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:11,color:"#64748B"}}>Mínimo</div>
                          <div style={{fontSize:18,fontWeight:800,color:"#F59E0B"}}>{esFueraDEsp?"24h":"45h"}</div>
                          <div style={{fontSize:10,color:"#64748B"}}>{esFueraDEsp?"fuera de España":"en España"}</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:11,color:"#64748B"}}>Reinicia</div>
                          <div style={{fontSize:13,fontWeight:700,color:"#22C55E",marginTop:4}}>Contador semanal</div>
                          {esFueraDEsp&&<div style={{fontSize:10,color:"#F97316",marginTop:2}}>⚠️ Compensar después</div>}
                        </div>
                      </div>
                    </button>

                    {/* Opción 3: Descanso fraccionado 3h+9h */}
                    <button onClick={()=>{
                      setDb(p=>({...p,entries:[...p.entries,{id:Date.now()+Math.random(),type:"inicio_descanso_frac",ts:new Date(),note:"Descanso fraccionado — 1ª parte (mín. 3h) · La jornada sigue abierta",location:"",photo:null,late:false}]}));
                      setDescansoModal(false);
                      showToast("🛏 1ª parte fraccionado · mín. 3h · la jornada sigue abierta");
                    }} style={{background:"transparent",color:"#7C3AED",border:"1.5px solid #7C3AED40",borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontSize:14,fontWeight:700}}>🔀 Descanso fraccionado (Art. 8.2)</div>
                      <div style={{fontSize:12,color:"#64748B",marginTop:4,lineHeight:1.5}}>
                        <span style={{color:"#7C3AED",fontWeight:700}}>1ª parte: mín. 3h</span> → dentro de la jornada<br/>
                        Luego conduces → <span style={{color:"#7C3AED",fontWeight:700}}>2ª parte: mín. 9h</span> → cierra jornada
                      </div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:4,background:"#F5F3FF",borderRadius:6,padding:"4px 8px"}}>
                        ⚠️ Las 9h de la 2ª parte = descanso normal completo (no reducido)
                      </div>
                    </button>

                    {/* Opción 4: Solo descanso sin cerrar jornada */}
                    <button onClick={()=>{
                      setDb(p=>({...p,entries:[...p.entries,{id:Date.now()+Math.random(),type:"inicio_descanso",ts:new Date(),note:"Descanso en jornada",location:"",photo:null,late:false}]}));
                      setDescansoModal(false);
                      showToast("🛏 Descanso iniciado");
                    }} style={{background:"transparent",color:"#475569",border:"1.5px solid #334155",borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontSize:14,fontWeight:700}}>⏸ Otro descanso — sin cerrar jornada</div>
                      <div style={{fontSize:12,color:"#475569",marginTop:3}}>Para casos especiales · La jornada sigue abierta</div>
                    </button>

                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal conducción en equipo */}
      {equipoModal&&(
        <div style={s.overlay} onClick={()=>setEquipoModal(false)}>
          <div style={{...s.sheet,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"#1E293B",padding:"16px 20px 12px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#F59E0B"}}>2C — Conducción en equipo</div>
              <button onClick={()=>setEquipoModal(false)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"20px 20px 32px"}}>
              <div style={{fontSize:13,color:"#64748B",marginBottom:16,lineHeight:1.6}}>
                Con otro conductor en el mismo vehículo las reglas de descanso cambian. El que no conduce puede descansar en el camión en movimiento.
              </div>
              <label style={{fontSize:12,color:"#94A3B8",fontWeight:700,marginBottom:6,display:"block"}}>NOMBRE DEL OTRO CONDUCTOR</label>
              <input value={equipoConductor} onChange={e=>setEquipoConductor(e.target.value)}
                placeholder="Nombre del compañero"
                style={{width:"100%",background:"#0F172A",border:"2px solid #334155",borderRadius:10,padding:"12px 14px",fontSize:16,color:"#F1F5F9",outline:"none",marginBottom:16}}/>
              <button onClick={()=>{
                if(!equipoConductor.trim()){return;}
                setEquipoActivo(true);setEquipoModal(false);
                showToast(`2C activado · Compañero: ${equipoConductor}`);
              }} style={{width:"100%",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:12,padding:"15px",fontSize:16,fontWeight:800,cursor:"pointer"}}>
                ✓ ACTIVAR CONDUCCIÓN EN EQUIPO
              </button>
              <div style={{fontSize:11,color:"#64748B",textAlign:"center",marginTop:12,lineHeight:1.5}}>
                Pulsa <strong>1C</strong> en el header para volver a conducción individual
              </div>
            </div>
          </div>
        </div>
      )}

      {countryModal&&(
        <div style={s.overlay} onClick={()=>setCountryModal(false)}>
          <div style={{...s.sheet,maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"#1E293B",padding:"14px 17px 12px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:"#F59E0B"}}>
                  {pendingJornada==="inicio_jornada"?"▶ INICIO DE JORNADA":"■ FIN DE JORNADA"}
                </div>
                <div style={{fontSize:11,color:"#64748B",marginTop:2}}>Confirma donde estas ahora</div>
              </div>
              <button onClick={()=>setCountryModal(false)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 20px"}}>
              {/* Info descanso previo */}
              {pendingJornada==="inicio_jornada"&&(()=>{
                const ultFin=[...allSorted].reverse().find(e=>e.type==="fin_jornada");
                if(!ultFin)return null;
                const horas=diffMin(ultFin.ts,new Date())/60;
                const ok=horas>=9;
                return(
                  <div style={{background:ok?"#F0FDF4":"#FFF7ED",border:`1.5px solid ${ok?"#BBF7D0":"#FED7AA"}`,borderRadius:9,padding:"9px 12px",marginBottom:12}}>
                    <div style={{fontSize:12,fontWeight:700,color:ok?"#166534":"#C2410C"}}>
                      {ok?"✓":"⚠️"} Descanso previo: {Math.floor(horas)}h {Math.round((horas%1)*60)}min
                      {horas>=11?" — Completo":horas>=9?" — Reducido (≥9h)":"  — Insuficiente (min. 9h)"}
                    </div>
                  </div>
                );
              })()}

              {/* 2 opciones grandes */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <button onClick={()=>setProf(p=>({...p,paisBase:"ES",abroadNow:false}))}
                  style={{border:`2px solid ${prof.paisBase==="ES"?"#22C55E":"#E2E8F0"}`,
                    background:prof.paisBase==="ES"?"#F0FDF4":"#F8FAFC",
                    borderRadius:12,padding:"16px 8px",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:6}}>🇪🇸</div>
                  <div style={{fontSize:14,fontWeight:800,color:prof.paisBase==="ES"?"#166534":"#334155"}}>España</div>
                  <div style={{fontSize:10,color:"#94A3B8",marginTop:3}}>Descanso semanal 45h</div>
                  {prof.paisBase==="ES"&&<div style={{fontSize:9,color:"#22C55E",fontWeight:800,marginTop:4}}>● SELECCIONADO</div>}
                </button>
                <button onClick={()=>setProf(p=>({...p,paisBase:p.paisBase==="ES"?"FR":p.paisBase,abroadNow:true}))}
                  style={{border:`2px solid ${prof.paisBase!=="ES"?"#06B6D4":"#E2E8F0"}`,
                    background:prof.paisBase!=="ES"?"#F0F9FF":"#F8FAFC",
                    borderRadius:12,padding:"16px 8px",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:6}}>🌍</div>
                  <div style={{fontSize:14,fontWeight:800,color:prof.paisBase!=="ES"?"#0369A1":"#334155"}}>Otro pais EU</div>
                  <div style={{fontSize:10,color:"#94A3B8",marginTop:3}}>Descanso 24h posible</div>
                  {prof.paisBase!=="ES"&&<div style={{fontSize:9,color:"#06B6D4",fontWeight:800,marginTop:4}}>● SELECCIONADO</div>}
                </button>
              </div>

              {/* Si Otro pais — selector compacto */}
              {prof.paisBase!=="ES"&&(
                <div style={{marginBottom:12}}>
                  <select value={prof.paisBase}
                    onChange={e=>setProf(p=>({...p,paisBase:e.target.value,abroadNow:true}))}
                    style={{width:"100%",background:"#F0F9FF",border:"2px solid #06B6D4",borderRadius:9,padding:"10px 12px",fontSize:14,color:"#0369A1",outline:"none",fontWeight:600}}>
                    {[["FR","Francia"],["PT","Portugal"],["DE","Alemania"],["IT","Italia"],
                      ["BE","Belgica"],["NL","Paises Bajos"],["PL","Polonia"],["RO","Rumania"],
                      ["CZ","Republica Checa"],["AT","Austria"],["CH","Suiza"],["OTHER","Otro pais EU"]
                    ].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              )}

              {/* CCAA si es España */}
              {prof.paisBase==="ES"&&(
                <div style={{marginBottom:12}}>
                  <select value={prof.ccaa||"AN"}
                    onChange={e=>setProf(p=>({...p,ccaa:e.target.value}))}
                    style={{width:"100%",background:"#F0FDF4",border:"2px solid #22C55E",borderRadius:9,padding:"10px 12px",fontSize:14,color:"#166534",outline:"none",fontWeight:600}}>
                    {[["AN","Andalucia"],["AR","Aragon"],["AS","Asturias"],["CN","Canarias"],
                      ["CB","Cantabria"],["CL","Castilla y Leon"],["CM","Castilla-La Mancha"],
                      ["CT","Cataluna"],["EX","Extremadura"],["GA","Galicia"],["IB","Baleares"],
                      ["RI","La Rioja"],["MD","Madrid"],["MC","Murcia"],["NC","Navarra"],
                      ["PV","Pais Vasco"],["VC","Valencia"],["CE","Ceuta"],["ML","Melilla"]
                    ].map(([v,l])=><option key={v} value={v}>{v} - {l}</option>)}
                  </select>
                </div>
              )}

              {/* Botón CONFIRMAR grande y claro */}
              <button onClick={()=>confirmCountry(prof.paisBase)}
                style={{width:"100%",background:"#22C55E",color:"white",border:"none",borderRadius:12,
                  padding:"16px",fontSize:17,fontWeight:800,cursor:"pointer",
                  boxShadow:"0 4px 14px rgba(34,197,94,.4)"}}>
                ✓ {pendingJornada==="inicio_jornada"?"COMENZAR JORNADA":"CERRAR JORNADA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Otros Trabajos — desde botón principal */}
      {modal==="otros"&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"#F97316"+"22",borderBottom:"2px solid #F97316"+"40"}}>
              <span style={{fontSize:26}}>⚒</span>
              <div style={{flex:1}}><div style={{...s.shT,color:"#F97706"}}>OTROS TRABAJOS</div></div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 32px"}}>
              {/* QR de muelle — opcional, discreto pero visible */}
              <button onClick={()=>{setModal(null);setModal("qr_muelle");}}
                style={{width:"100%",background:"#1E293B",border:"1.5px solid #84CC1640",borderRadius:12,padding:"13px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <span style={{fontSize:24}}>📱</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:"#84CC16"}}>Escanear QR de muelle</div>
                  <div style={{fontSize:11,color:"#475569",marginTop:2}}>Registra llegada al muelle y extrae datos del CMR</div>
                </div>
                <span style={{marginLeft:"auto",color:"#334155",fontSize:16}}>›</span>
              </button>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {k:"inicio_carga",         icon:"📦",label:"Carga",           color:"#84CC16"},
                  {k:"inicio_descarga",      icon:"📤",label:"Descarga",        color:"#14B8A6"},
                  {k:"inicio_carga_descarga",icon:"⚒", label:"Carga+Descarga", color:"#8B5CF6"},
                  {k:"inicio_repostaje",     icon:"⛽",label:"Repostaje",       color:"#F59E0B"},
                  {k:"inicio_inspeccion",    icon:"🔧",label:"Inspección",      color:"#64748B"},
                  {k:"inicio_ferry",         icon:"⛴", label:"Ferry / Tren",   color:"#0EA5E9"},
                  {k:"inicio_otros",         icon:"📝", label:"Otros",          color:"#F97316"},
                ].map(({k,icon,label,color})=>(
                  <button key={k} onClick={()=>{setModal(null);openAdd(k);}}
                    style={{background:"#1E293B",color,border:`1.5px solid ${color}30`,borderRadius:12,padding:"16px 8px",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:28,marginBottom:6}}>{icon}</div>
                    <div style={{fontSize:13,fontWeight:700,lineHeight:1.3}}>{label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ferry Art.9 */}
      {modal==="ferry_sel"&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"#0EA5E9"+"22",borderBottom:"2px solid #0EA5E9"+"40"}}>
              <span style={{fontSize:24}}>⛴</span>
              <div style={{flex:1}}><div style={{...s.shT,color:"#0EA5E9"}}>FERRY / TREN — ART. 9</div></div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 32px",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{background:"#F0F9FF",border:"1.5px solid #BAE6FD",borderRadius:10,padding:"10px 12px",fontSize:12,color:"#0369A1",lineHeight:1.6}}>
                <strong>Art. 9 EU 561/2006</strong><br/>
                El ferry interrumpe el descanso <strong>solo si</strong> hay camarote o litera disponible <strong>y</strong> la travesia es de minimo <strong>8 horas</strong>. El tiempo total de descanso (tierra + ferry + tierra) debe llegar a 9h o 11h.
              </div>

              {/* Con camarote */}
              <button onClick={()=>{
                setModal(null);
                registerEventInstant("inicio_ferry",{note:"Ferry con camarote/litera — Art.9 EU 561/2006"});
              }} style={{background:"#F0F9FF",border:"2px solid #0EA5E9",borderRadius:14,padding:"16px",textAlign:"left",cursor:"pointer"}}>
                <div style={{fontSize:15,fontWeight:800,color:"#0369A1"}}>🛏 Con camarote o litera</div>
                <div style={{fontSize:13,color:"#0EA5E9",marginTop:4,lineHeight:1.5}}>
                  Cuenta como descanso interrumpido (Art.9)<br/>
                  <strong>Valido si la travesia es ≥ 8 horas</strong>
                </div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:6}}>Tierra antes + Ferry + Tierra despues = minimo 9h total</div>
              </button>

              {/* Sin camarote */}
              <button onClick={()=>{
                setModal(null);
                registerEventInstant("inicio_ferry",{note:"Ferry sin camarote — cuenta como disponible"});
              }} style={{background:"#F8FAFC",border:"2px solid #CBD5E1",borderRadius:14,padding:"16px",textAlign:"left",cursor:"pointer"}}>
                <div style={{fontSize:15,fontWeight:800,color:"#475569"}}>🚢 Sin camarote / asiento</div>
                <div style={{fontSize:13,color:"#64748B",marginTop:4,lineHeight:1.5}}>
                  Cuenta como <strong>tiempo disponible</strong>, no como descanso.<br/>
                  El contador de conduccion no se resetea.
                </div>
              </button>

              <div style={{fontSize:11,color:"#64748B",textAlign:"center",lineHeight:1.6,padding:"0 8px"}}>
                Recuerda: descanso en tierra antes de embarcar + travesia + descanso al desembarcar = total
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ Modal PARKING CERCANO ════ */}
      {modal==="parking_cercano"&&(()=>{
        const rContMin=norma.rCont||0;
        const radioKm=Math.max(20,Math.min(Math.round(rContMin*80/60),80));
        const[parkList,setParkList]=useState([]);
        const[gpsPos,setGpsPos]=useState(null);
        const[buscando,setBuscando]=useState(true);
        const[error,setError]=useState("");

        useEffect(()=>{
          navigator.geolocation?.getCurrentPosition(async pos=>{
            const{latitude:lat,longitude:lon}=pos.coords;
            setGpsPos({lat,lon});
            try{
              // Query Overpass con radio en grados (~1 grado = 111km)
              const rad=(radioKm/111).toFixed(3);
              const bbox=`${lat-rad},${lon-rad},${+lat+ +rad},${+lon+ +rad}`;
              const q=`[out:json][timeout:15];(node["amenity"="truck_stop"](${bbox});node["highway"="rest_area"](${bbox});node["amenity"="parking"]["hgv"="yes"](${bbox});node["amenity"="parking"]["hgv"="designated"](${bbox}););out 20;`;
              const r=await fetch("https://overpass-api.de/api/interpreter",{
                method:"POST",body:`data=${encodeURIComponent(q)}`,
                headers:{"Content-Type":"application/x-www-form-urlencoded"},
              });
              if(!r.ok)throw new Error("Sin respuesta");
              const d=await r.json();
              const results=(d.elements||[])
                .filter(n=>n.lat&&n.lon)
                .map(n=>{
                  const dKm=Math.round(Math.hypot((n.lat-lat)*111,(n.lon-lon)*111*Math.cos(lat*Math.PI/180)));
                  const servicios=[
                    n.tags?.shower==="yes"?"🚿":"",
                    n.tags?.restaurant==="yes"?"🍽":"",
                    n.tags?.["fuel:diesel"]==="yes"?"⛽":"",
                    n.tags?.toilets==="yes"?"🚻":"",
                  ].filter(Boolean).join(" ");
                  return{
                    id:"osm_"+n.id,lat:n.lat,lon:n.lon,
                    name:n.tags?.name||n.tags?.["name:es"]||"Área de camiones",
                    servicios,distKm:dKm,
                  };
                })
                .sort((a,b)=>a.distKm-b.distKm)
                .slice(0,8);
              setParkList(results);
            }catch(e){
              setError("No se pudo conectar. Comprueba tu conexión.");
            }finally{setBuscando(false);}
          },()=>{setError("GPS no disponible");setBuscando(false);},{timeout:8000,maximumAge:60000});
        },[]);

        function abrirMaps(p){
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`,"_blank","noopener");
        }

        return(
          <div style={{...s.overlay,zIndex:1100}} onClick={()=>setModal(null)}>
            <div style={{...s.sheet,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{background:"#F59E0B",padding:"16px 18px",borderRadius:"16px 16px 0 0",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:26}}>🅿</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>PARKINGS CERCANOS</div>
                  <div style={{fontSize:12,color:"#78350F",marginTop:1}}>Radio ~{radioKm} km · {fmtDur(rContMin)} conducción restante</div>
                </div>
                <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
              </div>
              <div style={{padding:"16px 18px 32px"}}>
                {buscando&&(
                  <div style={{textAlign:"center",padding:40}}>
                    <div style={{fontSize:36,marginBottom:12}}>🔍</div>
                    <div style={{fontSize:15,fontWeight:700,color:"#334155",marginBottom:6}}>Buscando parkings reales...</div>
                    <div style={{fontSize:13,color:"#64748B"}}>Consultando OpenStreetMap en {radioKm} km</div>
                  </div>
                )}
                {!buscando&&error&&(
                  <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:16,textAlign:"center"}}>
                    <div style={{fontSize:32,marginBottom:8}}>📡</div>
                    <div style={{fontSize:14,color:"#DC2626",fontWeight:600}}>{error}</div>
                  </div>
                )}
                {!buscando&&!error&&parkList.length===0&&(
                  <div style={{textAlign:"center",padding:24}}>
                    <div style={{fontSize:36,marginBottom:10}}>🅿</div>
                    <div style={{fontSize:15,fontWeight:700,color:"#334155",marginBottom:6}}>Sin parkings de camiones en {radioKm} km</div>
                    <div style={{fontSize:13,color:"#64748B",lineHeight:1.6}}>No hay áreas de descanso para camiones registradas en OpenStreetMap en esta zona</div>
                  </div>
                )}
                {!buscando&&parkList.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{fontSize:12,color:"#64748B",marginBottom:4}}>
                      {parkList.length} parking{parkList.length>1?"s":""} encontrado{parkList.length>1?"s":""} · Datos de OpenStreetMap
                    </div>
                    {parkList.map((p,i)=>(
                      <div key={i} style={{background:"#F8FAFC",borderRadius:12,padding:"14px",border:"1px solid #E2E8F0",display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:36,height:36,background:p.distKm<=20?"#DCFCE7":p.distKm<=50?"#FEF3C7":"#F1F5F9",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🅿</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                          <div style={{fontSize:13,fontWeight:700,color:p.distKm<=20?"#22C55E":p.distKm<=50?"#F59E0B":"#94A3B8",marginTop:2}}>{p.distKm} km</div>
                          {p.servicios&&<div style={{fontSize:13,marginTop:2}}>{p.servicios}</div>}
                        </div>
                        <button onClick={()=>abrirMaps(p)}
                          style={{background:"#1E293B",color:"white",border:"none",borderRadius:9,padding:"10px 14px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                          🗺 Ir
                        </button>
                      </div>
                    ))}
                    <div style={{fontSize:11,color:"#94A3B8",textAlign:"center",marginTop:4}}>
                      Pulsa "Ir" para abrir Google Maps con navegación
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════ Modal INSPECCIÓN POLICIAL ════ */}
      {modal==="inspeccion"&&(()=>{
        // Análisis de la jornada para el agente
        const cont=norma.cont||0;
        const hoy=norma.todayDrive||0;
        const semana=norma.weekDrive||0;
        const rCont=norma.rCont||0;
        const maxDay=norma.maxDay||540;
        const sp=norma.sp||0;

        // ¿Hay infracciones?
        const infracciones=[];
        if(cont>270) infracciones.push(`Conducción continua: ${fmtDur(cont)} (máx. 4h30)`);
        if(hoy>maxDay) infracciones.push(`Jornada diaria: ${fmtDur(hoy)} (máx. ${fmtDur(maxDay)})`);
        if(semana>LIM.WEEK) infracciones.push(`Semana: ${fmtDur(semana)} (máx. 56h)`);

        // Lo que SÍ puede decir tranquilo
        const ok=[];
        if(cont<=270) ok.push(`Conducción continua: ${fmtDur(cont)} — dentro del límite de 4h30`);
        if(hoy<=maxDay) ok.push(`Jornada hoy: ${fmtDur(hoy)} — dentro del límite de ${fmtDur(maxDay)}`);
        if(semana<=LIM.WEEK) ok.push(`Semana actual: ${fmtDur(semana)} — dentro de las 56h`);
        if(sp===1) ok.push("Pausa fraccionada en curso: 1ª parte (15 min) realizada — continuando correctamente");

        return(
          <div style={{...s.overlay,zIndex:1100}} onClick={()=>setModal(null)}>
            <div style={{...s.sheet,maxHeight:"92vh",overflowY:"auto",background:"#0F172A"}} onClick={e=>e.stopPropagation()}>
              {/* Cabecera */}
              <div style={{background:"#EF4444",padding:"16px 18px",borderRadius:"16px 16px 0 0",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:28}}>🚔</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:800,color:"white",letterSpacing:.3}}>INSPECCIÓN EN CURSO</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:2}}>Mantén la calma · Lee antes de hablar</div>
                </div>
                <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
              </div>

              <div style={{padding:"16px 18px 32px",display:"flex",flexDirection:"column",gap:14}}>

                {/* LO QUE TIENES QUE ENSEÑAR */}
                <div style={{background:"#1E293B",borderRadius:12,padding:"14px 16px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#94A3B8",letterSpacing:1,marginBottom:10}}>📋 LO QUE TIENES QUE ENSEÑAR</div>
                  {[
                    "Tarjeta de conductor (tacógrafo)",
                    "Permiso de conducir",
                    "Documentación del vehículo (permiso circulación, ITV, seguro)",
                    "CMR o carta de porte de la carga actual",
                    "Registros del tacógrafo (los pide el agente directamente)",
                  ].map((item,i)=>(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:7}}>
                      <span style={{color:"#22C55E",fontWeight:800,fontSize:14,flexShrink:0}}>✓</span>
                      <span style={{fontSize:14,color:"#CBD5E1",lineHeight:1.4}}>{item}</span>
                    </div>
                  ))}
                </div>

                {/* LO QUE PUEDES DECIR */}
                <div style={{background:"#052e16",border:"1px solid #166534",borderRadius:12,padding:"14px 16px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#22C55E",letterSpacing:1,marginBottom:10}}>🟢 PUEDES DECIR CON SEGURIDAD</div>
                  {ok.length>0?ok.map((item,i)=>(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:7}}>
                      <span style={{color:"#22C55E",fontSize:12,flexShrink:0,marginTop:2}}>▸</span>
                      <span style={{fontSize:14,color:"#86EFAC",lineHeight:1.4}}>{item}</span>
                    </div>
                  )):(
                    <span style={{fontSize:13,color:"#86EFAC"}}>El tacógrafo habla por sí solo — deja que lo revise.</span>
                  )}
                </div>

                {/* CUIDADO */}
                {infracciones.length>0&&(
                  <div style={{background:"#451a03",border:"1px solid #c2410c",borderRadius:12,padding:"14px 16px"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#F97316",letterSpacing:1,marginBottom:10}}>🟠 ATENCIÓN — POSIBLES IRREGULARIDADES</div>
                    {infracciones.map((item,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:7}}>
                        <span style={{color:"#F97316",fontSize:12,flexShrink:0,marginTop:2}}>▸</span>
                        <span style={{fontSize:14,color:"#FDBA74",lineHeight:1.4}}>{item}</span>
                      </div>
                    ))}
                    <div style={{marginTop:10,fontSize:12,color:"#F97316",borderTop:"1px solid rgba(249,115,22,.2)",paddingTop:10}}>
                      No expliques ni justifiques. Si preguntan, di: <strong style={{color:"#FED7AA"}}>"Está todo registrado en el tacógrafo, pueden comprobarlo."</strong>
                    </div>
                  </div>
                )}

                {/* LO QUE NO DEBES DECIR */}
                <div style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:12,padding:"14px 16px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#EF4444",letterSpacing:1,marginBottom:10}}>🔴 NO DIGAS ESTO — AUNQUE TE PREGUNTEN</div>
                  {[
                    {txt:"Cuántas horas llevas conduciendo de memoria — siempre remite al tacógrafo",sub:"El tacógrafo es la prueba oficial, tu memoria no"},
                    {txt:"Que llevas prisa o que tienes que llegar antes de una hora",sub:"Admitir presión temporal puede usarse en tu contra"},
                    {txt:"Que el jefe te dijo que no pararas",sub:"Responsabilidad penal puede recaer en ti igual"},
                    {txt:"Que la aplicación no te avisó o que el tacógrafo falló",sub:"Justificar así sin partes técnicos oficiales empeora la situación"},
                    {txt:"Explicar voluntariamente más de lo que preguntan",sub:"Solo responde lo que te preguntan, nada más"},
                  ].map(({txt,sub},i)=>(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
                      <span style={{color:"#EF4444",fontSize:14,flexShrink:0,marginTop:1}}>✗</span>
                      <div>
                        <div style={{fontSize:14,color:"#FCA5A5",fontWeight:600,lineHeight:1.3}}>{txt}</div>
                        <div style={{fontSize:12,color:"#6B2121",marginTop:2,lineHeight:1.3}}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CONSEJO FINAL */}
                <div style={{background:"#1E293B",borderRadius:12,padding:"14px 16px",border:"1px solid #334155"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#94A3B8",letterSpacing:1,marginBottom:8}}>💡 ACTITUD</div>
                  <div style={{fontSize:14,color:"#CBD5E1",lineHeight:1.7}}>
                    Mantén la calma. Sé educado y colabora.<br/>
                    <strong style={{color:"#F1F5F9"}}>No firmes nada sin leerlo.</strong> Si hay multa, puedes firmar <em>en desacuerdo</em> — eso no la paga ni la admite.<br/>
                    Tienes derecho a solicitar copia del boletín de denuncia.
                  </div>
                </div>

                <button onClick={()=>{setModal(null);setTmplId("policia");setDocsTab("documentos");setTab("docs");}}
                  style={{background:"#1E293B",border:"1px solid #334155",borderRadius:12,padding:"13px",
                    fontSize:14,color:"#CBD5E1",fontWeight:600,cursor:"pointer",textAlign:"center"}}>
                  📄 Abrir parte de control policial →
                </button>

              </div>
            </div>
          </div>
        );
      })()}

      {modal==="qr_muelle"&&<QrMuelleModal onClose={(abrirAccion)=>{setModal(null);if(abrirAccion)setTimeout(()=>openAdd("__accion__"),200);}} onCarga={(tipo,datos)=>{setModal(null);openAdd(tipo,datos);}} setDb={setDb} showToast={showToast}/>}

      {/* ════ MODAL DESTINO (servicio operacional) ════ */}
      {modalViaje&&<ModalDestino prefillDestino={viajePrefill?.destino||""} prefillOrigen={viajePrefill?.origen||""} prefillWaypoint={viajePrefill?.waypoint||""} prefillVelocidad={viajePrefill?.velocidad||80} prefillGpsOrigen={viajePrefill?.gpsOrigen||null} norma={norma} showToast={showToast} onClose={()=>{setModalViaje(false);setViajePrefill(null);}} onSave={async v=>{
        const pref=viajePrefillRef.current;
        const sid=pref?.servicioId;
        if(sid&&getUserId()){
          const patch={};
          if(v.origen?.trim()&&v.origen.trim()!==String(pref?.origenActual||"").trim())patch.origen=v.origen.trim();
          if(v.destino?.trim()&&v.destino.trim()!==String(pref?.destinoActual||"").trim())patch.destino=v.destino.trim();
          if(v.operationalPlan){
            const etaPrevista=buildEtaPrevistaFromRoutePlan(v.operationalPlan);
            patch.referencia=mergeReferenciaOperacional(pref?.referenciaActual||null,{
              operational_plan:v.operationalPlan,
              operational_eta:null,
              operational_plan_confirmed_at:new Date().toISOString(),
              ...(etaPrevista?{eta_prevista:etaPrevista}:{}),
            });
          }
          if(Object.keys(patch).length){
            const res=await sbFetch(`/rest/v1/servicios?id=eq.${sid}`,{method:"PATCH",body:JSON.stringify(patch)});
            if(!res.ok){
              let msg="";
              try{
                const data=await res.json();
                msg=data?.message||data?.error||"";
              }catch(_){/* noop */}
              throw new Error(msg||`Supabase ${res.status}`);
            }
          }
          window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
        }
        setViajeActivo(v);
        localStorage.setItem("viaje_activo",JSON.stringify(v));
        showToast(sid?"✅ Ruta guardada · planificación operacional lista":"✅ Destino guardado");
        setTimeout(()=>speakNatural("Ruta guardada. Planificación operacional lista."),500);
      }}/>}

      {/* ════ MODAL DATOS ACTUALES ════ */}
      {modal==="datos_actuales"&&<DatosActualesModal onClose={()=>setModal(null)} setDb={setDb} setManualOffset={v=>{setManualOffset(v);localStorage.setItem("manual_offset",JSON.stringify(v));}} showToast={showToast}/>}

      {/* Modal ACCIÓN — normativa inmediata */}
      {modal==="accion_modal"&&(()=>{
        const isDrivingM = active?.type === "inicio_conduccion";
        const isPausingM =
          active &&
          ["inicio_pausa", "inicio_descanso", "inicio_descanso_frac", "inicio_descanso_semanal", "inicio_descanso_semanal_r"].includes(active.type);
        const rContM = norma.rCont ?? norma.canDrive ?? 0;
        let accionHint = "Indica qué vas a hacer ahora: conducir, pausa o descanso.";
        if (jState === "open" && isDrivingM && rContM > 0) accionHint = `Sigues conduciendo: te quedan hasta ${fmtDur(rContM)} antes de pausa obligatoria.`;
        else if (jState === "open" && !active && norma.canDrive > 0 && norma.canDrive <= 60) accionHint = `Próxima obligación en ${fmtDur(norma.canDrive)} — conviene pausa o descanso.`;
        else if (jState === "open" && !active && norma.canDrive <= 0) accionHint = "Límite de conducción alcanzado: registra pausa o descanso antes de volver a conducir.";
        else if (jState === "open" && isPausingM) accionHint = "Cuando termines pausa o descanso, ciérralo en la pantalla principal antes de conducir.";
        return (
          <div style={s.overlay} onClick={() => setModal(null)}>
            <div style={{ ...s.sheet, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ ...s.shHd, background: "#F59E0B22", borderBottom: "2px solid #F59E0B40" }}>
                <span style={{ fontSize: 24 }}>⚡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ ...s.shT, color: "#F59E0B" }}>SIGUIENTE ACCIÓN</div>
                  <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600, marginTop: 4, lineHeight: 1.35 }}>Conducción, pausa o descanso</div>
                </div>
                <button type="button" onClick={() => setModal(null)} style={s.xBtn}>
                  ✕
                </button>
              </div>
              <div style={{ padding: "14px 16px max(20px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "#78350f", lineHeight: 1.45, fontWeight: 600 }}>{accionHint}</div>
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    openAdd("inicio_conduccion");
                  }}
                  style={{ background: "#FFF7ED", border: "2px solid #F59E0B", borderRadius: 14, padding: "14px 14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, minHeight: 52 }}
                >
                  <span style={{ fontSize: 28 }}>⊙</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#92400E" }}>Conducir</div>
                    <div style={{ fontSize: 12, color: "#D97706", marginTop: 2 }}>Iniciar conducción</div>
                  </div>
                </button>
                <button type="button" onClick={() => setModal("pausa_sel")} style={{ background: "#EEF2FF", border: "2px solid #6366F1", borderRadius: 14, padding: "14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, minHeight: 52 }}>
                  <span style={{ fontSize: 26 }}>⏸</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#4338CA" }}>Pausa</div>
                    <div style={{ fontSize: 12, color: "#6366F1", marginTop: 2 }}>15 · 30 · 45 min · 3 h</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    openAdd("inicio_descanso");
                  }}
                  style={{ background: "#F5F3FF", border: "2px solid #7C3AED", borderRadius: 14, padding: "14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, minHeight: 52 }}
                >
                  <span style={{ fontSize: 26 }}>🛌</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#5B21B6" }}>Descanso</div>
                    <div style={{ fontSize: 12, color: "#7C3AED", marginTop: 2 }}>9 h reducido · 11 h completo</div>
                  </div>
                </button>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      openAdd("inicio_disponibilidad");
                    }}
                    style={{ flex: "1 1 140px", minHeight: 44, background: "#ECFEFF", border: "1px solid #06B6D4", borderRadius: 12, padding: "10px 8px", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#0E7490" }}
                  >
                    Disponible
                  </button>
                  <button type="button" onClick={() => setModal("ferry_sel")} style={{ flex: "1 1 140px", minHeight: 44, background: "#F0F9FF", border: "1px solid #0EA5E9", borderRadius: 12, padding: "10px 8px", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#0369A1" }}>
                    Ferry / tren
                  </button>
                </div>
                <button type="button" onClick={() => setModal("otros")} style={{ background: "transparent", border: "1px dashed #cbd5e1", borderRadius: 12, padding: "12px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#64748b", marginTop: 2 }}>
                  Más: carga, QR muelle, repostaje…
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal PARAR — tras detener conducción */}
      {modal==="parar_modal"&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"#6366F122",borderBottom:"2px solid #6366F140"}}>
              <span style={{fontSize:24}}>⏹</span>
              <div style={{flex:1}}><div style={{...s.shT,color:"#6366F1"}}>PARAR — ¿Y AHORA QUÉ?</div></div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 32px",display:"flex",flexDirection:"column",gap:10}}>
              {(()=>{
                const registrarFinYAbrir=(tipo)=>{
                  setModal(null);
                  setTimeout(()=>openAdd(tipo),80);
                };
                return(<>
                  <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:1}}>PAUSA</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[
                      {dur:"15 minutos",sub:"1ª parte fraccionada",disabled:norma.sp===1},
                      {dur:"30 minutos",sub:norma.sp===1?"2ª parte ✓ RECOMENDADO":"2ª parte fraccionada",highlight:norma.sp===1},
                      {dur:"45 minutos",sub:"Pausa completa de golpe"},
                      {dur:"3 horas",sub:"Descanso largo Art. 8.6"},
                    ].map(({dur,sub,disabled,highlight})=>(
                      <button key={dur} onClick={()=>!disabled&&registrarFinYAbrir("inicio_pausa")}
                        disabled={disabled}
                        style={{background:highlight?"#F0FDF4":disabled?"#F1F5F9":"#EEF2FF",
                          border:`2px solid ${highlight?"#22C55E":disabled?"#CBD5E1":"#818CF8"}`,
                          borderRadius:12,padding:"14px 10px",textAlign:"center",
                          cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,
                          boxShadow:highlight?"0 0 0 3px #22C55E30":"none"}}>
                        <div style={{fontSize:14,fontWeight:800,color:highlight?"#166534":disabled?"#94A3B8":"#4338CA"}}>{dur}</div>
                        <div style={{fontSize:11,color:highlight?"#16A34A":disabled?"#94A3B8":"#6366F1",marginTop:3,lineHeight:1.3}}>{sub}</div>
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:1,marginTop:4}}>DESCANSO</div>
                  <button onClick={()=>registrarFinYAbrir("inicio_descanso")}
                    style={{background:"#F5F3FF",border:"2px solid #7C3AED",borderRadius:12,padding:"14px 16px",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:24}}>🛌</span>
                    <div>
                      <div style={{fontSize:15,fontWeight:800,color:"#5B21B6"}}>Descanso diario</div>
                      <div style={{fontSize:12,color:"#7C3AED",marginTop:2}}>9h reducido · 11h completo · Cierra jornada</div>
                    </div>
                  </button>
                  <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:1,marginTop:4}}>DISPONIBLE</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button onClick={()=>registrarFinYAbrir("inicio_disponibilidad")}
                      style={{background:"#ECFEFF",border:"2px solid #06B6D4",borderRadius:12,padding:"12px",textAlign:"center",cursor:"pointer"}}>
                      <div style={{fontSize:20,marginBottom:4}}>▨</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#0E7490"}}>Disponible</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Espera, frontera...</div>
                    </button>
                    <button onClick={()=>{
                      const paisInfo=prof.abroadNow?prof.paisBase||"EU":`ES-${prof.ccaa||""}`;
                      const ne={id:Date.now()+Math.random(),type:"fin_conduccion",ts:new Date(),note:"",location:"",photo:null,late:false,pais:paisInfo};
                      setDb(p=>({...p,entries:[...p.entries,ne]}));
                      if(getUserId()) sbUpsert("entries",[{id:ne.id,user_id:getUserId(),type:"fin_conduccion",ts:(ne.ts instanceof Date?(toDate(ne.ts).toISOString()):ne.ts),note:"",location:"",photo:null,late:false,pais:paisInfo}]).catch(()=>{});
                      setTimeout(()=>setModal("ferry_sel"),80);
                    }}
                      style={{background:"#F0F9FF",border:"2px solid #0EA5E9",borderRadius:12,padding:"12px",textAlign:"center",cursor:"pointer"}}>
                      <div style={{fontSize:20,marginBottom:4}}>⛴</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#0369A1"}}>Ferry / Tren</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Art. 9 EU 561</div>
                    </button>
                  </div>
                  <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:1,marginTop:4}}>OTROS TRABAJOS</div>
                  <button onClick={()=>{
                      const paisInfo=prof.abroadNow?prof.paisBase||"EU":`ES-${prof.ccaa||""}`;
                      const ne={id:Date.now()+Math.random(),type:"fin_conduccion",ts:new Date(),note:"",location:"",photo:null,late:false,pais:paisInfo};
                      setDb(p=>({...p,entries:[...p.entries,ne]}));
                      if(getUserId()) sbUpsert("entries",[{id:ne.id,user_id:getUserId(),type:"fin_conduccion",ts:(ne.ts instanceof Date?(toDate(ne.ts).toISOString()):ne.ts),note:"",location:"",photo:null,late:false,pais:paisInfo}]).catch(()=>{});
                      setTimeout(()=>setModal("otros"),80);
                    }}
                    style={{background:"#FFF7ED",border:"2px solid #F97316",borderRadius:12,padding:"12px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:20}}>⚒</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#C2410C"}}>Otros trabajos</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>Carga, descarga, repostaje...</div>
                    </div>
                  </button>
                </>);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal selector de pausa */}
      {modal==="pausa_sel"&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"#6366F122",borderBottom:"2px solid #6366F140"}}>
              <span style={{fontSize:24}}>⏸</span>
              <div style={{flex:1}}><div style={{...s.shT,color:"#6366F1"}}>TIPO DE PAUSA</div></div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 32px",display:"flex",flexDirection:"column",gap:10}}>
              {(()=>{
                const finYEmpezar=(tipo)=>{
                  setModal(null);
                  // Registrar fin_conduccion silenciosamente si viene de Detener
                  if(active?.type==="inicio_conduccion"){
                    const paisInfo=prof.abroadNow?prof.paisBase||"EU":`ES-${prof.ccaa||""}`;
                    const ne={id:Date.now()+Math.random(),type:"fin_conduccion",ts:new Date(),note:"",location:"",photo:null,late:false,pais:paisInfo};
                    setDb(p=>({...p,entries:[...p.entries,ne]}));
                    if(getUserId()) sbUpsert("entries",[{id:ne.id,user_id:getUserId(),type:"fin_conduccion",ts:(ne.ts instanceof Date?(toDate(ne.ts).toISOString()):ne.ts),note:"",location:"",photo:null,late:false,pais:paisInfo}]).catch(()=>{});
                  }
                  // Luego abrir inicio_pausa
                  setTimeout(()=>openAdd(tipo),80);
                };
                return(<>
                  <button onClick={()=>finYEmpezar("inicio_pausa")}
                    disabled={norma.sp===1}
                    style={{background:norma.sp===1?"#F1F5F9":"#EEF2FF",border:`2px solid ${norma.sp===1?"#CBD5E1":"#818CF8"}`,borderRadius:12,padding:"16px",textAlign:"left",cursor:norma.sp===1?"not-allowed":"pointer",opacity:norma.sp===1?0.4:1}}>
                    <div style={{fontSize:16,fontWeight:800,color:norma.sp===1?"#94A3B8":"#4338CA"}}>⏸ 15 minutos</div>
                    <div style={{fontSize:12,color:norma.sp===1?"#94A3B8":"#6366F1",marginTop:2}}>Primera parte de la pausa fraccionada</div>
                  </button>
                  <button onClick={()=>finYEmpezar("inicio_pausa")}
                    style={{background:norma.sp===1?"#F0FDF4":"#EEF2FF",border:`2px solid ${norma.sp===1?"#22C55E":"#6366F1"}`,borderRadius:12,padding:"16px",textAlign:"left",cursor:"pointer",boxShadow:norma.sp===1?"0 0 0 3px #22C55E30":"none"}}>
                    <div style={{fontSize:16,fontWeight:800,color:norma.sp===1?"#166534":"#4338CA"}}>☕ 30 minutos{norma.sp===1?" ✓ RECOMENDADO":""}</div>
                    <div style={{fontSize:12,color:norma.sp===1?"#16A34A":"#6366F1",marginTop:2}}>Segunda parte de la pausa fraccionada</div>
                  </button>
                  <button onClick={()=>finYEmpezar("inicio_pausa")}
                    style={{background:"#EEF2FF",border:"2px solid #6366F1",borderRadius:12,padding:"16px",textAlign:"left",cursor:"pointer"}}>
                    <div style={{fontSize:16,fontWeight:800,color:"#4338CA"}}>☕ 45 minutos</div>
                    <div style={{fontSize:12,color:"#6366F1",marginTop:2}}>Pausa completa de una sola vez</div>
                  </button>
                  <button onClick={()=>finYEmpezar("inicio_pausa")}
                    style={{background:"#F5F3FF",border:"2px solid #7C3AED",borderRadius:12,padding:"16px",textAlign:"left",cursor:"pointer"}}>
                    <div style={{fontSize:16,fontWeight:800,color:"#5B21B6"}}>🛌 3 horas o más</div>
                    <div style={{fontSize:12,color:"#7C3AED",marginTop:2}}>Descanso largo — Art. 8.6</div>
                  </button>
                </>);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal entrada adicional */}
      {modal==="entrada"&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"#7C3AED"+"22",borderBottom:"2px solid #7C3AED"+"40"}}>
              <span style={{fontSize:24}}>➕</span>
              <div style={{flex:1}}>
                <div style={{...s.shT,color:"#7C3AED"}}>ENTRADA ADICIONAL</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Registrar actividad que pasó antes</div>
              </div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 32px"}}>
              <div style={{background:"#F5F3FF",border:"1.5px solid #DDD6FE",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#5B21B6",lineHeight:1.6}}>
                💡 Usa esto para registrar una actividad que ocurrió antes y no pudiste registrar en ese momento (desplazamiento en coche, espera en cliente, etc.)
              </div>
              <div style={{fontSize:11,fontWeight:800,color:"#64748B",marginBottom:10}}>¿QUÉ ACTIVIDAD FUE?</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                {[
                  {k:"inicio_disponibilidad",icon:"▨", label:"Disponible",        sub:"Espera, coche, pasajero",color:"#06B6D4"},
                  {k:"inicio_pausa",         icon:"🛌",label:"Pausa",             sub:"Descanso obligatorio",   color:"#6366F1"},
                  {k:"inicio_descanso",      icon:"🛌",label:"Descanso",          sub:"Descanso diario",        color:"#7C3AED"},
                  {k:"inicio_carga",         icon:"📦",label:"Carga",             sub:"En almacén/cliente",     color:"#84CC16"},
                  {k:"inicio_descarga",      icon:"📤",label:"Descarga",          sub:"En almacén/cliente",     color:"#14B8A6"},
                  {k:"inicio_otros",         icon:"⚒", label:"Otros trabajos",   sub:"Papeleo, mecánica...",   color:"#F97316"},
                ].map(({k,icon,label,sub,color})=>(
                  <button key={k} onClick={()=>{
                    setModal(null);
                    setEditId(null);
                    setEvType(k);
                    setEvNote("");setEvLoc("");setEvPhoto(null);
                    // tMode ya está en "offset" con tOff=60
                    setModal("event");
                  }}
                    style={{background:"#1E293B",color,border:`1.5px solid ${color}30`,borderRadius:12,padding:"14px 8px",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:26,marginBottom:5}}>{icon}</div>
                    <div style={{fontSize:13,fontWeight:700,color,lineHeight:1.2}}>{label}</div>
                    <div style={{fontSize:10,color:"#64748B",marginTop:3,lineHeight:1.3}}>{sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Más actividades" */}
      {modal==="more"&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"#1E293B",borderBottom:"1px solid #334155",position:"sticky",top:0}}>
              <div style={{flex:1}}><div style={{...s.shT,color:"#F1F5F9"}}>¿Qué vas a hacer?</div></div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"14px 16px 32px"}}>
              {GROUPS.filter(g=>g.label!=="JORNADA"&&g.label!=="ANOTACIONES").map(g=>(
                <div key={g.label} style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:g.color,fontWeight:800,letterSpacing:.5,marginBottom:8}}>{g.label}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {g.btns.filter(k=>EV[k]?.kind!=="close"&&isAvail(k,active,jState)).map(k=>{
                      const v=EV[k];if(!v)return null;
                      return(
                        <button key={k} onClick={()=>{setModal(null);openAdd(k);}}
                          style={{background:"#1E293B",color:v.color,border:`1.5px solid ${v.color}30`,borderRadius:10,padding:"12px 6px",cursor:"pointer",textAlign:"center"}}>
                          <div style={{fontSize:22,marginBottom:4}}>{v.icon}</div>
                          <div style={{fontSize:11,fontWeight:700,lineHeight:1.2,color:v.color}}>{evLabel(k,prof.lang||"es")}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Fin jornada y art12 */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
                {["fin_jornada","art12"].filter(k=>isAvail(k,active,jState)).map(k=>{
                  const v=EV[k];if(!v)return null;
                  return(
                    <button key={k} onClick={()=>{setModal(null);openAdd(k);}}
                      style={{background:"#1E293B",color:v.color,border:`1.5px solid ${v.color}30`,borderRadius:10,padding:"12px 6px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:22,marginBottom:4}}>{v.icon}</div>
                      <div style={{fontSize:11,fontWeight:700,color:v.color}}>{evLabel(k,prof.lang||"es")}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="event"&&evType&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={s.sheet} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:EV[evType]?.color+"14",borderBottom:`2px solid ${EV[evType]?.color}30`}}>
              <span style={{fontSize:26}}>{EV[evType]?.icon}</span>
              <div style={{flex:1}}>
                <div style={{...s.shT,color:EV[evType]?.color}}>{editId?"✏️ ":""}{EV[evType]?.label.toUpperCase()}</div>
                <div style={s.shS}>{fmtFull(prevTs)}{isLate&&<span style={{color:"#F97316",marginLeft:6}}> ⚠ tarde</span>}</div>
              </div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={s.shBody}>
              {isLate&&<div style={{background:"#FFF7ED",border:"1.5px solid #FED7AA",borderRadius:8,padding:"8px 11px",fontSize:11,color:"#C2410C",marginBottom:13,lineHeight:1.5}}>⚠️ Marcado como <strong>registrado tarde</strong>. Queda anotado para inspecciones.</div>}

              {/* Hora — solo cuando se edita o cuando el usuario lo pide */}
              {(editId||tMode!=="now")?(<div style={{background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:12,padding:"11px 13px",marginBottom:13}}>
                <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:9}}>⏰ HORA DEL EVENTO</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:9}}>
                  {[{id:"now",label:"Ahora"},{id:"offset",label:"Hace un rato"},{id:"exact",label:"Hora exacta"}].map(m=>(
                    <button key={m.id} onClick={()=>{setTMode(m.id);if(m.id==="exact")setTExact(toDTL(new Date()));}} style={{borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,border:"2px solid",cursor:"pointer",background:tMode===m.id?"#1E293B":"#F8FAFC",color:tMode===m.id?"#F59E0B":"#64748B",borderColor:tMode===m.id?"#334155":"#E2E8F0"}}>{m.label}</button>
                  ))}
                </div>
                {tMode==="now"&&<div style={{background:"#F0FDF4",borderRadius:9,padding:"9px 13px",border:"1.5px solid #BBF7D0",display:"flex",alignItems:"center",gap:9}}><span style={{fontSize:20,fontWeight:800,fontFamily:"monospace",color:"#16A34A"}}>{fmtT(clock)}</span><span style={{fontSize:11,color:"#16A34A",fontWeight:700}}>AHORA</span></div>}
                {tMode==="offset"&&<div><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{[{l:"15 min",v:15},{l:"30 min",v:30},{l:"1 hora",v:60},{l:"2 horas",v:120},{l:"3 horas",v:180},{l:"4 horas",v:240}].map(({l,v})=><button key={v} onClick={()=>setTOff(v)} style={{border:"2px solid",borderRadius:8,padding:"7px 11px",fontSize:12,fontWeight:700,cursor:"pointer",background:tOff===v?"#FFF7ED":"#F8FAFC",color:tOff===v?"#F97316":"#64748B",borderColor:tOff===v?"#FED7AA":"#E2E8F0"}}>hace {l}</button>)}</div>{tOff>0&&<div style={{marginTop:7,fontSize:12,color:"#64748B"}}>→ <strong style={{color:"#F97316"}}>{fmtT(new Date(+clock-tOff*60000))}</strong></div>}</div>}
                {tMode==="exact"&&<input type="datetime-local" value={tExact} onChange={e=>setTExact(e.target.value)} max={toDTL(new Date())} style={s.tIn}/>}
              </div>):(
                <button onClick={()=>setTMode("offset")}
                  style={{width:"100%",background:"#F8FAFC",border:"1.5px dashed #CBD5E1",borderRadius:10,padding:"9px",fontSize:12,color:"#64748B",fontWeight:600,cursor:"pointer",marginBottom:13,textAlign:"center"}}>
                  ⏰ ¿Pasó antes? Ajustar hora
                </button>
              )}
              <label style={s.fLbl}>📍 Ubicación</label>
              <div style={{display:"flex",gap:7,marginBottom:2}}>
                <input type="text" value={evLoc} onChange={e=>setEvLoc(e.target.value)}
                  placeholder={gpsLoading?"Obteniendo ubicación GPS...":"Escribe el lugar o usa el GPS ↓"}
                  style={{...s.tIn,flex:1,borderColor:gpsLoading?"#F59E0B":evLoc?"#22C55E":undefined,marginBottom:0}}/>
                <button onClick={()=>{
                  if(!navigator.geolocation){showToast("GPS no disponible");return;}
                  setGpsLoading(true);setEvLoc("");
                  navigator.geolocation.getCurrentPosition(
                    async pos=>{
                      const{latitude:lat,longitude:lon}=pos.coords;
                      let loc=`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                      try{const r=await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
                        if(r.ok){const d=await r.json();const p=d.features?.[0]?.properties;
                          const city=p?.city||p?.town||p?.village||p?.name||"";
                          const road=p?.street||p?.road||"";
                          loc=city+(road?`, ${road}`:"")||loc;
                        }
                      }catch(_){}
                      setEvLoc(loc);setGpsLoading(false);
                    },
                    ()=>{showToast("No se pudo obtener ubicación");setGpsLoading(false);},
                    {enableHighAccuracy:true,timeout:10000,maximumAge:0}
                  );
                }}
                style={{background:gpsLoading?"#FEF3C7":evLoc?"#F0FDF4":"#1E293B",color:gpsLoading?"#92400E":evLoc?"#166534":"white",border:"none",borderRadius:10,padding:"0 14px",fontSize:20,cursor:"pointer",flexShrink:0,minWidth:48}}>
                  {gpsLoading?"⏳":"📍"}
                </button>
              </div>
              {evLoc&&<div style={{fontSize:11,color:"#22C55E",marginBottom:8,marginTop:3}}>✓ {evLoc}</div>}
              {!evLoc&&!gpsLoading&&<div style={{fontSize:11,color:"#94A3B8",marginBottom:8,marginTop:3}}>Pulsa 📍 para detectar tu posición automáticamente</div>}
              <label style={{...s.fLbl,marginTop:11}}>
                📝 {evType==="art12"?"Motivo obligatorio (Art.12)":"Nota (opcional)"}
                {evType==="art12"&&<span style={{color:evNote.trim().length>=20?"#22C55E":"#EF4444",marginLeft:7,fontWeight:700}}>{evNote.trim().length}/20 mín.</span>}
              </label>
              {evType==="art12"&&<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:8,padding:"7px 11px",fontSize:11,color:"#DC2626",marginBottom:7,lineHeight:1.5}}>Solo en fuerza mayor para llegar a lugar seguro. Describe el motivo con detalle.</div>}
              <textarea value={evNote} onChange={e=>setEvNote(e.target.value)} placeholder="Observaciones, incidencias…" style={s.tArea} rows={3}/>
              <input ref={photoRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handlePhoto(e,"ev")}/>
              <button onClick={()=>photoRef.current?.click()} style={{...s.photoBtn,borderColor:evPhoto?"#22C55E50":"#E2E8F0",background:evPhoto?"#F0FDF4":"#F8FAFC",color:evPhoto?"#16A34A":"#64748B"}}>{evPhoto?"📷 Foto ✓":"📷 Adjuntar foto"}</button>
              {evPhoto&&<img src={evPhoto} style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:8,marginTop:7}} alt="p"/>}
              <button onClick={confirmEvent} style={{...s.confBtn,background:EV[evType]?.color,cursor:"pointer"}}>{editId?"✓ GUARDAR CAMBIOS":"✓ REGISTRAR"}</button>
            </div>
          </div>
        </div>
      )}

      {modal==="template"&&selTmpl&&(
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={{...s.sheet,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{...s.shHd,background:"white",borderBottom:`2px solid ${selTmpl.color}30`,position:"sticky",top:0,zIndex:10}}>
              <span style={{fontSize:26}}>{selTmpl.icon}</span>
              <div style={{flex:1}}><div style={{...s.shT,color:selTmpl.color}}>{selTmpl.label.toUpperCase()}</div><div style={s.shS}>{fmtFull(new Date())}</div></div>
              <button onClick={()=>setModal(null)} style={s.xBtn}>✕</button>
            </div>
            <div style={s.shBody}>
              {selTmpl.fields.map(f=><div key={f.key} style={{marginBottom:13}}><label style={s.fLbl}>{f.label}</label>{f.type==="textarea"?<textarea value={tmplF[f.key]||""} onChange={e=>setTmplF(p=>({...p,[f.key]:e.target.value}))} style={s.tArea} rows={3}/>:f.type==="datetime"?<input type="datetime-local" value={tmplF[f.key]||""} onChange={e=>setTmplF(p=>({...p,[f.key]:e.target.value}))} style={s.tIn}/>:<input type="text" value={tmplF[f.key]||""} onChange={e=>setTmplF(p=>({...p,[f.key]:e.target.value}))} style={s.tIn}/>}</div>)}
              <label style={s.fLbl}>📍 Ubicación</label>
              <input type="text" value={tmplLoc} onChange={e=>setTmplLoc(e.target.value)} placeholder="Dónde ocurrió…" style={{...s.tIn,marginBottom:11}}/>
              <input ref={tmplPhotoR} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handlePhoto(e,"tmpl")}/>
              <button onClick={()=>tmplPhotoR.current?.click()} style={{...s.photoBtn,borderColor:tmplPhoto?"#22C55E50":"#E2E8F0",background:tmplPhoto?"#F0FDF4":"#F8FAFC",color:tmplPhoto?"#16A34A":"#64748B"}}>{tmplPhoto?"📷 Foto ✓":"📷 Adjuntar foto"}</button>
              {tmplPhoto&&<img src={tmplPhoto} style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:8,marginTop:7}} alt="p"/>}
              {selTmpl.isCMR&&<button onClick={()=>exportCMRPDF(tmplF,prof)} style={{...s.confBtn,background:"#0EA5E9",cursor:"pointer",marginBottom:8}}>📄 Vista previa / Imprimir CMR</button>}
              <button onClick={confirmTmpl} style={{...s.confBtn,background:selTmpl.color,cursor:"pointer"}}>✓ GUARDAR DOCUMENTO</button>
            </div>
          </div>
        </div>
      )}
      {toast&&<div style={{...s.toast,background:toastColor||"#1E293B",maxWidth:"90vw",whiteSpace:"pre-line",textAlign:"center"}}>{toast}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  MODAL DESTINO — pregunta el destino al iniciar jornada
// ─────────────────────────────────────────────────────────────
function fmtOperationalEtaLabel(etaIso){
  return formatOperationalEtaLabel(etaIso);
}

function thinRouteCoords(coords,max=24){
  if(!Array.isArray(coords)||coords.length<=max)return coords||[];
  const step=(coords.length-1)/(max-1);
  return Array.from({length:max},(_,i)=>coords[Math.round(i*step)]).filter(Boolean);
}

function looksLikeLatLonName(value){
  return /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(value||"").trim());
}

function parseOperationalLatLon(value){
  const m=String(value||"").trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if(!m)return null;
  const lat=Number(m[1]),lon=Number(m[2]);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  return{lat,lon};
}

function safeOperationalPlaceName(value,fallback){
  const t=String(value||"").trim();
  if(!t||looksLikeLatLonName(t))return fallback;
  if(/^(ubicaci[oó]n actual|ubicaci[oó]n gps detectada|origen gps)$/i.test(t))return fallback;
  return t;
}

function isGenericOperationalOrigin(value){
  return /^(ubicaci[oó]n actual|ubicaci[oó]n gps detectada|origen gps|mi ubicaci[oó]n|posici[oó]n actual)$/i.test(String(value||"").trim());
}

function operationalPlanLog(level,step,data){
  if(typeof console==="undefined")return;
  const fn=level==="warn"?console.warn:console.info;
  fn(`[operational-plan] ${step}`,data??"");
}

function operationalGpsFromPlan(plan){
  const lat=Number(plan?.input_origin_lat);
  const lon=Number(plan?.input_origin_lon);
  if(Number.isFinite(lat)&&Number.isFinite(lon))return{lat,lon};
  return parseOperationalLatLon(plan?.input_origin);
}

function getBrowserOperationalGps(){
  if(typeof navigator==="undefined"||!navigator.geolocation)return Promise.resolve(null);
  return new Promise(resolve=>{
    navigator.geolocation.getCurrentPosition(
      pos=>resolve({lat:pos.coords.latitude,lon:pos.coords.longitude}),
      ()=>resolve(null),
      {timeout:6000,enableHighAccuracy:false,maximumAge:300000}
    );
  });
}

function gpsActionErrorMessage(error){
  if(!error)return"Ubicación no disponible";
  if(error.code===1)return"Permiso GPS denegado";
  if(error.code===2)return"Ubicación no disponible";
  if(error.code===3)return"GPS tardó demasiado";
  return error.message||"Ubicación no disponible";
}

function trackingLog(step,data){
  if(typeof console==="undefined")return;
  if(step.includes("failed")||step.includes("denied")||step.includes("timeout"))console.warn(`[tracking] ${step}`,data??"");
  else console.info(`[tracking] ${step}`,data??"");
}

/**
 * GPS para acciones operativas.
 * @param {{fresh?:boolean,timeoutMs?:number}} [opts] fresh=true evita caché del navegador (máxima frescura para ubicaciones).
 */
function getDriverActionGps(opts={}){
  const fresh=!!opts.fresh;
  const timeoutMs=Number.isFinite(opts.timeoutMs)?Math.min(60000,Math.max(5000,opts.timeoutMs)):12000;
  const maximumAge=fresh?0:60000;
  if(typeof navigator==="undefined"||!navigator.geolocation){
    trackingLog("gps unavailable",{reason:"navigator.geolocation missing"});
    return Promise.resolve({ok:false,error:"GPS no disponible en este dispositivo"});
  }
  return new Promise(resolve=>{
    trackingLog("gps requested",{timeoutMs,enableHighAccuracy:false,maximumAge,fresh});
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const{latitude:lat,longitude:lon,accuracy,speed}=pos.coords;
        if(!Number.isFinite(lat)||!Number.isFinite(lon)){
          trackingLog("gps invalid_coords",{lat,lon,accuracy});
          resolve({ok:false,error:"Coordenadas GPS inválidas"});
          return;
        }
        trackingLog("gps success",{lat,lon,accuracy,speed,fresh});
        resolve({ok:true,point:{lat,lon,accuracy,speed,ts:new Date().toISOString()}});
      },
      error=>{
        const detail={code:error?.code,message:error?.message||"unknown"};
        if(error?.code===1)trackingLog("gps denied",detail);
        else if(error?.code===3)trackingLog("gps timeout",detail);
        else trackingLog("gps failed",detail);
        resolve({ok:false,error:gpsActionErrorMessage(error)});
      },
      {enableHighAccuracy:false,timeout:timeoutMs,maximumAge}
    );
  });
}

/** empresa_id: servicio primero; fallback conductor_empresa activo. */
async function resolveEmpresaIdForUbicacion(uid,servicio){
  const fromServicio=servicio?.empresa_id;
  if(fromServicio)return fromServicio;
  if(!uid)return null;
  try{
    const rels=await sbSelect("conductor_empresa",`user_id=eq.${uid}&activo=eq.true&select=empresa_id&limit=1`);
    return rels?.[0]?.empresa_id||null;
  }catch{
    return null;
  }
}

/**
 * Snapshot operativo para fila ubicaciones: siempre resuelve servicio activo del conductor
 * y empresa_id (servicio → conductor_empresa). Autónomo sin servicio ni flota → ids null.
 */
async function resolveOperationalUbicacionSnapshot(uid,servicioHint=null,stopsHint=null){
  const out={servicio:null,stops:[],empresa_id:null,servicio_id:null};
  if(!uid)return out;
  const active=await readActiveServiceForDriver(uid);
  let svc=active.servicio;
  let depStops=Array.isArray(active.stops)?active.stops:[];
  const hintId=servicioHint?.id||null;
  if(hintId&&(!svc?.id||svc.id===hintId)){
    svc={...(svc||{}),...servicioHint};
    if(Array.isArray(stopsHint)&&stopsHint.length)depStops=stopsHint;
  }else if(hintId&&svc?.id&&hintId!==svc.id){
    trackingLog("operativa ubicacion servicio_hint_mismatch",{uid,hintId,active_id:svc.id});
  }
  if(!svc?.id){
    trackingLog("operativa ubicacion resolve",{uid,servicio_hint_id:hintId||null,resolved_servicio_id:null,resolved_empresa_id:null,source:"no_active_service"});
    return out;
  }
  let empresaId=svc.empresa_id||null;
  if(!empresaId)empresaId=await resolveEmpresaIdForUbicacion(uid,svc);
  if(empresaId&&!svc.empresa_id)svc={...svc,empresa_id:empresaId};
  out.servicio=svc;
  out.stops=depStops;
  out.empresa_id=empresaId||null;
  out.servicio_id=svc.id;
  if(out.servicio_id&&!out.empresa_id){
    trackingLog("operativa ubicacion warn_sin_empresa_id",{uid,servicio_id:out.servicio_id,msg:"servicio sin empresa_id y sin conductor_empresa activo"});
  }
  trackingLog("operativa ubicacion resolve",{
    uid,
    servicio_hint_id:hintId||null,
    resolved_servicio_id:out.servicio_id,
    resolved_empresa_id:out.empresa_id,
    servicio_estado:svc.estado||null,
    source:"readActiveService_hint_merge",
  });
  return out;
}

async function saveDriverActionLocation(uid,point,{servicio=null,stops=null,eventType=null,stopId=null,preResolved=null}={}){
  if(!uid||!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return null;
  const snap=preResolved||(await resolveOperationalUbicacionSnapshot(uid,servicio,stops));
  const row={
    user_id:uid,
    lat:point.lat,
    lon:point.lon,
    ts:point.ts||new Date().toISOString(),
    precision_m:Math.round(point.accuracy||0),
    velocidad:point.speed!=null?Math.round(point.speed*3.6):null,
    empresa_id:snap.empresa_id??null,
    servicio_id:snap.servicio_id??null,
    event_type:eventType||null,
    stop_id:stopId||null,
  };
  trackingLog("operativa ubicacion payload",row);
  trackingLog("upsert start",row);
  const res=await sbFetch("/rest/v1/ubicaciones?on_conflict=user_id",{
    method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=minimal","Content-Type":"application/json"},
    body:JSON.stringify([row]),
  });
  if(!res.ok){
    let raw="";
    let parsed=null;
    try{raw=await res.text();}catch(_){}
    try{parsed=raw?JSON.parse(raw):null;}catch(_){}
    const errorDetail={
      status:res.status,
      status_text:res.statusText||null,
      code:parsed?.code||null,
      message:parsed?.message||parsed?.error||raw||null,
      detail:parsed?.details||parsed?.detail||null,
      hint:parsed?.hint||null,
      uid,
      servicio_id:row.servicio_id||null,
      empresa_id:row.empresa_id||null,
      event_type:eventType||null,
    };
    trackingLog("operativa ubicacion upsert_failed",errorDetail);
    trackingLog("upsert failed",errorDetail);
    throw new Error(errorDetail.message||`Supabase ${res.status}`);
  }
  trackingLog("upsert success",{uid,status:res.status,servicio_id:row.servicio_id,event_type:eventType||null,empresa_id:row.empresa_id||null});
  try{
    const verify=await sbFetch(`/rest/v1/ubicaciones?user_id=eq.${uid}&order=ts.desc&limit=1`);
    if(verify.ok){
      const rows=await verify.json();
      const vrow=Array.isArray(rows)?rows[0]:null;
      trackingLog("persist verify latest row",{
        uid,
        ts:vrow?.ts||null,
        lat:vrow?.lat??null,
        lon:vrow?.lon??null,
        precision_m:vrow?.precision_m??null,
        velocidad:vrow?.velocidad??null,
        empresa_id:vrow?.empresa_id??null,
        servicio_id:vrow?.servicio_id??null,
      });
    }else{
      trackingLog("persist verify failed",{uid,status:verify.status,status_text:verify.statusText||null});
    }
  }catch(e){
    trackingLog("persist verify failed",{uid,error:e?.message||String(e)});
  }
  return res;
}

function buildOperationalEtaSnapshot({eta,servicio,point,eventType,stopId,activeStopId}){
  const plan=getOperationalPlanSnapshot(servicio);
  const planEta=plan?.planned_eta||null;
  const etaMs=eta?.eta?new Date(eta.eta).getTime():NaN;
  const planMs=planEta?new Date(planEta).getTime():NaN;
  const deltaMin=Number.isFinite(etaMs)&&Number.isFinite(planMs)?Math.round((etaMs-planMs)/60000):null;
  const ts=new Date().toISOString();
  const rm=Number(eta.remaining_mins);
  const rk=Number(eta.remaining_km);
  return{
    eta:eta.eta,
    eta_ts:eta.eta,
    eta_label:eta.label,
    label:eta.label,
    confidence:eta.confidence||"medium",
    status:"ok",
    source:"driver_event",
    event_type:eventType||null,
    stop_id:stopId||null,
    active_stop_id:activeStopId??null,
    servicio_id:servicio?.id??null,
    calculated_at:ts,
    updated_at:ts,
    last_eta_refresh_at:ts,
    location_ts:point?.ts||null,
    lat:Number(point.lat),
    lon:Number(point.lon),
    precision_m:Math.round(point?.accuracy||0),
    planned_eta:planEta,
    delta_min:deltaMin,
    remaining_mins:Number.isFinite(rm)?Math.max(0,Math.round(rm)):null,
    remaining_km:Number.isFinite(rk)?Math.round(rk*10)/10:null,
  };
}

async function persistServiceOperationalEta({
  servicio,
  stops,
  norma,
  point,
  eventType,
  stopId,
  activeStopId:activeStopIdArg,
  force: forceOpt,
}={}){
  if(!servicio?.id||!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return null;
  if(!servicio.destino?.trim()||!servicio.origen?.trim())return null;
  if(!isEtaActivationReady(servicio))return null;
  const activeStopId=activeStopIdArg??getCurrentStop(stops)?.id??null;
  const prevSnap=getOperationalEtaSnapshot(servicio);
  const forcePersist=!!forceOpt||eventType==="empresa_refresh";
  const decision=shouldPersistOperationalEtaRefresh({
    prev:prevSnap,
    point,
    servicioId:servicio.id,
    activeStopId,
    eventType:eventType||null,
    force:forcePersist,
  });
  if(!decision.should){
    trackingLog("operativa persist_eta_skipped",{
      servicio_id:servicio.id,
      empresa_id:servicio.empresa_id||null,
      event_type:eventType||null,
      reason:decision.reason,
    });
    return{skipped:true,referencia:null,operationalEta:prevSnap||null};
  }
  trackingLog("operativa persist_eta_start",{
    servicio_id:servicio.id,
    empresa_id:servicio.empresa_id||null,
    event_type:eventType||null,
    refresh_reason:decision.reason,
  });
  const serviceForEta={...servicio,estado:servicio.estado==="asignado"?"en_curso":servicio.estado};
  const planSnap=getOperationalPlanSnapshot(servicio);
  const truckSpeedKmh=Number.isFinite(Number(planSnap?.velocidad))
    ?Math.min(100,Math.max(60,Math.round(Number(planSnap.velocidad))))
    :undefined;
  const eta=await getServiceEta({
    service:serviceForEta,
    stops,
    norma:norma||null,
    currentPosition:{lat:point.lat,lon:point.lon},
    operationalTripStarted:true,
    truckSpeedKmh,
  });
  if(!eta?.eta)return null;
  const operationalEta=buildOperationalEtaSnapshot({eta,servicio,point,eventType,stopId,activeStopId});
  const referencia=mergeReferenciaOperacional(servicio.referencia||null,{
    operational_trip_started_at:getOperationalTripStartedAt(servicio)||new Date().toISOString(),
    operational_eta:operationalEta,
  });
  const res=await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`,{method:"PATCH",body:JSON.stringify({referencia})});
  if(!res.ok){
    let errTxt="";
    try{errTxt=await res.text();}catch(_){}
    trackingLog("operativa persist_eta_failed",{servicio_id:servicio.id,status:res.status,detail:String(errTxt).slice(0,400)});
    throw new Error(`No se pudo guardar la ETA actual`);
  }
  trackingLog("operativa persist_eta_ok",{servicio_id:servicio.id,refresh_reason:decision.reason});
  try{window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));}catch(_){/* SSR */}
  return{referencia,operationalEta};
}

async function registerDriverOperationalPoint({uid,servicio,stops,norma,eventType,stopId,showToast}){
  const depStopsIn=Array.isArray(stops)?stops:[];
  console.log("[OP3] register start",{
    uid:uid||null,
    eventType:eventType||null,
    servicioId:servicio?.id||null,
    stopId:stopId||null,
    estadoServicio:servicio?.estado||null,
    stopsCount:depStopsIn.length,
  });
  const successMsgs={
    entrada_muelle:"Entrada en muelle registrada",
    salida_muelle:"Muelle finalizado",
    inicio_servicio:"Servicio en marcha",
    inicio_operacion_stop:"Operación registrada",
  };
  const successBase=successMsgs[eventType]||"✓ Acción registrada";

  showToast?.("Obteniendo ubicación…","#64748B",4000);
  trackingLog("operativa flow_gps_wait",{uid,event:eventType||null});

  const gps=await getDriverActionGps({fresh:true,timeoutMs:15000});
  if(!gps.ok){
    console.warn("[OP3] gps fail",{
      eventType:eventType||null,
      servicioId:servicio?.id||null,
      stopId:stopId||null,
      error:gps.error,
    });
    showToast?.(`${gps.error}. Sin ubicación operativa.`,"#F97316",4200);
    trackingLog("operativa flow_gps_fail",{uid,error:gps.error});
    return{gpsOk:false,error:gps.error};
  }
  const point=gps.point;
  console.log("[OP3] gps ok",{
    eventType:eventType||null,
    servicioId:servicio?.id||null,
    stopId:stopId||null,
    lat:point?.lat,
    lon:point?.lon,
    accuracy:point?.accuracy,
  });
  trackingLog("operativa flow_gps_ok",{uid,lat:point.lat,lon:point.lon,accuracy:point.accuracy});

  const snap=await resolveOperationalUbicacionSnapshot(uid,servicio,depStopsIn);
  trackingLog("event dispatch",{event_type:eventType||null,uid,servicio_id:snap.servicio_id,empresa_id:snap.empresa_id,stop_id:stopId||null});

  try{
    await saveDriverActionLocation(uid,point,{preResolved:snap,eventType,stopId});
    console.log("[OP3] saveDriverActionLocation ok",{
      eventType:eventType||null,
      servicioId:snap?.servicio_id||null,
      stopId:stopId||null,
      empresaId:snap?.empresa_id||null,
    });
  }catch(e){
    console.warn("ubicacion evento save failed:",e);
    trackingLog("operativa ubicacion save_exception",{uid,error:String(e?.message||e)});
    const msg=e?.message?String(e.message).slice(0,120):"Error desconocido";
    showToast?.(`Ubicación GPS lista, pero no se guardó: ${msg}`,"#F97316",4200);
    return{gpsOk:true,point,saveFailed:true};
  }

  try{
    const activeStopId=getCurrentStop(snap.stops)?.id??null;
    const etaRes=await persistServiceOperationalEta({
      servicio:snap.servicio,
      stops:snap.stops,
      norma,
      point,
      eventType,
      stopId,
      activeStopId,
    });
    if(etaRes?.referencia&&snap.servicio)snap.servicio.referencia=etaRes.referencia;
    const etaLabel=etaRes?.operationalEta?.label||etaRes?.operationalEta?.eta_label;
    if(etaLabel){
      showToast?.(`${successBase} · ETA ${etaLabel}`,"#166534",3800);
    }else{
      showToast?.(successBase,"#166534",2800);
    }
    trackingLog("operativa flow_complete",{
      uid,
      event:eventType||null,
      servicio_id:snap.servicio_id,
      empresa_id:snap.empresa_id,
      has_eta:!!etaLabel,
    });
    console.log("[OP3] register success",{
      eventType:eventType||null,
      servicioId:snap?.servicio_id||null,
      stopId:stopId||null,
      gpsOk:true,
    });
    return{gpsOk:true,point,...(etaRes||{})};
  }catch(e){
    console.warn("eta operacional failed:",e);
    showToast?.("Ubicación guardada. ETA no recalculada","#F97316",3200);
    showToast?.(successBase,"#166534",2400);
    trackingLog("operativa flow_eta_fail",{uid,error:String(e?.message||e)});
    console.warn("[OP3] register eta branch fail",{
      eventType:eventType||null,
      servicioId:snap?.servicio_id||null,
      stopId:stopId||null,
      error:String(e?.message||e),
    });
    return{gpsOk:true,point};
  }
}

async function fetchDriverOperationalCandidates(uid){
  if(!uid)return[];
  /** Incluye `completado` (firma) y `pendiente_asignacion` con conductor ya fijado; excluye `cerrado`. */
  const ESTADOS_SERVICIO_ACTIVO_CONDUCTOR="en_curso,asignado,completado,pendiente_asignacion";
  async function fetchServiciosByConductorId(){
    const r=await sbFetch(`/rest/v1/servicios?conductor_id=eq.${uid}&estado=in.(${ESTADOS_SERVICIO_ACTIVO_CONDUCTOR})&order=created_at.desc&limit=40`);
    if(!r.ok)return[];
    const rows=await r.json();
    return Array.isArray(rows)?rows:[];
  }
  async function fetchServiciosByAsignacionesFallback(){
    const ar=await sbFetch(`/rest/v1/servicio_asignaciones?conductor_id=eq.${uid}&order=created_at.desc&limit=40&select=servicio_id`);
    if(!ar.ok)return[];
    const arows=await ar.json();
    const ids=[...new Set((Array.isArray(arows)?arows:[]).map(r=>r?.servicio_id).filter(Boolean))];
    if(!ids.length)return[];
    const sr=await sbFetch(`/rest/v1/servicios?id=in.(${ids.join(",")})&estado=in.(${ESTADOS_SERVICIO_ACTIVO_CONDUCTOR})&order=created_at.desc&limit=40`);
    if(!sr.ok)return[];
    const srows=await sr.json();
    return Array.isArray(srows)?srows:[];
  }
  const primaryCandidates=await fetchServiciosByConductorId();
  const fallbackCandidates=await fetchServiciosByAsignacionesFallback();
  const byId=new Map();
  [...primaryCandidates,...fallbackCandidates].forEach((sv)=>{if(sv?.id)byId.set(sv.id,sv);});
  return [...byId.values()]
    .filter((sv)=>isConductorServicioOperativoActivo(sv,uid));
}

async function fetchStopsForServicioId(servicioId){
  if(!servicioId)return[];
  const sr=await sbFetch(`/rest/v1/stops?servicio_id=eq.${servicioId}&order=orden.asc`);
  const stops=sr.ok?await sr.json():[];
  return Array.isArray(stops)?stops:[];
}

async function resolveDriverActiveServiceAndStops(uid){
  const empty={servicio:null,stops:[],siguienteServicio:null,siguientesStops:[]};
  if(!uid)return empty;
  const rawCandidates=await fetchDriverOperationalCandidates(uid);
  const candidates=sortDriverOperationalCandidates(rawCandidates);
  console.log("[OP2] active service candidates",{
    uid,
    rows:candidates.length,
    ids:candidates.map(s=>s?.id),
    estados:candidates.map(s=>s?.estado),
  });
  if(!candidates.length)return empty;
  let fallbackServicio=null;
  let fallbackStops=[];
  let servicio=null;
  let stops=[];
  for(const sv of candidates){
    if(!sv?.id)continue;
    const arr=await fetchStopsForServicioId(sv.id);
    console.log("[OP2] candidate stops",{
      servicioId:sv.id,
      estado:sv?.estado||null,
      rows:arr.length,
      stopIds:arr.map(s=>s?.id),
    });
    if(!fallbackServicio){
      fallbackServicio=sv;
      fallbackStops=arr;
    }
    if(arr.length>0){
      servicio=sv;
      stops=arr;
      break;
    }
  }
  if(!servicio){
    servicio=fallbackServicio;
    stops=fallbackStops;
  }
  const siguienteServicio=pickNextAssignedService(candidates,servicio?.id||null);
  const siguientesStops=siguienteServicio?.id?await fetchStopsForServicioId(siguienteServicio.id):[];
  console.log("[OP2] driver queue resolved",{
    uid,
    currentId:servicio?.id||null,
    nextId:siguienteServicio?.id||null,
  });
  return{servicio,stops,siguienteServicio,siguientesStops};
}

async function readActiveServiceForDriver(uid){
  const out=await resolveDriverActiveServiceAndStops(uid);
  console.log("[OP2] readActiveServiceForDriver resolved",{
    uid,
    servicioId:out?.servicio?.id||null,
    estado:out?.servicio?.estado||null,
    conductor_id:out?.servicio?.conductor_id||null,
    stopsRows:Array.isArray(out?.stops)?out.stops.length:0,
  });
  return out;
}

async function registerDriverEventOperationalPoint({uid,norma,eventType,showToast}){
  const{servicio,stops}=await readActiveServiceForDriver(uid);
  return registerDriverOperationalPoint({uid,servicio,stops,norma,eventType,showToast});
}

async function resolveOperationalPoint(text,{gps=null,fallbackName="Ubicación GPS detectada"}={}){
  if(gps&&Number.isFinite(Number(gps.lat))&&Number.isFinite(Number(gps.lon))){
    return{lat:Number(gps.lat),lon:Number(gps.lon),name:safeOperationalPlaceName(text,fallbackName)};
  }
  const parsed=parseOperationalLatLon(text);
  if(parsed)return{...parsed,name:fallbackName};
  if(isGenericOperationalOrigin(text)){
    throw new Error("Origen GPS sin coordenadas válidas. Activa GPS o escribe origen manual");
  }
  return geocode(String(text||"").trim());
}

async function buildOperationalPlanSnapshot({origen,destino,waypoint,velocidad,norma,gpsOrigen,modoManual}){
  const startedAt=new Date();
  const inputGps=gpsOrigen||parseOperationalLatLon(origen);
  operationalPlanLog("info","input modal",{
    origenTexto:origen?.trim?.()||"",
    destinoTexto:destino?.trim?.()||"",
    waypointTexto:waypoint?.trim?.()||"",
    velocidad,
    modoManual,
    gpsOrigen:inputGps?{lat:Number(inputGps.lat),lon:Number(inputGps.lon)}:null,
  });
  try{
    const from=await resolveOperationalPoint(origen,{gps:inputGps,fallbackName:"Ubicación actual"});
    operationalPlanLog("info","geocode origen",{
      texto:origen?.trim?.()||"",
      coords:{lat:from.lat,lon:from.lon},
      nombre:from.name,
      gpsUsado:!!inputGps,
    });
    const to=await resolveOperationalPoint(destino,{fallbackName:"Destino"});
    operationalPlanLog("info","geocode destino",{
      texto:destino?.trim?.()||"",
      coords:{lat:to.lat,lon:to.lon},
      nombre:to.name,
    });
    const legs=[];
    let km=0,mins=0,coords=[];
    if(waypoint?.trim()){
      try{
        const via=await resolveOperationalPoint(waypoint,{fallbackName:"Punto intermedio"});
        operationalPlanLog("info","geocode waypoint",{
          texto:waypoint?.trim?.()||"",
          coords:{lat:via.lat,lon:via.lon},
          nombre:via.name,
        });
        const r1=await getRoute(from,via,velocidad);
        const r2=await getRoute(via,to,velocidad);
        operationalPlanLog("info","route result",{
          modo:"via",
          legs:[
            {from:from.name,to:via.name,km:r1.km,mins:r1.mins,real:!!r1.real,coords:Array.isArray(r1.coords)?r1.coords.length:0},
            {from:via.name,to:to.name,km:r2.km,mins:r2.mins,real:!!r2.real,coords:Array.isArray(r2.coords)?r2.coords.length:0},
          ],
        });
        legs.push({from:from.name,to:via.name,km:r1.km,mins:r1.mins,real:!!r1.real});
        legs.push({from:via.name,to:to.name,km:r2.km,mins:r2.mins,real:!!r2.real});
        km=r1.km+r2.km;mins=r1.mins+r2.mins;coords=[...r1.coords,...r2.coords];
      }catch(e){
        operationalPlanLog("warn","waypoint skipped; direct route retry",{
          waypoint:waypoint?.trim?.()||"",
          error:e?.message||String(e),
        });
        const route=await getRoute(from,to,velocidad);
        operationalPlanLog("info","route result",{
          modo:"directa_sin_waypoint",
          km:route.km,
          mins:route.mins,
          real:!!route.real,
          coords:Array.isArray(route.coords)?route.coords.length:0,
        });
        legs.push({from:from.name,to:to.name,km:route.km,mins:route.mins,real:!!route.real,waypointSkipped:true});
        km=route.km;mins=route.mins;coords=route.coords;
      }
    }else{
      const route=await getRoute(from,to,velocidad);
      operationalPlanLog("info","route result",{
        modo:"directa",
        km:route.km,
        mins:route.mins,
        real:!!route.real,
        coords:Array.isArray(route.coords)?route.coords.length:0,
      });
      legs.push({from:from.name,to:to.name,km:route.km,mins:route.mins,real:!!route.real});
      km=route.km;mins=route.mins;coords=route.coords;
    }
    const plan=buildPlan(mins,norma||null,{
      contUsed:norma?.cont,
      dayUsed:norma?.todayDrive,
      weekUsed:norma?.weekDrive,
      extUsed:norma?.extUsed,
      start:startedAt,
      km,
    });
    const eta=(plan.arrival instanceof Date?plan.arrival:new Date(plan.arrival)).toISOString();
    const rests=(plan.segs||[]).filter(seg=>seg.type!=="conduccion");
    const breaks=rests.filter(seg=>String(seg.type).startsWith("pausa"));
    const dailyRest=rests.find(seg=>seg.type==="descanso");
    const weeklyRest=rests.find(seg=>seg.type==="descanso_semana");
    const routeFrom=safeOperationalPlaceName(from.name,"Ubicación actual");
    const routeTo=safeOperationalPlaceName(to.name,destino.trim()||"Destino");
    const snapshot={
      status:"ok",
      route_plan_status:"ready",
      snapshot_at:startedAt.toISOString(),
      input_origin:origen?.trim?.()||"",
      input_origin_lat:Number.isFinite(Number(inputGps?.lat))?Number(inputGps.lat):null,
      input_origin_lon:Number.isFinite(Number(inputGps?.lon))?Number(inputGps.lon):null,
      input_destination:destino?.trim?.()||"",
      input_waypoint:waypoint?.trim?.()||null,
      planned_origin:routeFrom,
      planned_destination:routeTo,
      planned_waypoint:waypoint?.trim()||null,
      planned_km:Math.round(km*10)/10,
      planned_drive_min:Math.round(mins),
      planned_drive_time:fmtDur(Math.round(mins)),
      planned_eta:eta,
      planned_eta_label:fmtOperationalEtaLabel(eta),
      planned_breaks:breaks.length,
      planned_daily_rest:!!dailyRest,
      planned_daily_rest_label:dailyRest?"Descanso diario previsto":weeklyRest?"Descanso semanal previsto":"Sin descanso diario previsto",
      planned_rest_plan:rests.map(seg=>({
        type:seg.type,
        start:seg.start instanceof Date?seg.start.toISOString():new Date(seg.start).toISOString(),
        dur:seg.dur,
      })),
      planned_summary:`${Math.round(km)} km · ${fmtDur(Math.round(mins))} conducción · ${breaks.length} pausa${breaks.length===1?"":"s"} · ${dailyRest?"descanso diario":"sin descanso diario"}`,
      planned_route:{legs,coords:thinRouteCoords(coords)},
      confidence:legs.every(l=>l.real)?"high":"medium",
      velocidad,
    };
    operationalPlanLog("info","snapshot operational_plan",{
      status:snapshot.status,
      route_plan_status:snapshot.route_plan_status,
      planned_km:snapshot.planned_km,
      planned_eta:snapshot.planned_eta,
      planned_breaks:snapshot.planned_breaks,
      planned_daily_rest:snapshot.planned_daily_rest,
      legs:snapshot.planned_route?.legs,
    });
    return snapshot;
  }catch(e){
    operationalPlanLog("warn","build failed",{
      origenTexto:origen?.trim?.()||"",
      destinoTexto:destino?.trim?.()||"",
      origenCoords:inputGps?{lat:Number(inputGps.lat),lon:Number(inputGps.lon)}:null,
      error:e?.message||String(e),
      stack:e?.stack,
    });
    return{
      status:"failed",
      route_plan_status:"failed",
      snapshot_at:startedAt.toISOString(),
      input_origin:origen?.trim?.()||"",
      input_origin_lat:Number.isFinite(Number(inputGps?.lat))?Number(inputGps.lat):null,
      input_origin_lon:Number.isFinite(Number(inputGps?.lon))?Number(inputGps.lon):null,
      input_destination:destino?.trim?.()||"",
      input_waypoint:waypoint?.trim?.()||null,
      planned_origin:safeOperationalPlaceName(origen,"Ubicación actual"),
      planned_destination:safeOperationalPlaceName(destino,"Destino"),
      planned_waypoint:waypoint?.trim()||null,
      planned_km:null,
      planned_drive_min:null,
      planned_drive_time:null,
      planned_eta:null,
      planned_eta_label:null,
      planned_breaks:null,
      planned_daily_rest:false,
      planned_daily_rest_label:"Sin descanso calculado",
      planned_rest_plan:[],
      planned_route:null,
      planned_summary:"No se pudo calcular ruta completa",
      confidence:"low",
      error:e?.message||"routing_failed",
      velocidad,
    };
  }
}

async function retryOperationalPlanBuild({servicio,request,norma,showToast}){
  if(!servicio?.id)return;
  const plan=getOperationalPlanSnapshot(servicio);
  const storedGps=operationalGpsFromPlan(plan);
  const needsGps=!storedGps&&/^(origen gps|ubicaci[oó]n gps detectada)$/i.test(String(plan?.planned_origin||servicio.origen||"").trim());
  const liveGps=needsGps?await getBrowserOperationalGps():null;
  const retryRequest=request||{
    origen:plan?.input_origin||plan?.planned_origin||servicio.origen||"",
    destino:plan?.input_destination||plan?.planned_destination||servicio.destino||"",
    waypoint:plan?.input_waypoint||plan?.planned_waypoint||"",
    velocidad:plan?.velocidad||80,
    norma,
    gpsOrigen:storedGps||liveGps,
    modoManual:!(storedGps||liveGps),
  };
  if(!retryRequest.origen?.trim?.()||!retryRequest.destino?.trim?.()){
    showToast?.("Faltan origen o destino para recalcular");
    return;
  }
  showToast?.("Calculando planificación operacional...");
  const operationalPlan=await buildOperationalPlanSnapshot(retryRequest);
  const referencia=mergeReferenciaOperacional(servicio.referencia||null,{
    operational_trip_started_at:getOperationalTripStartedAt(servicio)||new Date().toISOString(),
    operational_plan:operationalPlan,
  });
  const res=await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`,{method:"PATCH",body:JSON.stringify({referencia})});
  if(!res.ok)throw new Error(`Supabase ${res.status}`);
  window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
  if(operationalPlan.status==="ok"){
    showToast?.(`✅ Planificación operacional calculada${operationalPlan.planned_eta_label?` · ${operationalPlan.planned_eta_label}`:""}`);
  }else{
    showToast?.(`⚠ No se pudo calcular ruta completa${operationalPlan.error?`: ${operationalPlan.error}`:""}`);
  }
}

function ModalDestino({onClose,onSave,showToast,prefillDestino="",prefillOrigen="",prefillWaypoint="",prefillVelocidad=80,prefillGpsOrigen=null,norma=null}){
  const[origen,setOrigen]=useState(()=>prefillOrigen||"");
  const[destino,setDestino]=useState(()=>prefillDestino||"");
  const[waypoint,setWaypoint]=useState(()=>prefillWaypoint||"");
  const[velocidad,setVelocidad]=useState(()=>{
    const v=Number(prefillVelocidad);
    return Number.isFinite(v)?Math.min(100,Math.max(60,Math.round(v))):80;
  });
  const[loading,setLoading]=useState(false);
  const[gpsOrigen,setGpsOrigen]=useState(()=>prefillGpsOrigen||null);
  const[gpsLoading,setGpsLoading]=useState(false);
  const[modoManual,setModoManual]=useState(()=>!!prefillOrigen?.trim()&&!prefillGpsOrigen);
  const origenTouchedRef=useRef(false);
  const destinoTouchedRef=useRef(false);
  const gpsRequestRef=useRef(0);

  function pedirGPS(){
    const requestId=++gpsRequestRef.current;
    origenTouchedRef.current=false;
    setGpsLoading(true);
    if(!navigator.geolocation){setGpsLoading(false);setModoManual(true);return;}
    navigator.geolocation.getCurrentPosition(
      pos=>{
        if(requestId!==gpsRequestRef.current)return;
        const{latitude:lat,longitude:lon}=pos.coords;
        setGpsOrigen({lat,lon});
        setModoManual(false);
        setGpsLoading(false); // inmediato — no esperar al nombre
        if(!origenTouchedRef.current)setOrigen(`${lat.toFixed(3)},${lon.toFixed(3)}`);
        reverseGeocode(lat,lon).then(name=>{
          if(requestId===gpsRequestRef.current&&!origenTouchedRef.current)setOrigen(name);
        }).catch(()=>{});
      },
      ()=>{if(requestId===gpsRequestRef.current){setGpsLoading(false);setModoManual(true);}},
      {timeout:6000,enableHighAccuracy:false,maximumAge:300000}
    );
  }

  useEffect(()=>{
    if(prefillOrigen?.trim()){
      setOrigen(prefillOrigen.trim());
      setModoManual(!prefillGpsOrigen);
      return;
    }
    pedirGPS();
  },[]);
  useEffect(()=>{
    if(prefillDestino?.trim()&&!destinoTouchedRef.current)setDestino(prefillDestino.trim());
  },[prefillDestino]);

  async function confirmar(){
    if(loading)return;
    if(!origen.trim()){showToast("Introduce el origen del servicio");return;}
    if(!destino.trim()){showToast("Introduce el destino del servicio");return;}
    setLoading(true);
    try{
      const planningRequest={
        origen,
        destino,
        waypoint,
        velocidad,
        norma,
        gpsOrigen,
        modoManual,
      };
      showToast("Calculando planificación operacional...");
      const operationalPlan=await buildOperationalPlanSnapshot(planningRequest);
      if(operationalPlan.status!=="ok"){
        throw new Error(operationalPlan.error||"No se pudo calcular ruta completa");
      }
      await onSave({
        destino:destino.trim(),
        origen:origen.trim(),
        waypoint:waypoint.trim()||null,
        km:operationalPlan.planned_km,
        mins:operationalPlan.planned_drive_min,
        coords:operationalPlan.planned_route?.coords||null,
        velocidad,
        operationalPlan,
        diaActual:1,
        savedAt:new Date().toISOString()
      });
      onClose();
    }catch(e){
      const msg=e?.message||"inténtalo de nuevo";
      showToast("Error al guardar destino: "+msg);
    }finally{setLoading(false);}
  }

  const iStyle={width:"100%",background:"#0F172A",border:"1.5px solid #334155",borderRadius:10,padding:"12px 14px",fontSize:15,color:"#F1F5F9",outline:"none",boxSizing:"border-box"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:2000,display:"flex",alignItems:"flex-end"}} onClick={()=>{if(!loading)onClose();}}>
      <div style={{background:"#1E293B",borderRadius:"18px 18px 0 0",width:"100%",padding:"20px 18px 36px",borderTop:"3px solid #F59E0B",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:800,color:"#F59E0B",marginBottom:4}}>🗺 Destino del servicio</div>
        <div style={{fontSize:12,color:"#64748B",marginBottom:16}}>Se guardará una planificación estable del servicio.</div>

        {/* Origen */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:6}}>🟢 ORIGEN</div>
          <div style={{display:"flex",gap:8}}>
            <input value={origen} onChange={e=>{origenTouchedRef.current=true;setModoManual(true);setOrigen(e.target.value);}} placeholder="Tu ciudad actual..."
              style={{...iStyle,flex:1}}/>
            <button type="button" onClick={pedirGPS} disabled={gpsLoading||loading}
              style={{background:"#3B82F6",color:"white",border:"none",borderRadius:8,padding:"0 12px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
              {gpsLoading?"⌛":"📍 GPS"}
            </button>
          </div>
          {gpsOrigen&&!modoManual&&<div style={{fontSize:11,color:"#22C55E",marginTop:4}}>✓ GPS obtenido</div>}
        </div>

        {/* Punto intermedio */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:6}}>📍 PUNTO INTERMEDIO (opcional)</div>
          <input value={waypoint} onChange={e=>setWaypoint(e.target.value)}
            placeholder="Ej: Zaragoza, Lyon, Frankfurt..."
            style={iStyle}/>
        </div>

        {/* Destino */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:6}}>🔴 DESTINO</div>
          <input value={destino} onChange={e=>{destinoTouchedRef.current=true;setDestino(e.target.value);}}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();confirmar();}}}
            placeholder="Ej: Berlín, París, Hamburgo..." autoFocus={!origen}
            style={iStyle}/>
        </div>

        {/* Velocidad media (60–100, paso 1 km/h — alineado con planificador ruta / normativa) */}
        <div style={{marginBottom:14,background:"#0F172A",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>🚛</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:"#64748B",fontWeight:700,marginBottom:4}}>VELOCIDAD MEDIA · {velocidad} km/h</div>
              <input
                type="range"
                min={60}
                max={100}
                step={1}
                value={velocidad}
                onChange={(e)=>setVelocidad(Math.min(100,Math.max(60,Number(e.target.value)||80)))}
                disabled={loading}
                style={{width:"100%",accentColor:"#F59E0B",opacity:loading?0.55:1}}
              />
            </div>
            <div style={{textAlign:"center",flexShrink:0,minWidth:54}}>
              <input
                type="number"
                min={60}
                max={100}
                step={1}
                value={velocidad}
                onChange={(e)=>setVelocidad(Math.min(100,Math.max(60,Number(e.target.value)||80)))}
                disabled={loading}
                style={{
                  width:52,
                  boxSizing:"border-box",
                  background:"#1E293B",
                  border:"1px solid #334155",
                  borderRadius:8,
                  outline:"none",
                  color:"#F1F5F9",
                  fontSize:15,
                  fontWeight:800,
                  textAlign:"center",
                  padding:"6px 4px",
                  opacity:loading?0.55:1,
                }}
              />
              <div style={{fontSize:9,color:"#64748B",marginTop:2}}>km/h</div>
            </div>
          </div>
          <div style={{fontSize:10,color:"#475569",marginTop:8,textAlign:"center"}}>Por defecto 80 km/h · ajuste fino de 1 en 1</div>
        </div>

        {loading&&(
          <div style={{background:"#0F2A1A",border:"1px solid #22C55E40",borderRadius:10,padding:"9px 11px",fontSize:12,color:"#86EFAC",fontWeight:700,marginBottom:10}}>
            Calculando planificación del servicio…
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{background:"transparent",border:"1px solid #334155",borderRadius:10,padding:"13px",fontSize:14,color:"#64748B",cursor:loading?"default":"pointer",fontWeight:600,opacity:loading?0.55:1}}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={loading||!origen.trim()||!destino.trim()}
            style={{background:origen.trim()&&destino.trim()&&!loading?"#F59E0B":"#334155",color:origen.trim()&&destino.trim()&&!loading?"#0F172A":"#64748B",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:800,cursor:loading?"default":"pointer"}}>
            {loading?"⌛ Guardando...":"✅ Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  VOZ NATURAL — selecciona la mejor voz española disponible
// ─────────────────────────────────────────────────────────────
let _bestVoice=null;
function getBestVoice(){
  if(_bestVoice)return _bestVoice;
  const voices=window.speechSynthesis?.getVoices()||[];
  // Prioridad: voces premium/neural > Google > cualquier español
  const priority=[
    v=>v.lang.startsWith("es")&&/premium|enhanced|neural|natural/i.test(v.name),
    v=>v.lang.startsWith("es")&&/google/i.test(v.name),
    v=>v.lang.startsWith("es")&&/lucia|lucía|mónica|monica|paula|elena|jorge|carlos/i.test(v.name),
    v=>v.lang==="es-ES",
    v=>v.lang.startsWith("es"),
  ];
  for(const fn of priority){const v=voices.find(fn);if(v){_bestVoice=v;return v;}}
  return null;
}

function speakNatural(txt){
  if(!window.speechSynthesis)return;
  window.speechSynthesis.cancel();
  // Limpiar emojis y símbolos especiales antes de hablar
  const clean=txt.replace(/[\u{1F000}-\u{1FFFF}]/gu,"")
    .replace(/[\u{2600}-\u{27BF}]/gu,"")
    .replace(/[⚠️🔴🟠🟡🟢✅❌⛔👁🎙📍🗺]/g,"")
    .replace(/\s+/g," ").trim();
  const u=new SpeechSynthesisUtterance(clean);
  u.lang="es-ES";
  u.rate=0.9;
  u.pitch=1.05;
  u.volume=1;
  const v=getBestVoice();
  if(v)u.voice=v;
  // Retry si las voces no están cargadas aún
  if(!v&&window.speechSynthesis.getVoices().length===0){
    window.speechSynthesis.onvoiceschanged=()=>{
      _bestVoice=null;
      const v2=getBestVoice();
      if(v2)u.voice=v2;
      window.speechSynthesis.speak(u);
    };
    return;
  }
  window.speechSynthesis.speak(u);
}
function ViajeBar({viaje,norma,onCancel,onChangeDestino}){
  const[open,setOpen]=useState(false);

  const prevEstado=useRef(null);

  // Calcular con velocidad de camión real (80 km/h)
  const plan=useMemo(()=>{
    if(!viaje?.km)return null;
    try{
      const minsCamion=Math.round(viaje.km/(viaje.velocidad||TRUCK_KMH)*60);
      return buildPlan(minsCamion,null,{
        contUsed:norma.cont||0,
        dayUsed:norma.todayDrive||0,
        weekUsed:norma.weekDrive||0,
        useReduced:true,useExtended:true,
        start:new Date(),
        km:viaje.km,
        coords:viaje.coords||[],
      });
    }catch{return null;}
  },[viaje,norma.cont,norma.todayDrive,norma.weekDrive]);

  // Alertas de voz cuando cambia el estado del viaje
  useEffect(()=>{
    if(!plan)return;
    const descansos=plan.segs.filter(s=>["rest","rest_r","wrest"].includes(s.type));
    const nuevoEstado=descansos.length;
    if(prevEstado.current===null){prevEstado.current=nuevoEstado;return;}
    if(nuevoEstado!==prevEstado.current){
      prevEstado.current=nuevoEstado;
      if(nuevoEstado===0){
        speakNatural(`Buenas noticias. Con este ritmo llegas a ${viaje.destino} el ${formatOperationalEtaLabel(plan.arrival)||"horario previsto"} sin necesidad de descanso en ruta.`);
      } else if(nuevoEstado>prevEstado.current){
        speakNatural(`Atención. El retraso acumulado hace que necesites ${nuevoEstado===1?"un descanso adicional en ruta":nuevoEstado+" descansos en ruta"} para llegar a ${viaje.destino}.`);
      }
    }
  },[plan]);

  if(!plan)return null;

  const {nDias=1, llegaHoy=false, dias=[]} = plan;
  const llegada=plan.arrival;

  const proxIdx=plan.segs.findIndex(s=>s.type!=="conduccion");
  const proxParada=proxIdx>=0?plan.segs[proxIdx]:null;
  const totalDriveMins=plan.segs.filter(s=>s.type==="conduccion").reduce((a,s)=>a+s.dur,0)||1;
  const minsHastaParada=plan.segs.slice(0,Math.max(0,proxIdx)).filter(s=>s.type==="conduccion").reduce((a,s)=>a+s.dur,0);
  const kmProx=proxParada&&viaje.km&&minsHastaParada>0
    ?Math.min(Math.round((minsHastaParada/totalDriveMins)*viaje.km),viaje.km)
    :null;

  let estado,color;
  const etaExacta=formatOperationalEtaLabel(llegada)||"ETA pendiente";
  if(llegaHoy||nDias<=1){estado=`✅ ${etaExacta}`;color="#22C55E";}
  else{estado=`🛌 ${etaExacta}`;color:nDias===2?"#F59E0B":"#F97316";}

  return(
    <div style={{margin:"0 14px 10px",flexShrink:0}}>
      {/* Línea compacta */}
      <div onClick={()=>setOpen(o=>!o)}
        style={{background:"#0F172A",border:"1px solid #1E293B",borderRadius:open?"12px 12px 0 0":12,padding:"9px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        <span style={{fontSize:14}}>🗺</span>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:13,fontWeight:700,color:"white",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {viaje.destino}
          </span>
          <span style={{fontSize:12,color:color,marginLeft:8,fontWeight:600}}>{estado}</span>
        </div>
        <span style={{fontSize:11,color:"#475569",flexShrink:0}}>{open?"▲":"▼"}</span>
      </div>
      {/* Panel expandido */}
      {open&&(
        <div style={{background:"#0A0F1A",border:"1px solid #1E293B",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"12px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[
              {l:"Distancia",v:`${viaje.km} km`,c:"#F59E0B"},
              {l:"Llegada estimada",v:formatOperationalEtaLabel(llegada)||"—",c:color},
              {l:"Días en ruta",v:`${nDias} día${nDias>1?"s":""}`,c:"#A78BFA"},
              {l:"Próxima parada",v:kmProx?`~${kmProx} km`:"Sin parada normativa",c:"#64748B"},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:"#1E293B",borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:2}}>{l.toUpperCase()}</div>
                <div style={{fontSize:15,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Plan día a día */}
          {plan.dias&&plan.dias.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:800,color:"#475569",letterSpacing:1,marginBottom:6}}>PLAN POR DÍAS</div>
              {plan.dias.map((d,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid #1E293B"}}>
                  <div style={{background:d.llegada?"#22C55E":"#334155",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:800,color:d.llegada?"white":"#94A3B8",flexShrink:0}}>
                    Día {d.dia}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#F1F5F9"}}>{fmtDur(d.conduccion)} conducción · ~{d.km} km</div>
                    {d.llegada&&<div style={{fontSize:11,color:"#22C55E",marginTop:1}}>🏁 Llegada a {viaje.destino} · {formatOperationalEtaLabel(llegada)||"—"}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {kmProx&&(
            <div style={{background:"#1a1a05",border:"1px solid #F59E0B30",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#F59E0B",marginBottom:10}}>
              ⏱ Próxima parada en ~{kmProx} km · a las {fmtT(new Date(proxParada.start))}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={e=>{e.stopPropagation();onCancel();}}
              style={{background:"transparent",border:"1px solid #334155",borderRadius:8,padding:"7px 14px",fontSize:12,color:"#64748B",cursor:"pointer"}}>
              ✕ Cancelar viaje
            </button>
            <button onClick={e=>{e.stopPropagation();onChangeDestino();}}
              style={{background:"#1E293B",border:"1px solid #F59E0B40",borderRadius:8,padding:"7px 14px",fontSize:12,color:"#F59E0B",cursor:"pointer",fontWeight:600}}>
              🗺 Cambiar destino
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DatosActualesModalCampo({label,sub,children}){
  return(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:16,fontWeight:800,color:"#F1F5F9",marginBottom:3}}>{label}</div>
      <div style={{fontSize:13,color:"#64748B",marginBottom:8,lineHeight:1.4}}>{sub}</div>
      {children}
    </div>
  );
}

function HMInput({lH,sH,lM,sM,maxH=23}){
  const inpHM={background:"#0D1420",border:"1.5px solid #334155",borderRadius:10,padding:"13px 8px",fontSize:22,color:"#F1F5F9",outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center",fontFamily:"monospace",fontWeight:700};
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{flex:1}}>
        <input type="number" inputMode="numeric" min="0" max={maxH} placeholder="0"
          value={lH} onChange={e=>sH(e.target.value)} style={inpHM}/>
        <div style={{fontSize:11,color:"#475569",textAlign:"center",marginTop:3}}>horas</div>
      </div>
      <div style={{fontSize:24,color:"#334155",fontWeight:900,paddingBottom:16}}>:</div>
      <div style={{flex:1}}>
        <input type="number" inputMode="numeric" min="0" max="59" placeholder="0"
          value={lM} onChange={e=>sM(e.target.value)} style={inpHM}/>
        <div style={{fontSize:11,color:"#475569",textAlign:"center",marginTop:3}}>minutos</div>
      </div>
    </div>
  );
}

function DatosActualesModal({onClose,setDb,setManualOffset,showToast}){
  const now=new Date();
  const defHora=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  const[horaH,setHoraH]=useState(String(now.getHours()).padStart(2,"0"));
  const[horaMin,setHoraMin]=useState(String(now.getMinutes()).padStart(2,"0"));
  const[jornadas,setJornadas]=useState("");
  // Campos en horas + minutos
  const[contH,setContH]=useState("");const[contM,setContM]=useState("");
  const[hoyH,setHoyH]=useState("");const[hoyM,setHoyM]=useState("");
  const[semH,setSemH]=useState("");const[semM,setSemM]=useState("");
  const[bisemH,setBisemH]=useState("");const[bisemM,setBisemM]=useState("");
  const[ext,setExt]=useState("");
  const[red,setRed]=useState("");

  const toMin=(h,m)=>(parseInt(h)||0)*60+(parseInt(m)||0);

  function guardar(){
    const contMin=toMin(contH,contM);
    const hoyMin=toMin(hoyH,hoyM);
    const semMin=toMin(semH,semM);
    const prevSemMin=toMin(bisemH,bisemM);
    const bisemTotal=prevSemMin+semMin+hoyMin;
    const jornadasN=parseInt(jornadas)||0;

    const[hh,mm]=[parseInt(horaH)||0, parseInt(horaMin)||0];
    const jornadaStart=new Date(now);
    jornadaStart.setHours(hh,mm,0,0);
    if(jornadaStart>now)jornadaStart.setDate(jornadaStart.getDate()-1);

    const offset={cont:contMin,hoy:hoyMin,sem:semMin,bisem:bisemTotal,ext:parseFloat(ext)||0,red:parseFloat(red)||0,jornadaCount:jornadasN,ts:new Date().toISOString()};
    setManualOffset(offset);

    setDb(p=>{
      const hayJornada=p.entries.some(e=>e.type==="inicio_jornada"&&sameDay(e.ts,now));
      if(hayJornada)return p;
      const ne={id:String(Date.now())+"_j",type:"inicio_jornada",ts:jornadaStart,note:"⚠️ Entrada manual",nota:"⚠️ Entrada manual",location:"",pais:"ES",manual:true};
      return{...p,entries:[...p.entries,ne]};
    });
    onClose();
    showToast("✅ Datos cargados — resumen actualizado");
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:2000,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{background:"#1E293B",borderRadius:"18px 18px 0 0",width:"100%",maxHeight:"92vh",overflowY:"auto",padding:"22px 18px 44px",borderTop:"3px solid #F59E0B"}} onClick={e=>e.stopPropagation()}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
          <div>
            <div style={{fontSize:20,fontWeight:900,color:"#F59E0B"}}>🔄 Empezar con lo que llevo</div>
            <div style={{fontSize:13,color:"#64748B",marginTop:4,lineHeight:1.5}}>Pon 0 si no sabes. La app calcula desde aquí.</div>
          </div>
          <button onClick={onClose} style={{background:"#334155",border:"none",borderRadius:8,padding:"8px 14px",color:"#94A3B8",fontSize:16,cursor:"pointer",fontWeight:700}}>✕</button>
        </div>

        {/* BLOQUE HOY */}
        <div style={{background:"#0D1420",borderRadius:12,padding:"16px 14px",marginBottom:16,border:"1px solid #F59E0B20"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#F59E0B",letterSpacing:1.5,marginBottom:14}}>HOY</div>

          <DatosActualesModalCampo label="¿A qué hora iniciaste la jornada?" sub="Hora de salida · para calcular la ventana disponible">
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1}}>
                <input type="number" inputMode="numeric" min="0" max="23" placeholder={String(now.getHours()).padStart(2,"0")}
                  value={horaH} onChange={e=>setHoraH(e.target.value)}
                  style={{background:"#0D1420",border:"1.5px solid #334155",borderRadius:10,padding:"14px 8px",fontSize:32,color:"#F1F5F9",outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center",fontFamily:"monospace",fontWeight:700}}/>
                <div style={{fontSize:11,color:"#475569",textAlign:"center",marginTop:3}}>hora</div>
              </div>
              <div style={{fontSize:36,color:"#334155",fontWeight:900,paddingBottom:18}}>:</div>
              <div style={{flex:1}}>
                <input type="number" inputMode="numeric" min="0" max="59" placeholder={String(now.getMinutes()).padStart(2,"0")}
                  value={horaMin} onChange={e=>setHoraMin(e.target.value)}
                  style={{background:"#0D1420",border:"1.5px solid #334155",borderRadius:10,padding:"14px 8px",fontSize:32,color:"#F1F5F9",outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center",fontFamily:"monospace",fontWeight:700}}/>
                <div style={{fontSize:11,color:"#475569",textAlign:"center",marginTop:3}}>minutos</div>
              </div>
            </div>
          </DatosActualesModalCampo>

          <DatosActualesModalCampo label="Conducción hoy hasta ahora" sub="Total conducido hoy · máx 10h">
            <HMInput lH={hoyH} sH={setHoyH} lM={hoyM} sM={setHoyM} maxH={10}/>
          </DatosActualesModalCampo>

          <DatosActualesModalCampo label="Conducción continua (desde última pausa)" sub="Desde la última pausa · máx 4h 30min">
            <HMInput lH={contH} sH={setContH} lM={contM} sM={setContM} maxH={4}/>
          </DatosActualesModalCampo>
        </div>

        {/* BLOQUE SEMANA */}
        <div style={{background:"#0D1420",borderRadius:12,padding:"16px 14px",marginBottom:16,border:"1px solid #3B82F620"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#3B82F6",letterSpacing:1.5,marginBottom:14}}>ESTA SEMANA</div>

          <DatosActualesModalCampo label="¿Cuántas jornadas llevas esta semana?" sub="Incluyendo hoy · máx 6">
            <input type="number" inputMode="numeric" min="0" max="6" placeholder="0"
              value={jornadas} onChange={e=>setJornadas(e.target.value)} style={{background:"#0D1420",border:"1.5px solid #334155",borderRadius:10,padding:"13px 8px",fontSize:26,color:"#F1F5F9",outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center",fontFamily:"monospace",fontWeight:700}}/>
          </DatosActualesModalCampo>

          <DatosActualesModalCampo label="Horas conducidas esta semana (sin hoy)" sub="Desde el lunes · máx 56h">
            <HMInput lH={semH} sH={setSemH} lM={semM} sM={setSemM} maxH={56}/>
          </DatosActualesModalCampo>

          <DatosActualesModalCampo label="Jornadas de 10h usadas" sub="Esta semana · máx 2">
            <input type="number" inputMode="numeric" min="0" max="2" placeholder="0"
              value={ext} onChange={e=>setExt(e.target.value)} style={{background:"#0D1420",border:"1.5px solid #334155",borderRadius:10,padding:"13px 8px",fontSize:26,color:"#F1F5F9",outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center",fontFamily:"monospace",fontWeight:700}}/>
          </DatosActualesModalCampo>

          <DatosActualesModalCampo label="Descansos reducidos (9h) usados" sub="Esta semana · máx 3">
            <input type="number" inputMode="numeric" min="0" max="3" placeholder="0"
              value={red} onChange={e=>setRed(e.target.value)} style={{background:"#0D1420",border:"1.5px solid #334155",borderRadius:10,padding:"13px 8px",fontSize:26,color:"#F1F5F9",outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center",fontFamily:"monospace",fontWeight:700}}/>
          </DatosActualesModalCampo>
        </div>

        {/* BLOQUE BISEMANAL */}
        <div style={{background:"#0D1420",borderRadius:12,padding:"16px 14px",marginBottom:16,border:"1px solid #818CF820"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#818CF8",letterSpacing:1.5,marginBottom:14}}>SEMANA ANTERIOR</div>
          <DatosActualesModalCampo label="Horas conducidas la semana pasada" sub="La app suma esta semana automáticamente · máx 56h">
            <HMInput lH={bisemH} sH={setBisemH} lM={bisemM} sM={setBisemM} maxH={56}/>
          </DatosActualesModalCampo>
        </div>

        <div style={{background:"#0F172A",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:13,color:"#64748B",lineHeight:1.7,border:"1px solid #1E293B"}}>
          💡 Si no sabes un dato exacto, deja el 0. La app lo irá calculando desde ahora.
        </div>

        <button onClick={guardar} style={{width:"100%",background:"#22C55E",color:"white",border:"none",borderRadius:14,padding:"20px",fontSize:18,fontWeight:900,cursor:"pointer"}}>
          ✅ CARGAR Y EMPEZAR
        </button>
      </div>
    </div>
  );
}

/** Registro cronológico del día (Resumen); mantiene edición y exportación. */
function RegistroDiaCronologico({
  todayEnts,
  today,
  fmtD,
  norma,
  prof,
  s,
  setTMode,
  setTOff,
  setEditId,
  setModal,
  openEdit,
  deleteEntry,
  exportPDF,
  shareWhatsApp,
  buildTxt,
  doShare,
}) {
  if (!todayEnts?.length) return null;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0 10px", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#64748B", letterSpacing: 1.8 }}>REGISTRO — {fmtD(today)}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => {
              setTMode("offset");
              setTOff(60);
              setEditId(null);
              setModal("entrada");
            }}
            style={{ ...s.shareBtn, background: "#7C3AED", color: "white", border: "none" }}
            title="Añadir entrada manual"
            type="button"
          >
            ➕
          </button>
          <button onClick={() => exportPDF(todayEnts, norma, prof, fmtD(today))} style={{ ...s.shareBtn, background: "#1E293B", color: "white", border: "none" }} type="button">
            📄
          </button>
          <button onClick={() => shareWhatsApp(buildTxt(todayEnts, fmtD(today)))} style={{ ...s.shareBtn, background: "#25D366", color: "white", border: "none" }} type="button">
            📱
          </button>
          <button onClick={() => doShare(buildTxt(todayEnts, fmtD(today)))} style={s.shareBtn} type="button">
            ↗
          </button>
        </div>
      </div>
      <div style={{ background: "white", borderRadius: 13, padding: "12px 14px", marginBottom: 8, boxShadow: "0 2px 6px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(() => {
            const shown = new Set();
            return [...todayEnts]
              .sort((a, b) => new Date(a.ts) - new Date(b.ts))
              .map((e) => {
                if (shown.has(e.id)) return null;
                const T = EV[e.type];
                if (!T) return null;
                if (T.kind === "close") {
                  const inics = todayEnts.filter((x) => x.type === T.pair && new Date(x.ts) < new Date(e.ts) && !shown.has(x.id));
                  const inicio = inics.length ? inics[inics.length - 1] : null;
                  if (inicio) {
                    shown.add(inicio.id);
                    shown.add(e.id);
                    const dur = diffMin(new Date(inicio.ts), new Date(e.ts));
                    const Ti = EV[inicio.type];
                    const isDeleted = inicio.deleted || e.deleted;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #F8FAFC", opacity: isDeleted ? 0.5 : 1 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{Ti?.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isDeleted ? "#94A3B8" : Ti?.color, textDecoration: isDeleted ? "line-through" : "none" }}>{Ti?.label}</span>
                          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8, fontFamily: "monospace" }}>
                            {fmtT(inicio.ts)} → {fmtT(e.ts)}
                          </span>
                          {inicio.note && <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>📝 {inicio.note}</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: isDeleted ? "#94A3B8" : Ti?.color, fontFamily: "monospace", textDecoration: isDeleted ? "line-through" : "none" }}>{fmtDur(dur)}</div>
                          <div style={{ display: "flex", gap: 3, marginTop: 3, justifyContent: "flex-end" }}>
                            <button onClick={() => openEdit(inicio)} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 5, padding: "2px 6px", fontSize: 10, color: "#64748B", cursor: "pointer" }} type="button">
                              ✏️
                            </button>
                            <button
                              onClick={() => {
                                deleteEntry(inicio.id);
                                deleteEntry(e.id);
                              }}
                              style={{ background: isDeleted ? "#F0FDF4" : "#F8FAFC", border: `1px solid ${isDeleted ? "#BBF7D0" : "#E2E8F0"}`, borderRadius: 5, padding: "2px 6px", fontSize: 10, color: isDeleted ? "#16A34A" : "#64748B", cursor: "pointer" }}
                              type="button"
                            >
                              {isDeleted ? "↩" : "🗑"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                }
                if (T.kind === "open" && !shown.has(e.id)) {
                  shown.add(e.id);
                  return <LogCard key={e.id} entry={e} all={todayEnts} onEdit={() => openEdit(e)} onDel={() => deleteEntry(e.id)} />;
                }
                if (!shown.has(e.id)) {
                  shown.add(e.id);
                  return <LogCard key={e.id} entry={e} all={todayEnts} onEdit={() => openEdit(e)} onDel={() => deleteEntry(e.id)} />;
                }
                return null;
              })
              .filter(Boolean);
          })()}
        </div>
      </div>
    </>
  );
}

/** Desglose de límites (antes desplegable en HOY); solo en Resumen. */
function ResumenDetalleTiemposTecnico({ norma }) {
  const C = { soft: "#f8fafc", line: "#e2e8f0", tx: "#0f172a", su: "#64748b", card: "#ffffff" };
  const rCont = norma.rCont ?? norma.canDrive ?? 0;
  const rDay = norma.rDay ?? norma.canDrive ?? 0;
  const semC = norma.weekDrive >= LIM.WEEK * 0.9 ? "#EF4444" : norma.weekDrive >= LIM.WEEK * 0.75 ? "#F97316" : "#22C55E";
  const contC = rCont <= 30 ? "#EF4444" : rCont <= 90 ? "#F97316" : "#22C55E";
  const dayC = rDay <= 60 ? "#EF4444" : rDay <= 120 ? "#F97316" : "#22C55E";
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: "14px 14px 12px", border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.su, letterSpacing: 1, marginBottom: 10 }}>DESGLOSE DE TIEMPOS</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[
          { v: norma.jornadaCount || 0, max: 6, l: "Jornadas", c: (norma.jornadaCount || 0) >= 6 ? "#EF4444" : (norma.jornadaCount || 0) >= 5 ? "#F97316" : "#22C55E" },
          { v: norma.extUsed || 0, max: 2, l: "10h", c: (norma.extUsed || 0) >= 2 ? "#EF4444" : "#F59E0B" },
          { v: norma.redRests || 0, max: 3, l: "9h", c: (norma.redRests || 0) >= 3 ? "#EF4444" : "#22C55E" },
        ].map(({ v, max, l, c }) => (
          <div key={l} style={{ background: C.soft, borderRadius: 8, padding: "8px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "monospace" }}>
              {v}
              <span style={{ fontSize: 10, color: C.su }}>/{max}</span>
            </div>
            <div style={{ fontSize: 9, color: C.su, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      {[
        { l: "Conducción hoy", v: norma.todayDrive || 0, max: norma.maxDay || 540, c: dayC },
        { l: "Conducción continua", v: norma.cont || 0, max: 270, c: contC },
        { l: "Semana", v: norma.weekDrive || 0, max: LIM.WEEK, c: semC },
        { l: "Bisemanal", v: norma.biweekDrive || 0, max: LIM.BIWEEK, c: "#818CF8" },
      ].map(({ l, v, max, c }) => {
        const pct = Math.min(100, Math.round((v / Math.max(1, max)) * 100));
        const cc = pct >= 95 ? "#EF4444" : pct >= 80 ? "#F97316" : c;
        return (
          <div key={l} style={{ background: C.soft, borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.su, fontWeight: 600 }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: cc, fontFamily: "monospace" }}>
                {fmtDur(v)}
                <span style={{ fontSize: 10, color: C.su }}>/{fmtDur(max)}</span>
              </span>
            </div>
            <div style={{ background: "#e2e8f0", borderRadius: 99, height: 4, overflow: "hidden" }}>
              <div style={{ background: cc, width: `${pct}%`, height: "100%", borderRadius: 99, transition: "width .4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Resumen servicio activo para copiloto en pestaña HOY (misma fuente que TabServicio). */
function useCopilotServicio(uid){
  const[servicio,setServicio]=useState(null);
  const[stops,setStops]=useState([]);
  const[evidenciasByStop,setEvidenciasByStop]=useState({});
  const cargar=useCallback(async()=>{
    if(!uid){setServicio(null);setStops([]);setEvidenciasByStop({});return;}
    try{
      const resolved=await resolveDriverActiveServiceAndStops(uid);
      const sv=resolved?.servicio||null;
      const list=Array.isArray(resolved?.stops)?resolved.stops:[];
      if(!sv?.id){setServicio(null);setStops([]);setEvidenciasByStop({});return;}
      setServicio(sv);
      setStops(list);
      const ids=list.map(s=>s.id).filter(Boolean).join(",");
      if(!ids){setEvidenciasByStop({});return;}
      const evr=await sbFetch(`/rest/v1/evidencias?stop_id=in.(${ids})&order=created_at.desc`);
      const evs=await evr.json();
      setEvidenciasByStop(groupDocumentsByStop(Array.isArray(evs)?evs:[]));
    }catch(_){
      setServicio(null);setStops([]);setEvidenciasByStop({});
    }
  },[uid]);
  useEffect(()=>{void cargar();},[cargar]);
  useEffect(()=>{
    function onRecarga(){void cargar();}
    window.addEventListener("cuaderno-recargar-servicio",onRecarga);
    return()=>window.removeEventListener("cuaderno-recargar-servicio",onRecarga);
  },[cargar]);
  return{servicio,stops,evidenciasByStop,recargar:cargar};
}

function copilotStopGroup(tipo){
  const t=String(tipo||"").toLowerCase();
  if(t==="carga")return"carga";
  if(t==="descarga")return"descarga";
  if(t.includes("carga")&&t.includes("descarga"))return"carga_descarga";
  return"otra";
}
function copilotStopLabel(tipo){
  const g=copilotStopGroup(tipo);
  if(g==="carga")return"Carga";
  if(g==="descarga")return"Descarga";
  if(g==="carga_descarga")return"Carga/descarga";
  return"Parada";
}
function copilotPlaceName(stop){
  const n=String(stop?.nombre||"").trim();
  const d=String(stop?.direccion||"").trim();
  if(n)return n;
  if(d)return d;
  return`Parada ${stop?.orden??""}`.trim();
}
function copilotStopDone(stop){
  return!!stop?.hora_salida_real||stop?.estado==="completado";
}

function LiveCard({active,actMins,norma,jState,onAct,matricula,equipoActivo,equipoConductor,clock,lang="es",showToast,activeEntries=[],onOpenServicio}){
  const TE=active?EV[active.type]:null;
  const isDriving=active?.type==="inicio_conduccion";
  const isPausing=active&&["inicio_pausa","inicio_descanso","inicio_descanso_frac","inicio_descanso_semanal","inicio_descanso_semanal_r"].includes(active.type);

  const rCont=norma.rCont??norma.canDrive??0;
  const rDay=norma.rDay??norma.canDrive??0;
  const rWeek=norma.rWeek??0;
  const semC=norma.weekDrive>=(LIM.WEEK*0.9)?"#EF4444":norma.weekDrive>=(LIM.WEEK*0.75)?"#F97316":"#22C55E";
  const contC=rCont<=30?"#EF4444":rCont<=90?"#F97316":"#22C55E";
  const dayC=rDay<=60?"#EF4444":rDay<=120?"#F97316":"#22C55E";
  // Ventana: usa dispInfo que cuenta TODO el tiempo desde la jornada (conducción + disponibilidad + otros)
  // Si no hay dispInfo (sin jornada abierta), muestra el máximo según último descanso
  const ventanaMax=norma.dispInfo?.ventanaMax??norma.ventanaDisp?.ventanaMax??(15*60);
  const ventana=norma.dispInfo?.dispRemain??norma.ventanaDisp?.restante??ventanaMax;
  const ventanaCol=ventana<=60?"#EF4444":ventana<=120?"#F97316":"#22C55E";

  const uidCop = getUserId();
  const { servicio: cpSv, stops: cpStops, evidenciasByStop: cpEvs } = useCopilotServicio(uidCop);
  const sortedCp = [...(cpStops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cpCurrent = sortedCp.length ? getCurrentStop(sortedCp) : null;
  const cpPlan = cpSv ? getOperationalPlanSnapshot(cpSv) : null;
  const cpEta = cpSv ? formatOperationalEtaSnapshotLine(cpSv, new Date()) : null;
  const cpKm = Number.isFinite(Number(cpPlan?.planned_km)) ? Math.round(Number(cpPlan.planned_km)) : null;
  const evsCur = cpCurrent?.id ? cpEvs?.[cpCurrent.id] : null;
  const cmrN = Array.isArray(evsCur) ? evsCur.filter((e) => e?.tipo === "cmr").length : 0;
  const incN = Array.isArray(evsCur) ? evsCur.filter((e) => e?.tipo === "incidencia").length : 0;

  const estadoHumano =
    jState === "none"
      ? "Disponible"
      : jState === "closed"
        ? "Descansando"
        : isDriving
          ? "Conduciendo"
          : isPausing
            ? norma.crType === "inicio_descanso"
              ? "Descansando"
              : "En pausa"
            : "Jornada abierta";

  let normPill = { icon: "✅", text: "Vas bien", bg: "#dcfce7", fg: "#15803d", br: "#bbf7d0" };
  if (jState === "open" && (norma.canDrive <= 0 || (isDriving && rCont <= 0)))
    normPill = { icon: "🔴", text: "Límite próximo", bg: "#fee2e2", fg: "#b91c1c", br: "#fecaca" };
  else if (jState === "open" && isDriving && rCont > 0 && rCont <= 35)
    normPill = { icon: "⚠", text: `Descanso en ${fmtDur(rCont)}`, bg: "#ffedd5", fg: "#c2410c", br: "#fed7aa" };
  else if (jState === "open" && norma.canDrive > 0 && norma.canDrive <= 60 && !isPausing)
    normPill = { icon: "⚠", text: `Para en ${fmtDur(norma.canDrive)}`, bg: "#ffedd5", fg: "#c2410c", br: "#fed7aa" };

  let svcHead = "Sin servicio activo";
  let svcSub = "Aquí verás la siguiente parada y documentos pendientes.";
  let svcCta = "Ir al servicio";
  if (cpSv) {
    const ruta = getFixedServiceRoute(cpSv);
    if (cpSv.estado === "asignado") {
      svcHead = "Servicio asignado";
      svcSub = ruta || "Pendiente de iniciar";
      svcCta = "Iniciar servicio";
    } else if (!getOperationalPlanConfirmedAt(cpSv)) {
      svcHead = "Confirma ruta y destino";
      svcSub = ruta || "Servicio en curso";
      svcCta = "Añadir destino";
    } else if (cpCurrent && !cpCurrent.hora_llegada_real) {
      svcHead = `Próxima parada · ${copilotStopLabel(cpCurrent.tipo)}`;
      svcSub = copilotPlaceName(cpCurrent);
      svcCta = "Confirmar llegada";
    } else if (cpCurrent && !copilotStopDone(cpCurrent)) {
      svcHead = `En operación · ${copilotStopLabel(cpCurrent.tipo)}`;
      svcSub = copilotPlaceName(cpCurrent);
      svcCta = cmrN ? "Subir o revisar CMR" : "Finalizar operación";
    } else {
      svcHead = "Servicio en curso";
      svcSub = ruta || "Sigue el plan en Servicio";
      svcCta = "Ver servicio";
    }
  }

  const openSvc = () => {
    if (typeof onOpenServicio === "function") onOpenServicio();
  };

  let pauseProg = null;
  if (jState === "closed") {
    const lastClose = activeEntries.slice().reverse().find((e) => e.type === "fin_jornada");
    const lastDescansoInicio = activeEntries.slice().reverse().find(
      (e) => e.type === "inicio_descanso" && (!lastClose || toDate(e.ts) >= toDate(lastClose.ts)),
    );
    const descansoStart = lastDescansoInicio?.ts || lastClose?.ts;
    if (descansoStart) {
      const minHecho = Math.max(0, diffMin(toDate(descansoStart), clock));
      const puedeReducir = (norma.redRests || 0) < 3;
      const minNecesario = puedeReducir ? 540 : 660;
      const pct = Math.min(100, Math.round((minHecho / minNecesario) * 100));
      pauseProg = { minHecho, minNecesario, pct, puedeReducir, ok: minHecho >= minNecesario };
    }
  }

  const C = {
    bg: "#f1f5f9",
    card: "#ffffff",
    line: "#e2e8f0",
    tx: "#0f172a",
    su: "#64748b",
    soft: "#f8fafc",
  };

  let proxPausaEtiqueta = "Próxima pausa";
  let proxPausaTexto = "—";
  if (jState === "open") {
    if (isPausing) {
      proxPausaEtiqueta = norma.crType === "inicio_descanso" ? "Descanso en curso" : "Pausa en curso";
      proxPausaTexto = `Llevas ${fmtDur(norma.crDur || 0)}`;
    } else if (isDriving) {
      proxPausaEtiqueta = "Tiempo hasta pausa";
      proxPausaTexto = rCont <= 0 ? "Conviene parar ya" : fmtDur(rCont);
    } else {
      proxPausaEtiqueta = "Próxima pausa";
      proxPausaTexto =
        norma.canDrive > 0 ? `Al conducir, hasta ${fmtDur(norma.canDrive)}` : "Antes de seguir, pausa o descanso";
    }
  }

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "calc(100vh - 124px)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui,sans-serif",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Cabecera copiloto */}
      <div
        style={{
          padding: "14px 16px 12px",
          background: C.card,
          borderBottom: `1px solid ${C.line}`,
          boxShadow: "0 1px 0 rgba(15,23,42,.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.tx, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>
              {fmtT(clock)}
            </div>
            <div style={{ fontSize: 12, color: C.su, marginTop: 4, fontWeight: 600 }}>{estadoHumano}</div>
            {matricula ? (
              <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginTop: 4 }}>{matricula}</div>
            ) : null}
          </div>
          <div style={{ textAlign: "right", minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: normPill.bg,
                color: normPill.fg,
                border: `1px solid ${normPill.br}`,
                borderRadius: 999,
                padding: "6px 11px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span>{normPill.icon}</span>
              <span>{normPill.text}</span>
            </div>
            {jState === "open" ? (
              <div style={{ fontSize: 11, color: C.su, marginTop: 8, fontWeight: 600 }}>
                Ventana · <span style={{ color: ventanaCol, fontWeight: 800 }}>{fmtDur(ventana)}</span> / {fmtDur(ventanaMax)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {jState === "open" &&
          (() => {
            const lastClose = activeEntries.slice().reverse().find((e) => e.type === "fin_jornada");
            const lastOpen = activeEntries.slice().reverse().find((e) => e.type === "inicio_jornada");
            if (!lastClose || !lastOpen) return null;
            if (toDate(lastOpen.ts) <= toDate(lastClose.ts)) return null;
            const minDesc = diffMin(toDate(lastClose.ts), toDate(lastOpen.ts));
            if (minDesc >= 9 * 60) return null;
            const minFaltan = Math.round(9 * 60 - minDesc);
            return (
              <div
                style={{
                  background: "#fef2f2",
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: "1px solid #fecaca",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: "#b91c1c" }}>⚠️ Descanso insuficiente</div>
                <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4, lineHeight: 1.45 }}>
                  Descansaste {fmtDur(minDesc)} — necesitas al menos 9h. Faltan {fmtDur(minFaltan)}.
                </div>
              </div>
            );
          })()}

        {norma.canDrive <= 0 && jState === "open" && (
          <div
            style={{
              background: "#fef2f2",
              borderRadius: 14,
              padding: "12px 14px",
              border: "1px solid #fecaca",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 22 }}>🚨</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#b91c1c" }}>Para ahora</div>
              <div style={{ fontSize: 12, color: "#991b1b" }}>Límite de conducción alcanzado</div>
            </div>
          </div>
        )}

        {isDriving && rCont > 0 && rCont <= 30 && norma.canDrive > 0 && (
          <div
            style={{
              background: "#fff7ed",
              borderRadius: 14,
              padding: "11px 14px",
              border: "1px solid #fed7aa",
              fontSize: 13,
              fontWeight: 700,
              color: "#9a3412",
            }}
          >
            ⏰ Para en {fmtDur(rCont)} — busca área
          </div>
        )}

        {/* Tiempo disponible — prioridad alta */}
        <div
          style={{
            background: C.card,
            borderRadius: 16,
            padding: "16px 16px 15px",
            border: `1px solid ${C.line}`,
            boxShadow: "0 6px 24px rgba(15,23,42,.07)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.8, marginBottom: 12 }}>TIEMPO DISPONIBLE</div>
          {jState === "open" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: C.su, fontWeight: 650 }}>Jornada disponible</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: dayC, fontVariantNumeric: "tabular-nums", marginTop: 4, letterSpacing: -0.3 }}>{fmtDur(rDay)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.su, fontWeight: 650 }}>Conducción restante</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: contC, fontVariantNumeric: "tabular-nums", marginTop: 4, letterSpacing: -0.3 }}>{fmtDur(rCont)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.su, fontWeight: 650 }}>Jornada hoy</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: dayC, fontVariantNumeric: "tabular-nums", marginTop: 4, letterSpacing: -0.3 }}>{fmtDur(norma.todayDrive || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.su, fontWeight: 650 }}>{proxPausaEtiqueta}</div>
                <div style={{ fontSize: 15, fontWeight: 750, color: C.tx, marginTop: 4, lineHeight: 1.35 }}>{proxPausaTexto}</div>
              </div>
            </div>
          ) : jState === "closed" && pauseProg ? (
            <div>
              <div style={{ fontSize: 13, color: C.su, fontWeight: 650, marginBottom: 8 }}>Descanso entre jornadas</div>
              <div style={{ height: 8, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${pauseProg.pct}%`, height: "100%", background: pauseProg.ok ? "#22c55e" : "#818cf8", borderRadius: 99, transition: "width .4s" }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginTop: 10 }}>
                {pauseProg.ok ? "✓ Mínimo cumplido" : `${fmtDur(pauseProg.minHecho)} de ${fmtDur(pauseProg.minNecesario)}`}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: C.su, fontWeight: 650 }}>Inicia jornada para ver cuánto puedes conducir.</div>
          )}
        </div>

        {jState === "open" && active && TE ? (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: TE.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: TE.color }}>{TE.label}</div>
              <div style={{ fontSize: 11, color: C.su, marginTop: 2 }}>desde {fmtT(toDate(active.ts))}</div>
            </div>
          </div>
        ) : null}

        {/* Acciones jornada y conducción — justo después del tiempo */}
        <div style={{ padding: "2px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {jState === "none" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => {
                  playClick();
                  onAct("inicio_jornada");
                }}
                style={{
                  width: "100%",
                  background: "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: 14,
                  padding: "16px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Comenzar jornada
              </button>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onAct("__datos_actuales__");
                }}
                style={{
                  width: "100%",
                  background: C.card,
                  color: C.tx,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                Iniciar jornada con horas
              </button>
            </div>
          )}
          {jState === "closed" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    onAct("inicio_jornada");
                  }}
                  style={{ background: "#16a34a", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                >
                  Nueva jornada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    onAct("continuar_jornada");
                  }}
                  style={{ background: C.card, color: C.su, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Continuar
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onAct("__datos_actuales__");
                }}
                style={{
                  width: "100%",
                  background: C.card,
                  color: C.tx,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                Iniciar jornada con horas
              </button>
            </div>
          )}
          {jState === "open" && !active && (
            <button
              type="button"
              onClick={() => {
                playClick();
                onAct("__accion__");
              }}
              style={{
                width: "100%",
                background: "#f59e0b",
                color: "#0f172a",
                border: "none",
                borderRadius: 14,
                padding: "16px",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Siguiente paso
            </button>
          )}
          {jState === "open" && active && (
            <button
              type="button"
              onClick={() => {
                playClick();
                if (isDriving) onAct("__parar__");
                else onAct("__fin_silencioso__");
              }}
              style={{
                width: "100%",
                background: isDriving ? "#dc2626" : TE?.color || "#64748b",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "15px",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {isDriving ? "Parar conducción" : `Fin de ${TE?.label || "actividad"}`}
            </button>
          )}
        </div>

        {/* Contexto operativo — después de las acciones, tono secundario */}
        <div
          style={{
            background: C.soft,
            borderRadius: 14,
            padding: "12px 14px",
            border: `1px solid ${C.line}`,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: 1, marginBottom: 6 }}>CONTEXTO OPERATIVO</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, lineHeight: 1.28 }}>{svcHead}</div>
          <div style={{ fontSize: 13, color: C.su, marginTop: 5, fontWeight: 600, lineHeight: 1.4 }}>{svcSub}</div>
          {cpEta || cpKm != null ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 8, fontSize: 12, color: C.tx, fontWeight: 700 }}>
              {cpEta ? (
                <span>
                  ⏱ ETA <span style={{ fontVariantNumeric: "tabular-nums" }}>{cpEta}</span>
                </span>
              ) : null}
              {cpKm != null ? (
                <span>
                  🚛 {cpKm} km
                </span>
              ) : null}
            </div>
          ) : null}
          {(cmrN === 0 && cpCurrent && cpCurrent.hora_llegada_real && !copilotStopDone(cpCurrent)) || incN > 0 ? (
            <div style={{ fontSize: 11, color: incN > 0 ? "#c2410c" : C.su, marginTop: 8, fontWeight: 650 }}>
              {incN > 0 ? `⚠ ${incN} incidencia(s)` : "📦 Documento pendiente: CMR"}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              playClick();
              openSvc();
            }}
            style={{
              marginTop: 10,
              minHeight: 44,
              maxWidth: "100%",
              padding: "9px 14px",
              background: "transparent",
              color: C.su,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            {svcCta} →
          </button>
        </div>

        {jState === "open" && (
          <button
            type="button"
            onClick={() => onAct("__inspeccion__")}
            style={{
              width: "100%",
              background: "transparent",
              border: `1px dashed ${C.line}`,
              borderRadius: 10,
              padding: "8px",
              cursor: "pointer",
              color: C.su,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            👁 Inspección
          </button>
        )}
      </div>
    </div>
  );
}

// Celda normativa auxiliar
function NormaCell({l,v,max,c,full}){
  const pct=Math.min(100,Math.round((v/Math.max(1,max))*100));
  const col=pct>=95?"#EF4444":pct>=80?"#F97316":pct>=60?"#F59E0B":c;
  return(
    <div style={{background:"#1E293B",borderRadius:9,padding:"9px 10px",gridColumn:full?"1/-1":"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:11,color:"#64748B",fontWeight:600}}>{l}</span>
        <span style={{fontSize:14,fontWeight:800,color:col,fontFamily:"monospace"}}>{fmtDur(v)}<span style={{fontSize:10,color:"#334155",fontWeight:400}}>/{fmtDur(max)}</span></span>
      </div>
      <div style={{background:"#0F172A",borderRadius:3,height:5,overflow:"hidden"}}>
        <div style={{background:col,width:`${pct}%`,height:"100%",borderRadius:3,transition:"width .4s"}}/>
      </div>
    </div>
  );
}

function Alerts({alerts}){
  if(!alerts?.length)return null;
  const C={CRITICO:{bg:"#FEF2F2",br:"#FECACA",tx:"#DC2626"},PELIGRO:{bg:"#FFF7ED",br:"#FED7AA",tx:"#C2410C"},AVISO:{bg:"#FEFCE8",br:"#FEF08A",tx:"#A16207"},INFO:{bg:"#F0F9FF",br:"#BAE6FD",tx:"#0369A1"}};
  return <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>{alerts.map((a,i)=>{const c=C[a.level]||C.INFO;return <div key={i} style={{background:c.bg,border:`1.5px solid ${c.br}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{a.icon}</span><span style={{fontSize:14,fontWeight:700,color:c.tx}}>{a.msg}</span></div>;})}</div>;
}

function DayTL({tl}){
  if(!tl?.segs?.length)return(
    <div style={{background:"white",borderRadius:13,padding:"13px 14px",marginBottom:13,boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
      <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.2,marginBottom:8}}>LÍNEA DE TIEMPO</div>
      <div style={{background:"#F1F5F9",borderRadius:8,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:13,color:"#94A3B8"}}>Sin registros hoy</span></div>
    </div>
  );
  const{segs,start,end}=tl;const totalMs=Math.max(1,end-start);
  const hours=[];const s0=new Date(start);s0.setMinutes(0,0,0);
  for(let t=new Date(s0);t<=end;t=new Date(+t+3600000))hours.push(new Date(t));
  return(
    <div style={{background:"white",borderRadius:13,padding:"13px 14px",marginBottom:13,boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:800,color:"#334155",letterSpacing:.5}}>LÍNEA DE TIEMPO</span>
        <span style={{fontSize:12,color:"#64748B",fontFamily:"'JetBrains Mono',monospace"}}>{fmtT(start)} → {fmtT(end)}</span>
      </div>
      {/* Barra principal más alta */}
      <div style={{position:"relative",height:40,borderRadius:10,overflow:"hidden",background:"#F1F5F9",display:"flex",marginBottom:6}}>
        {segs.map((seg,i)=>{const T=EV[seg.type];const w=Math.max(0.3,seg.pct);return(
          <div key={i} title={`${T?.label||seg.type}: ${fmtT(seg.from)} → ${fmtT(seg.to)}`}
            style={{height:"100%",width:`${w}%`,background:T?.color||"#94A3B8",opacity:.9,position:"relative",transition:"width .3s"}}>
            {w>10&&<span style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:16,lineHeight:1}}>{T?.icon}</span>}
          </div>
        );})}
        <div style={{position:"absolute",right:2,top:2,bottom:2,width:3,background:"white",borderRadius:2,opacity:.7}}/>
      </div>
      {/* Eje de horas más legible */}
      <div style={{position:"relative",height:18,marginBottom:8}}>
        {hours.map((h,i)=>{const lp=((h-start)/totalMs)*100;if(lp<0||lp>102)return null;return(
          <div key={i} style={{position:"absolute",left:`${lp}%`,transform:"translateX(-50%)",fontSize:11,color:"#64748B",fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{fmtT(h)}</div>
        );})}
      </div>
      {/* Leyenda con nombres */}
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {[...new Set(segs.map(s=>s.type))].map(type=>{const T=EV[type];return(
          <div key={type} style={{display:"flex",alignItems:"center",gap:5,background:T?.color+"15",borderRadius:6,padding:"3px 8px"}}>
            <div style={{width:10,height:10,borderRadius:2,background:T?.color||"#94A3B8",flexShrink:0}}/>
            <span style={{fontSize:12,color:T?.color||"#64748B",fontWeight:600}}>{T?.label||type}</span>
          </div>
        );})}
      </div>
    </div>
  );
}

function RoutePlanner({norma}){
  const[open,setOpen]=useState(false);const[orig,setOrig]=useState("");const[dest,setDest]=useState("");
  const[startDT,setStartDT]=useState(()=>toDTL(new Date()));const[split,setSplit]=useState(false);
  const[loading,setLoading]=useState(false);const[plan,setPlan]=useState(null);const[err,setErr]=useState("");
  const[mapD,setMapD]=useState(null);
  const[osmParkings,setOsmParkings]=useState([]);

  async function buscarParkingsEnRuta(coords,routeKm){
    if(!coords?.length)return[];
    // Calcular bounding box de toda la ruta con margen de 0.3 grados
    const lats=coords.map(c=>c[1]),lons=coords.map(c=>c[0]);
    const minLat=Math.min(...lats)-0.3,maxLat=Math.max(...lats)+0.3;
    const minLon=Math.min(...lons)-0.3,maxLon=Math.max(...lons)+0.3;
    const bbox=`${minLat},${minLon},${maxLat},${maxLon}`;
    try{
      const q=`[out:json][timeout:15];(
        node["amenity"="truck_stop"](${bbox});
        node["highway"="rest_area"](${bbox});
        node["amenity"="parking"]["hgv"="yes"](${bbox});
        way["amenity"="parking"]["hgv"="yes"](${bbox});
      );out center 50;`;
      const r=await fetch(`https://overpass-api.de/api/interpreter`,{
        method:"POST",
        body:`data=${encodeURIComponent(q)}`
      });
      if(!r.ok)return[];
      const d=await r.json();
      const parkings=(d.elements||[]).map(n=>({
        id:n.id,
        lat:n.lat||n.center?.lat,
        lon:n.lon||n.center?.lon,
        name:n.tags?.name||n.tags?.["name:es"]||"Área de descanso",
        type:n.tags?.amenity||n.tags?.highway||"parking",
        services:{
          shower:n.tags?.shower==="yes",
          restaurant:!!(n.tags?.restaurant),
          fuel:n.tags?.fuel==="yes"||n.tags?.["fuel:diesel"]==="yes"
        }
      })).filter(p=>p.lat&&p.lon);
      setOsmParkings(parkings);
      return parkings;
    }catch(e){
      console.warn("Overpass error:",e);
      return[];
    }
  }

  async function calc(){
    if(!orig.trim()||!dest.trim()){setErr("Introduce origen y destino");return;}
    setErr("");setLoading(true);setPlan(null);setMapD(null);setOsmParkings([]);
    try{
      const[from,to]=await Promise.all([geocode(orig.trim()),geocode(dest.trim())]);
      const route=await getRoute(from,to);
      const dMins=Math.round(route.km/80*60);
      const result=buildPlan(dMins,norma,{splitBreak:split,start:new Date(startDT)});
      const stops=[];
      for(const seg of result.segs.filter(s=>s.type!=="conduccion")){
        const frac=Math.min(seg.km/route.km,0.999);const idx=Math.floor(frac*(route.coords.length-1));const c=route.coords[idx];
        const cn=await revGeo(c[1],c[0]);stops.push({...seg,lat:c[1],lon:c[0],city:cn,kmOrig:Math.round(frac*route.km)});
      }
      setPlan({...result,stops,from,to,route,dMins});
      setMapD({from,to,coords:route.coords,stops,parkings:[]});
      // Buscar parkings en segundo plano
      buscarParkingsEnRuta(route.coords,route.km).then(parkings=>{
        setMapD(prev=>prev?{...prev,parkings}:null);
      });
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  return(
    <div style={{background:"white",borderRadius:13,overflow:"hidden",boxShadow:"0 2px 6px rgba(0,0,0,.05)",border:"1.5px solid #E2E8F0",marginBottom:9}}>
      <div style={{padding:"11px 13px",display:"flex",alignItems:"center",cursor:"pointer",background:"linear-gradient(135deg,#1E293B,#0F172A)"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:800,color:"#F59E0B"}}>🗺 PLANIFICADOR DE RUTA</div><div style={{fontSize:10,color:"#64748B",marginTop:1}}>Todas las paradas · 80 km/h</div></div>
        <span style={{fontSize:16,color:"#F59E0B"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{padding:"13px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
          <div><label style={s.fLbl}>🟢 Origen</label><input value={orig} onChange={e=>setOrig(e.target.value)} onKeyDown={e=>e.key==="Enter"&&calc()} placeholder="Madrid…" style={s.tIn}/></div>
          <div><label style={s.fLbl}>🔴 Destino</label><input value={dest} onChange={e=>setDest(e.target.value)} onKeyDown={e=>e.key==="Enter"&&calc()} placeholder="Hamburgo…" style={s.tIn}/></div>
        </div>
        <label style={s.fLbl}>📅 Salida</label>
        <input type="datetime-local" value={startDT} onChange={e=>setStartDT(e.target.value)} style={{...s.tIn,marginBottom:9}}/>
        <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",marginBottom:11,fontSize:12,color:"#334155",fontWeight:600}}>
          <input type="checkbox" checked={split} onChange={e=>setSplit(e.target.checked)} style={{width:15,height:15,accentColor:"#6366F1"}}/>Pausa fraccionada (15+30 min)
        </label>
        {err&&<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:8,padding:"7px 11px",fontSize:12,color:"#EF4444",marginBottom:9}}>{err}</div>}
        <button onClick={calc} disabled={loading} style={{...s.confBtn,background:loading?"#94A3B8":"#F59E0B",cursor:"pointer",marginTop:0,fontSize:13}}>
          {loading?"⏳ Calculando…":"📍 CALCULAR ITINERARIO"}
        </button>
        {plan&&<div style={{marginTop:13}}>
          <div style={{background:"#1E293B",borderRadius:11,padding:"13px",marginBottom:11}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:7,marginBottom:9}}>
              {[
                {l:"DISTANCIA",v:`${plan.route.km} km`},
                {l:"PARADAS",v:`${plan.stops.length}`},
                {l:"PARKINGS",v:`${osmParkings.length}`},
                {l:"LLEGADA",v:fmtT(plan.arrival)}
              ].map(({l,v})=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:13,fontWeight:800,color:"#F59E0B",fontFamily:"monospace"}}>{v}</div><div style={{fontSize:8,color:"#94A3B8",fontWeight:700,marginTop:1}}>{l}</div></div>)}
            </div>
            <div style={{fontSize:11,color:"#64748B"}}>🚛 {fmtDur(plan.driveMins)} · ⏸ {fmtDur(plan.restMins)} · ⏱ Total {fmtDur(plan.driveMins+plan.restMins)}</div>
            {osmParkings.length>0&&<div style={{fontSize:11,color:"#06B6D4",marginTop:4}}>🅿️ {osmParkings.length} parkings para camiones encontrados en la ruta</div>}
            {!plan.route.real&&<div style={{fontSize:10,color:"#94A3B8",marginTop:4}}>⚠️ Distancia estimada (sin conexión al enrutador)</div>}
          </div>
          <div style={{fontSize:9,fontWeight:800,color:"#64748B",letterSpacing:1.8,marginBottom:7}}>ITINERARIO</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{display:"flex",gap:9,alignItems:"center",padding:"7px 9px",background:"#F0FDF4",borderRadius:8,border:"1.5px solid #BBF7D0"}}>
              <span style={{fontSize:17}}>🟢</span>
              <div><div style={{fontSize:12,fontWeight:700,color:"#166534"}}>{plan.from.name}</div><div style={{fontSize:10,color:"#64748B"}}>{fmtT(new Date(startDT))} · Inicio</div></div>
            </div>
            {plan.segs.map((seg,i)=>{const isDrive=seg.type==="conduccion";const ic=plan.PMAP[seg.type]||"⏱";const lbl=plan.PLBL[seg.type]||seg.type;const cl=plan.PCOL[seg.type]||"#64748B";const st=plan.stops.find(x=>x.start.getTime()===seg.start.getTime());const endT=new Date(+seg.start+seg.dur*60000);return(
              <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start",padding:"9px",background:isDrive?"#F8FAFC":"#1E293B",borderRadius:9,border:`1.5px solid ${isDrive?"#E2E8F0":cl+"40"}`,borderLeft:`4px solid ${cl}`}}>
                <span style={{fontSize:16,marginTop:1}}>{ic}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:3}}>
                    <span style={{fontSize:12,fontWeight:700,color:isDrive?"#334155":cl}}>{lbl}</span>
                    <span style={{fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:isDrive?"#64748B":cl,flexShrink:0}}>{fmtDur(seg.dur)}</span>
                  </div>
                  <div style={{fontSize:10,color:"#94A3B8",marginTop:1}}>{fmtT(seg.start)} → {fmtT(endT)}</div>
                  {!isDrive&&st&&<div style={{fontSize:11,fontWeight:600,color:cl,marginTop:2}}>📍 {st.city} · {st.kmOrig} km</div>}
                </div>
              </div>
            );})}
            <div style={{display:"flex",gap:9,alignItems:"center",padding:"7px 9px",background:"#FEF2F2",borderRadius:8,border:"1.5px solid #FECACA"}}>
              <span style={{fontSize:17}}>🏁</span>
              <div><div style={{fontSize:12,fontWeight:700,color:"#DC2626"}}>{plan.to.name}</div><div style={{fontSize:10,color:"#64748B"}}>{fmtFull(plan.arrival)} · Llegada est.</div></div>
            </div>
          </div>
          {mapD&&<div style={{marginTop:11,borderRadius:9,overflow:"hidden"}}><PlanMap from={mapD.from} to={mapD.to} coords={mapD.coords} stops={mapD.stops} parkings={mapD.parkings||[]} PCOL={plan.PCOL} PMAP={plan.PMAP} PLBL={plan.PLBL}/></div>}
        </div>}
      </div>}
    </div>
  );
}

function PlanMap({from,to,coords,stops,parkings=[],PCOL,PMAP,PLBL}){
  const divRef=useRef(null),mapRef=useRef(null),keyRef=useRef("");
  useEffect(()=>{
    const key=`${from?.lat?.toFixed(3)}|${to?.lat?.toFixed(3)}|${coords?.length}|${stops?.length}|${parkings?.length}`;
    if(key===keyRef.current&&mapRef.current)return;keyRef.current=key;
    function init(){
      const L=window.L;if(!L||!divRef.current)return;
      if(mapRef.current){mapRef.current.remove();mapRef.current=null;}
      const map=L.map(divRef.current,{zoomControl:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OSM"}).addTo(map);
      mapRef.current=map;
      const dot=(c,sz=13)=>L.divIcon({html:`<div style="background:${c};width:${sz}px;height:${sz}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,className:"",iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]});
      const parkIcon=(sz=14)=>L.divIcon({html:`<div style="background:#06B6D4;width:${sz}px;height:${sz}px;border-radius:3px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:bold">P</div>`,className:"",iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]});
      const bounds=[];
      if(coords?.length){const lls=coords.map(([lo,la])=>[la,lo]);L.polyline(lls,{color:"#F59E0B",weight:4,opacity:.85}).addTo(map);bounds.push(...lls);}
      if(from){L.marker([from.lat,from.lon],{icon:dot("#22C55E",15)}).addTo(map).bindPopup(`<b>🟢 ${from.name}</b>`);bounds.push([from.lat,from.lon]);}
      if(to){L.marker([to.lat,to.lon],{icon:dot("#EF4444",15)}).addTo(map).bindPopup(`<b>🔴 ${to.name}</b>`);bounds.push([to.lat,to.lon]);}
      // Paradas normativas
      stops?.forEach(st=>{if(!st.lat)return;const c=PCOL?.[st.type]||"#6366F1";L.marker([st.lat,st.lon],{icon:dot(c,12)}).addTo(map).bindPopup(`<b>${PMAP?.[st.type]||"⏸"} ${PLBL?.[st.type]||st.type}</b><br>📍 ${st.city}<br>🕐 ${fmtT(st.start)}<br>📏 ${st.kmOrig} km`);bounds.push([st.lat,st.lon]);});
      // Parkings OSM
      parkings?.forEach(p=>{
        L.marker([p.lat,p.lon],{icon:parkIcon()}).addTo(map)
          .bindPopup(`<b>🅿️ ${p.name}</b><br><span style="font-size:11px;color:#64748B">${p.type==="truck_stop"?"Área camiones":p.type==="rest_area"?"Área descanso":"Parking HGV"}</span>${p.services?.shower?"<br>🚿 Duchas":""}${p.services?.restaurant?"<br>🍽️ Restaurante":""}`);
      });
      if(bounds.length>1)try{map.fitBounds(bounds,{padding:[24,24]});}catch(_){}
    }
    if(!document.getElementById("lf-css")){const c=document.createElement("link");c.id="lf-css";c.rel="stylesheet";c.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(c);}
    if(window.L){init();return;}if(!document.getElementById("lf-js")){const sc=document.createElement("script");sc.id="lf-js";sc.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";sc.onload=init;document.head.appendChild(sc);}
    return()=>{if(mapRef.current){mapRef.current.remove();mapRef.current=null;}};
  },[from?.lat,to?.lat,coords?.length,stops?.length,parkings?.length]);
  return(
    <div>
      <div ref={divRef} style={{height:280,background:"#dde8f0"}}/>
      {parkings?.length>0&&(
        <div style={{background:"#F0F9FF",border:"1px solid #BAE6FD",borderRadius:"0 0 9px 9px",padding:"7px 11px",fontSize:11,color:"#0369A1"}}>
          🅿️ <strong>{parkings.length} parkings</strong> para camiones en la ruta · Azul = OSM · Pulsa para info
        </div>
      )}
    </div>
  );
}

function StopCard({norma,oTxt,onO,dTxt,onD,onCalc,loading,result,err}){
  const[open,setOpen]=useState(false);const kmL=Math.round(norma.canDrive*80/60);
  return(
    <div style={{background:"white",borderRadius:13,overflow:"hidden",boxShadow:"0 2px 6px rgba(0,0,0,.05)",border:"1.5px solid #E2E8F0",marginBottom:9}}>
      <div style={{padding:"11px 13px",display:"flex",alignItems:"center",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:800,color:"#0F172A"}}>📍 ¿DÓNDE PARARÉ?</div><div style={{fontSize:10,color:"#64748B",marginTop:1}}>{fmtDur(norma.canDrive)} disponible · ~{kmL} km</div></div>
        <span style={{fontSize:16,color:"#F59E0B"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{padding:"0 13px 13px"}}>
        <label style={s.fLbl}>📍 ¿Dónde estás?</label><input value={oTxt} onChange={e=>onO(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onCalc()} placeholder="Ciudad, autopista…" style={s.tIn}/>
        <label style={{...s.fLbl,marginTop:9}}>🏁 ¿A dónde vas? <span style={{fontWeight:400,color:"#94A3B8",fontSize:9}}>(para mapa)</span></label>
        <input value={dTxt} onChange={e=>onD(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onCalc()} placeholder="Destino…" style={s.tIn}/>
        {err&&<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:8,padding:"7px 11px",fontSize:12,color:"#EF4444",marginTop:7}}>{err}</div>}
        <button onClick={onCalc} disabled={loading} style={{...s.confBtn,background:loading?"#94A3B8":"#F59E0B",cursor:"pointer",marginTop:9,fontSize:13}}>{loading?"⏳ Calculando…":"🗺 CALCULAR PARADA"}</button>
        {result&&<div style={{marginTop:11}}>
          {result.reach?<div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:9,padding:"9px 11px",fontSize:12,color:"#166534",lineHeight:1.5}}>✅ <strong>Llegas a {result.dest?.name}</strong> sin pausa obligatoria.<br/><span style={{fontSize:10}}>Ruta: {result.routeKm} km · Disponible: {kmL} km</span></div>
          :<div style={{background:"#1E293B",borderRadius:11,padding:"13px"}}>
            <div style={{fontSize:9,color:"#94A3B8",fontWeight:700,letterSpacing:.8,marginBottom:3}}>PARADA ESTIMADA</div>
            <div style={{fontSize:16,fontWeight:800,color:"#F59E0B",marginBottom:9}}>{result.stopName||`~${result.distKm} km`}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {[{l:"TIEMPO REST.",v:fmtDur(result.remainMins)},{l:"DISTANCIA",v:`~${result.distKm} km`}].map(({l,v})=><div key={l} style={{background:"rgba(255,255,255,.06)",borderRadius:7,padding:"9px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:"#F59E0B",fontFamily:"'JetBrains Mono',monospace"}}>{v}</div><div style={{fontSize:8,color:"#94A3B8",fontWeight:700,marginTop:1}}>{l}</div></div>)}
            </div>
          </div>}
          {result.routeCoords&&result.stopPt&&<div style={{marginTop:9,borderRadius:8,overflow:"hidden"}}><StopMap origin={result.origin} stop={{...result.stopPt,name:result.stopName}} routeCoords={result.routeCoords} targetKm={result.reach?result.routeKm:result.distKm}/></div>}
        </div>}
      </div>}
    </div>
  );
}

function StopMap({origin,stop,routeCoords,targetKm}){
  const divRef=useRef(null),mapRef=useRef(null),keyRef=useRef("");
  useEffect(()=>{
    const key=`${origin?.lat?.toFixed(3)}|${stop?.lat?.toFixed(3)}|${routeCoords?.length}|${targetKm}`;
    if(key===keyRef.current&&mapRef.current)return;keyRef.current=key;
    function init(){const L=window.L;if(!L||!divRef.current)return;if(mapRef.current){mapRef.current.remove();mapRef.current=null;}const map=L.map(divRef.current,{zoomControl:true});L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OSM"}).addTo(map);mapRef.current=map;const dot=(c,sz=13)=>L.divIcon({html:`<div style="background:${c};width:${sz}px;height:${sz}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,className:"",iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]});const bounds=[];if(routeCoords?.length){let acc=0;const trim=[];for(let i=0;i<routeCoords.length;i++){trim.push(routeCoords[i]);if(i>0){const[lo1,la1]=routeCoords[i-1],[lo2,la2]=routeCoords[i];acc+=haverDist(la1,lo1,la2,lo2);if(acc>=targetKm)break;}}const lls=trim.map(([lo,la])=>[la,lo]);L.polyline(lls,{color:"#F59E0B",weight:4,opacity:.9}).addTo(map);bounds.push(...lls);}if(origin){L.marker([origin.lat,origin.lon],{icon:dot("#22C55E",15)}).addTo(map).bindPopup(`<b>🟢 ${origin.name}</b>`);bounds.push([origin.lat,origin.lon]);}if(stop){L.marker([stop.lat,stop.lon],{icon:dot("#F59E0B",17)}).addTo(map).bindPopup(`<b>⏸ ${stop.name}</b>`).openPopup();bounds.push([stop.lat,stop.lon]);}if(bounds.length>1)try{map.fitBounds(bounds,{padding:[24,24]});}catch(_){}}
    if(!document.getElementById("lf-css")){const c=document.createElement("link");c.id="lf-css";c.rel="stylesheet";c.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(c);}
    if(window.L){init();return;}if(!document.getElementById("lf-js")){const sc=document.createElement("script");sc.id="lf-js";sc.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";sc.onload=init;document.head.appendChild(sc);}
    return()=>{if(mapRef.current){mapRef.current.remove();mapRef.current=null;}};
  },[origin?.lat,origin?.lon,stop?.lat,stop?.lon,routeCoords?.length,targetKm]);
  return <div ref={divRef} style={{height:200,background:"#dde8f0"}}/>;
}

const CAT_C={conduccion:"#F59E0B",pausa:"#6366F1",descanso:"#7C3AED",disponibilidad:"#06B6D4",otros:"#F97316"};
const CAT_L={conduccion:"Conducción",pausa:"Pausa",descanso:"Descanso",disponibilidad:"Disponible",otros:"Otros"};

function ResumenView({db,norma,prof,clock}){
  const today=new Date();
  const mon=getMon(today);
  const prevMon=new Date(+mon-7*24*3600*1000);
  const days7=Array.from({length:7},(_,i)=>new Date(+mon+i*24*3600*1000));

  // Semana anterior — para desglose visual solamente
  const prevWeekEnts=db.entries.filter(e=>toDate(e.ts)>=prevMon&&toDate(e.ts)<mon);
  const prevNorma=calcNorma(prevWeekEnts,new Date(+mon-1));
  // Si hay offset bisemanal, la semana anterior = biweekDrive - weekDrive
  const prevDrive=norma.biweekDrive>norma.weekDrive
    ? norma.biweekDrive - norma.weekDrive
    : prevNorma.weekDrive||0;

  // Bisemanal — usar norma.biweekDrive que ya incluye el offset manual
  const biTotal=norma.biweekDrive||((norma.weekDrive||0)+prevDrive);
  const biRestante=Math.max(0,LIM.BIWEEK-biTotal);
  const biPct=Math.min(100,Math.round(biTotal/LIM.BIWEEK*100));

  // Semana
  const semDrive=norma.weekDrive||0;
  const semRestante=Math.max(0,LIM.WEEK-semDrive);
  const semPct=Math.min(100,Math.round(semDrive/LIM.WEEK*100));

  // Colores semafórico
  function semCol(v,warn,danger){return v>=danger?"#EF4444":v>=warn?"#F59E0B":"#22C55E";}
  const cSem=semCol(semDrive,45*60,52*60);
  const cBi=semCol(biTotal,LIM.BIWEEK*0.8,LIM.BIWEEK*0.92);

  // Compensaciones — descansos semanales reducidos fuera de España
  const compensaciones=(norma.debts||[]).map(d=>{
    const diasRestantes=Math.max(0,Math.round((toDate(d.dueBy)-today)/(24*3600*1000)));
    const urgente=diasRestantes<=3;
    return{pendMin:d.debtMin,dueBy:d.dueBy,diasRestantes,urgente};
  });

  // Barra de progreso
  function Barra({pct,col}){
    return(
      <div style={{background:"#0D1420",borderRadius:6,height:8,overflow:"hidden",marginTop:10}}>
        <div style={{background:col,width:pct+"%",height:"100%",borderRadius:6,transition:"width .6s ease"}}/>
      </div>
    );
  }

  // Bloque principal reutilizable
  function Bloque({titulo,col,children}){
    return(
      <div style={{background:"#0D1420",borderRadius:18,padding:"24px 20px",marginBottom:16,border:"1px solid "+col+"30"}}>
        <div style={{fontSize:11,fontWeight:800,color:col,letterSpacing:2,marginBottom:18}}>{titulo}</div>
        {children}
      </div>
    );
  }

  // Número grande + label
  function BigNum({num,label,col,sub}){
    return(
      <div style={{marginBottom:16}}>
        <div style={{fontSize:13,color:"#475569",fontWeight:600,marginBottom:4}}>{label}</div>
        <div style={{fontSize:42,fontWeight:900,color:col,fontFamily:"monospace",lineHeight:1,letterSpacing:-1}}>{num}</div>
        {sub&&<div style={{fontSize:18,color:"#64748B",marginTop:4,fontWeight:500}}>{sub}</div>}
      </div>
    );
  }

  // Dato secundario
  function Dato({label,val,col}){
    return(
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"10px 0",borderBottom:"1px solid #0F172A"}}>
        <span style={{fontSize:15,color:"#64748B",fontWeight:500}}>{label}</span>
        <span style={{fontSize:22,fontWeight:800,color:col||"#F1F5F9",fontFamily:"monospace"}}>{val}</span>
      </div>
    );
  }

  return(
    <div style={{padding:"20px 16px 100px",background:"#080E1A",minHeight:"100vh",fontFamily:"system-ui,sans-serif"}}>

      {/* ════ BLOQUE 0: HOY ════ */}
      <Bloque titulo={"HOY — "+fmtD(today)} col={semCol(norma.todayDrive||0,7*60,9*60)}>
        <BigNum
          num={fmtDur(norma.todayDrive||0)}
          label="Conducción hoy"
          col={semCol(norma.todayDrive||0,7*60,9*60)}
          sub={"de "+fmtDur(norma.maxDay||540)+" máximo"}
        />
        <Barra pct={Math.min(100,Math.round((norma.todayDrive||0)/(norma.maxDay||540)*100))} col={semCol(norma.todayDrive||0,7*60,9*60)}/>
        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:0}}>
          <Dato label="Restante jornada" val={fmtDur(norma.rDay||0)} col={semCol(norma.rDay||0,120,60)}/>
          <Dato label="Conducción continua" val={fmtDur(norma.cont||0)+" / 4h 30"} col={semCol(norma.cont||0,180,240)}/>
          <Dato label="Descansos reducidos" val={(norma.redRests||0)+" / 3"} col={(norma.redRests||0)>=3?"#EF4444":(norma.redRests||0)>=2?"#F59E0B":"#22C55E"}/>
        </div>
      </Bloque>

      {/* ════ BLOQUE A: SEMANA ACTUAL ════ */}
      <Bloque titulo="SEMANA ACTUAL" col={cSem}>
        <BigNum
          num={fmtDur(semDrive)}
          label="Conducción esta semana"
          col={cSem}
          sub={"de "+fmtDur(LIM.WEEK)+" máximo"}
        />
        <Barra pct={semPct} col={cSem}/>
        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:0}}>
          <Dato label="Restante" val={fmtDur(semRestante)} col={cSem}/>
          <Dato label="Jornadas usadas" val={(norma.jornadaCount||0)+" / 6"} col={(norma.jornadaCount||0)>=6?"#EF4444":(norma.jornadaCount||0)>=5?"#F59E0B":"#22C55E"}/>
          <Dato label="Jornadas de 10h" val={(norma.extUsed||0)+" / 2"} col={(norma.extUsed||0)>=2?"#EF4444":(norma.extUsed||0)>=1?"#F59E0B":"#22C55E"}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"10px 0"}}>
            <span style={{fontSize:15,color:"#64748B",fontWeight:500}}>Semana anterior</span>
            <span style={{fontSize:22,fontWeight:800,color:"#818CF8",fontFamily:"monospace"}}>{fmtDur(prevDrive)}</span>
          </div>
        </div>
        {semDrive>=52*60&&(
          <div style={{background:"#450a0a",borderRadius:10,padding:"12px 14px",marginTop:12,fontSize:14,color:"#FCA5A5",fontWeight:600,lineHeight:1.5}}>
            🔴 Llevas más de 52h — riesgo de multa. Planifica el descanso semanal.
          </div>
        )}
        {semDrive>=45*60&&semDrive<52*60&&(
          <div style={{background:"#422006",borderRadius:10,padding:"12px 14px",marginTop:12,fontSize:14,color:"#FCD34D",fontWeight:600,lineHeight:1.5}}>
            ⚠️ Más de 45h — vigila el límite de 56h esta semana.
          </div>
        )}
      </Bloque>

      {/* ════ BLOQUE B: BISEMANAL ════ */}
      <Bloque titulo="BISEMANAL — 2 SEMANAS CONSECUTIVAS" col={cBi}>
        <BigNum
          num={fmtDur(biTotal)}
          label="Total 2 semanas"
          col={cBi}
          sub={"de "+fmtDur(LIM.BIWEEK)+" máximo"}
        />
        <Barra pct={biPct} col={cBi}/>
        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:0}}>
          <Dato label="Restante" val={fmtDur(biRestante)} col={cBi}/>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0"}}>
            <span style={{fontSize:15,color:"#64748B"}}>Semana ant.</span>
            <span style={{fontSize:18,color:"#818CF8",fontFamily:"monospace",fontWeight:700}}>{fmtDur(prevDrive)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
            <span style={{fontSize:15,color:"#64748B"}}>Esta semana</span>
            <span style={{fontSize:18,color:"#F59E0B",fontFamily:"monospace",fontWeight:700}}>{fmtDur(semDrive)}</span>
          </div>
        </div>
        {biTotal>=LIM.BIWEEK*0.92&&(
          <div style={{background:"#450a0a",borderRadius:10,padding:"12px 14px",marginTop:12,fontSize:14,color:"#FCA5A5",fontWeight:600,lineHeight:1.5}}>
            🔴 Cerca del límite bisemanal. Riesgo de multa elevado.
          </div>
        )}
      </Bloque>

      {/* ════ BLOQUE C: COMPENSACIONES ════ */}
      <Bloque titulo="COMPENSACIONES PENDIENTES" col={compensaciones.length>0?"#F59E0B":"#22C55E"}>
        {compensaciones.length===0?(
          <div style={{display:"flex",alignItems:"center",gap:14,padding:"8px 0"}}>
            <span style={{fontSize:36}}>✅</span>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:"#22C55E"}}>Sin compensaciones pendientes</div>
              <div style={{fontSize:14,color:"#475569",marginTop:4}}>No tienes descansos reducidos por compensar fuera de España</div>
            </div>
          </div>
        ):compensaciones.map((c,i)=>(
          <div key={i} style={{background:c.urgente?"#450a0a":"#1a0e05",borderRadius:12,padding:"16px",marginBottom:10,border:"1px solid "+(c.urgente?"#EF4444":"#F59E0B")+"40"}}>
            <div style={{fontSize:13,color:c.urgente?"#FCA5A5":"#FCD34D",fontWeight:700,marginBottom:8}}>
              {c.urgente?"🔴":"⚠️"} Descanso semanal reducido fuera de España
            </div>
            <div style={{fontSize:36,fontWeight:900,color:c.urgente?"#EF4444":"#F59E0B",fontFamily:"monospace",lineHeight:1}}>{fmtDur(c.pendMin)}</div>
            <div style={{fontSize:16,color:"#94A3B8",marginTop:4}}>pendientes de recuperar</div>
            <div style={{marginTop:12,fontSize:15,color:"#64748B"}}>
              Plazo: <strong style={{color:c.urgente?"#EF4444":"#F1F5F9"}}>{c.diasRestantes===0?"Hoy":c.diasRestantes===1?"Mañana":"en "+c.diasRestantes+" días"}</strong>
              {" · antes del "+fmtD(toDate(c.dueBy))}
            </div>
          </div>
        ))}
      </Bloque>

      {/* Botones compartir */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <button onClick={()=>exportPDF(db.entries.filter(e=>toDate(e.ts)>=mon&&toDate(e.ts)<=days7[6]),norma,prof,"Semana "+fmtD(mon))}
          style={{background:"#1E293B",color:"white",border:"none",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          📄 PDF semana
        </button>
        <button onClick={()=>shareWhatsApp(buildTxt(db.entries.filter(e=>toDate(e.ts)>=mon&&toDate(e.ts)<=days7[6]),"Semana "+fmtD(mon)))}
          style={{background:"#22C55E",color:"white",border:"none",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          📱 WhatsApp
        </button>
      </div>

    </div>
  );
}
function WeekView({db,norma,prof}){
  const today=new Date(),mon=getMon(today);
  const days=Array.from({length:7},(_,i)=>new Date(+mon+i*24*3600*1000));
  function dayStats(d){const ents=db.entries.filter(e=>sameDay(e.ts,d)).sort((a,b)=>a.ts-b.ts);const st={conduccion:0,pausa:0,descanso:0,disponibilidad:0,otros:0};["conduccion","pausa","descanso","disponibilidad","carga","descarga","otros"].forEach(act=>{let m=0,s=null;const cat=["carga","descarga"].includes(act)?"otros":act;ents.forEach(e=>{if(e.type===`inicio_${act}`)s=e.ts;else if(e.type===`fin_${act}`&&s){m+=diffMin(s,e.ts);s=null;}});st[cat]=(st[cat]||0)+m;});return st;}
  const ws=days.map(d=>({date:d,stats:dayStats(d),isToday:sameDay(d,today),isFuture:d>today}));
  const maxBar=Math.max(...ws.map(w=>Object.values(w.stats).reduce((a,b)=>a+b,0)),600);
  return(
    <div style={{padding:"14px 14px 80px",maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>SEMANA ACTUAL</div><div style={{fontSize:11,color:"#64748B",marginTop:1}}>{fmtD(mon)} – {fmtD(days[6])}</div></div>
        <button onClick={()=>exportPDF(db.entries.filter(e=>e.ts>=mon&&e.ts<=days[6]),norma,prof,`Semana ${fmtD(mon)}`)} style={{background:"#1E293B",color:"white",border:"none",borderRadius:9,padding:"8px 13px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📄 PDF semana</button>
        <button onClick={()=>shareWhatsApp(buildTxt(db.entries.filter(e=>e.ts>=mon&&e.ts<=days[6]),`Semana ${fmtD(mon)}`))} style={{background:"#25D366",color:"white",border:"none",borderRadius:9,padding:"8px 13px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📱 WA semana</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:9,marginBottom:14}}>
        {[
          {l:"Conducción semana",v:norma.weekDrive,  m:LIM.WEEK,    c:"#F59E0B"},
          {l:"Conducción bisemanal",v:norma.biweekDrive,m:LIM.BIWEEK,c:"#EF4444"},
          {l:"Queda semana",     v:norma.rWeek,    m:LIM.WEEK,    c:"#22C55E"},
          {l:"Jornadas 10h",     v:norma.extUsed,  m:2,           c:"#F97316", txt:`${norma.extUsed}/2`},
          {l:"Desc. reducidos",  v:norma.redRests, m:3,           c:"#7C3AED", txt:`${norma.redRests}/3`},
        ].map(({l,v,m,c,txt})=>(
          <div key={l} style={{background:"white",borderRadius:11,padding:"11px",boxShadow:"0 2px 5px rgba(0,0,0,.05)"}}>
            <div style={{fontSize:9,color:"#94A3B8",fontWeight:800,letterSpacing:.8,marginBottom:5}}>{l.toUpperCase()}</div>
            <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{txt||fmtDur(v)}</div>
            <div style={{background:"#F1F5F9",borderRadius:3,height:4,marginTop:5,overflow:"hidden"}}><div style={{background:c,height:"100%",width:`${Math.min(100,(v/m)*100)}%`,borderRadius:3}}/></div>
          </div>
        ))}
      </div>
      <div style={{background:"white",borderRadius:13,padding:"14px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:13}}>
        <div style={{fontSize:9,fontWeight:800,color:"#64748B",letterSpacing:1.8,marginBottom:12}}>DISTRIBUCIÓN POR DÍA</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,alignItems:"end",minHeight:130}}>
          {ws.map(({date,stats,isToday,isFuture})=>{const tot=Object.values(stats).reduce((a,b)=>a+b,0);const bH=Math.round((tot/maxBar)*110);return(
            <div key={dayKey(date)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{fontSize:10,fontWeight:700,color:"#64748B",fontFamily:"'JetBrains Mono',monospace"}}>{tot>0?fmtDur(tot):""}</div>
              <div style={{width:"100%",height:bH||3,borderRadius:"3px 3px 0 0",overflow:"hidden",background:isFuture?"#F1F5F9":"transparent",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                {!isFuture&&Object.entries(stats).filter(([,m])=>m>0).map(([k,m])=><div key={k} style={{width:"100%",height:`${(m/Math.max(1,tot))*100}%`,background:CAT_C[k]||"#94A3B8",minHeight:1}}/>)}
              </div>
              <div style={{fontSize:10,fontWeight:isToday?800:600,color:isToday?"#F59E0B":"#94A3B8"}}>{DAYS[date.getDay()]}</div>
              <div style={{fontSize:9,color:isToday?"#F59E0B":"#CBD5E1"}}>{date.getDate()}</div>
              {isToday&&<div style={{width:5,height:5,borderRadius:"50%",background:"#F59E0B"}}/>}
            </div>
          );})}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:9,marginTop:12,paddingTop:10,borderTop:"1px solid #F1F5F9"}}>
          {Object.entries(CAT_C).map(([k,c])=><div key={k} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:9,height:9,borderRadius:2,background:c}}/><span style={{fontSize:10,color:"#64748B"}}>{CAT_L[k]}</span></div>)}
        </div>
      </div>
      {ws.filter(w=>!w.isFuture&&Object.values(w.stats).some(m=>m>0)).map(({date,stats,isToday})=>(
        <div key={dayKey(date)} style={{background:"white",borderRadius:11,padding:"11px 13px",marginBottom:7,boxShadow:"0 2px 5px rgba(0,0,0,.05)",border:isToday?"2px solid #F59E0B":"2px solid transparent"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              {isToday&&<span style={{background:"#F59E0B",color:"white",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:800}}>HOY</span>}
              <span style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{fmtD(date)}</span>
            </div>
            <button onClick={()=>exportPDF(db.entries.filter(e=>sameDay(e.ts,date)),norma,prof,fmtD(date))} style={{background:"#F1F5F9",border:"1.5px solid #E2E8F0",borderRadius:6,padding:"3px 9px",fontSize:10,fontWeight:700,color:"#475569",cursor:"pointer"}}>📄 PDF</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {Object.entries(stats).filter(([,m])=>m>0).map(([k,m])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:4,background:CAT_C[k]+"15",borderRadius:6,padding:"3px 9px",border:`1px solid ${CAT_C[k]}30`}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:CAT_C[k]}}/><span style={{fontSize:11,fontWeight:700,color:CAT_C[k]}}>{fmtDur(m)}</span><span style={{fontSize:10,color:"#64748B"}}>{CAT_L[k]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BiweekView({db,norma,prof}){
  const today=new Date();
  const thisMon=getMon(today);
  const prevMon=new Date(+thisMon-7*24*3600*1000);
  // Semana actual y semana anterior
  const thisWeekEnts=db.entries.filter(e=>e.ts>=thisMon);
  const prevWeekEnts=db.entries.filter(e=>e.ts>=prevMon&&e.ts<thisMon);
  const nThis=calcNorma(thisWeekEnts,thisWeekEnts.sort((a,b)=>b.ts-a.ts)[0]?.ts||today);
  const nPrev=calcNorma(prevWeekEnts,prevWeekEnts.sort((a,b)=>b.ts-a.ts)[0]?.ts||prevMon);
  const totalBi=norma.biweekDrive;
  const rBi=norma.rBiweek;
  const pctBi=Math.min(100,(totalBi/LIM.BIWEEK)*100);
  const colBi=pctBi>=100?"#EF4444":pctBi>=80?"#F97316":pctBi>=60?"#F59E0B":"#22C55E";

  return(
    <div style={{padding:"16px 16px 90px",maxWidth:700,margin:"0 auto"}}>
      <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:4}}>📊 DOS SEMANAS</div>
      <div style={{fontSize:13,color:"#64748B",marginBottom:14}}>Límite bisemanal: máx 90h</div>

      {/* Total bisemanal */}
      <div style={{background:"#1E293B",borderRadius:16,padding:"18px",marginBottom:14}}>
        <div style={{fontSize:12,color:"#94A3B8",fontWeight:700,marginBottom:6}}>TOTAL 2 SEMANAS</div>
        <div style={{fontSize:38,fontWeight:800,color:colBi,fontFamily:"'JetBrains Mono',monospace",marginBottom:12}}>{fmtDur(totalBi)}</div>
        <div style={{background:"#334155",borderRadius:6,height:14,overflow:"hidden",marginBottom:8}}>
          <div style={{background:colBi,height:"100%",width:`${pctBi}%`,borderRadius:6,transition:"width .4s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:"#64748B"}}>0h</span>
          <span style={{fontSize:14,fontWeight:800,color:colBi}}>{fmtDur(rBi)} disponibles</span>
          <span style={{fontSize:13,color:"#64748B"}}>90h</span>
        </div>
      </div>

      {/* Comparativa semanas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        {[
          {label:"SEMANA ACTUAL",drive:norma.weekDrive,max:LIM.WEEK,color:"#F59E0B"},
          {label:"SEMANA ANTERIOR",drive:nPrev.weekDrive,max:LIM.WEEK,color:"#818CF8"},
        ].map(({label,drive,max,color})=>{
          const pct=Math.min(100,(drive/max)*100);
          return(
            <div key={label} style={{background:"white",borderRadius:14,padding:"14px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748B",marginBottom:6}}>{label}</div>
              <div style={{fontSize:24,fontWeight:800,color,fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>{fmtDur(drive)}</div>
              <div style={{background:"#F1F5F9",borderRadius:4,height:8,overflow:"hidden",marginBottom:4}}>
                <div style={{background:color,height:"100%",width:`${pct}%`,borderRadius:4}}/>
              </div>
              <div style={{fontSize:12,color:"#64748B"}}>{fmtDur(max-drive)} disponibles</div>
            </div>
          );
        })}
      </div>

      {/* Estado normativo bisemanal */}
      {totalBi>LIM.BIWEEK&&(
        <div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:12,padding:"14px",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:"#DC2626",marginBottom:4}}>🚨 LÍMITE BISEMANAL SUPERADO</div>
          <div style={{fontSize:14,color:"#DC2626"}}>Has conducido {fmtDur(totalBi-LIM.BIWEEK)} más de lo permitido. Riesgo de multa muy grave (601–4.601€).</div>
        </div>
      )}
      {totalBi<=LIM.BIWEEK&&totalBi>LIM.BIWEEK*0.9&&(
        <div style={{background:"#FFF7ED",border:"1.5px solid #FED7AA",borderRadius:12,padding:"14px",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:"#C2410C",marginBottom:4}}>⚠️ Cerca del límite bisemanal</div>
          <div style={{fontSize:14,color:"#C2410C"}}>Te quedan solo {fmtDur(rBi)} para las 2 semanas. Planifica con cuidado.</div>
        </div>
      )}
      {totalBi<=LIM.BIWEEK*0.9&&(
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:12,padding:"14px",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:"#166534",marginBottom:4}}>✅ Bisemanal en regla</div>
          <div style={{fontSize:14,color:"#166534"}}>Puedes conducir {fmtDur(rBi)} más en estas 2 semanas.</div>
        </div>
      )}

      {norma.totalDebt>0&&<div style={{background:"#FFF7ED",border:"2px solid #FED7AA",borderRadius:12,padding:"14px"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#C2410C",marginBottom:8}}>⚠️ COMPENSACIÓN PENDIENTE — Descanso semanal reducido</div>
        <div style={{fontSize:12,color:"#92400E",marginBottom:10,lineHeight:1.6}}>
          Tomaste un descanso reducido fuera de España. Debes añadir la diferencia hasta 45h a otro descanso de mínimo 9h, antes del final de la 3ª semana siguiente.
        </div>
        {norma.debts.map((d,i)=>{
          const daysLeft=Math.max(0,Math.ceil((d.dueBy-new Date())/(24*3600*1000)));
          const urgente=daysLeft<=7;
          const pct=Math.min(100,Math.max(0,100-(daysLeft/21)*100));
          return(
            <div key={i} style={{background:urgente?"#FEF2F2":"white",border:`1.5px solid ${urgente?"#FECACA":"#FDE68A"}`,borderRadius:8,padding:"10px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:urgente?"#DC2626":"#92400E"}}>{fmtDur(d.debtMin)} a compensar</div>
                  <div style={{fontSize:12,color:"#64748B",marginTop:2}}>Descanso el {fmtD(d.takenAt)} · Descansaste {fmtDur(d.takenMin)}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                  <div style={{fontSize:22,fontWeight:800,color:urgente?"#DC2626":"#D97706",fontFamily:"monospace"}}>{daysLeft}d</div>
                  <div style={{fontSize:10,color:"#64748B"}}>restantes</div>
                </div>
              </div>
              <div style={{background:"#E2E8F0",borderRadius:4,height:5,overflow:"hidden",marginBottom:3}}>
                <div style={{background:urgente?"#EF4444":"#F59E0B",height:"100%",width:`${pct}%`,borderRadius:4}}/>
              </div>
              <div style={{fontSize:11,color:urgente?"#DC2626":"#92400E",fontWeight:urgente?700:400}}>
                {urgente?"🚨 URGENTE — ":"📅 "}Antes del {fmtFull(d.dueBy)}
              </div>
            </div>
          );
        })}
        <div style={{fontSize:11,color:"#92400E",marginTop:6,fontStyle:"italic",lineHeight:1.5}}>
          💡 Añade {fmtDur(norma.totalDebt)} a un descanso normal de mínimo 9h. No se puede fraccionar.
        </div>
      </div>}
    </div>
  );
}

function BorrarTodo({db,prof,showToast}){
  const[paso,setPaso]=useState(0); // 0=normal, 1=confirmar, 2=escribir
  const[texto,setTexto]=useState("");
  const[loading,setLoading]=useState(false);

  function exportarBackup(){
    const data={
      entries:db.entries,
      docs:db.docs||[],
      prof,
      exportedAt:new Date().toISOString(),
      version:"cuaderno_backup_v1"
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`cuaderno_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("✅ Backup descargado");
  }

  async function borrar(){
    setLoading(true);
    try{
      // Borrar TODO el localStorage del usuario
      const keysToRemove=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&!["dark","sb_session"].includes(k))keysToRemove.push(k);
      }
      keysToRemove.forEach(k=>localStorage.removeItem(k));
      // Borrar en Supabase
      const uid=getUserId();
      if(uid){
        await sbFetch(`/rest/v1/entries?user_id=eq.${uid}`,{method:"DELETE"}).catch(()=>{});
        await sbFetch(`/rest/v1/gastos?user_id=eq.${uid}`,{method:"DELETE"}).catch(()=>{});
        await sbFetch(`/rest/v1/ubicaciones?user_id=eq.${uid}`,{method:"DELETE"}).catch(()=>{});
        await sbFetch(`/rest/v1/km_logs?user_id=eq.${uid}`,{method:"DELETE"}).catch(()=>{});
      }
      window.location.reload();
    }catch(_){setLoading(false);}
  }

  return(
    <div style={{marginTop:20,borderTop:"2px solid #FEE2E2",paddingTop:16}}>
      <div style={{fontSize:11,color:"#DC2626",fontWeight:700,letterSpacing:.5,marginBottom:10}}>⚠️ ZONA PELIGROSA</div>
      {/* Backup primero */}
      <button onClick={exportarBackup}
        style={{width:"100%",background:"#F0FDF4",color:"#166534",border:"1.5px solid #BBF7D0",borderRadius:11,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:8}}>
        📥 Exportar backup antes de borrar
      </button>
      {paso===0&&(
        <button onClick={()=>setPaso(1)} style={{width:"100%",background:"#FEF2F2",color:"#DC2626",border:"1.5px solid #FECACA",borderRadius:11,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          🗑 Borrar todos mis registros
        </button>
      )}
      {paso===1&&(
        <div style={{background:"#FEF2F2",borderRadius:12,padding:"14px",border:"1.5px solid #FECACA"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#DC2626",marginBottom:8}}>¿Estás seguro?</div>
          <div style={{fontSize:13,color:"#7F1D1D",marginBottom:12,lineHeight:1.5}}>
            Se borrarán <strong>todos tus registros de jornada, gastos y kilómetros</strong>. Esto no se puede deshacer.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>setPaso(0)} style={{background:"#F1F5F9",color:"#64748B",border:"none",borderRadius:9,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
            <button onClick={()=>setPaso(2)} style={{background:"#DC2626",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Sí, borrar todo</button>
          </div>
        </div>
      )}
      {paso===2&&(
        <div style={{background:"#FEF2F2",borderRadius:12,padding:"14px",border:"1.5px solid #FECACA"}}>
          <div style={{fontSize:13,color:"#7F1D1D",marginBottom:8}}>Escribe <strong>BORRAR</strong> para confirmar:</div>
          <input value={texto} onChange={e=>setTexto(e.target.value.toUpperCase())}
            placeholder="Escribe BORRAR"
            style={{width:"100%",background:"white",border:"2px solid #FECACA",borderRadius:8,padding:"10px",fontSize:16,color:"#DC2626",outline:"none",fontFamily:"monospace",fontWeight:700,marginBottom:10}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>{setPaso(0);setTexto("");}} style={{background:"#F1F5F9",color:"#64748B",border:"none",borderRadius:9,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
            <button onClick={borrar} disabled={texto!=="BORRAR"||loading}
              style={{background:texto==="BORRAR"&&!loading?"#DC2626":"#94A3B8",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:texto==="BORRAR"&&!loading?"pointer":"default"}}>
              {loading?"⏳ Borrando...":"🗑 CONFIRMAR"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CambiarPassword(){
  const[open,setOpen]=useState(false);
  const[pass1,setPass1]=useState("");
  const[pass2,setPass2]=useState("");
  const[loading,setLoading]=useState(false);
  const[msg,setMsg]=useState("");

  async function cambiar(){
    if(!pass1||pass1.length<6){setMsg("❌ Mínimo 6 caracteres");return;}
    if(pass1!==pass2){setMsg("❌ Las contraseñas no coinciden");return;}
    setLoading(true);setMsg("");
    try{
      // Actualizar contraseña via Supabase auth
      const session=getSession();
      guardDemoCannotUseProduction(SB_URL,"auth:change-password");
      const res=await fetch(`${SB_URL}/auth/v1/user`,{
        method:"PUT",
        headers:{"Content-Type":"application/json","apikey":SB_KEY,"Authorization":`Bearer ${session?.access_token}`},
        body:JSON.stringify({password:pass1})
      });
      const d=await res.json();
      if(!res.ok)throw new Error(d.message||d.error_description||"Error");
      setMsg("✅ Contraseña cambiada correctamente");
      setPass1("");setPass2("");
      setTimeout(()=>{setOpen(false);setMsg("");},2000);
    }catch(e){setMsg("❌ "+e.message);}
    setLoading(false);
  }

  const inS={width:"100%",background:"#F8FAFC",border:"1.5px solid #334155",borderRadius:9,padding:"11px 13px",fontSize:15,color:"#0F172A",outline:"none",marginBottom:10};

  return(
    <div style={{marginTop:14,borderTop:"1px solid #E2E8F0",paddingTop:14}}>
      {!open?(
        <button onClick={()=>setOpen(true)} style={{width:"100%",background:"#F8FAFC",color:"#334155",border:"1.5px solid #E2E8F0",borderRadius:11,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          🔑 Cambiar contraseña
        </button>
      ):(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:10}}>🔑 CAMBIAR CONTRASEÑA</div>
          <input type="password" value={pass1} onChange={e=>setPass1(e.target.value)} placeholder="Nueva contraseña (mín. 6 caracteres)" style={inS}/>
          <input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="Repite la contraseña" style={inS}/>
          {msg&&<div style={{fontSize:13,color:msg.startsWith("✅")?"#166534":"#DC2626",marginBottom:10}}>{msg}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>{setOpen(false);setPass1("");setPass2("");setMsg("");}} style={{background:"#F1F5F9",color:"#64748B",border:"none",borderRadius:9,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
            <button onClick={cambiar} disabled={loading} style={{background:loading?"#94A3B8":"#0F172A",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              {loading?"⏳ Guardando...":"✓ Cambiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfView({prof,onSave,norma,db,showToast}){
  const[p,setP]=useState(prof);const[saved,setSaved]=useState(false);
  useEffect(()=>setP(prof),[prof]);
  function save(){onSave(p);setSaved(true);setTimeout(()=>setSaved(false),2000);}

  // ── PERFIL EMPRESA ──
  if(prof.tipo_cuenta==="empresa"){
    return(
      <div style={{padding:"14px 14px 80px",maxWidth:580,margin:"0 auto"}}>
        <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:3}}>PERFIL DE EMPRESA</div>
        <div style={{fontSize:12,color:"#64748B",marginBottom:16}}>Datos de tu empresa de transporte</div>

        <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.5,marginBottom:14}}>DATOS DE LA EMPRESA</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 13px"}}>
            {[
              {l:"Nombre de la empresa",k:"nombre",     ph:"Transportes García S.L.",col:"1/-1"},
              {l:"CIF / NIF",            k:"cif",        ph:"B12345678"},
              {l:"Teléfono",             k:"telefono",   ph:"+34 950 123 456"},
              {l:"Email de contacto",    k:"emailEmpresa",ph:"info@transportes.com"},
              {l:"Dirección",            k:"direccion",  ph:"Calle Industria 12, Almería",col:"1/-1"},
              {l:"Código postal",        k:"cp",         ph:"04001"},
              {l:"Ciudad",               k:"ciudad",     ph:"Almería"},
            ].map(({l,k,ph,col})=>(
              <div key={k} style={{marginBottom:12,gridColumn:col||"auto"}}>
                <label style={{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:.8,marginBottom:6,display:"block"}}>{l}</label>
                <input type="text" value={p[k]||""} onChange={e=>setP(prev=>({...prev,[k]:e.target.value}))} placeholder={ph} style={s.tIn}/>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.5,marginBottom:10}}>OPERACIÓN COMO CONDUCTOR</div>
          <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
            <input
              type="checkbox"
              checked={!!p.canDrive}
              onChange={e=>setP(prev=>({...prev,canDrive:e.target.checked}))}
              style={{width:18,height:18,marginTop:2,accentColor:"#F59E0B",flexShrink:0}}
            />
            <span>
              <span style={{display:"block",fontSize:14,fontWeight:700,color:"#0F172A",lineHeight:1.35}}>También conduzco con esta cuenta</span>
              <span style={{display:"block",fontSize:12,color:"#64748B",marginTop:4,lineHeight:1.5}}>
                Activa el panel conductor y el cambio rápido entre gestión de empresa y conducción.
              </span>
            </span>
          </label>
        </div>

        <button onClick={save} style={{width:"100%",background:saved?"#22C55E":"#0F172A",color:"white",border:"none",borderRadius:11,padding:"15px",fontSize:16,fontWeight:800,cursor:"pointer",transition:"background .3s",marginBottom:12}}>
          {saved?"✓ GUARDADO":"GUARDAR PERFIL"}
        </button>

        {/* Código para conductores */}
        <EmpresaPerfilBlock tipoCuentaProp="empresa"/>

        <CambiarPassword/>
        <BorrarTodo db={db} prof={prof} showToast={showToast}/>
      </div>
    );
  }

  // ── PERFIL CONDUCTOR ──
  const isInt=p.tipoServicio==="internacional"||p.abroadNow;
  const TT=useT(p.lang||"es");
  return(
    <div style={{padding:"14px 14px 80px",maxWidth:580,margin:"0 auto"}}>
      <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:3}}>PERFIL DEL CONDUCTOR</div>
      <div style={{fontSize:12,color:"#64748B",marginBottom:16}}>Aparece en todos los PDFs exportados</div>

      {/* IDIOMA */}
      <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.5,marginBottom:10}}>{TT("idioma")}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {LANGS.map(l=>(
            <button key={l.code} onClick={()=>setP(prev=>({...prev,lang:l.code}))}
              style={{background:p.lang===l.code?"#F59E0B15":"#F8FAFC",border:`2px solid ${p.lang===l.code?"#F59E0B":"#E2E8F0"}`,borderRadius:10,padding:"8px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:18}}>{l.flag}</span>
              <span style={{fontSize:13,fontWeight:700,color:p.lang===l.code?"#F59E0B":"#64748B"}}>{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TIPO DE SERVICIO — lo más importante arriba */}
      <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.5,marginBottom:12}}>TIPO DE SERVICIO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[{v:"nacional",label:"🇪🇸 Nacional",sub:"España · Descanso semanal 45h obligatorio",color:"#22C55E"},
            {v:"internacional",label:"🌍 Internacional",sub:"Fuera de España · Descanso semanal reducible a 24h",color:"#06B6D4"}
          ].map(({v,label,sub,color})=>(
            <button key={v} onClick={()=>setP(prev=>({...prev,tipoServicio:v,abroadNow:v==="internacional"}))}
              style={{border:`2px solid ${p.tipoServicio===v?color:color+"30"}`,background:p.tipoServicio===v?color+"15":"white",borderRadius:12,padding:"14px 10px",cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:15,fontWeight:800,color:p.tipoServicio===v?color:"#334155"}}>{label}</div>
              <div style={{fontSize:11,color:"#64748B",marginTop:4,lineHeight:1.4}}>{sub}</div>
              {p.tipoServicio===v&&<div style={{fontSize:10,color:color,fontWeight:800,marginTop:6}}>● ACTIVO</div>}
            </button>
          ))}
        </div>
        <div style={{background:isInt?"#F0F9FF":"#F0FDF4",border:`1.5px solid ${isInt?"#BAE6FD":"#BBF7D0"}`,borderRadius:10,padding:"10px 12px"}}>
          {isInt
            ?<><div style={{fontSize:11,fontWeight:800,color:"#0369A1",marginBottom:3}}>🌍 REGLAS INTERNACIONALES ACTIVAS</div>
               <div style={{fontSize:12,color:"#0369A1",lineHeight:1.6}}>• Descanso semanal mínimo: <strong>24h</strong> (reducido)<br/>• Deuda <strong>21h</strong> a compensar antes de 3ª semana siguiente<br/>• Dietas internacionales: 91,35€/día (exento IRPF)</div></>
            :<><div style={{fontSize:11,fontWeight:800,color:"#166534",marginBottom:3}}>🇪🇸 REGLAS NACIONALES ACTIVAS</div>
               <div style={{fontSize:12,color:"#166534",lineHeight:1.6}}>• Descanso semanal mínimo: <strong>45h</strong> completas<br/>• No se puede reducir en territorio nacional<br/>• Dietas nacionales: 53,34€/día (exento IRPF)</div></>
          }
        </div>
      </div>

      <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.5,marginBottom:14}}>DATOS PERSONALES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 13px"}}>
          {[{l:"Nombre completo",k:"nombre",ph:"Juan García López"},{l:"DNI / Pasaporte",k:"dni",ph:"12345678A"},{l:"Nº Licencia CAP",k:"licencia",ph:"CAP-2025-00123"}].map(({l,k,ph})=>(
            <div key={k} style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:.8,marginBottom:6,display:"block"}}>{l}</label><input type="text" value={p[k]||""} onChange={e=>setP(prev=>({...prev,[k]:e.target.value}))} placeholder={ph} style={s.tIn}/></div>
          ))}
          <div style={{marginBottom:12,gridColumn:"1 / -1"}}>
            <label style={{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:.8,marginBottom:8,display:"block"}}>TIPO DE VEHÍCULO</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{v:"articulado",label:"🚛 Articulado",sub:"Cabeza + semirremolque"},{v:"rigido",label:"🚚 Rígido",sub:"Sin remolque separado"}].map(({v,label,sub})=>(
                <button key={v} onClick={()=>setP(prev=>({...prev,tipoVehiculo:v}))}
                  style={{border:`2px solid ${p.tipoVehiculo===v?"#F59E0B":"#E2E8F0"}`,background:p.tipoVehiculo===v?"#FFF7ED":"#F8FAFC",borderRadius:10,padding:"10px",cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:13,fontWeight:700,color:p.tipoVehiculo===v?"#F59E0B":"#334155"}}>{label}</div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{sub}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:.8,marginBottom:6,display:"block"}}>🚛 Matrícula camión</label><input type="text" value={p.matricula||""} onChange={e=>setP(prev=>({...prev,matricula:e.target.value}))} placeholder="1234 ABC" style={s.tIn}/></div>
          {p.tipoVehiculo!=="rigido"&&<div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:.8,marginBottom:6,display:"block"}}>🔗 Matrícula remolque</label><input type="text" value={p.remolque||""} onChange={e=>setP(prev=>({...prev,remolque:e.target.value}))} placeholder="R-1234 ABC" style={s.tIn}/></div>}
          <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:.8,marginBottom:6,display:"block"}}>País base</label>
            <select value={p.paisBase||"ES"} onChange={e=>setP(prev=>({...prev,paisBase:e.target.value}))} style={{...s.tIn,cursor:"pointer"}}>
              {[["ES","🇪🇸 España"],["PT","🇵🇹 Portugal"],["FR","🇫🇷 Francia"],["DE","🇩🇪 Alemania"],["IT","🇮🇹 Italia"],["BE","🇧🇪 Bélgica"],["NL","🇳🇱 Países Bajos"],["PL","🇵🇱 Polonia"],["OTHER","🌍 Otro EU"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Campo empresa — conductor se vincula con código */}
        <CampoEmpresa prof={p}/>
      </div>

      {norma.totalDebt>0&&<div style={{background:"#FFF7ED",border:"2px solid #FED7AA",borderRadius:11,padding:"12px",marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:800,color:"#C2410C",marginBottom:8}}>⚠️ DESCANSO REDUCIDO — COMPENSACIÓN PENDIENTE</div>
        {norma.debts.map((d,i)=>{
          const daysLeft=Math.max(0,Math.ceil((d.dueBy-new Date())/(24*3600*1000)));
          const urgente=daysLeft<=7;
          return(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,padding:"8px",background:urgente?"#FEF2F2":"white",borderRadius:7,border:`1px solid ${urgente?"#FECACA":"#FDE68A"}`}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:urgente?"#DC2626":"#92400E"}}>{fmtDur(d.debtMin)} a compensar</div>
                <div style={{fontSize:11,color:"#64748B"}}>El {fmtD(d.takenAt)} · Plazo: {fmtFull(d.dueBy)}</div>
              </div>
              <div style={{fontSize:20,fontWeight:800,color:urgente?"#DC2626":"#D97706",fontFamily:"monospace",flexShrink:0,marginLeft:8}}>{daysLeft}d</div>
            </div>
          );
        })}
        <div style={{fontSize:11,color:"#92400E",marginTop:4,fontStyle:"italic"}}>
          💡 Añadir a un descanso de mín. 9h · No se puede fraccionar
        </div>
      </div>}

      {/* NOTIFICACIONES */}
      <ConductorAlmacenamientoCard showToast={showToast} />
      <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1.5,marginBottom:10}}>🔔 NOTIFICACIONES</div>
        {typeof Notification!=="undefined"?(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#1E293B"}}>Alertas con pantalla apagada</div>
                <div style={{fontSize:11,color:"#64748B",marginTop:2}}>Limite conduccion, pausa completa, descanso listo</div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:((typeof Notification!=="undefined")?Notification.permission:"denied")==="granted"?"#22C55E":((typeof Notification!=="undefined")?Notification.permission:"denied")==="denied"?"#EF4444":"#F59E0B"}}>
                {((typeof Notification!=="undefined")?Notification.permission:"denied")==="granted"?"✅ Activas":((typeof Notification!=="undefined")?Notification.permission:"denied")==="denied"?"❌ Bloqueadas":"⚠️ Sin activar"}
              </div>
            </div>
            {((typeof Notification!=="undefined")?Notification.permission:"denied")!=="granted"&&((typeof Notification!=="undefined")?Notification.permission:"denied")!=="denied"&&(
              <button onClick={()=>Notification.requestPermission().then(p=>{if(p==="granted")window.location.reload();})}
                style={{width:"100%",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:9,padding:"11px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                🔔 Activar notificaciones
              </button>
            )}
            {((typeof Notification!=="undefined")?Notification.permission:"denied")==="denied"&&(
              <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"9px",fontSize:12,color:"#DC2626",lineHeight:1.5}}>
                Las notificaciones estan bloqueadas en el navegador. Ve a Ajustes del navegador para activarlas.
              </div>
            )}
            {((typeof Notification!=="undefined")?Notification.permission:"denied")==="granted"&&(
              <div style={{fontSize:12,color:"#64748B",lineHeight:1.6}}>
                Recibiras alertas cuando:<br/>
                • Queden 30 min para parar obligatoriamente<br/>
                • Se alcance el limite de conduccion<br/>
                • La pausa obligatoria haya terminado<br/>
                • El descanso de 9h/11h haya completado
              </div>
            )}
          </div>
        ):<div style={{fontSize:12,color:"#94A3B8"}}>Notificaciones no disponibles en este navegador</div>}
      </div>

      {/* EMPRESA — gestión empresa si tipo_cuenta=empresa */}
      <EmpresaPerfilBlock/>

      <button onClick={save} style={{width:"100%",background:saved?"#22C55E":"#0F172A",color:"white",border:"none",borderRadius:11,padding:"15px",fontSize:16,fontWeight:800,cursor:"pointer",transition:"background .3s"}}>
        {saved?"✓ GUARDADO":"GUARDAR PERFIL"}
      </button>

      {/* Cambiar contraseña */}
      <CambiarPassword/>

      {/* Zona peligrosa — borrar todo */}
      <BorrarTodo db={db} prof={prof} showToast={showToast}/>
    </div>
  );
}

// ── BLOQUE EMPRESA en perfil ──────────────────────────────────
function normalizeEmpresaVinculoCode(raw){
  return String(raw||"").trim().toUpperCase().replace(/\s+/g,"");
}
/** Código real de equipo (sin TMP). Vacío si aún no hay migración / trigger. */
function getEmpresaEquipoCodeStrict(emp){
  if(!emp)return"";
  const a=String(emp.codigo_equipo||"").trim();
  if(a)return a;
  return String(emp.codigo_corto||"").trim();
}
/** Código visible para vincular conductores: codigo_equipo > codigo_corto > TMP- (solo fallback legacy). */
function getEmpresaCodigoEquipoDisplay(emp){
  if(!emp)return"";
  const strict=getEmpresaEquipoCodeStrict(emp);
  if(strict)return strict;
  if(emp.id){
    const h=String(emp.id).replace(/-/g,"").slice(0,6).toUpperCase();
    return h?`TMP-${h}`:"";
  }
  return"";
}
function empresaNombreInitial(nombre){
  const t=String(nombre||"").trim();
  if(!t)return"?";
  const ch=t.charAt(0).toUpperCase();
  return/[A-ZÁÉÍÓÚÑ0-9]/i.test(ch)?ch:"?";
}
async function humanizeConductorEmpresaJoinError(res){
  if(res?.ok)return"";
  let raw="";
  try{raw=await res.text();}catch{raw=""}
  let code=null;
  try{code=JSON.parse(raw).code;}catch{}
  if(res?.status===409||code==="23505")return"Ya perteneces a este equipo.";
  if(res?.status===401||res?.status===403)return"No se ha podido completar. Vuelve a iniciar sesión e inténtalo de nuevo.";
  if(code==="23503"||/foreign key/i.test(raw))return"Ese código no existe o ya no es válido.";
  if(/PGRST|postgres|supabase|violates|constraint|SQLSTATE|relation /i.test(raw))return"No se ha podido unir al equipo. Revisa el código o inténtalo más tarde.";
  return"No se ha podido unir al equipo. Revisa el código o inténtalo más tarde.";
}
async function fetchEmpresasByVinculoCode(raw){
  const cod=normalizeEmpresaVinculoCode(raw);
  if(!cod)return[];
  const enc=encodeURIComponent(cod);
  let emps=await sbSelect("empresas",`codigo_equipo=eq.${enc}`);
  if(emps?.length)return emps;
  emps=await sbSelect("empresas",`codigo_corto=eq.${enc}`);
  if(emps?.length)return emps;
  const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(uuidRe.test(cod)&&cod.length===36)return sbSelect("empresas",`id=eq.${encodeURIComponent(cod)}`);
  return[];
}
function EmpresaPerfilBlock({tipoCuentaProp=null}){
  const[tipoCuenta,setTipoCuenta]=useState(tipoCuentaProp);
  const[empresa,setEmpresa]=useState(null);
  const[loading,setLoading]=useState(!tipoCuentaProp);
  const[creando,setCreando]=useState(false);
  const[nombre,setNombre]=useState("");
  const[cif,setCif]=useState("");
  const[msg,setMsg]=useState("");
  const[copied,setCopied]=useState(false);
  const[inviteOpen,setInviteOpen]=useState(false);

  const codigoLegible=empresa?getEmpresaEquipoCodeStrict(empresa):"";
  const generandoCodigo=!!empresa&&!codigoLegible;

  useEffect(()=>{
    const uid=getUserId();
    if(!uid){setLoading(false);return;}
    if(tipoCuentaProp==="empresa"){
      sbSelect("empresas",`owner_id=eq.${uid}`).then(emps=>{
        if(emps.length)setEmpresa(emps[0]);
        setLoading(false);
      }).catch(()=>setLoading(false));
      return;
    }
    sbSelect("profiles",`id=eq.${uid}`).then(rows=>{
      const tc=rows[0]?.tipo_cuenta||ACCOUNT_TYPES.CONDUCTOR;
      setTipoCuenta(tc);
      if(tc==="empresa"){
        sbSelect("empresas",`owner_id=eq.${uid}`).then(emps=>{
          if(emps.length)setEmpresa(emps[0]);
          setLoading(false);
        }).catch(()=>setLoading(false));
      } else setLoading(false);
    }).catch(()=>{
      setTipoCuenta(ACCOUNT_TYPES.CONDUCTOR);
      setLoading(false);
    });
  },[tipoCuentaProp]);

  useEffect(()=>{
    if(!generandoCodigo||!empresa?.id)return undefined;
    let n=0;
    const id=setInterval(()=>{
      n+=1;
      if(n>12){clearInterval(id);return;}
      sbSelect("empresas",`id=eq.${empresa.id}`).then(rows=>{
        if(rows?.length&&getEmpresaEquipoCodeStrict(rows[0]))setEmpresa(rows[0]);
      }).catch(()=>{});
    },650);
    return()=>clearInterval(id);
  },[generandoCodigo,empresa?.id]);

  async function crear(){
    if(!nombre.trim()){setMsg("Escribe el nombre de la empresa");return;}
    setCreando(true);setMsg("");
    const uid=getUserId();
    const codigo=nombre.trim().slice(0,3).toUpperCase().replace(/\s/g,"")+Math.floor(1000+Math.random()*9000);
    try{
      const res=await sbFetch("/rest/v1/empresas",{
        method:"POST",
        headers:{"Prefer":"return=representation","Content-Type":"application/json"},
        body:JSON.stringify({owner_id:uid,nombre:nombre.trim(),cif:cif.trim()||null,codigo_corto:codigo,activa:true}),
      });
      const text=await res.text();
      if(isDemoDevUnlocked()&&!res.ok)demoDevError("empresas POST (perfil)",res.status,text);
      if(res.ok){
        const emps=await sbSelect("empresas",`owner_id=eq.${uid}`);
        if(emps.length){setEmpresa(emps[0]);setMsg("Listo. Ya puedes invitar a tu equipo.");}
        else{setMsg("Empresa creada. Recargando…");setTimeout(()=>window.location.reload(),900);}
      } else {
        setMsg("No se pudo crear la empresa. Revisa el nombre e inténtalo de nuevo.");
      }
    }catch{setMsg("No se pudo crear la empresa. Comprueba la conexión.");}
    finally{setCreando(false);}
  }

  function copiarCodigo(){
    const t=codigoLegible||getEmpresaCodigoEquipoDisplay(empresa);
    if(!t)return;
    navigator.clipboard?.writeText(t).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2200);}).catch(()=>{});
  }

  async function compartirCodigo(){
    const code=codigoLegible||getEmpresaCodigoEquipoDisplay(empresa);
    if(!code)return;
    const url=buildEquipoDeepLink(code);
    const title=`Únete a ${empresa?.nombre||"nuestro equipo"}`;
    const text=`Abre Cuaderno de Ruta con este código de equipo: ${code}`;
    try{
      if(navigator.share)await navigator.share({title,text,url});
      else await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(()=>setCopied(false),2200);
    }catch{/* cancelado o no disponible */}
  }

  if(loading)return null;
  if(tipoCuenta!=="empresa")return null;

  return(
    <div style={{background:"linear-gradient(180deg,#ffffff 0%,#fafaf9 100%)",borderRadius:18,padding:"18px 16px 16px",boxShadow:"0 8px 32px rgba(15,23,42,.08)",marginBottom:14,border:"1px solid #e7e5e4"}}>
      <div style={{fontSize:10,fontWeight:800,color:"#78716c",letterSpacing:1.6,marginBottom:10}}>MI EMPRESA</div>
      {empresa?(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <div style={{
              width:48,height:48,borderRadius:14,
              background:"linear-gradient(135deg,#f59e0b,#ea580c)",
              color:"white",fontSize:20,fontWeight:850,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,boxShadow:"0 8px 22px rgba(234,88,12,.28)",
            }}>{empresaNombreInitial(empresa.nombre)}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:17,fontWeight:800,color:"#1c1917",lineHeight:1.2}}>{empresa.nombre}</div>
              {empresa.cif&&<div style={{fontSize:12,color:"#78716c",marginTop:3}}>{empresa.cif}</div>}
            </div>
          </div>

          <div style={{background:"#fff",borderRadius:16,padding:"16px 14px",border:"1px solid #e7e5e4",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#78716c",letterSpacing:.6,marginBottom:8}}>Código de equipo</div>
            {generandoCodigo?(
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:"#f59e0b",animation:"pulse 1s ease-in-out infinite"}}/>
                <span style={{fontSize:15,fontWeight:700,color:"#57534e"}}>Generando código…</span>
              </div>
            ):(
              <div style={{fontFamily:"'JetBrains Mono',ui-monospace,monospace",fontSize:26,fontWeight:800,color:"#c2410c",letterSpacing:1,lineHeight:1.1}}>
                {codigoLegible}
              </div>
            )}
            <div style={{fontSize:12,color:"#a8a29e",marginTop:10,lineHeight:1.45}}>
              Lo compartes con tus conductores. Ellos lo pegan en perfil y listo.
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <button type="button" onClick={copiarCodigo} disabled={generandoCodigo}
              style={{
                borderRadius:12,padding:"12px 8px",fontSize:13,fontWeight:750,border:"1px solid #e7e5e4",
                background:generandoCodigo?"#f5f5f4":"#fff",color:generandoCodigo?"#a8a29e":"#292524",cursor:generandoCodigo?"default":"pointer",
              }}>
              {copied?"Copiado ✓":"Copiar"}
            </button>
            <button type="button" onClick={compartirCodigo} disabled={generandoCodigo}
              style={{
                borderRadius:12,padding:"12px 8px",fontSize:13,fontWeight:750,border:"1px solid #e7e5e4",
                background:generandoCodigo?"#f5f5f4":"#fff",color:generandoCodigo?"#a8a29e":"#292524",cursor:generandoCodigo?"default":"pointer",
              }}>
              Compartir
            </button>
            <button type="button" onClick={()=>setInviteOpen(true)} disabled={generandoCodigo}
              style={{
                borderRadius:12,padding:"12px 8px",fontSize:13,fontWeight:750,border:"none",
                background:generandoCodigo?"#e7e5e4":"linear-gradient(135deg,#0f172a,#334155)",color:"#fff",cursor:generandoCodigo?"default":"pointer",
              }}>
              QR invitar
            </button>
          </div>
        </div>
      ):(
        <div>
          <div style={{fontSize:14,color:"#57534e",marginBottom:14,lineHeight:1.55,fontWeight:500}}>
            Crea tu espacio de flota: conductores, servicios y seguimiento en un solo sitio.
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#78716c",marginBottom:5}}>NOMBRE DE LA EMPRESA</div>
            <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej. Transportes García"
              style={{width:"100%",border:"1.5px solid #e7e5e4",borderRadius:12,padding:"12px 14px",fontSize:15,outline:"none",boxSizing:"border-box",background:"#fff"}}/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"#78716c",marginBottom:5}}>CIF / NIF (opcional)</div>
            <input value={cif} onChange={e=>setCif(e.target.value)} placeholder="B12345678"
              style={{width:"100%",border:"1.5px solid #e7e5e4",borderRadius:12,padding:"12px 14px",fontSize:15,outline:"none",boxSizing:"border-box",background:"#fff"}}/>
          </div>
          {msg&&<div style={{fontSize:13,color:msg.includes("Listo")||msg.includes("creada")?"#15803d":"#b45309",marginBottom:10,fontWeight:600,lineHeight:1.4}}>{msg}</div>}
          <button onClick={crear} disabled={creando||!nombre.trim()}
            style={{width:"100%",background:creando||!nombre.trim()?"#d6d3d1":"linear-gradient(135deg,#f59e0b,#ea580c)",color:"white",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:800,cursor:creando?"default":"pointer",boxShadow:"0 10px 28px rgba(234,88,12,.25)"}}>
            {creando?"Creando…":"Crear mi empresa"}
          </button>
        </div>
      )}
      {inviteOpen&&empresa&&(
        <EquipoInvitacionModal
          onClose={()=>setInviteOpen(false)}
          equipoNombre={empresa.nombre}
          equipoCode={codigoLegible||getEmpresaCodigoEquipoDisplay(empresa)}
          linkUrl={buildEquipoDeepLink(codigoLegible||getEmpresaCodigoEquipoDisplay(empresa))}
        />
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}`}</style>
    </div>
  );
}


function CampoEmpresa({prof}){
  const[estado,setEstado]=useState(null);
  const[codigo,setCodigo]=useState("");
  const[loading,setLoading]=useState(false);
  const[msg,setMsg]=useState("");
  const[preview,setPreview]=useState(null);
  const[previewLoading,setPreviewLoading]=useState(false);
  const debRef=useRef(null);

  useEffect(()=>{
    const p=sessionStorage.getItem("cuaderno_pending_equipo_vinculo");
    if(p){
      setCodigo(p);
      sessionStorage.removeItem("cuaderno_pending_equipo_vinculo");
    }
  },[]);

  useEffect(()=>{
    const uid=getUserId();
    if(!uid){setEstado(false);return;}
    sbSelect("empresas",`owner_id=eq.${uid}`)
      .then(emps=>{
        if(emps.length){setEstado({esJefe:true});return null;}
        return sbSelect("conductor_empresa",`user_id=eq.${uid}&activo=eq.true`);
      })
      .then(rels=>{
        if(!rels)return;
        if(rels.length)setEstado({id:rels[0].empresa_id,nombre:rels[0].nombre||"Empresa"});
        else setEstado(false);
      })
      .catch(()=>setEstado(false));
  },[]);

  useEffect(()=>{
    if(estado?.esJefe||estado?.id)return;
    const raw=codigo.trim();
    if(!raw){setPreview(null);setPreviewLoading(false);return;}
    if(debRef.current)clearTimeout(debRef.current);
    debRef.current=setTimeout(async()=>{
      setPreviewLoading(true);
      const emps=await fetchEmpresasByVinculoCode(raw);
      setPreview(emps?.[0]||null);
      setPreviewLoading(false);
    },320);
    return()=>{if(debRef.current)clearTimeout(debRef.current);};
  },[codigo,estado]);

  async function vincular(){
    const uid=getUserId();
    if(!uid){setMsg("Inicia sesión para continuar");return;}
    if(!codigo.trim()){setMsg("Escribe el código de equipo");return;}
    setLoading(true);setMsg("");
    try{
      const emps=await fetchEmpresasByVinculoCode(codigo);
      if(!emps.length){setMsg("Ese código no existe. Revísalo con tu jefe.");setLoading(false);return;}
      const emp=emps[0];
      const res=await sbFetch("/rest/v1/conductor_empresa",{
        method:"POST",
        headers:{"Prefer":"return=representation"},
        body:JSON.stringify({
          user_id:uid,
          empresa_id:emp.id,
          rol:"conductor",
          nombre:prof.nombre||"Conductor",
          matricula:prof.matricula||"",
          activo:true
        })
      });
      if(res.ok){
        setEstado({id:emp.id,nombre:emp.nombre});
        setMsg("");
        setCodigo("");
        setPreview(null);
      } else {
        setMsg(await humanizeConductorEmpresaJoinError(res));
      }
    }catch{
      setMsg("No se ha podido completar. Inténtalo en un momento.");
    }
    setLoading(false);
  }

  async function desvincular(){
    const uid=getUserId();
    if(!uid||!estado?.id)return;
    try{
      await sbFetch(`/rest/v1/conductor_empresa?user_id=eq.${uid}&empresa_id=eq.${estado.id}`,{method:"DELETE"});
      setEstado(false);setCodigo("");setMsg("");setPreview(null);
    }catch{setMsg("No se pudo salir del equipo. Inténtalo de nuevo.");}
  }

  if(estado?.esJefe)return null;

  const card="#fafaf9",line="#e7e5e4",tx="#1c1917",su="#78716c";

  return(
    <div style={{marginTop:8,paddingTop:16,borderTop:`1px solid ${line}`}}>
      <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1.4,marginBottom:10}}>AÑADIR EQUIPO (OPCIONAL)</div>
      {estado===null?(
        <div style={{...s.tIn,color:"#94A3B8",display:"flex",alignItems:"center",fontSize:14}}>Un momento…</div>
      ):estado===false?(
        <div style={{background:card,border:`1px solid ${line}`,borderRadius:16,padding:"14px 14px 16px"}}>
          <div style={{fontSize:13,color:"#57534e",lineHeight:1.5,marginBottom:12,fontWeight:500}}>
            Si trabajas con una flota, pega aquí el código. Si eres autónomo, puedes dejarlo vacío.
          </div>
          <input
            value={codigo}
            onChange={e=>setCodigo(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&vincular()}
            placeholder="Ej. TC-4821"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width:"100%",boxSizing:"border-box",
              border:`1.5px solid ${preview?"#bbf7d0":"#e7e5e4"}`,
              borderRadius:14,padding:"14px 16px",fontSize:18,fontWeight:800,
              fontFamily:"'JetBrains Mono',ui-monospace,monospace",letterSpacing:1,color:tx,
              outline:"none",background:"#fff",marginBottom:10,
            }}
          />
          {(previewLoading||preview)&&codigo.trim()&&(
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,minHeight:52}}>
              <div style={{
                width:44,height:44,borderRadius:12,
                background:"linear-gradient(135deg,#f59e0b,#ea580c)",color:"#fff",
                fontSize:18,fontWeight:850,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
              }}>{preview?empresaNombreInitial(preview.nombre):"…"}</div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:2}}>Te unirás a</div>
                <div style={{fontSize:16,fontWeight:800,color:tx,lineHeight:1.2}}>
                  {previewLoading?"Buscando…":preview?.nombre||"—"}
                </div>
              </div>
            </div>
          )}
          <button type="button" onClick={vincular} disabled={loading||!codigo.trim()||!preview}
            style={{
              width:"100%",border:"none",borderRadius:14,padding:"15px",fontSize:16,fontWeight:800,
              background:loading||!codigo.trim()||!preview?"#d6d3d1":"linear-gradient(135deg,#0f172a,#334155)",
              color:"#fff",cursor:loading||!codigo.trim()||!preview?"default":"pointer",
              boxShadow:!loading&&codigo.trim()&&preview?"0 12px 28px rgba(15,23,42,.2)":"none",
            }}>
            {loading?"Uniendo…":"Unirme al equipo"}
          </button>
        </div>
      ):(
        <div style={{display:"flex",gap:10,alignItems:"center",background:card,border:`1px solid ${line}`,borderRadius:14,padding:"12px 14px"}}>
          <div style={{
            width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#22c55e,#15803d)",
            color:"#fff",fontSize:16,fontWeight:850,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>{empresaNombreInitial(estado.nombre)}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:su,fontWeight:700}}>Equipo activo</div>
            <div style={{fontSize:15,fontWeight:800,color:"#15803d"}}>{estado.nombre}</div>
          </div>
          <button type="button" onClick={desvincular}
            style={{background:"#fff",color:"#b91c1c",border:`1px solid #fecaca`,borderRadius:10,padding:"10px 14px",fontSize:12,fontWeight:800,cursor:"pointer",flexShrink:0}}>
            Salir
          </button>
        </div>
      )}
      {msg&&<div style={{fontSize:13,marginTop:10,color:"#b45309",fontWeight:650,lineHeight:1.4}}>{msg}</div>}
    </div>
  );
}


function ChatTab({norma,prof,todayEnts,clock}){
  const[msgs,setMsgs]=useState([{role:"assistant",content:`Hola${prof.nombre?` ${prof.nombre.split(" ")[0]}`:""}  Soy tu asistente normativo. Puedo ayudarte con:\n\n• Normativa EU 561/2006 — pausas, descansos, límites\n• Calcular cuánto puedes conducir ahora mismo\n• 📷 Analizar el ticket del tacógrafo — foto de la hoja impresa y te digo si hay infracciones\n• Recursos contra multas y procedimientos\n• Cualquier duda sobre transporte por carretera`}]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[photo,setPhoto]=useState(null);
  const bottomRef=useRef(null);
  const photoRef=useRef(null);

  const QUICK=norma.isDriving
    ?[`¿Cuánto puedo conducir? (${fmtDur(norma.canDrive)})`, "¿Pausa fraccionada ahora?","¿Qué hago si me para la policía?"]
    :["¿Cuánto puedo conducir hoy?","¿Cómo recurro una multa?","¿Qué es el Art. 12?","¿Diferencia pausa y descanso?","¿Cuántas horas me quedan esta semana?"];

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  function handlePhoto(e){
    const f=e.target.files?.[0];if(!f)return;
    // Comprimir a máximo 1200px y calidad 75% para evitar error 413
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        const maxW=1200;
        let w=img.width,h=img.height;
        if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        const compressed=canvas.toDataURL("image/jpeg",0.75);
        setPhoto(compressed);
        setInput("Analiza este ticket del tacógrafo. Dime qué actividades hay registradas, cuánto tiempo de conducción, si las pausas son correctas según la normativa EU 561/2006, y si hay alguna posible infracción.");
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(f);
  }

  async function send(text){
    const q=(text||input).trim();
    if(!q&&!photo)return;
    const displayText=q||(photo?"[Foto del tacógrafo adjunta]":"");

    // Build user message — with photo if present
    let userContent;
    if(photo){
      const base64=photo.split(",")[1];
      const mime=photo.split(";")[0].split(":")[1]||"image/jpeg";
      userContent=[
        {type:"image",source:{type:"base64",media_type:mime,data:base64}},
        {type:"text",text:q||"Analiza este ticket del tacógrafo"}
      ];
    } else {
      userContent=q;
    }

    setMsgs(p=>[...p,{role:"user",content:displayText,photo:photo||null}]);
    setInput("");setPhoto(null);setLoading(true);

    const SYSTEM=`Eres el asistente normativo de "Cuaderno de Ruta", app para conductores profesionales españoles.

ESTADO ACTUAL DEL CONDUCTOR:
• Puede conducir ahora: ${fmtDur(norma.canDrive)} (~${Math.round(norma.canDrive*80/60)} km)
• Conducción continua: ${fmtDur(norma.cont)} / 4h30min
• Conducción hoy: ${fmtDur(norma.todayDrive)} / ${fmtDur(norma.maxDay)}
• Semana: ${fmtDur(norma.weekDrive)} / 56h  Bisemanal: ${fmtDur(norma.biweekDrive)} / 90h
• Conduciendo ahora: ${norma.isDriving?"SÍ":"NO"}  Servicio: ${prof.tipoServicio==="internacional"?"Internacional":"Nacional"}
${norma.alerts.length?`• ALERTAS: ${norma.alerts.map(a=>a.msg).join(" | ")}`:""}

NORMATIVA CLAVE EU 561/2006:
• Conducción continua máx 4h30 → pausa 45min (o 15+30 en ese orden)
• Jornada diaria: 9h normal, 10h extensible máx 2 veces/semana
• Semanal: máx 56h. Bisemanal: máx 90h
• Descanso diario: mín 11h (reducible a 9h, máx 3 veces entre semanales)
• Descanso semanal: mín 45h (reducible a 24h fuera de España con compensación)
• Art.12: fuerza mayor documentada para llegar a lugar seguro
• Infracciones en España: leve 200-500€, grave 401-1000€, muy grave 1001-4601€

Si te mandan una foto de ticket de tacógrafo: identifica los bloques de actividad (⊙conducción, ⊓pausa/descanso, ⊠disponible, ✱otros), calcula duración de cada bloque, verifica si se cumplen los límites y señala cualquier infracción posible con el artículo correspondiente.

Responde SIEMPRE en español. Sé directo y práctico. Usa los datos reales del conductor arriba.`;

    try{
      // Build messages — only last 6 for context to avoid token limit
      const recentMsgs=msgs.slice(-5);
      const apiMsgs=[
        ...recentMsgs.map(m=>({role:m.role,content:m.content})),
        {role:"user",content:userContent}
      ];

      const res=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1200,
          system:SYSTEM,
          messages:apiMsgs
        })
      });
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      if(data.error)throw new Error(data.error.message||"API error");
      const reply=data.content?.[0]?.text||"No pude procesar la respuesta.";
      setMsgs(p=>[...p,{role:"assistant",content:reply}]);
    }catch(err){
      setMsgs(p=>[...p,{role:"assistant",content:`⚠️ Error: ${err.message||"Comprueba tu conexión a internet."}`}]);
    }finally{setLoading(false);}
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 100px)",maxWidth:760,margin:"0 auto"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1E293B,#0F172A)",padding:"12px 16px",borderBottom:"1px solid #334155",flexShrink:0}}>
        <div style={{fontSize:13,fontWeight:800,color:"#F59E0B"}}>🤖 ASISTENTE NORMATIVO</div>
        <div style={{fontSize:11,color:"#64748B",marginTop:2}}>Normativa EU 561/2006 · Analiza tickets de tacógrafo</div>
      </div>

      {/* Estado rápido */}
      <div style={{background:"#1E293B",padding:"9px 16px",display:"flex",gap:14,flexWrap:"wrap",borderBottom:"1px solid #334155",flexShrink:0}}>
        {[
          {l:"Ahora",v:fmtDur(norma.canDrive),c:norma.canDrive<45?"#EF4444":norma.canDrive<90?"#F97316":"#22C55E"},
          {l:"Hoy",v:`${fmtDur(norma.todayDrive)}/${fmtDur(norma.maxDay)}`,c:"#F59E0B"},
          {l:"Semana",v:`${fmtDur(norma.weekDrive)}/56h`,c:"#818CF8"},
        ].map(({l,v,c})=>(
          <div key={l}><div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:.8}}>{l.toUpperCase()}</div><div style={{fontSize:14,fontWeight:800,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div></div>
        ))}
      </div>

      {/* Mensajes */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 0"}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:12}}>
            <div style={{maxWidth:"88%",background:m.role==="user"?"#F59E0B":"white",color:"#1E293B",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"11px 14px",fontSize:14,lineHeight:1.65,boxShadow:"0 2px 6px rgba(0,0,0,.08)",whiteSpace:"pre-wrap"}}>
              {m.photo&&<img src={m.photo} style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8,marginBottom:8,display:"block"}} alt="ticket"/>}
              {m.content}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",justifyContent:"flex-start",marginBottom:10}}>
            <div style={{background:"white",borderRadius:"16px 16px 16px 4px",padding:"12px 16px",boxShadow:"0 2px 6px rgba(0,0,0,.08)"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {[0,1,2].map(j=><div key={j} style={{width:8,height:8,borderRadius:"50%",background:"#94A3B8",animation:`pulse 1.4s ease-in-out ${j*0.2}s infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Preguntas rápidas */}
      {msgs.length<=1&&(
        <div style={{padding:"10px 14px 0",display:"flex",gap:7,flexWrap:"wrap",flexShrink:0}}>
          {QUICK.map(q=>(
            <button key={q} onClick={()=>send(q)} style={{background:"white",border:"1.5px solid #E2E8F0",borderRadius:20,padding:"7px 13px",fontSize:12,fontWeight:600,color:"#475569",cursor:"pointer",lineHeight:1.3}}>
              {q}
            </button>
          ))}
          <button onClick={()=>photoRef.current?.click()} style={{background:"#FEF3C7",border:"1.5px solid #FCD34D",borderRadius:20,padding:"7px 13px",fontSize:12,fontWeight:700,color:"#92400E",cursor:"pointer"}}>
            📷 Analizar ticket tacógrafo
          </button>
        </div>
      )}

      {/* Preview foto pendiente */}
      {photo&&(
        <div style={{padding:"8px 14px 0",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
          <img src={photo} style={{height:50,width:50,objectFit:"cover",borderRadius:8,border:"2px solid #F59E0B"}} alt="preview"/>
          <div style={{flex:1,fontSize:12,color:"#475569",lineHeight:1.4}}>Ticket adjunto · Listo para analizar</div>
          <button onClick={()=>{setPhoto(null);setInput("");}} style={{background:"#FEF2F2",border:"none",borderRadius:7,padding:"4px 9px",fontSize:12,color:"#EF4444",cursor:"pointer"}}>✕</button>
        </div>
      )}

      {/* Input */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
      <div style={{padding:"12px 14px",background:"white",borderTop:"1px solid #E2E8F0",display:"flex",gap:9,alignItems:"flex-end",flexShrink:0}}>
        <button onClick={()=>photoRef.current?.click()} style={{background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:12,width:44,height:44,fontSize:20,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="Pregunta sobre normativa, multas… o sube un ticket 📷"
          rows={1} style={{flex:1,background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:12,padding:"10px 13px",fontSize:14,resize:"none",outline:"none",lineHeight:1.5,maxHeight:100,overflowY:"auto"}}/>
        <button onClick={()=>send()} disabled={loading||(!input.trim()&&!photo)}
          style={{background:loading||(!input.trim()&&!photo)?"#E2E8F0":"#F59E0B",color:loading||(!input.trim()&&!photo)?"#94A3B8":"white",border:"none",borderRadius:12,width:44,height:44,fontSize:20,cursor:loading||(!input.trim()&&!photo)?"default":"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {loading?"⏳":"➤"}
        </button>
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{transform:scale(0.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
function Empty({icon,title,sub}){return <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"50px 20px",gap:9}}><span style={{fontSize:46}}>{icon}</span><div style={{fontSize:17,fontWeight:700,color:"#334155"}}>{title}</div>{sub&&<div style={{fontSize:13,color:"#94A3B8",textAlign:"center",lineHeight:1.5}}>{sub}</div>}</div>;}


function LogCard({entry,all,dateLabel,onEdit,onDel}){
  const[open,setOpen]=useState(false);const[conf,setConf]=useState(false);
  const T=EV[entry.type]||{label:entry.type,icon:"•",color:"#64748B",kind:"solo"};
  const dur=T.kind==="close"?findDuration(all,entry):null;
  const orphan=T.kind==="close"&&dur===null;
  const has=entry.location||entry.note||entry.photo;
  const isDeleted=entry.deleted;
  // isCorrection = este registro ES una corrección (tiene corrects apuntando al original)
  const isCorrection=!!entry.corrects;
  // isSuperseded = este registro HA SIDO corregido (tiene corrected_by apuntando a la corrección)
  const isSuperseded=!!entry.corrected_by&&!isDeleted;

  // Entrada supersedida (original corregido) — mostrar tachada sin botones de edición
  if(isSuperseded)return(
    <div style={{background:"#F8FAFC",borderRadius:11,padding:"8px 12px",borderLeft:"4px solid #94A3B8",opacity:.55}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:"#94A3B8",fontWeight:700,marginBottom:2}}>ORIGINAL CORREGIDO</div>
          <span style={{fontSize:12,color:"#94A3B8",textDecoration:"line-through"}}>{T.icon} {T.label} — {fmtT(entry.ts)}{entry.note?` · ${entry.note}`:""}</span>
        </div>
      </div>
    </div>
  );

  if(isDeleted)return(
    <div style={{background:"#F8FAFC",borderRadius:11,padding:"9px 12px",borderLeft:"4px solid #CBD5E1",opacity:.6}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
          <span style={{fontSize:13,color:"#94A3B8",textDecoration:"line-through"}}>{T.icon} {T.label} — {fmtT(entry.ts)}</span>
          <span style={{fontSize:10,background:"#F1F5F9",color:"#94A3B8",borderRadius:4,padding:"1px 6px",fontWeight:700}}>TACHADO</span>
        </div>
        <button onClick={onDel}
          style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:6,padding:"3px 8px",fontSize:11,color:"#16A34A",fontWeight:700,cursor:"pointer",flexShrink:0}}>
          ↩ Restaurar
        </button>
      </div>
    </div>
  );

  // Buscar original si esta entrada es una corrección
  const originalEntry=isCorrection?all.find(e=>e.id===entry.corrects):null;

  return(
    <div style={{borderRadius:11,overflow:"hidden",boxShadow:"0 2px 5px rgba(0,0,0,.05)"}}>
      {/* Si es corrección, mostrar el original tachado encima */}
      {isCorrection&&originalEntry&&(
        <div style={{background:"#FFF7ED",borderLeft:"4px solid #F97316",padding:"7px 12px",opacity:.7}}>
          <div style={{fontSize:10,color:"#C2410C",fontWeight:700,marginBottom:2}}>ORIGINAL (corregido)</div>
          <div style={{fontSize:12,color:"#9A3412",textDecoration:"line-through"}}>
            {(EV[originalEntry.type]||{icon:"•"}).icon} {(EV[originalEntry.type]||{label:originalEntry.type}).label} — {fmtT(new Date(originalEntry.ts))}
            {originalEntry.note?` · ${originalEntry.note}`:""}
          </div>
        </div>
      )}
      <div style={{background:isCorrection?"#EFF6FF":"white",padding:"11px 12px",borderLeft:`4px solid ${isCorrection?"#3B82F6":orphan?"#EF4444":T.color}`}}>
      {isCorrection&&<div style={{fontSize:10,color:"#3B82F6",fontWeight:700,marginBottom:4}}>✏️ CORRECCIÓN</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1,cursor:has?"pointer":"default"}} onClick={()=>has&&setOpen(o=>!o)}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
            <span style={{fontSize:15,fontWeight:700,color:isCorrection?"#3B82F6":T.color}}>{T.icon} {T.label}</span>
            {dur!=null&&<span style={{fontSize:13,background:T.color+"18",color:T.color,borderRadius:5,padding:"2px 8px",fontWeight:700,fontFamily:"monospace"}}>{fmtDur(dur)}</span>}
            {orphan&&<span style={{fontSize:11,background:"#FEF2F2",color:"#EF4444",borderRadius:5,padding:"1px 6px",fontWeight:700}}>⚠ sin inicio</span>}
            {entry.late&&<span style={{fontSize:11,background:"#FFF7ED",color:"#F97316",borderRadius:5,padding:"1px 6px",fontWeight:700}}>⚠ tarde</span>}
          </div>
          <div style={{fontSize:15,fontWeight:700,fontFamily:"monospace",color:"#334155"}}>{fmtT(entry.ts)}{dateLabel&&<span style={{fontSize:12,fontWeight:400,color:"#94A3B8",fontFamily:"sans-serif",marginLeft:6}}>{dateLabel}</span>}</div>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0,marginLeft:8}}>
          <button onClick={onEdit} title="Corregir" style={{background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:6,padding:"4px 7px",fontSize:12,color:"#64748B",lineHeight:1,cursor:"pointer"}}>✏️</button>
          <button onClick={onDel} style={{background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:6,padding:"4px 7px",fontSize:12,color:"#64748B",lineHeight:1,cursor:"pointer"}}>🗑</button>
        </div>
      </div>
      {has&&<div style={{overflow:"hidden",maxHeight:open?500:0,transition:"max-height .3s ease",marginTop:open?6:0}}>
        {entry.location&&<div style={{fontSize:14,color:"#475569",marginTop:4}}>📍 {entry.location}</div>}
        {entry.manual&&<div style={{fontSize:12,color:"#F59E0B",marginTop:4,background:"#FEF3C7",padding:"3px 8px",borderRadius:5,display:"inline-block",fontWeight:700}}>⚠️ Entrada manual declarada</div>}
        {entry.note&&!entry.manual&&<div style={{fontSize:15,color:"#334155",marginTop:5,lineHeight:1.5}}>📝 {entry.note}</div>}
        {entry.photo&&<img src={entry.photo} style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8,marginTop:8}} alt="foto"/>}
      </div>}
      {has&&<div onClick={()=>setOpen(o=>!o)} style={{fontSize:11,color:"#94A3B8",marginTop:5,cursor:"pointer"}}>{open?"▲ OCULTAR":"▼ VER DETALLE"}</div>}
      </div>
    </div>
  );
}
function HistorialView({db,norma,prof,allSorted,dayMap,days,srch,searchQ,setSearchQ,openEdit,deleteEntry}){
  const[view,setView]=useState("reciente"); // reciente | calendario | meses
  const[selDay,setSelDay]=useState(null);
  const[selMonth,setSelMonth]=useState(null);
  const today=new Date();
  const cutoff56=new Date(+today-56*24*3600*1000);

  // Últimos 56 días (correlativos)
  const recentDays=days.filter(([k])=>new Date(k)>=cutoff56);
  // Más de 56 días → agrupar por mes
  const oldDays=days.filter(([k])=>new Date(k)<cutoff56);
  const monthMap={};
  oldDays.forEach(([k,{date,list}])=>{const mk=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;if(!monthMap[mk])monthMap[mk]={year:date.getFullYear(),month:date.getMonth(),list:[],days:[]};monthMap[mk].list.push(...list);monthMap[mk].days.push({date,list,k});});
  const months=Object.entries(monthMap).sort((a,b)=>b[0].localeCompare(a[0]));

  function DayRow({k,date,list}){
    const types=[...new Set(list.map(e=>e.type))].slice(0,6);
    const n=calcNorma(list,list.sort((a,b)=>b.ts-a.ts)[0]?.ts||new Date());
    const isToday=sameDay(date,today);
    return(
      <button onClick={()=>setSelDay(date)} style={{...s.dayCard,border:isToday?"2px solid #F59E0B":"2px solid transparent"}}>
        <div>
          {isToday&&<span style={{fontSize:10,background:"#F59E0B",color:"white",borderRadius:4,padding:"1px 6px",fontWeight:800,marginBottom:4,display:"inline-block"}}>HOY</span>}
          <div style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>{fmtD(date)}</div>
          <div style={{fontSize:16,marginTop:4}}>{types.map(t=><span key={t} style={{marginRight:3}}>{EV[t]?.icon}</span>)}</div>
        </div>
        <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
          <div style={{fontSize:13,color:"#64748B",fontWeight:600}}>{list.length} eventos</div>
          {n.todayDrive>0&&<div style={{fontSize:15,fontWeight:700,color:"#F59E0B"}}>{fmtDur(n.todayDrive)}</div>}
          <span style={{fontSize:20,color:"#334155"}}>›</span>
        </div>
      </button>
    );
  }

  if(selDay){
    const k=dayKey(selDay),de=[...(dayMap[k]?.list||[])].sort((a,b)=>a.ts-b.ts);
    const tld=buildTimeline(de,de[de.length-1]?.ts||new Date());
    return(
      <div style={s.page}>
        <button onClick={()=>setSelDay(null)} style={s.backBtn}>← Volver</button>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>{fmtD(selDay)}</div><div style={{fontSize:13,color:"#64748B"}}>{de.length} entradas</div></div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>exportPDF(de,norma,prof,fmtD(selDay))} style={{...s.shareBtn,background:"#1E293B",color:"white",border:"none"}}>📄 PDF</button>
          </div>
        </div>
        <DayTL tl={tld}/>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>{de.map(e=><LogCard key={e.id} entry={e} all={de} onEdit={()=>openEdit(e)} onDel={()=>deleteEntry(e.id)}/>)}</div>
      </div>
    );
  }

  if(selMonth){
    const mk=`${selMonth.year}-${String(selMonth.month+1).padStart(2,"0")}`;
    const mData=monthMap[mk];
    return(
      <div style={s.page}>
        <button onClick={()=>setSelMonth(null)} style={s.backBtn}>← Volver</button>
        <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:14}}>
          {MONTHS[selMonth.month].toUpperCase()} {selMonth.year}
        </div>
        {/* Mini calendario del mes */}
        {(()=>{
          const firstDay=new Date(selMonth.year,selMonth.month,1);
          const lastDay=new Date(selMonth.year,selMonth.month+1,0);
          const startWd=(firstDay.getDay()||7)-1; // lunes=0
          const cells=[];
          for(let i=0;i<startWd;i++)cells.push(null);
          for(let d=1;d<=lastDay.getDate();d++)cells.push(new Date(selMonth.year,selMonth.month,d));
          const hasDayData=d=>d&&dayMap[dayKey(d)]?.list?.length>0;
          return(
            <div style={{background:"white",borderRadius:14,padding:"14px",marginBottom:14,boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:8}}>
                {["L","M","X","J","V","S","D"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#94A3B8"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {cells.map((d,i)=>{
                  const has=hasDayData(d);
                  const isT=d&&sameDay(d,today);
                  return(
                    <button key={i} onClick={()=>d&&has&&setSelDay(d)}
                      style={{height:36,borderRadius:8,border:"none",cursor:has?"pointer":"default",
                        background:isT?"#F59E0B":has?"#1E293B":"#F8FAFC",
                        color:isT?"white":has?"white":"#CBD5E1",
                        fontSize:13,fontWeight:has?700:400}}>
                      {d?d.getDate():""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {mData?.days.sort((a,b)=>b.date-a.date).map(({date,list,k})=><DayRow key={k} k={k} date={date} list={list}/>)}
        </div>
      </div>
    );
  }

  return(
    <div style={s.page}>
      {/* Buscador */}
      <div style={{position:"relative",marginBottom:14}}>
        <input placeholder="🔍  Buscar evento, nota, lugar, fecha..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={s.searchIn}/>
        {searchQ&&<button onClick={()=>setSearchQ("")} style={s.clrBtn}>✕</button>}
      </div>

      {searchQ.trim().length>1?<>
        <div style={{fontSize:13,color:"#64748B",marginBottom:10}}>{srch.length} resultados</div>
        {srch.length===0&&<Empty icon="🔍" title="Sin resultados"/>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>{srch.map(e=><LogCard key={e.id} entry={e} all={allSorted} dateLabel={fmtD(e.ts)} onEdit={()=>openEdit(e)} onDel={()=>deleteEntry(e.id)}/>)}</div>
      </>:<>
        {/* Selector de vista */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {[{id:"reciente",label:"Últimos 56 días"},{id:"meses",label:"Por meses"}].map(v=>(
            <button key={v.id} onClick={()=>setView(v.id)} style={{flex:1,border:"2px solid",borderRadius:10,padding:"9px 8px",fontSize:13,fontWeight:700,cursor:"pointer",background:view===v.id?"#1E293B":"white",color:view===v.id?"#F59E0B":"#64748B",borderColor:view===v.id?"#334155":"#E2E8F0"}}>
              {v.label}
            </button>
          ))}
        </div>

        {view==="reciente"&&<>
          <div style={{fontSize:12,color:"#64748B",marginBottom:10}}>Scroll por los últimos 56 días · toca un día para ver el detalle</div>
          {recentDays.length===0&&<Empty icon="📅" title="Sin registros recientes"/>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {recentDays.map(([k,{date,list}])=><DayRow key={k} k={k} date={date} list={list}/>)}
          </div>
        </>}

        {view==="meses"&&<>
          <div style={{fontSize:12,color:"#64748B",marginBottom:10}}>Hasta un año de historial · toca un mes para ver el calendario</div>
          {months.length===0&&<Empty icon="📅" title="Sin historial anterior a 56 días"/>}
          {months.map(([mk,mData])=>{
            const totalDrive=mData.list.reduce((acc,e)=>{
              if(e.type==="fin_conduccion"){const dur=findDuration(mData.list.sort((a,b)=>a.ts-b.ts),e);return acc+(dur||0);}return acc;},0);
            return(
              <button key={mk} onClick={()=>setSelMonth({year:mData.year,month:mData.month})} style={{...s.dayCard,marginBottom:8}}>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>{MONTHS[mData.month].toUpperCase()} {mData.year}</div>
                  <div style={{fontSize:13,color:"#64748B",marginTop:3}}>{mData.days.length} días trabajados · {mData.list.length} eventos</div>
                </div>
                <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  {totalDrive>0&&<div style={{fontSize:16,fontWeight:700,color:"#F59E0B"}}>{fmtDur(totalDrive)}</div>}
                  <span style={{fontSize:20,color:"#334155"}}>›</span>
                </div>
              </button>
            );
          })}
        </>}
      </>}
    </div>
  );
}

// ─── GASTOS ──────────────────────────────────────────────────
const GASTO_CATS=[
  {id:"combustible",label:"Combustible",  icon:"⛽",color:"#F59E0B"},
  {id:"peaje",      label:"Peajes",        icon:"🛣️",color:"#6366F1"},
  {id:"comida",     label:"Comida/Dietas", icon:"🍽️",color:"#22C55E"},
  {id:"parking",    label:"Parking",       icon:"🅿️",color:"#0EA5E9"},
  {id:"reparacion", label:"Reparaciones",  icon:"🔧",color:"#F97316"},
  {id:"alojamiento",label:"Alojamiento",   icon:"🏨",color:"#7C3AED"},
  {id:"otros",      label:"Otros",         icon:"📋",color:"#64748B"},
];
const GASTO_KEY="gastos_v1";
async function loadGastos(){
  const uid=getUserId();
  if(uid){
    try{
      const rows=await sbSelect("gastos",`user_id=eq.${uid}&order=fecha.desc&limit=2000`);
      if(rows.length)return rows.map(r=>({id:r.id,cat:r.cat,importe:r.importe,desc:r.descripcion||"",fecha:r.fecha,factura:r.factura||"",photo:r.photo_url||null,addedAt:r.added_at}));
    }catch(_){}
  }
  try{const r=localStorage.getItem(GASTO_KEY);return r?JSON.parse(r):[];}catch(_){return[];}
}
async function saveGastos(g){
  try{localStorage.setItem(GASTO_KEY,JSON.stringify(g));}catch(_){}
  const uid=getUserId();
  if(uid&&g.length){
    const rows=g.map(x=>({id:String(x.id),user_id:uid,cat:x.cat,importe:parseFloat(x.importe),descripcion:x.desc||null,fecha:x.fecha?.slice(0,10)||new Date().toISOString().slice(0,10),factura:x.factura||null,photo_url:x.photo||null,added_at:x.addedAt||new Date().toISOString()}));
    sbUpsert("gastos",rows).catch(()=>{});
  }
}
async function deleteGastoRemote(id){
  const uid=getUserId();
  if(uid)await sbDelete("gastos",id).catch(()=>{});
}

// ─── DIETAS AUTOMÁTICAS ──────────────────────────────────────
function DietasView({db,prof,gastos,selMes}){
  // Calcular dietas por mes basado en entradas del tacógrafo
  const DIETA_NAC=53.34;   // €/día nacional exento IRPF
  const DIETA_INT=91.35;   // €/día internacional exento IRPF

  // Obtener días con jornada en el mes seleccionado
  const [year,month]=selMes.split("-").map(Number);
  const inicioMes=new Date(year,month-1,1);
  const finMes=new Date(year,month,0,23,59,59);

  const entradas=db?.entries||[];
  const jornadas=entradas.filter(e=>
    e.type==="inicio_jornada"&&
    e.ts>=inicioMes&&e.ts<=finMes
  );

  // Agrupar por día
  const diasTrabajados={};
  jornadas.forEach(e=>{
    const k=dayKey(e.ts);
    if(!diasTrabajados[k])diasTrabajados[k]={fecha:e.ts,internacional:prof.tipoServicio==="internacional"||prof.abroadNow};
  });

  // También contar días con conducción
  entradas.filter(e=>e.type==="inicio_conduccion"&&e.ts>=inicioMes&&e.ts<=finMes).forEach(e=>{
    const k=dayKey(e.ts);
    if(!diasTrabajados[k])diasTrabajados[k]={fecha:e.ts,internacional:prof.tipoServicio==="internacional"};
  });

  const dias=Object.values(diasTrabajados).sort((a,b)=>a.fecha-b.fecha);
  const diasNac=dias.filter(d=>!d.internacional).length;
  const diasInt=dias.filter(d=>d.internacional).length;
  const totalNac=diasNac*DIETA_NAC;
  const totalInt=diasInt*DIETA_INT;
  const total=totalNac+totalInt;

  // Gastos reales de comida ese mes
  const gastosComida=gastos.filter(g=>
    g.cat==="comida"&&g.fecha.startsWith(selMes)
  );
  const totalComida=gastosComida.reduce((a,g)=>a+(parseFloat(g.importe)||0),0);

  const mesNombre=new Date(year,month-1,1).toLocaleDateString("es-ES",{month:"long",year:"numeric"});

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#1E293B",borderRadius:14,padding:"18px"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#F59E0B",marginBottom:4}}>💶 DIETAS — {mesNombre}</div>
        <div style={{fontSize:12,color:"#64748B",marginBottom:14}}>Importes exentos de IRPF según normativa fiscal española</div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {[
            {l:"Días nacionales",v:diasNac,sub:`${DIETA_NAC}€/día`,c:"#22C55E"},
            {l:"Días internacionales",v:diasInt,sub:`${DIETA_INT}€/día`,c:"#06B6D4"},
            {l:"Dieta nacional",v:`${totalNac.toFixed(2)}€`,sub:`${diasNac} × ${DIETA_NAC}€`,c:"#22C55E"},
            {l:"Dieta internacional",v:`${totalInt.toFixed(2)}€`,sub:`${diasInt} × ${DIETA_INT}€`,c:"#06B6D4"},
          ].map(({l,v,sub,c})=>(
            <div key={l} style={{background:"rgba(255,255,255,.06)",borderRadius:10,padding:"12px"}}>
              <div style={{fontSize:11,color:"#64748B",fontWeight:700,marginBottom:4}}>{l.toUpperCase()}</div>
              <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
              <div style={{fontSize:11,color:"#475569",marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{background:"#F59E0B20",border:"1.5px solid #F59E0B40",borderRadius:10,padding:"12px",textAlign:"center"}}>
          <div style={{fontSize:12,color:"#94A3B8",marginBottom:4}}>TOTAL DIETAS EXENTAS IRPF</div>
          <div style={{fontSize:32,fontWeight:800,color:"#F59E0B",fontFamily:"'JetBrains Mono',monospace"}}>{total.toFixed(2)}€</div>
        </div>
      </div>

      {/* Comparativa con gastos reales */}
      <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#334155",marginBottom:12}}>COMPARATIVA CON GASTOS REALES</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",background:"#F8FAFC",borderRadius:9}}>
            <span style={{fontSize:14,color:"#475569"}}>Dieta estimada (exenta)</span>
            <span style={{fontSize:16,fontWeight:800,color:"#22C55E"}}>{total.toFixed(2)}€</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",background:"#F8FAFC",borderRadius:9}}>
            <span style={{fontSize:14,color:"#475569"}}>Gastos reales registrados</span>
            <span style={{fontSize:16,fontWeight:800,color:"#F59E0B"}}>{totalComida.toFixed(2)}€</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",background:totalComida>total?"#FEF2F2":"#F0FDF4",borderRadius:9,border:`1px solid ${totalComida>total?"#FECACA":"#BBF7D0"}`}}>
            <span style={{fontSize:14,color:"#475569"}}>Diferencia</span>
            <span style={{fontSize:16,fontWeight:800,color:totalComida>total?"#EF4444":"#22C55E"}}>
              {totalComida>total?`+${(totalComida-total).toFixed(2)}€ sobre dieta`:`${(total-totalComida).toFixed(2)}€ por reclamar`}
            </span>
          </div>
        </div>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:10,lineHeight:1.6}}>
          ℹ️ Puedes deducir la dieta estimada sin necesidad de justificante. Si tus gastos reales son mayores, necesitas los tickets para deducir el exceso.
        </div>
      </div>

      {/* Detalle por días */}
      {dias.length>0&&(
        <div style={{background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#334155",marginBottom:10}}>DÍAS TRABAJADOS ({dias.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {dias.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#F8FAFC",borderRadius:8}}>
                <span style={{fontSize:13,color:"#334155"}}>{fmtD(d.fecha)}</span>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:d.internacional?"#06B6D4":"#22C55E",fontWeight:700,background:d.internacional?"#E0F9FF":"#F0FDF4",borderRadius:5,padding:"2px 8px"}}>{d.internacional?"🌍 Internacional":"🇪🇸 Nacional"}</span>
                  <span style={{fontSize:14,fontWeight:800,color:d.internacional?"#06B6D4":"#22C55E"}}>{d.internacional?DIETA_INT:DIETA_NAC}€</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dias.length===0&&<Empty icon="💶" title="Sin jornadas registradas" sub={`No hay jornadas en ${mesNombre}`}/>}
    </div>
  );
}

function GastosView({prof,db,setDb}){
  const[gastos,setGastos]=useState([]);
  const[loaded,setLoaded]=useState(false);
  const[modal,setModal]=useState(false);
  const[historial,setHistorial]=useState(false);
  const[form,setForm]=useState({cat:"combustible",importe:"",desc:"",fecha:new Date().toISOString().slice(0,10),photo:null,ambito:"es"});
  const[toast,setToast]=useState("");
  const[selMes,setSelMes]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;});
  // Filtros historial — siempre declarados (regla de hooks)
  const[filtroDesde,setFiltroDesde]=useState(()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);});
  const[filtroHasta,setFiltroHasta]=useState(()=>new Date().toISOString().slice(0,10));
  const[filtroCat,setFiltroCat]=useState("all");
  const[filtroMin,setFiltroMin]=useState("");
  const[filtroMax,setFiltroMax]=useState("");
  const photoRef=useRef(null);

  useEffect(()=>{loadGastos().then(g=>{setGastos(g);setLoaded(true);});},[]);
  useEffect(()=>{if(loaded)saveGastos(gastos);},[gastos,loaded]);

  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),2200);};

  function addGasto(){
    if(!form.importe||isNaN(parseFloat(form.importe))){showToast("Introduce un importe");return;}
    const ng={
      id:Date.now()+Math.random(),
      cat:form.cat,
      importe:parseFloat(form.importe).toFixed(2),
      desc:form.desc.trim(),
      fecha:form.fecha+"T12:00",
      photo:form.photo,
      ambito:form.ambito,
      addedAt:new Date().toISOString()
    };
    setGastos(p=>[ng,...p]);
    setModal(false);
    showToast("✓ Gasto guardado");
    setForm({cat:"combustible",importe:"",desc:"",fecha:new Date().toISOString().slice(0,10),photo:null,ambito:"es"});
  }
  function handlePhoto(e){const f=e.target.files?.[0];if(!f)return;uploadPhoto(f,'gastos').then(url=>setForm(p=>({...p,photo:url})));}
  function delGasto(id){setGastos(p=>p.filter(x=>x.id!==id));deleteGastoRemote(id);}

  // 7 últimos gastos para pantalla principal
  const recent=[...gastos].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,20);

  if(!loaded)return <div style={{padding:40,textAlign:"center",color:"#64748B"}}>Cargando...</div>;

  // ── PANTALLA HISTORIAL ──────────────────────────────────────
  if(historial){
    const today=new Date().toISOString().slice(0,10);

    const filtrados=gastos.filter(g=>{
      if(filtroCat!=="all"&&g.cat!==filtroCat)return false;
      if(filtroDesde&&g.fecha.slice(0,10)<filtroDesde)return false;
      if(filtroHasta&&g.fecha.slice(0,10)>filtroHasta)return false;
      if(filtroMin&&parseFloat(g.importe)<parseFloat(filtroMin))return false;
      if(filtroMax&&parseFloat(g.importe)>parseFloat(filtroMax))return false;
      return true;
    }).sort((a,b)=>b.fecha.localeCompare(a.fecha));

    const total=filtrados.reduce((a,g)=>a+(parseFloat(g.importe)||0),0);
    const porCat={};filtrados.forEach(g=>{porCat[g.cat]=(porCat[g.cat]||0)+(parseFloat(g.importe)||0);});

    function buildLabel(){
      const parts=[];
      if(filtroCat!=="all") parts.push(GASTO_CATS.find(c=>c.id===filtroCat)?.label||filtroCat);
      if(filtroDesde||filtroHasta) parts.push(`${filtroDesde||"inicio"} → ${filtroHasta||"hoy"}`);
      return parts.length?parts.join(" · "):`${filtroDesde} → ${filtroHasta}`;
    }

    function exportWA(){
      if(!filtrados.length){showToast("Sin gastos en este filtro");return;}
      let txt=`💰 GASTOS — ${buildLabel()}\n`;
      txt+=`Conductor: ${prof.nombre||"—"}\n`;
      txt+=`${"─".repeat(28)}\n\n`;
      filtrados.forEach(g=>{
        const C=GASTO_CATS.find(c=>c.id===g.cat)||GASTO_CATS[6];
        txt+=`${C.icon} ${g.fecha.slice(0,10)} · ${C.label}\n`;
        if(g.desc) txt+=`   ${g.desc}\n`;
        txt+=`   ${parseFloat(g.importe).toFixed(2)} €\n\n`;
      });
      txt+=`${"─".repeat(28)}\n`;
      txt+=`TOTAL: ${total.toFixed(2)} €\n\n`;
      Object.entries(porCat).forEach(([k,v])=>{
        const C=GASTO_CATS.find(c=>c.id===k)||GASTO_CATS[6];
        txt+=`${C.icon} ${C.label}: ${v.toFixed(2)} €\n`;
      });
      txt+=`\nGenerado: ${new Date().toLocaleString("es-ES")}`;
      shareWhatsApp(txt);
    }

    return(
      <div style={{background:"#0F172A",minHeight:"calc(100vh - 120px)",paddingBottom:80}}>
        {/* Cabecera */}
        <div style={{background:"#0F172A",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #1E293B"}}>
          <button onClick={()=>setHistorial(false)} style={{background:"transparent",border:"none",color:"#F59E0B",fontSize:18,cursor:"pointer",padding:"4px 8px"}}>←</button>
          <span style={{fontSize:15,fontWeight:800,color:"#F1F5F9"}}>Historial de gastos</span>
        </div>

        {/* Filtros */}
        <div style={{padding:"12px 14px",background:"#0A0F1A",borderBottom:"1px solid #1E293B"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#475569",letterSpacing:1,marginBottom:8}}>FILTRAR</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div>
              <div style={{fontSize:10,color:"#475569",fontWeight:700,marginBottom:4}}>DESDE</div>
              <input type="date" value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)}
                style={{width:"100%",background:"#1E293B",border:"1px solid #334155",borderRadius:7,padding:"7px 9px",fontSize:13,color:"#F1F5F9",outline:"none",colorScheme:"dark"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:"#475569",fontWeight:700,marginBottom:4}}>HASTA</div>
              <input type="date" value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)}
                style={{width:"100%",background:"#1E293B",border:"1px solid #334155",borderRadius:7,padding:"7px 9px",fontSize:13,color:"#F1F5F9",outline:"none",colorScheme:"dark"}}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8}}>
            <select value={filtroCat} onChange={e=>setFiltroCat(e.target.value)}
              style={{background:"#1E293B",border:"1px solid #334155",borderRadius:7,padding:"7px 9px",fontSize:13,color:"#F1F5F9",outline:"none"}}>
              <option value="all">Todos los tipos</option>
              {GASTO_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
            <input type="number" value={filtroMin} onChange={e=>setFiltroMin(e.target.value)}
              placeholder="Min €" style={{background:"#1E293B",border:"1px solid #334155",borderRadius:7,padding:"7px 9px",fontSize:13,color:"#F1F5F9",outline:"none"}}/>
            <input type="number" value={filtroMax} onChange={e=>setFiltroMax(e.target.value)}
              placeholder="Max €" style={{background:"#1E293B",border:"1px solid #334155",borderRadius:7,padding:"7px 9px",fontSize:13,color:"#F1F5F9",outline:"none"}}/>
          </div>
        </div>

        {/* Resumen filtrado */}
        <div style={{margin:"12px 14px",background:"#1E293B",borderRadius:14,padding:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:.5}}>TOTAL FILTRADO · {filtrados.length} gastos</div>
              <div style={{fontSize:36,fontWeight:800,color:"#F59E0B",fontFamily:"monospace"}}>{total.toFixed(2)} €</div>
            </div>
          </div>
          {/* Por categoría */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {GASTO_CATS.filter(c=>porCat[c.id]).map(c=>(
              <div key={c.id} style={{background:"rgba(255,255,255,.07)",borderRadius:7,padding:"5px 10px",display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:14}}>{c.icon}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"white"}}>{porCat[c.id].toFixed(2)} €</div>
                  <div style={{fontSize:10,color:"#475569"}}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>
          {/* Botones exportar */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>exportGastosPDF(filtrados,prof,buildLabel())}
              style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:9,padding:"12px 6px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
              📄 PDF
            </button>
            <button onClick={()=>{
              const txt=`💰 GASTOS — ${buildLabel()}\nConductor: ${prof.nombre||"—"}\n${"─".repeat(28)}\n\n`+
                filtrados.map(g=>{const C=GASTO_CATS.find(c=>c.id===g.cat)||GASTO_CATS[6];return`${C.icon} ${g.fecha.slice(0,10)} · ${C.label}${g.desc?" · "+g.desc:""}\n   ${parseFloat(g.importe).toFixed(2)} €`;}).join("\n\n")+
                `\n\n${"─".repeat(28)}\nTOTAL: ${total.toFixed(2)} €\n`+
                Object.entries(porCat).map(([k,v])=>{const C=GASTO_CATS.find(c=>c.id===k)||GASTO_CATS[6];return`${C.icon} ${C.label}: ${v.toFixed(2)} €`;}).join("\n")+
                `\n\nGenerado: ${new Date().toLocaleString("es-ES")}`;
              if(navigator.share){navigator.share({title:"Gastos",text:txt}).catch(()=>{});}
              else{navigator.clipboard?.writeText(txt);showToast("✓ Copiado al portapapeles");}
            }}
              style={{background:"#334155",color:"white",border:"none",borderRadius:9,padding:"12px 6px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
              ↗ Compartir
            </button>
          </div>
        </div>

        {/* Lista */}
        <div style={{padding:"0 14px"}}>
          {filtrados.length===0
            ?<Empty icon="💰" title="Sin gastos con ese filtro" sub="Cambia las fechas o el tipo"/>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filtrados.map(g=>{
                const C=GASTO_CATS.find(c=>c.id===g.cat)||GASTO_CATS[6];
                return(
                  <div key={g.id} style={{background:"#1E293B",borderRadius:12,padding:"12px 14px",
                    borderLeft:`4px solid ${C.color}`,display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:22}}>{C.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9"}}>{C.label}</div>
                      {g.desc&&<div style={{fontSize:12,color:"#64748B",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.desc}</div>}
                      <div style={{fontSize:11,color:"#334155",marginTop:1}}>{g.fecha.slice(0,10)}</div>
                      {g.ambito==="int"&&<div style={{fontSize:10,color:"#A78BFA",marginTop:1}}>🌍 Internacional</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:18,fontWeight:800,color:C.color,fontFamily:"monospace"}}>{parseFloat(g.importe).toFixed(2)} €</div>
                      <button onClick={()=>delGasto(g.id)} style={{background:"#1a0505",border:"none",borderRadius:5,padding:"2px 7px",fontSize:10,cursor:"pointer",color:"#EF4444",marginTop:4,fontWeight:700}}>Borrar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      </div>
    );
  }


  // ── PANTALLA PRINCIPAL ──────────────────────────────────────
  return(
    <div style={{background:"#0F172A",minHeight:"calc(100vh - 120px)",display:"flex",flexDirection:"column",paddingBottom:80}}>

      {/* Cabecera minimalista */}
      <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:1}}>GASTOS RECIENTES</div>
        <button onClick={()=>setHistorial(true)}
          style={{background:"transparent",border:"1px solid #334155",borderRadius:8,padding:"6px 12px",fontSize:12,color:"#64748B",cursor:"pointer",fontWeight:600}}>
          Historial →
        </button>
      </div>

      {/* Lista reciente */}
      <div style={{flex:1,padding:"0 14px",overflowY:"auto"}}>
        {gastos.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:56,marginBottom:16}}>💰</div>
            <div style={{fontSize:18,fontWeight:700,color:"#334155",marginBottom:8}}>Sin gastos todavía</div>
            <div style={{fontSize:14,color:"#475569",lineHeight:1.6}}>Pulsa el botón de abajo para<br/>registrar tu primer gasto</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {recent.map(g=>{
              const C=GASTO_CATS.find(c=>c.id===g.cat)||GASTO_CATS[6];
              return(
                <div key={g.id} style={{background:"#1E293B",borderRadius:12,padding:"12px 14px",borderLeft:`4px solid ${C.color}`,display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:22}}>{C.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9"}}>{C.label}</div>
                    {g.desc&&<div style={{fontSize:12,color:"#64748B",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.desc}</div>}
                    <div style={{fontSize:11,color:"#334155",marginTop:1}}>{g.fecha?.slice(0,10)}</div>
                  </div>
                  <div style={{fontSize:18,fontWeight:800,color:C.color,fontFamily:"monospace",flexShrink:0}}>
                    {parseFloat(g.importe).toFixed(2)} €
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CTA principal — fijo abajo */}
      <div style={{padding:"12px 14px",flexShrink:0}}>
        <button onClick={()=>setModal(true)}
          style={{width:"100%",background:"#22C55E",color:"white",border:"none",borderRadius:16,
            padding:"18px",fontSize:18,fontWeight:800,cursor:"pointer",
            boxShadow:"0 8px 24px rgba(34,197,94,.35)",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <span style={{fontSize:24}}>＋</span> AÑADIR GASTO
        </button>
      </div>

      {/* Modal añadir */}
      {modal&&(
        <div style={s.overlay} onClick={()=>setModal(false)}>
          <div style={{...s.sheet,maxWidth:500}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"#1E293B",padding:"14px 17px 12px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#F59E0B"}}>＋ NUEVO GASTO</div>
              <button onClick={()=>setModal(false)} style={s.xBtn}>✕</button>
            </div>
            <div style={{padding:"16px 17px 32px",overflowY:"auto",maxHeight:"80vh"}}>
              {/* Tipo */}
              <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:10}}>TIPO</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
                {GASTO_CATS.map(c=>(
                  <button key={c.id} onClick={()=>setForm(p=>({...p,cat:c.id}))}
                    style={{border:`2px solid ${form.cat===c.id?c.color:c.color+"30"}`,
                      background:form.cat===c.id?c.color+"22":"#F8FAFC",
                      borderRadius:12,padding:"12px 4px",cursor:"pointer",
                      display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <span style={{fontSize:24}}>{c.icon}</span>
                    <span style={{fontSize:10,fontWeight:700,color:form.cat===c.id?c.color:"#64748B",textAlign:"center",lineHeight:1.2}}>{c.label}</span>
                  </button>
                ))}
              </div>
              {/* Selector España / Internacional para comida */}
              {(form.cat==="comida"||form.cat==="dietas")&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:8}}>ÁMBITO</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[{id:"es",label:"🇪🇸 España",amt:53.34},{id:"int",label:"🌍 Internacional",amt:91.35}].map(o=>(
                      <button key={o.id} onClick={()=>setForm(p=>({...p,ambito:o.id,importe:p.importe||String(o.amt)}))}
                        style={{background:form.ambito===o.id?"#F59E0B22":"#F8FAFC",border:`2px solid ${form.ambito===o.id?"#F59E0B":"#E2E8F0"}`,borderRadius:10,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
                        <div style={{fontSize:13,fontWeight:700,color:form.ambito===o.id?"#F59E0B":"#475569"}}>{o.label}</div>
                        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{o.amt} €/día</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Importe */}
              <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:8}}>IMPORTE (€)</div>
              <input type="number" step="0.01" min="0" value={form.importe}
                onChange={e=>setForm(p=>({...p,importe:e.target.value}))}
                placeholder="0.00" inputMode="decimal"
                style={{...s.tIn,fontSize:28,fontWeight:800,textAlign:"center",marginBottom:14}}/>
              {/* Fecha y descripción */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div>
                  <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:6}}>FECHA</div>
                  <input type="date" value={form.fecha}
                    onChange={e=>{if(e.target.value)setForm(p=>({...p,fecha:e.target.value}));}}
                    style={{...s.tIn,colorScheme:"light"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:6}}>DESCRIPCIÓN</div>
                  <input type="text" value={form.desc}
                    onChange={e=>setForm(p=>({...p,desc:e.target.value}))}
                    placeholder="Gasolinera, AP-7..." style={s.tIn}/>
                </div>
              </div>
              {/* Foto */}
              <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
              <button onClick={()=>photoRef.current?.click()}
                style={{width:"100%",background:form.photo?"#F0FDF4":"#F8FAFC",border:`1.5px dashed ${form.photo?"#22C55E":"#CBD5E1"}`,borderRadius:10,padding:"10px",fontSize:13,color:form.photo?"#166534":"#64748B",cursor:"pointer",marginBottom:form.photo?8:16}}>
                {form.photo?"✓ Foto adjunta — toca para cambiar":"📷 Foto del ticket (opcional)"}
              </button>
              {form.photo&&<img src={form.photo} style={{width:"100%",maxHeight:130,objectFit:"cover",borderRadius:9,marginBottom:14}} alt="preview"/>}
              {/* Guardar */}
              <button onClick={addGasto}
                style={{width:"100%",background:form.importe?"#22C55E":"#94A3B8",color:"white",border:"none",borderRadius:12,padding:"16px",fontSize:17,fontWeight:800,cursor:form.importe?"pointer":"default"}}>
                💾 Guardar{form.importe?` · ${parseFloat(form.importe)||0} €`:""}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast&&<div style={{...s.toast,background:"#1E293B"}}>{toast}</div>}
    </div>
  );
}

// ─── ANÁLISIS DE JORNADA ────────────────────────────────────
function AnalisisView({db,norma,clock}){
  const[periodo,setPeriodo]=useState("hoy"); // hoy | semana | bisemanal
  const today=new Date();
  const allSorted=[...db.entries].sort((a,b)=>+toDate(a.ts)-+toDate(b.ts));

  // ── Cálculo de infracciones basado en períodos reales de tacógrafo ──
  // Un "período de tacógrafo" empieza al fin de cada descanso diario/semanal
  // y dura hasta el siguiente descanso. NO es el día natural.
  function analizaPeriodo(entries){
    const infracciones=[];
    const sorted=[...entries].sort((a,b)=>a.ts-b.ts);
    if(!sorted.length)return infracciones;

    // ── Construir períodos de tacógrafo ──
    // Un período empieza cuando termina un descanso (fin_descanso)
    // o al inicio del histórico si no hay descanso previo
    const periodosTacho=[];
    let periodoActual={start:sorted[0].ts,entries:[],condTotal:0,extUsada:false};
    let extJornadas=0; // max 2 por semana

    sorted.forEach(e=>{
      periodoActual.entries.push(e);
      if(e.type==="fin_descanso"){
        // Cerrar período actual y abrir uno nuevo
        periodosTacho.push({...periodoActual,end:e.ts});
        periodoActual={start:e.ts,entries:[],condTotal:0,extUsada:false};
      }
    });
    // Último período (abierto)
    if(periodoActual.entries.length>0){
      periodosTacho.push({...periodoActual,end:sorted[sorted.length-1].ts,abierto:true});
    }

    // ── Analizar cada período ──
    periodosTacho.forEach(per=>{
      const ents=per.entries;
      if(!ents.length)return;

      // 1. CONDUCCIÓN CONTINUA dentro del período — EU 561/2006 Art.7
      let cStart=null,sp=0,firstPauseMin=0,pStart=null;
      ents.forEach(e=>{
        if(e.type==="inicio_conduccion"){
          if(!cStart)cStart=e.ts;
          pStart=null;
        }
        else if((e.type==="inicio_pausa"||e.type==="inicio_descanso")&&cStart&&!pStart){
          pStart=e.ts;
        }
        else if((e.type==="fin_pausa"||e.type==="fin_descanso")&&cStart&&pStart){
          const pd=diffMin(pStart,e.ts);pStart=null;
          if(pd>=45){cStart=null;sp=0;firstPauseMin=0;}
          else if(pd>=30&&sp===1){cStart=null;sp=0;firstPauseMin=0;}
          else if(pd>=15&&sp===0){sp=1;firstPauseMin=pd;}
          // <15 min no interrumpe
        }
        else if((e.type==="fin_conduccion"||e.type==="fin_jornada"||e.type==="fin_descanso")&&cStart){
          const dur=diffMin(cStart,e.ts);
          const efectiva=dur-(sp===1?firstPauseMin:0);
          if(efectiva>270){
            const ex=efectiva-270;
            const pct=(ex/270)*100;
            const grav=pct>50?"MUY GRAVE":pct>20?"GRAVE":"LEVE";
            infracciones.push({
              tipo:"Conducción continua excesiva",icon:"⊙",
              fecha:`${fmtD(cStart)} ${fmtT(cStart)}`,
              desc:`${fmtDur(efectiva)} sin pausa válida — exceso ${fmtDur(ex)}${sp===1?` · Pausa 1ª (${firstPauseMin}min) hecha, falta 2ª ≥30min`:""}`,
              gravedad:grav,
              multa:grav==="MUY GRAVE"?"601–4.601€":grav==="GRAVE"?"301–600€":"100–200€",
              sol:sp===1?`Completa la pausa fraccionada: 30 min más para resetear el contador.`:`Pausa obligatoria de 45 min (o 15+30 min en ese orden).`
            });
          }
          cStart=null;sp=0;firstPauseMin=0;pStart=null;
        }
      });

      // 2. CONDUCCIÓN DIARIA dentro del período
      // El período de tacógrafo permite máx 9h (o 10h extensible)
      const condPeriodo=ents.reduce((acc,e,i)=>{
        if(e.type==="fin_conduccion"){
          const prev=ents.slice(0,i).reverse().find(x=>x.type==="inicio_conduccion");
          if(prev)acc+=diffMin(prev.ts,e.ts);
        }
        return acc;
      },0);
      const maxPeriodo=extJornadas<2?600:540; // primera evaluación permisiva
      if(condPeriodo>600){
        const ex=condPeriodo-600;const pct=(ex/600)*100;
        const grav=pct>50?"MUY GRAVE":pct>20?"GRAVE":"LEVE";
        infracciones.push({
          tipo:"Jornada de tacógrafo excesiva",icon:"📋",
          fecha:fmtD(per.start),
          desc:`${fmtDur(condPeriodo)} conducidos en este período (máx 10h) — exceso ${fmtDur(ex)}`,
          gravedad:grav,
          multa:grav==="MUY GRAVE"?"601–4.601€":grav==="GRAVE"?"301–600€":"100–200€",
          sol:`Este período supera el máximo legal. El próximo descanso debe ser de mínimo ${condPeriodo>540?"11h":"9h"}.`
        });
        if(condPeriodo>540)extJornadas++;
      } else if(condPeriodo>540){
        extJornadas++; // jornada extendida usada
      }

      // 3. DESCANSO DIARIO — verificar que el descanso que cierra el período es suficiente
      if(!per.abierto){
        const descFin=ents.filter(e=>e.type==="fin_descanso").pop();
        const descIni=descFin?ents.slice(0,ents.indexOf(descFin)).reverse().find(e=>e.type==="inicio_descanso"):null;
        if(descFin&&descIni){
          const durDesc=diffMin(descIni.ts,descFin.ts);
          const minDesc=LIM.REST_R; // 9h mínimo (reducido)
          if(durDesc<minDesc){
            const falta=minDesc-durDesc;const pct=(falta/minDesc)*100;
            const grav=pct>33?"MUY GRAVE":pct>10?"GRAVE":"LEVE";
            infracciones.push({
              tipo:"Descanso diario insuficiente",icon:"🛏",
              fecha:`${fmtD(descIni.ts)} ${fmtT(descIni.ts)}`,
              desc:`Solo ${fmtDur(durDesc)} de descanso — mínimo ${fmtDur(minDesc)} — faltan ${fmtDur(falta)}`,
              gravedad:grav,
              multa:grav==="MUY GRAVE"?"601–4.601€":grav==="GRAVE"?"301–600€":"100–200€",
              sol:`Debes compensar ${fmtDur(falta)} extra en el siguiente descanso para cumplir la ley.`
            });
          }
        }
      }
    });

    // ── Análisis semanal (usando calcNorma que ya lo tiene) ──
    const lastTs=sorted[sorted.length-1].ts;
    const n=calcNorma(entries,lastTs);

    // 4. LÍMITE SEMANAL 56h
    if(n.weekDrive>LIM.WEEK){
      const ex=n.weekDrive-LIM.WEEK;const pct=(ex/LIM.WEEK)*100;
      const grav=pct>50?"MUY GRAVE":pct>20?"GRAVE":"LEVE";
      infracciones.push({
        tipo:"Límite semanal superado (56h)",icon:"📅",fecha:"Esta semana",
        desc:`${fmtDur(n.weekDrive)} conducidos esta semana — exceso ${fmtDur(ex)} sobre las 56h`,
        gravedad:grav,multa:grav==="MUY GRAVE"?"601–4.601€":"301–600€",
        sol:`Semana siguiente máximo ${fmtDur(Math.max(0,LIM.BIWEEK-n.biweekDrive))} para no superar el bisemanal de 90h.`
      });
    }

    // 5. LÍMITE BISEMANAL 90h
    if(n.biweekDrive>LIM.BIWEEK){
      const ex=n.biweekDrive-LIM.BIWEEK;const pct=(ex/LIM.BIWEEK)*100;
      const grav=pct>50?"MUY GRAVE":pct>20?"GRAVE":"LEVE";
      infracciones.push({
        tipo:"Límite bisemanal superado (90h)",icon:"📅",fecha:"2 semanas",
        desc:`${fmtDur(n.biweekDrive)} en 2 semanas — exceso ${fmtDur(ex)} sobre las 90h`,
        gravedad:grav,multa:grav==="MUY GRAVE"?"1.001–4.601€":"601–1.000€",
        sol:"Necesitas descanso semanal completo (45h) inmediatamente. Consulta con tu empresa."
      });
    }

    // 6. JORNADAS EXTENDIDAS — máx 2 por semana
    if(extJornadas>2){
      infracciones.push({
        tipo:`${extJornadas} jornadas de 10h esta semana`,icon:"⊙",fecha:"Esta semana",
        desc:`Solo puedes usar jornada extendida (10h) 2 veces por semana — usadas ${extJornadas}`,
        gravedad:"GRAVE",multa:"301–600€",
        sol:"Las jornadas de más de 9h que excedan de 2 por semana son infracción grave."
      });
    }

    // 7. DESCANSOS REDUCIDOS — máx 3 entre semanales
    if(n.redRests>LIM.MAX_RED){
      infracciones.push({
        tipo:"Exceso de descansos reducidos",icon:"🛏",fecha:"Este período",
        desc:`${n.redRests} descansos reducidos (9h) — máximo 3 entre dos descansos semanales`,
        gravedad:"GRAVE",multa:"301–600€",
        sol:"El siguiente descanso diario debe ser de mínimo 11h consecutivas sin excepción."
      });
    }

    return infracciones;
  }

  // ── Soluciones proactivas según estado actual ──
  function generaSoluciones(){
    const sols=[];
    // Conducción continua
    if(norma.rCont<=0)sols.push({tipo:"URGENTE",icon:"🚨",color:"#EF4444",titulo:"Para ahora mismo",desc:`Has superado el límite continuo. Pausa obligatoria de 45 min mínimo antes de continuar.`});
    else if(norma.rCont<=45)sols.push({tipo:"AVISO",icon:"⚠️",color:"#F97316",titulo:`Para en ${fmtDur(norma.rCont)} (~${Math.round(norma.rCont*80/60)} km)`,desc:`Busca área de descanso. ${norma.sp===1?"Ya tienes la 1ª parte (15 min) — necesitas 30 min más para resetear.":"Puedes hacer pausa fraccionada: 15 min ahora y 30 min más adelante."}`});
    // Jornada hoy
    if(norma.rDay<=0)sols.push({tipo:"URGENTE",icon:"🚨",color:"#EF4444",titulo:"Jornada diaria agotada",desc:`Has conducido ${fmtDur(norma.todayDrive)}. Necesitas descanso de ${norma.redRests<LIM.MAX_RED?"9h (reducido, llevas "+norma.redRests+"/3)":"11h (normal, ya usaste los 3 reducidos)"} antes de volver a conducir.`});
    else if(norma.rDay<=60&&norma.rDay>0)sols.push({tipo:"AVISO",icon:"⚠️",color:"#F97316",titulo:`Solo ${fmtDur(norma.rDay)} de jornada`,desc:`Hoy ya has conducido ${fmtDur(norma.todayDrive)}. ${norma.canExt&&norma.extUsed<2?"Puedes usar jornada extendida (10h) — te quedan "+(2-norma.extUsed)+" de esta semana.":"No puedes extender más esta semana."}`});
    // Semana
    if(norma.rWeek<=0)sols.push({tipo:"URGENTE",icon:"🚨",color:"#EF4444",titulo:"Límite semanal agotado (56h)",desc:"No puedes conducir más esta semana. Necesitas descanso semanal (mín 45h) para empezar nueva semana."});
    else if(norma.rWeek<=180)sols.push({tipo:"AVISO",icon:"📅",color:"#7C3AED",titulo:`Semana: ${fmtDur(norma.rWeek)} restantes`,desc:`Esta semana solo puedes conducir ${fmtDur(norma.rWeek)} más. Planifica tus rutas en consecuencia.`});
    // Bisemanal
    if(norma.rBiweek<=0)sols.push({tipo:"URGENTE",icon:"🚨",color:"#EF4444",titulo:"Límite bisemanal (90h) agotado",desc:"No puedes conducir hasta la siguiente semana. Consulta con tu empresa."});
    // Descansos reducidos
    if(norma.redRests>=3)sols.push({tipo:"INFO",icon:"🛏",color:"#7C3AED",titulo:"No puedes reducir más el descanso",desc:"Ya usaste 3 descansos reducidos (9h). El próximo descanso debe ser de mínimo 11h consecutivas."});
    // Deuda semanal
    if(norma.totalDebt>0){const d=norma.debts[0];sols.push({tipo:"INFO",icon:"📋",color:"#F97316",titulo:`Compensar ${fmtDur(norma.totalDebt)} de descanso semanal`,desc:`Tomaste descanso reducido el ${fmtD(d.takenAt)}. Debes compensar ${fmtDur(d.debtMin)} unido a un descanso de mínimo 9h antes del ${fmtD(d.dueBy)}.`});}
    // Todo bien
    if(sols.length===0)sols.push({tipo:"OK",icon:"✅",color:"#22C55E",titulo:"Todo en regla",desc:`Conduces correctamente. Puedes conducir ${fmtDur(norma.canDrive)} más (~${Math.round(norma.canDrive*80/60)} km) antes de la próxima pausa.`});
    return sols;
  }

  // ── Datos por período ──
  const periodos={
    hoy:{label:"HOY",entries:allSorted.filter(e=>sameDay(e.ts,today)),n:norma,
      resumen:[{l:"Conducido",v:fmtDur(norma.todayDrive),max:fmtDur(norma.maxDay),pct:(norma.todayDrive/norma.maxDay)*100},{l:"Continua",v:fmtDur(norma.cont),max:"4h30",pct:(norma.cont/270)*100},{l:"Disponible",v:fmtDur(norma.dispInfo?.activeUsed||0),max:"15h",pct:((norma.dispInfo?.activeUsed||0)/900)*100}]},
    semana:{label:"SEMANA",entries:allSorted.filter(e=>e.ts>=getMon(today)),n:norma,
      resumen:[{l:"Conducido",v:fmtDur(norma.weekDrive),max:"56h",pct:(norma.weekDrive/LIM.WEEK)*100},{l:"Jornadas 10h",v:`${norma.extUsed}/2`,max:"2",pct:(norma.extUsed/2)*100},{l:"Desc. reducidos",v:`${norma.redRests}/3`,max:"3",pct:(norma.redRests/3)*100}]},
    bisemanal:{label:"2 SEMANAS",entries:allSorted.filter(e=>e.ts>=new Date(+getMon(today)-7*24*3600*1000)),n:norma,
      resumen:[{l:"Conducido",v:fmtDur(norma.biweekDrive),max:"90h",pct:(norma.biweekDrive/LIM.BIWEEK)*100},{l:"Queda semana",v:fmtDur(norma.rWeek),max:"56h",pct:((LIM.WEEK-norma.rWeek)/LIM.WEEK)*100},{l:"Queda bisem.",v:fmtDur(norma.rBiweek),max:"90h",pct:((LIM.BIWEEK-norma.rBiweek)/LIM.BIWEEK)*100}]},
  };
  const p=periodos[periodo];
  const infracciones=analizaPeriodo(p.entries);
  const soluciones=generaSoluciones();
  const RC={URGENTE:{bg:"#FEF2F2",br:"#FECACA",tx:"#DC2626"},AVISO:{bg:"#FFF7ED",br:"#FED7AA",tx:"#C2410C"},INFO:{bg:"#F0F9FF",br:"#BAE6FD",tx:"#0369A1"},OK:{bg:"#F0FDF4",br:"#BBF7D0",tx:"#166534"},GRAVE:{bg:"#FFF7ED",br:"#FED7AA",tx:"#C2410C"},"MUY GRAVE":{bg:"#FEF2F2",br:"#FECACA",tx:"#DC2626"},LEVE:{bg:"#FEFCE8",br:"#FEF08A",tx:"#A16207"}};

  return(
    <div style={{padding:"14px 14px 80px",maxWidth:700,margin:"0 auto"}}>
      <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:4}}>🔍 ANÁLISIS NORMATIVO</div>
      <div style={{fontSize:13,color:"#64748B",marginBottom:14}}>Infracciones · Estado · Soluciones</div>

      {/* Selector período */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
        {Object.entries(periodos).map(([k,v])=>(
          <button key={k} onClick={()=>setPeriodo(k)} style={{border:"2px solid",borderRadius:11,padding:"10px 6px",fontSize:13,fontWeight:800,cursor:"pointer",background:periodo===k?"#1E293B":"white",color:periodo===k?"#F59E0B":"#64748B",borderColor:periodo===k?"#334155":"#E2E8F0"}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Resumen del período */}
      <div style={{background:"#1E293B",borderRadius:14,padding:"14px",marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:1.5,marginBottom:10}}>{p.label} — RESUMEN</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {p.resumen.map(({l,v,max,pct})=>{
            const col=pct>=100?"#EF4444":pct>=80?"#F97316":pct>=60?"#F59E0B":"#22C55E";
            return(
              <div key={l} style={{background:"rgba(255,255,255,.06)",borderRadius:9,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:800,color:col,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{v}</div>
                <div style={{fontSize:9,color:"#94A3B8",fontWeight:700,marginTop:3,marginBottom:6}}>{l.toUpperCase()}</div>
                <div style={{background:"#334155",borderRadius:3,height:4,overflow:"hidden"}}>
                  <div style={{background:col,height:"100%",width:`${Math.min(100,pct)}%`,borderRadius:3}}/>
                </div>
                <div style={{fontSize:9,color:"#64748B",marginTop:3}}>de {max}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Soluciones / qué hacer */}
      <div style={{fontSize:12,fontWeight:800,color:"#334155",letterSpacing:.8,marginBottom:8}}>💡 QUÉ DEBES HACER AHORA</div>
      {soluciones.map((sol,i)=>{const c=RC[sol.tipo]||RC.INFO;return(
        <div key={i} style={{background:c.bg,border:`1.5px solid ${c.br}`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
          <div style={{display:"flex",gap:9,alignItems:"flex-start"}}>
            <span style={{fontSize:20,flexShrink:0}}>{sol.icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:c.tx,marginBottom:3}}>{sol.titulo}</div>
              <div style={{fontSize:13,color:c.tx,lineHeight:1.5}}>{sol.desc}</div>
            </div>
          </div>
        </div>
      );})}

      {/* Infracciones detectadas */}
      <div style={{fontSize:12,fontWeight:800,color:"#334155",letterSpacing:.8,marginBottom:8,marginTop:16}}>
        🚨 INFRACCIONES EN {p.label} {infracciones.length>0?`(${infracciones.length})`:""}
      </div>
      {infracciones.length===0?(
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:12,padding:"16px",textAlign:"center",marginBottom:14}}>
          <div style={{fontSize:24,marginBottom:6}}>✅</div>
          <div style={{fontSize:15,fontWeight:700,color:"#166534"}}>Sin infracciones en {p.label.toLowerCase()}</div>
          <div style={{fontSize:13,color:"#64748B",marginTop:4}}>Buen trabajo. Sigue cumpliendo el EU 561/2006.</div>
        </div>
      ):(
        infracciones.map((inf,i)=>{const c=RC[inf.gravedad]||RC.GRAVE;return(
          <div key={i} style={{background:c.bg,border:`1.5px solid ${c.br}`,borderRadius:12,padding:"13px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:20,color:c.tx}}>{inf.icon}</span>
                <div><div style={{fontSize:14,fontWeight:800,color:c.tx}}>{inf.tipo}</div><div style={{fontSize:11,color:c.tx,marginTop:1}}>{inf.fecha}</div></div>
              </div>
              <span style={{background:c.br,color:c.tx,fontSize:10,fontWeight:800,borderRadius:6,padding:"3px 8px",flexShrink:0}}>{inf.gravedad}</span>
            </div>
            <div style={{fontSize:13,color:c.tx,marginBottom:8}}>{inf.desc}</div>
            <div style={{background:"rgba(255,255,255,.5)",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:800,color:c.tx,marginBottom:3}}>💡 SOLUCIÓN</div>
              <div style={{fontSize:12,color:c.tx,lineHeight:1.5}}>{inf.sol}</div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8}}>
              <div style={{fontSize:11,color:c.tx}}><strong>Multa:</strong> {inf.multa}</div>
              <div style={{fontSize:11,color:c.tx}}><strong>Art.:</strong> {inf.articulo||"Art. 19.2 LOTT"}</div>
            </div>
          </div>
        );})
      )}

      {/* Info desplazamiento */}
      <div style={{background:"#F0F9FF",border:"1.5px solid #BAE6FD",borderRadius:12,padding:"13px",marginTop:8}}>
        <div style={{fontSize:12,fontWeight:800,color:"#0369A1",marginBottom:7}}>ℹ️ CAMBIO DE CAMIÓN / DESPLAZAMIENTO</div>
        <div style={{fontSize:13,color:"#0369A1",lineHeight:1.7}}>
          Si te desplazan a otro camión como pasajero → <strong>⊠ Disponible</strong><br/>
          Si conduces tú hasta el otro camión → <strong>⊙ Conducción</strong><br/>
          El tiempo disponible cuenta en la ventana de 15h pero NO como conducción.
        </div>
      </div>
      <div style={{background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:10,padding:"10px 13px",marginTop:8,fontSize:11,color:"#64748B",lineHeight:1.5}}>
        ⚠️ Análisis orientativo. Ante una sanción real consulta con abogado especializado en transportes.
      </div>
    </div>
  );
}
const filterBtn={border:"1.5px solid",borderRadius:20,padding:"5px 11px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0};

const PTYPES={
  seguro:      {label:"Seguro",         icon:"🟢",color:"#22C55E",desc:"Parking recomendado",expDays:90},
  inseguro:    {label:"Inseguro",       icon:"🔴",color:"#EF4444",desc:"Robos o peligroso",expDays:30},
  osm_parking: {label:"Área camiones",  icon:"🅿", color:"#64748B",desc:"OpenStreetMap",expDays:null},
};
// Alias para compatibilidad con datos antiguos — NO aparecen en filtros
const PTYPES_COMPAT={
  parking_seguro:{...({label:"Seguro",icon:"🟢",color:"#22C55E",expDays:90})},
  punto_negro:   {...({label:"Inseguro",icon:"🔴",color:"#EF4444",expDays:30})},
  servicios:     {...({label:"Servicios",icon:"🔵",color:"#3B82F6",expDays:30})},
  frontera:      {...({label:"Frontera",icon:"🟡",color:"#F59E0B",expDays:7})},
};
const PARK_KEY="parkings_v1";
function daysAgo(isoStr){return Math.floor((Date.now()-new Date(isoStr).getTime())/(86400000));}
function daysLeft(p){const PT=getPT(p.type);if(!PT?.expDays||!p.addedAt)return null;return PT.expDays-daysAgo(p.addedAt);}
function isExpired(p){if(p.osm)return false;const dl=daysLeft(p);return dl!==null&&dl<=0;}
const getPT=(type)=>PTYPES[type]||PTYPES_COMPAT[type]||PTYPES.seguro;

async function loadParkings(){
  try{
    const allKeys=Object.keys(localStorage).filter(k=>k.startsWith(PARK_KEY+":"));const keys={keys:allKeys};
    if(!keys||!keys.keys?.length)return[];
    const items=await Promise.all(keys.keys.map(async k=>{
      try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(_){return null;}
    }));
    const valid=items.filter(Boolean);
    // Auto-eliminar expirados
    const expired=valid.filter(isExpired);
    for(const p of expired)await deleteParking(p.id);
    return valid.filter(p=>!isExpired(p));
  }catch(_){return[];}
}
async function saveParking(p){try{localStorage.setItem(`${PARK_KEY}:${p.id}`,JSON.stringify(p));}catch(_){}}
async function deleteParking(id){try{localStorage.removeItem(`${PARK_KEY}:${id}`);}catch(_){}}


// ─────────────────────────────────────────────────────────────
//  ¿LLEGO? — Análisis de viabilidad de ruta
// ─────────────────────────────────────────────────────────────
function LlegoView({norma,prof,dark}){
  const[fromTxt,setFromTxt]=useState(prof.ciudad||"");
  const[toTxt,setToTxt]=useState("");
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[gpsName,setGpsName]=useState("");
  const[gpsCoord,setGpsCoord]=useState(null);
  const[gpsLoading,setGpsLoading]=useState(false);
  const[modoManual,setModoManual]=useState(false);

  const bg=dark?"#0F172A":"#F0F4F8";
  const card=dark?"#1E293B":"white";
  const tx=dark?"#F1F5F9":"#0F172A";
  const su=dark?"#64748B":"#94A3B8";

  function pedirGPS(){
    setGpsLoading(true);
    if(!navigator.geolocation){setGpsLoading(false);setModoManual(true);return;}
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const{latitude:lat,longitude:lon}=pos.coords;
        setGpsCoord({lat,lon});
        setGpsLoading(false); // ya tenemos coords — no esperamos al nombre
        setGpsName(`${lat.toFixed(3)}, ${lon.toFixed(3)}`);
        // Nombre en segundo plano
        reverseGeocode(lat,lon).then(name=>setGpsName(name)).catch(()=>{});
      },
      ()=>{setGpsLoading(false);setModoManual(true);},
      {enableHighAccuracy:false,timeout:10000,maximumAge:300000}
    );
  }

  useEffect(()=>{
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const{latitude:lat,longitude:lon}=pos.coords;
        setGpsCoord({lat,lon});
        setGpsLoading(false);
        setGpsName(`${lat.toFixed(3)}, ${lon.toFixed(3)}`);
        reverseGeocode(lat,lon).then(name=>setGpsName(name)).catch(()=>{});
      },
      ()=>setGpsLoading(false),
      {enableHighAccuracy:false,timeout:5000,maximumAge:300000}
    );
  },[]);

  async function analizar(){
    const destino=toTxt.trim();
    if(!destino){setError("Introduce el destino");return;}
    setError("");setLoading(true);setResult(null);
    try{
      let from;
      if(gpsCoord){
        from={lat:gpsCoord.lat,lon:gpsCoord.lon,name:gpsName||"Tu ubicación"};
      } else if(fromTxt.trim()){
        from=await geocode(fromTxt.trim());
      } else {
        setError("Introduce tu ciudad de origen");setLoading(false);return;
      }
      const to=await geocode(destino);
      const route=await getRoute(from,to);
      // Añadir velocidad media real al tiempo si la ruta es de coche (80km/h para camión)
      const minsConduccion=Math.max(route.mins, Math.round(route.km/80*60));
      const plan=buildPlan(minsConduccion,{
        contUsed:norma.cont||0,
        dayUsed:norma.todayDrive||0,
        weekUsed:norma.weekDrive||0,
        extUsed:norma.extUsed||0,
        useReduced:true,useExtended:true,
        start:new Date(),
      });
      const descansos=plan.segs.filter(s=>["rest","rest_r","wrest"].includes(s.type));
      const paradas=plan.segs.filter(s=>["break","b15","b30"].includes(s.type));
      let status,color,icon,titulo,subtitulo;
      if(descansos.length===0&&paradas.length===0){
        status="ok";color="#22C55E";icon="✅";titulo="LLEGAS SIN PARAR";subtitulo="No necesitas pausas obligatorias en ruta";
      } else if(descansos.length===0&&paradas.length>0){
        status="warn";color="#F59E0B";icon="⚠️";titulo="LLEGAS HOY";subtitulo=`Con ${paradas.length} pausa${paradas.length>1?"s":""} obligatoria${paradas.length>1?"s":""} de 45 min`;
      } else if(descansos.length===1){
        status="rest";color="#F97316";icon="🛌";titulo="LLEGAS CON 1 DESCANSO";subtitulo="Necesitas parar a dormir en ruta";
      } else {
        status="multi";color="#EF4444";icon="🔴";titulo=`LLEGAS EN ${descansos.length+1} DÍAS`;subtitulo=`${descansos.length} descansos necesarios`;
      }
      const d0=descansos[0];
      const puntoDescanso=d0&&d0.driven>0&&route.mins>0?{
        km:Math.round((d0.driven/route.mins)*route.km),
        hora:new Date(d0.start),
      }:null;
      const llegada=plan.arrival instanceof Date?plan.arrival:new Date(plan.arrival);
      setResult({status,color,icon,titulo,subtitulo,route,routeMins:minsConduccion,plan,paradas,descansos,llegada,puntoDescanso,from,to});
    }catch(e){
      setError(e.message||"Error al calcular la ruta");
    }finally{setLoading(false);}
  }

  return(
    <div style={{padding:"16px 14px 80px",background:bg,minHeight:"calc(100vh - 160px)"}}>
      <div style={{fontSize:11,fontWeight:800,color:"#F59E0B",letterSpacing:1.5,marginBottom:4}}>¿LLEGARÉ A DESTINO?</div>
      <div style={{fontSize:13,color:su,marginBottom:16,lineHeight:1.5}}>Calcula si puedes llegar teniendo en cuenta tu jornada actual</div>

      {/* GPS origen */}
      {!modoManual&&(
        <div style={{background:gpsCoord?"#052e16":"#1E293B",border:`1.5px solid ${gpsCoord?"#22C55E":"#334155"}`,borderRadius:10,padding:"11px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{gpsLoading?"⌛":gpsCoord?"📍":"⊙"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:su}}>TU UBICACIÓN</div>
            <div style={{fontSize:13,fontWeight:600,color:gpsCoord?"#86EFAC":su,marginTop:1}}>
              {gpsLoading?"Obteniendo GPS...":gpsCoord?gpsName||"Ubicación obtenida":"Pulsa el botón para obtener tu posición"}
            </div>
          </div>
          {!gpsLoading&&!gpsCoord&&(
            <button onClick={pedirGPS}
              style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:8,padding:"9px 14px",fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>
              📍 Obtener
            </button>
          )}
          {!gpsLoading&&(
            <button onClick={()=>setModoManual(true)} style={{background:"transparent",border:"1px solid #334155",borderRadius:7,padding:"5px 10px",fontSize:11,color:su,cursor:"pointer",flexShrink:0}}>Manual</button>
          )}
        </div>
      )}
      {modoManual&&(
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1,marginBottom:6}}>🟢 ORIGEN (tu ciudad actual)</div>
          <div style={{display:"flex",gap:8}}>
            <input value={fromTxt} onChange={e=>setFromTxt(e.target.value)}
              placeholder="Almería, Madrid, Valencia..."
              style={{flex:1,background:card,border:`1.5px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:10,padding:"12px 14px",fontSize:14,color:tx,outline:"none"}}/>
            <button onClick={()=>{setModoManual(false);pedirGPS();}} style={{background:"#334155",color:"#94A3B8",border:"none",borderRadius:8,padding:"0 12px",fontSize:11,cursor:"pointer"}}>GPS</button>
          </div>
        </div>
      )}

      {/* Estado actual */}
      <div style={{background:card,borderRadius:10,padding:"11px 14px",marginBottom:12,border:`1px solid ${dark?"#334155":"#E2E8F0"}`}}>
        <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1,marginBottom:8}}>TU ESTADO NORMATIVO</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center"}}>
          {[
            {l:"Hoy",v:fmtDur(norma.todayDrive||0),c:"#F59E0B"},
            {l:"Jornada restante",v:fmtDur(norma.rDay||0),c:norma.rDay<=60?"#EF4444":norma.rDay<=120?"#F97316":"#22C55E"},
            {l:"Semana",v:fmtDur(norma.weekDrive||0),c:"#A78BFA"},
          ].map(({l,v,c})=>(
            <div key={l}><div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div><div style={{fontSize:10,color:su,marginTop:2}}>{l}</div></div>
          ))}
        </div>
      </div>

      {/* Destino */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1,marginBottom:6}}>🔴 DESTINO</div>
        <input value={toTxt} onChange={e=>setToTxt(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&analizar()}
          placeholder="Barcelona, París, Hamburgo..."
          style={{width:"100%",background:card,border:`1.5px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:10,padding:"13px 14px",fontSize:15,color:tx,outline:"none",boxSizing:"border-box"}}/>
      </div>
      {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#DC2626",marginBottom:10}}>{error}</div>}
      <button onClick={analizar} disabled={loading||(!gpsCoord&&!fromTxt.trim()&&!modoManual)}
        style={{width:"100%",background:loading?"#334155":"#F59E0B",color:loading?"#64748B":"#0F172A",border:"none",borderRadius:12,padding:"16px",fontSize:16,fontWeight:800,cursor:loading?"default":"pointer",marginBottom:16}}>
        {loading?"⌛ Calculando...":"🎯 ANALIZAR"}
      </button>

      {result&&(()=>{try{return(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Veredicto */}
          <div style={{background:result.color+"18",border:`2px solid ${result.color}`,borderRadius:14,padding:"20px",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:6}}>{result.icon}</div>
            <div style={{fontSize:22,fontWeight:900,color:result.color}}>{result.titulo}</div>
            <div style={{fontSize:13,color:su,marginTop:4}}>{result.subtitulo}</div>
          </div>
          {/* Datos */}
          <div style={{background:card,borderRadius:12,padding:"14px",border:`1px solid ${dark?"#334155":"#E2E8F0"}`}}>
            <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1,marginBottom:10}}>DATOS DE LA RUTA</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {l:"Distancia",v:`${result.route.km} km`,c:"#F59E0B"},
                {l:"Solo conducción",v:fmtDur(result.routeMins||result.route.mins),c:"#F59E0B"},
                {l:"Con pausas",v:fmtDur((result.plan.driveTotal||0)+(result.plan.restTotal||0)),c:"#22C55E"},
                {l:"Llegada estimada",v:result.llegada?fmtT(result.llegada):"—",c:"#A78BFA"},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:dark?"#0F172A":"#F8FAFC",borderRadius:8,padding:"10px"}}>
                  <div style={{fontSize:10,color:su,marginBottom:2}}>{l.toUpperCase()}</div>
                  <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Descanso en ruta */}
          {result.puntoDescanso&&(
            <div style={{background:"#1a0e05",border:"2px solid #F97316",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:10,fontWeight:800,color:"#F97316",letterSpacing:1,marginBottom:6}}>🛌 DESCANSO NECESARIO EN RUTA</div>
              <div style={{fontSize:15,fontWeight:700,color:"#FED7AA"}}>Para a los ~{result.puntoDescanso.km} km</div>
              <div style={{fontSize:13,color:"#F97316",marginTop:4}}>Hacia las {fmtT(result.puntoDescanso.hora)} · Busca parking seguro</div>
              {result.descansos.length>1&&<div style={{fontSize:12,color:"#94A3B8",marginTop:4}}>+ {result.descansos.length-1} descanso{result.descansos.length>2?"s":""} más</div>}
            </div>
          )}
          {/* Pausas obligatorias */}
          {result.paradas.length>0&&(
            <div style={{background:card,borderRadius:12,padding:"14px",border:`1px solid ${dark?"#334155":"#E2E8F0"}`}}>
              <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1,marginBottom:10}}>⏸ PAUSAS EN RUTA ({result.paradas.length})</div>
              {result.paradas.map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",paddingBottom:6,marginBottom:6,borderBottom:`1px solid ${dark?"#1E293B":"#F1F5F9"}`}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:tx}}>Pausa {i+1} — {fmtDur(p.dur)}</div>
                    <div style={{fontSize:11,color:su,marginTop:1}}>~km {p.driven&&result.routeMins>0?Math.round((p.driven/result.routeMins)*result.route.km):0}</div>
                  </div>
                  <div style={{fontSize:12,color:"#6366F1",fontWeight:700}}>{fmtT(new Date(p.start))}</div>
                </div>
              ))}
            </div>
          )}
          {result.status==="ok"&&(
            <div style={{background:"#052e16",border:"1px solid #22C55E",borderRadius:12,padding:"14px",fontSize:14,color:"#86EFAC",lineHeight:1.7}}>
              🟢 <strong style={{color:"white"}}>Puedes salir ahora.</strong> Llegas a {result.to?.name||"destino"} sin descanso en ruta. Recuerda las pausas de 45 min.
            </div>
          )}
        </div>
      );}catch(err){return <div style={{background:"#1a0505",border:"1px solid #EF4444",borderRadius:12,padding:"14px",color:"#FCA5A5",fontSize:13}}>Error al mostrar resultado: {err.message}</div>;}})()}
    </div>
  );
}

function EmpresaPlanificadorRuta({dark=false}){
  const[fromTxt,setFromTxt]=useState("");
  const[toTxt,setToTxt]=useState("");
  const[waypoint,setWaypoint]=useState("");
  const[velocidad,setVelocidad]=useState(80);
  const[salidaMode,setSalidaMode]=useState("ahora");
  const[salidaManual,setSalidaManual]=useState(()=>toDTL(new Date()));
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const card=dark?"#1E293B":"#FFFFFF";
  const bg=dark?"#0F172A":"#F8FAFC";
  const tx=dark?"#F1F5F9":"#0F172A";
  const su=dark?"#94A3B8":"#64748B";
  const normaEmpresaNeutral={cont:0,todayDrive:0,weekDrive:0,extUsed:0};

  async function calcular(){
    if(!fromTxt.trim()||!toTxt.trim()){setError("Indica origen y destino");return;}
    setError("");setLoading(true);setResult(null);
    try{
      const from=await geocode(fromTxt.trim());
      const to=await geocode(toTxt.trim());
      let route;
      if(waypoint.trim()){
        const via=await geocode(waypoint.trim());
        const r1=await getRoute(from,via,velocidad);
        const r2=await getRoute(via,to,velocidad);
        route={km:r1.km+r2.km,mins:r1.mins+r2.mins,real:r1.real&&r2.real};
      }else{
        route=await getRoute(from,to,velocidad);
      }
      const minsConduccion=Math.max(route.mins,Math.round(route.km/velocidad*60));
      const salidaBase=salidaMode==="manual"&&salidaManual
        ? new Date(salidaManual)
        : new Date();
      if(Number.isNaN(salidaBase.getTime()))throw new Error("Fecha/hora de salida inválida");
      const plan=buildPlan(minsConduccion,normaEmpresaNeutral,{
        contUsed:0,
        dayUsed:0,
        weekUsed:0,
        extUsed:0,
        start:salidaBase,
        km:route.km,
      });
      const rests=(plan.segs||[]).filter(s=>s.type!=="conduccion");
      const breaks=rests.filter(s=>String(s.type).startsWith("pausa"));
      const dailyRests=rests.filter(s=>s.type==="descanso").length;
      const weeklyRests=rests.filter(s=>s.type==="descanso_semana").length;
      setResult({
        km:Math.round(route.km),
        minsConduccion,
        eta:plan.arrival instanceof Date?plan.arrival:new Date(plan.arrival),
        breaks:breaks.length,
        dailyRests,
        weeklyRests,
        real:!!route.real,
        salidaBase,
      });
    }catch(e){
      setError(e?.message||"No se pudo calcular la planificación");
    }finally{
      setLoading(false);
    }
  }

  const inputStyle={width:"100%",background:bg,border:`1px solid ${dark?"#334155":"#CBD5E1"}`,borderRadius:10,padding:"11px 12px",fontSize:14,color:tx,outline:"none",boxSizing:"border-box"};
  return(
    <div style={{padding:"12px 14px 84px"}}>
      <div style={{background:card,border:`1px solid ${dark?"#334155":"#DBE4EE"}`,borderRadius:14,padding:"14px",boxShadow:dark?"none":"0 1px 2px rgba(15,23,42,.05)"}}>
        <div style={{fontSize:13,fontWeight:700,color:tx,marginBottom:4}}>Planificador operacional</div>
        <div style={{fontSize:11,color:su,marginBottom:12}}>Modelo neutro empresa (sin tacógrafo vivo del conductor)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <input value={fromTxt} onChange={e=>setFromTxt(e.target.value)} placeholder="Origen" style={inputStyle}/>
          <input value={toTxt} onChange={e=>setToTxt(e.target.value)} placeholder="Destino" style={inputStyle}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,marginBottom:10}}>
          <input value={waypoint} onChange={e=>setWaypoint(e.target.value)} placeholder="Punto intermedio (opcional)" style={inputStyle}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 10px",border:`1px solid ${dark?"#334155":"#CBD5E1"}`,borderRadius:10,background:bg}}>
            <span style={{fontSize:11,color:su,fontWeight:700}}>KM/H</span>
            <input type="number" min={60} max={100} step={1} value={velocidad} onChange={e=>setVelocidad(Math.min(100,Math.max(60,Number(e.target.value)||80)))} style={{width:52,background:"transparent",border:"none",outline:"none",color:tx,fontSize:14,fontWeight:700}}/>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:6}}>Salida prevista</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            {[{id:"ahora",label:"Ahora"},{id:"manual",label:"Fecha y hora manual"}].map(o=>(
              <button key={o.id} type="button" onClick={()=>setSalidaMode(o.id)}
                style={{background:salidaMode===o.id?"#E0ECFF":bg,border:`1px solid ${salidaMode===o.id?"#93C5FD":(dark?"#334155":"#CBD5E1")}`,borderRadius:10,padding:"9px 10px",fontSize:12,fontWeight:700,color:salidaMode===o.id?"#1D4ED8":tx,cursor:"pointer"}}>
                {o.label}
              </button>
            ))}
          </div>
          {salidaMode==="manual"&&(
            <input type="datetime-local" value={salidaManual} onChange={e=>setSalidaManual(e.target.value)} style={inputStyle}/>
          )}
        </div>
        <button onClick={calcular} disabled={loading} style={{width:"100%",background:loading?"#94A3B8":"#2563EB",color:"white",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer"}}>
          {loading?"Calculando...":"Calcular planificación"}
        </button>
        {error&&<div style={{marginTop:10,fontSize:12,color:"#DC2626",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 10px"}}>{error}</div>}
      </div>
      {result&&(
        <div style={{marginTop:12,background:card,border:`1px solid ${dark?"#334155":"#DBE4EE"}`,borderRadius:14,padding:"14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
            {[{l:"Distancia",v:`${result.km} km`},{l:"Conducción",v:fmtDur(result.minsConduccion)},{l:"Pausas",v:String(result.breaks)},{l:"Descanso diario",v:String(result.dailyRests)}].map(x=>(
              <div key={x.l} style={{background:bg,borderRadius:10,padding:"9px 10px"}}>
                <div style={{fontSize:10,color:su,fontWeight:700}}>{x.l}</div>
                <div style={{fontSize:16,color:tx,fontWeight:800,marginTop:2}}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,fontSize:13,color:tx,fontWeight:700}}>
            ETA normativa: {formatOperationalEtaLabel(result.eta)||"—"}
          </div>
          <div style={{marginTop:4,fontSize:11,color:su}}>
            Salida prevista: {result.salidaBase?.toLocaleString?.("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})||"—"}
          </div>
          <div style={{marginTop:4,fontSize:11,color:su}}>
            {result.real?"Ruta real OSRM":"Ruta estimada fallback"} · Velocidad media {velocidad} km/h · Descanso semanal {result.weeklyRests}
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
//  NORA — Asistente de voz para la pantalla de ruta
// ─────────────────────────────────────────────────────────────
function useNora({norma,viajeActivo,active}){
  const recogRef=useRef(null);
  const restartRef=useRef(null);
  const[estado,setEstado]=useState("inactiva");
  const[lastText,setLastText]=useState("");
  const[error,setError]=useState("");
  const SpeechRecognition=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);
  const n=t=>t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[¿¡]/g,"");
  const fmtM=m=>m>=60?`${Math.floor(m/60)} hora${Math.floor(m/60)>1?"s":""} y ${m%60} minutos`:`${m} minutos`;
  const has=(t,...kw)=>kw.some(k=>n(t).includes(n(k)));
  function getPlan(){
    if(!viajeActivo?.km)return null;
    try{const mins=Math.round(viajeActivo.km/(viajeActivo.velocidad||80)*60);
      return buildPlan(mins,null,{contUsed:norma?.cont||0,dayUsed:norma?.todayDrive||0,weekUsed:norma?.weekDrive||0,useReduced:true,useExtended:true,start:new Date(),km:viajeActivo.km});
    }catch{return null;}
  }
  function getRouteStatus(){
    if(!norma)return"No tengo datos de tu jornada todavía.";
    const plan=getPlan(),rCont=norma.rCont||0;
    if(plan){const eta=formatOperationalEtaLabel(plan.arrival)||"ETA pendiente";return rCont<60?`Vas bien hacia ${viajeActivo.destino}, pero para en menos de una hora. ETA ${eta}.`:`Todo en orden hacia ${viajeActivo.destino}. ETA ${eta}.`;}
    if(rCont<=0)return"Para ya. Has alcanzado el límite de conducción continua.";
    if(rCont<60)return`Vas bien pero para en ${rCont} minutos como máximo.`;
    return`Todo correcto. Puedes seguir ${fmtM(rCont)} más antes de parar.`;
  }
  function getArrivalEstimate(){
    const plan=getPlan();if(!plan)return"No tienes destino configurado. Dime adónde vas para calcularlo.";
    return`Llegada estimada a ${viajeActivo.destino}: ${formatOperationalEtaLabel(plan.arrival)||"ETA pendiente"}.`;
  }
  function getRemainingTime(){
    if(!norma)return"Sin datos de jornada.";
    const rCont=norma.rCont||0,rDay=norma.rDay||0,plan=getPlan();
    const base=`Antes de parar te quedan ${fmtM(rCont)}. En la jornada de hoy te quedan ${fmtM(rDay)}.`;
    return plan&&plan.nDias>1?`${base} Para llegar a ${viajeActivo.destino} te quedan ${plan.nDias} días.`:base;
  }
  function getBestStop(){
    if(!norma)return"Sin datos.";
    const rCont=norma.rCont||0;
    if(rCont<=0)return"Debes parar ahora mismo. Cualquier área de servicio cerca tuyo vale.";
    if(rCont<=45)return`Tienes ${rCont} minutos. Para en la próxima área que veas.`;
    const km=Math.round(rCont/60*((viajeActivo?.velocidad)||80));
    return`Puedes avanzar unos ${km} kilómetros más. Busca un parking de camiones seguro.`;
  }
  function getNextBreakTime(){
    if(!norma)return"Sin datos.";
    const rCont=norma.rCont||0;
    if(rCont<=0)return"Ya deberías haber parado. Para ahora.";
    const parada=new Date(Date.now()+rCont*60000);
    const hora=`${String(parada.getHours()).padStart(2,"0")}:${String(parada.getMinutes()).padStart(2,"0")}`;
    return`Debes parar como muy tarde a las ${hora}. Te quedan ${fmtM(rCont)}.`;
  }
  function getTightStatus(){
    if(!norma)return"Sin datos.";
    const rCont=norma.rCont||0,rDay=norma.rDay||0;
    if(rCont<30)return"Vas muy justo. Menos de media hora antes de parar obligatoriamente.";
    if(rDay<60)return"Vas justo de jornada. Menos de una hora en la jornada de hoy.";
    return"Vas bien de tiempo. No estás en ningún límite crítico ahora mismo.";
  }
  function getContinueOrStopAdvice(){
    if(!norma)return"Sin datos.";
    const rCont=norma.rCont||0,rDay=norma.rDay||0,plan=getPlan();
    if(rCont<30)return"No te compensa seguir. Para ya antes de que te multen.";
    if(rDay<90)return"Tienes poco tiempo de jornada. Para y descansa. Mañana arrancas mejor.";
    if(plan&&rCont>90)return`Sigue. ETA a destino: ${formatOperationalEtaLabel(plan.arrival)||"pendiente"}, sin forzar los límites.`;
    return"Puedes seguir. Vigila el tiempo restante.";
  }
  function getLegalStatus(){
    if(!norma)return"Sin datos.";
    const rCont=norma.rCont||0,rDay=norma.rDay||0,rWeek=norma.rWeek||0;
    const p=[];
    if(rCont<=0)p.push("superado la conducción continua");
    if(rDay<=0)p.push("superado el límite diario");
    if(rWeek<=0)p.push("agotado las horas semanales");
    if(p.length)return`Atención, estás fuera de normativa: ${p.join(" y ")}. Para inmediatamente.`;
    if(rCont<30||rDay<60)return"Estás dentro de la ley pero muy al límite. Para pronto.";
    return`Vas completamente legal. ${fmtM(rCont)} de conducción disponible, ${fmtM(rDay)} de jornada.`;
  }
  function getTodayStatus(){
    if(!norma)return"Sin datos de hoy.";
    const hoy=norma.todayDrive||0,rDay=norma.rDay||0;
    return`Hoy llevas ${fmtM(hoy)} conducidos. Te quedan ${fmtM(rDay)} de jornada. ${rDay<120?"Busca dónde parar pronto.":"Vas bien."}`;
  }
  function getTomorrowPreview(){
    if(!norma)return"Sin datos.";
    const red=norma.redRests||0,rWeek=norma.rWeek||0;
    const max=Math.min(rWeek,540);
    if(max<=0)return"Mañana no puedes conducir. Agotaste las horas semanales.";
    return`Mañana podrás conducir hasta ${fmtM(max)}. ${red<3?"Puedes usar descanso reducido de 9 horas esta noche.":"Necesitas 11 horas de descanso completo."}`;
  }
  function getTimeLossAnalysis(){
    if(!norma)return"Sin datos.";
    const plan=getPlan(),rCont=norma.rCont||0;
    if(!plan)return"No tienes destino configurado. No puedo analizar el tiempo.";
    if(rCont<60)return"Llevas mucho tiempo conduciendo. Una pausa ahora te ahorrará tiempo después.";
    return`Vas según el plan. ETA a destino: ${formatOperationalEtaLabel(plan.arrival)||"pendiente"}. Sin pérdida de tiempo significativa detectada.`;
  }
  function detectIntent(raw){
    const t=raw;
    if(has(t,"como vamos","como voy","estado","voy bien"))return getRouteStatus;
    if(has(t,"llego hoy","cuando llego","cuándo llego","cuanto tardo","llego"))return getArrivalEstimate;
    if(has(t,"cuanto me queda","cuanto falta","cuanto queda"))return getRemainingTime;
    if(has(t,"donde paro","donde deberia parar","donde descansar"))return getBestStop;
    if(has(t,"cuando paro","cuanto me queda para parar","cuando tengo que parar"))return getNextBreakTime;
    if(has(t,"voy justo","voy mal","voy bien de tiempo"))return getTightStatus;
    if(has(t,"me compensa seguir","sigo o paro","sigo conduciendo"))return getContinueOrStopAdvice;
    if(has(t,"voy legal","cumplo horas","puedo seguir"))return getLegalStatus;
    if(has(t,"como voy hoy","que tal hoy","hoy como voy"))return getTodayStatus;
    if(has(t,"manana como voy","que me queda manana","manana como lo tengo","mañana"))return getTomorrowPreview;
    if(has(t,"pierdo tiempo","estoy perdiendo tiempo","voy mal de tiempo"))return getTimeLossAnalysis;
    return null;
  }
  function responder(texto){setEstado("respondiendo");setLastText(texto);speakNatural(texto);setTimeout(()=>setEstado("escuchando"),3500);}
  function procesarTexto(txt){
    const norm=n(txt);
    // Detectar palabra clave "nora" o "ora"
    if(!norm.includes("nora")&&!norm.includes("ora"))return;
    setEstado("procesando");
    // Detectar intención sobre el texto normalizado
    const fn=detectIntent(norm);
    const resp=fn?fn():"No entendí bien. Prueba: cómo vamos, dónde paro, cuándo llego, voy legal...";
    setTimeout(()=>responder(resp),300);
  }
  function iniciar(){
    if(!SpeechRecognition||!active)return;
    if(recogRef.current)try{recogRef.current.abort();}catch(_){}
    const r=new SpeechRecognition();
    r.lang="es-ES";r.continuous=false;r.interimResults=false;r.maxAlternatives=1;
    recogRef.current=r;
    r.onstart=()=>{setEstado("escuchando");setError("");};
    r.onresult=e=>procesarTexto(e.results[0][0].transcript);
    r.onerror=e=>{if(e.error==="not-allowed"){setError("Permiso denegado");setEstado("inactiva");}else if(e.error!=="no-speech"&&e.error!=="aborted")setError(e.error);};
    r.onend=()=>{clearTimeout(restartRef.current);restartRef.current=setTimeout(iniciar,1000);};
    try{r.start();}catch(e){setError(e.message);}
  }
  function detener(){clearTimeout(restartRef.current);if(recogRef.current)try{recogRef.current.abort();}catch(_){}recogRef.current=null;setEstado("inactiva");}
  useEffect(()=>{if(active&&SpeechRecognition)iniciar();return detener;},[active]);
  return{estado,lastText,error,iniciar,detener,SpeechRecognition:!!SpeechRecognition};
}

function NoraWidget({norma,viajeActivo,active}){
  // NoraWidget en mapa — solo muestra estado, sin auto-escucha
  return null; // Nora vive en el modal de HOY
}

function NoraModal({norma,viajeActivo,onClose}){
  const SR=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);
  const[fase,setFase]=useState("idle"); // idle | listening | thinking | speaking
  const[lastQ,setLastQ]=useState("");
  const[lastA,setLastA]=useState("");
  const[error,setError]=useState("");
  const recRef=useRef(null);
  const timeoutRef=useRef(null);

  // ── helpers de norma ──
  const n=t=>t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[¿¡]/g,"");
  const fmtM=m=>{if(!m||m<=0)return"0 minutos";const h=Math.floor(m/60),min=Math.round(m%60);return h&&min?`${h} hora${h>1?"s":""} y ${min} minutos`:h?`${h} hora${h>1?"s":""}`:`${min} minutos`;};
  const has=(t,...kw)=>kw.some(k=>n(t).includes(n(k)));

  function getPlan(){
    if(!viajeActivo?.km)return null;
    try{const mins=Math.round(viajeActivo.km/(viajeActivo.velocidad||80)*60);
      return buildPlan(mins,null,{contUsed:norma?.cont||0,dayUsed:norma?.todayDrive||0,weekUsed:norma?.weekDrive||0,useReduced:true,useExtended:true,start:new Date(),km:viajeActivo.km});
    }catch{return null;}
  }

  function responder(pregunta){
    if(!norma)return"No tengo datos de tu jornada todavía.";
    const plan=getPlan();
    const rCont=norma.rCont||0,rDay=norma.rDay||0,rWeek=norma.rWeek||0;
    const hoy=norma.todayDrive||0;
    const t=n(pregunta);

    // Llegada
    if(has(t,"llego","cuando llego","cuándo llego","cuanto tardo")){
      if(!plan)return"No tienes destino configurado. Añade un destino desde la pantalla principal.";
      return`Llegada estimada a ${viajeActivo.destino}: ${formatOperationalEtaLabel(plan.arrival)||"ETA pendiente"}.`;
    }

    // Cuándo parar
    if(has(t,"cuando paro","cuándo paro","cuando tengo que parar","cuanto me queda para parar")){
      if(rCont<=0)return"Ya deberías haber parado. Para ahora mismo.";
      const parada=new Date(Date.now()+rCont*60000);
      const hora=`${String(parada.getHours()).padStart(2,"0")}:${String(parada.getMinutes()).padStart(2,"0")}`;
      return`Debes parar como muy tarde a las ${hora}. Te quedan ${fmtM(rCont)}.`;
    }

    // Dónde parar
    if(has(t,"donde paro","dónde paro","donde descansar","donde deberia parar")){
      if(rCont<=0)return"Para ahora mismo en cualquier área que tengas cerca.";
      const km=Math.round(rCont/60*(viajeActivo?.velocidad||80));
      return`Puedes avanzar unos ${km} kilómetros antes de parar. Busca un parking de camiones seguro en el mapa.`;
    }

    // Cuánto queda
    if(has(t,"cuanto me queda","cuanto falta","cuanto queda","cuánto me queda","cuánto falta")){
      const base=`Antes de parar te quedan ${fmtM(rCont)}. En la jornada de hoy te quedan ${fmtM(rDay)}.`;
      return plan&&(plan.nDias||1)>1?`${base} Para llegar a ${viajeActivo.destino} te quedan ${plan.nDias} días.`:base;
    }

    // Compensa seguir
    if(has(t,"compensa","sigo o paro","sigo conduciendo","merece la pena")){
      if(rCont<30)return"No te compensa seguir. Para ya, la multa no vale la pena.";
      if(rDay<90)return"Poco tiempo de jornada. Para y descansa. Mañana arrancas fresco.";
      if(plan&&rCont>90)return`Sigue tranquilo. ETA a destino: ${formatOperationalEtaLabel(plan.arrival)||"pendiente"}, sin forzar nada.`;
      return"Puedes seguir. Vigila el tiempo restante en el marcador.";
    }

    // Legal
    if(has(t,"voy legal","cumplo","puedo seguir","estoy bien de horas","voy bien de horas")){
      const p=[];
      if(rCont<=0)p.push("superado la conducción continua");
      if(rDay<=0)p.push("superado el límite diario");
      if(rWeek<=0)p.push("agotado las horas semanales");
      if(p.length)return`Cuidado, estás fuera de normativa: ${p.join(" y ")}. Para de inmediato.`;
      if(rCont<30)return"Estás dentro de la ley pero muy al límite. Para en menos de media hora.";
      return`Vas completamente legal. ${fmtM(rCont)} disponible antes de la próxima pausa.`;
    }

    // Hoy
    if(has(t,"como voy hoy","que tal hoy","hoy como voy","cómo voy hoy")){
      return`Hoy llevas ${fmtM(hoy)} conducidos. Te quedan ${fmtM(rDay)} de jornada. ${rDay<120?"Busca dónde parar pronto.":"Vas bien."}`;
    }

    // Mañana
    if(has(t,"manana","mañana")){
      const red=norma.redRests||0;
      const max=Math.min(rWeek,540);
      if(max<=0)return"Mañana no puedes conducir. Has agotado las horas semanales.";
      return`Mañana podrás conducir hasta ${fmtM(max)}. ${red<3?"Puedes usar descanso reducido de 9 horas esta noche.":"Necesitas descanso completo de 11 horas."}`;
    }

    // Voy justo / mal
    if(has(t,"voy justo","voy mal","pierdo tiempo","perdiendo tiempo")){
      if(rCont<30)return"Sí, vas muy justo. Menos de media hora antes de parar obligatoriamente.";
      if(rDay<60)return"Vas justo de jornada. Menos de una hora disponible hoy.";
      return"No vas mal. Estás dentro de los límites con margen suficiente.";
    }

    // Estado general (por defecto o "cómo vamos")
    if(plan){
      const nd=plan.nDias||1;
      if(nd<=1)return rCont<60
        ?`Vas bien hacia ${viajeActivo.destino} pero para en menos de una hora.`
        :`Todo en orden hacia ${viajeActivo.destino}. ETA ${formatOperationalEtaLabel(plan.arrival)||"pendiente"}. Te quedan ${fmtM(rCont)} antes de la próxima pausa.`;
      return`Vas hacia ${viajeActivo.destino}. ETA ${formatOperationalEtaLabel(plan.arrival)||"pendiente"}. ${rCont<60?"Para pronto.":"Sigues dentro de la normativa con ${fmtM(rCont)} disponibles."}`;
    }
    if(rCont<=0)return"Para ya. Has alcanzado el límite de conducción continua.";
    if(rCont<60)return`Para en ${rCont} minutos como máximo.`;
    return`Todo correcto. Puedes seguir ${fmtM(rCont)} más antes de la próxima pausa obligatoria.`;
  }

  function escuchar(){
    if(!SR){setError("Tu navegador no soporta voz. Usa Chrome en Android.");return;}
    setFase("listening");setError("");setLastQ("");
    const r=new SR();
    r.lang="es-ES";r.continuous=false;r.interimResults=false;r.maxAlternatives=3;
    recRef.current=r;

    // Timeout de seguridad — 10s máximo escuchando
    clearTimeout(timeoutRef.current);
    timeoutRef.current=setTimeout(()=>{
      try{r.abort();}catch(_){}
      setFase("idle");setError("No escuché nada. Pulsa de nuevo y habla.");
    },10000);

    r.onresult=e=>{
      clearTimeout(timeoutRef.current);
      const txt=Array.from(e.results[0]).map(a=>a.transcript).join(" ");
      setLastQ(txt);
      setFase("thinking");
      // Si no menciona Nora, responder igualmente (ya está en contexto de Nora)
      const resp=responder(txt);
      setLastA(resp);
      setFase("speaking");
      speakNatural(resp);
      // Volver a idle tras la respuesta
      const duracion=Math.max(3000,resp.length*60);
      setTimeout(()=>setFase("idle"),duracion);
    };

    r.onerror=e=>{
      clearTimeout(timeoutRef.current);
      if(e.error==="not-allowed"){setError("Permiso de micrófono denegado. Actívalo en ajustes del navegador.");setFase("idle");}
      else if(e.error==="no-speech"){setFase("idle");setError("No escuché nada. Pulsa de nuevo.");}
      else{setFase("idle");setError(`Error: ${e.error}`);}
    };

    r.onend=()=>{clearTimeout(timeoutRef.current);};

    try{r.start();}catch(e){setFase("idle");setError(e.message);}
  }

  function parar(){
    clearTimeout(timeoutRef.current);
    if(recRef.current)try{recRef.current.abort();}catch(_){}
    window.speechSynthesis?.cancel();
    setFase("idle");
  }

  useEffect(()=>()=>{clearTimeout(timeoutRef.current);if(recRef.current)try{recRef.current.abort();}catch(_){}},[]);

  const COLOR={idle:"#334155",listening:"#22C55E",thinking:"#F59E0B",speaking:"#A78BFA"};
  const color=COLOR[fase]||"#334155";

  const EJEMPLOS=[
    "cómo vamos","cuándo llego","cuándo paro",
    "dónde paro","cuánto me queda","compensa seguir",
    "voy legal","cómo voy hoy","mañana cómo lo tengo",
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:2000,display:"flex",alignItems:"flex-end"}} onClick={fase==="idle"?onClose:undefined}>
      <div style={{background:"#0F172A",borderRadius:"20px 20px 0 0",width:"100%",padding:"24px 18px 40px",borderTop:`3px solid ${color}`}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#F59E0B",letterSpacing:2}}>🎙 NORA</div>
            <div style={{fontSize:11,color:"#475569",marginTop:2}}>Asistente de voz · Pulsa y habla</div>
          </div>
          <button onClick={onClose} style={{background:"#1E293B",border:"none",borderRadius:8,padding:"8px 14px",color:"#94A3B8",fontSize:14,cursor:"pointer"}}>✕</button>
        </div>

        {/* Botón principal — grande, claro */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <button
            onClick={fase==="idle"?escuchar:parar}
            style={{
              background:fase==="idle"?"#22C55E":fase==="listening"?"#EF4444":"#1E293B",
              color:"white",border:`3px solid ${color}`,borderRadius:"50%",
              width:90,height:90,fontSize:36,cursor:"pointer",position:"relative",
              boxShadow:`0 0 24px ${color}66`,transition:"all .2s",
            }}>
            {fase==="idle"?"🎙":fase==="listening"?"⏹":fase==="thinking"?"⚡":"🔊"}
            {fase==="listening"&&(
              <span style={{position:"absolute",inset:-8,borderRadius:"50%",border:`2px solid ${color}`,animation:"ping 1s infinite",opacity:.5}}/>
            )}
          </button>
          <div style={{marginTop:12,fontSize:13,fontWeight:700,color}}>
            {fase==="idle"&&(SR?"Pulsa para hablar":"Chrome requerido")}
            {fase==="listening"&&"Escuchando... habla ahora"}
            {fase==="thinking"&&"Procesando..."}
            {fase==="speaking"&&"Respondiendo..."}
          </div>
          {fase==="idle"&&<div style={{fontSize:11,color:"#334155",marginTop:4}}>No necesitas decir "Nora" — habla directamente</div>}
        </div>

        {/* Última conversación */}
        {(lastQ||lastA)&&(
          <div style={{background:"#1E293B",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
            {lastQ&&<div style={{fontSize:12,color:"#64748B",marginBottom:6}}>Tú: <span style={{color:"#94A3B8"}}>{lastQ}</span></div>}
            {lastA&&<div style={{fontSize:14,fontWeight:600,color:"#F1F5F9",lineHeight:1.6,borderTop:lastQ?"1px solid #334155":"none",paddingTop:lastQ?8:0}}>{lastA}</div>}
          </div>
        )}

        {error&&<div style={{background:"#450a0a",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#EF4444",marginBottom:14}}>{error}</div>}

        {/* Ejemplos de preguntas */}
        {fase==="idle"&&!lastA&&(
          <div>
            <div style={{fontSize:11,color:"#334155",fontWeight:700,letterSpacing:1,marginBottom:8}}>PUEDES PREGUNTAR</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {EJEMPLOS.map(e=>(
                <div key={e} style={{background:"#1E293B",borderRadius:16,padding:"5px 10px",fontSize:11,color:"#64748B"}}>
                  {e}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * Convierte el plan local de la pestaña Ruta (`finalizePlanFromRoute`) al mismo shape que
 * `buildOperationalPlanSnapshot`, para persistir en `servicios.referencia` y que flota vea
 * km, ETA planificada y velocidad alineados con el conductor.
 */
function operationalPlanSnapshotFromMapTabPlan(plan,velocidad,split,mode,startDT){
  if(!plan?.route?.coords?.length)return null;
  const arrivalDate=plan.arrival instanceof Date?plan.arrival:new Date(plan.arrival);
  if(Number.isNaN(arrivalDate.getTime()))return null;
  const arrivalIso=arrivalDate.toISOString();
  const rests=(plan.segs||[]).filter(s=>s.type!=="conduccion");
  const breaks=rests.filter(s=>String(s.type).startsWith("pausa"));
  const dailyRest=rests.find(s=>s.type==="descanso");
  const weeklyRest=rests.find(s=>s.type==="descanso_semana");
  const driveMins=Math.round(Number(plan.route?.mins)||0);
  const legs=[];
  if(plan.wp){
    legs.push({
      from:safeOperationalPlaceName(plan.from?.name,"Origen"),
      to:safeOperationalPlaceName(plan.wp?.name,"Punto intermedio"),
      real:!!plan.route.real,
    });
    legs.push({
      from:safeOperationalPlaceName(plan.wp?.name,"Punto intermedio"),
      to:safeOperationalPlaceName(plan.to?.name,"Destino"),
      real:!!plan.route.real,
    });
  }else{
    legs.push({
      from:safeOperationalPlaceName(plan.from?.name,"Origen"),
      to:safeOperationalPlaceName(plan.to?.name,"Destino"),
      km:plan.route.km,
      mins:driveMins,
      real:!!plan.route.real,
    });
  }
  return{
    status:"ok",
    route_plan_status:"ready",
    snapshot_at:new Date().toISOString(),
    input_origin:String(plan.from?.name||""),
    input_origin_lat:Number.isFinite(Number(plan.from?.lat))?Number(plan.from.lat):null,
    input_origin_lon:Number.isFinite(Number(plan.from?.lon))?Number(plan.from.lon):null,
    input_destination:String(plan.to?.name||""),
    input_waypoint:plan.wp?String(plan.wp.name||""):null,
    planned_origin:safeOperationalPlaceName(plan.from?.name,"Ubicación actual"),
    planned_destination:safeOperationalPlaceName(plan.to?.name,"Destino"),
    planned_waypoint:plan.wp?String(plan.wp.name||""):null,
    planned_km:Math.round(plan.route.km*10)/10,
    planned_drive_min:driveMins,
    planned_drive_time:fmtDur(driveMins),
    planned_eta:arrivalIso,
    planned_eta_label:fmtOperationalEtaLabel(arrivalIso),
    planned_breaks:breaks.length,
    planned_daily_rest:!!dailyRest,
    planned_daily_rest_label:dailyRest?"Descanso diario previsto":weeklyRest?"Descanso semanal previsto":"Sin descanso diario previsto",
    planned_rest_plan:rests.map(seg=>({
      type:seg.type,
      start:seg.start instanceof Date?seg.start.toISOString():new Date(seg.start).toISOString(),
      dur:seg.dur,
    })),
    planned_summary:`${Math.round(plan.route.km)} km · ${fmtDur(driveMins)} conducción · ${breaks.length} pausa${breaks.length===1?"":"s"} · ${dailyRest?"descanso diario":"sin descanso diario"}`,
    planned_route:{legs,coords:thinRouteCoords(plan.route.coords)},
    confidence:plan.route.real?"high":"medium",
    velocidad:Math.min(100,Math.max(60,Math.round(Number(velocidad)||80))),
    map_tab_sync_at:new Date().toISOString(),
    map_tab_mode:String(mode||"now"),
    map_tab_start_dt:String(startDT||""),
    map_tab_split:!!split,
  };
}

function MapTab({norma,prof,dark,viajeActivo}){
  const[noraActive,setNoraActive]=useState(true); // activa al entrar en RUTA
  const RUTA_KEY="cuaderno_ruta_v2";
  const bg=dark?"#0F172A":"#F0F4F8";
  const card=dark?"#1E293B":"white";
  const tx=dark?"#F1F5F9":"#0F172A";
  const su=dark?"#94A3B8":"#64748B";
  const[subTab,setSubTab]=useState("plan");
  const[itOpen,setItOpen]=useState(true);

  // ── Servicio activo — pre-rellenar destino ──
  const uid=getUserId();
  const[stopActivo,setStopActivo]=useState(null);
  const[servicioActivo,setServicioActivo]=useState(null);
  useEffect(()=>{
    if(!uid)return;
    resolveDriverActiveServiceAndStops(uid)
      .then(async (resolved)=>{
        const sv=resolved?.servicio;
        if(!sv?.id)return;
        setServicioActivo(sv);
        const list=Array.isArray(resolved?.stops)?resolved.stops:[];
        const pend=list.find(s=>s?.estado==="pendiente"||s?.estado==="en_camino")||list[0]||null;
        if(pend)setStopActivo(pend);
      })
      .catch(()=>{});
  },[uid]);

  const[dest,setDest]=useState(()=>{try{return localStorage.getItem(RUTA_KEY+"_dest")||"";}catch(_){return "";}});
  const[waypoint,setWaypoint]=useState("");
  const[showWaypoint,setShowWaypoint]=useState(false);
  const[startDT,setStartDT]=useState(()=>toDTL(new Date()));
  const[split,setSplit]=useState(false);
  const[mode,setMode]=useState("now");
  const[plan,setPlan]=useState(null);
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState("");
  const[gpsPos,setGpsPos]=useState(null);
  const[gpsCiudad,setGpsCiudad]=useState("");
  const[origenTxt,setOrigenTxt]=useState("");
  const[origenManual,setOrigenManual]=useState(false);
  const[velocidad,setVelocidad]=useState(()=>{
    try{
      const raw=Number(localStorage.getItem(RUTA_KEY+"_vel")||80);
      return Number.isFinite(raw)?Math.min(100,Math.max(60,Math.round(raw))):80;
    }catch(_){return 80;}
  });
  const mapRef=useRef(null),mapDivRef=useRef(null),leafMapRef=useRef(null);
  const servicioActivoRef=useRef(null);
  const persistMapTabTimerRef=useRef(null);
  useEffect(()=>{servicioActivoRef.current=servicioActivo;},[servicioActivo]);
  useEffect(()=>()=>{if(persistMapTabTimerRef.current)clearTimeout(persistMapTabTimerRef.current);},[]);

  function schedulePersistMapTabOperationalPlan(planPayload,velArg,spl,mod,sdt){
    if(!planPayload?.route?.coords?.length)return;
    if(persistMapTabTimerRef.current)clearTimeout(persistMapTabTimerRef.current);
    persistMapTabTimerRef.current=setTimeout(async()=>{
      persistMapTabTimerRef.current=null;
      const sv=servicioActivoRef.current;
      if(!sv?.id)return;
      try{
        const snap=operationalPlanSnapshotFromMapTabPlan(planPayload,velArg,spl,mod,sdt);
        if(!snap)return;
        const etaPrevista=buildEtaPrevistaFromRoutePlan(snap);
        const referencia=mergeReferenciaOperacional(sv.referencia||null,{
          operational_plan:snap,
          ...(etaPrevista?{eta_prevista:etaPrevista}:{}),
        });
        const res=await sbFetch(`/rest/v1/servicios?id=eq.${sv.id}`,{method:"PATCH",body:JSON.stringify({referencia})});
        if(res.ok){
          window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
          setServicioActivo(p=>(p&&p.id===sv.id?{...p,referencia}:p));
        }
      }catch(_){/* offline / red */}
    },900);
  }

  useEffect(()=>{try{localStorage.setItem(RUTA_KEY+"_vel",String(velocidad));}catch(_){}},[ velocidad]);

  // GPS
  useEffect(()=>{
    if(!navigator.geolocation)return;
    const id=navigator.geolocation.watchPosition(pos=>{
      setGpsPos({lat:pos.coords.latitude,lon:pos.coords.longitude});
    },()=>{},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
    return()=>navigator.geolocation.clearWatch(id);
  },[]);

  // Nombre GPS
  useEffect(()=>{
    if(!gpsPos)return;
    revGeo(gpsPos.lat,gpsPos.lon).then(n=>setGpsCiudad(n)).catch(()=>{});
  },[gpsPos?.lat?.toFixed(2)]);

  // Guardar destino
  useEffect(()=>{try{localStorage.setItem(RUTA_KEY+"_dest",dest);}catch(_){}},[ dest]);

  const PCOL={conduccion:"#F59E0B",pausa_45:"#6366F1",pausa_15:"#818CF8",pausa_30:"#6366F1",descanso:"#7C3AED",descanso_semana:"#9D174D"};
  const PICO={conduccion:"🚛",pausa_45:"☕",pausa_15:"⏸",pausa_30:"☕",descanso:"🛏",descanso_semana:"🏨"};
  const PLBL={conduccion:"Conducción",pausa_45:"Pausa 45 min",pausa_15:"Pausa 1ª 15 min",pausa_30:"Pausa 2ª 30 min",descanso:"Descanso 9h",descanso_semana:"Descanso semanal"};

  const finalizePlanFromRoute=useCallback(async(route,from,to,wp)=>{
    let cfg={splitBreak:split,start:new Date(startDT)};
    if(mode==="now"){
      cfg={...cfg,contUsed:norma.cont,dayUsed:norma.todayDrive,weekUsed:norma.weekDrive,extUsed:norma.extUsed};
    }else if(mode==="remain"){
      cfg={...cfg,contUsed:norma.cont,dayUsed:norma.todayDrive,weekUsed:norma.weekDrive,extUsed:norma.extUsed};
    }
    const dMins=Math.max(1,Math.round(route.km/velocidad*60));
    const result=buildPlan(dMins,norma,cfg);
    const stops=[];
    for(const seg of result.segs.filter(s=>s.type!=="conduccion")){
      const frac=Math.min(seg.km/route.km,0.9999);
      const idx=Math.max(0,Math.floor(frac*(route.coords.length-1)));
      const[lon,lat]=route.coords[idx];
      const city=await revGeo(lat,lon);
      stops.push({...seg,lat,lon,city,kmOrig:seg.km,
        startTs:seg.start instanceof Date?seg.start:new Date(seg.start)});
    }
    const kmRestante=Math.round(norma.canDrive/60*velocidad);
    const stopIdx=route.coords.findIndex((_,i)=>{
      if(i===0)return false;
      let acc=0;
      for(let j=1;j<=i;j++){
        const[lo1,la1]=route.coords[j-1],[lo2,la2]=route.coords[j];
        acc+=haverDist(la1,lo1,la2,lo2);
      }
      return acc>=kmRestante;
    });
    const stopCoord=stopIdx>0?route.coords[stopIdx]:route.coords[route.coords.length-1];
    const stopCity=await revGeo(stopCoord[1],stopCoord[0]);
    return{
      from,to,wp,
      route:{...route,mins:dMins},
      segs:result.segs,stops,
      driveMins:result.driveTotal||result.driveMins,
      restMins:result.restTotal||result.restMins,
      arrival:result.arrival instanceof Date?result.arrival:new Date(result.arrival),
      startDT:new Date(startDT),
      nearStop:{lat:stopCoord[1],lon:stopCoord[0],city:stopCity,km:kmRestante},
      PCOL,PICO,PLBL,
    };
  },[velocidad,split,mode,startDT,norma.cont,norma.todayDrive,norma.weekDrive,norma.extUsed,norma.canDrive]);

  useEffect(()=>{
    if(!plan?.route?.coords?.length)return;
    let cancelled=false;
    const route=plan.route,from=plan.from,to=plan.to,wp=plan.wp;
    (async()=>{
      try{
        const next=await finalizePlanFromRoute(route,from,to,wp);
        if(cancelled)return;
        schedulePersistMapTabOperationalPlan(next,velocidad,split,mode,startDT);
        setPlan(p=>{
          if(!p?.route?.coords?.length)return p;
          if(p.route.km!==route.km||p.route.coords.length!==route.coords.length)return p;
          return{...p,...next};
        });
      }catch(_){}
    })();
    return()=>{cancelled=true;};
  },[plan?.route?.km,plan?.route?.coords?.length,finalizePlanFromRoute]);

  async function calcular(){
    if(!dest.trim()){setErr("Escribe el destino");return;}
    if(!origenManual&&!gpsPos){setErr("Activa el GPS o escribe el origen manualmente");return;}
    if(origenManual&&!origenTxt.trim()){setErr("Escribe el punto de partida");return;}
    setErr("");setLoading(true);setPlan(null);
    try{
      let from;
      if(origenManual){
        from=await geocode(origenTxt.trim());
      } else {
        from={lat:gpsPos.lat,lon:gpsPos.lon,name:gpsCiudad||"Tu posicion"};
      }
      const to=await geocode(dest.trim());

      // Punto intermedio
      let wp=null;
      if(showWaypoint&&waypoint.trim()){
        wp=await geocode(waypoint.trim());
      }

      // Calcular ruta — con o sin waypoint
      let route;
      if(wp){
        const r1=await getRoute(from,wp,velocidad);
        const r2=await getRoute(wp,to,velocidad);
        route={
          km:r1.km+r2.km,
          mins:r1.mins+r2.mins,
          coords:[...r1.coords,...r2.coords.slice(1)],
          real:r1.real&&r2.real,
          waypoint:wp,
        };
      } else {
        route=await getRoute(from,to,velocidad);
      }

      const planPayload=await finalizePlanFromRoute(route,from,to,wp);
      setPlan(planPayload);
    }catch(e){setErr(e.message);}
    finally{setLoading(false);}
  }

  // Mapa Leaflet
  useEffect(()=>{
    if(!plan||!mapDivRef.current)return;
    function init(){
      const L=window.L;if(!L)return;
      if(leafMapRef.current){try{leafMapRef.current.remove();}catch(_){} leafMapRef.current=null;}
      const map=L.map(mapDivRef.current,{zoomControl:true,scrollWheelZoom:false});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OSM"}).addTo(map);
      leafMapRef.current=map;
      const bounds=[];

      // Ruta
      if(plan.route?.coords?.length){
        const lls=plan.route.coords.map(([lo,la])=>[la,lo]);
        L.polyline(lls,{color:"#F59E0B",weight:5,opacity:.9}).addTo(map);
        bounds.push(...lls);
      }

      const dot=(c,sz,txt="")=>L.divIcon({
        html:`<div style="background:${c};width:${sz}px;height:${sz}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:${sz*.55}px;line-height:1">${txt}</div>`,
        className:"",iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]
      });

      // Origen y destino
      L.marker([plan.from.lat,plan.from.lon],{icon:dot("#22C55E",20,"🟢")}).addTo(map)
        .bindPopup(`<b>🟢 ${plan.from.name}</b><br>Salida: ${fmtT(plan.startDT)}`);
      L.marker([plan.to.lat,plan.to.lon],{icon:dot("#EF4444",20,"🔴")}).addTo(map)
        .bindPopup(`<b>🔴 ${plan.to.name}</b><br>Llegada est.: ${fmtT(plan.arrival)}`);
      bounds.push([plan.from.lat,plan.from.lon],[plan.to.lat,plan.to.lon]);

      // Paradas normativas
      plan.stops.forEach(st=>{
        if(!st.lat||!st.lon)return;
        const col=plan.PCOL[st.type]||"#6366F1";
        const ico=plan.PICO[st.type]||"⏸";
        L.marker([st.lat,st.lon],{icon:dot(col,22,ico)}).addTo(map)
          .bindPopup(`<b>${ico} ${plan.PLBL[st.type]||st.type}</b><br>📍 ${st.city}<br>🕐 ${fmtT(st.startTs)}<br>⏱ ${fmtDur(st.dur)}<br>📏 ${st.kmOrig} km`);
        bounds.push([st.lat,st.lon]);
      });

      // Parada sugerida según normativa actual
      if(plan.nearStop?.lat&&mode!=="later"){
        L.marker([plan.nearStop.lat,plan.nearStop.lon],{icon:dot("#EF4444",22,"⚠️")}).addTo(map)
          .bindPopup(`<b>⚠️ Parar aquí</b><br>📍 ${plan.nearStop.city}<br>~${plan.nearStop.km} km desde aquí`).openPopup();
        bounds.push([plan.nearStop.lat,plan.nearStop.lon]);
      }

      // GPS actual
      if(gpsPos){
        L.marker([gpsPos.lat,gpsPos.lon],{icon:dot("#3B82F6",18,"📍")}).addTo(map)
          .bindPopup("<b>📍 Tu posición actual</b>");
        bounds.push([gpsPos.lat,gpsPos.lon]);
      }

      if(bounds.length>1)try{map.fitBounds(bounds,{padding:[30,30]});}catch(_){}
    }

    if(!document.getElementById("lf-css")){
      const lk=document.createElement("link");lk.id="lf-css";lk.rel="stylesheet";
      lk.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(lk);
    }
    if(window.L){setTimeout(init,100);}
    else if(!document.getElementById("lf-js")){
      const sc=document.createElement("script");sc.id="lf-js";
      sc.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      sc.onload=()=>setTimeout(init,100);
      document.head.appendChild(sc);
    }
    return()=>{if(leafMapRef.current){try{leafMapRef.current.remove();}catch(_){}leafMapRef.current=null;}};
  },[plan?.route?.coords?.length,plan?.stops?.length,gpsPos?.lat,gpsPos?.lon]);

  return(
    <div style={{background:bg,minHeight:"100vh",paddingBottom:80,position:"relative"}}>
      <NoraWidget norma={norma} viajeActivo={viajeActivo} active={noraActive}/>

      {/* Sub-pestañas */}
      <div style={{display:"flex",background:dark?"#1E293B":"white",borderBottom:"2px solid #334155",position:"sticky",top:108,zIndex:90}}>
        {[{id:"plan",icon:"📍",label:"Planificador"},{id:"parkings",icon:"🅿️",label:"Parkings"}].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            style={{flex:1,background:"transparent",border:"none",
              borderBottom:`3px solid ${subTab===t.id?"#F59E0B":"transparent"}`,
              padding:"10px 4px 8px",fontSize:12,fontWeight:700,
              color:subTab===t.id?"#F59E0B":su,cursor:"pointer"}}>
            <div style={{fontSize:18,marginBottom:2}}>{t.icon}</div>
            {t.label}
          </button>
        ))}
      </div>

      {subTab==="parkings"&&(()=>{try{return <ParkingMap prof={prof} dark={dark} norma={norma}/>;}catch(e){return <div style={{padding:20,color:"#EF4444",fontSize:14}}>Error: {e.message}</div>;}})()}
      {subTab==="plan"&&<>

      {/* Alerta cuando queda ≤30 min */}
      {plan&&norma.canDrive>0&&norma.canDrive<=30&&(
        <div style={{background:"#EF4444",padding:"12px 16px",position:"sticky",top:108,zIndex:90,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"white"}}>🚨 Para en {fmtDur(norma.canDrive)} · ~{Math.round(norma.canDrive/60*velocidad)} km</div>
            {plan.nearStop&&<div style={{fontSize:12,color:"rgba(255,255,255,.9)",marginTop:2}}>📍 {plan.nearStop.city}</div>}
          </div>
          {plan.nearStop&&<button onClick={()=>window.open(`https://www.google.com/maps?q=${plan.nearStop.lat},${plan.nearStop.lon}`,"_blank","noopener")} style={{background:"transparent",color:"#EF4444",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,textDecoration:"none",border:"none",cursor:"pointer"}}>Ir aquí →</button>}
        </div>
      )}

      <div style={{padding:"12px 14px"}}>

        {/* Formulario */}
        <div style={{background:card,borderRadius:14,padding:"14px",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
          {/* Banner servicio activo */}
          {stopActivo&&(
            <div style={{background:dark?"#0D1829":"#EFF6FF",border:"1.5px solid #1E3A5F",borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:22,flexShrink:0}}>📦</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,color:"#3B82F6",fontWeight:700,marginBottom:2}}>PRÓXIMO STOP — {servicioActivo?.origen} → {servicioActivo?.destino}</div>
                <div style={{fontSize:14,fontWeight:800,color:dark?"#F1F5F9":tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stopActivo.nombre}</div>
                {stopActivo.direccion&&<div style={{fontSize:11,color:su,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stopActivo.direccion}</div>}
              </div>
              <button onClick={()=>{
                const q=stopActivo.direccion||stopActivo.nombre;
                setDest(q);
                try{localStorage.setItem(RUTA_KEY+"_dest",q);}catch(_){}
              }}
                style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:9,padding:"8px 12px",fontSize:12,fontWeight:800,cursor:"pointer",flexShrink:0}}>
                USAR →
              </button>
            </div>
          )}

          {/* Velocidad media (móvil táctil, paso 1 km/h) */}
          <div style={{background:dark?"#0F172A":"#F8FAFC",borderRadius:10,padding:"10px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:10,border:`1px solid ${dark?"#334155":"#E2E8F0"}`}}>
            <span style={{fontSize:16}}>🚛</span>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:4}}>VELOCIDAD MEDIA</div>
              <input type="range" min={60} max={100} step={1} value={velocidad}
                onChange={e=>setVelocidad(Math.min(100,Math.max(60,Number(e.target.value)||80)))}
                style={{width:"100%",accentColor:"#2563EB"}}/>
            </div>
            <div style={{textAlign:"center",flexShrink:0,minWidth:52}}>
              <div style={{fontSize:20,fontWeight:800,color:"#2563EB",fontFamily:"monospace"}}>{velocidad}</div>
              <div style={{fontSize:10,color:su}}>km/h</div>
            </div>
          </div>

          <div style={{fontSize:12,fontWeight:800,color:"#F59E0B",marginBottom:10}}>🗺 PLANIFICAR RUTA</div>

          {/* Modo */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
            {[
              {id:"now",  icon:"🚛",label:"Salir ahora",   sub:"Con mis horas actuales"},
              {id:"later",icon:"🕐",label:"Salir más tarde",sub:"Jornada desde cero"},
              {id:"remain",icon:"⏱",label:"Lo que me queda",sub:"Solo tiempo restante"},
            ].map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)}
                style={{background:mode===m.id?"#F59E0B18":dark?"#0F172A":"#F8FAFC",
                  border:`2px solid ${mode===m.id?"#F59E0B":"transparent"}`,
                  borderRadius:10,padding:"8px 6px",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{m.icon}</div>
                <div style={{fontSize:11,fontWeight:700,color:mode===m.id?"#F59E0B":tx,lineHeight:1.2}}>{m.label}</div>
                <div style={{fontSize:9,color:su,marginTop:2,lineHeight:1.2}}>{m.sub}</div>
              </button>
            ))}
          </div>

          {/* ORIGEN — GPS o manual */}
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",gap:7,marginBottom:6}}>
              <button onClick={()=>{setOrigenManual(false);setOrigenTxt("");}}
                style={{flex:1,background:!origenManual?"#F59E0B":"#F8FAFC",color:!origenManual?"#0F172A":su,
                  border:`2px solid ${!origenManual?"#F59E0B":"#E2E8F0"}`,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                📍 Mi ubicación GPS
              </button>
              <button onClick={()=>setOrigenManual(true)}
                style={{flex:1,background:origenManual?"#3B82F6":"#F8FAFC",color:origenManual?"white":su,
                  border:`2px solid ${origenManual?"#3B82F6":"#E2E8F0"}`,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                ✏️ Otro punto de salida
              </button>
            </div>
            {!origenManual?(
              <div style={{display:"flex",gap:8,alignItems:"center",padding:"8px 10px",
                background:gpsPos?"#F0FDF4":"#FFF7ED",borderRadius:8,
                border:`1px solid ${gpsPos?"#BBF7D0":"#FED7AA"}`}}>
                <span style={{fontSize:15}}>{gpsPos?"📍":"⚠️"}</span>
                <div style={{flex:1,fontSize:12,color:gpsPos?"#166534":"#92400E",fontWeight:600}}>
                  {gpsPos?`${gpsCiudad||"Obteniendo nombre..."} (${gpsPos.lat.toFixed(3)}, ${gpsPos.lon.toFixed(3)})`:
                    "GPS no disponible — activa la ubicacion o usa origen manual"}
                </div>
              </div>
            ):(
              <input value={origenTxt} onChange={e=>setOrigenTxt(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&calcular()}
                placeholder="🟢 Punto de partida — ciudad, direccion..."
                autoFocus
                style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",
                  border:`2px solid #3B82F6`,borderRadius:9,
                  padding:"11px 12px",fontSize:15,color:tx,outline:"none"}}/>
            )}
          </div>

          {/* Punto intermedio */}
          <div style={{marginBottom:8}}>
            {!showWaypoint?(
              <button onClick={()=>setShowWaypoint(true)}
                style={{width:"100%",background:"transparent",border:"1px dashed #334155",borderRadius:9,padding:"9px",fontSize:12,color:"#3B82F6",cursor:"pointer",fontWeight:600}}>
                + Añadir punto intermedio
              </button>
            ):(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={waypoint} onChange={e=>setWaypoint(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&calcular()}
                  placeholder="🔵 Punto intermedio — ciudad o dirección..."
                  style={{flex:1,background:dark?"#0F172A":"#F8FAFC",border:"2px solid #3B82F6",borderRadius:9,padding:"11px 12px",fontSize:15,color:tx,outline:"none"}}/>
                <button onClick={()=>{setShowWaypoint(false);setWaypoint("");}}
                  style={{background:"transparent",border:"none",color:"#64748B",fontSize:20,cursor:"pointer",padding:"4px 6px",flexShrink:0}}>✕</button>
              </div>
            )}
          </div>

          {/* Destino */}
          <input value={dest} onChange={e=>setDest(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&calcular()}
            placeholder="🔴 ¿A dónde vas? Ciudad o dirección..."
            style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:`2px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:9,padding:"11px 12px",fontSize:15,color:tx,outline:"none",marginBottom:8}}/>

          {mode==="later"&&(
            <input type="datetime-local" value={startDT} onChange={e=>setStartDT(e.target.value)}
              style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:`2px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:9,padding:"9px",fontSize:13,color:tx,outline:"none",marginBottom:8}}/>
          )}

          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:su,cursor:"pointer",marginBottom:10}}>
            <input type="checkbox" checked={split} onChange={e=>setSplit(e.target.checked)} style={{accentColor:"#6366F1"}}/>
            Pausa fraccionada (15+30 min)
          </label>

          {err&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px",fontSize:12,color:"#EF4444",marginBottom:8}}>{err}</div>}

          <button onClick={calcular} disabled={loading}
            style={{width:"100%",background:loading?"#94A3B8":"#F59E0B",color:"#0F172A",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:800,cursor:loading?"default":"pointer"}}>
            {loading?"⏳ Calculando ruta y paradas...":"📍 CALCULAR RUTA"}
          </button>
        </div>

        {plan&&(
          <div style={{background:card,borderRadius:12,padding:"12px 14px",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14}}>🟢</span>
                  <div style={{fontSize:13,fontWeight:800,color:"#166534"}}>{plan.from.name}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                  <span style={{fontSize:14}}>🔴</span>
                  <div style={{fontSize:13,fontWeight:800,color:"#DC2626"}}>{plan.to.name}</div>
                  <button onClick={()=>window.open(`https://www.google.com/maps/dir/?api=1&origin=${plan.from.lat},${plan.from.lon}&destination=${plan.to.lat},${plan.to.lon}&travelmode=driving`,"_blank","noopener")} style={{marginLeft:"auto",background:"transparent",color:"#1E293B",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,textDecoration:"none",flexShrink:0,border:"none",cursor:"pointer"}}>
                    🗺 Google Maps →
                  </button>
                </div>
              </div>
              <button onClick={()=>setPlan(null)} style={{background:"transparent",border:"none",color:su,fontSize:20,cursor:"pointer",marginLeft:8}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:10}}>
              {[
                {l:"KM",v:`${plan.route.km}`},
                {l:"PARADAS",v:`${plan.stops.length}`},
                {l:"CONDUCCIÓN",v:fmtDur(plan.driveMins)},
                {l:"LLEGADA",v:fmtT(plan.arrival)},
              ].map(({l,v})=>(
                <div key={l} style={{textAlign:"center",background:dark?"#0F172A":"#F8FAFC",borderRadius:8,padding:"7px 4px"}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#F59E0B",fontFamily:"monospace"}}>{v}</div>
                  <div style={{fontSize:9,color:su,fontWeight:700,marginTop:1}}>{l}</div>
                </div>
              ))}
            </div>

            {mode!=="later"&&plan.nearStop&&norma.canDrive>0&&(
              <div style={{background:norma.canDrive<=60?"#FEF2F2":dark?"#0F172A":"#F0FDF4",border:`1.5px solid ${norma.canDrive<=60?"#FECACA":"#BBF7D0"}`,borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:800,color:norma.canDrive<=60?"#EF4444":"#16A34A",marginBottom:4}}>
                  {norma.canDrive<=60?"⚠️":"📍"} PROXIMA PARADA OBLIGATORIA
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:tx}}>📍 {plan.nearStop.city}</div>
                    <div style={{fontSize:12,color:su,marginTop:2}}>A ~{plan.nearStop.km} km · En {fmtDur(norma.canDrive)}</div>
                  </div>
                  <button onClick={()=>window.open(`https://www.google.com/maps?q=${plan.nearStop.lat},${plan.nearStop.lon}`,"_blank","noopener")} style={{background:"transparent",color:"#16A34A",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,textDecoration:"none",flexShrink:0,border:"none",cursor:"pointer"}}>
                    Ir →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mapa */}
        {plan&&(
          <div style={{borderRadius:14,overflow:"hidden",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
            <div ref={mapDivRef} style={{height:350,background:"#dde8f0",width:"100%"}}/>
            <div style={{background:card,padding:"7px 12px",fontSize:11,color:su,display:"flex",flexWrap:"wrap",gap:10}}>
              <span>🟡 Ruta</span><span>☕ Pausa</span><span>🛏 Descanso</span>
              {mode!=="later"&&<span style={{color:"#EF4444"}}>⚠️ Tu próxima parada</span>}
              <span style={{color:"#3B82F6"}}>📍 Tu posición</span>
            </div>
          </div>
        )}

        {/* Itinerario plegable */}
        {plan&&(
          <div style={{background:card,borderRadius:12,marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.05)",overflow:"hidden"}}>
            <button onClick={()=>setItOpen(o=>!o)}
              style={{width:"100%",background:"transparent",border:"none",padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div style={{fontSize:11,fontWeight:800,color:su,letterSpacing:.5}}>
                ITINERARIO COMPLETO — {plan.segs.length} tramos
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#F59E0B",fontWeight:700}}>{plan.stops.length} paradas · {fmtDur(plan.driveMins+plan.restMins)}</span>
                <span style={{fontSize:16,color:"#F59E0B"}}>{itOpen?"▲":"▼"}</span>
              </div>
            </button>
            {itOpen&&<div style={{padding:"0 14px 14px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div style={{padding:"8px 10px",background:"#F0FDF4",borderRadius:8,border:"1px solid #BBF7D0",display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:16}}>🟢</span>
                  <div><div style={{fontSize:13,fontWeight:700,color:"#166534"}}>{plan.from.name}</div><div style={{fontSize:11,color:su}}>{fmtT(plan.startDT)}</div></div>
                </div>
                {plan.segs.map((seg,i)=>{
                  const isDrive=seg.type==="conduccion";
                  const col=PCOL[seg.type]||"#64748B";
                  const ico=PICO[seg.type]||"⏱";
                  const lbl=PLBL[seg.type]||seg.type;
                  const st=plan.stops.find(x=>x.kmOrig===seg.km&&x.type===seg.type);
                  const st2=seg.start instanceof Date?seg.start:new Date(seg.start);
                  const endT=new Date(+st2+seg.dur*60000);
                  return(
                    <div key={i} style={{display:"flex",gap:9,padding:"8px 10px",
                      background:isDrive?dark?"#0F172A":"#F8FAFC":dark?"#1E293B":col+"14",
                      borderRadius:9,border:`1.5px solid ${isDrive?dark?"#334155":"#E2E8F0":col+"40"}`,
                      borderLeft:`4px solid ${col}`}}>
                      <span style={{fontSize:15,marginTop:1}}>{ico}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:12,fontWeight:700,color:isDrive?tx:col}}>{lbl}</span>
                          <span style={{fontSize:12,fontWeight:800,color:col,fontFamily:"monospace",flexShrink:0}}>{fmtDur(seg.dur)}</span>
                        </div>
                        <div style={{fontSize:11,color:su,marginTop:1}}>{fmtT(st2)} → {fmtT(endT)}</div>
                        {!isDrive&&st&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}>
                          <div style={{fontSize:11,fontWeight:600,color:col}}>📍 {st.city} · {st.kmOrig} km</div>
                          <button onClick={()=>window.open(`https://www.google.com/maps?q=${st.lat},${st.lon}`,"_blank","noopener")} style={{fontSize:10,color:"#3B82F6",fontWeight:700,textDecoration:"none",flexShrink:0,marginLeft:8,background:"transparent",border:"none",cursor:"pointer"}}>Mapa →</button>
                        </div>}
                        {isDrive&&<div style={{fontSize:10,color:su,marginTop:1}}>~{seg.km} km</div>}
                      </div>
                    </div>
                  );
                })}
                <div style={{padding:"8px 10px",background:"#FEF2F2",borderRadius:8,border:"1px solid #FECACA",display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:16}}>🏁</span>
                  <div><div style={{fontSize:13,fontWeight:700,color:"#DC2626"}}>{plan.to.name}</div><div style={{fontSize:11,color:su}}>Llegada est.: {fmtFull(plan.arrival)}</div></div>
                </div>
              </div>
            </div>}
          </div>
        )}

        {!plan&&(
          <div style={{textAlign:"center",padding:"48px 24px"}}>
            <div style={{fontSize:56,marginBottom:14}}>🗺️</div>
            <div style={{fontSize:16,fontWeight:700,color:tx,marginBottom:8}}>Planifica tu ruta</div>
            <div style={{fontSize:13,color:su,lineHeight:1.8}}>
              {gpsPos?"✅ GPS activo — escribe tu destino":"⚠️ Activa el GPS del navegador"}<br/>
              Elige cómo salir y la app calcula todas<br/>las paradas obligatorias según la normativa
            </div>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}

function ParkingMap({prof,dark,norma,compact=false}){
  const[parkings,setParkings]=useState([]);
  const[filter,setFilter]=useState("all");
  const[modal,setModal]=useState(false);
  const[form,setForm]=useState({type:"seguro",name:"",note:"",servicios:[],loc:"",_lat:null,_lon:null});
  const[saving,setSaving]=useState(false);
  const[loading,setLoading]=useState(true);
  const[toast,setToast]=useState("");
  const[locating,setLocating]=useState(false);
  const[myPos,setMyPos]=useState(null);
  const[suggestions,setSuggestions]=useState([]);
  const[showSug,setShowSug]=useState(false);
  const[listView,setListView]=useState(false);
  const routeLayerRef=useRef([]);
  const mapRef=useRef(null),divRef=useRef(null),markersRef=useRef([]);
  const sugRef=useRef(null);
  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),2500);};

  const[osmStatus,setOsmStatus]=useState("cargando"); // cargando | ok | error

  useEffect(()=>{loadParkings().then(p=>{setParkings(p);setLoading(false);});
    cargarOSM();
  },[]);

  async function cargarOSM(){
    setOsmStatus("cargando");
    // Intentar con varios endpoints Overpass
    const endpoints=[
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ];
    // España peninsular + Baleares
    const bbox="35.9,-9.3,43.8,4.4";
    const q=`[out:json][timeout:30];(node["amenity"="truck_stop"](${bbox});node["highway"="rest_area"](${bbox});node["amenity"="parking"]["hgv"="yes"](${bbox}););out 300;`;
    
    for(const endpoint of endpoints){
      try{
        const r=await fetch(endpoint,{
          method:"POST",
          body:`data=${encodeURIComponent(q)}`,
          headers:{"Content-Type":"application/x-www-form-urlencoded"},
          mode:"cors",
        });
        if(!r.ok)continue;
        const d=await r.json();
        const osmPs=(d.elements||[])
          .filter(n=>n.lat&&n.lon)
          .map(n=>({
            id:"osm_"+n.id,
            lat:n.lat,lon:n.lon,
            name:n.tags?.name||n.tags?.["name:es"]||"Área de camiones",
            type:"osm_parking",
            note:[
              n.tags?.shower==="yes"?"🚿 Duchas":"",
              n.tags?.restaurant==="yes"?"🍽 Restaurante":"",
              n.tags?.["fuel:diesel"]==="yes"?"⛽ Gasoil":"",
              n.tags?.toilets==="yes"?"🚻 Aseos":"",
            ].filter(Boolean).join(" · ")||"Parking para camiones",
            rating:0,addedBy:"OpenStreetMap",addedAt:null,osm:true,
          }));
        if(osmPs.length>0){
          setParkings(prev=>[...prev.filter(p=>!p.osm),...osmPs]);
          setOsmStatus("ok");
          return;
        }
      }catch(e){
        console.warn("Overpass endpoint failed:",endpoint,e.message);
      }
    }
    // Si todos fallan, cargar datos estáticos mínimos
    const fallback=[
      {id:"osm_f1",lat:41.3851,lon:2.1734,name:"Área de servicio Barcelona",type:"osm_parking",note:"Parking camiones",rating:0,addedBy:"OpenStreetMap",addedAt:null,osm:true},
      {id:"osm_f2",lat:40.4168,lon:-3.7038,name:"Área de servicio Madrid",type:"osm_parking",note:"Parking camiones",rating:0,addedBy:"OpenStreetMap",addedAt:null,osm:true},
      {id:"osm_f3",lat:37.3891,lon:-5.9845,name:"Área de servicio Sevilla",type:"osm_parking",note:"Parking camiones",rating:0,addedBy:"OpenStreetMap",addedAt:null,osm:true},
      {id:"osm_f4",lat:39.4699,lon:-0.3763,name:"Área de servicio Valencia",type:"osm_parking",note:"Parking camiones",rating:0,addedBy:"OpenStreetMap",addedAt:null,osm:true},
      {id:"osm_f5",lat:41.6488,lon:-0.8891,name:"Área de servicio Zaragoza",type:"osm_parking",note:"Parking camiones",rating:0,addedBy:"OpenStreetMap",addedAt:null,osm:true},
    ];
    setParkings(prev=>[...prev.filter(p=>!p.osm),...fallback]);
    setOsmStatus("error");
  }

  // Haversine distance in km
  function distKm(lat1,lon1,lat2,lon2){
    const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  useEffect(()=>{
    if(!mapRef.current||!window.L)return;
    const L=window.L;
    markersRef.current.forEach(m=>m.remove());markersRef.current=[];
    const visible=filter==="all"?parkings:parkings.filter(p=>p.type===filter);
    const myName=prof.nombre||"Anónimo";
    visible.forEach(p=>{
      const PT=getPT(p.type);
      const isOwn=p.addedBy===myName;
      const distStr=myPos?`~${Math.round(distKm(myPos.lat,myPos.lon,p.lat,p.lon))} km`:"";
      const dl=daysLeft(p);
      const addedStr=p.addedAt?`Añadido el ${new Date(p.addedAt).toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"})}`:"";
      const expiryStr=dl!==null?(dl<=1?"⏰ Caduca hoy":dl<=3?`⏰ Caduca en ${dl} días`:`Caduca en ${dl} días`):"";
      const expiryColor=dl!==null&&dl<=3?"#EF4444":"#94a3b8";
      const icon=L.divIcon({html:`<div style="background:${PT.color};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:15px">${PT.icon}</span></div>`,className:"",iconSize:[32,32],iconAnchor:[16,32]});
      const stars="★".repeat(p.rating||0)+"☆".repeat(5-(p.rating||0));
      const deleteBtn=isOwn?`<button onclick="window.__deleteParking&&window.__deleteParking('${p.id}')" style="margin-top:6px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:4px 10px;font-size:11px;color:#DC2626;cursor:pointer;font-weight:700;width:100%">🗑 Eliminar mi punto</button>`:"";
      const marker=L.marker([p.lat,p.lon],{icon}).addTo(mapRef.current).bindPopup(`<div style="font-family:sans-serif;min-width:190px;padding:4px">
        <div style="font-weight:800;font-size:14px;margin-bottom:4px">${PT.icon} ${p.name||PT.label}</div>
        ${p.rating?`<div style="color:#f59e0b;font-size:15px;margin-bottom:4px">${stars}</div>`:""}
        ${p.city?`<div style="font-size:13px;color:#334155;margin-bottom:3px">📍 ${p.city}</div>`:""}
        ${distStr?`<div style="font-size:13px;color:#F59E0B;font-weight:700;margin-bottom:3px">📏 ${distStr}</div>`:""}
        ${p.note?`<div style="font-size:12px;color:#475569;margin-bottom:3px">📝 ${p.note}</div>`:""}
        <div style="font-size:10px;color:#94a3b8;margin-top:4px">${addedStr}</div>
        ${expiryStr?`<div style="font-size:11px;color:${expiryColor};font-weight:700;margin-top:2px">${expiryStr}</div>`:""}
        <div style="font-size:10px;color:#94a3b8">Por ${p.addedBy||"Anónimo"}</div>
        ${deleteBtn}
      </div>`);
      markersRef.current.push(marker);
    });
    // Expose delete function globally for popup button
    window.__deleteParking=async(id)=>{
      await deleteParking(id);
      setParkings(prev=>prev.filter(x=>String(x.id)!==String(id)));
      showToast("Punto eliminado");
    };
  },[parkings,filter,myPos]);

  // Forzar Leaflet a recalcular tamaño cuando se muestra
  useEffect(()=>{
    if(mapRef.current){
      setTimeout(()=>{try{mapRef.current.invalidateSize();}catch(_){}},100);
    }
  });

  useEffect(()=>{
    function init(){const L=window.L;if(!L||!divRef.current)return;if(mapRef.current)return;const map=L.map(divRef.current,{zoomControl:true}).setView([40.4168,-3.7038],6);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OSM"}).addTo(map);mapRef.current=map;}
    if(!document.getElementById("lf-css")){const c=document.createElement("link");c.id="lf-css";c.rel="stylesheet";c.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(c);}
    if(window.L){init();return;}
    if(!document.getElementById("lf-js")){const sc=document.createElement("script");sc.id="lf-js";sc.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";sc.onload=init;document.head.appendChild(sc);}
    return()=>{if(mapRef.current){mapRef.current.remove();mapRef.current=null;}};
  },[]);

  function getGPS(){
    return new Promise(resolve=>{
      if(!navigator.geolocation){resolve(null);return;}
      navigator.geolocation.getCurrentPosition(
        async pos=>{
          const{latitude:lat,longitude:lon}=pos.coords;
          const name=await reverseGeocode(lat,lon).catch(()=>"Mi ubicación");
          resolve({lat,lon,name});
        },
        ()=>resolve(null),
        {enableHighAccuracy:false,timeout:8000,maximumAge:60000}
      );
    });
  }

  function goToMyLocation(){
    if(!navigator.geolocation){showToast("GPS no disponible");return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{setLocating(false);const{latitude:lat,longitude:lon}=pos.coords;setMyPos({lat,lon});if(mapRef.current)mapRef.current.setView([lat,lon],13);revGeo(lat,lon).then(name=>{setForm(p=>({...p,loc:name,_lat:lat,_lon:lon}));showToast(`📍 ${name}`);});},
      ()=>{setLocating(false);showToast("Activa el GPS.");},{timeout:8000,enableHighAccuracy:true}
    );
  }

  function getGPSForForm(){
    if(!navigator.geolocation){showToast("GPS no disponible");return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{
        setLocating(false);
        const{latitude:lat,longitude:lon}=pos.coords;
        setMyPos({lat,lon});
        revGeo(lat,lon).then(name=>{
          setForm(p=>({...p,loc:name,_lat:lat,_lon:lon}));
          showToast(`📍 ${name}`);
        });
      },
      ()=>{setLocating(false);showToast("No se pudo obtener el GPS. Actívalo en ajustes.");},
      {timeout:10000,enableHighAccuracy:false,maximumAge:60000}
    );
  }

  function handleLocInput(val){
    setForm(p=>({...p,loc:val,_lat:null,_lon:null}));
    clearTimeout(sugRef.current);
    if(val.length<2){setSuggestions([]);setShowSug(false);return;}
    const q=normC(val);
    const local=CITIES.filter(r=>{const name=r[r.length-3];const keys=r.slice(0,r.length-3).map(k=>normC(k));return keys.some(k=>k.startsWith(q))||normC(name).startsWith(q);}).slice(0,6).map(r=>({name:r[r.length-3],lat:r[r.length-2],lon:r[r.length-1]}));
    if(local.length>0){setSuggestions(local);setShowSug(true);return;}
    sugRef.current=setTimeout(async()=>{try{const r=await fetchTO(`https://photon.komoot.io/api/?q=${encodeURIComponent(val)}&limit=5&lang=es`,4000);if(r.ok){const d=await r.json();if(d.features?.length){setSuggestions(d.features.map(f=>({name:`${f.properties.name||""}${f.properties.city?", "+f.properties.city:""}`.trim(),lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]})));setShowSug(true);}}}catch(_){}},500);
  }
  function selectSug(sug){setForm(p=>({...p,loc:sug.name,_lat:sug.lat,_lon:sug.lon}));setSuggestions([]);setShowSug(false);if(mapRef.current)mapRef.current.setView([sug.lat,sug.lon],13);}

  async function handleAdd(){
    if(!form.loc.trim()){showToast("Escribe o selecciona una ubicación");return;}
    setSaving(true);
    try{
      let lat=form._lat,lon=form._lon;
      if(!lat||!lon){const geo=await geocode(form.loc.trim());lat=geo.lat;lon=geo.lon;}
      const city=await revGeo(lat,lon);
      const p={id:Date.now()+Math.random(),lat,lon,name:form.name.trim()||PTYPES[form.type]?.label,type:form.type,note:[...(form.servicios||[]).map(s=>{const m={ducha:"🚿 Duchas",comida:"🍽 Restaurante",gasoil:"⛽ Gasoil",wifi:"📶 WiFi",mecanico:"🔧 Mecánico",aseos:"🚻 Aseos",tienda:"🛒 Tienda",camaras:"📷 Cámaras"};return m[s]||s;}),form.note.trim()].filter(Boolean).join(" · "),rating:form.type==="seguro"?5:1,city,addedBy:prof.nombre||"Anónimo",addedAt:new Date().toISOString()};
      await saveParking(p);setParkings(prev=>[...prev,p]);
      setModal(false);setForm({type:"seguro",name:"",note:"",servicios:[],loc:"",_lat:null,_lon:null});
      showToast("✅ Punto añadido");
      setTimeout(()=>{if(mapRef.current)mapRef.current.flyTo([lat,lon],14);},300);
    }catch(e){showToast(e.message);}finally{setSaving(false);}
  }

  const[busqueda,setBusqueda]=useState("");
  const radioKm=30;

  async function buscarCiudad(){
    if(!busqueda.trim())return;
    try{
      const geo=await geocode(busqueda.trim());
      if(mapRef.current){mapRef.current.setView([geo.lat,geo.lon],11);}
      showToast(`📍 ${geo.name} · mostrando ${radioKm} km a la redonda`);
    }catch{showToast("Ciudad no encontrada");}
  }

  const visible=(filter==="all"?parkings:parkings.filter(p=>p.type===filter||getPT(p.type)?.label===getPT(filter)?.label)).filter(p=>!isExpired(p));
  const bg=dark?"#0F172A":"#F8FAFC";
  const cardBg=dark?"#1E293B":"white";
  const txt=dark?"#F1F5F9":"#0F172A";
  const sub=dark?"#94A3B8":"#64748B";

  // Calcular ruta con paradas normativas en el mapa
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 160px)",position:"relative",background:bg}}>
      {/* Header */}
      <div style={{background:"#1E293B",padding:"10px 14px",display:"flex",justifyContent:"flex-end",alignItems:"center",flexShrink:0,gap:7}}>
        <button onClick={()=>setListView(v=>!v)} style={{background:"#334155",color:"white",border:"none",borderRadius:10,padding:"8px 10px",fontSize:13,cursor:"pointer"}}>{listView?"🗺":"☰"}</button>
        <button onClick={goToMyLocation} disabled={locating} style={{background:"#3B82F6",color:"white",border:"none",borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{locating?"⌛":"📍"}</button>
        <button onClick={()=>{
          const myName=prof.nombre||"Anónimo";
          const mine=parkings.filter(p=>p.addedBy===myName&&!p.osm);
          if(mine.length===0){showToast("No tienes puntos añadidos");return;}
          setFilter("all");
          setListView(false);
          if(mapRef.current&&mine.length>0){
            mapRef.current.flyTo([mine[mine.length-1].lat,mine[mine.length-1].lon],13);
          }
          showToast(`📍 ${mine.length} punto${mine.length===1?"":"s"} tuyo${mine.length===1?"":"s"}`);
        }} style={{background:"#7C3AED",color:"white",border:"none",borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Mis puntos</button>
        <button onClick={()=>setModal(true)} style={{background:"#22C55E",color:"white",border:"none",borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:800,cursor:"pointer"}}>＋ Añadir</button>
      </div>

      {/* Buscador de ciudad */}
      <div style={{padding:"8px 12px",background:dark?"#0A0F1A":"#F1F5F9",borderBottom:`1px solid ${dark?"#1E293B":"#E2E8F0"}`,display:"flex",gap:8,flexShrink:0}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")buscarCiudad();}}
          placeholder="Buscar ciudad o zona... (ej: Zaragoza)"
          style={{flex:1,background:dark?"#1E293B":"white",border:`1.5px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:8,padding:"8px 12px",fontSize:14,color:dark?"#F1F5F9":"#0F172A",outline:"none"}}/>
        <button onClick={buscarCiudad} style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:8,padding:"0 14px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
          🔍
        </button>
        <button onClick={goToMyLocation} disabled={locating} style={{background:"#3B82F6",color:"white",border:"none",borderRadius:8,padding:"0 12px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
          {locating?"⌛":"📍"}
        </button>
      </div>

      {/* Estado carga OSM */}
      <div style={{padding:"6px 14px",background:osmStatus==="error"?"#FFF7ED":osmStatus==="cargando"?"#F8FAFC":"#F0FDF4",borderBottom:`1px solid ${osmStatus==="error"?"#FED7AA":osmStatus==="cargando"?"#E2E8F0":"#BBF7D0"}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontSize:12,color:osmStatus==="error"?"#C2410C":osmStatus==="cargando"?"#64748B":"#166534",fontWeight:600}}>
          {osmStatus==="cargando"?"⌛ Cargando parkings de OpenStreetMap...":osmStatus==="error"?"⚠ No se pudieron cargar los parkings OSM":`✅ ${parkings.filter(p=>p.osm).length} parkings de OpenStreetMap`}
        </span>
        {osmStatus==="error"&&<button onClick={cargarOSM} style={{background:"#F97316",color:"white",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Reintentar</button>}
      </div>

      {/* Filtros */}
      <div style={{background:dark?"#0F172A":"#F8FAFC",padding:"8px 14px",display:"flex",gap:7,overflowX:"auto",flexShrink:0,borderBottom:`1px solid ${dark?"#1E293B":"#E2E8F0"}`}}>
        <button onClick={()=>setFilter("all")} style={{...filterBtn,background:filter==="all"?"#1E293B":"white",color:filter==="all"?"white":"#64748B",border:`1.5px solid ${filter==="all"?"#334155":"#E2E8F0"}`}}>Todos ({parkings.length})</button>
        {(()=>{const k="osm_parking";const v=PTYPES[k];const cnt=parkings.filter(p=>p.type===k).length;return <button key={k} onClick={()=>setFilter(k)} style={{...filterBtn,background:filter===k?v.color:"white",color:filter===k?"white":"#64748B",border:`1.5px solid ${filter===k?v.color:"#E2E8F0"}`,whiteSpace:"nowrap"}}>{v.icon} {v.label} ({cnt})</button>;})()}
        {Object.entries(PTYPES).filter(([k])=>k!=="osm_parking").map(([k,v])=>{const cnt=parkings.filter(p=>p.type===k).length;return(<button key={k} onClick={()=>setFilter(k)} style={{...filterBtn,background:filter===k?v.color:"white",color:filter===k?"white":"#64748B",border:`1.5px solid ${filter===k?v.color:"#E2E8F0"}`,whiteSpace:"nowrap"}}>{v.icon} {v.label} ({cnt})</button>);})}
      </div>
      {/* Mapa — siempre en DOM */}
      <div ref={divRef} style={{flex:listView?0:1,minHeight:listView?0:320,display:listView?"none":"block",background:"#dde8f0"}}/>
      {listView&&(
        <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>
          {visible.length===0&&<Empty icon="🗺" title="Sin puntos" sub="Añade el primero"/>}
          {visible.sort((a,b)=>{if(!myPos)return 0;return distKm(myPos.lat,myPos.lon,a.lat,a.lon)-distKm(myPos.lat,myPos.lon,b.lat,b.lon);}).map(p=>{
            const PT=getPT(p.type);
            const isOwn=p.addedBy===(prof.nombre||"Anónimo");
            const d=myPos?Math.round(distKm(myPos.lat,myPos.lon,p.lat,p.lon)):null;
            const dl=daysLeft(p);
            const addedStr=p.addedAt?`${daysAgo(p.addedAt)}d`:"";
            return(
              <div key={p.id} style={{background:cardBg,borderRadius:12,padding:"12px 14px",marginBottom:8,boxShadow:"0 2px 5px rgba(0,0,0,.05)",border:dl!==null&&dl<=3?`2px solid #EF4444`:"none",borderLeft:`4px solid ${PT.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:PT.color}}>{PT.icon} {p.name||PT.label}</div>
                    {p.city&&<div style={{fontSize:13,color:sub,marginTop:2}}>📍 {p.city}</div>}
                    {p.note&&<div style={{fontSize:13,color:sub,marginTop:2}}>📝 {p.note}</div>}
                    <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                      <div style={{fontSize:11,color:sub}}>Por {p.addedBy||"Anónimo"}{addedStr?` · hace ${addedStr}`:""}</div>
                      {dl!==null&&<div style={{fontSize:11,color:dl<=3?"#EF4444":"#94A3B8",fontWeight:dl<=3?800:400}}>{dl<=1?"⏰ Caduca hoy":dl<=3?`⏰ Caduca en ${dl}d`:`Caduca en ${dl}d`}</div>}
                    </div>
                  </div>
                  <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    {d!==null&&<div style={{fontSize:14,fontWeight:800,color:"#F59E0B"}}>{d} km</div>}
                    {isOwn&&<button onClick={async()=>{await deleteParking(p.id);setParkings(prev=>prev.filter(x=>x.id!==p.id));showToast("Eliminado");}} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:7,padding:"4px 9px",fontSize:11,color:"#DC2626",cursor:"pointer",fontWeight:700}}>🗑 Eliminar</button>}
                    <button onClick={()=>{if(mapRef.current){setListView(false);setTimeout(()=>mapRef.current?.setView([p.lat,p.lon],14),100);}}} style={{background:"#F1F5F9",border:"1.5px solid #E2E8F0",borderRadius:7,padding:"4px 9px",fontSize:11,color:"#475569",cursor:"pointer",fontWeight:700}}>🗺 Ver</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"rgba(0,0,0,.7)",color:"white",borderRadius:10,padding:"12px 20px",fontSize:13,fontWeight:700,zIndex:500}}>⏳ Cargando…</div>}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:600,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(6px)"}} onClick={()=>{setModal(false);setSuggestions([]);setShowSug(false);}}>
          <div style={{background:dark?"#0F172A":"white",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"#1E293B",padding:"14px 16px 12px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:10}}>
              <div style={{fontSize:14,fontWeight:800,color:"#F59E0B"}}>➕ AÑADIR PUNTO AL MAPA</div>
              <button onClick={()=>{setModal(false);setSuggestions([]);setShowSug(false);}} style={{background:"#334155",border:"none",borderRadius:8,padding:"6px 12px",color:"#94A3B8",fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{padding:"16px 16px 32px",display:"flex",flexDirection:"column",gap:14}}>

              {/* Valoración: seguro o inseguro */}
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:8}}>¿CÓMO ES ESTE SITIO?</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[
                    {id:"seguro",  icon:"🟢", label:"SEGURO",   sub:"Recomendado, sin problemas", color:"#22C55E"},
                    {id:"inseguro",icon:"🔴", label:"INSEGURO", sub:"Robos, peligroso, evitar",   color:"#EF4444"},
                  ].map(({id,icon,label,sub:s2,color})=>(
                    <button key={id} onClick={()=>setForm(p=>({...p,type:id}))}
                      style={{border:`2px solid ${form.type===id?color:color+"30"}`,background:form.type===id?color+"15":dark?"#1E293B":"#F8FAFC",borderRadius:12,padding:"14px 8px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:28,marginBottom:4}}>{icon}</div>
                      <div style={{fontSize:14,fontWeight:800,color:form.type===id?color:"#64748B"}}>{label}</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{s2}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:6}}>NOMBRE (opcional)</div>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Área de servicio La Jonquera"
                  style={{width:"100%",background:dark?"#1E293B":"#F8FAFC",border:`1.5px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:10,padding:"12px 13px",fontSize:15,color:txt,outline:"none",boxSizing:"border-box"}}/>
              </div>

              {/* Servicios disponibles */}
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:8}}>SERVICIOS DISPONIBLES</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {[
                    {id:"ducha",label:"🚿 Duchas"},
                    {id:"comida",label:"🍽 Restaurante"},
                    {id:"gasoil",label:"⛽ Gasoil"},
                    {id:"wifi",label:"📶 WiFi"},
                    {id:"mecanico",label:"🔧 Mecánico"},
                    {id:"aseos",label:"🚻 Aseos"},
                    {id:"tienda",label:"🛒 Tienda"},
                    {id:"camaras",label:"📷 Cámaras"},
                  ].map(({id,label})=>{
                    const selected=(form.servicios||[]).includes(id);
                    return(
                      <button key={id} onClick={()=>setForm(p=>({...p,servicios:selected?(p.servicios||[]).filter(s=>s!==id):[...(p.servicios||[]),id]}))}
                        style={{background:selected?"#F59E0B20":dark?"#1E293B":"#F1F5F9",border:`1.5px solid ${selected?"#F59E0B":"#E2E8F0"}`,borderRadius:20,padding:"6px 12px",fontSize:13,fontWeight:selected?700:400,color:selected?"#F59E0B":txt,cursor:"pointer"}}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nota libre */}
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:6}}>COMENTARIO (opcional)</div>
                <textarea value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} placeholder="Ej: Cuidado con los ladrones de gasoil por la noche..."
                  style={{width:"100%",background:dark?"#1E293B":"#F8FAFC",border:`1.5px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:10,padding:"12px 13px",fontSize:14,color:txt,outline:"none",resize:"none",minHeight:70,fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>

              {/* Ubicación — búsqueda por ciudad */}
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:1,marginBottom:6}}>📍 UBICACIÓN *</div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,position:"relative"}}>
                    <input value={form.loc} onChange={e=>handleLocInput(e.target.value)} onFocus={()=>form.loc.length>1&&setShowSug(true)} onBlur={()=>setTimeout(()=>setShowSug(false),200)} placeholder="Ciudad o área de servicio..."
                      style={{width:"100%",background:dark?"#1E293B":"#F8FAFC",border:`1.5px solid ${dark?"#334155":"#E2E8F0"}`,borderRadius:10,padding:"12px 13px",fontSize:14,color:txt,outline:"none",boxSizing:"border-box"}}/>
                    {showSug&&suggestions.length>0&&(
                      <div style={{position:"absolute",top:"100%",left:0,right:0,background:dark?"#1E293B":"white",border:"2px solid #E2E8F0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:100,maxHeight:200,overflowY:"auto"}}>
                        {suggestions.map((sg,i)=>(
                          <div key={i} onClick={()=>{setForm(p=>({...p,loc:sg.name,_lat:sg.lat,_lon:sg.lon}));setShowSug(false);if(mapRef.current)mapRef.current.setView([sg.lat,sg.lon],11);}}
                            style={{padding:"10px 14px",cursor:"pointer",fontSize:13,color:txt,borderBottom:"1px solid #F1F5F9"}}>
                            📍 {sg.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={getGPSForForm} disabled={locating}
                    style={{background:"#3B82F6",color:"white",border:"none",borderRadius:10,padding:"0 12px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,height:"46px",whiteSpace:"nowrap"}}>
                    {locating?"⌛":"📍 GPS"}
                  </button>
                </div>
                {form._lat&&(
                  <div style={{fontSize:12,color:"#22C55E",marginTop:4,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                    ✓ Ubicación obtenida
                    <button onClick={()=>{if(mapRef.current&&form._lat)mapRef.current.setView([form._lat,form._lon],12);}} style={{background:"#0F172A",border:"1px solid #334155",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#64748B",cursor:"pointer"}}>
                      Ver en mapa
                    </button>
                  </div>
                )}
              </div>

              <button onClick={handleAdd} disabled={saving||(!form._lat&&!form.loc.trim())||!form.type}
                style={{width:"100%",background:!form.type||(!form._lat&&!form.loc.trim())?"#334155":"#22C55E",color:"white",border:"none",borderRadius:12,padding:"16px",fontSize:16,fontWeight:800,cursor:"pointer",marginTop:4}}>
                ✅ GUARDAR EN EL MAPA
              </button>
            </div>
          </div>
        </div>
      )}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1E293B",color:"white",padding:"10px 20px",borderRadius:11,fontSize:13,fontWeight:700,zIndex:700,whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
//  PANEL ADMINISTRADOR — Solo para jlopezasv@gmail.com
// ─────────────────────────────────────────────────────────────
function AdminPanel({dark}){
  const[empresas,setEmpresas]=useState([]);
  const[usuarios,setUsuarios]=useState([]);
  const[loading,setLoading]=useState(true);
  const[vista,setVista]=useState("empresas");
  const[stats,setStats]=useState({});
  const[addOpen,setAddOpen]=useState(false);
  const[addForm,setAddForm]=useState({nombre:"",cif:"",email:""});
  const[addLoading,setAddLoading]=useState(false);
  const[addCondOpen,setAddCondOpen]=useState(false);
  const[addCondForm,setAddCondForm]=useState({nombre:"",email:""});
  const[addCondLoading,setAddCondLoading]=useState(false);
  const[toast,setToast]=useState("");
  const showPurgeTestUi=import.meta.env.DEV||import.meta.env.VITE_ENABLE_PURGE_TEST_COMPANY==="1";
  const[purgeModal,setPurgeModal]=useState(null);
  const[purgePhrase,setPurgePhrase]=useState("");
  const[purgeKillAuth,setPurgeKillAuth]=useState(true);
  const[purgeBusy,setPurgeBusy]=useState(false);
  const PURGE_PHRASE="PURGO_EMPRESA_PRUEBA";
  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),4000);};
  const bg=dark?"#0F172A":"#F0F4F8";
  const cardBg=dark?"#1E293B":"white";
  const txt=dark?"#F1F5F9":"#0F172A";
  const sub=dark?"#94A3B8":"#64748B";

  useEffect(()=>{load();},[]);

  async function crearConductorSolo(){
    if(!addCondForm.nombre.trim()||!addCondForm.email.trim()){
      showToast("❌ Nombre y email son obligatorios");return;
    }
    setAddCondLoading(true);
    try{
      const res=await fetch("/api/admin",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"invite_conductor_solo",
          admin_uid:getUserId(),
          email:addCondForm.email.trim(),
          nombre:addCondForm.nombre.trim(),
        })
      });
      const data=await res.json();
      if(!res.ok){showToast("❌ "+(data.error||"Error"));setAddCondLoading(false);return;}
      showToast(`✅ Invitación enviada a ${addCondForm.email}`);
      setAddCondForm({nombre:"",email:""});
      setAddCondOpen(false);
      await load();
    }catch(e){showToast("❌ "+e.message);}
    setAddCondLoading(false);
  }

  async function crearEmpresa(){
    if(!addForm.nombre.trim()||!addForm.email.trim()){
      showToast("❌ Nombre y email son obligatorios");return;
    }
    setAddLoading(true);
    try{
      const codigo=addForm.nombre.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4)+(Math.floor(Math.random()*90)+10);
      const res=await fetch("/api/admin",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"create_user",
          admin_uid:getUserId(),
          email:addForm.email.trim(),
          nombre:addForm.nombre.trim(),
          cif:addForm.cif.trim()||null,
          codigo
        })
      });
      const data=await res.json();
      if(!res.ok){showToast("❌ "+(data.error||"Error desconocido"));setAddLoading(false);return;}
      showToast(`✅ Empresa "${addForm.nombre}" creada · Invitación enviada a ${addForm.email}`);
      setAddForm({nombre:"",cif:"",email:""});
      setAddOpen(false);
      await load();
    }catch(e){showToast("❌ Error: "+e.message);}
    setAddLoading(false);
  }

  async function load(){
    setLoading(true);
    try{
      const emps=await sbSelect("empresas","order=created_at.desc");
      const empsConConds=await Promise.all(emps.map(async emp=>{
        const conds=await sbSelect("conductor_empresa",`empresa_id=eq.${emp.id}&activo=eq.true`);
        const condConNombreParts=await Promise.all(conds.map(async c=>{
          try{
            const p=await sbSelect("profiles",`id=eq.${c.user_id}`);
            if(p[0]?.is_archived)return null;
            return{...c,nombreReal:p[0]?.nombre||c.nombre||"Sin nombre"};
          }catch(_){return{...c,nombreReal:c.nombre||"Sin nombre"};}
        }));
        const condConNombre=condConNombreParts.filter(Boolean);
        const entries=await sbSelect("entries",`user_id=eq.${emp.owner_id}&order=ts.desc&limit=1`);
        return{...emp,conductoresList:condConNombre,conductores:condConNombre.length,ultimaActividad:entries[0]?.ts||null};
      }));
      setEmpresas(empsConConds);
      const perfiles=await sbSelect("profiles","is_archived=eq.false&order=updated_at.desc&limit=100");
      // Enriquecer perfiles con empresa
      const ceAll=await sbSelect("conductor_empresa","activo=eq.true");
      const perfilesConEmp=perfiles.map(p=>{
        const rel=ceAll.find(c=>c.user_id===p.id);
        const emp=emps.find(e=>e.id===rel?.empresa_id);
        return{...p,empresaNombre:emp?.nombre||null};
      });
      setUsuarios(perfilesConEmp);
      const totalCondsRaw=await sbSelect("conductor_empresa","activo=eq.true");
      const condUids=[...new Set(totalCondsRaw.map(c=>c.user_id).filter(Boolean))];
      let conductoresActivos=0;
      if(condUids.length){
        const idList=condUids.join(",");
        const profFlags=await sbSelect("profiles",`id=in.(${idList})&select=id,is_archived`).catch(()=>[]);
        const archSet=new Set((profFlags||[]).filter(p=>p.is_archived).map(p=>p.id));
        conductoresActivos=totalCondsRaw.filter(c=>c.user_id&&!archSet.has(c.user_id)).length;
      }
      const totalEntries=await sbSelect("entries","order=ts.desc&limit=1");
      setStats({empresas:emps.length,conductores:conductoresActivos,usuarios:perfiles.length,ultimaEntry:totalEntries[0]?.ts||null});
    }catch(e){console.error(e);}
    setLoading(false);
  }

  if(loading)return<div style={{padding:40,textAlign:"center",color:sub}}>⏳ Cargando datos...</div>;

  return(
    <div style={{padding:"16px 16px 80px",background:bg,minHeight:"100vh"}}>
      {/* Header */}
      <div style={{background:"#1E293B",borderRadius:16,padding:"16px 20px",marginBottom:16}}>
        <div style={{fontSize:11,color:"#64748B",fontWeight:700,letterSpacing:1}}>PANEL DE ADMINISTRADOR</div>
        <div style={{fontSize:22,fontWeight:800,color:"#F59E0B",marginBottom:12}}>⚡ Control Global</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[
            {l:"Empresas",v:stats.empresas,c:"#F59E0B"},
            {l:"Conductores",v:stats.conductores,c:"#22C55E"},
            {l:"Usuarios",v:stats.usuarios,c:"#06B6D4"},
            {l:"Última actividad",v:stats.ultimaEntry?fmtT(new Date(stats.ultimaEntry)):"—",c:"#A78BFA"},
          ].map(({l,v,c})=>(
            <div key={l} style={{background:"rgba(255,255,255,.07)",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:10,color:"#64748B",marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[{id:"empresas",label:"🏢 Empresas"},{id:"usuarios",label:"👤 Usuarios"}].map(t=>(
          <button key={t.id} onClick={()=>setVista(t.id)}
            style={{flex:1,background:vista===t.id?"#1E293B":cardBg,color:vista===t.id?"#F59E0B":sub,border:`2px solid ${vista===t.id?"#334155":"#E2E8F0"}`,borderRadius:10,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Crear empresa */}
      {vista==="empresas"&&(
        <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
          {!addOpen?(
            <button onClick={()=>setAddOpen(true)} style={{width:"100%",background:"#22C55E",color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
              + Dar de alta nueva empresa
            </button>
          ):(
            <div style={{background:cardBg,borderRadius:14,padding:"18px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
              <div style={{fontSize:14,fontWeight:800,color:txt,marginBottom:14}}>🏢 Nueva empresa</div>
              {[
                {k:"nombre",ph:"Nombre de la empresa *",label:"Empresa"},
                {k:"cif",   ph:"CIF (opcional)",        label:"CIF"},
                {k:"email", ph:"Email del jefe *",       label:"Email del jefe"},
              ].map(({k,ph,label})=>(
                <div key={k} style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:sub,fontWeight:700,marginBottom:4}}>{label.toUpperCase()}</div>
                  <input
                    type="text"
                    value={addForm[k]}
                    onChange={e=>setAddForm(p=>({...p,[k]:e.target.value}))}
                    placeholder={ph}
                    style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"2px solid #334155",borderRadius:9,padding:"11px 13px",fontSize:14,color:txt,outline:"none"}}
                  />
                </div>
              ))}
              <div style={{background:"#F0FDF4",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#166534",border:"1px solid #BBF7D0"}}>
                📧 El jefe recibirá un email para establecer su propia contraseña y acceder a la app.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>setAddOpen(false)} style={{background:"#334155",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
                <button onClick={crearEmpresa} disabled={addLoading} style={{background:addLoading?"#475569":"#22C55E",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:800,cursor:addLoading?"default":"pointer"}}>
                  {addLoading?"⏳ Creando...":"✓ Crear empresa"}
                </button>
              </div>
            </div>
          )}

          {/* Conductor autónomo */}
          {!addCondOpen?(
            <button onClick={()=>{setAddOpen(false);setAddCondOpen(true);}} style={{width:"100%",background:"#334155",color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              + Dar de alta conductor autónomo
            </button>
          ):(
            <div style={{background:cardBg,borderRadius:14,padding:"18px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
              <div style={{fontSize:14,fontWeight:800,color:txt,marginBottom:14}}>🚛 Conductor autónomo</div>
              {[
                {k:"nombre",ph:"Nombre completo *",label:"Nombre"},
                {k:"email", ph:"Email *",           label:"Email"},
              ].map(({k,ph,label})=>(
                <div key={k} style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:sub,fontWeight:700,marginBottom:4}}>{label.toUpperCase()}</div>
                  <input
                    type="text"
                    value={addCondForm[k]}
                    onChange={e=>setAddCondForm(p=>({...p,[k]:e.target.value}))}
                    placeholder={ph}
                    style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"2px solid #334155",borderRadius:9,padding:"11px 13px",fontSize:14,color:txt,outline:"none"}}
                  />
                </div>
              ))}
              <div style={{background:"#F0FDF4",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#166534",border:"1px solid #BBF7D0"}}>
                📧 El conductor recibirá un email para establecer su contraseña y acceder a la app.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>setAddCondOpen(false)} style={{background:"#334155",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
                <button onClick={crearConductorSolo} disabled={addCondLoading} style={{background:addCondLoading?"#475569":"#22C55E",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:800,cursor:addCondLoading?"default":"pointer"}}>
                  {addCondLoading?"⏳ Creando...":"✓ Crear conductor"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Empresas */}
      {vista==="empresas"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {empresas.length===0&&<div style={{textAlign:"center",padding:40,color:sub}}>Sin empresas registradas</div>}
          {empresas.map(e=>(
            <div key={e.id} style={{background:cardBg,borderRadius:14,padding:"14px 16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
              {/* Cabecera empresa */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:17,fontWeight:800,color:txt}}>{e.nombre}</div>
                  {e.cif&&<div style={{fontSize:12,color:sub}}>CIF: {e.cif}</div>}
                  <div style={{fontSize:11,color:sub,marginTop:2}}>Registrada: {fmtD(new Date(e.created_at))}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:22,fontWeight:800,color:"#22C55E"}}>{e.conductores}</div>
                  <div style={{fontSize:11,color:sub}}>conductores</div>
                </div>
              </div>
              {/* Código y actividad */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div style={{background:dark?"#0F172A":"#F8FAFC",borderRadius:9,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:sub,fontWeight:700}}>CÓDIGO</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#F59E0B",fontFamily:"monospace"}}>{getEmpresaCodigoEquipoDisplay(e)||"—"}</div>
                </div>
                <div style={{background:dark?"#0F172A":"#F8FAFC",borderRadius:9,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:sub,fontWeight:700}}>ÚLTIMA ACTIVIDAD</div>
                  <div style={{fontSize:13,fontWeight:700,color:txt}}>{e.ultimaActividad?fmtT(new Date(e.ultimaActividad)):"Sin actividad"}</div>
                </div>
              </div>
              {/* Lista de conductores */}
              {e.conductoresList?.length>0&&(
                <div style={{background:dark?"#0F172A":"#F8FAFC",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,color:sub,fontWeight:700,marginBottom:8}}>CONDUCTORES ({e.conductoresList.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {e.conductoresList.map(c=>(
                      <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",background:cardBg,borderRadius:7}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:txt}}>{c.nombreReal}</div>
                          <div style={{fontSize:11,color:sub}}>{c.matricula||"Sin matrícula"}</div>
                        </div>
                        <button onClick={async()=>{
                          if(!confirm(`¿Archivar conductor "${c.nombreReal}"? Dejará de aparecer en la app y no podrá iniciar sesión; los datos y expedientes se conservan.`))return;
                          const tok=getAccessToken();
                          const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json",...(tok?{Authorization:`Bearer ${tok}`}:{})},body:JSON.stringify({action:"archive_user",admin_uid:getUserId(),user_id:c.user_id})});
                          const d=await r.json();
                          if(r.ok)showToast("✅ Conductor archivado");
                          else showToast("❌ "+(d.error||"Error"));
                          await load();
                        }} style={{background:"#FFFBEB",color:"#B45309",border:"1px solid #FDE68A",borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          📦
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {e.conductoresList?.length===0&&(
                <div style={{background:dark?"#0F172A":"#F8FAFC",borderRadius:10,padding:"10px 12px",marginBottom:10,fontSize:12,color:sub,textAlign:"center"}}>
                  Sin conductores — la empresa permanece activa
                </div>
              )}
              <button onClick={async()=>{
                if(!confirm(`¿Eliminar la empresa "${e.nombre}"? Los conductores NO se borrarán.`))return;
                const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete_empresa",admin_uid:getUserId(),empresa_id:e.id})});
                const d=await r.json();
                if(r.ok)showToast("✅ Empresa eliminada");
                else showToast("❌ "+d.error);
                await load();
              }} style={{width:"100%",background:"#FEF2F2",color:"#EF4444",border:"1.5px solid #FECACA",borderRadius:9,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                🗑 Eliminar empresa
              </button>
              {showPurgeTestUi&&(
                <button type="button" onClick={()=>{setPurgeModal({id:e.id,nombre:e.nombre||""});setPurgePhrase("");setPurgeKillAuth(true);}}
                  style={{width:"100%",marginTop:8,background:"#431407",color:"#FED7AA",border:"1.5px solid #9A3412",borderRadius:9,padding:"8px",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                  ⚠ Purgar empresa de prueba (DEV/STAGING)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Usuarios */}
      {vista==="usuarios"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {usuarios.length===0&&<div style={{textAlign:"center",padding:40,color:sub}}>Sin usuarios</div>}
          {usuarios.map(u=>(
            <div key={u.id} style={{background:cardBg,borderRadius:12,padding:"12px 16px",boxShadow:"0 2px 4px rgba(0,0,0,.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:txt}}>{u.nombre||"Sin nombre"}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                    {u.empresaNombre
                      ? <span style={{background:"#F59E0B20",color:"#B45309",border:"1px solid #F59E0B40",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>🏢 {u.empresaNombre}</span>
                      : <span style={{background:"#64748B20",color:"#64748B",border:"1px solid #64748B40",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>Autónomo</span>
                    }
                    {u.matricula&&<span style={{fontSize:11,color:sub,fontFamily:"monospace"}}>{u.matricula}</span>}
                  </div>
                  <div style={{fontSize:11,color:sub,marginTop:3}}>
                    {u.tipo_servicio==="internacional"?"🌍 Internacional":"🇪🇸 Nacional"} · {u.pais_base||"ES"}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:sub}}>{u.updated_at?fmtD(new Date(u.updated_at)):"—"}</div>
                  <div style={{fontSize:10,color:"#475569",marginTop:2,fontFamily:"monospace"}}>{u.id?.slice(0,8)}...</div>
                </div>
              </div>
              {!isPlatformAdminUid(u.id)&&(
                <button onClick={async()=>{
                  if(!confirm(`¿Archivar usuario "${u.nombre||u.id}"? No podrá iniciar sesión; expedientes y relaciones se conservan.`))return;
                  const tok=getAccessToken();
                  const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json",...(tok?{Authorization:`Bearer ${tok}`}:{})},body:JSON.stringify({action:"archive_user",admin_uid:getUserId(),user_id:u.id})});
                  const d=await r.json();
                  if(r.ok)showToast("✅ Usuario archivado");
                  else showToast("❌ "+(d.error||"Error"));
                  await load();
                }} style={{width:"100%",background:"#FFFBEB",color:"#B45309",border:"1.5px solid #FDE68A",borderRadius:9,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  📦 Archivar usuario
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={load} style={{width:"100%",marginTop:16,background:"#334155",color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
        🔄 Actualizar datos
      </button>
      {purgeModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!purgeBusy&&setPurgeModal(null)}>
          <div style={{maxWidth:420,width:"100%",background:cardBg,borderRadius:16,padding:20,boxShadow:"0 16px 48px rgba(0,0,0,.45)",border:"2px solid #9A3412"}} onClick={ev=>ev.stopPropagation()}>
            <div style={{fontSize:12,fontWeight:800,color:"#B45309",letterSpacing:1,marginBottom:6}}>DEV / STAGING — PURGA TOTAL</div>
            <div style={{fontSize:17,fontWeight:800,color:txt,marginBottom:10}}>{purgeModal.nombre||"Empresa"}</div>
            <p style={{fontSize:13,color:sub,lineHeight:1.55,margin:"0 0 12px"}}>
              Esto eliminará <strong style={{color:"#B91C1C"}}>permanentemente</strong> todos los datos relacionados con esta empresa de prueba: servicios, evidencias, tracking, relaciones flota, conductores de prueba (cuentas Auth) y la empresa. No usar en producción.
            </p>
            <p style={{fontSize:12,color:"#92400E",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:10,margin:"0 0 12px",lineHeight:1.45}}>
              El archivado lógico de producción no se ve afectado por esta herramienta; esta acción es distinta y es irreversible.
            </p>
            <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,cursor:"pointer",fontSize:13,color:txt}}>
              <input type="checkbox" checked={purgeKillAuth} onChange={ev=>setPurgeKillAuth(ev.target.checked)} disabled={purgeBusy}/>
              Eliminar también cuentas Auth de conductores vinculados (recomendado en pruebas)
            </label>
            <div style={{fontSize:11,color:sub,marginBottom:6,fontWeight:700}}>Escribe la frase exacta para confirmar:</div>
            <code style={{display:"block",fontSize:12,background:dark?"#0F172A":"#F1F5F9",padding:"8px 10px",borderRadius:8,marginBottom:8,color:"#B45309",fontWeight:700}}>{PURGE_PHRASE}</code>
            <input value={purgePhrase} onChange={ev=>setPurgePhrase(ev.target.value)} disabled={purgeBusy} placeholder={PURGE_PHRASE}
              style={{width:"100%",boxSizing:"border-box",marginBottom:14,padding:"11px 12px",fontSize:14,borderRadius:9,border:`2px solid ${dark?"#334155":"#CBD5E1"}`,background:dark?"#0F172A":"#fff",color:txt}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button type="button" disabled={purgeBusy} onClick={()=>setPurgeModal(null)} style={{padding:11,borderRadius:9,border:`1px solid ${dark?"#475569":"#CBD5E1"}`,background:"transparent",color:sub,fontWeight:700,cursor:purgeBusy?"default":"pointer"}}>Cancelar</button>
              <button type="button" disabled={purgeBusy||purgePhrase.trim()!==PURGE_PHRASE} onClick={async()=>{
                if(purgePhrase.trim()!==PURGE_PHRASE)return;
                setPurgeBusy(true);
                try{
                  const tok=getAccessToken();
                  const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json",...(tok?{Authorization:`Bearer ${tok}`}:{})},body:JSON.stringify({action:"purge_test_company",admin_uid:getUserId(),empresa_id:purgeModal.id,confirm_text:purgePhrase.trim(),purge_conductor_accounts:purgeKillAuth})});
                  const d=await r.json().catch(()=>({}));
                  if(r.ok){showToast(`✅ Purga completada · ${JSON.stringify(d.deleted||{})}`);setPurgeModal(null);await load();}
                  else showToast("❌ "+(d.error||d.code||"Error"));
                }catch(err){showToast("❌ "+err.message);}
                setPurgeBusy(false);
              }} style={{padding:11,borderRadius:9,border:"none",background:purgeBusy||purgePhrase.trim()!==PURGE_PHRASE?"#94A3B8":"#B91C1C",color:"white",fontWeight:800,cursor:purgeBusy||purgePhrase.trim()!==PURGE_PHRASE?"default":"pointer"}}>
                {purgeBusy?"…":"Purgar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1E293B",color:"white",padding:"13px 20px",borderRadius:12,fontSize:13,fontWeight:700,zIndex:999,maxWidth:"90vw",textAlign:"center"}}>{toast}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PANEL EMPRESA / JEFE DE FLOTA
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  HOOK — ALTURA DINÁMICA DEL MODAL (teclado iOS/Android)
// ─────────────────────────────────────────────────────────────
function useModalLayout(){
  const[isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  const[viewH,setViewH]=useState(()=>typeof window!=="undefined"?(window.visualViewport?.height||window.innerHeight):600);

  useEffect(()=>{
    function update(){
      setIsMobile(window.innerWidth<768);
      setViewH(window.visualViewport?.height||window.innerHeight);
    }
    update();
    window.addEventListener("resize",update);
    if(window.visualViewport)window.visualViewport.addEventListener("resize",update);
    return()=>{
      window.removeEventListener("resize",update);
      if(window.visualViewport)window.visualViewport.removeEventListener("resize",update);
    };
  },[]);

  // En móvil usamos el visualViewport para compensar el teclado
  const modalStyle=isMobile?{
    // Bottom sheet fullscreen
    position:"fixed",
    left:0,right:0,bottom:0,
    width:"100%",
    height:`${Math.min(viewH*0.95,viewH-20)}px`,
    borderRadius:"20px 20px 0 0",
    display:"flex",
    flexDirection:"column",
    overflow:"hidden",
  }:{
    // Modal centrado desktop/tablet
    position:"relative",
    width:"100%",
    maxWidth:560,
    maxHeight:"88vh",
    borderRadius:16,
    display:"flex",
    flexDirection:"column",
    overflow:"hidden",
  };

  const overlayStyle=isMobile?{
    position:"fixed",top:0,left:0,right:0,bottom:0,
    background:"rgba(0,0,0,.7)",
    zIndex:9999,
    display:"flex",
    alignItems:"flex-end",
    justifyContent:"center",
  }:{
    position:"fixed",top:0,left:0,right:0,bottom:0,
    background:"rgba(0,0,0,.7)",
    zIndex:9999,
    display:"flex",
    alignItems:"center",
    justifyContent:"center",
    padding:"20px",
  };

  return{isMobile,overlayStyle,modalStyle};
}

// ─────────────────────────────────────────────────────────────
//  ASIGNAR SERVICIO A CONDUCTOR — modal para el jefe de flota
// ─────────────────────────────────────────────────────────────
async function persistServicioStopsTrasCrear({servicioId,stops,origen,destino,logTag}){
  const result=await insertStopsForServicio(servicioId,stops);
  if(result.ok){
    if(result.partial){
      console.warn(`[OP3] create stops partial (${logTag})`,{servicioId,error:result.error});
    }else{
      console.log(`[OP3] create stops ok (${logTag})`,{servicioId,rows:result.rows?.length||stops?.length});
    }
    return;
  }
  console.warn(`[OP3] create stops failed (${logTag})`,{
    servicioId,
    status:result.status,
    detail:String(result.detail||"").slice(0,400),
  });
  try{
    await ensureServicioHasStops({servicioId,origen,destino});
    console.log(`[OP3] create stops fallback ok (${logTag})`,{servicioId});
    return;
  }catch(fallbackErr){
    console.warn(`[OP3] create stops fallback failed (${logTag})`,{
      servicioId,
      error:fallbackErr?.message||fallbackErr,
    });
  }
  throw new Error(result.error||"No se pudieron crear las paradas del servicio");
}

async function patchServicioIdentidadOpcional(servicioId,{serviceNumber,cliente,referenciaCliente,referencia}){
  if(!servicioId)return;
  const referenciaBase=serviceNumber?.trim()||null;
  const patch={
    service_number:referenciaBase,
    cliente:cliente?.trim()||null,
    referencia_cliente:referenciaCliente?.trim()||null,
    referencia,
  };
  const res=await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`,{
    method:"PATCH",
    headers:{"Prefer":"return=representation"},
    body:JSON.stringify(patch),
  });
  if(res.ok)return;
  const t=await res.text().catch(()=>"");
  if(!/service_number|referencia_cliente|cliente|column|schema|PGRST/i.test(t))return;
  await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`,{
    method:"PATCH",
    body:JSON.stringify({referencia}),
  }).catch(()=>{});
}

/** TEMP: depuración INSERT servicios (planificar sin conductor / RLS). Quitar cuando RLS esté validado. */
const SERVICE_CREATE_DEBUG=false;
function logServiceCreate(tag,payload){
  if(!SERVICE_CREATE_DEBUG)return;
  const line=`[${tag}]`;
  console.log(line,payload);
  if(tag.includes("FAIL"))console.warn(line,payload);
}

async function crearServicioConIdentidad({
  serviceNumber,
  cliente,
  referenciaCliente,
  operationalPlaces = null,
  ownershipMode = SERVICIO_OWNERSHIP.FLEET_EMPRESA,
  _debugSource,
  ...basePayload
}) {
  const referenciaBase = serviceNumber?.trim() || null;
  const placesPatch = operationalPlaces
    ? buildOperationalPlacesMetaPatch(operationalPlaces)
    : {};
  const identityMeta = buildServiceIdentityMeta({
    cliente,
    referenciaCliente,
    lugaresOperativos: placesPatch.lugares_operativos,
  });
  const referencia =
    Object.keys(identityMeta).length || Object.keys(placesPatch).length
      ? mergeReferenciaOperacional(referenciaBase, { ...identityMeta, ...placesPatch })
      : referenciaBase;
  const insertCtx = await resolveServicioInsertContext({
    ownershipMode,
    empresaIdProp: basePayload.empresa_id,
    conductorIdProp: basePayload.conductor_id,
    estado: basePayload.estado,
  });
  const { empresa_id: empresaId, conductor_id: conductorId, estado: resolvedEstado } = insertCtx;
  const empresaIdRaw = basePayload.empresa_id;
  const corePayload = {
    empresa_id: empresaId,
    conductor_id: conductorId,
    estado: resolvedEstado,
    origen: String(basePayload.origen || "").trim(),
    destino: String(basePayload.destino || "").trim(),
    referencia: referencia || null,
    fecha_inicio: basePayload.fecha_inicio || null,
  };
  const payload = corePayload;

  logServiceCreate("SERVICE_CREATE_START",{
    source:_debugSource||"crearServicioConIdentidad",
    authUid:getUserId?.()||null,
    sinConductor:!conductorId,
  });
  logServiceCreate("SERVICE_CREATE_EMPRESA_ID",{
    raw:empresaIdRaw,
    resolved:empresaId,
    isNull:empresaId==null,
    typeRaw:empresaIdRaw==null?"null/undefined":typeof empresaIdRaw,
  });
  logServiceCreate("SERVICE_CREATE_CONDUCTOR_ID",{
    value:conductorId,
    isNull:conductorId==null,
  });
  logServiceCreate("SERVICE_CREATE_PAYLOAD",{
    endpoint:"POST /rest/v1/servicios",
    attempt:"core_only",
    body:corePayload,
    estado:corePayload.estado,
    empresa_id:corePayload.empresa_id,
    conductor_id:corePayload.conductor_id,
    json:JSON.stringify(corePayload),
  });

  if(!empresaId&&!conductorId){
    const msg="Falta empresa_id y conductor_id: no se puede crear el servicio.";
    logServiceCreate("SERVICE_CREATE_RESPONSE_FAIL",{status:0,errText:msg,empresa_id:null});
    console.log("SERVICE_CREATE_RESPONSE_FAIL",{
      error:msg,
      payload,
      empresa_id:payload?.empresa_id,
      conductor_id:payload?.conductor_id,
    });
    throw new Error(msg);
  }

  let res;
  try{
    res=await sbFetch("/rest/v1/servicios", {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(corePayload),
    });
  }catch(error){
    logServiceCreate("SERVICE_CREATE_RESPONSE_FAIL",{error:String(error?.message||error)});
    throw error;
  }

  if (res.ok) {
    const result=await res.json();
    const row=Array.isArray(result)?result[0]:result;
    logServiceCreate("SERVICE_CREATE_RESPONSE_OK",{
      status:res.status,
      row,
      empresa_id_en_respuesta:row?.empresa_id??null,
      conductor_id_en_respuesta:row?.conductor_id??null,
      estado_en_respuesta:row?.estado??null,
    });
    if(row?.id&&(referenciaBase||cliente?.trim()||referenciaCliente?.trim())){
      await patchServicioIdentidadOpcional(row.id,{serviceNumber,cliente,referenciaCliente,referencia});
    }
    return result;
  }

  const errText = await res.text().catch(() => "");
  let errJson = null;
  try {
    errJson = JSON.parse(errText);
  } catch (_) {}
  throw new Error(errText || JSON.stringify(errJson) || `HTTP ${res.status}`);
}

async function sendAssignmentPush({conductorId,origen,destino,fechaInicio,servicioId}){
  if(!conductorId)return;
  const salidaLabel=fechaInicio?new Date(fechaInicio).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}):"";
  const access=getAccessToken();
  const headers={"Content-Type":"application/json"};
  if(access)headers.Authorization=`Bearer ${access}`;
  await fetch("/api/push",{
    method:"POST",
    headers,
    body:JSON.stringify({
      action:"notify_assignment",
      payload:{
        conductor_id:conductorId,
        servicio_id:servicioId||null,
        route:`${String(origen||"").trim()} → ${String(destino||"").trim()}`,
        salida:salidaLabel,
      },
    }),
  }).catch(()=>{});
}

function findStopIndexByTipo(stops,kind){
  if(kind==="carga"){
    const i=stops.findIndex(s=>/carga/.test(String(s.tipo||""))&&!/solo_descarga/.test(String(s.tipo||"")));
    return i>=0?i:0;
  }
  let i=-1;
  for(let j=stops.length-1;j>=0;j--){
    if(/descarga/.test(String(stops[j]?.tipo||""))){i=j;break;}
  }
  return i>=0?i:Math.max(0,stops.length-1);
}

function AsignarServicioModal({conductorId=null,conductorNombre=null,empresaId=null,onClose,onCreado}){
  const sinConductor=!conductorId;
  const[ref,setRef]=useState("");
  const[cliente,setCliente]=useState("");
  const[refCliente,setRefCliente]=useState("");
  const[cargaNombre,setCargaNombre]=useState("");
  const[cargaEmpresa,setCargaEmpresa]=useState("");
  const[cargaDir,setCargaDir]=useState("");
  const[descargaNombre,setDescargaNombre]=useState("");
  const[descargaEmpresa,setDescargaEmpresa]=useState("");
  const[descargaDir,setDescargaDir]=useState("");
  const[fechaInicio,setFechaInicio]=useState(()=>toDTL(new Date()));
  const[stops,setStops]=useState([
    {orden:1,tipo:"carga",nombre:"",empresa:"",direccion:"",notas:""},
    {orden:2,tipo:"descarga",nombre:"",empresa:"",direccion:"",notas:""},
  ]);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const{isMobile,overlayStyle,modalStyle}=useModalLayout();
  const card=EMPRESA_UI.surface,bg=EMPRESA_UI.surfaceSoft,tx=EMPRESA_UI.tx,su=EMPRESA_UI.muted;
  const iStyle={width:"100%",background:bg,border:`1px solid ${EMPRESA_UI.borderStrong}`,borderRadius:9,padding:"11px 13px",fontSize:15,color:tx,outline:"none",boxSizing:"border-box",marginBottom:8};

  function addStop(){setStops(prev=>[...prev,{orden:prev.length+1,tipo:"descarga",nombre:"",empresa:"",direccion:"",notas:""}]);}
  function addStopAfter(i){
    // Insertar después del índice i con orden intermedio
    setStops(prev=>{
      const arr=[...prev];
      const ordenAntes=arr[i].orden;
      const ordenDespues=arr[i+1]?.orden??ordenAntes+1;
      const nuevoOrden=(ordenAntes+ordenDespues)/2;
      const newStop={orden:nuevoOrden,tipo:"carga",nombre:"",empresa:"",direccion:"",notas:""};
      arr.splice(i+1,0,newStop);
      return arr;
    });
  }
  function removeStop(i){setStops(prev=>prev.filter((_,idx)=>idx!==i));}
  function moveStop(i,dir){
    setStops(prev=>{
      const arr=[...prev];
      const j=i+dir;
      if(j<0||j>=arr.length)return arr;
      // Intercambiar orden
      const tmpOrden=arr[i].orden;
      arr[i]={...arr[i],orden:arr[j].orden};
      arr[j]={...arr[j],orden:tmpOrden};
      return [...arr].sort((a,b)=>a.orden-b.orden);
    });
  }
  function changeStop(i,field,val){
    setStops(prev=>{
      const next=prev.map((s,idx)=>idx===i?{...s,[field]:val}:s);
      const ci=findStopIndexByTipo(next,"carga");
      const di=findStopIndexByTipo(next,"descarga");
      if(i===ci){
        if(field==="nombre")setCargaNombre(val);
        else if(field==="empresa")setCargaEmpresa(val);
        else if(field==="direccion")setCargaDir(val);
      }
      if(i===di){
        if(field==="nombre")setDescargaNombre(val);
        else if(field==="empresa")setDescargaEmpresa(val);
        else if(field==="direccion")setDescargaDir(val);
      }
      return next;
    });
  }

  function setCargaFields(lugar,empresa,dir){
    setCargaNombre(lugar);
    setCargaEmpresa(empresa);
    setCargaDir(dir);
    setStops(prev=>prev.map((s,idx)=>idx===findStopIndexByTipo(prev,"carga")?{...s,nombre:lugar,empresa,direccion:dir}:s));
  }

  function setDescargaFields(lugar,empresa,dir){
    setDescargaNombre(lugar);
    setDescargaEmpresa(empresa);
    setDescargaDir(dir);
    setStops(prev=>prev.map((s,idx)=>idx===findStopIndexByTipo(prev,"descarga")?{...s,nombre:lugar,empresa,direccion:dir}:s));
  }

  async function guardar(){
    const operationalPlaces={
      cliente_nombre:cliente.trim(),
      carga_nombre:cargaNombre.trim(),
      carga_empresa:cargaEmpresa.trim(),
      carga_direccion:cargaDir.trim(),
      descarga_nombre:descargaNombre.trim(),
      descarga_empresa:descargaEmpresa.trim(),
      descarga_direccion:descargaDir.trim(),
    };
    const {origen:origenRuta,destino:destinoRuta}=routeTextFromOperationalPlaces(operationalPlaces);
    if(!origenRuta||!destinoRuta){setError("Indica el lugar de origen y destino (localidad o dirección)");return;}
    if(stops.some(s=>!s.nombre.trim())){setError("Todas las paradas necesitan un nombre de lugar");return;}
    if(sinConductor&&!empresaId){setError("Falta la empresa. Vuelve al panel empresa e inténtalo de nuevo.");return;}
    setSaving(true);setError("");
    try{
      logServiceCreate("SERVICE_CREATE_START",{
        source:"AsignarServicioModal.guardar",
        sinConductor,
        empresaIdProp:empresaId,
        empresaIdPropType:empresaId==null?"null":typeof empresaId,
        conductorIdProp:conductorId??null,
        authUid:getUserId?.()||null,
      });
      const srData=await crearServicioConIdentidad({
        _debugSource:"AsignarServicioModal",
        ownershipMode:SERVICIO_OWNERSHIP.FLEET_EMPRESA,
        empresa_id:empresaId||null,
        conductor_id:null,
        estado:SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
        origen:origenRuta,
        destino:destinoRuta,
        serviceNumber:ref.trim(),
        cliente:cliente.trim(),
        referenciaCliente:refCliente.trim(),
        operationalPlaces,
        fecha_inicio:new Date(fechaInicio).toISOString(),
      });
      const sv=Array.isArray(srData)?srData[0]:srData;
      if(!sv?.id)throw new Error("No se pudo crear el servicio");
      let assignResult=null;
      if(!sinConductor){
        assignResult=await asignarConductorEnServicioCreado({
          servicioId:sv.id,
          servicio:sv,
          conductorId,
          conductorNombre:conductorNombre||"Conductor",
          origen:origenRuta,
          destino:destinoRuta,
          fechaInicio:new Date(fechaInicio).toISOString(),
          skipEnsureStops:true,
        });
      }
      const stopsPrepared=stops.map(s=>{
        const emp=String(s.empresa||"").trim();
        if(!emp)return s;
        return{...s,notas:mergeStopOperacionMeta(s.notas,{empresa_logistica:emp})};
      });
      await persistServicioStopsTrasCrear({
        servicioId:sv.id,
        stops:stopsPrepared,
        origen:origenRuta,
        destino:destinoRuta,
        logTag:"AsignarServicioModal",
      });
      if(!sinConductor){
        void sendAssignmentPush({conductorId,origen:origenRuta,destino:destinoRuta,fechaInicio,servicioId:sv.id});
        onCreado(mergeServicioTrasAsignacion(sv,assignResult,conductorId));
        return;
      }
      onCreado(sv);
    }catch(e){
      logServiceCreate("SERVICE_CREATE_RESPONSE_FAIL",{
        source:"AsignarServicioModal.guardar.catch",
        message:e?.message||String(e),
        empresaIdProp:empresaId,
        sinConductor,
      });
      setError("Error: "+e.message);
    }
    finally{setSaving(false);}
  }

  useEffect(()=>{
    logServiceCreate("SERVICE_CREATE_START",{
      source:"AsignarServicioModal.mount",
      empresaIdProp:empresaId,
      empresaIdPropIsNull:empresaId==null,
      conductorIdProp:conductorId??null,
      sinConductor,
    });
  },[]);

  return(
    <div style={overlayStyle} onClick={onClose}>
      <div style={{...modalStyle,background:card,boxShadow:"0 24px 60px rgba(15,23,42,.18)",border:`1px solid ${EMPRESA_UI.border}`}} onClick={e=>e.stopPropagation()}>

        {/* HEADER — sticky */}
        <div style={{padding:"14px 16px 12px",borderBottom:`1px solid ${EMPRESA_UI.border}`,flexShrink:0,background:card}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:15,fontWeight:650,color:tx}}>Nuevo servicio</div>
              <div style={{fontSize:11,color:su,marginTop:1}}>{sinConductor?"Planificación sin conductor":"Conductor seleccionado"}</div>
            </div>
            <button onClick={onClose} style={{background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:8,width:28,height:28,color:EMPRESA_UI.subtle,cursor:"pointer",fontSize:14,flexShrink:0}}>✕</button>
          </div>
          {sinConductor?(
            <div style={{marginTop:12,background:"#eef2ff",border:"1.5px solid #c7d2fe",borderRadius:12,padding:"11px 12px"}}>
              <div style={{fontSize:14,fontWeight:650,color:"#3730a3"}}>Sin conductor asignado</div>
              <div style={{fontSize:11,color:"#475569",marginTop:4}}>Quedará en «Pendiente asignación». Podrás asignar chófer después.</div>
            </div>
          ):(
          <div style={{marginTop:12,background:EMPRESA_UI.accentSoft,border:"1.5px solid #93c5fd",borderRadius:12,padding:"11px 12px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 6px 18px rgba(37,99,235,.10)"}}>
            <span style={{width:22,height:22,borderRadius:"50%",background:EMPRESA_UI.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>✓</span>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,fontWeight:650,color:"#1e3a8a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conductorNombre||"Conductor"}</div>
              <div style={{fontSize:11,color:"#475569",marginTop:1}}>Asignado a este servicio</div>
            </div>
          </div>
          )}
        </div>

        {/* BODY — scrollable */}
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"12px 16px"}}>

          {/* Cliente (comercial) — separado de lugares operativos */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:su,fontWeight:800,marginBottom:3,letterSpacing:.3}}>CLIENTE</div>
            <input value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Mercadona"
              style={{...iStyle,padding:"9px 10px",fontSize:14,marginBottom:0}}/>
          </div>

          <div style={{fontSize:10,color:su,fontWeight:800,marginBottom:6,letterSpacing:.3}}>LUGARES OPERATIVOS</div>
          <div style={{background:bg,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,padding:"10px",marginBottom:8}}>
            <div style={{fontSize:10,color:su,fontWeight:700,marginBottom:6}}>Origen (carga)</div>
            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Lugar</div>
            <input value={cargaNombre} onChange={e=>setCargaFields(e.target.value,cargaEmpresa,cargaDir)} placeholder="Antequera"
              style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:5}}/>
            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Empresa</div>
            <input value={cargaEmpresa} onChange={e=>setCargaFields(cargaNombre,e.target.value,cargaDir)} placeholder="Planta, operador logístico…"
              style={{...iStyle,padding:"8px 10px",fontSize:12,marginBottom:5,color:EMPRESA_UI.subtle}}/>
            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Dirección (opcional)</div>
            <input value={cargaDir} onChange={e=>setCargaFields(cargaNombre,cargaEmpresa,e.target.value)} placeholder="Calle, polígono…"
              style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:0}}/>
          </div>
          <div style={{background:bg,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,padding:"10px",marginBottom:12}}>
            <div style={{fontSize:10,color:su,fontWeight:700,marginBottom:6}}>Destino (descarga)</div>
            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Lugar</div>
            <input value={descargaNombre} onChange={e=>setDescargaFields(e.target.value,descargaEmpresa,descargaDir)} placeholder="Pamplona"
              style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:5}}/>
            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Empresa</div>
            <input value={descargaEmpresa} onChange={e=>setDescargaFields(descargaNombre,e.target.value,descargaDir)} placeholder="Centro de distribución…"
              style={{...iStyle,padding:"8px 10px",fontSize:12,marginBottom:5,color:EMPRESA_UI.subtle}}/>
            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Dirección (opcional)</div>
            <input value={descargaDir} onChange={e=>setDescargaFields(descargaNombre,descargaEmpresa,e.target.value)} placeholder="Calle, polígono…"
              style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:0}}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:su,fontWeight:700,marginBottom:3}}>Ref. servicio</div>
              <input value={ref} onChange={e=>setRef(e.target.value)} placeholder="SRV-0441"
                style={{...iStyle,padding:"9px 10px",fontSize:14,marginBottom:0}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Ref cliente</div>
              <input value={refCliente} onChange={e=>setRefCliente(e.target.value)} placeholder="PED-8821"
                style={{...iStyle,padding:"9px 10px",fontSize:14,marginBottom:0}}/>
            </div>
            <div style={{gridColumn:"1 / -1"}}>
              <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Salida</div>
              <input type="datetime-local" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}
                style={{...iStyle,padding:"9px 10px",fontSize:13,colorScheme:"light",marginBottom:0}}/>
            </div>
          </div>
          {/* Paradas */}
              <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:6}}>Paradas · {stops.length}</div>
          {stops.map((stop,i)=>(
            <div key={stop.orden}>
              <div style={{background:bg,borderRadius:10,padding:"8px 10px",marginBottom:4,border:`1px solid ${EMPRESA_UI.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <span style={{background:"#e2e8f0",color:EMPRESA_UI.subtle,borderRadius:5,width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:650,flexShrink:0}}>{i+1}</span>
                    <select value={stop.tipo} onChange={e=>changeStop(i,"tipo",e.target.value)}
                      style={{background:EMPRESA_UI.surface,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:6,padding:"3px 6px",fontSize:11,color:tx,outline:"none"}}>
                      {STOP_TIPOS_FORM.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:3}}>
                    <button onClick={()=>moveStop(i,-1)} disabled={i===0}
                      style={{background:i===0?"transparent":"#e2e8f0",border:"none",borderRadius:4,width:20,height:20,color:i===0?"#cbd5e1":EMPRESA_UI.subtle,cursor:i===0?"default":"pointer",fontSize:11}}>↑</button>
                    <button onClick={()=>moveStop(i,1)} disabled={i===stops.length-1}
                      style={{background:i===stops.length-1?"transparent":"#e2e8f0",border:"none",borderRadius:4,width:20,height:20,color:i===stops.length-1?"#cbd5e1":EMPRESA_UI.subtle,cursor:i===stops.length-1?"default":"pointer",fontSize:11}}>↓</button>
                    {stops.length>1&&<button onClick={()=>removeStop(i)} style={{background:"transparent",border:"none",color:"#EF4444",fontSize:14,cursor:"pointer",padding:"0 2px"}}>✕</button>}
                  </div>
                </div>
                <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Lugar</div>
                <input value={stop.nombre} onChange={e=>changeStop(i,"nombre",e.target.value)}
                  placeholder="Ciudad, muelle…" style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:5}}/>
                <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Empresa</div>
                <input value={stop.empresa||""} onChange={e=>changeStop(i,"empresa",e.target.value)}
                  placeholder="Planta, operador…" style={{...iStyle,padding:"8px 10px",fontSize:12,marginBottom:5,color:EMPRESA_UI.subtle}}/>
                <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Dirección (opcional)</div>
                <input value={stop.direccion} onChange={e=>changeStop(i,"direccion",e.target.value)}
                  placeholder="Calle, polígono…" style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:5}}/>
                <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:3}}>Detalles de carga/descarga</div>
                <input value={stop.notas||""} onChange={e=>changeStop(i,"notas",e.target.value)}
                  placeholder="Puerta, horario, referencia muelle…" style={{...iStyle,padding:"8px 10px",fontSize:13,marginBottom:0}}/>
              </div>
              {i<stops.length-1&&(
                <button onClick={()=>addStopAfter(i)}
                  style={{width:"100%",background:"transparent",border:`1px dashed ${EMPRESA_UI.borderStrong}`,borderRadius:6,padding:"3px",fontSize:10,color:EMPRESA_UI.accent,cursor:"pointer",marginBottom:4}}>
                  + insertar aquí
                </button>
              )}
            </div>
          ))}

          <button onClick={addStop}
            style={{width:"100%",background:"transparent",border:`1.5px dashed ${EMPRESA_UI.borderStrong}`,borderRadius:9,padding:"8px",fontSize:13,color:EMPRESA_UI.accent,cursor:"pointer",marginBottom:8}}>
            + Añadir parada
          </button>

          {error&&<div style={{background:EMPRESA_UI.redSoft,border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:12,color:EMPRESA_UI.red,marginBottom:8}}>{error}</div>}
        </div>

        {/* FOOTER — sticky, siempre visible */}
        <div style={{padding:"12px 16px",borderTop:`1px solid ${EMPRESA_UI.border}`,flexShrink:0,background:card}}>
          <button onClick={guardar} disabled={saving}
            style={{width:"100%",background:saving?"#cbd5e1":EMPRESA_UI.tx,color:saving?"#64748B":"white",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:650,cursor:saving?"default":"pointer"}}>
            {saving?(sinConductor?"Guardando...":"Asignando..."):(sinConductor?"Crear servicio planificado":"Asignar servicio")}
          </button>
        </div>

      </div>
    </div>
  );
}

function AsignarConductorServicioModal({servicio,conductores,onClose,onAsignado}){
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const{overlayStyle,modalStyle}=useModalLayout();
  const card=EMPRESA_UI.surface,tx=EMPRESA_UI.tx,su=EMPRESA_UI.muted;
  const lista=(conductores||[]).filter(c=>c.user_id);

  async function elegir(c){
    if(!servicio?.id||!c?.user_id||saving)return;
    setSaving(true);setError("");
    try{
      const assignResult=await asignarConductorEnServicioCreado({
        servicioId:servicio.id,
        servicio,
        conductorId:c.user_id,
        conductorNombre:c.nombre||"Conductor",
        origen:servicio.origen,
        destino:servicio.destino,
        fechaInicio:servicio.fecha_inicio,
      });
      void sendAssignmentPush({
        conductorId:c.user_id,
        origen:servicio.origen,
        destino:servicio.destino,
        fechaInicio:servicio.fecha_inicio,
        servicioId:servicio.id,
      });
      onAsignado?.({
        servicioId:servicio.id,
        conductorId:c.user_id,
        conductorNombre:c.nombre||"Conductor",
        referencia:assignResult.referencia,
      });
    }catch(e){setError(e?.message||"No se pudo asignar");}
    finally{setSaving(false);}
  }

  return(
    <div style={overlayStyle} onClick={onClose}>
      <div style={{...modalStyle,background:card,maxHeight:"75vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${EMPRESA_UI.border}`}}>
          <div style={{fontSize:15,fontWeight:650,color:tx}}>Asignar conductor</div>
          <div style={{fontSize:12,color:su,marginTop:4}}>
            {getServiceNumber(servicio)} · {getFixedServiceRoute(servicio)}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
          {!lista.length?(
            <div style={{fontSize:13,color:su,lineHeight:1.45}}>Añade un conductor en la pestaña Conductores para poder asignarlo.</div>
          ):lista.map(c=>(
            <button key={c.user_id} type="button" disabled={saving} onClick={()=>elegir(c)}
              style={{width:"100%",textAlign:"left",background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,padding:"12px 14px",fontSize:14,fontWeight:700,color:tx,cursor:saving?"default":"pointer",marginBottom:8}}>
              {c.nombre||"Conductor"}{c.matricula&&<span style={{color:su,fontWeight:500,marginLeft:8}}>· {c.matricula}</span>}
            </button>
          ))}
          {error&&<div style={{background:EMPRESA_UI.redSoft,border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:12,color:EMPRESA_UI.red}}>{error}</div>}
        </div>
        <div style={{padding:"12px 16px",borderTop:`1px solid ${EMPRESA_UI.border}`}}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{width:"100%",background:"transparent",border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,padding:"11px",fontSize:13,color:su,cursor:"pointer"}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function incidenciasCountServicio(servicioId,_flotaStops,_flotaEvs,incResumenMap={}){
  return Number(incResumenMap?.[servicioId]?.total_incidencias||0);
}

function evidenciasForServicioStops(servicioId,flotaStops,flotaEvs){
  const stops=flotaStops[servicioId]||[];
  const o={};
  for(const st of stops){
    if(flotaEvs[st.id]) o[st.id]=flotaEvs[st.id];
  }
  return o;
}

function fmtClockMs(ms){
  if(ms==null||!Number.isFinite(ms))return "—";
  return new Date(ms).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}

/** Ciudad aproximada (sin coordenadas); vacío → — */
function fmtUbicacionConductorEmpresa(raw){
  if(!raw)return"Sin ubicación registrada";
  if(typeof raw==="string"){
    const text=raw.trim();
    return text||"Sin ubicación registrada";
  }
  const label=String(raw?.label||"").trim();
  if(label)return label;
  const lat=Number(raw?.lat),lon=Number(raw?.lon);
  if(Number.isFinite(lat)&&Number.isFinite(lon))return`${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  return"Sin ubicación registrada";
}

function fmtUbicacionActualizada(raw){
  if(!raw)return"● Sin actualización reciente";
  return raw?.recent===false?"● Sin actualización reciente":"● Ubicación reciente";
}

function validUbicacionRow(row){
  const lat=Number(row?.lat),lon=Number(row?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  if(Math.abs(lat)>90||Math.abs(lon)>180)return null;
  return{
    lat,lon,ts:row?.ts||null,velocidad:row?.velocidad,precision_m:row?.precision_m,
    empresa_id:row?.empresa_id??null,servicio_id:row?.servicio_id??null,event_type:row?.event_type??null,
  };
}

const TRACKING_RECENT_MAX_AGE_MS=45*60*1000;

function isRecentTrackingPoint(pos,maxAgeMs=TRACKING_RECENT_MAX_AGE_MS){
  const t=pos?.ts?new Date(pos.ts).getTime():NaN;
  if(!Number.isFinite(t))return true;
  return Date.now()-t<=maxAgeMs;
}

function safeUbicacionLabel(label){
  const clean=String(label||"").trim();
  if(!clean||looksLikeLatLonName(clean))return"Ubicación GPS";
  return clean;
}

async function revGeoUbicacionLabel(lat,lon){
  try{
    return safeUbicacionLabel(await revGeo(lat,lon));
  }catch(_){
    return"Ubicación GPS";
  }
}

function conductorJourneyInfo(conductor,now=new Date()){
  const entries=[...(conductor?.entries||[])]
    .filter(e=>!e.deleted&&!e.corrected_by)
    .sort((a,b)=>+toDate(a.ts)-+toDate(b.ts));
  const state=jornadaState(entries);
  if(state!=="open")return{open:false,label:"⚪ Fuera de jornada",color:"#94A3B8"};
  const active=findActive(entries.filter(e=>sameDay(e.ts,now)));
  if(active?.type==="inicio_conduccion")return{open:true,label:"🟢 Conduciendo",color:"#22C55E",active};
  if(active?.type==="inicio_pausa")return{open:true,label:"🟠 Pausa",color:"#F97316",active};
  if(active?.type==="inicio_descanso"||active?.type==="inicio_descanso_frac")return{open:true,label:"🟠 Descanso",color:"#F97316",active};
  return{open:true,label:"🟢 Jornada activa",color:"#22C55E",active};
}

function hasOperationalDestinationConfirmed(service){
  const plan=getOperationalPlanSnapshot(service);
  const confirmedAt=getOperationalPlanConfirmedAt(service);
  const destinationOk=String(service?.destino||"").trim().length>0;
  const planReady=plan?.status==="ok"&&plan?.route_plan_status==="ready"&&!!plan?.planned_eta;
  return destinationOk&&!!confirmedAt&&planReady;
}

/** Viaje con ETA operacional ya persistida (pantalla flota alineada con conductor). */
function hasPersistedOperationalEta(service){
  return !!getOperationalEtaSnapshot(service)?.eta;
}

/**
 * Listo para mostrar / usar ETA operacional en flotas que aún dependen del plan confirmado (no usado en UI empresa snapshot-only).
 */
function isEtaActivationReady(service){
  if(!getOperationalTripStartedAt(service))return false;
  if(!String(service?.destino||"").trim())return false;
  if(hasOperationalDestinationConfirmed(service))return true;
  return hasPersistedOperationalEta(service);
}

function nextPendingStop(stops){
  return [...(stops||[])].sort((a,b)=>(a.orden??0)-(b.orden??0)).find(s=>s.estado==="pendiente")||null;
}

function stopTipoCompacto(stop){
  return String(stop?.tipo||"parada").replace(/_/g," ").toUpperCase();
}

function etaSlotFromOperationalEta(eta){
  if(!eta?.eta)return null;
  const rm=Number(eta.remaining_mins);
  const rk=Number(eta.remaining_km);
  const ua=eta.updated_at||eta.calculated_at||null;
  return{
    eta:eta.eta,
    label:fmtOperationalEtaLabel(eta.eta)||(!isRelativeEtaLabel(eta.label)?eta.label:null)||"Sin ETA",
    confidence:eta.confidence||"medium",
    status:eta.status||"ok",
    source:eta.source||"driver_event",
    delta_min:Number.isFinite(Number(eta.delta_min))?Number(eta.delta_min):null,
    calculated_at:eta.calculated_at||null,
    updated_at:ua,
    location_ts:eta.location_ts||null,
    remaining_mins:Number.isFinite(rm)?Math.max(0,Math.round(rm)):null,
    remaining_km:Number.isFinite(rk)?Math.round(rk*10)/10:null,
  };
}

const EMPRESA_UI=Object.freeze({
  bg:"#f1f5f9",
  surface:"#ffffff",
  surfaceSoft:"#f8fafc",
  border:"#dbe4ee",
  borderStrong:"#cbd5e1",
  tx:"#0f172a",
  muted:"#64748B",
  subtle:"#475569",
  accent:"#2563eb",
  accentSoft:"#eff6ff",
  green:"#15803d",
  greenSoft:"#dcfce7",
  btnPrimary:"#16a34a",
  btnPrimaryHover:"#15803d",
  btnPrimaryBorder:"#86efac",
  amber:"#b45309",
  amberSoft:"#ffedd5",
  red:"#b91c1c",
  redSoft:"#fee2e2",
  shadow:"0 1px 2px rgba(15,23,42,.05)",
});

function empresaTone(color){
  const c=String(color||"").toLowerCase();
  if(c.includes("ef4444")||c.includes("f97316")||c.includes("fb923c"))return{fg:EMPRESA_UI.red,bg:EMPRESA_UI.redSoft,border:"#fecaca"};
  if(c.includes("f59e0b")||c.includes("facc15"))return{fg:EMPRESA_UI.amber,bg:EMPRESA_UI.amberSoft,border:"#fed7aa"};
  if(c.includes("22c55e"))return{fg:EMPRESA_UI.green,bg:EMPRESA_UI.greenSoft,border:"#bbf7d0"};
  return{fg:EMPRESA_UI.subtle,bg:"#eef2f7",border:EMPRESA_UI.border};
}

function statusPill(label,color){
  const tone=empresaTone(color);
  return{
    label,
    color:tone.fg,
    bg:tone.bg,
    border:tone.border,
  };
}

/** Chip lateral lista empresa: estados alineados con `resolveEtaVisual`. */
function empresaListaEtaChip(servicio, nowMs){
  const st=getOperationalEtaUiState(servicio,new Date(nowMs??Date.now()));
  if(st.kind==="cancelled")return{label:"—",color:"#64748B"};
  if(st.kind==="inicial_only")return{label:ETA_LABEL_INICIAL,color:EMPRESA_UI.accent};
  if(st.kind==="calculating")return{label:OPERATIONAL_ETA_CALCULATING,color:"#64748B"};
  if(st.kind==="plan_fallback")return{label:"Planificado",color:EMPRESA_UI.accent};
  return{label:"ETA actual",color:EMPRESA_UI.green};
}

function EmpresaPanel({prof,dark,onRoleChange,initialTab=null,onAsignar=null}){
  const[modo,setModo]=useState(null);
  const[empresa,setEmpresa]=useState(null);
  const[conductores,setConductores]=useState([]);
  const[loading,setLoading]=useState(true);
  const[toast,setToast]=useState("");
  const[flotaTab,setFlotaTab]=useState(initialTab||"conductores"); // conductores | servicios | documentos (+ planificador por acceso principal)
  useEffect(()=>{if(initialTab)setFlotaTab(initialTab);},[initialTab]);
  const[asignarModal,setAsignarModal]=useState(null);
  const[asignarConductorServicio,setAsignarConductorServicio]=useState(null);
  const[editarServicioModal,setEditarServicioModal]=useState(null);
  const[addOpen,setAddOpen]=useState(false);
  const[addLoading,setAddLoading]=useState(false);
  const[addForm,setAddForm]=useState({nombre:"",matricula:"",email:""});
  // Filtros documentos
  const[filtConductor,setFiltConductor]=useState("");
  const[filtFecha,setFiltFecha]=useState("");
  const[filtRef,setFiltRef]=useState("");
  const[filtCliente,setFiltCliente]=useState("");
  const[filtMatricula,setFiltMatricula]=useState("");
  const[filtEstado,setFiltEstado]=useState("");
  const[filtIncidencias,setFiltIncidencias]=useState("");
  const[docsSearch,setDocsSearch]=useState("");
  const[docsArchiveView,setDocsArchiveView]=useState("activos");
  const[docsPage,setDocsPage]=useState(1);
  const[archivedExpedienteIds,setArchivedExpedienteIds]=useState(()=>new Set());
  // Servicios de la flota
  const[flotaServicios,setFlotaServicios]=useState([]);
  const[flotaStops,setFlotaStops]=useState({});
  const[flotaEvs,setFlotaEvs]=useState({});
  const[flotaIncidenciasResumen,setFlotaIncidenciasResumen]=useState({});
  const[flotaExtraDocs,setFlotaExtraDocs]=useState({});
  const[flotaLoading,setFlotaLoading]=useState(false);
  const[flotaBootstrapped,setFlotaBootstrapped]=useState(false);
  const[flotaManualRefreshAt,setFlotaManualRefreshAt]=useState(null);
  const flotaServiciosRef=useRef([]);
  flotaServiciosRef.current=flotaServicios;
  const flotaStopsRef=useRef({});
  flotaStopsRef.current=flotaStops;
  const flotaEvsRef=useRef({});
  flotaEvsRef.current=flotaEvs;
  const flotaExtraDocsRef=useRef({});
  flotaExtraDocsRef.current=flotaExtraDocs;
  const flotaExtraDocsLoadedRef=useRef(false);
  const flotaExtraDocsServicioLoadedRef=useRef(new Set());
  const flotaConductorUidsRef=useRef(null);
  const flotaLightBusyRef=useRef(false);
  const flotaEvsLoadedServiciosRef=useRef(new Set());
  const flotaStopsFetchedIdsRef=useRef(new Set());

  useEffect(() => {
    function onEvidenciaSaved(e) {
      const { ev, stopId } = e.detail || {};
      if (!ev?.id || !stopId) return;
      setFlotaEvs((prev) => mergeEvidenciaIntoByStop(prev, stopId, ev));
    }
    async function onIncidenciaSaved(e){
      const servicioId=e?.detail?.servicioId||null;
      if(!empresa?.id)return;
      const rows=await fetchIncidenciasResumenByEmpresa(empresa.id);
      const next={};
      for(const row of rows){
        if(row?.servicio_id)next[row.servicio_id]=row;
      }
      setFlotaIncidenciasResumen(next);
      if(servicioId){
        setFlotaServicios(prev=>prev.map((sv)=>sv.id===servicioId?{
          ...sv,
          incidencias_total:Number(next?.[servicioId]?.total_incidencias||0),
          incidencias_fotos_total:Number(next?.[servicioId]?.total_fotos||0),
        }:sv));
      }
    }
    window.addEventListener(EVIDENCIA_SAVED_EVENT, onEvidenciaSaved);
    window.addEventListener(INCIDENCIA_SAVED_EVENT, onIncidenciaSaved);
    return () => {
      window.removeEventListener(EVIDENCIA_SAVED_EVENT, onEvidenciaSaved);
      window.removeEventListener(INCIDENCIA_SAVED_EVENT, onIncidenciaSaved);
    };
  }, [empresa?.id]);

  // Documentos de la flota
  const[docsLoading,setDocsLoading]=useState(false);
  const[visorEv,setVisorEv]=useState(null);
  const[expedientePreview,setExpedientePreview]=useState(null);
  const[mailExpediente,setMailExpediente]=useState(null);
  const[svCardExpand,setSvCardExpand]=useState(null);
  const svCardExpandRef=useRef(null);
  svCardExpandRef.current=svCardExpand;
  const[pickConductorViaje,setPickConductorViaje]=useState(false);
  const[anularModal,setAnularModal]=useState(null);
  const[serviciosVistaTab,setServiciosVistaTab]=useState("todos"); // todos | en_curso | asignados | completados | …
  useEffect(()=>{
    if(serviciosVistaTab==="activos"||serviciosVistaTab==="incidencias")setServiciosVistaTab("todos");
  },[serviciosVistaTab]);
  const[serviciosBusqueda,setServiciosBusqueda]=useState("");
  const[serviciosPage,setServiciosPage]=useState(1);
  const[etaOperativaById,setEtaOperativaById]=useState({});
  const[ubicacionConductorByUid,setUbicacionConductorByUid]=useState({});
  const[ubicacionRefreshByUid,setUbicacionRefreshByUid]=useState({});
  const ubicacionConductorByUidRef=useRef({});
  ubicacionConductorByUidRef.current=ubicacionConductorByUid;
  const[empresaEtaVisualNowMs,setEmpresaEtaVisualNowMs]=useState(()=>Date.now());
  const[inviteEquipoOpen,setInviteEquipoOpen]=useState(false);
  const flotaLoadingRef=useRef(false);
  const ubicacionLabelCacheRef=useRef(new Map());
  const ubicacionLastSeenRef=useRef(new Map());

  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),3000);};
  const bg=EMPRESA_UI.bg,card=EMPRESA_UI.surface,tx=EMPRESA_UI.tx,su=EMPRESA_UI.muted;

  async function descargarExpediente(expediente){
    try{
      showToast("Preparando expediente visual...");
      await downloadServiceExpedientePdf(expediente);
      showToast("PDF descargado");
    }catch(e){
      console.warn("download expediente:",e);
      showToast("No se pudo descargar el expediente");
    }
  }

  async function archivarMetadataExpediente(expediente){
    const sv=flotaServicios.find(s=>s.id===expediente?.id);
    const archivedAt=new Date().toISOString();
    const archiveMeta={
      at:archivedAt,
      by:getUserId()||null,
      status:"archived",
      retained:["pdf_final","timeline","resumen_operacional","integridad","metadata_ligera"],
      cleanup:["fotos_originales_pesadas","adjuntos_temporales","ocr_temporal","caches"],
    };
    if(sv?.id){
      const referencia=mergeReferenciaOperacional(sv.referencia||"",{archive:archiveMeta,archived_at:archivedAt});
      try{
        const res=await sbFetch(`/rest/v1/servicios?id=eq.${sv.id}`,{method:"PATCH",body:JSON.stringify({referencia})});
        if(!res.ok)throw new Error(`Supabase ${res.status}`);
        setFlotaServicios(prev=>prev.map(row=>row.id===sv.id?{...row,referencia}:row));
      }catch(e){
        console.warn("archive expediente:",e);
        showToast("No se pudo archivar el expediente");
        return;
      }
    }
    setArchivedExpedienteIds(prev=>{
      const next=new Set(prev);
      if(expediente?.id)next.add(expediente.id);
      try{localStorage.setItem(`cuaderno_archived_expedientes_${empresa?.id||"local"}`,JSON.stringify([...next]));}catch(_){}
      return next;
    });
    setExpedientePreview(null);
    showToast("Expediente archivado");
  }

  function abrirAnularServicio(sv){
    if(!sv?.id||sv.estado==="anulado")return;
    setAnularModal({servicio:sv,motivo:"",loading:false,error:""});
  }

  async function confirmarAnulacionServicio(){
    const sv=anularModal?.servicio;
    if(!sv?.id||anularModal?.loading)return;
    const at=new Date().toISOString();
    const by=getUserId()||"empresa";
    const byLabel=prof?.nombre||empresa?.nombre||"tráfico";
    const reason=(anularModal?.motivo||"").trim();
    const referencia=mergeReferenciaOperacional(sv.referencia||"",{
      cancellation:{at,by,by_label:byLabel,reason:reason||null},
      service_cancelled_at:at,
    });
    const patchBase={
      estado:"anulado",
      referencia,
      motivo_anulacion:reason||null,
      fecha_anulacion:at,
    };
    async function patchServicio(body){
      const res=await sbFetch(`/rest/v1/servicios?id=eq.${sv.id}`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify(body)});
      if(res.ok)return res;
      let detail="";
      try{detail=await res.text();}catch(_){}
      const err=new Error(detail||`Supabase ${res.status}`);
      err.status=res.status;
      err.detail=detail;
      throw err;
    }
    try{
      setAnularModal(prev=>prev?{...prev,loading:true,error:""}:prev);
      try{
        await patchServicio(patchBase);
      }catch(e){
        const detail=String(e.detail||e.message||"");
        const schemaProblem=/motivo_anulacion|fecha_anulacion|column|schema|PGRST/i.test(detail);
        const estadoProblem=/estado|anulado|constraint|invalid input value|violates|check/i.test(detail);
        if(schemaProblem){
          try{await patchServicio({estado:"anulado",referencia});}
          catch(e2){
            const detail2=String(e2.detail||e2.message||"");
            if(/estado|anulado|constraint|invalid input value|violates|check/i.test(detail2))await patchServicio({estado:"cancelado",referencia});
            else throw e2;
          }
        }else if(estadoProblem){
          await patchServicio({estado:"cancelado",referencia});
        }else throw e;
      }
      const updatedRow={...sv,estado:"anulado",referencia,motivo_anulacion:reason||null,fecha_anulacion:at};
      setFlotaServicios(prev=>prev.map(row=>row.id===sv.id?{...row,...updatedRow}:row));
      setEtaOperativaById(prev=>{const next={...prev};delete next[sv.id];return next;});
      setSvCardExpand(null);
      setAnularModal(null);
      await loadFlotaRef.current?.(true);
      showToast("Servicio anulado");
    }catch(e){
      console.warn("anular servicio:",e);
      const msg=String(e.detail||e.message||"").slice(0,220)||"No se pudo anular el servicio";
      setAnularModal(prev=>prev?{...prev,loading:false,error:msg}:prev);
      showToast("No se pudo anular el servicio");
    }
  }

  function servicioAnuladoDesdeMeta(sv){
    const meta=getServicioOperacionMeta(sv);
    return sv?.estado==="anulado"||!!meta?.cancellation||!!meta?.service_cancelled_at||!!sv?.fecha_anulacion;
  }

  function normalizarServicioEmpresa(sv){
    if(!servicioAnuladoDesdeMeta(sv))return sv;
    const meta=getServicioOperacionMeta(sv);
    return{
      ...sv,
      estado:"anulado",
      motivo_anulacion:sv?.motivo_anulacion??meta?.cancellation?.reason??null,
      fecha_anulacion:sv?.fecha_anulacion??meta?.cancellation?.at??meta?.service_cancelled_at??null,
    };
  }

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(`cuaderno_archived_expedientes_${empresa?.id||"local"}`);
      setArchivedExpedienteIds(new Set(raw?JSON.parse(raw):[]));
    }catch(_){setArchivedExpedienteIds(new Set());}
  },[empresa?.id]);

  useEffect(()=>{
    const dbArchived=flotaServicios
      .filter(sv=>{
        const meta=getServicioOperacionMeta(sv);
        return meta?.archive?.status==="archived"||!!meta?.archived_at;
      })
      .map(sv=>sv.id)
      .filter(Boolean);
    if(!dbArchived.length)return;
    setArchivedExpedienteIds(prev=>{
      const next=new Set(prev);
      dbArchived.forEach(id=>next.add(id));
      return next;
    });
  },[flotaServicios]);

  useEffect(()=>{
    const raw=localStorage.getItem("cuaderno_docs_filters_v1");
    if(!raw)return;
    try{
      const f=JSON.parse(raw);
      setFiltConductor(f.filtConductor||"");
      setFiltFecha(f.filtFecha||"");
      setFiltRef(f.filtRef||"");
      setFiltCliente(f.filtCliente||"");
      setFiltMatricula(f.filtMatricula||"");
      setFiltEstado(f.filtEstado||"");
      setFiltIncidencias(f.filtIncidencias||"");
      setDocsSearch(f.docsSearch||"");
      setDocsArchiveView(f.docsArchiveView||"activos");
    }catch(_){}
  },[]);

  useEffect(()=>{
    try{
      localStorage.setItem("cuaderno_docs_filters_v1",JSON.stringify({filtConductor,filtFecha,filtRef,filtCliente,filtMatricula,filtEstado,filtIncidencias,docsSearch,docsArchiveView}));
    }catch(_){}
    setDocsPage(1);
  },[filtConductor,filtFecha,filtRef,filtCliente,filtMatricula,filtEstado,filtIncidencias,docsSearch,docsArchiveView]);

  useEffect(()=>{init();},[]);

  async function init(){
    setLoading(true);
    const uid=getUserId();
    if(!uid){setLoading(false);return;}
    try{
      const perfilesSelf=await sbSelect("profiles",`id=eq.${uid}`);
      if(perfilesSelf[0]?.is_archived){
        await sbSignOut();
        window.location.reload();
        return;
      }
      const isEmpresaAccount=perfilesSelf[0]?.tipo_cuenta===ACCOUNT_TYPES.EMPRESA;
      const emps=isEmpresaAccount?await sbSelect("empresas",`owner_id=eq.${uid}`):[];
      if(emps.length&&isEmpresaAccount){
        setEmpresa(emps[0]);setModo("jefe");
        onRoleChange?.("jefe");
        await loadConductores(emps[0].id);
        return;
      }
      const relsAll=await sbSelect("conductor_empresa",`user_id=eq.${uid}&activo=eq.true`);
      if(isEmpresaAccount){
        setModo("crear_empresa");
        setLoading(false);
        return;
      }
      if(relsAll.length){setModo("conductor");onRoleChange?.("conductor");setLoading(false);return;}
      setModo(null);
    }catch(_){}
    setLoading(false);
  }

  async function loadConductores(empId){
    try{
      const rels=await sbSelect("conductor_empresa",`empresa_id=eq.${empId}&activo=eq.true`);
      const conds=await Promise.all(rels.map(async r=>{
        if(!r.user_id)return{...r,norma:null,entries:[],pendiente:true};
        try{
          const perfil=await sbSelect("profiles",`id=eq.${r.user_id}`);
          if(perfil[0]?.is_archived)return null;
          const nombreReal=perfil[0]?.nombre||r.nombre||"Conductor";
          const matriculaReal=perfil[0]?.matricula||r.matricula||"";
          const entries=await sbSelect("entries",`user_id=eq.${r.user_id}&order=ts.asc&limit=2000`);
          const ents=entries.map(e=>({...e,ts:new Date(e.ts)}));
          const normaC=calcNorma(ents,new Date(),false);
          return{...r,nombre:nombreReal,matricula:matriculaReal,norma:normaC,entries:ents};
        }catch(_){return{...r,norma:null,entries:[]};}
      }));
      setConductores(conds.filter(Boolean));
    }catch(_){}
    setLoading(false);
  }

  const loadConductoresRef=useRef(loadConductores);
  loadConductoresRef.current=loadConductores;
  const conductoresFlotaRef=useRef(conductores);
  conductoresFlotaRef.current=conductores;

  async function resolveFlotaConductorUids(){
    const fromConductores=conductoresFlotaRef.current.map(c=>c.user_id).filter(Boolean);
    if(fromConductores.length)return fromConductores;
    if(flotaConductorUidsRef.current?.length)return flotaConductorUidsRef.current;
    const rels=await sbSelect("conductor_empresa",`empresa_id=eq.${empresa.id}&activo=eq.true`);
    const uids=rels.filter(r=>r.user_id).map(r=>r.user_id);
    flotaConductorUidsRef.current=uids;
    return uids;
  }

  async function fetchFlotaStopsMapForServicioIds(ids){
    if(!ids?.length)return{};
    const stps=await sbFetch(`/rest/v1/stops?servicio_id=in.(${ids.join(",")})&order=servicio_id.asc,orden.asc`).then(r=>r.json());
    console.log("[OP3] fetchFlotaStopsMapForServicioIds",{
      requestedIds:ids,
      rows:Array.isArray(stps)?stps.length:null,
      servicioIdsInRows:Array.isArray(stps)?[...new Set(stps.map(s=>s?.servicio_id).filter(Boolean))]:[],
      sample:Array.isArray(stps)?stps.slice(0,8).map(s=>({
        id:s?.id,
        servicio_id:s?.servicio_id,
        estado:s?.estado,
        orden:s?.orden,
      })) : [],
    });
    return stopsRowsToMap(stps);
  }

  async function ensureFlotaStopsForServicioIds(ids){
    if(!ids?.length)return;
    const missing=ids.filter((id)=>!flotaStopsFetchedIdsRef.current.has(id));
    if(!missing.length)return;
    try{
      console.log("[TL2] ensure stops request",{ids,missing});
      const map=await fetchFlotaStopsMapForServicioIds(missing);
      console.log("[TL2] ensure stops response",{
        servicios:Object.keys(map||{}),
        counts:Object.fromEntries(Object.entries(map||{}).map(([k,v])=>[k,Array.isArray(v)?v.length:0])),
      });
      missing.forEach((id)=>flotaStopsFetchedIdsRef.current.add(id));
      setFlotaStops((prev)=>{
        const next=mergeFlotaStopsMap(prev,map);
        console.log("[TL2] ensure stops merged",{
          servicios:Object.keys(next||{}).length,
          changed:next!==prev,
          targetIds:missing,
        });
        flotaStopsRef.current=next;
        return next;
      });
    }catch(e){console.warn("ensureFlotaStopsForServicioIds:",e);}
  }

  async function ensureFlotaEvidenciasForServicio(servicioId,{force=false}={}){
    if(!servicioId)return;
    if(!force&&flotaEvsLoadedServiciosRef.current.has(servicioId))return;
    const stops=flotaStopsRef.current[servicioId]||[];
    const stopIds=stops.map(s=>s.id).filter(Boolean);
    if(!stopIds.length)return;
    try{
      const grouped=await fetchEvidenciasGroupedByStop(stopIds,sbFetch);
      const merged=mergeFlotaEvsMap(flotaEvsRef.current,grouped);
      flotaEvsRef.current=merged;
      setFlotaEvs(merged);
      flotaEvsLoadedServiciosRef.current.add(servicioId);
      return grouped;
    }catch(e){console.warn("ensureFlotaEvidenciasForServicio",servicioId,e);}
    return null;
  }

  async function ensureFlotaEvidenciasForDocumentos(){
    const stopIds=Object.values(flotaStopsRef.current).flat().map(s=>s?.id).filter(Boolean);
    if(!stopIds.length)return;
    try{
      const grouped=await fetchEvidenciasGroupedByStop(stopIds,sbFetch);
      const merged=mergeFlotaEvsMap(flotaEvsRef.current,grouped);
      flotaEvsRef.current=merged;
      setFlotaEvs(merged);
      flotaServiciosRef.current.forEach(s=>{if(s?.id)flotaEvsLoadedServiciosRef.current.add(s.id);});
    }catch(e){console.warn("ensureFlotaEvidenciasForDocumentos:",e);}
  }

  async function ensureFlotaExtraDocsForDocumentos({force=false}={}){
    if(!empresa?.id)return;
    if(!force&&flotaExtraDocsLoadedRef.current)return;
    try{
      const servicioIds=flotaServiciosRef.current.map(s=>s.id).filter(Boolean);
      const rows=await fetchEmpresaDocumentosExtra(empresa.id,{servicioIds});
      const grouped=groupExtraDocsByServicioId(rows);
      flotaExtraDocsRef.current=grouped;
      setFlotaExtraDocs(grouped);
      flotaExtraDocsLoadedRef.current=true;
      console.log("[DOCUMENT_EXTRA] DOCUMENT_EMPRESA_LOAD",{
        empresaId:empresa.id,
        servicios:servicioIds.length,
        filas:rows.length,
        serviciosConExtra:Object.keys(grouped).length,
      });
    }catch(e){
      console.warn("ensureFlotaExtraDocsForDocumentos:",e);
      flotaExtraDocsLoadedRef.current=false;
    }
  }

  async function ensureFlotaExtraDocsForServicio(servicioId,{force=false}={}){
    if(!servicioId)return [];
    if(!force&&flotaExtraDocsServicioLoadedRef.current.has(servicioId)){
      return flotaExtraDocsRef.current[servicioId]||[];
    }
    try{
      const rows=await fetchServicioDocumentosExtra(servicioId);
      const next={...flotaExtraDocsRef.current,[servicioId]:rows};
      flotaExtraDocsRef.current=next;
      setFlotaExtraDocs(next);
      flotaExtraDocsServicioLoadedRef.current.add(servicioId);
      console.log("[DOCUMENT_EXTRA] DOCUMENT_EMPRESA_SERVICIO",{
        servicioId,
        count:rows.length,
        ids:rows.map(r=>r.id),
      });
      return rows;
    }catch(e){
      console.warn("ensureFlotaExtraDocsForServicio",servicioId,e);
      flotaExtraDocsServicioLoadedRef.current.delete(servicioId);
      return [];
    }
  }

  async function abrirExpedientePreview(sv){
    if(!sv?.id)return;
    setDocsLoading(true);
    console.log("[DOCUMENT_EXTRA] DOCUMENT_VER_EXPEDIENTE_START",{servicioId:sv.id});
    try{
      await ensureFlotaStopsForServicioIds([sv.id]);
      await ensureFlotaEvidenciasForServicio(sv.id,{force:true});
      await ensureFlotaExtraDocsForServicio(sv.id,{force:true});
      const preview=await buildExpedienteCompleto(sv);
      if(!preview)throw new Error("sin_datos");
      const extraMerged=(preview.evidencias||[]).filter(e=>e.source==="servicio_documentos_extra");
      console.log("[DOCUMENT_EXTRA] DOCUMENT_VER_EXPEDIENTE_OK",{
        servicioId:sv.id,
        docs:preview.evidencias?.length??0,
        extraDb:flotaExtraDocsRef.current[sv.id]?.length??0,
        extraEnExpediente:extraMerged.length,
        timeline:preview.timeline?.length??0,
      });
      setExpedientePreview(preview);
    }catch(e){
      console.error("[DOCUMENT_EXTRA] DOCUMENT_VER_EXPEDIENTE_FAIL",e?.message||e);
      showToast(e?.message||"No se pudo cargar el expediente");
    }finally{
      setDocsLoading(false);
    }
  }

  const ensureFlotaEvidenciasRef=useRef(ensureFlotaEvidenciasForServicio);
  ensureFlotaEvidenciasRef.current=ensureFlotaEvidenciasForServicio;

  /** Carga inicial: servicios + paradas (sin evidencias; lazy al expandir). */
  async function loadFlotaServicios(opts=false){
    const options=typeof opts==="object"&&opts!==null?opts:{force:opts===true,silent:false};
    const{force=false,silent=false,includeEvidencias=false}=options;
    if(!empresa)return;
    if(flotaLoadingRef.current&&!force)return;
    if(!force&&!silent&&flotaLoading)return;
    flotaLoadingRef.current=true;
    if(!silent)setFlotaLoading(true);
    try{
      const uids=await resolveFlotaConductorUids();
      const svsRaw=await fetchFlotaServiciosForEmpresa(sbFetch,empresa.id,uids);
      const svsArr=(Array.isArray(svsRaw)?svsRaw:[]).map(normalizarServicioEmpresa);
      setFlotaServicios(prev=>mergeFlotaServicios(prev,svsArr));
      const enCurso=svsArr.filter(s=>s.estado==="en_curso");
      const sample=enCurso[0]||svsArr[0]||null;
      const opEta=sample?getOperationalEtaSnapshot(sample):null;
      trackingLog("empresa_panel flota_loaded",{
        empresa_id:empresa.id,
        conductores_uids:uids.length,
        servicios:svsArr.length,
        en_curso:enCurso.length,
        ref_type_sample:sample?typeof sample.referencia:"none",
        has_operational_eta:!!opEta?.eta,
        include_evidencias:includeEvidencias,
      });
      if(svsArr.length){
        const initialIds=servicioIdsForInitialStopsLoad(svsArr);
        const stopsMap=await fetchFlotaStopsMapForServicioIds(initialIds);
        initialIds.forEach((id)=>flotaStopsFetchedIdsRef.current.add(id));
        setFlotaStops(prev=>mergeFlotaStopsMap(prev,stopsMap));
        if(includeEvidencias){
          const stopIds=Object.values(stopsMap).flat().map(s=>s.id).filter(Boolean);
          if(stopIds.length){
            const evs=await sbFetch(`/rest/v1/evidencias?stop_id=in.(${stopIds.join(",")})&order=created_at.desc`).then(r=>r.json());
            setFlotaEvs(prev=>mergeFlotaEvsMap(prev,groupDocumentsByStop(evs)));
            svsArr.forEach(s=>flotaEvsLoadedServiciosRef.current.add(s.id));
          }
        }
      }else{
        setFlotaStops({});
        setFlotaEvs({});
        setFlotaExtraDocs({});
        flotaExtraDocsLoadedRef.current=false;
        flotaExtraDocsServicioLoadedRef.current=new Set();
        flotaStopsFetchedIdsRef.current=new Set();
      }
    }catch(e){console.warn("loadFlotaServicios:",e);}
    finally{
      flotaLoadingRef.current=false;
      setFlotaBootstrapped(true);
      if(!silent)setFlotaLoading(false);
    }
  }

  /** Refresco manual / poll: servicios activos, paradas operativas, ubicación; sin ETA ni evidencias. */
  async function refreshFlotaOperativaLigera({instantFeedback=false}={}){
    if(!empresa?.id||flotaLightBusyRef.current)return;
    flotaLightBusyRef.current=true;
    if(instantFeedback)setFlotaManualRefreshAt(Date.now());
    try{
      const uids=await resolveFlotaConductorUids();
      const svsMerged=await fetchFlotaServiciosForEmpresa(sbFetch,empresa.id,uids);
      const svsArr=(Array.isArray(svsMerged)?svsMerged:[]).map(normalizarServicioEmpresa);
      setFlotaServicios(prev=>mergeFlotaServicios(prev,svsArr));
      const stopIds=servicioIdsForLightStopsRefresh(svsArr,serviciosListaRef.current);
      const ubicUids=[...new Set(svsArr.filter(s=>SERVICIO_ESTADOS_ACTIVOS.includes(s.estado)).map(s=>conductorUidOperativoServicio(s)).filter(Boolean))];
      await Promise.all([
        stopIds.length?fetchFlotaStopsMapForServicioIds(stopIds).then((map)=>{
          stopIds.forEach((id)=>flotaStopsFetchedIdsRef.current.add(id));
          setFlotaStops(prev=>mergeFlotaStopsMap(prev,map));
        }):Promise.resolve(),
        ubicUids.length?refreshUbicacionConductores(ubicUids,{allowStale:true,requireOpen:false,skipRevGeo:true,silent:true}):Promise.resolve(),
      ]);
      trackingLog("empresa_panel flota_light_refresh",{empresa_id:empresa.id,servicios:svsArr.length,stops_ids:stopIds.length,ubic_uids:ubicUids.length});
    }catch(e){console.warn("refreshFlotaOperativaLigera:",e);}
    finally{flotaLightBusyRef.current=false;}
  }

  const refreshFlotaLigeraRef=useRef(refreshFlotaOperativaLigera);
  refreshFlotaLigeraRef.current=refreshFlotaOperativaLigera;

  useEffect(()=>{
    if(!empresa?.id)return;
    loadFlotaServicios({force:true});
  },[empresa?.id]);

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe")return;
    const refresh=()=>{if(document.visibilityState!=="hidden")void loadConductoresRef.current?.(empresa.id);};
    const onVisible=()=>{if(document.visibilityState==="visible")refresh();};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      window.removeEventListener("focus",refresh);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[empresa?.id,modo]);

  const loadFlotaRef=useRef(loadFlotaServicios);
  loadFlotaRef.current=loadFlotaServicios;

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe")return undefined;
    if(getEmpresaEquipoCodeStrict(empresa))return undefined;
    let n=0;
    const timer=setInterval(()=>{
      n+=1;
      if(n>12){clearInterval(timer);return;}
      sbSelect("empresas",`id=eq.${empresa.id}`).then(rows=>{
        if(rows?.length&&getEmpresaEquipoCodeStrict(rows[0]))setEmpresa(rows[0]);
      }).catch(()=>{});
    },650);
    return()=>clearInterval(timer);
  },[empresa?.id,modo,empresa?.codigo_equipo,empresa?.codigo_corto]);

  useEffect(()=>{
    if(!empresa?.id)return;
    let ubicTimer;
    const refresh=()=>{
      if(document.visibilityState==="hidden")return;
      void refreshFlotaLigeraRef.current?.({instantFeedback:false});
      clearTimeout(ubicTimer);
      ubicTimer=setTimeout(()=>{
        const uids=[...new Set(
          flotaServiciosRef.current
            .filter((s)=>SERVICIO_ESTADOS_ACTIVOS.includes(s.estado))
            .map((s)=>conductorUidOperativoServicio(s))
            .filter(Boolean),
        )];
        if(uids.length)void refreshUbicacionRef.current?.(uids,{allowStale:true,requireOpen:false,skipRevGeo:true,silent:true});
      },600);
    };
    const onVisible=()=>{if(document.visibilityState==="visible")refresh();};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      clearTimeout(ubicTimer);
      window.removeEventListener("focus",refresh);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[empresa?.id]);

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe"||!flotaServicios.length)return;
    const needsAllStops=
      flotaTab==="documentos"||
      (flotaTab==="servicios"&&["todos","completados","asignados","sin_asignar","anulados","archivados"].includes(serviciosVistaTab));
    if(!needsAllStops)return;
    const missing=flotaServicios.map((s)=>s.id).filter((id)=>id&&!flotaStopsFetchedIdsRef.current.has(id));
    if(missing.length)void ensureFlotaStopsForServicioIds(missing);
  },[empresa?.id,modo,flotaTab,serviciosVistaTab,flotaServicios.length]);

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe"||flotaTab!=="documentos"||!flotaServicios.length)return;
    let cancelled=false;
    (async()=>{
      const missing=flotaServicios.map(s=>s.id).filter(id=>id&&!flotaStopsFetchedIdsRef.current.has(id));
      if(missing.length)await ensureFlotaStopsForServicioIds(missing);
      if(cancelled)return;
      const pending=flotaServicios.some(s=>s?.id&&!flotaEvsLoadedServiciosRef.current.has(s.id));
      if(pending)await ensureFlotaEvidenciasForDocumentos();
      await ensureFlotaExtraDocsForDocumentos();
    })();
    return()=>{cancelled=true;};
  },[empresa?.id,modo,flotaTab,flotaServicios.length,flotaStops]);

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe")return;
    let cancelled=false;
    (async()=>{
      const rows=await fetchIncidenciasResumenByEmpresa(empresa.id);
      if(cancelled)return;
      const next={};
      for(const row of rows){
        if(row?.servicio_id)next[row.servicio_id]=row;
      }
      setFlotaIncidenciasResumen(next);
    })();
    return()=>{cancelled=true;};
  },[empresa?.id,modo,flotaServicios.length]);

  const flotaActivityTsById=useMemo(()=>{
    const m={};
    for(const sv of flotaServicios){
      const sa=flotaStops[sv.id]||[];
      const ea=evidenciasForServicioStops(sv.id,flotaStops,flotaEvs);
      m[sv.id]=getLastServiceActivity({service:sv,stops:sa,evidencias:ea}).ts||0;
    }
    return m;
  },[flotaServicios,flotaStops,flotaEvs]);

  const empresaVistaTabCtx=useMemo(
    ()=>({
      archivedExpedienteIds,
      flotaStops,
      flotaEvs,
      countIncidencias: (servicioId,stopsMap,evsMap)=>incidenciasCountServicio(servicioId,stopsMap,evsMap,flotaIncidenciasResumen),
    }),
    [archivedExpedienteIds,flotaStops,flotaEvs,flotaIncidenciasResumen],
  );

  const serviciosListaOperativa=useMemo(()=>{
    const list=filterServiciosForEmpresaVistaTab(
      flotaServicios.map((sv)=>({
        ...sv,
        incidencias_total:Number(flotaIncidenciasResumen?.[sv.id]?.total_incidencias||0),
        incidencias_fotos_total:Number(flotaIncidenciasResumen?.[sv.id]?.total_fotos||0),
      })),
      serviciosVistaTab,
      empresaVistaTabCtx,
    );
    const q=String(serviciosBusqueda||"").trim();
    const filtered=q
      ?list.filter((sv)=>{
          const conductor=conductores.find(c=>c.user_id===sv.conductor_id);
          return servicioMatchesSearchQuery(sv,q,{
            stops:flotaStops[sv.id]||[],
            conductor,
          });
        })
      :list;
    filtered.sort((a,b)=>(flotaActivityTsById[b.id]||0)-(flotaActivityTsById[a.id]||0));
    return filtered;
  },[flotaServicios,serviciosVistaTab,empresaVistaTabCtx,flotaActivityTsById,serviciosBusqueda,flotaStops,conductores,flotaIncidenciasResumen]);

  useEffect(()=>{setServiciosPage(1);},[serviciosVistaTab,flotaServicios.length,serviciosBusqueda]);

  const serviciosPageSize=15;
  const serviciosTotal=serviciosListaOperativa.length;
  const serviciosTotalPages=Math.max(1,Math.ceil(serviciosTotal/serviciosPageSize));
  const serviciosPageActual=Math.min(Math.max(1,serviciosPage),serviciosTotalPages);
  const serviciosFrom=(serviciosPageActual-1)*serviciosPageSize;
  const serviciosTo=Math.min(serviciosFrom+serviciosPageSize,serviciosTotal);
  const serviciosListaVisible=serviciosListaOperativa.slice(serviciosFrom,serviciosTo);
  const serviciosPages=Array.from({length:serviciosTotalPages},(_,i)=>i+1).filter(p=>serviciosTotalPages<=6||Math.abs(p-serviciosPageActual)<=2||p===1||p===serviciosTotalPages);

  const serviciosListaRef=useRef(serviciosListaOperativa);
  serviciosListaRef.current=serviciosListaOperativa;

  async function readLatestConductorLocation(uid,{allowStale=true,skipRevGeo=false}={}){
    if(!uid)return null;
    const empCtx={empresa_id:empresa?.id||null};
    const r=await sbFetch(`/rest/v1/ubicaciones?user_id=eq.${uid}&order=ts.desc&limit=1`);
    if(!r.ok){
      let detail="";
      try{detail=await r.text();}catch(_){}
      throw new Error(detail||`Supabase ${r.status}`);
    }
    const j=await r.json();
    const pos=validUbicacionRow(Array.isArray(j)?j[0]:null);
    if(!pos){
      trackingLog("latest location missing",{uid,...empCtx});
      return null;
    }
    if(!allowStale&&!isRecentTrackingPoint(pos)){
      trackingLog("latest location stale filtered",{uid,ts:pos.ts,...empCtx});
      return null;
    }
    const tsMs=pos?.ts?new Date(pos.ts).getTime():NaN;
    const ageMin=Number.isFinite(tsMs)?Math.round((Date.now()-tsMs)/60000):null;
    trackingLog("latest location read",{uid,ts:pos.ts||null,age_min:ageMin,allowStale,...empCtx});
    const prev=ubicacionLastSeenRef.current.get(uid)||null;
    const nowKey=`${pos.ts||"null"}|${Number(pos.lat).toFixed(6)}|${Number(pos.lon).toFixed(6)}`;
    if(!prev||prev!==nowKey)trackingLog("latest location changed",{uid,prev:prev||null,current:nowKey,...empCtx});
    else trackingLog("latest location reused",{uid,current:nowKey,...empCtx});
    ubicacionLastSeenRef.current.set(uid,nowKey);
    const key=`${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}`;
    let label=ubicacionLabelCacheRef.current.get(key);
    if(!label&&skipRevGeo){
      label=ubicacionConductorByUidRef.current[uid]?.label||null;
    }
    if(!label&&!skipRevGeo){
      label=await revGeoUbicacionLabel(pos.lat,pos.lon);
      ubicacionLabelCacheRef.current.set(key,label);
    }
    if(!label){
      label=`${Number(pos.lat).toFixed(4)}, ${Number(pos.lon).toFixed(4)}`;
    }
    return{
      ...pos,
      label,
      updatedAt:pos.ts,
      recent:isRecentTrackingPoint(pos),
    };
  }

  async function refreshUbicacionConductores(uids=null,{allowStale=true,requireOpen=true,skipRevGeo=false,silent=false}={}){
    const target=[...new Set((uids||conductores.map(c=>c.user_id)).filter(Boolean))];
    if(!target.length){
      trackingLog("empresa_panel ubicacion_refresh_skip",{empresa_id:empresa?.id||null,reason:"no_target",requireOpen});
      return;
    }
    trackingLog("empresa_panel ubicacion_refresh_start",{
      empresa_id:empresa?.id||null,
      target_count:target.length,
      requireOpen,
      allowStale,
      uids_filter:!!uids,
    });
    const locs={};
    await Promise.all(target.map(async uid=>{
      const cond=conductores.find(c=>c.user_id===uid);
      if(requireOpen&&!conductorJourneyInfo(cond).open)return;
      try{
        const loc=await readLatestConductorLocation(uid,{allowStale,skipRevGeo});
        locs[uid]=loc||{label:"Sin ubicación registrada",updatedAt:null,missing:true,recent:false};
      }catch(e){
        console.warn("readLatestConductorLocation",uid,e);
        trackingLog("empresa_panel ubicacion_read_failed",{empresa_id:empresa?.id||null,uid,error:String(e?.message||e)});
        locs[uid]={label:"Sin lectura de ubicación",updatedAt:null,missing:true,recent:false,fetchError:true};
      }
    }));
    const vals=Object.values(locs);
    trackingLog("empresa_panel ubicacion_batch_done",{
      empresa_id:empresa?.id||null,
      uids:Object.keys(locs).length,
      have_coords:vals.filter(v=>v&&!v.missing&&!v.fetchError).length,
      missing:vals.filter(v=>v?.missing&&!v.fetchError).length,
      fetch_errors:vals.filter(v=>v?.fetchError).length,
    });
    setUbicacionConductorByUid(prev=>{
      const patch={};
      let next=prev;
      let deleted=false;
      target.forEach(uid=>{
        const cond=conductores.find(c=>c.user_id===uid);
        if(requireOpen&&!conductorJourneyInfo(cond).open){
          if(next[uid]){next={...next};delete next[uid];deleted=true;}
        }else if(locs[uid])patch[uid]=locs[uid];
      });
      if(Object.keys(patch).length)next=patchUbicacionMap(next,patch);
      if(!deleted&&!Object.keys(patch).length)return prev;
      return next;
    });
  }

  const refreshUbicacionRef=useRef(refreshUbicacionConductores);
  refreshUbicacionRef.current=refreshUbicacionConductores;

  useEffect(()=>{
    if(!empresa?.id)return;
    async function onRecargaServicio(){
      for(let w=0;w<12;w++){
        if(!flotaLoadingRef.current)break;
        await new Promise(r=>setTimeout(r,80));
      }
      try{
        await refreshFlotaLigeraRef.current?.({instantFeedback:false});
      }catch(e){
        console.warn("empresa_panel recarga_servicio loadFlota",e);
        trackingLog("empresa_panel recarga_servicio_flota_err",{empresa_id:empresa.id,error:String(e?.message||e)});
      }
      const conds=conductoresFlotaRef.current||[];
      const uids=[...new Set([
        ...conds.map(c=>c.user_id),
        ...serviciosListaRef.current.filter(s=>s.estado!=="anulado").map(s=>s.conductor_id),
      ].filter(Boolean))];
      trackingLog("empresa_panel recarga_servicio",{empresa_id:empresa.id,uid_count:uids.length});
      try{
        await refreshUbicacionRef.current?.(uids.length?uids:null,{allowStale:true,requireOpen:false});
      }catch(e){
        console.warn("empresa_panel recarga_servicio ubicaciones",e);
        trackingLog("empresa_panel recarga_servicio_ubi_err",{empresa_id:empresa.id,error:String(e?.message||e)});
      }
    }
    window.addEventListener("cuaderno-recargar-servicio",onRecargaServicio);
    return()=>window.removeEventListener("cuaderno-recargar-servicio",onRecargaServicio);
  },[empresa?.id]);

  async function actualizarConductorUbicacion(uid,{allowStale=true,requireOpen=false,showResult=true,skipRevGeo=false}={}){
    const cond=conductores.find(c=>c.user_id===uid);
    if(requireOpen&&!conductorJourneyInfo(cond).open){
      setUbicacionConductorByUid(prev=>{const next={...prev};delete next[uid];return next;});
      if(showResult)setUbicacionRefreshByUid(prev=>({...prev,[uid]:{loading:false,error:"Conductor fuera de jornada"}}));
      if(showResult)showToast("Conductor fuera de jornada");
      return null;
    }
    try{
      if(showResult)setUbicacionRefreshByUid(prev=>({...prev,[uid]:{loading:true,error:""}}));
      const loc=await readLatestConductorLocation(uid,{allowStale,skipRevGeo});
      const nextLoc=loc||{label:"Sin ubicación registrada",updatedAt:null,missing:true,recent:false};
      setUbicacionConductorByUid(prev=>({...prev,[uid]:nextLoc}));
      const status=!loc?"Sin ubicación registrada":loc.recent===false?"Sin actualización reciente":"";
      if(showResult)setUbicacionRefreshByUid(prev=>({...prev,[uid]:{loading:false,error:status}}));
      if(showResult)showToast(status||"Ubicación actualizada");
      return loc;
    }catch(e){
      console.warn("actualizar ubicacion conductor:",e);
      const error="No se pudo actualizar ubicación";
      if(showResult)setUbicacionRefreshByUid(prev=>({...prev,[uid]:{loading:false,error}}));
      if(showResult)showToast(error);
      return null;
    }
  }

  /** Ubicación del conductor sin persistir ETA ni forzar tick visual. */
  async function actualizarServicioUbicacionLigera(sv,{showResult=true}={}){
    if(!sv?.conductor_id)return;
    await actualizarConductorUbicacion(sv.conductor_id,{
      allowStale:true,
      requireOpen:false,
      showResult,
      skipRevGeo:true,
    });
  }

  const serviciosOperativaIdsKey=useMemo(
    ()=>serviciosListaOperativa.map(s=>s.id).join(","),
    [serviciosListaOperativa],
  );
  const serviciosOperativaKeyRef=useRef("");

  useEffect(()=>{
    if(!serviciosListaOperativa.length){
      if(serviciosOperativaKeyRef.current){
        setEtaOperativaById({});
        serviciosOperativaKeyRef.current="";
      }
      return;
    }
    if(serviciosOperativaIdsKey===serviciosOperativaKeyRef.current)return;
    serviciosOperativaKeyRef.current=serviciosOperativaIdsKey;
    setEtaOperativaById(prev=>{
      const next={...prev};
      let changed=false;
      for(const sv of serviciosListaOperativa){
        if(sv.estado==="anulado")continue;
        if(!(sv.id in next)){next[sv.id]={};changed=true;}
      }
      for(const id of Object.keys(next)){
        if(!serviciosListaOperativa.some(s=>s.id===id)){delete next[id];changed=true;}
      }
      return changed?next:prev;
    });
    void refreshUbicacionRef.current?.(
      [...new Set(serviciosListaOperativa.filter(s=>s.estado!=="anulado").map(s=>s.conductor_id).filter(Boolean))],
      {allowStale:true,requireOpen:false,skipRevGeo:true,silent:true},
    );
  },[serviciosOperativaIdsKey,serviciosListaOperativa]);

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe")return;
    const refreshFlota=()=>{
      if(document.visibilityState==="hidden")return;
      void refreshFlotaLigeraRef.current?.({instantFeedback:false});
    };
    const refreshUbi=()=>{
      if(document.visibilityState==="hidden")return;
      const uids=[...new Set([
        ...conductoresFlotaRef.current.map(c=>c.user_id),
        ...serviciosListaRef.current.filter(s=>s.estado!=="anulado").map(s=>s.conductor_id),
      ].filter(Boolean))];
      void refreshUbicacionRef.current?.(uids,{allowStale:true,requireOpen:false,skipRevGeo:true,silent:true});
    };
    const idFlota=setInterval(refreshFlota,EMPRESA_FLOTA_DATA_POLL_MS);
    const idUbi=setInterval(refreshUbi,EMPRESA_UBICACION_POLL_MS);
    return()=>{clearInterval(idFlota);clearInterval(idUbi);};
  },[empresa?.id,modo]);

  useEffect(()=>{
    if(!empresa?.id||modo!=="jefe")return;
    const tick=()=>{
      if(document.visibilityState!=="hidden")setEmpresaEtaVisualNowMs(Date.now());
    };
    const id=setInterval(tick,EMPRESA_ETA_VISUAL_TICK_MS);
    return()=>clearInterval(id);
  },[empresa?.id,modo]);

  const nombreConductor=useCallback((uid)=>{
    if(!uid)return "Sin asignar";
    const c=conductores.find(c=>c.user_id===uid);
    return c?.nombre||"Conductor";
  },[conductores]);

  const buildExpedienteCompleto=useCallback(async(sv)=>{
    const conductor=conductores.find((c)=>c.user_id===sv.conductor_id);
    const incidenciasExpediente=sv?.id?await fetchIncidenciasExpedientePayload(sv.id):null;
    return buildExpedienteForServicio({
      servicio:sv,
      flotaStopsMap:flotaStopsRef.current,
      flotaEvsMap:flotaEvsRef.current,
      flotaExtraDocsMap:flotaExtraDocsRef.current,
      incidenciasExpediente,
      nombreConductor,
      fmtDur,
      entries:conductor?.entries||[],
    });
  },[conductores,nombreConductor,fmtDur]);

  const conductoresByUid=useMemo(()=>{
    const m={};
    for(const c of conductores){
      if(c.user_id)m[c.user_id]=c;
    }
    return m;
  },[conductores]);

  const actualizarServicioUbicacionLigeraRef=useRef(actualizarServicioUbicacionLigera);
  actualizarServicioUbicacionLigeraRef.current=actualizarServicioUbicacionLigera;
  const abrirAnularServicioRef=useRef(abrirAnularServicio);
  abrirAnularServicioRef.current=abrirAnularServicio;

  const handleToggleExpandId=useCallback((id)=>{
    setSvCardExpand(prev=>{
      const opening=prev!==id;
      const next=opening?id:null;
      if(opening){
        void (async()=>{
          await ensureFlotaStopsForServicioIds([id]);
          await ensureFlotaEvidenciasRef.current?.(id);
        })();
      }
      return next;
    });
  },[]);

  const handleRefreshServicioId=useCallback((id)=>{
    const sv=flotaServiciosRef.current.find(s=>s.id===id);
    if(sv)void actualizarServicioUbicacionLigeraRef.current?.(sv,{showResult:true});
  },[]);

  const handleManualRefreshFlota=useCallback(()=>{
    void refreshFlotaLigeraRef.current?.({instantFeedback:true});
  },[]);

  const[flotaRefreshLabelTick,setFlotaRefreshLabelTick]=useState(0);
  useEffect(()=>{
    if(!flotaManualRefreshAt)return undefined;
    const id=setInterval(()=>setFlotaRefreshLabelTick(t=>t+1),8000);
    return()=>clearInterval(id);
  },[flotaManualRefreshAt]);

  const flotaManualRefreshLabel=useMemo(
    ()=>formatFlotaManualRefreshLabel(flotaManualRefreshAt),
    [flotaManualRefreshAt,flotaRefreshLabelTick],
  );

  const handleAnularServicioId=useCallback((id)=>{
    const sv=flotaServiciosRef.current.find(s=>s.id===id);
    if(sv)abrirAnularServicioRef.current?.(sv);
  },[]);

  function openNuevoViaje(){
    const list=conductores.filter(c=>c.user_id);
    logServiceCreate("SERVICE_CREATE_START",{
      source:"PanelEmpresa.openNuevoViaje",
      empresaState:empresa?{id:empresa.id,nombre:empresa.nombre}:null,
      empresaId:empresa?.id??null,
      conductoresActivos:list.length,
      authUid:getUserId?.()||null,
    });
    if(!list.length){setAsignarModal({id:null,nombre:null});return;}
    setPickConductorViaje(true);
  }

  useEffect(()=>{
    if(!asignarModal)return;
    logServiceCreate("SERVICE_CREATE_START",{
      source:"PanelEmpresa.asignarModal.open",
      asignarModal,
      empresaState:empresa?{id:empresa.id,nombre:empresa.nombre,owner_id:empresa.owner_id}:null,
      empresaIdPassToModal:empresa?.id||null,
      authUid:getUserId?.()||null,
    });
  },[asignarModal,empresa?.id]);

  const handleAsignarConductorServicioId=useCallback((servicioId)=>{
    const sv=flotaServiciosRef.current.find(s=>s.id===servicioId);
    if(sv&&servicioPendienteAsignacion(sv))setAsignarConductorServicio(sv);
  },[]);

  const handleEditarServicioId=useCallback((servicioId)=>{
    const sv=flotaServiciosRef.current.find((s)=>s.id===servicioId);
    if(sv)setEditarServicioModal(sv);
  },[]);

  async function crearEmpresa(nombre,cif){
    const uid=getUserId();if(!uid)return;
    try{
      const res=await sbFetch("/rest/v1/empresas",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({nombre,cif:cif||null,owner_id:uid})});
      if(!res.ok){
        const errText=await res.text().catch(()=>"");
        if(isDemoDevUnlocked())demoDevError("empresas POST (panel)",res.status,errText);
        showToast(`Error al crear empresa (${res.status})`);
        return;
      }
      const data=await res.json();
      let emp=Array.isArray(data)?data[0]:data;
      if(emp?.id){
        const again=await sbSelect("empresas",`id=eq.${emp.id}`);
        if(again?.length)emp=again[0];
      }
      setEmpresa(emp);setModo("jefe");setConductores([]);
      showToast("Empresa creada ✓");
    }catch(e){
      if(isDemoDevUnlocked())demoDevError("crearEmpresa",e);
      showToast("Error al crear empresa");
    }
  }

  async function añadirConductor(){
    if(!empresa||!addForm.nombre.trim()||!addForm.email.trim())return;
    setAddLoading(true);
    try{
      const res=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"invite_conductor",admin_uid:getUserId(),jefe_empresa_id:empresa.id,email:addForm.email.trim(),nombre:addForm.nombre.trim(),matricula:addForm.matricula.trim()})});
      const data=await res.json();
      if(!res.ok){showToast("❌ "+(data.error||"Error al invitar"));setAddLoading(false);return;}
      setAddForm({nombre:"",matricula:"",email:""});setAddOpen(false);
      await loadConductores(empresa.id);
      showToast(`✅ Invitación enviada a ${addForm.email}`);
    }catch(e){showToast("❌ "+e.message);}
    finally{setAddLoading(false);}
  }

  async function toggleActivo(condId,activo){
    try{
      await sbFetch(`/rest/v1/conductor_empresa?id=eq.${condId}`,{method:"PATCH",body:JSON.stringify({activo:!activo})});
      await loadConductores(empresa.id);
      showToast(activo?"Conductor desactivado":"Conductor activado");
    }catch(_){}
  }

  if(loading)return<div style={{padding:40,textAlign:"center",color:su}}>⏳ Cargando...</div>;

  // Usuario registrado como empresa pero sin empresa creada todavía
  if(modo==="crear_empresa")return(
    <div style={{padding:"20px 16px 80px",background:bg,minHeight:"100vh"}}>
      <div style={{fontSize:18,fontWeight:800,color:tx,marginBottom:4}}>🏢 CREAR TU EMPRESA</div>
      <div style={{fontSize:14,color:su,marginBottom:20}}>Configura tu empresa para gestionar conductores y servicios.</div>
      <SetupJefe onCreate={async(nombre,cif)=>{
        await crearEmpresa(nombre,cif);
        await init();
      }} dark={dark}/>
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:card,color:"white",padding:"12px 20px",borderRadius:11,fontSize:14,fontWeight:700,zIndex:300}}>{toast}</div>}
    </div>
  );

  if(!modo)return(
    <div style={{padding:"20px 16px 80px",background:bg,minHeight:"100vh"}}>
      <div style={{fontSize:18,fontWeight:800,color:tx,marginBottom:6}}>🏢 PANEL EMPRESA</div>
      {prof.tipo_cuenta==="empresa"?(
        <>
          <div style={{fontSize:14,color:su,marginBottom:20}}>Configura tu empresa para gestionar conductores y servicios.</div>
          <SetupJefe onCreate={async(nombre,cif)=>{await crearEmpresa(nombre,cif);await init();}} dark={dark}/>
        </>
      ):(
        <>
          <div style={{fontSize:14,color:su,marginBottom:24}}>¿Eres jefe de flota o conductor?</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <SetupJefe onCreate={crearEmpresa} dark={dark}/>
            <SetupConductor
              prof={prof}
              dark={dark}
              onJoined={()=>{
                setModo("conductor");
                onRoleChange?.("conductor");
                showToast("Listo. Ya formas parte del equipo.");
              }}
            />
          </div>
        </>
      )}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:card,color:"white",padding:"12px 20px",borderRadius:11,fontSize:14,fontWeight:700,zIndex:300}}>{toast}</div>}
    </div>
  );

  if(modo==="conductor")return(
    <div style={{padding:"20px 16px 80px",background:bg,minHeight:"100vh"}}>
      <div style={{fontSize:18,fontWeight:800,color:tx,marginBottom:4}}>🏢 MI EMPRESA</div>
      <div style={{background:card,borderRadius:14,padding:"16px"}}>
        <div style={{fontSize:14,color:"#22C55E",fontWeight:700,marginBottom:8}}>✅ Conectado a empresa</div>
        <div style={{fontSize:13,color:su}}>Tus registros son visibles para el jefe de flota.</div>
      </div>
    </div>
  );

  // ── VISTA JEFE ──
  const semaforo=(n)=>{
    if(!n)return{col:"#94A3B8",icon:"",label:"Sin datos"};
    if(n.canDrive<=0)return{col:EMPRESA_UI.red,icon:"",label:"Parar ahora"};
    if(n.canDrive<=30||n.rDay<=60)return{col:EMPRESA_UI.amber,icon:"",label:"Atención"};
    return{col:EMPRESA_UI.green,icon:"",label:"Operativo"};
  };

  const TIPO_EV={cmr:"▤",foto:"□",incidencia:"○",ticket:"🎫",factura:"📄",otro:"📎"};
  const TIPO_EV_COL={cmr:EMPRESA_UI.accent,foto:EMPRESA_UI.green,incidencia:EMPRESA_UI.red,ticket:"#0EA5E9",factura:"#6366F1",otro:"#64748B"};

  function openExpedienteDocument(ev){
    const url=ev?.displayImageUrl||resolveEvidenciaDisplayImageUrl(ev)||ev?.previewUrl||ev?.url;
    if(!url)return;
    const mime=ev?.mime_type||"";
    const isPdf=mime.includes("pdf")||String(url).toLowerCase().includes(".pdf");
    if(isPdf){
      window.open(url,"_blank","noopener,noreferrer");
      return;
    }
    setVisorEv({...ev,url});
  }

  const serviciosEnRuta=flotaServicios.filter(s=>s.estado==="en_curso").length;
  const codigoEquipoStrict=empresa?getEmpresaEquipoCodeStrict(empresa):"";
  const codigoEquipoShow=empresa?getEmpresaCodigoEquipoDisplay(empresa):"";
  const generandoCodigoEquipo=!!empresa&&!codigoEquipoStrict;

  return(
    <div style={{background:bg,minHeight:"100vh",paddingBottom:72,color:tx}}>

      {anularModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:430,display:"flex",alignItems:"center",justifyContent:"center",padding:14}} onClick={()=>!anularModal.loading&&setAnularModal(null)}>
          <div style={{background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:16,width:"100%",maxWidth:520,boxShadow:"0 24px 70px rgba(15,23,42,.25)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"17px 18px 13px",borderBottom:"1px solid #cbd5e1",display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:11,color:"#64748b",fontWeight:850,letterSpacing:1.2,marginBottom:5}}>ANULACIÓN OPERACIONAL</div>
                <div style={{fontSize:18,fontWeight:850,color:"#0f172a"}}>¿Deseas anular este servicio?</div>
                <div style={{fontSize:12.5,color:"#475569",marginTop:4,lineHeight:1.35}}>
                  {getServiceNumber(anularModal.servicio)} · {getFixedServiceRoute(anularModal.servicio)}
                </div>
              </div>
              <button type="button" disabled={anularModal.loading} onClick={()=>setAnularModal(null)}
                style={{background:"#e2e8f0",border:"1px solid #cbd5e1",borderRadius:9,width:32,height:32,color:"#334155",cursor:anularModal.loading?"default":"pointer",fontWeight:800}}>×</button>
            </div>
            <div style={{padding:18}}>
              <div style={{fontSize:12,color:"#334155",fontWeight:800,marginBottom:7}}>Motivo</div>
              <input value={anularModal.motivo} onChange={e=>setAnularModal(prev=>prev?{...prev,motivo:e.target.value}:prev)}
                placeholder="Motivo opcional"
                style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:10,padding:"11px 12px",fontSize:14,color:"#0f172a",outline:"none",boxSizing:"border-box",marginBottom:10}}/>
              <div style={{fontSize:11,color:"#64748b",fontWeight:800,marginBottom:7}}>Motivos rápidos</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
                {["Cliente cancela","Carga anulada","Duplicado","Error operativo","Falta vehículo","Otro"].map(m=>(
                  <button key={m} type="button" disabled={anularModal.loading} onClick={()=>setAnularModal(prev=>prev?{...prev,motivo:m}:prev)}
                    style={{background:anularModal.motivo===m?"#0f172a":"white",color:anularModal.motivo===m?"white":"#475569",border:"1px solid #cbd5e1",borderRadius:999,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:anularModal.loading?"default":"pointer"}}>
                    {m}
                  </button>
                ))}
              </div>
              <div style={{background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:10,padding:"10px 11px",fontSize:12,color:"#475569",lineHeight:1.45,marginBottom:14}}>
                El servicio quedará histórico e inactivo. Se conservarán timeline parcial, documentos, evidencias, OCR, incidencias e integridad operacional.
              </div>
              {anularModal.error&&(
                <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"10px 11px",fontSize:12,color:"#9a3412",lineHeight:1.45,marginBottom:14,fontWeight:700}}>
                  No se pudo anular: {anularModal.error}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                <button type="button" disabled={anularModal.loading} onClick={()=>setAnularModal(null)}
                  style={{background:"white",color:"#475569",border:"1px solid #cbd5e1",borderRadius:10,padding:"11px 12px",fontSize:13,fontWeight:800,cursor:anularModal.loading?"default":"pointer"}}>
                  Cancelar
                </button>
                <button type="button" disabled={anularModal.loading} onClick={confirmarAnulacionServicio}
                  style={{background:anularModal.loading?"#94a3b8":"#475569",color:"white",border:"none",borderRadius:10,padding:"11px 12px",fontSize:13,fontWeight:850,cursor:anularModal.loading?"default":"pointer"}}>
                  {anularModal.loading?"Anulando...":"Confirmar anulación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pickConductorViaje&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.36)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPickConductorViaje(false)}>
          <div style={{background:card,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:480,maxHeight:"70vh",overflowY:"auto",padding:"16px 16px 28px",borderTop:`1px solid ${EMPRESA_UI.border}`,boxShadow:"0 -12px 32px rgba(15,23,42,.16)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:650,color:tx,marginBottom:4}}>Nuevo servicio</div>
            <div style={{fontSize:12,color:su,marginBottom:14}}>Elige conductor o planifica sin asignar</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button type="button" onClick={()=>{setAsignarModal({id:null,nombre:null});setPickConductorViaje(false);}}
                style={{width:"100%",textAlign:"left",background:"#eef2ff",border:"1.5px solid #c7d2fe",borderRadius:10,padding:"12px 14px",fontSize:14,fontWeight:700,color:"#3730a3",cursor:"pointer"}}>
                Planificar sin conductor
                <div style={{fontSize:11,color:"#475569",fontWeight:500,marginTop:4}}>Pendiente de asignación · visible solo en empresa</div>
              </button>
              {conductores.filter(c=>c.user_id).map(c=>(
                <button
                  key={c.user_id}
                  type="button"
                  onClick={()=>{setAsignarModal({id:c.user_id,nombre:c.nombre||"Conductor"});setPickConductorViaje(false);}}
                  style={{
                    width:"100%",
                    textAlign:"left",
                    background:EMPRESA_UI.surfaceSoft,
                    border:`1px solid ${EMPRESA_UI.border}`,
                    borderRadius:10,
                    padding:"12px 14px",
                    fontSize:14,
                    fontWeight:700,
                    color:tx,
                    cursor:"pointer",
                  }}
                >
                  {c.nombre||"Conductor"}{c.matricula&&<span style={{color:su,fontWeight:500,marginLeft:8}}>· {c.matricula}</span>}
                </button>
              ))}
            </div>
            <button type="button" onClick={()=>setPickConductorViaje(false)} style={{width:"100%",marginTop:12,background:"transparent",border:"none",color:su,fontSize:13,cursor:"pointer",padding:10}}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {inviteEquipoOpen&&empresa&&(
        <EquipoInvitacionModal
          onClose={()=>setInviteEquipoOpen(false)}
          equipoNombre={empresa.nombre}
          equipoCode={codigoEquipoStrict||codigoEquipoShow}
          linkUrl={buildEquipoDeepLink(codigoEquipoStrict||codigoEquipoShow)}
        />
      )}

      {/* Identidad empresa + código de equipo */}
      <div style={{background:EMPRESA_UI.surface,borderBottom:`1px solid ${EMPRESA_UI.border}`,padding:"10px 14px 12px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,color:EMPRESA_UI.subtle,minWidth:0}}>
          <span style={{fontWeight:650,color:tx}}>{empresa?.nombre}</span>
          {empresa?.cif&&<span style={{marginLeft:8}}>· CIF {empresa.cif}</span>}
          <span style={{marginLeft:8,color:su}}>
            · <strong style={{color:EMPRESA_UI.accent}}>{serviciosEnRuta}</strong> en ruta
          </span>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"flex-end",justifyContent:"space-between",gap:10}}>
          <div style={{minWidth:0,flex:"1 1 160px"}}>
            <div style={{fontSize:10,color:su,fontWeight:750,letterSpacing:.6,marginBottom:4}}>Código de equipo</div>
            {generandoCodigoEquipo?(
              <div style={{fontSize:14,fontWeight:700,color:tx,display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:EMPRESA_UI.accent,opacity:.85}}/>
                Generando código…
              </div>
            ):(
              <div style={{fontFamily:"ui-monospace,monospace",fontSize:17,fontWeight:850,color:tx,letterSpacing:.5}}>{codigoEquipoShow}</div>
            )}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            <button type="button" disabled={generandoCodigoEquipo||!codigoEquipoShow}
              onClick={()=>{navigator.clipboard?.writeText(codigoEquipoShow).then(()=>showToast("Copiado ✓")).catch(()=>showToast("No se pudo copiar"));}}
              style={{background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,color:tx,fontSize:12,fontWeight:700,cursor:generandoCodigoEquipo?"default":"pointer",padding:"8px 12px",opacity:generandoCodigoEquipo?0.55:1}}>
              Copiar
            </button>
            <button type="button" disabled={generandoCodigoEquipo||!codigoEquipoShow}
              onClick={async()=>{
                const code=codigoEquipoStrict||codigoEquipoShow;
                if(!code)return;
                const url=buildEquipoDeepLink(code);
                const title=`Únete a ${empresa?.nombre||"nuestro equipo"}`;
                const text=`Abre Cuaderno de Ruta con este código de equipo: ${code}`;
                try{
                  if(navigator.share)await navigator.share({title,text,url});
                  else await navigator.clipboard.writeText(`${text}\n${url}`);
                  showToast("Listo para compartir");
                }catch{/* cancelado */}
              }}
              style={{background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,color:tx,fontSize:12,fontWeight:700,cursor:generandoCodigoEquipo?"default":"pointer",padding:"8px 12px",opacity:generandoCodigoEquipo?0.55:1}}>
              Compartir
            </button>
            <button type="button" disabled={generandoCodigoEquipo||!codigoEquipoShow}
              onClick={()=>setInviteEquipoOpen(true)}
              style={{background:EMPRESA_UI.tx,color:"#fff",border:"none",borderRadius:10,fontSize:12,fontWeight:750,cursor:generandoCodigoEquipo?"default":"pointer",padding:"8px 12px",opacity:generandoCodigoEquipo?0.55:1}}>
              QR invitar
            </button>
          </div>
        </div>
      </div>

      {/* ── CONDUCTORES ── */}
      {flotaTab==="conductores"&&(
        <div style={{padding:"14px 14px 80px"}}>
          {/* Invite */}
          <div style={{background:card,borderRadius:12,padding:"12px 14px",marginBottom:14,border:`1px solid ${EMPRESA_UI.border}`,boxShadow:EMPRESA_UI.shadow}}>
            {!addOpen?(
              <button onClick={()=>setAddOpen(true)} style={{width:"100%",background:EMPRESA_UI.tx,color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                + Invitar conductor
              </button>
            ):(
              <div>
                <div style={{fontSize:13,fontWeight:700,color:tx,marginBottom:10}}>Invitar conductor</div>
                {[{val:addForm.nombre,key:"nombre",ph:"Nombre completo *"},{val:addForm.matricula,key:"matricula",ph:"Matrícula del camión"},{val:addForm.email,key:"email",ph:"Email del conductor *",type:"email"}].map(({val,key,ph,type})=>(
                  <input key={key} value={val} type={type||"text"} onChange={e=>setAddForm(p=>({...p,[key]:e.target.value}))} placeholder={ph}
                    style={{width:"100%",background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.borderStrong}`,borderRadius:9,padding:"10px 13px",fontSize:14,color:tx,marginBottom:8,outline:"none",boxSizing:"border-box"}}/>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button onClick={()=>setAddOpen(false)} style={{background:EMPRESA_UI.surfaceSoft,color:EMPRESA_UI.subtle,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:9,padding:"10px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
                  <button onClick={añadirConductor} disabled={addLoading||!addForm.nombre.trim()||!addForm.email.trim()}
                    style={{background:addLoading||!addForm.nombre.trim()||!addForm.email.trim()?"#cbd5e1":EMPRESA_UI.tx,color:"white",border:"none",borderRadius:9,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    {addLoading?"Enviando...":"Invitar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lista conductores */}
          {conductores.length===0?(
            <div style={{background:card,borderRadius:14,padding:"40px 20px",textAlign:"center",border:`1px solid ${EMPRESA_UI.border}`,boxShadow:EMPRESA_UI.shadow}}>
              <div style={{fontSize:16,fontWeight:650,color:tx,marginBottom:6}}>Sin conductores todavía</div>
              <div style={{fontSize:13,color:su}}>Comparte el código con tus conductores</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {conductores.map(c=>{
                const sem=semaforo(c.norma);
                const n=c.norma;
                const journey=conductorJourneyInfo(c);
                const liveLocation=c.user_id?ubicacionConductorByUid[c.user_id]:null;
                const serviciosConductor=flotaServicios
                  .filter(s=>s.conductor_id===c.user_id&&(s.estado==="en_curso"||s.estado==="asignado"))
                  .sort((a,b)=>(a.estado==="en_curso"?0:1)-(b.estado==="en_curso"?0:1));
                const servicioActual=serviciosConductor[0]||null;
                const servicioRuta=servicioActual
                  ? getFixedServiceRoute(servicioActual)
                  : null;
                return(
                  <div key={c.id} style={{background:card,borderRadius:14,padding:"14px 16px",border:`1px solid ${EMPRESA_UI.border}`,borderLeft:`3px solid ${c.pendiente?"#cbd5e1":journey.open?sem.col:"#cbd5e1"}`,boxShadow:EMPRESA_UI.shadow}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:c.pendiente?0:10}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{width:8,height:8,borderRadius:"50%",background:c.pendiente?"#94a3b8":journey.open?sem.col:"#cbd5e1",flexShrink:0}}/>
                          <span style={{fontSize:15,fontWeight:650,color:tx}}>{c.nombre||"Conductor"}</span>
                          <span style={{fontSize:11,background:empresaTone(journey.open?sem.col:"#94A3B8").bg,color:empresaTone(journey.open?sem.col:"#94A3B8").fg,border:`1px solid ${empresaTone(journey.open?sem.col:"#94A3B8").border}`,borderRadius:999,padding:"2px 8px",fontWeight:600}}>{c.pendiente?"Sin vincular":journey.open?sem.label:"Fuera jornada"}</span>
                        </div>
                        {c.matricula&&<div style={{fontSize:12,color:su}}>Unidad {c.matricula}</div>}
                        {c.pendiente&&<div style={{fontSize:12,color:su,marginTop:4}}>Dale el código para que se vincule desde PERFIL</div>}
                        {!c.pendiente&&liveLocation&&<div style={{fontSize:13,color:tx,marginTop:8,fontWeight:600}}>Última ubicación · {fmtUbicacionConductorEmpresa(liveLocation)}</div>}
                        {!c.pendiente&&liveLocation&&<div style={{fontSize:11,color:su,marginTop:2,fontWeight:600}}>{fmtUbicacionActualizada(liveLocation)}</div>}
                        {!c.pendiente&&<div style={{fontSize:12,color:journey.color,marginTop:liveLocation?3:8,fontWeight:600}}>{journey.label.replace(/[🟢🟠⚪]/g,"").trim()}</div>}
                        {!c.pendiente&&servicioActual&&(
                          <div style={{fontSize:12,color:su,marginTop:4,lineHeight:1.35}}>
                            Servicio actual: <span style={{color:tx,fontWeight:600}}>{servicioRuta}</span>
                          </div>
                        )}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                        <button onClick={()=>toggleActivo(c.id,c.activo)} style={{background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:8,padding:"5px 10px",fontSize:11,color:su,cursor:"pointer"}}>
                          {c.activo?"Desactivar":"Activar"}
                        </button>
                        {!c.pendiente&&c.user_id&&(
                          <button type="button" onClick={()=>actualizarConductorUbicacion(c.user_id)}
                            disabled={!!ubicacionRefreshByUid[c.user_id]?.loading}
                            style={{background:EMPRESA_UI.accentSoft,border:"1px solid #bfdbfe",borderRadius:8,padding:"4px 8px",fontSize:10,color:"#1d4ed8",cursor:ubicacionRefreshByUid[c.user_id]?.loading?"default":"pointer",fontWeight:600}}>
                            {ubicacionRefreshByUid[c.user_id]?.loading?"Actualizando...":"↻ Ubicación"}
                          </button>
                        )}
                        {!c.pendiente&&c.user_id&&ubicacionRefreshByUid[c.user_id]?.error&&(
                          <div style={{fontSize:10,color:"#b45309",marginTop:4,fontWeight:700}}>{ubicacionRefreshByUid[c.user_id].error}</div>
                        )}
                      </div>
                    </div>

                    {!c.pendiente&&n&&(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
                        {[
                          {l:"Puede conducir",v:n.canDrive<=0?"¡PARAR!":fmtDur(n.canDrive),c:n.canDrive<=0?"#EF4444":n.canDrive<=30?"#EF4444":n.canDrive<=90?"#F97316":"#22C55E"},
                          {l:"Conducido hoy", v:fmtDur(n.todayDrive),c:"#F59E0B"},
                          {l:"Continua",      v:fmtDur(n.cont),c:n.cont>=270?"#EF4444":n.cont>=210?"#F97316":"#64748B"},
                          {l:"Semana",        v:`${fmtDur(n.weekDrive)}/56h`,c:n.weekDrive>LIM.WEEK*0.9?"#EF4444":n.weekDrive>LIM.WEEK*0.7?"#F97316":"#64748B"},
                        ].map(({l,v,c})=>(
                          <div key={l} style={{background:EMPRESA_UI.surfaceSoft,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:9,padding:"8px 10px"}}>
                            <div style={{fontSize:10,color:su,fontWeight:600,marginBottom:2}}>{l}</div>
                            <div style={{fontSize:15,fontWeight:650,color:empresaTone(c).fg,fontFamily:"monospace"}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!c.pendiente&&c.user_id&&(
                      <button onClick={()=>setAsignarModal({id:c.user_id,nombre:c.nombre})}
                        style={{width:"100%",background:EMPRESA_UI.tx,color:"white",border:"none",borderRadius:9,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                        Asignar servicio
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={async()=>{await loadConductores(empresa.id);await refreshUbicacionConductores();}} style={{width:"100%",marginTop:16,background:EMPRESA_UI.surface,color:EMPRESA_UI.subtle,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:12,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:EMPRESA_UI.shadow}}>
            Actualizar listado
          </button>
        </div>
      )}

      {/* ── SERVICIOS — centro operacional (PR-26/27) ── */}
      {flotaTab==="servicios"&&(
        <div style={{padding:"6px 12px 72px"}}>
          {!flotaBootstrapped&&flotaLoading?(
            <div style={{padding:40,textAlign:"center",color:su,fontSize:13}}>Cargando servicios...</div>
          ):flotaServicios.length===0?(
            <div style={{background:card,borderRadius:12,padding:"24px 16px",textAlign:"center",border:`1px solid ${EMPRESA_UI.border}`,boxShadow:EMPRESA_UI.shadow}}>
              <button type="button" onClick={openNuevoViaje}
                style={{
                  width:"100%",
                  background:EMPRESA_UI.btnPrimary,
                  color:"white",
                  border:`1px solid ${EMPRESA_UI.btnPrimaryBorder}`,
                  borderRadius:10,
                  padding:"12px 14px",
                  fontSize:14,
                  fontWeight:700,
                  cursor:"pointer",
                  marginBottom:12,
                  boxShadow:"0 1px 3px rgba(22,163,74,.22)",
                }}>
                + Nuevo servicio
              </button>
              <div style={{fontSize:15,fontWeight:650,color:tx,marginBottom:6}}>Sin servicios todavía</div>
              <div style={{fontSize:13,color:su,lineHeight:1.45}}>Crea un servicio nuevo o asígnalo desde Conductores.</div>
            </div>
          ):(
            <>
              <div style={{background:EMPRESA_UI.surface,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:14,padding:"14px",boxShadow:EMPRESA_UI.shadow,marginBottom:18}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:650,color:tx}}>Acciones</div>
                    <div style={{fontSize:11,color:su,marginTop:2}}>Crear servicio o filtrar la operación</div>
                  </div>
                  <button type="button" onClick={openNuevoViaje}
                    style={{
                      background:EMPRESA_UI.btnPrimary,
                      color:"white",
                      border:`1px solid ${EMPRESA_UI.btnPrimaryBorder}`,
                      borderRadius:10,
                      padding:"10px 14px",
                      fontSize:13,
                      fontWeight:700,
                      cursor:"pointer",
                      flexShrink:0,
                      boxShadow:"0 1px 3px rgba(22,163,74,.2)",
                    }}>
                    + Nuevo servicio
                  </button>
                </div>
                <div style={{height:1,background:EMPRESA_UI.border,margin:"0 0 12px"}}/>
                <input
                  type="search"
                  value={serviciosBusqueda}
                  onChange={e=>setServiciosBusqueda(e.target.value)}
                  placeholder="Buscar: cliente, conductor, matrícula, ref., ruta, lugares…"
                  style={{
                    width:"100%",
                    boxSizing:"border-box",
                    marginBottom:10,
                    background:EMPRESA_UI.surfaceSoft,
                    border:`1px solid ${EMPRESA_UI.border}`,
                    borderRadius:10,
                    padding:"9px 12px",
                    fontSize:13,
                    color:EMPRESA_UI.tx,
                    outline:"none",
                  }}
                />
                <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2,WebkitOverflowScrolling:"touch"}}>
                  {[{id:"todos",label:"Todos"},{id:"en_curso",label:"En curso"},{id:"sin_asignar",label:"Sin asignar"},{id:"asignados",label:"Asignados"},{id:"completados",label:"Completados"},{id:"archivados",label:"Archivados"},{id:"anulados",label:"Anulados"}].map(tab=>(
                    <button key={tab.id} type="button" onClick={()=>setServiciosVistaTab(tab.id)}
                      style={{
                        flexShrink:0,
                        background:serviciosVistaTab===tab.id?EMPRESA_UI.accentSoft:"#f8fafc",
                        border:`1px solid ${serviciosVistaTab===tab.id?"#93c5fd":EMPRESA_UI.border}`,
                        borderRadius:20,
                        padding:"6px 12px",
                        fontSize:11,
                        fontWeight:serviciosVistaTab===tab.id?700:550,
                        color:serviciosVistaTab===tab.id?"#1d4ed8":EMPRESA_UI.subtle,
                        cursor:"pointer",
                        transition:"background .12s ease, border-color .12s ease",
                      }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,margin:"4px 0 10px"}}>
                <div style={{height:1,background:EMPRESA_UI.border,flex:1}}/>
                <div style={{fontSize:11,color:su,fontWeight:600,letterSpacing:.2}}>Lista operacional</div>
                <div style={{height:1,background:EMPRESA_UI.border,flex:1}}/>
              </div>
              <div style={{background:EMPRESA_UI.surface,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:14,boxShadow:EMPRESA_UI.shadow,overflow:"hidden"}}>
              {serviciosTotal===0?(
                <div style={{padding:"28px 14px",textAlign:"center",color:su,fontSize:13,lineHeight:1.5}}>
                  Nada en esta vista · prueba otro filtro o crea un servicio nuevo
                </div>
              ):(
                <>
                <EmpresaFlotaServiciosList
                  servicios={serviciosListaVisible}
                  flotaStops={flotaStops}
                  flotaEvs={flotaEvs}
                  expandedId={svCardExpand}
                  onToggleExpandId={handleToggleExpandId}
                  nowMs={empresaEtaVisualNowMs}
                  ubicacionConductorByUid={ubicacionConductorByUid}
                  ubicacionRefreshByUid={ubicacionRefreshByUid}
                  conductoresByUid={conductoresByUid}
                  nombreConductor={nombreConductor}
                  onRefreshServicioId={handleRefreshServicioId}
                  onAnularServicioId={handleAnularServicioId}
                  onAsignarConductorServicioId={handleAsignarConductorServicioId}
                  onEditarServicioId={handleEditarServicioId}
                  fmtDur={fmtDur}
                  tx={tx}
                  su={su}
                />
                  <div style={{background:"#f8fafc",borderTop:`1px solid ${EMPRESA_UI.border}`,padding:"10px 11px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                    <div style={{fontSize:12,color:"#334155",fontWeight:700}}>
                      Mostrando {serviciosFrom+1}-{serviciosTo} de {serviciosTotal} servicios
                    </div>
                    <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                      <button type="button" disabled={serviciosPageActual<=1} onClick={()=>setServiciosPage(serviciosPageActual-1)}
                        style={{background:serviciosPageActual<=1?"#f1f5f9":"white",color:serviciosPageActual<=1?"#94a3b8":"#334155",border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 9px",fontSize:12,fontWeight:800,cursor:serviciosPageActual<=1?"default":"pointer"}}>
                        ← Anterior
                      </button>
                      {serviciosPages.map((p,i)=>(
                        <button key={`${p}-${i}`} type="button" onClick={()=>setServiciosPage(p)}
                          style={{background:p===serviciosPageActual?"#0f172a":"white",color:p===serviciosPageActual?"white":"#334155",border:"1px solid #cbd5e1",borderRadius:8,minWidth:30,padding:"6px 8px",fontSize:12,fontWeight:850,cursor:"pointer"}}>
                          {p}
                        </button>
                      ))}
                      <button type="button" disabled={serviciosPageActual>=serviciosTotalPages} onClick={()=>setServiciosPage(serviciosPageActual+1)}
                        style={{background:serviciosPageActual>=serviciosTotalPages?"#f1f5f9":"white",color:serviciosPageActual>=serviciosTotalPages?"#94a3b8":"#334155",border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 9px",fontSize:12,fontWeight:800,cursor:serviciosPageActual>=serviciosTotalPages?"default":"pointer"}}>
                        Siguiente →
                      </button>
                    </div>
                  </div>
                </>
              )}
              </div>
              <div style={{marginTop:12}}>
                <button type="button" onClick={handleManualRefreshFlota} style={{width:"100%",background:EMPRESA_UI.surface,color:EMPRESA_UI.subtle,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:10,padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:EMPRESA_UI.shadow}}>
                  Actualizar
                </button>
                {flotaManualRefreshLabel?(
                  <div style={{marginTop:6,textAlign:"center",fontSize:11,color:EMPRESA_UI.green,fontWeight:600}}>
                    {flotaManualRefreshLabel}
                  </div>
                ):null}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PLANIFICADOR EMPRESA — acceso principal ── */}
      {flotaTab==="planificador"&&(
        <EmpresaPlanificadorRuta dark={dark}/>
      )}

      {/* ── DOCUMENTOS ── */}
      {flotaTab==="documentos"&&(
        <div style={{padding:"14px 14px 80px"}}>
          {visorEv&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setVisorEv(null)}>
              <div style={{background:card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{padding:"14px 16px 10px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:15,fontWeight:800,color:TIPO_EV_COL[visorEv.tipo]||tx}}>{TIPO_EV[visorEv.tipo]} {visorEv.tipo.toUpperCase()}</div>
                  <button onClick={()=>setVisorEv(null)} style={{background:"#334155",border:"none",borderRadius:8,width:30,height:30,color:tx,cursor:"pointer"}}>✕</button>
                </div>
                <div style={{padding:"16px 16px 40px"}}>
                  <div style={{fontSize:11,color:su,marginBottom:12}}>{new Date(visorEv.created_at).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                  {visorEv.url&&<img src={visorEv.url} style={{width:"100%",maxHeight:300,objectFit:"cover",borderRadius:12,marginBottom:10}} alt="ev"/>}
                  {visorEv.url&&<a href={visorEv.url} download target="_blank" rel="noopener noreferrer" style={{display:"block",background:"#1E40AF",color:"white",borderRadius:10,padding:"10px",fontSize:13,fontWeight:700,textAlign:"center",textDecoration:"none",marginBottom:14}}>⬇️ Descargar</a>}
                  {visorEv.tipo==="cmr"&&visorEv.datos&&(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {[["Nº CMR","num_cmr"],["Remitente","remitente"],["Destinatario","destinatario"],["Transportista","transportista"],["Lugar carga","lugar_carga"],["Lugar entrega","lugar_entrega"],["Mercancía","mercancia"],["Peso (kg)","peso_kg"],["Matrícula","matricula"],["Observaciones","observaciones"]].map(([lbl,key])=>visorEv.datos[key]?(<div key={key} style={{background:bg,borderRadius:8,padding:"9px 11px"}}><div style={{fontSize:10,color:su,fontWeight:700,marginBottom:2}}>{lbl.toUpperCase()}</div><div style={{fontSize:14,color:tx}}>{visorEv.datos[key]}</div></div>):null)}
                    </div>
                  )}
                  {visorEv.tipo==="incidencia"&&visorEv.datos?.texto&&(<div style={{background:"#450a0a",border:"1px solid #EF444440",borderRadius:10,padding:"12px 14px",fontSize:14,color:"#FCA5A5",lineHeight:1.6}}>{visorEv.datos.texto}</div>)}
                  {sanitizeDocumentCommentText(visorEv.nota)&&<div style={{marginTop:12,fontSize:13,color:su,background:bg,borderRadius:8,padding:"9px 11px"}}>📝 {sanitizeDocumentCommentText(visorEv.nota)}</div>}
                </div>
              </div>
            </div>
          )}
          {expedientePreview&&(
            <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:480,display:"flex",alignItems:"center",justifyContent:"center",padding:14}} onClick={()=>setExpedientePreview(null)}>
              <div style={{background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:16,width:"100%",maxWidth:760,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 70px rgba(15,23,42,.25)"}} onClick={e=>e.stopPropagation()}>
                <div style={{padding:"18px 20px 14px",borderBottom:"1px solid #cbd5e1",display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:1.4,color:"#475569",marginBottom:5}}>EXPEDIENTE OPERACIONAL</div>
                    <div style={{fontSize:21,fontWeight:800,color:"#0f172a",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis"}}>{expedientePreview.header.referencia}</div>
                    <div style={{fontSize:13,color:"#475569",marginTop:4}}>{expedientePreview.header.ruta}</div>
                  </div>
                  <button type="button" onClick={()=>setExpedientePreview(null)} style={{background:"#e2e8f0",border:"1px solid #cbd5e1",borderRadius:9,width:32,height:32,color:"#334155",cursor:"pointer",fontWeight:800}}>×</button>
                </div>
                <div style={{padding:20}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:16}}>
                    {[
                      ["Conductor",expedientePreview.header.conductor],
                      ["Cliente",expedientePreview.header.cliente],
                      ["Ref cliente",expedientePreview.header.referenciaCliente],
                      ["Estado",ESTADO_LABEL[expedientePreview.header.estado]||expedientePreview.header.estado],
                      ["Documentos",String(expedientePreview.evidencias.length)],
                      ["Peso expediente",expedientePreview.storage?.totalLabel||"—"],
                    ].map(([l,v])=>(
                      <div key={l} style={{background:"white",border:"1px solid #dbe2ea",borderRadius:10,padding:"9px 10px",minWidth:0}}>
                        <div style={{fontSize:10,color:"#64748b",fontWeight:800,textTransform:"uppercase",marginBottom:3}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                      </div>
                    ))}
                    <div style={{background:"white",border:"1px solid #dbe2ea",borderRadius:10,padding:"9px 10px",minWidth:0,gridColumn:"span 1"}}>
                      <div style={{fontSize:10,color:"#64748b",fontWeight:800,textTransform:"uppercase",marginBottom:3}}>ETA</div>
                      <div style={{fontSize:13,fontWeight:800,color:"#0f172a",lineHeight:1.3,overflowWrap:"anywhere",wordBreak:"break-word"}}>
                        {expedientePreview.header.etaLine1||expedientePreview.header.eta||"—"}
                      </div>
                      {expedientePreview.header.etaLine2?(
                        <div style={{fontSize:12,fontWeight:600,color:"#64748b",marginTop:4,lineHeight:1.35,overflowWrap:"anywhere"}}>
                          {expedientePreview.header.etaLine2}
                        </div>
                      ):null}
                    </div>
                    <div style={{background:"white",border:"1px solid #dbe2ea",borderRadius:10,padding:"9px 10px",minWidth:0}}>
                      <div style={{fontSize:10,color:"#64748b",fontWeight:800,textTransform:"uppercase",marginBottom:3}}>Km</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>
                        {expedientePreview.header.km!=null?`${expedientePreview.header.km} km`:"—"}
                      </div>
                    </div>
                  </div>
                  {expedientePreview.header.cancellation&&(
                    <div style={{background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:12,padding:"12px 13px",marginBottom:12}}>
                      <div style={{fontSize:12,fontWeight:850,color:"#334155",marginBottom:7}}>Anulación operacional</div>
                      <div style={{fontSize:12,color:"#475569",lineHeight:1.55}}>
                        Fecha: <strong>{expedientePreview.header.cancellation.fecha}</strong><br/>
                        Motivo: <strong>{expedientePreview.header.cancellation.motivo}</strong><br/>
                        Usuario: <strong>{expedientePreview.header.cancellation.usuario}</strong>
                      </div>
                    </div>
                  )}
                  <div style={{background:"white",border:"1px solid #dbe2ea",borderRadius:12,padding:"14px 14px 12px",marginBottom:12}}>
                    {console.log("CARD_RENDER_REAL", {
                      source: "EmpresaPanel.expedientePreviewModal",
                      servicioId: expedientePreview?.id,
                      timelineLength: expedientePreview?.timeline?.length ?? 0,
                      flotaTab: "documentos",
                    })}
                    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:12}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Timeline operacional</div>
                      <div style={{fontSize:11,color:"#64748b",fontWeight:700}}>{expedientePreview.timeline.length} eventos</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {expedientePreview.timeline.length===0?(
                        <div style={{fontSize:12,color:"#64748b"}}>Sin eventos operacionales todavía.</div>
                      ):expedientePreview.timeline.map((ev,idx)=>(
                        <div key={`${ev.ts}-${idx}`} style={{display:"grid",gridTemplateColumns:"52px 16px 1fr",gap:8,alignItems:"start"}}>
                          <div style={{fontSize:11,color:"#64748b",fontFamily:"monospace",paddingTop:1}}>{ev.time}</div>
                          <div style={{width:9,height:9,borderRadius:99,background:ev.type==="incidencia"?"#f97316":ev.type==="cmr"?"#2563eb":ev.type==="foto"?"#16a34a":"#94a3b8",marginTop:4}}/>
                          <div style={{minWidth:0,borderBottom:idx===expedientePreview.timeline.length-1?"none":"1px solid #e2e8f0",paddingBottom:8}}>
                            <div style={{fontSize:13,fontWeight:750,color:"#0f172a",lineHeight:1.25}}>{ev.title}</div>
                            {ev.detail&&<div style={{fontSize:12,color:"#64748b",lineHeight:1.35,marginTop:2}}>{ev.detail}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(expedientePreview.incidenciasOperativas?.length>0)&&(
                    <div style={{background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:12,padding:"13px 14px",marginBottom:12}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#9f1239",marginBottom:9}}>
                        Incidencias ({expedientePreview.incidenciasOperativas.length})
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {expedientePreview.incidenciasOperativas.map((inc)=>(
                          <div key={inc.id} style={{background:"white",border:"1px solid #fecdd3",borderRadius:9,padding:"9px 10px"}}>
                            <div style={{fontSize:13,fontWeight:800,color:"#881337"}}>{inc.titulo}</div>
                            {inc.descripcion?<div style={{fontSize:12,color:"#7f1d1d",marginTop:3,lineHeight:1.35}}>{inc.descripcion}</div>:null}
                            <div style={{fontSize:11,color:"#9f1239",marginTop:4}}>
                              {inc.fechaLabel||"—"} · {inc.fase_operativa||"—"} · Fotos {inc.fotos?.length||0}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:12}}>
                    <div style={{background:"white",border:"1px solid #dbe2ea",borderRadius:12,padding:"13px 14px"}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:9}}>Expediente documental</div>
                      <ExpedienteDocumentsPanel
                        expediente={expedientePreview}
                        onOpenDocument={openExpedienteDocument}
                      />
                    </div>
                    <div style={{background:"white",border:"1px solid #dbe2ea",borderRadius:12,padding:"13px 14px"}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:9}}>Resumen operacional</div>
                      {[
                        ["Km reales / plan",expedientePreview.header.km!=null?`${expedientePreview.header.km} km`:"—"],
                        ["Conducción",expedientePreview.metrics.conduccion],
                        ["Espera carga",expedientePreview.metrics.esperaCarga],
                        ["Espera descarga",expedientePreview.metrics.esperaDescarga],
                        [expedientePreview.header.etaResumenTitulo || "ETA inicial", expedientePreview.header.eta],
                        ["Incidencias",String(expedientePreview.metrics.incidencias??0)],
                        ["Fotos incidencias",String(expedientePreview.metrics.fotosIncidencia??0)],
                      ].map(([l,v])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",gap:10,borderBottom:"1px solid #e2e8f0",padding:"7px 0",fontSize:12}}>
                          <span style={{color:"#64748b"}}>{l}</span>
                          <span style={{color:"#0f172a",fontWeight:700,textAlign:"right"}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{background:"white",border:"1px solid #dbe2ea",borderRadius:12,padding:"13px 14px",marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:8}}>Integridad operacional</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:7}}>
                      {[
                        `${expedientePreview.integrity.eventCount} eventos registrados automáticamente`,
                        expedientePreview.integrity.chronologyConsistent?"Cronología operacional consistente":"Cronología pendiente de revisión",
                        expedientePreview.integrity.timestampsVerified?"Timestamps verificados":"Timestamps incompletos",
                        expedientePreview.integrity.geoAvailable?"Geolocalización operacional disponible":"Geolocalización no disponible",
                      ].map(txt=>(
                        <div key={txt} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 9px",fontSize:11.5,color:"#334155",fontWeight:650,lineHeight:1.35}}>
                          ✓ {txt}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <button type="button" onClick={()=>descargarExpediente(expedientePreview)}
                      style={{background:"#0f172a",color:"white",border:"none",borderRadius:10,padding:"11px 12px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                      Descargar PDF
                    </button>
                    <button type="button" onClick={()=>archivarMetadataExpediente(expedientePreview)}
                      style={{background:"#f1f5f9",color:"#334155",border:"1px solid #cbd5e1",borderRadius:10,padding:"11px 12px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                      Archivar y liberar espacio
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {flotaLoading?<div style={{padding:40,textAlign:"center",color:su,fontSize:13}}>Cargando expedientes…</div>
          :flotaServicios.length===0?(<div style={{background:card,borderRadius:14,padding:"40px 20px",textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>▤</div><div style={{fontSize:15,fontWeight:700,color:tx,marginBottom:6}}>Sin expedientes todavía</div></div>)
          :(
            <>
              {/* Filtros */}
              <div style={{background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:12,padding:"12px",marginBottom:12,boxShadow:EMPRESA_UI.shadow}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:12,color:"#0f172a",fontWeight:850}}>Centro documental</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Localiza expedientes por servicio, cliente, ruta, conductor o matrícula.</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    {[{id:"activos",label:"Activos"},{id:"archivados",label:"Archivados"}].map(tab=>(
                      <button key={tab.id} type="button" onClick={()=>setDocsArchiveView(tab.id)}
                        style={{background:docsArchiveView===tab.id?"#0f172a":"white",color:docsArchiveView===tab.id?"white":"#475569",border:"1px solid #cbd5e1",borderRadius:999,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>BÚSQUEDA GLOBAL</div>
                  <input value={docsSearch} onChange={e=>setDocsSearch(e.target.value)} placeholder="Servicio, cliente, referencia, ciudad o conductor..."
                    style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"9px 10px",fontSize:13,color:"#0f172a",outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>CONDUCTOR</div>
                    <select value={filtConductor} onChange={e=>setFiltConductor(e.target.value)}
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none"}}>
                      <option value="">Todos</option>
                      {conductores.filter(c=>c.user_id).map(c=>(
                        <option key={c.user_id} value={c.user_id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>FECHA</div>
                    <input type="date" value={filtFecha} onChange={e=>setFiltFecha(e.target.value)}
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none",colorScheme:"light",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>SERVICIO / REF CLIENTE</div>
                    <input value={filtRef} onChange={e=>setFiltRef(e.target.value)} placeholder="SRV-0441"
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>CLIENTE / DESTINO</div>
                    <input value={filtCliente} onChange={e=>setFiltCliente(e.target.value)} placeholder="Madrid..."
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>MATRÍCULA</div>
                    <input value={filtMatricula} onChange={e=>setFiltMatricula(e.target.value)} placeholder="1234 ABC"
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>ESTADO</div>
                    <select value={filtEstado} onChange={e=>setFiltEstado(e.target.value)}
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none"}}>
                      <option value="">Todos</option>
                      {Object.entries(ESTADO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:800,marginBottom:3}}>INCIDENCIAS</div>
                    <select value={filtIncidencias} onChange={e=>setFiltIncidencias(e.target.value)}
                      style={{width:"100%",background:"white",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0f172a",outline:"none"}}>
                      <option value="">Todas</option>
                      <option value="con">Con incidencias</option>
                      <option value="sin">Sin incidencias</option>
                    </select>
                  </div>
                </div>
                {(filtConductor||filtFecha||filtRef||filtCliente||filtMatricula||filtEstado||filtIncidencias||docsSearch)&&(
                  <button onClick={()=>{setFiltConductor("");setFiltFecha("");setFiltRef("");setFiltCliente("");setFiltMatricula("");setFiltEstado("");setFiltIncidencias("");setDocsSearch("");}}
                    style={{marginTop:9,background:"transparent",border:"none",color:"#b91c1c",fontSize:12,fontWeight:800,cursor:"pointer",padding:0}}>
                    Limpiar filtros
                  </button>
                )}
              </div>

              {/* Lista filtrada */}
              {(()=>{
                const pageSize=20;
                const lower=(v)=>String(v||"").toLowerCase();
                const serviceDate=(sv)=>sv.fecha_inicio||sv.created_at||sv.generatedAt||"";
                const temporalGroup=(sv)=>{
                  const t=new Date(serviceDate(sv)).getTime();
                  if(!Number.isFinite(t))return"Sin fecha";
                  const d=new Date(t),now=new Date();
                  const day0=x=>{const y=new Date(x);y.setHours(0,0,0,0);return y;};
                  const d0=day0(d),n0=day0(now);
                  if(d0.getTime()===n0.getTime())return"Hoy";
                  const weekStart=day0(now);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
                  if(d0>=weekStart)return"Esta semana";
                  if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth())return"Este mes";
                  const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
                  if(d.getFullYear()===prev.getFullYear()&&d.getMonth()===prev.getMonth())return"Mes anterior";
                  return d.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
                };
                const serviciosFiltrados=flotaServicios.filter(sv=>{
                  const isArchived=archivedExpedienteIds.has(sv.id);
                  if(docsArchiveView==="activos"&&isArchived)return false;
                  if(docsArchiveView==="archivados"&&!isArchived)return false;
                  if(filtConductor&&sv.conductor_id!==filtConductor)return false;
                  if(filtFecha&&!String(serviceDate(sv)).startsWith(filtFecha))return false;
                  if(filtEstado&&sv.estado!==filtEstado)return false;
                  const conductor=conductores.find(c=>c.user_id===sv.conductor_id);
                  const matricula=sv.matricula||conductor?.matricula||"";
                  if(filtMatricula&&!lower(matricula).includes(lower(filtMatricula)))return false;
                  const svStops=flotaStops[sv.id]||[];
                  const incN=incidenciasCountServicio(sv.id,flotaStops,flotaEvs,flotaIncidenciasResumen);
                  if(filtIncidencias==="con"&&incN<=0)return false;
                  if(filtIncidencias==="sin"&&incN>0)return false;
                  const refVisible=getServiceNumber(sv);
                  const refClienteVisible=getServiceClientReference(sv);
                  const refSearch=[refVisible,refClienteVisible].filter(Boolean).join(" ").toLowerCase();
                  if(filtRef&&(!refSearch||!refSearch.includes(filtRef.toLowerCase())))return false;
                  if(filtCliente){
                    const q=filtCliente.toLowerCase();
                    if(!getServiceClient(sv).toLowerCase().includes(q))return false;
                  }
                  if(docsSearch){
                    if(!servicioMatchesSearchQuery(sv,docsSearch,{stops:svStops,conductor}))return false;
                  }
                  return true;
                }).sort((a,b)=>new Date(serviceDate(b))-new Date(serviceDate(a)));
                if(!serviciosFiltrados.length)return(
                  <div style={{background:card,borderRadius:12,padding:"24px",textAlign:"center",color:su,fontSize:13}}>
                    Sin resultados para los filtros aplicados
                  </div>
                );
                const total=serviciosFiltrados.length;
                const totalPages=Math.max(1,Math.ceil(total/pageSize));
                const page=Math.min(Math.max(1,docsPage),totalPages);
                const from=(page-1)*pageSize;
                const to=Math.min(from+pageSize,total);
                const pageRows=serviciosFiltrados.slice(from,to);
                const pages=Array.from({length:totalPages},(_,i)=>i+1).filter(p=>totalPages<=6||Math.abs(p-page)<=2||p===1||p===totalPages);
                const groups=pageRows.reduce((acc,sv)=>{
                  const g=temporalGroup(sv);
                  if(!acc[g])acc[g]=[];
                  acc[g].push(sv);
                  return acc;
                },{});
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:12,padding:"10px 12px",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",boxShadow:EMPRESA_UI.shadow}}>
                      <div style={{fontSize:12,color:"#334155",fontWeight:750}}>
                        Mostrando {from+1}-{to} de {total} informes
                      </div>
                      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <button type="button" disabled={page<=1} onClick={()=>setDocsPage(page-1)}
                          style={{background:page<=1?"#f1f5f9":"white",color:page<=1?"#94a3b8":"#334155",border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 9px",fontSize:12,fontWeight:800,cursor:page<=1?"default":"pointer"}}>
                          ← Anterior
                        </button>
                        {pages.map((p,i)=>(
                          <button key={`${p}-${i}`} type="button" onClick={()=>setDocsPage(p)}
                            style={{background:p===page?"#0f172a":"white",color:p===page?"white":"#334155",border:"1px solid #cbd5e1",borderRadius:8,minWidth:30,padding:"6px 8px",fontSize:12,fontWeight:850,cursor:"pointer"}}>
                            {p}
                          </button>
                        ))}
                        <button type="button" disabled={page>=totalPages} onClick={()=>setDocsPage(page+1)}
                          style={{background:page>=totalPages?"#f1f5f9":"white",color:page>=totalPages?"#94a3b8":"#334155",border:"1px solid #cbd5e1",borderRadius:8,padding:"6px 9px",fontSize:12,fontWeight:800,cursor:page>=totalPages?"default":"pointer"}}>
                          Siguiente →
                        </button>
                      </div>
                    </div>
                    {Object.entries(groups).map(([group,rows])=>(
                      <div key={group} style={{background:"white",border:"1px solid #dbe2ea",borderRadius:12,overflow:"hidden",boxShadow:EMPRESA_UI.shadow}}>
                        <div style={{background:"#f8fafc",borderBottom:"1px solid #dbe2ea",padding:"8px 11px",fontSize:11,color:"#475569",fontWeight:850,textTransform:"uppercase",letterSpacing:.4}}>{group}</div>
                        {rows.map(sv=>{
                          const svStops=flotaStops[sv.id]||[];
                          const totalEvs=countServiceDocuments(svStops,flotaEvs,flotaExtraDocs[sv.id]);
                          const conductor=conductores.find(c=>c.user_id===sv.conductor_id);
                          const preview=buildServiceExpedienteListPreview({servicio:sv,stops:svStops,nombreConductor});
                          const refVisible=getServiceNumber(sv);
                          const clienteDoc=getServiceClient(sv)||"—";
                          const incN=incidenciasCountServicio(sv.id,flotaStops,flotaEvs,flotaIncidenciasResumen);
                          const isArchived=archivedExpedienteIds.has(sv.id);
                          return(
                            <div key={sv.id} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(132px,1fr))",gap:10,alignItems:"center",padding:"10px 11px",borderBottom:"1px solid #eef2f7"}}>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:13,fontWeight:850,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{refVisible}</div>
                                <div style={{fontSize:10.5,color:"#64748b",marginTop:2}}>{clienteDoc}</div>
                              </div>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12.5,fontWeight:700,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview.ruta}</div>
                                <div style={{fontSize:10.5,color:"#64748b",marginTop:2}}>
                                  Docs {totalEvs}
                                  {incN>0?` · ${incN===1?"⚠ 1 incidencia":`⚠ ${incN} incidencias`}`:""}
                                </div>
                              </div>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12,color:"#334155",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview.conductor}</div>
                                <div style={{fontSize:10.5,color:"#64748b",marginTop:2}}>{sv.matricula||conductor?.matricula||"Sin matrícula"}</div>
                              </div>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12,color:"#0f172a",fontWeight:750,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview.eta}</div>
                                <div style={{fontSize:10.5,color:"#166534",marginTop:2,fontWeight:750}}>✓ Integridad validada</div>
                              </div>
                              <div style={{display:"flex",gap:6,justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap"}}>
                                {isArchived&&<span style={{fontSize:10,color:"#475569",background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:999,padding:"3px 7px",fontWeight:800}}>Archivado</span>}
                                <button type="button" onClick={()=>void abrirExpedientePreview(sv)}
                                  style={{background:"#e2e8f0",color:"#0f172a",border:"1px solid #cbd5e1",borderRadius:8,padding:"7px 9px",fontSize:12,fontWeight:850,cursor:"pointer"}}>
                                  Ver
                                </button>
                                <button type="button" onClick={()=>{
                                  const evs=evidenciasForServicioStops(sv.id,flotaStops,flotaEvs);
                                  setMailExpediente({
                                    servicio:sv,
                                    stops:svStops,
                                    evidenciasByStop:evs,
                                    extraDocs:flotaExtraDocs[sv.id]||[],
                                  });
                                }}
                                  style={{background:"#2563eb",color:"white",border:"none",borderRadius:8,padding:"7px 9px",fontSize:12,fontWeight:850,cursor:"pointer"}}>
                                  Correo
                                </button>
                                <button type="button" onClick={async()=>{
                                  await ensureFlotaStopsForServicioIds([sv.id]);
                                  await ensureFlotaEvidenciasForServicio(sv.id,{force:true});
                                  await ensureFlotaExtraDocsForServicio(sv.id,{force:true});
                                  void (async()=>{
                                    try{
                                      await ensureFlotaEvidenciasForServicio(sv.id,{force:true});
                                      await ensureFlotaExtraDocsForServicio(sv.id,{force:true});
                                      const exp=await buildExpedienteCompleto(sv);
                                      await descargarExpediente(exp);
                                    }catch(e){
                                      console.warn("download expediente:",e);
                                      showToast("No se pudo descargar el expediente");
                                    }
                                  })();
                                }}
                                  style={{background:"#0f172a",color:"white",border:"none",borderRadius:8,padding:"7px 9px",fontSize:12,fontWeight:850,cursor:"pointer"}}>
                                  PDF
                                </button>
                                {!isArchived&&(
                                  <button type="button" onClick={()=>void (async()=>{
                                    try{
                                      await ensureFlotaEvidenciasForServicio(sv.id,{force:true});
                                      await ensureFlotaExtraDocsForServicio(sv.id,{force:true});
                                      const exp=await buildExpedienteCompleto(sv);
                                      await archivarMetadataExpediente(exp);
                                    }catch(e){
                                      console.warn("archivar expediente:",e);
                                      showToast("No se pudo archivar el expediente");
                                    }
                                  })()}
                                    style={{background:"white",color:"#475569",border:"1px solid #cbd5e1",borderRadius:8,padding:"7px 9px",fontSize:12,fontWeight:850,cursor:"pointer"}}>
                                    Archivar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
          <button type="button" onClick={()=>{handleManualRefreshFlota();void ensureFlotaExtraDocsForDocumentos({force:true});}} style={{width:"100%",marginTop:16,background:"#334155",color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Actualizar</button>
        </div>
      )}

      {/* Modal asignar */}
      {asignarModal&&(
        <AsignarServicioModal
          conductorId={asignarModal.id}
          conductorNombre={asignarModal.nombre}
          empresaId={empresa?.id||null}
          onClose={()=>setAsignarModal(null)}
          onCreado={(merged)=>{
            const sinCond=!merged?.conductor_id;
            setAsignarModal(null);
            if(merged?.id&&merged.conductor_id){
              setFlotaServicios((prev)=>
                patchFlotaServicioTrasAsignar(prev,merged.id,{
                  conductorId:merged.conductor_id,
                  referencia:merged.referencia,
                  estado:"asignado",
                }),
              );
            }
            showToast(sinCond?"✅ Servicio planificado (pendiente asignación)":"✅ Servicio asignado a "+(asignarModal?.nombre||"conductor"));
            void refreshFlotaLigeraRef.current?.({instantFeedback:true});
          }}
        />
      )}

      {editarServicioModal&&(
        <EmpresaEditarServicioModal
          key={editarServicioModal.id}
          servicio={editarServicioModal}
          conductores={conductores}
          userId={getUserId?.()||null}
          onClose={()=>setEditarServicioModal(null)}
          onApplied={(merged)=>{
            if(merged?.id){
              setFlotaServicios((prev)=>prev.map((s)=>(s.id===merged.id?{...s,...merged}:s)));
            }
            setEditarServicioModal(null);
            showToast("Cambios guardados");
            void refreshFlotaLigeraRef.current?.({instantFeedback:true});
          }}
          onNotifyAssignment={(payload)=>{void sendAssignmentPush(payload);}}
        />
      )}

      {asignarConductorServicio&&(
        <AsignarConductorServicioModal
          servicio={asignarConductorServicio}
          conductores={conductores}
          onClose={()=>setAsignarConductorServicio(null)}
          onAsignado={({conductorNombre,conductorId,servicioId,referencia})=>{
            const expandedServicioId=svCardExpandRef.current;
            const prevRow=
              flotaServiciosRef.current.find((s)=>s.id===servicioId)||asignarConductorServicio;
            const patchedPreview={
              ...prevRow,
              id:servicioId,
              conductor_id:conductorId,
              estado:"asignado",
              referencia:referencia??prevRow?.referencia,
            };

            if(expandedServicioId===servicioId){
              const nextTab=resolveEmpresaVistaTabKeepingExpandedServicio(
                serviciosVistaTab,
                patchedPreview,
                empresaVistaTabCtx,
              );
              if(nextTab!==serviciosVistaTab)setServiciosVistaTab(nextTab);
            }

            setAsignarConductorServicio(null);
            setFlotaServicios((prev)=>
              patchFlotaServicioTrasAsignar(prev,servicioId,{conductorId,referencia,estado:"asignado"}),
            );
            showToast("✅ Conductor asignado: "+conductorNombre);
            void refreshFlotaLigeraRef.current?.({instantFeedback:true});
          }}
        />
      )}

      {mailExpediente&&(
        <SendDocumentationModal
          open
          onClose={()=>setMailExpediente(null)}
          servicio={mailExpediente.servicio}
          stops={mailExpediente.stops}
          evidenciasByStop={mailExpediente.evidenciasByStop}
          extraDocs={mailExpediente.extraDocs}
          showToast={showToast}
        />
      )}

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:card,color:"white",padding:"12px 20px",borderRadius:11,fontSize:14,fontWeight:700,zIndex:300}}>{toast}</div>}
    </div>
  );
}

function FlotaMap({conductores}){
  const divRef=useRef(null),mapRef=useRef(null);
  useEffect(()=>{
    const L=window.L;
    if(!L||!divRef.current)return;
    if(mapRef.current){mapRef.current.remove();mapRef.current=null;}
    const map=L.map(divRef.current,{zoomControl:true});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OSM"}).addTo(map);
    mapRef.current=map;
    const bounds=[];
    conductores.forEach(c=>{
      if(!c.ubicacion)return;
      const{lat,lon}=c.ubicacion;
      const isDriving=c.norma?.isDriving;
      const col=isDriving?"#F59E0B":"#64748B";
      const icon=L.divIcon({
        html:`<div style="background:${col};color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)">${c.nombre?.charAt(0)||"?"}</div>`,
        className:"",iconSize:[32,32],iconAnchor:[16,16]
      });
      L.marker([lat,lon],{icon}).addTo(map)
        .bindPopup(`<b>🚛 ${c.nombre}</b><br>${c.matricula||""}<br>${isDriving?"⊙ Conduciendo":"○ Parado"}<br>${c.ubicacion.velocidad!=null?c.ubicacion.velocidad+" km/h":""}`);
      bounds.push([lat,lon]);
    });
    if(bounds.length>0)try{map.fitBounds(bounds,{padding:[30,30],maxZoom:12});}catch(_){}
    return()=>{if(mapRef.current){mapRef.current.remove();mapRef.current=null;}};
  },[conductores]);
  return <div ref={divRef} style={{height:280,background:"#dde8f0"}}/>;
}

function SetupConductorPerfil({prof,dark}){
  const[rel,setRel]=useState(null);
  const[codigo,setCodigo]=useState("");
  const[loading,setLoading]=useState(false);
  const[toast,setToast]=useState("");
  const[preview,setPreview]=useState(null);
  const[previewLoading,setPreviewLoading]=useState(false);
  const debRef=useRef(null);
  const showToast=(m)=>{setToast(m);setTimeout(()=>setToast(""),3200);};

  useEffect(()=>{
    const p=sessionStorage.getItem("cuaderno_pending_equipo_vinculo");
    if(p){setCodigo(p);sessionStorage.removeItem("cuaderno_pending_equipo_vinculo");}
  },[]);

  useEffect(()=>{
    const uid=getUserId();
    if(!uid)return;
    sbSelect("empresas",`owner_id=eq.${uid}`)
      .then(emps=>{
        if(emps.length){setRel({esJefe:true,nombre:emps[0].nombre});return null;}
        return sbSelect("conductor_empresa",`user_id=eq.${uid}&activo=eq.true`);
      })
      .then(rels=>{
        if(!rels)return;
        if(rels.length)setRel({esJefe:false,nombre:rels[0].nombre||"Empresa"});
      })
      .catch(()=>{});
  },[]);

  useEffect(()=>{
    if(rel?.esJefe)return;
    if(rel?.nombre)return;
    const raw=codigo.trim();
    if(!raw){setPreview(null);setPreviewLoading(false);return;}
    if(debRef.current)clearTimeout(debRef.current);
    debRef.current=setTimeout(async()=>{
      setPreviewLoading(true);
      const emps=await fetchEmpresasByVinculoCode(raw);
      setPreview(emps?.[0]||null);
      setPreviewLoading(false);
    },320);
    return()=>{if(debRef.current)clearTimeout(debRef.current);};
  },[codigo,rel]);

  async function unirse(){
    const uid=getUserId();
    if(!uid){showToast("Inicia sesión para continuar");return;}
    if(!codigo.trim()){showToast("Escribe el código de equipo");return;}
    setLoading(true);
    try{
      const emps=await fetchEmpresasByVinculoCode(codigo);
      if(!emps.length){showToast("Ese código no existe");setLoading(false);return;}
      const emp=emps[0];
      const res=await sbFetch("/rest/v1/conductor_empresa",{
        method:"POST",
        headers:{"Prefer":"return=representation"},
        body:JSON.stringify({user_id:uid,empresa_id:emp.id,rol:"conductor",nombre:prof.nombre||"Conductor",matricula:prof.matricula||"",activo:true})
      });
      if(res.ok){
        setRel({esJefe:false,nombre:emp.nombre});
        setCodigo("");
        setPreview(null);
        showToast("Listo. Ya formas parte del equipo.");
      } else {
        showToast(await humanizeConductorEmpresaJoinError(res));
      }
    }catch{
      showToast("No se ha podido completar. Inténtalo en un momento.");
    }
    setLoading(false);
  }

  if(rel?.esJefe)return null;

  const card=dark?"#1e293b":"#fff";
  const line=dark?"#334155":"#e7e5e4";
  const tx=dark?"#f1f5f9":"#1c1917";
  const su=dark?"#94a3b8":"#78716c";

  return(
    <div style={{marginTop:16,background:card,borderRadius:18,padding:"18px 16px",border:`1px solid ${line}`,boxShadow:"0 8px 28px rgba(15,23,42,.08)"}}>
      <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:1.4,marginBottom:10}}>AÑADIR EQUIPO (OPCIONAL)</div>
      {rel&&!rel.esJefe?(
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{
            width:48,height:48,borderRadius:14,
            background:"linear-gradient(135deg,#22c55e,#15803d)",color:"#fff",
            fontSize:20,fontWeight:850,display:"flex",alignItems:"center",justifyContent:"center",
          }}>{empresaNombreInitial(rel.nombre)}</div>
          <div>
            <div style={{fontSize:12,color:su,fontWeight:700}}>Equipo activo</div>
            <div style={{fontSize:17,fontWeight:800,color:"#15803d"}}>{rel.nombre}</div>
            <div style={{fontSize:12,color:su,marginTop:4,lineHeight:1.4}}>Tu jefe puede ver tus servicios y ubicación operativa.</div>
          </div>
        </div>
      ):(
        <div>
          <div style={{fontSize:13,color:su,marginBottom:12,lineHeight:1.55,fontWeight:500}}>
            Opcional: si tu flota usa Cuaderno, pega el código que te han pasado.
          </div>
          <input
            value={codigo}
            onChange={e=>setCodigo(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&unirse()}
            placeholder="Ej. TC-4821"
            autoCapitalize="characters"
            spellCheck={false}
            style={{
              width:"100%",boxSizing:"border-box",
              background:dark?"#0f172a":"#fff",
              border:`1.5px solid ${preview?"#4ade80":line}`,
              borderRadius:14,padding:"14px 16px",fontSize:18,fontWeight:800,
              fontFamily:"'JetBrains Mono',ui-monospace,monospace",letterSpacing:1,color:tx,
              outline:"none",marginBottom:10,
            }}
          />
          {(previewLoading||preview)&&codigo.trim()&&(
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,minHeight:52}}>
              <div style={{
                width:44,height:44,borderRadius:12,
                background:"linear-gradient(135deg,#f59e0b,#ea580c)",color:"#fff",
                fontSize:18,fontWeight:850,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
              }}>{preview?empresaNombreInitial(preview.nombre):"…"}</div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:2}}>Te unirás a</div>
                <div style={{fontSize:16,fontWeight:800,color:tx,lineHeight:1.2}}>
                  {previewLoading?"Buscando…":preview?.nombre||"—"}
                </div>
              </div>
            </div>
          )}
          <button type="button" onClick={unirse} disabled={loading||!codigo.trim()||!preview}
            style={{
              width:"100%",border:"none",borderRadius:14,padding:"15px",fontSize:16,fontWeight:800,
              background:loading||!codigo.trim()||!preview?"#475569":"linear-gradient(135deg,#0f172a,#334155)",
              color:"#fff",cursor:loading||!codigo.trim()||!preview?"default":"pointer",
            }}>
            {loading?"Uniendo…":"Unirme al equipo"}
          </button>
        </div>
      )}
      {toast&&<div style={{fontSize:13,color:"#b45309",marginTop:12,fontWeight:650,textAlign:"center",lineHeight:1.4}}>{toast}</div>}
    </div>
  );
}

function SetupJefe({onCreate,dark}){
  const[open,setOpen]=useState(false);
  const[nombre,setNombre]=useState("");
  const[cif,setCif]=useState("");
  const cardBg=dark?"#1E293B":"white";
  const txt=dark?"#F1F5F9":"#0F172A";
  const sub=dark?"#94A3B8":"#64748B";
  return(
    <div style={{background:cardBg,borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
      <div style={{fontSize:16,fontWeight:800,color:txt,marginBottom:4}}>🏢 Soy jefe de flota</div>
      <div style={{fontSize:13,color:sub,marginBottom:12}}>Crea tu empresa y gestiona todos tus conductores desde aquí</div>
      {!open?(
        <button onClick={()=>setOpen(true)} style={{width:"100%",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:11,padding:"13px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
          + Crear mi empresa
        </button>
      ):(
        <div>
          <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre de la empresa" style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"2px solid #334155",borderRadius:9,padding:"11px 13px",fontSize:15,color:txt,marginBottom:10,outline:"none"}}/>
          <input value={cif} onChange={e=>setCif(e.target.value)} placeholder="CIF (opcional)" style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"2px solid #334155",borderRadius:9,padding:"11px 13px",fontSize:15,color:txt,marginBottom:12,outline:"none"}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <button onClick={()=>setOpen(false)} style={{background:"#334155",color:"white",border:"none",borderRadius:9,padding:"11px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
            <button onClick={()=>nombre.trim()&&onCreate(nombre.trim(),cif.trim())} style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:9,padding:"11px",fontSize:14,fontWeight:800,cursor:"pointer"}}>✓ Crear</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupConductor({prof,dark,onJoined}){
  const[codigo,setCodigo]=useState("");
  const[loading,setLoading]=useState(false);
  const[msg,setMsg]=useState("");
  const[preview,setPreview]=useState(null);
  const[previewLoading,setPreviewLoading]=useState(false);
  const debRef=useRef(null);
  const cardBg=dark?"#1E293B":"white";
  const txt=dark?"#F1F5F9":"#0F172A";
  const sub=dark?"#94A3B8":"#64748B";
  const line=dark?"#334155":"#e7e5e4";

  useEffect(()=>{
    const p=sessionStorage.getItem("cuaderno_pending_equipo_vinculo");
    if(p){setCodigo(p);sessionStorage.removeItem("cuaderno_pending_equipo_vinculo");}
  },[]);

  useEffect(()=>{
    const raw=codigo.trim();
    if(!raw){setPreview(null);setPreviewLoading(false);return;}
    if(debRef.current)clearTimeout(debRef.current);
    debRef.current=setTimeout(async()=>{
      setPreviewLoading(true);
      const emps=await fetchEmpresasByVinculoCode(raw);
      setPreview(emps?.[0]||null);
      setPreviewLoading(false);
    },320);
    return()=>{if(debRef.current)clearTimeout(debRef.current);};
  },[codigo]);

  async function unirse(){
    const uid=getUserId();
    if(!uid){setMsg("Inicia sesión para continuar");return;}
    if(!codigo.trim()){setMsg("Escribe el código de equipo");return;}
    setLoading(true);setMsg("");
    try{
      const emps=await fetchEmpresasByVinculoCode(codigo);
      if(!emps.length){setMsg("Ese código no existe. Revísalo con tu jefe.");setLoading(false);return;}
      const emp=emps[0];
      const res=await sbFetch("/rest/v1/conductor_empresa",{
        method:"POST",
        headers:{"Prefer":"return=representation"},
        body:JSON.stringify({
          user_id:uid,
          empresa_id:emp.id,
          rol:"conductor",
          nombre:prof?.nombre||"Conductor",
          matricula:prof?.matricula||"",
          activo:true,
        }),
      });
      if(res.ok){
        setCodigo("");
        setPreview(null);
        onJoined?.();
      }else{
        setMsg(await humanizeConductorEmpresaJoinError(res));
      }
    }catch{
      setMsg("No se ha podido completar. Inténtalo en un momento.");
    }
    setLoading(false);
  }

  return(
    <div style={{background:cardBg,borderRadius:16,padding:"16px",boxShadow:"0 8px 28px rgba(15,23,42,.08)",border:`1px solid ${line}`}}>
      <div style={{fontSize:10,fontWeight:800,color:sub,letterSpacing:1.3,marginBottom:8}}>AÑADIR EQUIPO (OPCIONAL)</div>
      <div style={{fontSize:15,fontWeight:800,color:txt,marginBottom:4}}>Soy conductor</div>
      <div style={{fontSize:13,color:sub,marginBottom:14,lineHeight:1.5,fontWeight:500}}>
        Si tu flota usa Cuaderno, pega el código que te han pasado. Puedes seguir sin equipo.
      </div>
      <input
        value={codigo}
        onChange={e=>setCodigo(e.target.value.toUpperCase())}
        onKeyDown={e=>e.key==="Enter"&&unirse()}
        placeholder="Ej. TC-4821"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        style={{
          width:"100%",boxSizing:"border-box",
          background:dark?"#0F172A":"#F8FAFC",
          border:`1.5px solid ${preview?"#4ade80":"#334155"}`,
          borderRadius:14,padding:"14px 16px",fontSize:18,fontWeight:800,
          fontFamily:"'JetBrains Mono',ui-monospace,monospace",letterSpacing:1,color:txt,
          outline:"none",marginBottom:10,
        }}
      />
      {(previewLoading||preview)&&codigo.trim()&&(
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,minHeight:52}}>
          <div style={{
            width:44,height:44,borderRadius:12,
            background:"linear-gradient(135deg,#f59e0b,#ea580c)",color:"#fff",
            fontSize:18,fontWeight:850,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>{preview?empresaNombreInitial(preview.nombre):"…"}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:11,color:sub,fontWeight:700,marginBottom:2}}>Te unirás a</div>
            <div style={{fontSize:16,fontWeight:800,color:txt,lineHeight:1.2}}>
              {previewLoading?"Buscando…":preview?.nombre||"—"}
            </div>
          </div>
        </div>
      )}
      <button type="button" onClick={unirse} disabled={loading||!codigo.trim()||!preview}
        style={{
          width:"100%",border:"none",borderRadius:14,padding:"15px",fontSize:16,fontWeight:800,
          background:loading||!codigo.trim()||!preview?"#475569":"linear-gradient(135deg,#0f172a,#334155)",
          color:"#fff",cursor:loading||!codigo.trim()||!preview?"default":"pointer",
        }}>
        {loading?"Uniendo…":"Unirme al equipo"}
      </button>
      {msg&&<div style={{fontSize:13,marginTop:12,color:"#fbbf24",fontWeight:650,lineHeight:1.45}}>{msg}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  KM TRACKER — Registro de cuentakilómetros
// ─────────────────────────────────────────────────────────────
function DocForm({tmpl,onSave,onCancel}){
  const[fields,setFields]=useState({});
  const[photo,setPhoto]=useState(null);
  const[location,setLocation]=useState("");
  const photoRef=useRef(null);

  useEffect(()=>{
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos=>{
        const{latitude:lat,longitude:lon}=pos.coords;
        setLocation(`${lat.toFixed(4)},${lon.toFixed(4)}`);
      },()=>{});
    }
  },[]);

  function handlePhoto(e){
    const f=e.target.files?.[0];if(!f)return;
    uploadPhoto(f,'documentos').then(url=>setPhoto(url));
  }

  function save(){
    const doc={
      id:Date.now()+Math.random(),
      templateId:tmpl.id,
      templateLabel:tmpl.label,
      templateIcon:tmpl.icon,
      fields,photo,location,
      ts:new Date(),
    };
    onSave(doc);
  }

  const requiredFilled=tmpl.fields.filter(f=>f.required).every(f=>fields[f.key]?.trim());

  return(
    <div style={{padding:"14px 14px 80px",background:"#F0F4F8",minHeight:"100vh"}}>
      <div style={{background:"white",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.06)",marginBottom:12}}>
        <div style={{background:"#1E293B",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:24}}>{tmpl.icon}</span>
          <div style={{fontSize:15,fontWeight:800,color:"#F1F5F9"}}>{tmpl.label}</div>
        </div>
        <div style={{padding:"16px"}}>
          {tmpl.fields.map(f=>(
            <div key={f.key} style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:6}}>
                {f.label.toUpperCase()}{f.required&&<span style={{color:"#EF4444",marginLeft:4}}>*</span>}
              </div>
              {f.type==="textarea"?(
                <textarea value={fields[f.key]||""} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.placeholder||""}
                  rows={3}
                  style={{width:"100%",border:"1.5px solid #E2E8F0",borderRadius:9,padding:"10px 12px",fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
              ):(
                <input type={f.type||"text"} value={fields[f.key]||""} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.placeholder||""}
                  style={{width:"100%",border:"1.5px solid #E2E8F0",borderRadius:9,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
              )}
            </div>
          ))}

          {location&&<div style={{fontSize:12,color:"#64748B",marginBottom:14}}>📍 Ubicación GPS registrada automáticamente</div>}

          <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
          <button onClick={()=>photoRef.current?.click()}
            style={{width:"100%",background:photo?"#F0FDF4":"#F8FAFC",border:`1.5px dashed ${photo?"#22C55E":"#CBD5E1"}`,borderRadius:9,padding:"10px",fontSize:13,color:photo?"#166534":"#64748B",cursor:"pointer",marginBottom:photo?8:0}}>
            {photo?"✓ Foto adjunta — toca para cambiar":"📷 Añadir foto (opcional)"}
          </button>
          {photo&&<img src={photo} style={{width:"100%",maxHeight:150,objectFit:"cover",borderRadius:9,marginTop:8}} alt="preview"/>}
        </div>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,background:"white",border:"1.5px solid #E2E8F0",borderRadius:12,padding:"14px",fontSize:15,fontWeight:600,color:"#64748B",cursor:"pointer"}}>
          Cancelar
        </button>
        <button onClick={save} disabled={!requiredFilled}
          style={{flex:2,background:requiredFilled?"#22C55E":"#94A3B8",color:"white",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:800,cursor:requiredFilled?"pointer":"default"}}>
          💾 Guardar documento
        </button>
      </div>
    </div>
  );
}

function CargasView({db,prof,dark}){
  const bg=dark?"#0F172A":"#F0F4F8";
  const card=dark?"#1E293B":"white";
  const tx=dark?"#F1F5F9":"#0F172A";
  const su=dark?"#94A3B8":"#64748B";
  const TIPOS_CARGA=["inicio_carga","inicio_descarga","inicio_carga_descarga"];
  const TIPO_LBL={inicio_carga:"Carga",inicio_descarga:"Descarga",inicio_carga_descarga:"Carga+Descarga"};
  const TIPO_ICO={inicio_carga:"📦",inicio_descarga:"📤",inicio_carga_descarga:"⚒"};
  const TIPO_COL={inicio_carga:"#84CC16",inicio_descarga:"#14B8A6",inicio_carga_descarga:"#8B5CF6"};

  const[filtroTipo,setFiltroTipo]=useState("todos");
  const[filtroFecha,setFiltroFecha]=useState("todo");
  const[seleccionados,setSeleccionados]=useState(new Set());
  const[modoSel,setModoSel]=useState(false);

  const sorted=[...db.entries].filter(e=>!e.deleted).sort((a,b)=>new Date(b.ts)-new Date(a.ts));

  // Construir bloques inicio+fin
  const bloques=[];
  const used=new Set();
  for(const e of sorted){
    if(!TIPOS_CARGA.includes(e.type))continue;
    if(used.has(e.id))continue;
    const pairType=e.type.replace("inicio_","fin_");
    const fin=sorted.filter(x=>x.type===pairType&&new Date(x.ts)>new Date(e.ts)&&!used.has(x.id))
      .sort((a,b)=>new Date(a.ts)-new Date(b.ts))[0];
    if(fin)used.add(fin.id);
    used.add(e.id);
    bloques.push({id:e.id,inicio:e,fin:fin||null,dur:fin?diffMin(new Date(e.ts),new Date(fin.ts)):null});
  }

  // Filtrar
  const hoy=new Date();
  const filtered=bloques.filter(b=>{
    if(filtroTipo!=="todos"&&b.inicio.type!==filtroTipo)return false;
    const ts=new Date(b.inicio.ts);
    if(filtroFecha==="hoy"&&!sameDay(ts,hoy))return false;
    if(filtroFecha==="semana"){const mon=getMon(hoy);if(ts<mon||ts>new Date(+mon+7*24*3600*1000))return false;}
    if(filtroFecha==="mes"&&(ts.getMonth()!==hoy.getMonth()||ts.getFullYear()!==hoy.getFullYear()))return false;
    return true;
  });

  function toggleSel(id){
    setSeleccionados(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  }
  function selTodos(){setSeleccionados(new Set(filtered.map(b=>b.id)));}
  function deselTodos(){setSeleccionados(new Set());}

  const paraDoc=modoSel&&seleccionados.size>0?filtered.filter(b=>seleccionados.has(b.id)):filtered;

  function exportDoc(){
    const rows=paraDoc.map(b=>`
      <tr>
        <td style="text-align:center">${TIPO_ICO[b.inicio.type]}<br/><strong>${TIPO_LBL[b.inicio.type]}</strong></td>
        <td>${fmtFull(new Date(b.inicio.ts))}</td>
        <td>${b.fin?fmtT(new Date(b.fin.ts)):"En curso"}</td>
        <td>${b.dur!=null?fmtDur(b.dur):"—"}</td>
        <td>${b.inicio.location||"—"}</td>
        <td>${b.inicio.note||"—"}</td>
      </tr>`).join("");
    const w=window.open("","_blank");
    if(!w)return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Informe de Operaciones</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px;color:#1E293B}
      .cabecera{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #0F172A}
      .logo{font-size:20px;font-weight:900;color:#0F172A}
      .sub{font-size:11px;color:#64748B;margin-top:2px}
      .datos{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
      .dato label{font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px}
      .dato span{font-size:13px;font-weight:700;display:block;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th{background:#0F172A;color:white;padding:8px;font-size:11px;text-align:left}
      td{border:1px solid #E2E8F0;padding:7px;font-size:11px;vertical-align:top}
      tr:nth-child(even) td{background:#F8FAFC}
      .total{margin-top:12px;font-size:12px;color:#64748B;text-align:right}
      .firma{margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
      .firma-box{border-top:1px solid #334155;padding-top:8px;font-size:11px;color:#64748B}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="cabecera">
      <div><div class="logo">📦 REGISTRO DE OPERACIONES</div><div class="sub">Cuaderno de Ruta Digital · EU 561/2006</div></div>
      <div style="text-align:right;font-size:11px;color:#64748B">${fmtFull(new Date())}</div>
    </div>
    <div class="datos">
      <div class="dato"><label>Conductor</label><span>${prof.nombre||"—"}</span></div>
      <div class="dato"><label>DNI</label><span>${prof.dni||"—"}</span></div>
      <div class="dato"><label>Empresa</label><span>${prof.empresa||"—"}</span></div>
      <div class="dato"><label>🚛 Camión</label><span>${prof.matricula||"—"}</span></div>
      ${prof.tipoVehiculo!=="rigido"?`<div class="dato"><label>🔗 Remolque</label><span>${prof.remolque||"—"}</span></div>`:""}
      <div class="dato"><label>Licencia CAP</label><span>${prof.licencia||"—"}</span></div>
    </div>
    <table>
      <tr><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Ubicación</th><th>Notas</th></tr>
      ${rows}
    </table>
    <div class="total">${paraDoc.length} operación${paraDoc.length!==1?"es":""} · Generado: ${fmtFull(new Date())}</div>
    <div class="firma">
      <div class="firma-box">Firma del conductor</div>
      <div class="firma-box">Sello / Firma empresa</div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
    w.document.close();
  }

  return(
    <div style={{background:bg,padding:"14px 14px 80px"}}>
      {/* Cabecera */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:tx}}>📦 CARGAS Y DESCARGAS</div>
          <div style={{fontSize:11,color:su,marginTop:2}}>{filtered.length} operaciones{modoSel&&seleccionados.size>0?` · ${seleccionados.size} seleccionadas`:""}</div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button onClick={()=>{setModoSel(m=>!m);setSeleccionados(new Set());}}
            style={{background:modoSel?"#F59E0B":"#1E293B",color:modoSel?"#0F172A":"white",border:"none",borderRadius:9,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {modoSel?"✕ Cancelar":"☑ Seleccionar"}
          </button>
          <button onClick={exportDoc}
            style={{background:"#0F172A",color:"white",border:"none",borderRadius:9,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            📄 {modoSel&&seleccionados.size>0?`PDF (${seleccionados.size})`:"PDF todo"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{background:card,borderRadius:12,padding:"12px",marginBottom:12,display:"flex",flexDirection:"column",gap:10,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:.5,marginBottom:6}}>PERÍODO</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{v:"todo",l:"Todos"},{v:"hoy",l:"Hoy"},{v:"semana",l:"Esta semana"},{v:"mes",l:"Este mes"}].map(f=>(
              <button key={f.v} onClick={()=>setFiltroFecha(f.v)}
                style={{background:filtroFecha===f.v?"#0F172A":"#F8FAFC",color:filtroFecha===f.v?"white":su,border:`1px solid ${filtroFecha===f.v?"#0F172A":"#E2E8F0"}`,borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                {f.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:su,letterSpacing:.5,marginBottom:6}}>TIPO</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{v:"todos",l:"Todos",c:"#334155"},{v:"inicio_carga",l:"📦 Carga",c:"#84CC16"},{v:"inicio_descarga",l:"📤 Descarga",c:"#14B8A6"},{v:"inicio_carga_descarga",l:"⚒ C+D",c:"#8B5CF6"}].map(f=>(
              <button key={f.v} onClick={()=>setFiltroTipo(f.v)}
                style={{background:filtroTipo===f.v?f.c:"#F8FAFC",color:filtroTipo===f.v?"white":su,border:`1px solid ${filtroTipo===f.v?f.c:"#E2E8F0"}`,borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                {f.l}
              </button>
            ))}
          </div>
        </div>
        {modoSel&&<div style={{display:"flex",gap:8}}>
          <button onClick={selTodos} style={{fontSize:12,color:"#F59E0B",fontWeight:700,background:"transparent",border:"none",cursor:"pointer"}}>Seleccionar todos</button>
          <button onClick={deselTodos} style={{fontSize:12,color:su,fontWeight:700,background:"transparent",border:"none",cursor:"pointer"}}>Deseleccionar</button>
        </div>}
      </div>

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"48px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>📦</div>
          <div style={{fontSize:15,fontWeight:700,color:tx,marginBottom:6}}>Sin operaciones</div>
          <div style={{fontSize:13,color:su}}>Registra cargas desde ⚒ Otros Trabajos</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        {filtered.map(b=>{
          const col=TIPO_COL[b.inicio.type]||"#F97316";
          const ico=TIPO_ICO[b.inicio.type]||"⚒";
          const lbl=TIPO_LBL[b.inicio.type]||"Otros";
          const sel=seleccionados.has(b.id);
          return(
            <div key={b.id}
              onClick={modoSel?()=>toggleSel(b.id):undefined}
              style={{background:sel?col+"20":card,borderRadius:12,padding:"12px",boxShadow:"0 1px 4px rgba(0,0,0,.05)",
                borderLeft:`4px solid ${col}`,border:`${sel?"2px":"1px"} solid ${sel?col:"transparent"}`,
                cursor:modoSel?"pointer":"default",position:"relative"}}>
              {modoSel&&<div style={{position:"absolute",top:10,right:10,width:20,height:20,borderRadius:"50%",background:sel?col:"#E2E8F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:800}}>
                {sel?"✓":""}
              </div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:20}}>{ico}</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:col}}>{lbl}</div>
                    <div style={{fontSize:11,color:su}}>{fmtFull(new Date(b.inicio.ts))}</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:15,fontWeight:800,color:col,fontFamily:"monospace"}}>{b.dur!=null?fmtDur(b.dur):"⏳"}</div>
                  {b.fin&&<div style={{fontSize:10,color:su}}>→ {fmtT(new Date(b.fin.ts))}</div>}
                </div>
              </div>
              {/* Datos del vehículo — pequeños */}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:b.inicio.location||b.inicio.note?6:0}}>
                <span style={{fontSize:10,color:su,background:dark?"#0F172A":"#F1F5F9",borderRadius:5,padding:"2px 7px"}}>🚛 {prof.matricula||"—"}</span>
                {prof.tipoVehiculo!=="rigido"&&<span style={{fontSize:10,color:su,background:dark?"#0F172A":"#F1F5F9",borderRadius:5,padding:"2px 7px"}}>🔗 {prof.remolque||"—"}</span>}
                <span style={{fontSize:10,color:su,background:dark?"#0F172A":"#F1F5F9",borderRadius:5,padding:"2px 7px"}}>👤 {prof.nombre||"—"}</span>
              </div>
              {b.inicio.location&&<div style={{display:"flex",gap:6,alignItems:"center",background:dark?"#0F172A":"#F8FAFC",borderRadius:7,padding:"6px 9px",marginBottom:b.inicio.note?6:0}}>
                <span>📍</span><span style={{fontSize:12,color:tx}}>{b.inicio.location}</span>
              </div>}
              {b.inicio.note&&<div style={{display:"flex",gap:6}}>
                <span style={{fontSize:12}}>📝</span><span style={{fontSize:12,color:su,lineHeight:1.5}}>{b.inicio.note}</span>
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmpresaReport({db,prof,dark,norma}){
  const bg=dark?"#0F172A":"#F0F4F8";
  const card=dark?"#1E293B":"white";
  const tx=dark?"#F1F5F9":"#0F172A";
  const su=dark?"#94A3B8":"#64748B";

  const hoy=new Date();
  const getLunes=(d)=>{const dd=new Date(d);dd.setHours(0,0,0,0);const day=dd.getDay();dd.setDate(dd.getDate()-(day===0?6:day-1));return dd;};

  const[modo,setModo]=useState("semana"); // dia | semana | rango
  const[selDia,setSelDia]=useState(()=>hoy.toISOString().slice(0,10));
  const[semana,setSemana]=useState(()=>getLunes(hoy).toISOString().slice(0,10));
  const[rangoDesde,setRangoDesde]=useState(()=>{const d=new Date(hoy);d.setDate(d.getDate()-7);return d.toISOString().slice(0,10);});
  const[rangoHasta,setRangoHasta]=useState(()=>hoy.toISOString().slice(0,10));

  // Calcular rango activo
  let desdeDate,hastaDate,titulo;
  if(modo==="dia"){
    desdeDate=new Date(selDia+"T00:00:00");
    hastaDate=new Date(selDia+"T23:59:59");
    titulo=new Date(selDia+"T12:00:00").toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  } else if(modo==="semana"){
    desdeDate=new Date(semana+"T00:00:00");
    hastaDate=new Date(+desdeDate+7*24*3600*1000-1);
    titulo=`Semana del ${desdeDate.toLocaleDateString("es-ES",{day:"numeric",month:"short"})} al ${hastaDate.toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"})}`;
  } else {
    desdeDate=new Date(rangoDesde+"T00:00:00");
    hastaDate=new Date(rangoHasta+"T23:59:59");
    titulo=`${desdeDate.toLocaleDateString("es-ES",{day:"numeric",month:"short"})} — ${hastaDate.toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"})}`;
  }

  const sorted=[...db.entries].filter(e=>!e.deleted&&!e.corrected_by).sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  const rangeEntries=sorted.filter(e=>new Date(e.ts)>=desdeDate&&new Date(e.ts)<=hastaDate);

  // Días en el rango
  const nDays=Math.max(1,Math.round((hastaDate-desdeDate)/(24*3600*1000)));
  const days=[];
  for(let i=0;i<nDays;i++){
    const d=new Date(+desdeDate+i*24*3600*1000);
    const ds=new Date(d);ds.setHours(0,0,0,0);
    const de=new Date(d);de.setHours(23,59,59,999);
    const dayEnts=sorted.filter(e=>new Date(e.ts)>=ds&&new Date(e.ts)<=de);
    let condMin=0,pausaMin=0,dispMin=0,otrosMin=0;
    let condStart=null,pausStart=null,dispStart=null,otrosStart=null;
    for(const e of dayEnts){
      if(e.type==="inicio_conduccion")condStart=e.ts;
      else if(e.type==="fin_conduccion"&&condStart){condMin+=diffMin(new Date(condStart),new Date(e.ts));condStart=null;}
      else if(e.type==="inicio_pausa")pausStart=e.ts;
      else if(e.type==="fin_pausa"&&pausStart){pausaMin+=diffMin(new Date(pausStart),new Date(e.ts));pausStart=null;}
      else if(e.type==="inicio_disponibilidad")dispStart=e.ts;
      else if(e.type==="fin_disponibilidad"&&dispStart){dispMin+=diffMin(new Date(dispStart),new Date(e.ts));dispStart=null;}
      else if(["inicio_carga","inicio_descarga","inicio_carga_descarga","inicio_repostaje","inicio_inspeccion","inicio_otros"].includes(e.type))otrosStart=e.ts;
      else if(["fin_carga","fin_descarga","fin_carga_descarga","fin_repostaje","fin_inspeccion","fin_otros"].includes(e.type)&&otrosStart){otrosMin+=diffMin(new Date(otrosStart),new Date(e.ts));otrosStart=null;}
    }
    if(condStart)condMin+=diffMin(new Date(condStart),de<hoy?de:hoy);
    const jIni=dayEnts.find(e=>e.type==="inicio_jornada");
    const jFin=dayEnts.find(e=>e.type==="fin_jornada");
    const cargas=dayEnts.filter(e=>["inicio_carga","inicio_descarga","inicio_carga_descarga"].includes(e.type));
    days.push({d,condMin,pausaMin,dispMin,otrosMin,jIni,jFin,cargas,hasData:condMin>0||dayEnts.length>0});
  }

  const totalCond=days.reduce((a,d)=>a+d.condMin,0);
  const totalPausa=days.reduce((a,d)=>a+d.pausaMin,0);
  const totalOtros=days.reduce((a,d)=>a+d.otrosMin,0);
  const totalCargas=days.reduce((a,d)=>a+d.cargas.length,0);
  const DIAS_ES=["Dom","Lun","Mar","Mie","Jue","Vie","Sab"];

  function navSemana(dir){const d=new Date(semana+"T00:00:00");d.setDate(d.getDate()+dir*7);if(d<=hoy)setSemana(d.toISOString().slice(0,10));}
  function navDia(dir){const d=new Date(selDia+"T12:00:00");d.setDate(d.getDate()+dir);if(d<=hoy)setSelDia(d.toISOString().slice(0,10));}

  function exportEmpresaPDF(){
    const w=window.open("","_blank");if(!w)return;
    const filasDia=days.map(day=>{
      const dk=`${DIAS_ES[day.d.getDay()]} ${String(day.d.getDate()).padStart(2,"0")}/${String(day.d.getMonth()+1).padStart(2,"0")}`;
      const ini=day.jIni?fmtT(new Date(day.jIni.ts)):"—";
      const fin=day.jFin?fmtT(new Date(day.jFin.ts)):"—";
      const pais=day.jIni?.pais||prof.paisBase||"ES";
      return`<tr style="${!day.hasData?"color:#94A3B8":""}">
        <td><strong>${dk}</strong></td>
        <td>${ini}</td><td>${fin}</td>
        <td style="font-weight:700;color:#F59E0B">${day.condMin>0?fmtDur(day.condMin):"—"}</td>
        <td>${day.pausaMin>0?fmtDur(day.pausaMin):"—"}</td>
        <td>${day.dispMin>0?fmtDur(day.dispMin):"—"}</td>
        <td>${day.otrosMin>0?fmtDur(day.otrosMin):"—"}</td>
        <td>${day.cargas.length||"—"}</td>
        <td>${pais}</td>
      </tr>`;
    }).join("");
    const cargasRows=rangeEntries.filter(e=>["inicio_carga","inicio_descarga","inicio_carga_descarga"].includes(e.type)).map(e=>{
      const T=EV[e.type];const fin=rangeEntries.find(x=>x.type===e.type.replace("inicio_","fin_")&&new Date(x.ts)>new Date(e.ts));
      return`<tr><td>${fmtFull(new Date(e.ts))}</td><td>${T?.label||e.type}</td><td>${fin?fmtDur(diffMin(new Date(e.ts),new Date(fin.ts))):"—"}</td><td>${e.location||"—"}</td><td>${e.note||"—"}</td></tr>`;
    }).join("");
    const ahora=new Date().toLocaleString("es-ES");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe — ${prof.nombre||"Conductor"}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:22px;color:#0F172A;font-size:12px}
    .cab{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #0F172A}
    .logo{font-size:20px;font-weight:900}.sub{font-size:11px;color:#64748B;margin-top:3px}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .mc{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px}
    .mc label{font-size:9px;color:#94A3B8;font-weight:700;display:block;margin-bottom:2px}.mc span{font-size:13px;font-weight:700}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
    .st{text-align:center;background:#F8FAFC;border-radius:6px;padding:9px}
    .st .v{font-size:20px;font-weight:900;color:#F59E0B}.st .l{font-size:9px;color:#64748B;margin-top:2px}
    h2{font-size:12px;font-weight:700;margin:14px 0 7px;border-bottom:1px solid #E2E8F0;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
    th{background:#0F172A;color:white;padding:6px 7px;text-align:left;font-size:10px}
    td{border:1px solid #E2E8F0;padding:5px 7px}tr:nth-child(even) td{background:#F8FAFC}
    .tr td{font-weight:700;background:#FFF7ED;border-top:2px solid #F59E0B}
    .firma{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:28px}
    .fb{border-top:1.5px solid #334155;padding-top:8px;font-size:11px;color:#64748B;min-height:48px}
    .ft{margin-top:14px;font-size:9px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:7px;text-align:center}
    .av{background:#F0F9FF;border:1px solid #BAE6FD;border-radius:6px;padding:8px 11px;font-size:10px;color:#0369A1;margin-bottom:12px}
    @media print{body{padding:0}}</style></head><body>
    <div class="cab"><div><div class="logo">INFORME DE ACTIVIDAD</div><div class="sub">${titulo} — generado: ${ahora}</div></div></div>
    <div class="meta">
      <div class="mc"><label>Conductor</label><span>${prof.nombre||"—"}</span></div>
      <div class="mc"><label>DNI</label><span>${prof.dni||"—"}</span></div>
      <div class="mc"><label>Empresa</label><span>${prof.empresa||"—"}</span></div>
      <div class="mc"><label>Licencia CAP</label><span>${prof.licencia||"—"}</span></div>
      <div class="mc"><label>Camion</label><span>${prof.matricula||"—"}</span></div>
      ${prof.tipoVehiculo!=="rigido"?`<div class="mc"><label>Remolque</label><span>${prof.remolque||"—"}</span></div>`:""}
    </div>
    <div class="av">Documento complementario al tacografo homologado (EU 561/2006). No sustituye al registro oficial.</div>
    <div class="stats">
      <div class="st"><div class="v">${fmtDur(totalCond)}</div><div class="l">Conduccion</div></div>
      <div class="st"><div class="v" style="color:#6366F1">${fmtDur(totalPausa)}</div><div class="l">Pausas</div></div>
      <div class="st"><div class="v" style="color:#F97316">${fmtDur(totalOtros)}</div><div class="l">Otros</div></div>
      <div class="st"><div class="v" style="color:#14B8A6">${totalCargas}</div><div class="l">Cargas</div></div>
    </div>
    <h2>RESUMEN DIARIO</h2>
    <table><thead><tr><th>Dia</th><th>Inicio</th><th>Fin</th><th>Conduccion</th><th>Pausas</th><th>Disponible</th><th>Otros</th><th>Cargas</th><th>Pais</th></tr></thead>
    <tbody>${filasDia}<tr class="tr"><td colspan="3">TOTAL</td><td>${fmtDur(totalCond)}</td><td>${fmtDur(totalPausa)}</td><td>${fmtDur(days.reduce((a,d)=>a+d.dispMin,0))}</td><td>${fmtDur(totalOtros)}</td><td>${totalCargas}</td><td></td></tr></tbody></table>
    ${cargasRows?`<h2>CARGAS Y DESCARGAS</h2><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Duracion</th><th>Ubicacion</th><th>Notas</th></tr></thead><tbody>${cargasRows}</tbody></table>`:""}
    <div class="firma">
      <div class="fb"><strong>Firma del conductor</strong><br/><br/>${prof.nombre||"_____________"} · DNI: ${prof.dni||"_____________"}</div>
      <div class="fb"><strong>Sello y firma empresa</strong><br/><br/>${prof.empresa||"_____________________________"}</div>
    </div>
    <div class="ft">Cuaderno de Ruta Digital · EU 561/2006 · ${ahora}</div>
    <script>window.onload=()=>window.print();</script></body></html>`);
    w.document.close();
  }

  return(
    <div style={{background:bg,padding:"14px 14px 80px"}}>
      {/* Selector de modo */}
      <div style={{background:card,borderRadius:12,padding:"12px 14px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
        <div style={{display:"flex",gap:7,marginBottom:12}}>
          {[{id:"dia",label:"📅 Día"},{id:"semana",label:"📆 Semana"},{id:"rango",label:"📊 Fechas"}].map(m=>(
            <button key={m.id} onClick={()=>setModo(m.id)}
              style={{flex:1,background:modo===m.id?"#0F172A":"#F8FAFC",color:modo===m.id?"#F59E0B":su,
                border:`1.5px solid ${modo===m.id?"#334155":"#E2E8F0"}`,borderRadius:9,padding:"9px 4px",
                fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {m.label}
            </button>
          ))}
        </div>

        {modo==="dia"&&(
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>navDia(-1)} style={{background:"#1E293B",color:"white",border:"none",borderRadius:8,padding:"8px 12px",fontSize:16,cursor:"pointer"}}>‹</button>
            <input type="date" value={selDia} onChange={e=>{if(e.target.value)setSelDia(e.target.value);}} max={hoy.toISOString().slice(0,10)}
              style={{flex:1,background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:8,padding:"8px 10px",fontSize:14,color:tx,outline:"none",colorScheme:"light"}}/>
            <button onClick={()=>navDia(1)} style={{background:"#1E293B",color:"white",border:"none",borderRadius:8,padding:"8px 12px",fontSize:16,cursor:"pointer"}}>›</button>
          </div>
        )}
        {modo==="semana"&&(
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>navSemana(-1)} style={{background:"#1E293B",color:"white",border:"none",borderRadius:8,padding:"8px 12px",fontSize:16,cursor:"pointer"}}>‹</button>
            <div style={{flex:1,textAlign:"center",fontSize:13,fontWeight:700,color:tx}}>{titulo}</div>
            <button onClick={()=>navSemana(1)} style={{background:"#1E293B",color:"white",border:"none",borderRadius:8,padding:"8px 12px",fontSize:16,cursor:"pointer"}}>›</button>
          </div>
        )}
        {modo==="rango"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:su,fontWeight:700,marginBottom:4}}>DESDE</div>
              <input type="date" value={rangoDesde} onChange={e=>{if(e.target.value)setRangoDesde(e.target.value);}}
                style={{width:"100%",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0F172A",outline:"none",colorScheme:"light"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:su,fontWeight:700,marginBottom:4}}>HASTA</div>
              <input type="date" value={rangoHasta} onChange={e=>{if(e.target.value)setRangoHasta(e.target.value);}} max={hoy.toISOString().slice(0,10)}
                style={{width:"100%",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0F172A",outline:"none",colorScheme:"light"}}/>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[
          {l:"Conduccion",v:fmtDur(totalCond),c:"#F59E0B"},
          {l:"Pausas",    v:fmtDur(totalPausa),c:"#6366F1"},
          {l:"Otros",     v:fmtDur(totalOtros),c:"#F97316"},
          {l:"Cargas",    v:String(totalCargas),c:"#14B8A6"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:card,borderRadius:10,padding:"12px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
            <div style={{fontSize:10,color:su,marginTop:2,fontWeight:700}}>{l.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Tabla diaria */}
      <div style={{background:card,borderRadius:12,overflow:"hidden",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
        <div style={{padding:"10px 14px 8px",borderBottom:`1px solid ${dark?"#334155":"#E2E8F0"}`}}>
          <div style={{fontSize:11,fontWeight:800,color:su}}>DETALLE — {titulo}</div>
        </div>
        {days.map((day,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"70px 1fr 1fr 1fr",gap:0,padding:"9px 14px",borderBottom:`1px solid ${dark?"#1E293B":"#F1F5F9"}`,opacity:day.hasData?1:.35}}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:tx}}>{DIAS_ES[day.d.getDay()]} {String(day.d.getDate()).padStart(2,"0")}/{String(day.d.getMonth()+1).padStart(2,"0")}</div>
              {day.jIni&&<div style={{fontSize:10,color:su}}>{fmtT(new Date(day.jIni.ts))}{day.jFin?` → ${fmtT(new Date(day.jFin.ts))}`:" →…"}</div>}
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#F59E0B",fontFamily:"monospace"}}>{day.condMin>0?fmtDur(day.condMin):"—"}</div>
              <div style={{fontSize:9,color:su}}>COND.</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#6366F1",fontFamily:"monospace"}}>{day.pausaMin>0?fmtDur(day.pausaMin):"—"}</div>
              <div style={{fontSize:9,color:su}}>PAUSA</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#14B8A6",fontFamily:"monospace"}}>{day.cargas.length>0?`${day.cargas.length} op.`:"—"}</div>
              <div style={{fontSize:9,color:su}}>CARGAS</div>
            </div>
          </div>
        ))}
        {totalCond>0&&<div style={{padding:"10px 14px",background:dark?"#0F172A":"#FFF7ED",borderTop:`2px solid #F59E0B`,display:"grid",gridTemplateColumns:"70px 1fr 1fr 1fr",gap:0}}>
          <div style={{fontSize:11,fontWeight:800,color:"#F59E0B"}}>TOTAL</div>
          <div style={{textAlign:"center",fontSize:14,fontWeight:900,color:"#F59E0B",fontFamily:"monospace"}}>{fmtDur(totalCond)}</div>
          <div style={{textAlign:"center",fontSize:14,fontWeight:900,color:"#6366F1",fontFamily:"monospace"}}>{fmtDur(totalPausa)}</div>
          <div style={{textAlign:"center",fontSize:13,fontWeight:800,color:"#14B8A6",fontFamily:"monospace"}}>{totalCargas>0?`${totalCargas} op.`:"—"}</div>
        </div>}
      </div>

      <button onClick={exportEmpresaPDF}
        style={{width:"100%",background:"#0F172A",color:"white",border:"none",borderRadius:12,padding:"16px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
        📄 Generar informe PDF
      </button>
      <div style={{fontSize:11,color:su,textAlign:"center",marginTop:8,lineHeight:1.6}}>
        Resumen diario, conduccion, pausas, cargas y firmas.<br/>Listo para entregar a la empresa.
      </div>
    </div>
  );
}
function AuditoriaView({db,prof,dark}){
  const[desde,setDesde]=useState(()=>{const d=new Date();d.setDate(d.getDate()-7);return d.toISOString().slice(0,10);});
  const[hasta,setHasta]=useState(()=>new Date().toISOString().slice(0,10));
  const bg=dark?"#0F172A":"#F0F4F8";
  const card=dark?"#1E293B":"white";
  const tx=dark?"#F1F5F9":"#0F172A";
  const su=dark?"#94A3B8":"#64748B";

  const desdeDate=new Date(desde+"T00:00:00");
  const hastaDate=new Date(hasta+"T23:59:59");

  const allEntries=[...db.entries].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  const entries=allEntries.filter(e=>new Date(e.ts)>=desdeDate&&new Date(e.ts)<=hastaDate);

  // Correcciones = entradas con campo 'corrects' (apuntan al original que corrigen)
  const correcciones=entries.filter(e=>e.corrects);
  // Originales que fueron corregidos = tienen corrected_by y no están borrados
  const originalesCorregidos=entries.filter(e=>e.corrected_by&&!e.deleted);
  const eliminados=entries.filter(e=>e.deleted);
  // Válidos = no borrados, no originales supersedidos
  const activos=entries.filter(e=>!e.deleted&&!e.corrected_by);

  // Calcular estadísticas básicas del período
  const minCond=activos.filter(e=>e.type==="inicio_conduccion").reduce((acc,e,_,arr)=>{
    const fin=arr.find(x=>x.type==="fin_conduccion"&&new Date(x.ts)>new Date(e.ts));
    if(fin)acc+=diffMin(new Date(e.ts),new Date(fin.ts));
    return acc;
  },0);

  function exportPDF(){
    const w=window.open("","_blank");if(!w)return;
    const filas=entries.map(e=>{
      const T=EV[e.type]||{label:e.type,icon:"•"};
      const esOriginalCorregido=!!e.corrected_by&&!e.deleted;
      const esCorreccion=!!e.corrects;
      const esEliminado=e.deleted;
      const estado=esEliminado?"ELIMINADO":esOriginalCorregido?"ORIGINAL (corregido)":esCorreccion?"✏ CORRECCION":"VALIDO";
      const color=esEliminado?"#DC2626":esOriginalCorregido?"#F97316":esCorreccion?"#2563EB":"#166534";
      const tachado=esEliminado||esOriginalCorregido;
      // Si es corrección, mostrar diferencia con el original
      const orig=esCorreccion?allEntries.find(x=>x.id===e.corrects):null;
      const diffInfo=orig?`Antes: ${fmtFull(new Date(orig.ts))}${orig.note?` · ${orig.note}`:""}`:"";
      return `<tr style="${tachado?"text-decoration:line-through;opacity:.55;background:#FEF9F9":""}">
        <td>${fmtFull(new Date(e.ts))}</td>
        <td>${T.icon} ${T.label}</td>
        <td style="color:${color};font-weight:700">${estado}</td>
        <td>${e.note||""}${diffInfo?`<br/><span style="font-size:9px;color:#94A3B8">${diffInfo}</span>`:""}</td>
        <td>${e.location||""}</td>
        <td style="font-size:10px;color:#666">${e.pais||""} ${e.id?.toString().slice(0,8)}</td>
      </tr>`;
    }).join("");

    const ahora=new Date().toLocaleString("es-ES");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe Auditoría</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#0F172A;font-size:13px}
      h1{color:#0F172A;font-size:18px;margin-bottom:4px}
      .sub{color:#64748B;font-size:12px;margin-bottom:20px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;background:#F8FAFC;padding:12px;border-radius:8px}
      .meta div{font-size:12px}.meta strong{display:block;font-size:14px;color:#0F172A}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px}
      .stat{background:#F8FAFC;padding:10px;border-radius:6px;text-align:center}
      .stat .v{font-size:20px;font-weight:bold;color:#0F172A}.stat .l{font-size:10px;color:#64748B}
      table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px}
      th{background:#0F172A;color:white;padding:8px;text-align:left}
      td{border:1px solid #E2E8F0;padding:6px}tr:nth-child(even){background:#F8FAFC}
      .footer{border-top:1px solid #E2E8F0;padding-top:12px;font-size:10px;color:#94A3B8}
      .aviso{background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px;padding:10px;margin-bottom:16px;font-size:11px;color:#92400E}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>📋 Informe de Auditoría — Registro Tacógrafo</h1>
    <div class="sub">Generado el ${ahora} · Solo para uso interno y defensa ante inspecciones</div>
    <div class="aviso">⚠️ Este informe es un registro digital complementario al tacógrafo homologado. No tiene validez legal por sí solo pero puede usarse como prueba documental de apoyo.</div>
    <div class="meta">
      <div><span style="color:#64748B;font-size:10px">CONDUCTOR</span><strong>${prof.nombre||"—"}</strong></div>
      <div><span style="color:#64748B;font-size:10px">DNI / LICENCIA</span><strong>${prof.dni||"—"} / ${prof.licencia||"—"}</strong></div>
      <div><span style="color:#64748B;font-size:10px">MATRÍCULA</span><strong>${prof.matricula||"—"}</strong></div>
      <div><span style="color:#64748B;font-size:10px">PERÍODO</span><strong>${desde} → ${hasta}</strong></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="v">${entries.length}</div><div class="l">Total eventos</div></div>
      <div class="stat"><div class="v">${activos.length}</div><div class="l">Validos</div></div>
      <div class="stat"><div class="v" style="color:#DC2626">${eliminados.length}</div><div class="l">Eliminados</div></div>
      <div class="stat"><div class="v" style="color:#2563EB">${correcciones.length}</div><div class="l">Correcciones</div></div>
    </div>
    <table>
      <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Estado</th><th>Nota</th><th>Ubicación</th><th>ID</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="footer">
      Cuaderno de Ruta Digital · Informe generado el ${ahora}<br>
      Hash de integridad: ${btoa(entries.map(e=>e.id+e.type+e.ts).join("|")).slice(0,32)}...
    </div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`);
    w.document.close();
  }

  return(
    <div style={{padding:"14px 14px 80px",background:bg,minHeight:"60vh"}}>
      <div style={{fontSize:14,fontWeight:800,color:tx,marginBottom:14}}>🔍 INFORME DE AUDITORÍA</div>

      {/* Selector de período */}
      <div style={{background:card,borderRadius:12,padding:"14px",marginBottom:12}}>
        <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:10}}>PERÍODO DEL INFORME</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:su,marginBottom:4}}>Desde</div>
            <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
              style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"1.5px solid #334155",borderRadius:8,padding:"9px",fontSize:14,color:tx,outline:"none"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:su,marginBottom:4}}>Hasta</div>
            <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
              style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"1.5px solid #334155",borderRadius:8,padding:"9px",fontSize:14,color:tx,outline:"none"}}/>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[
          {l:"Total eventos",v:entries.length,c:tx},
          {l:"Validos",v:activos.length,c:"#166534"},
          {l:"Eliminados",v:eliminados.length,c:"#DC2626"},
          {l:"Correcciones",v:correcciones.length,c:"#2563EB"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:card,borderRadius:10,padding:"12px",textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
            <div style={{fontSize:11,color:su,marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{background:card,borderRadius:12,padding:"12px",marginBottom:12}}>
        <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:10}}>EVENTOS DEL PERIODO</div>
        {entries.length===0&&<div style={{textAlign:"center",color:su,padding:"20px",fontSize:13}}>Sin eventos en este periodo</div>}
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:300,overflowY:"auto"}}>
          {entries.map(e=>{
            const T=EV[e.type]||{label:e.type,icon:"•",color:"#64748B"};
            const esCorr=!!e.corrects;         // es una corrección nueva
            const esOrig=!!e.corrected_by&&!e.deleted; // es un original supersedido
            const orig=esCorr?allEntries.find(x=>x.id===e.corrects):null;
            return(
              <div key={e.id} style={{padding:"7px 8px",
                background:e.deleted?"#FEF2F2":esCorr?"#EFF6FF":esOrig?"#FFFBEB":dark?"#0F172A":"#F8FAFC",
                borderRadius:7,
                borderLeft:`3px solid ${e.deleted?"#EF4444":esCorr?"#3B82F6":esOrig?"#F97316":T.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:12,color:T.color}}>{T.icon}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:tx,textDecoration:e.deleted||esOrig?"line-through":"none"}}>{T.label}</div>
                      <div style={{fontSize:11,color:su}}>{fmtFull(new Date(e.ts))}{e.pais?` · ${e.pais}`:""}</div>
                    </div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,flexShrink:0,marginLeft:8,
                    color:e.deleted?"#DC2626":esCorr?"#3B82F6":esOrig?"#F97316":"#166534",
                    background:e.deleted?"#FEE2E2":esCorr?"#DBEAFE":esOrig?"#FFF7ED":"#F0FDF4",
                    borderRadius:4,padding:"2px 6px"}}>
                    {e.deleted?"ELIMINADO":esCorr?"✏ CORREC.":esOrig?"ORIGINAL":"✓"}
                  </span>
                </div>
                {esCorr&&orig&&(
                  <div style={{fontSize:10,color:"#3B82F6",marginTop:4,paddingLeft:4,borderTop:"1px dashed #BFDBFE",paddingTop:4}}>
                    Antes: {fmtFull(new Date(orig.ts))}{orig.note?` — "${orig.note}"`:""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={exportPDF}
        style={{width:"100%",background:"#0F172A",color:"white",border:"none",borderRadius:12,padding:"15px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
        📄 Exportar informe PDF
      </button>
      <div style={{fontSize:11,color:su,textAlign:"center",marginTop:8,lineHeight:1.5}}>
        El informe incluye todos los eventos incluyendo eliminados y correcciones.<br/>
        Útil para recurrir multas o demostrar cumplimiento normativo.
      </div>
    </div>
  );
}

function LibroKm({dark,prof}){
  const[mats,setMats]=useState(()=>{
    try{const d=JSON.parse(localStorage.getItem(KM_KEY)||"{}");
      const ms=Object.keys(d).filter(k=>k.includes("_")&&!k.startsWith("obs_")).map(k=>k.split("_").slice(1).join("_")).filter(Boolean);
      const uniq=[...new Set(ms)];return uniq.length?uniq:[prof.matricula||""];
    }catch(_){return[prof.matricula||""];}
  });
  const[selMat,setSelMat]=useState(()=>prof.matricula||"");
  const[newMat,setNewMat]=useState("");
  const[addingMat,setAddingMat]=useState(false);
  const[selMes,setSelMes]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;});
  const[data,setData]=useState(()=>{try{return JSON.parse(localStorage.getItem(KM_KEY)||"{}");}catch(_){return{};}});
  const bg=dark?"#0F172A":"#F0F4F8",card=dark?"#1E293B":"white",tx=dark?"#F1F5F9":"#0F172A",su=dark?"#94A3B8":"#64748B";

  function save(key,field,val){const next={...data,[key]:{...(data[key]||{}),[field]:val}};setData(next);try{localStorage.setItem(KM_KEY,JSON.stringify(next));}catch(_){}}

  const[y,m]=selMes.split("-").map(Number);
  const days=Array.from({length:new Date(y,m,0).getDate()},(_,i)=>{
    const dt=new Date(y,m-1,i+1);const k=`${dayKey(dt)}_${selMat}`;
    const d2=data[k]||{};const km=d2.ini&&d2.fin?Math.max(0,parseInt(d2.fin)-parseInt(d2.ini)):null;
    return{dt,k,km,ini:d2.ini||"",fin:d2.fin||""};
  });
  const total=days.reduce((a,d)=>a+(d.km||0),0);
  const obsKey=`obs_${selMes}_${selMat}`;
  const obs=data[obsKey]?.v||"";
  const mnombre=new Date(y,m-1,1).toLocaleDateString("es-ES",{month:"long",year:"numeric"});

  function addMat(){
    const nm=newMat.trim().toUpperCase();
    if(!nm||mats.includes(nm))return;
    setMats(p=>[...p,nm]);setSelMat(nm);setNewMat("");setAddingMat(false);
  }

  function waExport(){
    let t=`🛣️ KM — ${mnombre}\n${prof.nombre||""} · ${selMat||"—"}\n${"─".repeat(28)}\n`;
    days.filter(d=>d.ini||d.fin).forEach(d=>{t+=`\n${fmtD(d.dt)} ${d.ini}→${d.fin}${d.km!==null?" ("+d.km.toLocaleString()+" km)":""}`;});
    t+=`\nTOTAL: ${total.toLocaleString()} km`;if(obs)t+=`\nObs: ${obs}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank");
  }

  function pdfExport(){
    const rows=days.filter(d=>d.ini||d.fin).map(d=>`<tr><td>${fmtD(d.dt)}</td><td>${d.ini||"—"}</td><td>${d.fin||"—"}</td><td><b>${d.km!=null?d.km.toLocaleString()+" km":"—"}</b></td></tr>`).join("");
    const w=window.open("","_blank");if(!w)return;
    w.document.write(`<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th{background:#0F172A;color:white;padding:8px}td{border:1px solid #ddd;padding:7px}.t{font-size:18px;font-weight:bold;color:#D97706;margin-top:12px}</style></head><body><h2>Libro KM — ${mnombre}</h2><p>${prof.nombre||""} · <strong>${selMat||"—"}</strong></p><table><tr><th>Fecha</th><th>Inicio</th><th>Fin</th><th>Km</th></tr>${rows}</table><div class=t>Total: ${total.toLocaleString()} km</div>${obs?"<p>Obs: "+obs+"</p>":""}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  return(
    <div style={{padding:"14px 14px 80px",background:bg,minHeight:"60vh"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:800,color:tx}}>🛣️ LIBRO DE KM</div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={pdfExport} style={{background:"#1E293B",color:"white",border:"none",borderRadius:8,padding:"7px 11px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📄</button>
          <button onClick={waExport} style={{background:"#25D366",color:"white",border:"none",borderRadius:8,padding:"7px 11px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📱</button>
        </div>
      </div>

      {/* Pestañas de matrículas */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:6}}>MATRÍCULA</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {mats.map(mat=>(
            <button key={mat} onClick={()=>setSelMat(mat)}
              style={{background:selMat===mat?"#F59E0B":"#1E293B",color:selMat===mat?"#0F172A":su,
                border:`2px solid ${selMat===mat?"#F59E0B":"#334155"}`,borderRadius:8,
                padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:1}}>
              {mat||"Sin matrícula"}
            </button>
          ))}
          {!addingMat?(
            <button onClick={()=>setAddingMat(true)} style={{background:"transparent",color:"#22C55E",border:"1.5px dashed #22C55E",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>+ Añadir</button>
          ):(
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input value={newMat} onChange={e=>setNewMat(e.target.value.toUpperCase())} placeholder="Ej: 1234ABC"
                onKeyDown={e=>e.key==="Enter"&&addMat()}
                style={{background:card,border:"2px solid #22C55E",borderRadius:8,padding:"5px 10px",fontSize:13,color:tx,width:110,fontFamily:"monospace",outline:"none"}}/>
              <button onClick={addMat} style={{background:"#22C55E",color:"white",border:"none",borderRadius:7,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>✓</button>
              <button onClick={()=>{setAddingMat(false);setNewMat("");}} style={{background:"#334155",color:"white",border:"none",borderRadius:7,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
          )}
        </div>
      </div>

      {/* Selector mes */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={()=>{const d=new Date(y,m-2,1);setSelMes(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}} style={{background:card,border:"1.5px solid #334155",borderRadius:8,padding:"8px 14px",color:tx,cursor:"pointer",fontSize:18}}>‹</button>
        <div style={{flex:1,textAlign:"center",fontSize:13,fontWeight:800,color:tx}}>{mnombre.toUpperCase()}</div>
        <button onClick={()=>{const d=new Date(y,m,1);setSelMes(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}} style={{background:card,border:"1.5px solid #334155",borderRadius:8,padding:"8px 14px",color:tx,cursor:"pointer",fontSize:18}}>›</button>
      </div>

      {total>0&&<div style={{background:"#F59E0B20",border:"1.5px solid #F59E0B50",borderRadius:11,padding:"10px 16px",marginBottom:12,display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:13,color:"#92400E",fontWeight:700}}>Total mes</span>
        <span style={{fontSize:22,fontWeight:800,color:"#F59E0B",fontFamily:"monospace"}}>{total.toLocaleString()} km</span>
      </div>}

      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
        {days.map(({dt,k,km,ini,fin})=>{
          const hoy=sameDay(dt,new Date());
          return(
            <div key={k} style={{background:card,borderRadius:11,padding:"10px 12px",border:`2px solid ${hoy?"#F59E0B":"transparent"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:hoy?800:500,color:hoy?"#F59E0B":tx}}>{fmtD(dt)}{hoy?" · HOY":""}</span>
                {km!==null&&<span style={{fontSize:14,fontWeight:800,color:"#22C55E",fontFamily:"monospace"}}>{km.toLocaleString()} km</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 16px 1fr",gap:5,alignItems:"center"}}>
                <input value={ini} onChange={e=>save(k,"ini",e.target.value)} placeholder="Inicio km"
                  style={{background:dark?"#0F172A":"#F1F5F9",border:"1.5px solid #475569",borderRadius:7,padding:"8px 10px",fontSize:18,color:tx,outline:"none",fontFamily:"monospace",width:"100%"}}/>
                <span style={{textAlign:"center",color:su,fontSize:12}}>→</span>
                <input value={fin} onChange={e=>save(k,"fin",e.target.value)} placeholder="Fin km"
                  style={{background:dark?"#0F172A":"#F1F5F9",border:"1.5px solid #475569",borderRadius:7,padding:"8px 10px",fontSize:18,color:tx,outline:"none",fontFamily:"monospace",width:"100%"}}/>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{background:card,borderRadius:11,padding:"12px"}}>
        <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:6}}>📝 OBSERVACIONES DEL MES</div>
        <textarea value={obs} onChange={e=>{const next={...data,[obsKey]:{v:e.target.value}};setData(next);try{localStorage.setItem(KM_KEY,JSON.stringify(next));}catch(_){}}}
          placeholder="Incidencias, cambios de vehículo..." rows={3}
          style={{width:"100%",background:dark?"#0F172A":"#F8FAFC",border:"1.5px solid #334155",borderRadius:8,padding:"9px",fontSize:14,color:tx,outline:"none",resize:"vertical"}}/>
      </div>
    </div>
  );
}
const s={
  app:{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Outfit',sans-serif",maxWidth:1400,margin:"0 auto"},
  splash:{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0F172A"},
  hdr:{background:"#0F172A",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:100,boxShadow:"0 6px 18px rgba(2,6,23,.35)",overflow:"hidden",minWidth:0},
  hT:{fontSize:17,fontWeight:800,color:"#F8FAFC",letterSpacing:1.5},hS:{fontSize:12,color:"#475569",marginTop:2},
  hTm:{fontSize:22,fontWeight:700,color:"#F59E0B",fontFamily:"'JetBrains Mono',monospace",lineHeight:1},hD:{fontSize:12,color:"#64748B",marginTop:2},
  nav:{background:"#111B2D",display:"flex",borderBottom:"1px solid #334155",position:"sticky",top:56,zIndex:99,paddingBottom:2},
  navBtn:{flex:1,background:"transparent",border:"none",padding:"11px 3px 9px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"color .15s",position:"relative",cursor:"pointer"},
  navLine:{position:"absolute",bottom:0,left:"15%",right:"15%",height:3,background:"#F59E0B",borderRadius:"2px 2px 0 0"},
  main:{minHeight:"calc(100vh - 108px)"},page:{padding:"16px 16px 90px"},
  live:{background:"#1E293B",borderRadius:16,padding:"18px",marginBottom:12,boxShadow:"0 8px 24px rgba(2,6,23,.18)",border:"1px solid rgba(148,163,184,.15)"},
  finBtn:{width:"100%",border:"none",borderRadius:13,padding:"16px",fontSize:17,fontWeight:800,color:"white",letterSpacing:.3},
  evBtn:{borderRadius:13,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:5,boxShadow:"0 3px 10px rgba(15,23,42,.08)",minHeight:80,transition:"all .12s"},
  secLbl:{fontSize:13,fontWeight:800,color:"#334155",letterSpacing:.5,display:"block"},
  shareBtn:{background:"#F8FAFC",border:"1.5px solid #DBE4EE",borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:700,color:"#334155",cursor:"pointer"},
  logCard:{background:"white",borderRadius:13,padding:"14px 15px",boxShadow:"0 4px 14px rgba(15,23,42,.06)",border:"1px solid #E2E8F0"},
  icnBtn:{background:"#F8FAFC",border:"1.5px solid #DBE4EE",borderRadius:8,padding:"6px 10px",fontSize:15,color:"#64748B",lineHeight:1,cursor:"pointer"},
  searchIn:{width:"100%",background:"white",border:"2px solid #E2E8F0",borderRadius:12,padding:"14px 44px 14px 16px",fontSize:16,outline:"none"},
  clrBtn:{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#94A3B8",fontSize:20,cursor:"pointer"},
  backBtn:{background:"none",border:"none",color:"#64748B",fontSize:15,fontWeight:700,padding:"0 0 14px 0",cursor:"pointer"},
  dayCard:{width:"100%",background:"white",border:"1px solid #E2E8F0",borderRadius:14,padding:"16px 16px",marginBottom:9,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 3px 10px rgba(15,23,42,.06)",textAlign:"left",cursor:"pointer"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)",padding:"16px"},
  sheet:{background:"white",borderRadius:"16px",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"},
  shHd:{padding:"16px 18px 13px",display:"flex",alignItems:"center",gap:12,position:"relative"},
  shT:{fontSize:16,fontWeight:800,letterSpacing:.5},shS:{fontSize:12,color:"#94A3B8",marginTop:2,fontFamily:"'JetBrains Mono',monospace"},
  shBody:{padding:"14px 18px 36px"},
  xBtn:{position:"absolute",right:14,top:13,background:"#F1F5F9",border:"1px solid #E2E8F0",borderRadius:8,width:32,height:32,fontSize:14,color:"#64748B",cursor:"pointer"},
  fLbl:{fontSize:13,fontWeight:700,color:"#64748B",letterSpacing:.5,marginBottom:7,display:"block"},
  tArea:{width:"100%",background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:10,padding:"12px 13px",fontSize:16,lineHeight:1.5},
  tIn:{width:"100%",background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:10,padding:"12px 13px",fontSize:16},
  photoBtn:{width:"100%",border:"2px solid",borderRadius:10,padding:"13px 12px",fontSize:15,fontWeight:700,marginTop:10,textAlign:"center",cursor:"pointer"},
  confBtn:{width:"100%",color:"white",border:"none",borderRadius:13,padding:"16px",fontSize:17,fontWeight:800,marginTop:12,letterSpacing:.3},
  toast:{position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",background:"#1E293B",color:"white",padding:"13px 24px",borderRadius:13,fontSize:14,fontWeight:700,zIndex:999,boxShadow:"0 8px 24px rgba(2,6,23,.35)"},
};

// ─────────────────────────────────────────────────────────────
//  TIMELINE DE SERVICIOS — subtab en RESUMEN
// ─────────────────────────────────────────────────────────────
function ServiciosTimelineView({uid}){
  const[servicios,setServicios]=useState([]);
  const[stops,setStops]=useState({});
  const[evidencias,setEvidencias]=useState({});
  const[loading,setLoading]=useState(true);
  const[filtro,setFiltro]=useState("todos");
  const[expandido,setExpandido]=useState({});

  const bg="#0F172A",card="#1E293B",tx="#F1F5F9",su="#64748B";

  useEffect(()=>{
    if(!uid){setLoading(false);return;}
    async function cargar(){
      try{
        const sr=await sbFetch(buildConductorOwnServiciosQuery(uid,{limit:50}));
        const svs=await sr.json();
        const svsArr=Array.isArray(svs)?svs:[];
        setServicios(svsArr);
        if(svsArr.length){
          const ids=svsArr.map(s=>s.id).join(",");
          const str=await sbFetch(`/rest/v1/stops?servicio_id=in.(${ids})&order=servicio_id.asc,orden.asc`);
          const stps=await str.json();
          const stopsMap={};
          (Array.isArray(stps)?stps:[]).forEach(st=>{
            if(!stopsMap[st.servicio_id])stopsMap[st.servicio_id]=[];
            stopsMap[st.servicio_id].push(st);
          });
          setStops(stopsMap);
          const stopIds=(Array.isArray(stps)?stps:[]).map(s=>s.id).join(",");
          if(stopIds){
            const evr=await sbFetch(`/rest/v1/evidencias?stop_id=in.(${stopIds})&order=stop_id.asc,created_at.asc`);
            const evs=await evr.json();
            setEvidencias(groupDocumentsByStop(evs));
          }
        }
      }catch(e){console.warn("ServiciosTimelineView:",e);}
      finally{setLoading(false);}
    }
    cargar();
  },[uid]);

  const filtrados=servicios.filter(sv=>{
    if(filtro==="activos")return SERVICIO_ESTADOS_ACTIVOS.includes(sv.estado);
    if(filtro==="completados")return sv.estado==="completado";
    return true;
  });

  const porDia=filtrados.reduce((acc,sv)=>{
    const fecha=new Date(sv.fecha_inicio||sv.created_at);
    const key=fecha.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});
    if(!acc[key])acc[key]=[];
    acc[key].push(sv);
    return acc;
  },{});

  const dias=Object.keys(porDia);

  if(loading)return<div style={{padding:40,textAlign:"center",color:su,fontSize:13}}>Cargando servicios...</div>;

  if(!servicios.length)return(
    <div style={{padding:"40px 20px",textAlign:"center",background:bg,minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:48,marginBottom:16}}>🚛</div>
      <div style={{fontSize:16,fontWeight:800,color:tx,marginBottom:8}}>Sin servicios todavía</div>
      <div style={{fontSize:13,color:su,lineHeight:1.6}}>Crea un servicio desde la pestaña<br/>📦 SERVICIO y aparecerá aquí.</div>
    </div>
  );

  return(
    <div style={{background:bg,minHeight:"60vh",paddingBottom:80}}>
      <div style={{display:"flex",gap:8,padding:"12px 14px",borderBottom:"1px solid #1E293B",position:"sticky",top:148,zIndex:90,background:bg}}>
        {[{id:"todos",l:"Todos"},{id:"activos",l:"Activos"},{id:"completados",l:"Completados"}].map(f=>(
          <button key={f.id} onClick={()=>setFiltro(f.id)}
            style={{flex:1,background:filtro===f.id?"#F59E0B20":"transparent",border:`1.5px solid ${filtro===f.id?"#F59E0B":"#334155"}`,borderRadius:9,padding:"7px 4px",fontSize:12,fontWeight:700,color:filtro===f.id?"#F59E0B":su,cursor:"pointer"}}>
            {f.l}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,padding:"12px 14px"}}>
        {[
          {l:"Total",v:servicios.length,c:tx},
          {l:"Activos",v:servicios.filter(s=>SERVICIO_ESTADOS_ACTIVOS.includes(s.estado)).length,c:"#F59E0B"},
          {l:"Completados",v:servicios.filter(s=>s.estado==="completado").length,c:"#22C55E"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:card,borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:10,color:su,fontWeight:700,marginTop:2}}>{l.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div style={{padding:"0 14px"}}>
        {dias.length===0?(
          <div style={{textAlign:"center",padding:"40px 0",color:su,fontSize:13}}>No hay servicios con este filtro</div>
        ):dias.map(dia=>(
          <div key={dia} style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:4}}>
              <div style={{height:1,flex:1,background:"#1E293B"}}/>
              <span style={{fontSize:11,color:su,fontWeight:700,letterSpacing:.5,textTransform:"capitalize"}}>{dia}</span>
              <div style={{height:1,flex:1,background:"#1E293B"}}/>
            </div>
            {porDia[dia].map(sv=>{
              const svStops=stops[sv.id]||[];
              const completados=countCompletedStops(svStops);
              const totalEvs=svStops.reduce((a,st)=>(evidencias[st.id]||[]).length+a,0);
              const isOpen=expandido[sv.id];
              const color=ESTADO_COLOR[sv.estado]||su;
              const operationalStatus=getOperationalStatus({service:sv,stops:svStops,evidencias});
              const operationalMeta=OPERATIONAL_STATUS_META[operationalStatus];
              const lastActivity=getLastServiceActivity({service:sv,stops:svStops,evidencias});
              const attention=needsAttention({service:sv,stops:svStops,evidencias,lastActivity});
              const attentionReason=attention?getAttentionReason({service:sv,stops:svStops,evidencias,lastActivity}):"";
              const refVisible=getServiceNumber(sv);
              const clienteVisible=getServiceClient(sv);
              const epR=resolveServiceRouteEndpoints(sv,svStops);
              const routeFrom=epR.origen;
              const routeTo=epR.destino;
              let duracion=null;
              if(sv.estado==="completado"&&sv.fecha_inicio){
                const lastStop=svStops.filter(s=>s.hora_salida_real).sort((a,b)=>new Date(b.hora_salida_real)-new Date(a.hora_salida_real))[0];
                if(lastStop?.hora_salida_real){
                  const mins=Math.round((new Date(lastStop.hora_salida_real)-new Date(sv.fecha_inicio))/60000);
                  duracion=fmtDur(mins);
                }
              }
              return(
                <div key={sv.id} style={{marginBottom:10}}>
                  <button onClick={()=>setExpandido(prev=>({...prev,[sv.id]:!prev[sv.id]}))}
                    style={{width:"100%",background:card,border:`1.5px solid ${isOpen?color+"60":"#334155"}`,borderLeft:`4px solid ${color}`,borderRadius:14,padding:"14px 16px",cursor:"pointer",textAlign:"left",display:"block",boxShadow:attention?"0 0 0 1px rgba(251, 146, 60, 0.45)":"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontSize:16}}>{ESTADO_ICON[sv.estado]||"📋"}</span>
                          <span style={{fontSize:16,fontWeight:800,color:tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{routeFrom} → {routeTo}</span>
                        </div>
                        {attention&&(
                          <div style={{marginBottom:6,textAlign:"left"}}>
                            <span style={{background:"#F59E0B22",color:"#FB923C",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700}}>⚠ Atención requerida</span>
                            {attentionReason&&<div style={{fontSize:10,color:su,marginTop:3,lineHeight:1.3}}>{attentionReason}</div>}
                          </div>
                        )}
                        {refVisible&&<div style={{fontSize:12,color:"#F59E0B",fontWeight:600,marginBottom:4}}>{refVisible}{clienteVisible?` · Cliente: ${clienteVisible}`:""}</div>}
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{background:color+"20",color,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{ESTADO_LABEL[sv.estado]||sv.estado}</span>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
                            <span style={{background:operationalMeta.color+"20",color:operationalMeta.color,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{operationalMeta.icon} {operationalMeta.label.toUpperCase()}</span>
                            <span style={{fontSize:10,color:su,lineHeight:1.2}}>{lastActivity.label}</span>
                          </div>
                          <span style={{fontSize:11,color:su}}>{svStops.length} stops</span>
                          {totalEvs>0&&<span style={{fontSize:11,color:su}}>{totalEvs} docs</span>}
                          {duracion&&<span style={{fontSize:11,color:"#22C55E",fontWeight:600}}>⏱ {duracion}</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,marginLeft:12}}>
                        {svStops.length>0&&<div style={{fontSize:12,fontWeight:800,color:completados===svStops.length?"#22C55E":"#F59E0B"}}>{completados}/{svStops.length}</div>}
                        <span style={{color:su,fontSize:16,display:"inline-block",transform:isOpen?"rotate(90deg)":"none"}}>›</span>
                      </div>
                    </div>
                    {svStops.length>0&&(
                      <div style={{background:"#334155",borderRadius:4,height:4,overflow:"hidden"}}>
                        <div style={{background:sv.estado==="completado"?"#22C55E":"#F59E0B",height:"100%",width:`${(completados/svStops.length)*100}%`,borderRadius:4}}/>
                      </div>
                    )}
                    <div style={{display:"flex",gap:12,marginTop:8}}>
                      {sv.fecha_inicio&&<div style={{fontSize:11,color:su}}><span style={{color:"#22C55E",fontWeight:700}}>▶ </span>{new Date(sv.fecha_inicio).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</div>}
                      {sv.estado==="completado"&&(()=>{
                        const lastStop=svStops.filter(s=>s.hora_salida_real).sort((a,b)=>new Date(b.hora_salida_real)-new Date(a.hora_salida_real))[0];
                        return lastStop?.hora_salida_real?(<div style={{fontSize:11,color:su}}><span style={{color:"#EF4444",fontWeight:700}}>■ </span>{new Date(lastStop.hora_salida_real).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</div>):null;
                      })()}
                    </div>
                  </button>
                  {isOpen&&svStops.length>0&&(
                    <div style={{background:"#0D1420",border:"1.5px solid #1E293B",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"8px 12px 12px"}}>
                      {svStops.map((stop,i)=>{
                        const evs=evidencias[stop.id]||[];
                        const colorStop=STOP_COLOR[stop.tipo]||"#06B6D4";
                        const estadoIcon=stop.estado==="completado"?"✅":stop.estado==="llegado"?"📍":"○";
                        return(
                          <div key={stop.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:i<svStops.length-1?"1px solid #1E293B30":"none"}}>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,width:24}}>
                              <div style={{fontSize:14,lineHeight:1}}>{estadoIcon}</div>
                              {i<svStops.length-1&&<div style={{width:2,flex:1,background:"#334155",margin:"4px 0",minHeight:12}}/>}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:13,fontWeight:700,color:stop.estado==="completado"?su:tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {STOP_ICON[stop.tipo]||"📍"} {stop.nombre}
                                  </div>
                                  <div style={{fontSize:10,color:colorStop,fontWeight:600,marginTop:1}}>{stop.tipo.replace("_"," ").toUpperCase()}</div>
                                  {(() => {
                                    const notaTxt = formatStopNotesForDisplay(stop.notas);
                                    return notaTxt ? (
                                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>📝 {notaTxt}</div>
                                    ) : null;
                                  })()}
                                </div>
                                <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                                  {stop.hora_llegada_real&&<div style={{fontSize:11,color:su,fontFamily:"monospace"}}>{new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</div>}
                                  {stop.hora_llegada_real&&stop.hora_salida_real&&<div style={{fontSize:10,color:"#F59E0B",fontWeight:600,marginTop:1}}>{fmtDur(Math.round((new Date(stop.hora_salida_real)-new Date(stop.hora_llegada_real))/60000))}</div>}
                                </div>
                              </div>
                              {evs.length>0&&(
                                <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                                  {evs.map(ev=>(
                                    <span key={ev.id} style={{background:{cmr:"#0EA5E920",foto:"#22C55E20",incidencia:"#EF444420"}[ev.tipo]||"#33415530",color:{cmr:"#0EA5E9",foto:"#22C55E",incidencia:"#EF4444"}[ev.tipo]||su,borderRadius:5,padding:"2px 6px",fontSize:10,fontWeight:700}}>
                                      {{cmr:"📄",foto:"📸",incidencia:"⚠️"}[ev.tipo]||"📎"} {ev.tipo==="cmr"&&ev.datos?.num_cmr?ev.datos.num_cmr:ev.tipo.toUpperCase()}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
//  HOOK — SERVICIO ACTIVO
// ─────────────────────────────────────────────────────────────
const EMPTY_DRIVER_VIEW={servicio:null,stops:[],siguienteServicio:null,siguientesStops:[]};

function useServicioActivo(uid,norma=null,showToast=null,conductorNombre=null){
  const[driverView,setDriverView]=useState(EMPTY_DRIVER_VIEW);
  const{servicio,stops,siguienteServicio,siguientesStops}=driverView;
  const[loading,setLoading]=useState(true);
  const emptyStopsRetryRef=useRef(0);
  const emptyStopsRetryTimerRef=useRef(null);
  const loadGenRef=useRef(0);
  const driverViewRef=useRef(EMPTY_DRIVER_VIEW);
  useEffect(()=>{driverViewRef.current=driverView;},[driverView]);
  const patchDriverView=useCallback((patch)=>{
    setDriverView((prev)=>{
      const next=typeof patch==="function"?patch(prev):{...prev,...patch};
      driverViewRef.current=next;
      return next;
    });
  },[]);
  const cargar=useCallback(async()=>{
    if(!uid){setLoading(false);return;}
    const gen=++loadGenRef.current;
    try{
      const resolved=await resolveDriverActiveServiceAndStops(uid);
      if(gen!==loadGenRef.current)return;
      const prevView=driverViewRef.current;
      const merged=mergeDriverActiveViewFromResolution(prevView,resolved);
      console.log("[OP1] useServicioActivo servicio query",{
        uid,
        status:merged?.servicio?200:204,
        servicioId:merged?.servicio?.id||null,
        estado:merged?.servicio?.estado||null,
        resolvedId:resolved?.servicio?.id||null,
        resolvedEstado:resolved?.servicio?.estado||null,
        pinned:!!(prevView?.servicio?.id&&resolved?.servicio?.id&&prevView.servicio.id!==resolved.servicio.id),
        stopRows:Array.isArray(merged?.stops)?merged.stops.length:0,
      });
      if(merged?.servicio?.id){
        driverViewRef.current=merged;
        setDriverView(merged);
        const stopsRows=Array.isArray(merged.stops)?merged.stops:[];
        if(stopsRows.length>0){
          emptyStopsRetryRef.current=0;
          if(emptyStopsRetryTimerRef.current){
            clearTimeout(emptyStopsRetryTimerRef.current);
            emptyStopsRetryTimerRef.current=null;
          }
        }else{
          const retryN=emptyStopsRetryRef.current+1;
          emptyStopsRetryRef.current=retryN;
          if(retryN<=6){
            if(emptyStopsRetryTimerRef.current)clearTimeout(emptyStopsRetryTimerRef.current);
            emptyStopsRetryTimerRef.current=setTimeout(()=>{cargar();},3000);
            console.warn("[OP1] servicio sin paradas, reintento",{
              servicioId:merged?.servicio?.id||null,
              estado:merged?.servicio?.estado||null,
              retry:retryN,
            });
          }
        }
      }else{
        driverViewRef.current=EMPTY_DRIVER_VIEW;
        setDriverView(EMPTY_DRIVER_VIEW);
      }
    }catch(e){console.warn("useServicioActivo:",e);}
    finally{
      if(gen===loadGenRef.current)setLoading(false);
    }
  },[uid]);
  useEffect(()=>{cargar();},[cargar]);
  useEffect(()=>{
    function onRecarga(){cargar();}
    const onVisible=()=>{if(document.visibilityState==="visible")cargar();};
    const pollId=setInterval(()=>{cargar();},30000);
    window.addEventListener("cuaderno-recargar-servicio",onRecarga);
    window.addEventListener("focus",onRecarga);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      if(emptyStopsRetryTimerRef.current){
        clearTimeout(emptyStopsRetryTimerRef.current);
        emptyStopsRetryTimerRef.current=null;
      }
      clearInterval(pollId);
      window.removeEventListener("cuaderno-recargar-servicio",onRecarga);
      window.removeEventListener("focus",onRecarga);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[cargar]);
  const completados=countCompletedStops(stops);
  async function marcarLlegado(stopId){
    const now=new Date().toISOString();
    console.log("[TL1] click entrada_muelle",{
      servicioId:servicio?.id||null,
      stopId,
      now,
      estadoServicio:servicio?.estado||null,
    });
    const res=await sbFetch(`/rest/v1/stops?id=eq.${stopId}`,{method:"PATCH",body:JSON.stringify({estado:"llegado",hora_llegada_real:now})});
    console.log("[TL1] patch entrada_muelle",{
      ok:res.ok,
      status:res.status,
      servicioId:servicio?.id||null,
      stopId,
      payload:{estado:"llegado",hora_llegada_real:now},
    });
    if(!res.ok){
      let detail="";
      try{detail=await res.text();}catch(_){}
      console.warn("[OP3] patch entrada_muelle failed",{
        status:res.status,
        detail:String(detail||"").slice(0,300),
        servicioId:servicio?.id||null,
        stopId,
      });
      throw new Error("No se pudo guardar la entrada en muelle");
    }
    try{
      const verify=await sbFetch(`/rest/v1/stops?id=eq.${stopId}&select=id,servicio_id,estado,hora_llegada_real,hora_salida_real&limit=1`);
      const verifyRows=verify.ok?await verify.json():null;
      console.log("[TL1] verify entrada_muelle",{
        ok:verify.ok,
        status:verify.status,
        row:verifyRows?.[0]||null,
      });
    }catch(e){
      console.warn("[TL1] verify entrada_muelle failed",e?.message||e);
    }
    let updated=stops.map(s=>s.id===stopId?{...s,estado:"llegado",hora_llegada_real:now}:s);
    const op=await registerDriverOperationalPoint({uid,servicio,stops:updated,norma,eventType:"entrada_muelle",stopId,showToast});
    let nextServicio=servicio;
    if(op?.referencia)nextServicio={...servicio,referencia:op.referencia};
    const geo=geoFromGpsPoint(op?.point);
    if(geo){
      const stop=updated.find(s=>s.id===stopId);
      const notas=mergeStopOperacionMeta(stop?.notas,{entrada_geo:geo});
      await sbFetch(`/rest/v1/stops?id=eq.${stopId}`,{method:"PATCH",body:JSON.stringify({notas})});
      updated=updated.map(s=>s.id===stopId?{...s,notas}:s);
    }
    patchDriverView({stops:updated,servicio:nextServicio});
    window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
  }
  async function marcarCompletado(stopId){
    const now=new Date().toISOString();
    console.log("[TL1] click salida_muelle",{
      servicioId:servicio?.id||null,
      stopId,
      now,
      estadoServicio:servicio?.estado||null,
    });
    const res=await sbFetch(`/rest/v1/stops?id=eq.${stopId}`,{method:"PATCH",body:JSON.stringify({estado:"completado",hora_salida_real:now})});
    console.log("[TL1] patch salida_muelle",{
      ok:res.ok,
      status:res.status,
      servicioId:servicio?.id||null,
      stopId,
      payload:{estado:"completado",hora_salida_real:now},
    });
    if(!res.ok){
      let detail="";
      try{detail=await res.text();}catch(_){}
      console.warn("[OP3] patch salida_muelle failed",{
        status:res.status,
        detail:String(detail||"").slice(0,300),
        servicioId:servicio?.id||null,
        stopId,
      });
      throw new Error("No se pudo guardar la salida de muelle");
    }
    try{
      const verify=await sbFetch(`/rest/v1/stops?id=eq.${stopId}&select=id,servicio_id,estado,hora_llegada_real,hora_salida_real&limit=1`);
      const verifyRows=verify.ok?await verify.json():null;
      console.log("[TL1] verify salida_muelle",{
        ok:verify.ok,
        status:verify.status,
        row:verifyRows?.[0]||null,
      });
    }catch(e){
      console.warn("[TL1] verify salida_muelle failed",e?.message||e);
    }
    let updated=stops.map(s=>s.id===stopId?{...s,estado:"completado",hora_salida_real:now}:s);

    // ── Registrar automáticamente en tacógrafo ──
    const stop=stops.find(s=>s.id===stopId);
    if(stop&&uid&&STOP_TIPOS_CON_AUTOTACO.includes(stop.tipo)){
      const tipoEv=STOP_TIPO_TO_INICIO_EV[stop.tipo];
      const finEv=STOP_TIPO_TO_FIN_EV[stop.tipo];
      const inicioMs=getInicioOperacionMs(stop);
      const llegada=inicioMs?new Date(inicioMs).toISOString():stop.hora_llegada_real||now;
      const rows=[
        !inicioMs&&{id:Date.now()+Math.random(),user_id:uid,type:tipoEv,ts:llegada,note:`Auto: ${stop.nombre}`,location:stop.direccion||stop.nombre||null,late:false},
        {id:Date.now()+Math.random()+1,user_id:uid,type:finEv,ts:now,note:`Auto: ${stop.nombre}`,location:stop.direccion||stop.nombre||null,late:false},
      ].filter(Boolean);
      sbUpsert("entries",rows).catch(()=>{});
    }

    const op=await registerDriverOperationalPoint({uid,servicio,stops:updated,norma,eventType:"salida_muelle",stopId,showToast});
    let nextServicio=servicio;
    if(op?.referencia)nextServicio={...servicio,referencia:op.referencia};
    const geoSalida=geoFromGpsPoint(op?.point);
    if(geoSalida){
      const stop=updated.find(s=>s.id===stopId);
      const notas=mergeStopOperacionMeta(stop?.notas,{salida_geo:geoSalida});
      await sbFetch(`/rest/v1/stops?id=eq.${stopId}`,{method:"PATCH",body:JSON.stringify({notas})});
      updated=updated.map(s=>s.id===stopId?{...s,notas}:s);
    }

    if(updated.filter(s=>s.estado==="pendiente").length===0){
      const doneRes=await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`,{method:"PATCH",body:JSON.stringify({estado:"completado"})});
      if(!doneRes.ok)throw new Error("No se pudo completar el servicio");
      nextServicio={...nextServicio,estado:"completado"};
    }
    patchDriverView({stops:updated,servicio:nextServicio});
    window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
  }
  async function iniciarServicio(servicioId){
    if(servicio?.id&&servicioId!==servicio.id){
      console.warn("[OP1] iniciarServicio id mismatch",{uiId:servicio.id,requestedId:servicioId});
      throw new Error("El servicio en pantalla no coincide. Espera a cerrar el expediente o recarga.");
    }
    const fecha_inicio=new Date().toISOString();
    await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`,{method:"PATCH",body:JSON.stringify({estado:"en_curso",fecha_inicio})});
    const started={...(servicio||{}),id:servicioId,estado:"en_curso",fecha_inicio};
    let nextServicio={...started};
    const op=await registerDriverOperationalPoint({uid,servicio:started,stops,norma,eventType:"inicio_servicio",showToast});
    if(op?.referencia)nextServicio={...nextServicio,referencia:op.referencia};
    patchDriverView({servicio:nextServicio});
    window.dispatchEvent(new Event("cuaderno-recargar-servicio"));
  }
  async function iniciarViajeOperacional(servicioId){
    if(!servicio||servicio.id!==servicioId)return;
    if(getOperationalTripStartedAt(servicio))return;
    const referencia=mergeReferenciaOperacional(servicio.referencia||null,{operational_trip_started_at:new Date().toISOString()});
    await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`,{method:"PATCH",body:JSON.stringify({referencia})});
    patchDriverView((prev)=>({...prev,servicio:prev.servicio?{...prev.servicio,referencia}:prev.servicio}));
    window.dispatchEvent(new Event("cuaderno-recargar-servicio"));
  }
  async function marcarInicioOperacionStop(stopId){
    const stop=stops.find(s=>s.id===stopId);
    if(!stop||getInicioOperacionMs(stop))return;
    const now=new Date().toISOString();
    const notas=mergeStopOperacionMeta(stop.notas||"",{inicio_operacion_at:now});
    await sbFetch(`/rest/v1/stops?id=eq.${stopId}`,{method:"PATCH",body:JSON.stringify({notas})});
    const updated=stops.map(s=>s.id===stopId?{...s,notas}:s);
    if(uid&&STOP_TIPOS_CON_AUTOTACO.includes(stop.tipo)){
      const tipoEv=STOP_TIPO_TO_INICIO_EV[stop.tipo];
      sbUpsert("entries",[{id:Date.now()+Math.random(),user_id:uid,type:tipoEv,ts:now,note:`Manual: ${stop.nombre}`,location:stop.direccion||stop.nombre||null,late:false}]).catch(()=>{});
    }
    const op=await registerDriverOperationalPoint({uid,servicio,stops:updated,norma,eventType:"inicio_operacion_stop",stopId,showToast});
    let nextServicio=servicio;
    if(op?.referencia)nextServicio={...servicio,referencia:op.referencia};
    patchDriverView({stops:updated,servicio:nextServicio});
    window.dispatchEvent(new Event("cuaderno-recargar-servicio"));
  }
  async function cerrarExpediente({ comentario, firmaCanvas }) {
    if (!servicio?.id) throw new Error("Sin servicio activo");
    await cerrarExpedienteServicio({
      servicio,
      comentario,
      firmaCanvas,
      conductorId: uid,
      conductorNombre: conductorNombre || null,
    });
    setDriverView(EMPTY_DRIVER_VIEW);
    driverViewRef.current=EMPTY_DRIVER_VIEW;
    await cargar();
    window.dispatchEvent(new Event("cuaderno-recargar-servicio"));
  }
  return{
    servicio,
    stops,
    siguienteServicio,
    siguientesStops,
    completados,
    loading,
    marcarLlegado,
    marcarCompletado,
    iniciarServicio,
    iniciarViajeOperacional,
    marcarInicioOperacionStop,
    cerrarExpediente,
    recargar:cargar,
  };
}

// ─────────────────────────────────────────────────────────────
//  HOOK — GEOCODIFICACIÓN CON DEBOUNCE
// ─────────────────────────────────────────────────────────────
function useGeoStop(query){
  const[result,setResult]=useState(null);
  const[status,setStatus]=useState("idle");
  const timerRef=useRef(null);

  useEffect(()=>{
    const q=(query||"").trim();
    if(q.length<3){setResult(null);setStatus("idle");return;}
    const local=localFind(q);
    if(local){setResult(local);setStatus("ok");return;}
    clearTimeout(timerRef.current);
    setStatus("loading");
    timerRef.current=setTimeout(async()=>{
      try{const res=await geocode(q);setResult(res);setStatus("ok");}
      catch(_){setResult(null);setStatus("error");}
    },800);
    return()=>clearTimeout(timerRef.current);
  },[query]);

  return{result,status};
}

// ─────────────────────────────────────────────────────────────
//  STOP FORM ROW — con geocodificación
// ─────────────────────────────────────────────────────────────
function StopFormRow({stop,index,total,onChange,onRemove,onMoveUp,onMoveDown}){
  const bg="#0F172A",tx="#F1F5F9",su="#64748B";
  const iStyle={width:"100%",background:bg,border:"1.5px solid #334155",borderRadius:9,padding:"10px 12px",fontSize:15,color:tx,outline:"none",boxSizing:"border-box"};
  const geoQuery=stop.direccion.trim()||stop.nombre.trim();
  const{result:geo,status:geoStatus}=useGeoStop(geoQuery);
  const color=STOP_COLOR[stop.tipo]||"#06B6D4";

  useEffect(()=>{
    if(geo){onChange(index,"lat",geo.lat);onChange(index,"lon",geo.lon);}
    else{onChange(index,"lat",null);onChange(index,"lon",null);}
  },[geo]);

  return(
    <div style={{background:bg,borderRadius:12,padding:"12px 13px",marginBottom:10,border:`1.5px solid ${stop.lat?"#22C55E30":"#334155"}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{background:"#F59E0B",color:"#0F172A",borderRadius:6,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{index+1}</span>
          <select value={stop.tipo} onChange={e=>onChange(index,"tipo",e.target.value)} style={{...iStyle,width:"auto",padding:"5px 8px",fontSize:13,color}}>
            {STOP_TIPOS_FORM.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {onMoveUp&&<button onClick={onMoveUp} style={{background:"#334155",border:"none",borderRadius:5,width:22,height:22,color:tx,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button>}
          {onMoveDown&&<button onClick={onMoveDown} style={{background:"#334155",border:"none",borderRadius:5,width:22,height:22,color:tx,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>↓</button>}
          {total>1&&<button onClick={()=>onRemove(index)} style={{background:"transparent",border:"none",color:"#EF4444",fontSize:18,cursor:"pointer",padding:"4px 6px"}}>✕</button>}
        </div>
      </div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:4}}>LUGAR</div>
        <input value={stop.nombre} onChange={e=>onChange(index,"nombre",e.target.value)} placeholder="Ej: Mercamadrid, Nave 7" style={iStyle}/></div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:4}}>DIRECCIÓN (opcional)</div>
        <input value={stop.direccion} onChange={e=>onChange(index,"direccion",e.target.value)} placeholder="Ej: Calle Motores 12, Madrid" style={iStyle}/></div>
      <div style={{display:"flex",alignItems:"center",gap:6,minHeight:18,marginBottom:8}}>
        {geoStatus==="loading"&&geoQuery.length>=3&&<span style={{fontSize:11,color:su}}>🔍 Buscando coordenadas...</span>}
        {geoStatus==="ok"&&geo&&<span style={{fontSize:11,color:"#22C55E",fontWeight:600}}>✓ {geo.name} — navegación lista</span>}
        {geoStatus==="error"&&geoQuery.length>=3&&<span style={{fontSize:11,color:"#F97316"}}>⚠ No encontrado — se usará dirección escrita</span>}
        {geoStatus==="idle"&&<span style={{fontSize:11,color:"#334155"}}>Escribe para activar navegación GPS</span>}
      </div>
      <div><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:4}}>NOTAS (opcional)</div>
        <input value={stop.notas||""} onChange={e=>onChange(index,"notas",e.target.value)} placeholder="Ej: Puerta 3, horario 8-14h" style={iStyle}/></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  CREAR SERVICIO PROPIO — con pasos y geocodificación
// ─────────────────────────────────────────────────────────────
function CrearServicioModal({uid,conductorNombre="Conductor",onClose,onCreado}){
  const[origen,setOrigen]=useState("");
  const[destino,setDestino]=useState("");
  const[ref,setRef]=useState("");
  const[cliente,setCliente]=useState("");
  const[refCliente,setRefCliente]=useState("");
  const[fechaInicio,setFechaInicio]=useState(()=>toDTL(new Date()));
  const[stops,setStops]=useState([{orden:1,tipo:"carga",nombre:"",direccion:"",notas:"",lat:null,lon:null},{orden:2,tipo:"descarga",nombre:"",direccion:"",notas:"",lat:null,lon:null}]);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const[paso,setPaso]=useState(1);
  const{isMobile,overlayStyle,modalStyle}=useModalLayout();
  const card="#1E293B",bg="#0F172A",tx="#F1F5F9",su="#64748B";
  const iStyle={width:"100%",background:bg,border:"1.5px solid #334155",borderRadius:9,padding:"11px 13px",fontSize:15,color:tx,outline:"none",boxSizing:"border-box"};

  function changeStop(i,field,val){setStops(prev=>prev.map((s,idx)=>idx===i?{...s,[field]:val}:s));}
  function addStop(){setStops(prev=>[...prev,{orden:prev.length+1,tipo:"descarga",nombre:"",direccion:"",notas:"",lat:null,lon:null}]);}
  function addStopAfter(i){
    setStops(prev=>{
      const arr=[...prev];
      const ordenAntes=arr[i].orden;
      const ordenDespues=arr[i+1]?.orden??ordenAntes+1;
      const nuevoOrden=(ordenAntes+ordenDespues)/2;
      arr.splice(i+1,0,{orden:nuevoOrden,tipo:"carga",nombre:"",direccion:"",notas:"",lat:null,lon:null});
      return arr;
    });
  }
  function moveStop(i,dir){
    setStops(prev=>{
      const arr=[...prev];
      const j=i+dir;
      if(j<0||j>=arr.length)return arr;
      const tmpOrden=arr[i].orden;
      arr[i]={...arr[i],orden:arr[j].orden};
      arr[j]={...arr[j],orden:tmpOrden};
      return [...arr].sort((a,b)=>a.orden-b.orden);
    });
  }
  function removeStop(i){setStops(prev=>prev.filter((_,idx)=>idx!==i));}
  function validarPaso1(){if(!origen.trim()){setError("Escribe el origen");return false;}if(!destino.trim()){setError("Escribe el destino");return false;}setError("");return true;}
  function validarPaso2(){if(stops.some(s=>!s.nombre.trim())){setError("Todas las paradas necesitan un nombre");return false;}setError("");return true;}
  const stopsConGeo=stops.filter(s=>s.lat&&s.lon).length;

  async function guardar(){
    if(!validarPaso2())return;
    setSaving(true);setError("");
    try{
      const fechaIso=new Date(fechaInicio).toISOString();
      const srData=await crearServicioConIdentidad({
        ownershipMode:SERVICIO_OWNERSHIP.AUTONOMO_PRO,
        origen:origen.trim(),
        destino:destino.trim(),
        serviceNumber:ref.trim(),
        cliente:cliente.trim(),
        referenciaCliente:refCliente.trim(),
        fecha_inicio:fechaIso,
        _debugSource:"CrearServicioModal.autonomoPro",
      });
      const sv=Array.isArray(srData)?srData[0]:srData;
      if(!sv?.id)throw new Error("No se pudo crear el servicio");
      await persistServicioStopsTrasCrear({
        servicioId:sv.id,
        stops,
        origen:origen.trim(),
        destino:destino.trim(),
        logTag:"CrearServicioModal",
      });
      const referenciaBoot=await bootstrapOperationalFlowOnConductorAssign({
        servicio:sv,
        conductorId:uid,
        conductorNombre:conductorNombre||"Conductor",
        origen:origen.trim(),
        destino:destino.trim(),
        fechaInicio:fechaIso,
        persist:true,
        dispatchRecarga:false,
      });
      const svFinal={...sv,conductor_id:uid,estado:"asignado",referencia:referenciaBoot||sv.referencia};
      void sendAssignmentPush({conductorId:uid,origen,destino,fechaInicio,servicioId:sv.id});
      onCreado(svFinal);
    }catch(e){setError("Error: "+e.message);}
    finally{setSaving(false);}
  }

  return(
    <div style={overlayStyle} onClick={onClose}>
      <div style={{...modalStyle,background:card}} onClick={e=>e.stopPropagation()}>

        {/* HEADER — sticky */}
        <div style={{padding:"14px 16px 12px",borderBottom:"1px solid #334155",flexShrink:0,background:card}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:16,fontWeight:800,color:"#F59E0B"}}>NUEVO SERVICIO</div>
            <button onClick={onClose} style={{background:"#334155",border:"none",borderRadius:8,width:28,height:28,color:tx,cursor:"pointer",fontSize:14}}>✕</button>
          </div>
          {/* Indicador pasos */}
          <div style={{display:"flex",gap:6}}>
            {[{n:1,l:"Ruta"},{n:2,l:"Paradas"},{n:3,l:"Confirmar"}].map(p=>(
              <div key={p.n} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{width:"100%",height:3,borderRadius:2,background:paso>=p.n?"#F59E0B":"#334155",transition:"background .2s"}}/>
                <span style={{fontSize:10,fontWeight:700,color:paso>=p.n?"#F59E0B":su}}>{p.l.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* BODY — scrollable */}
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"14px 16px"}}>

          {/* PASO 1 */}
          {paso===1&&(<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:5}}>🟢 ORIGEN</div><input value={origen} onChange={e=>setOrigen(e.target.value)} placeholder="Almería" style={iStyle}/></div>
              <div><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:5}}>🔴 DESTINO</div><input value={destino} onChange={e=>setDestino(e.target.value)} placeholder="Bilbao" style={iStyle}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:5}}>SERVICIO</div><input value={ref} onChange={e=>setRef(e.target.value)} placeholder="SRV-0441" style={iStyle}/></div>
              <div><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:5}}>CLIENTE</div><input value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Mercadona" style={iStyle}/></div>
            </div>
            <div style={{marginBottom:14}}><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:5}}>REF CLIENTE (opcional)</div>
              <input value={refCliente} onChange={e=>setRefCliente(e.target.value)} placeholder="PED-8821" style={iStyle}/></div>
            <div style={{marginBottom:14}}><div style={{fontSize:11,color:su,fontWeight:700,marginBottom:5}}>📅 FECHA Y HORA DE SALIDA</div>
              <input type="datetime-local" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)} style={{...iStyle,colorScheme:"dark"}}/></div>
            {error&&<div style={{background:"#450a0a",border:"1px solid #EF4444",borderRadius:9,padding:"10px 13px",fontSize:13,color:"#EF4444",marginBottom:14}}>⚠️ {error}</div>}
          </>)}

          {/* PASO 2 */}
          {paso===2&&(<>
            <div style={{background:"#0D1829",border:"1px solid #1E3A5F",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#3B82F6",lineHeight:1.6}}>
              🗺 Escribe el nombre o dirección. Usa ↑↓ para reordenar o "+ insertar aquí" para añadir en medio.
            </div>
            {stops.map((stop,i)=>(
              <div key={stop.orden}>
                <StopFormRow stop={stop} index={i} total={stops.length} onChange={changeStop} onRemove={removeStop}
                  onMoveUp={i>0?()=>moveStop(i,-1):null} onMoveDown={i<stops.length-1?()=>moveStop(i,1):null}/>
                {i<stops.length-1&&(
                  <button onClick={()=>addStopAfter(i)}
                    style={{width:"100%",background:"transparent",border:"1px dashed #334155",borderRadius:6,padding:"4px",fontSize:11,color:"#3B82F6",cursor:"pointer",marginBottom:4}}>
                    + insertar parada aquí
                  </button>
                )}
              </div>
            ))}
            <button onClick={addStop} style={{width:"100%",background:"transparent",border:"1.5px dashed #334155",borderRadius:10,padding:"11px",fontSize:14,color:"#22C55E",cursor:"pointer",marginBottom:14}}>+ AÑADIR PARADA</button>
            {stops.some(s=>s.nombre.trim())&&(
              <div style={{background:"#0D1829",borderRadius:10,padding:"10px 12px",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:16}}>{stops.filter(s=>s.lat&&s.lon).length===stops.length?"✅":"🔍"}</span>
                <span style={{fontSize:12,color:stops.filter(s=>s.lat&&s.lon).length===stops.length?"#22C55E":su}}>{stops.filter(s=>s.lat&&s.lon).length}/{stops.length} paradas con navegación lista</span>
              </div>
            )}
            {error&&<div style={{background:"#450a0a",border:"1px solid #EF4444",borderRadius:9,padding:"10px 13px",fontSize:13,color:"#EF4444",marginBottom:14}}>⚠️ {error}</div>}
          </>)}

          {/* PASO 3 */}
          {paso===3&&(<>
            <div style={{background:"#0D1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"16px",marginBottom:14}}>
              <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:8}}>RESUMEN DEL SERVICIO</div>
              {ref&&<div style={{fontSize:13,color:"#F59E0B",fontWeight:800,marginBottom:3}}>{ref}</div>}
              {cliente&&<div style={{fontSize:12,color:su,marginBottom:3}}>Cliente: <span style={{color:tx,fontWeight:700}}>{cliente}</span>{refCliente&&<span style={{color:"#94A3B8"}}> · Ref cliente {refCliente}</span>}</div>}
              <div style={{fontSize:18,fontWeight:800,color:tx,marginBottom:4}}>{origen} → {destino}</div>
              <div style={{fontSize:12,color:su}}>Salida: {new Date(fechaInicio).toLocaleString("es-ES",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:10}}>{stops.length} PARADAS</div>
            {stops.map((stop,i)=>{const color=STOP_COLOR[stop.tipo]||"#06B6D4";return(
              <div key={i} style={{background:"#0D1829",border:`1px solid ${stop.lat?"#22C55E30":"#334155"}`,borderRadius:12,padding:"11px 13px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:20,flexShrink:0}}>{STOP_ICON[stop.tipo]||"📍"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:tx}}>{stop.nombre}</div>
                  {stop.direccion&&<div style={{fontSize:12,color:su,marginTop:2}}>{stop.direccion}</div>}
                  {(() => {
                    const notaTxt = formatStopNotesForDisplay(stop.notas);
                    return notaTxt ? (
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>📝 {notaTxt}</div>
                    ) : null;
                  })()}
                  <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
                    <span style={{fontSize:11,color,fontWeight:600}}>{stop.tipo.replace("_"," ").toUpperCase()}</span>
                    {stop.lat?<span style={{fontSize:10,color:"#22C55E",background:"#22C55E15",borderRadius:4,padding:"1px 6px"}}>🗺 GPS listo</span>:<span style={{fontSize:10,color:su,background:"#33415515",borderRadius:4,padding:"1px 6px"}}>Sin GPS</span>}
                  </div>
                </div>
                <span style={{fontSize:14,color:su,fontWeight:800,flexShrink:0}}>{i+1}</span>
              </div>
            );})}
            {error&&<div style={{background:"#450a0a",border:"1px solid #EF4444",borderRadius:9,padding:"10px 13px",fontSize:13,color:"#EF4444",marginBottom:14}}>⚠️ {error}</div>}
          </>)}

        </div>

        {/* FOOTER — sticky, siempre visible */}
        <div style={{padding:"12px 16px",borderTop:"1px solid #334155",flexShrink:0,background:card}}>
          {paso===1&&(
            <button onClick={()=>{if(!origen.trim()){setError("Escribe el origen");return;}if(!destino.trim()){setError("Escribe el destino");return;}setError("");setPaso(2);}}
              style={{width:"100%",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
              SIGUIENTE → PARADAS
            </button>
          )}
          {paso===2&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setError("");setPaso(1);}} style={{background:"#1E293B",color:su,border:"1px solid #334155",borderRadius:12,padding:"13px",fontSize:14,cursor:"pointer"}}>← Atrás</button>
              <button onClick={()=>{if(stops.some(s=>!s.nombre.trim())){setError("Todas las paradas necesitan un nombre");return;}setError("");setPaso(3);}}
                style={{background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:800,cursor:"pointer"}}>REVISAR →</button>
            </div>
          )}
          {paso===3&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setError("");setPaso(2);}} style={{background:"#1E293B",color:su,border:"1px solid #334155",borderRadius:12,padding:"13px",fontSize:14,cursor:"pointer"}}>← Editar</button>
              <button onClick={()=>void guardar()} disabled={saving}
                style={{background:saving?"#334155":"#22C55E",color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:800,cursor:saving?"default":"pointer"}}>
                {saving?"⏳ Guardando...":"✅ CREAR"}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  DOCS POR SERVICIO — vista conductor (premium / compacta)
// ─────────────────────────────────────────────────────────────
function DriverCachedMediaImg({ servicioId, evidenciaId, src, alt, style }) {
  const [display, setDisplay] = useState({ kind: "load" });
  useEffect(() => {
    let revoked = null;
    let cancelled = false;
    if (!src) {
      setDisplay({ kind: "empty" });
      return undefined;
    }
    if (String(src).startsWith("data:")) {
      setDisplay({ kind: "url", url: src });
      return undefined;
    }
    setDisplay({ kind: "load" });
    void (async () => {
      try {
        const got = await getDriverMediaDisplayBlob(servicioId, evidenciaId, src);
        if (cancelled) return;
        if (got?.blob) {
          const u = URL.createObjectURL(got.blob);
          revoked = u;
          setDisplay({ kind: "url", url: u });
        } else {
          setDisplay({ kind: "url", url: src });
        }
      } catch {
        if (!cancelled) setDisplay({ kind: "url", url: src });
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [servicioId, evidenciaId, src]);
  if (display.kind === "load" || display.kind === "empty") {
    const ph = Number.isFinite(Number(style?.height)) ? Number(style.height) : 120;
    const pw = Number.isFinite(Number(style?.width)) ? Number(style.width) : undefined;
    return (
      <div
        style={{
          ...(style || {}),
          background: "rgba(148,163,184,.12)",
          minHeight: ph,
          width: pw ?? style?.width,
          borderRadius: (style && style.borderRadius) || 12,
        }}
      />
    );
  }
  return <img src={display.url} alt={alt || ""} style={style} />;
}

function ConductorAlmacenamientoCard({ showToast }) {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void getConductorStorageStats()
      .then(setStats)
      .catch(() => setStats({ idbBytes: 0, cachedFiles: 0, retentionServices: 0 }));
  };
  useEffect(() => {
    refresh();
  }, []);
  const mb = stats ? formatStorageMb(stats.idbBytes) : "—";
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 16, boxShadow: "0 2px 6px rgba(0,0,0,.05)", marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748B", letterSpacing: 1.5, marginBottom: 10 }}>ALMACENAMIENTO</div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, marginBottom: 8 }}>
        <div>
          <strong>{mb} MB</strong> · caché documental en este dispositivo
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
          Archivos en caché: <strong>{stats?.cachedFiles ?? "—"}</strong>
          {stats?.retentionServices != null ? (
            <span>
              {" "}
              · Servicios en retención local: {stats.retentionServices}
            </span>
          ) : null}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#64748B",
          lineHeight: 1.45,
          marginBottom: 12,
          background: "#F8FAFC",
          borderRadius: 10,
          padding: "10px 12px",
          border: "1px solid #E2E8F0",
        }}
      >
        Los documentos siguen disponibles para la empresa y podrán descargarse de nuevo cuando los necesites. Esto solo borra copias locales en el móvil o tablet.
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await purgeAllConductorLocalMediaCaches();
            showToast?.("Espacio liberado en el dispositivo · los documentos siguen en empresa");
            refresh();
          } catch {
            showToast?.("No se pudo completar la limpieza");
          } finally {
            setBusy(false);
          }
        }}
        style={{
          width: "100%",
          background: "#0EA5E9",
          color: "white",
          border: "none",
          borderRadius: 11,
          padding: "13px",
          fontSize: 14,
          fontWeight: 800,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Liberando…" : "Liberar espacio"}
      </button>
    </div>
  );
}

function bucketServiceDocDate(sv, refDate) {
  const d = new Date(sv.fecha_inicio || sv.created_at);
  const today0 = new Date(refDate);
  today0.setHours(0, 0, 0, 0);
  const y0 = new Date(today0);
  y0.setDate(y0.getDate() - 1);
  const monday = new Date(today0);
  const dow = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  if (sameDay(d, refDate)) return "hoy";
  if (sameDay(d, y0)) return "ayer";
  if (+d >= +monday && +d < +nextMonday) return "semana";
  return "older";
}

function ServicioDocsView({ uid, showToast, onBack }) {
  const [servicios, setServicios] = useState([]);
  const [stops, setStops] = useState({});
  const [evidencias, setEvidencias] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState({});
  const [visorCtx, setVisorCtx] = useState(null);

  const shell = "#0F172A";
  const card = "#1E293B";
  const cardBorder = "rgba(148, 163, 184, 0.12)";
  const tx = "#F8FAFC";
  const su = "#94A3B8";
  const accent = "#3B82F6";
  const TIPO_ICON = { cmr: "📄", foto: "📸", incidencia: "⚠️", qr: "📱", nota: "📝" };
  const TIPO_COLOR = { cmr: "#38BDF8", foto: "#4ADE80", incidencia: "#FB7185", qr: "#C4B5FD", nota: "#94A3B8" };
  const TIPO_LABEL = Object.freeze(
    DOCUMENT_TYPES.reduce((acc, tipo) => {
      acc[tipo] = tipo.toUpperCase();
      return acc;
    }, {}),
  );
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    async function cargar() {
      try {
        const sr = await sbFetch(buildConductorOwnServiciosQuery(uid, { limit: 20 }));
        if (!sr.ok) throw new Error(`servicios HTTP ${sr.status}`);
        const svs = await sr.json();
        const list = Array.isArray(svs) ? svs : [];
        setServicios(list);
        if (!list.length) return;
        syncArchivedServicesFromList(list);
        void runRetentionSweep();
        const ids = list.map((s) => s.id).filter(Boolean).join(",");
        if (!ids) return;
        const str = await sbFetch(`/rest/v1/stops?servicio_id=in.(${ids})&order=servicio_id.asc,orden.asc`);
        if (!str.ok) throw new Error(`stops HTTP ${str.status}`);
        const stps = await str.json();
        const stpsArr = Array.isArray(stps) ? stps : [];
        const stopsMap = {};
        stpsArr.forEach((st) => {
          if (!stopsMap[st.servicio_id]) stopsMap[st.servicio_id] = [];
          stopsMap[st.servicio_id].push(st);
        });
        setStops(stopsMap);
        const stopIds = stpsArr.map((s) => s.id).filter(Boolean);
        if (stopIds.length) {
          const grouped = await fetchEvidenciasGroupedByStop(stopIds, sbFetch);
          setEvidencias(grouped);
        }
      } catch (e) {
        console.warn("ServicioDocsView:", e);
        showToast?.("No se pudieron cargar los documentos");
      } finally {
        setLoading(false);
      }
    }
    cargar();
  }, [uid]);

  useEffect(() => {
    function onEvidenciaSaved(e) {
      const { ev, stopId } = e.detail || {};
      if (!ev?.id || !stopId) return;
      setEvidencias((prev) => mergeEvidenciaIntoByStop(prev, stopId, ev));
    }
    window.addEventListener(EVIDENCIA_SAVED_EVENT, onEvidenciaSaved);
    return () => window.removeEventListener(EVIDENCIA_SAVED_EVENT, onEvidenciaSaved);
  }, []);

  const buckets = useMemo(() => {
    const ref = new Date();
    const hoy = [];
    const ayer = [];
    const semana = [];
    const older = [];
    servicios.forEach((sv) => {
      const b = bucketServiceDocDate(sv, ref);
      if (b === "hoy") hoy.push(sv);
      else if (b === "ayer") ayer.push(sv);
      else if (b === "semana") semana.push(sv);
      else older.push(sv);
    });
    return { hoy, ayer, semana, older };
  }, [servicios]);

  function mergeStopEvidence(prev, stopId, ev) {
    if (!ev?.id || !stopId) return prev;
    const cur = prev[stopId] || [];
    if (cur.some((x) => x.id === ev.id)) return prev;
    return { ...prev, [stopId]: [...cur, ev] };
  }

  function badgeOperativo(sv) {
    if (sv.estado === "completado")
      return { label: "COMPLETADO", bg: "rgba(34, 197, 94, 0.14)", fg: "#86EFAC", bd: "rgba(34, 197, 94, 0.35)" };
    if (sv.estado === "asignado")
      return { label: "ASIGNADO", bg: "rgba(245, 158, 11, 0.12)", fg: "#FCD34D", bd: "rgba(245, 158, 11, 0.35)" };
    return { label: "OPERATIVO", bg: "rgba(59, 130, 246, 0.14)", fg: "#93C5FD", bd: "rgba(59, 130, 246, 0.35)" };
  }

  function refHumano(sv) {
    const r = getServiceNumber(sv);
    if (!r) return null;
    const s = String(r).trim();
    if (/^[0-9a-f-]{36}$/i.test(s)) return null;
    return s.length > 32 ? s.slice(0, 28) + "…" : s;
  }

  if (loading)
    return (
      <div style={{ minHeight: "50vh", background: shell, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 28, height: 28, border: "2px solid rgba(59,130,246,.35)", borderTopColor: accent, borderRadius: "50%", margin: "0 auto 12px", animation: "crSpin 0.85s linear infinite" }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: su }}>Cargando documentos…</div>
        </div>
        <style>{`@keyframes crSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  if (!servicios.length)
    return (
      <div style={{ minHeight: "55vh", background: shell, padding: "28px 18px 88px" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button type="button" onClick={() => onBack?.()} style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${cardBorder}`, borderRadius: 10, width: 36, height: 36, color: su, cursor: "pointer", fontSize: 16 }}>
            ←
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: tx, letterSpacing: -0.3 }}>Documentos</div>
            <div style={{ fontSize: 11, color: su, marginTop: 2 }}>Solo consulta · abre Servicio para subir en la parada</div>
          </div>
        </header>
        <div style={{ textAlign: "center", padding: "36px 12px", borderRadius: 16, border: `1px solid ${cardBorder}`, background: card }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.9 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: tx, marginBottom: 6 }}>Sin servicios</div>
          <div style={{ fontSize: 12, color: su, lineHeight: 1.45, maxWidth: 280, margin: "0 auto" }}>Cuando tengas servicios asignados, verás aquí la ruta y los documentos por parada.</div>
        </div>
      </div>
    );

  function renderServiceCard(sv) {
    const svStops = stops[sv.id] || [];
    const totalEvs = countOperationalDocuments(svStops, evidencias);
    const stopsConDoc = svStops.filter((s) => filterOperationalEvidencias(evidencias[s.id]).length > 0).length;
    const nStops = svStops.length;
    const docRatio = nStops ? Math.min(1, stopsConDoc / nStops) : 0;
    const operationalStatus = getOperationalStatus({ service: sv, stops: svStops, evidencias });
    const operationalMeta = OPERATIONAL_STATUS_META[operationalStatus];
    const lastActivity = getLastServiceActivity({ service: sv, stops: svStops, evidencias });
    const attention = needsAttention({ service: sv, stops: svStops, evidencias, lastActivity });
    const attentionReason = attention ? getAttentionReason({ service: sv, stops: svStops, evidencias, lastActivity }) : "";
    const routeFrom = safeOperationalPlaceName(sv.origen, "Origen");
    const routeTo = safeOperationalPlaceName(sv.destino, "Destino");
    const fecha = new Date(sv.fecha_inicio || sv.created_at);
    const fechaStr = fecha.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    const rh = refHumano(sv);
    const cliente = getServiceClient(sv);
    const bd = badgeOperativo(sv);

    return (
      <div
        key={sv.id}
        style={{
          marginBottom: 10,
          borderRadius: 14,
          background: card,
          border: `1px solid ${cardBorder}`,
          boxShadow: attention ? "0 0 0 1px rgba(251, 191, 36, 0.35), 0 8px 24px rgba(0,0,0,.18)" : "0 4px 18px rgba(0,0,0,.12)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 12px 10px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>◎</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: su, textTransform: "uppercase", letterSpacing: 0.6 }}>Ruta</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: tx, letterSpacing: -0.2, lineHeight: 1.25 }}>
                {routeFrom} → {routeTo}
              </div>
              {(rh || cliente) && (
                <div style={{ fontSize: 10, color: su, marginTop: 4, opacity: 0.92 }}>
                  {rh && <span>{rh}</span>}
                  {rh && cliente ? " · " : ""}
                  {cliente && <span>{cliente}</span>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 8, background: bd.bg, color: bd.fg, border: `1px solid ${bd.bd}`, letterSpacing: 0.4 }}>
                {bd.label}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 7, background: `${operationalMeta.color}18`, color: operationalMeta.color, border: `1px solid ${operationalMeta.color}35` }}>
                {operationalMeta.icon} {operationalMeta.label}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: su }}>{fechaStr}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: su }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ opacity: 0.8 }}>▥</span>
                {nStops} stops
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: tx }}>
                <span style={{ opacity: 0.75 }}>📄</span>
                {stopsConDoc}/{nStops || 1} paradas · {totalEvs} docs
              </span>
            </div>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: "rgba(15,23,42,.5)", marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(docRatio * 100)}%`, height: "100%", borderRadius: 99, background: docRatio >= 1 ? "#4ADE80" : `linear-gradient(90deg,${accent},#60A5FA)` }} />
          </div>
          {attention && (
            <div style={{ marginTop: 8, fontSize: 10, color: "#FBBF24", lineHeight: 1.35 }}>
              ⚠ {attentionReason}
            </div>
          )}
        </div>

        <div style={{ padding: "0 10px 10px" }}>
          <div style={{ borderTop: `1px solid ${cardBorder}`, paddingTop: 8 }}>
            {svStops.map((stop, idx) => {
              const evs = filterOperationalEvidencias(evidencias[stop.id] || []);
              const hasDoc = evs.length > 0;
              const isOpen = expandido[stop.id];
              const tipoLabel = formatStopTipoLabel(stop.tipo);
              const icon = STOP_ICON[stop.tipo] || "📍";
              const colorStop = STOP_COLOR[stop.tipo] || accent;
              return (
                <div key={stop.id} style={{ position: "relative", paddingLeft: 14 }}>
                  {idx < svStops.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 5,
                        top: 22,
                        bottom: -4,
                        width: 2,
                        borderRadius: 2,
                        background: "linear-gradient(180deg, rgba(148,163,184,.35), rgba(148,163,184,.08))",
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 10,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: hasDoc ? "rgba(74,222,128,.25)" : "rgba(148,163,184,.2)",
                      border: `2px solid ${hasDoc ? "#4ADE80" : "rgba(148,163,184,.45)"}`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setExpandido((prev) => ({ ...prev, [stop.id]: !prev[stop.id] }))}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px 8px 4px",
                      marginBottom: 2,
                      background: "transparent",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ color: colorStop, fontWeight: 800 }}>{tipoLabel}</span>
                        <span style={{ color: su, fontWeight: 600 }}> · </span>
                        {stop.nombre || "Parada"}
                      </div>
                      <div style={{ fontSize: 10, color: su, marginTop: 1 }}>{hasDoc ? "✓ Documento subido" : "Sin documento"}</div>
                    </div>
                    <span style={{ color: su, fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
                  </button>
                  {isOpen && (
                    <div style={{ margin: "0 0 8px 2px", padding: "8px 8px 10px", borderRadius: 10, background: "rgba(15,23,42,.45)", border: `1px solid ${cardBorder}` }}>
                      {(stop.hora_llegada_real || stop.hora_salida_real) && (
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: su, marginBottom: 8 }}>
                          {stop.hora_llegada_real && <span>Llegada {new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>}
                          {stop.hora_salida_real && <span>Salida {new Date(stop.hora_salida_real).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                      )}
                      {evs.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                          {evs.map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => setVisorCtx({ ev, servicioId: sv.id })}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "5px 8px",
                                borderRadius: 8,
                                border: `1px solid ${(TIPO_COLOR[ev.tipo] || su) + "40"}`,
                                background: "rgba(30,41,59,.65)",
                                cursor: "pointer",
                                fontSize: 10,
                                fontWeight: 700,
                                color: TIPO_COLOR[ev.tipo] || tx,
                              }}
                            >
                              <span>{TIPO_ICON[ev.tipo] || "📎"}</span>
                              <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getDocumentLabel(ev) || TIPO_LABEL[ev.tipo]}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {evs.length === 0 ? (
                        <div style={{ fontSize: 11, color: su, lineHeight: 1.45, paddingBottom: 4 }}>
                          Sin archivos aquí. Para foto o CMR usa <strong style={{ color: tx }}>Servicio</strong> en la parada en operación.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const secciones = [
    { key: "hoy", titulo: "HOY", lista: buckets.hoy },
    { key: "ayer", titulo: "AYER", lista: buckets.ayer },
    { key: "semana", titulo: "ESTA SEMANA", lista: buckets.semana },
    { key: "older", titulo: "ANTERIORES", lista: buckets.older },
  ];

  return (
    <div style={{ minHeight: "calc(100vh - 120px)", background: shell, padding: "0 0 88px" }}>
      {visorCtx && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.92)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setVisorCtx(null)}>
          <div style={{ background: card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", border: `1px solid ${cardBorder}` }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: TIPO_COLOR[visorCtx.ev.tipo] || tx }}>
                {TIPO_ICON[visorCtx.ev.tipo]} {visorCtx.ev.tipo.toUpperCase()}
              </div>
              <button type="button" onClick={() => setVisorCtx(null)} style={{ background: "rgba(255,255,255,.08)", border: `1px solid ${cardBorder}`, borderRadius: 8, width: 32, height: 32, color: tx, cursor: "pointer" }}>
                ✕
              </button>
            </div>
            <div style={{ padding: "14px 14px 32px" }}>
              <div style={{ fontSize: 10, color: su, marginBottom: 12 }}>{new Date(visorCtx.ev.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              {resolveEvidenciaDisplayImageUrl(visorCtx.ev) && (
                <DriverCachedMediaImg
                  servicioId={visorCtx.servicioId}
                  evidenciaId={visorCtx.ev.id}
                  src={resolveEvidenciaDisplayImageUrl(visorCtx.ev)}
                  alt="evidencia"
                  style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 12, marginBottom: 12 }}
                />
              )}
              {resolveEvidenciaDisplayImageUrl(visorCtx.ev) && (
                <a
                  href={resolveEvidenciaDisplayImageUrl(visorCtx.ev)}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => visorCtx.servicioId && touchServiceDocumentAccess(visorCtx.servicioId)}
                  style={{
                    display: "block",
                    background: "rgba(59,130,246,.25)",
                    color: "#E0F2FE",
                    borderRadius: 10,
                    padding: "10px",
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                    textDecoration: "none",
                    marginBottom: 12,
                    border: `1px solid ${cardBorder}`,
                  }}
                >
                  ⬇️ Descargar / abrir en nueva pestaña
                </a>
              )}
              {visorCtx.ev.tipo === "cmr" && visorCtx.ev.datos && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    ["Nº CMR", "num_cmr"],
                    ["Remitente", "remitente"],
                    ["Destinatario", "destinatario"],
                    ["Transportista", "transportista"],
                    ["Lugar carga", "lugar_carga"],
                    ["Lugar entrega", "lugar_entrega"],
                    ["Mercancía", "mercancia"],
                    ["Peso (kg)", "peso_kg"],
                    ["Matrícula", "matricula"],
                    ["Observaciones", "observaciones"],
                  ].map(([lbl, key]) =>
                    visorCtx.ev.datos[key] ? (
                      <div key={key} style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px", border: `1px solid ${cardBorder}` }}>
                        <div style={{ fontSize: 9, color: su, fontWeight: 700, marginBottom: 2 }}>{lbl.toUpperCase()}</div>
                        <div style={{ fontSize: 13, color: tx }}>{visorCtx.ev.datos[key]}</div>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
              {visorCtx.ev.tipo === "incidencia" && visorCtx.ev.datos?.texto && (
                <div style={{ background: "rgba(127,29,29,.35)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#FECDD3", lineHeight: 1.55 }}>
                  {visorCtx.ev.datos.texto}
                </div>
              )}
              {sanitizeDocumentCommentText(visorCtx.ev.nota) && (
                <div style={{ marginTop: 12, fontSize: 12, color: su, background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px", border: `1px solid ${cardBorder}` }}>
                  📝 {sanitizeDocumentCommentText(visorCtx.ev.nota)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <header style={{ position: "sticky", top: 0, zIndex: 5, background: `linear-gradient(180deg,${shell} 70%,transparent)`, padding: "12px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={() => onBack?.()} style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${cardBorder}`, borderRadius: 10, width: 36, height: 36, color: su, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>
            ←
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: tx, letterSpacing: -0.35 }}>Documentos</div>
            <div style={{ fontSize: 11, color: su, marginTop: 2, lineHeight: 1.3 }}>Solo consulta · sube en Servicio, en la parada activa</div>
          </div>
        </div>
      </header>

      <div style={{ padding: "4px 12px 0" }}>
        {secciones.map(
          (sec) =>
            sec.lista.length > 0 && (
              <section key={sec.key} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, color: su, opacity: 0.88, margin: "0 2px 8px", textTransform: "uppercase" }}>{sec.titulo}</div>
                {sec.lista.map((sv) => renderServiceCard(sv))}
              </section>
            ),
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  EVIDENCIAS DEL STOP (expediente documental operacional)
// ─────────────────────────────────────────────────────────────
function EvidenciasStop(props) {
  return <OperationalEvidenciasStop {...props} />;
}


// ─────────────────────────────────────────────────────────────
//  TAB SERVICIO
// ─────────────────────────────────────────────────────────────
const TabServicio=React.memo(function TabServicio({uid,norma=null,conductorNombre="Conductor",showToast,onOpenViajeModal,canCreateServices=false}){
  const{servicio,stops,siguienteServicio,siguientesStops,completados,loading,marcarLlegado,marcarCompletado,iniciarServicio,cerrarExpediente,recargar}=useServicioActivo(uid,norma,showToast,conductorNombre);
  const[creando,setCreando]=useState(false);
  const[evidenciasByStop,setEvidenciasByStop]=useState({});
  const card="#FFFFFF",tx="#0F172A",su="#64748B";

  const stopsOperativaSigKey=useMemo(()=>stopsOperativaSig(stops),[stops]);

  useEffect(()=>{
    if(!servicio?.id||!stopsOperativaSigKey){
      setEvidenciasByStop({});
      return;
    }
    let cancelled=false;
    (async()=>{
      try{
        const stopIds=stops.map(s=>s.id).filter(Boolean);
        if(!stopIds.length){
          if(!cancelled)setEvidenciasByStop({});
          return;
        }
        const grouped=await fetchEvidenciasGroupedByStop(stopIds,sbFetch);
        if(!cancelled)setEvidenciasByStop(grouped);
      }catch(_){
        if(!cancelled)setEvidenciasByStop({});
      }
    })();
    return()=>{cancelled=true;};
  },[servicio?.id,stopsOperativaSigKey,stops]);

  const handleEvidenciaSaved=useCallback((ev)=>{
    const stopId=ev?.stop_id;
    if(!ev?.id||!stopId)return;
    console.log("[TL1] evidencia saved callback",{
      evidenciaId:ev.id,
      servicioId:servicio?.id||null,
      stopId,
      tipo:ev?.tipo||null,
      created_at:ev?.created_at||null,
    });
    setEvidenciasByStop((prev)=>mergeEvidenciaIntoByStop(prev,stopId,ev));
  },[]);

  useEffect(()=>{
    if(servicio?.id&&["completado","cerrado","cancelado","anulado"].includes(String(servicio.estado||"").toLowerCase())){
      markServiceArchived(servicio.id);
      void runRetentionSweep();
    }
  },[servicio?.id,servicio?.estado]);

  if(import.meta.env.DEV){
    console.log("[AUDIT PR-22B] TabServicio",{
      loading,
      sinServicio:!servicio,
      estado:servicio?.estado,
      rama:servicio?(servicio.estado==="completado"?"completado":servicio.estado==="asignado"?"ActiveServicePanel asignado":"ActiveServicePanel en_curso"):(loading?"loading":"sin_servicio_card"),
    });
  }

  if(loading)return(
    <div style={{padding:40,textAlign:"center",color:su,fontSize:13,background:"#F8FAFC",minHeight:"60vh"}}>Cargando...</div>
  );

  if(!servicio)return(
    <div style={{padding:"24px 16px",background:"#F8FAFC",minHeight:"60vh"}}>
      <div style={{background:card,border:"1px solid #E2E8F0",borderRadius:18,padding:"28px 20px",textAlign:"center",marginBottom:16,boxShadow:"0 10px 28px rgba(15,23,42,.06)"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#64748B",letterSpacing:.8,marginBottom:10}}>SERVICIO</div>
        <div style={{fontSize:18,fontWeight:750,color:tx,marginBottom:6}}>Sin servicio activo</div>
        <div style={{fontSize:14,color:su,lineHeight:1.6,marginBottom:24}}>
          {canCreateServices
            ?<>Crea tu propio servicio o espera<br/>a que te asignen uno.</>
            :<>Espera a que tu empresa<br/>te asigne un servicio.</>}
        </div>
        {canCreateServices&&(
        <button onClick={()=>setCreando(true)} style={{width:"100%",background:"#2563EB",color:"#FFFFFF",border:"none",borderRadius:13,padding:"14px",fontSize:15,fontWeight:750,cursor:"pointer"}}>Crear servicio</button>
        )}
      </div>
      {creando&&canCreateServices&&<CrearServicioModal uid={uid} conductorNombre={conductorNombre} onClose={()=>setCreando(false)} onCreado={()=>{setCreando(false);recargar();showToast("✅ Servicio creado");}}/>}
    </div>
  );

  if(servicio.estado==="cerrado"||isServicioExpedienteCerrado(servicio)){
    const cierre=getExpedienteCierre(servicio);
    const cerradoLabel=cierre?.closed_at
      ?new Date(cierre.closed_at).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})
      :null;
    return(
      <div style={{padding:"24px 16px",background:"#F8FAFC",minHeight:"60vh"}}>
        <div style={{background:card,border:"1px solid #E2E8F0",borderRadius:18,padding:"28px 20px",textAlign:"center",boxShadow:"0 10px 28px rgba(15,23,42,.06)"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#0F766E",letterSpacing:.8,marginBottom:10}}>EXPEDIENTE CERRADO</div>
          <div style={{fontSize:18,fontWeight:750,color:"#0F766E",marginBottom:6}}>Viaje cerrado</div>
          <div style={{fontSize:14,color:su,marginBottom:8}}>{servicio.origen} → {servicio.destino}</div>
          {cerradoLabel?<div style={{fontSize:12,color:su,marginBottom:20}}>Cerrado {cerradoLabel}</div>:null}
          {cierre?.comentario?<div style={{fontSize:13,color:tx,textAlign:"left",background:"#F8FAFC",borderRadius:10,padding:"10px 12px",marginBottom:16,lineHeight:1.45}}>{cierre.comentario}</div>:null}
          {canCreateServices&&(
          <button onClick={()=>setCreando(true)} style={{width:"100%",background:"#16a34a",color:"#FFFFFF",border:"1px solid #86efac",borderRadius:13,padding:"14px",fontSize:15,fontWeight:750,cursor:"pointer",boxShadow:"0 2px 6px rgba(22,163,74,.2)"}}>+ Nuevo servicio</button>
          )}
        </div>
        {creando&&canCreateServices&&<CrearServicioModal uid={uid} conductorNombre={conductorNombre} onClose={()=>setCreando(false)} onCreado={()=>{setCreando(false);recargar();showToast("✅ Servicio creado");}}/>}
      </div>
    );
  }

  if(servicio.estado==="asignado"||servicio.estado==="en_curso"||servicio.estado==="completado"){
    const panelMode=
      servicio.estado==="asignado"?"asignado":servicio.estado==="completado"?"cierre_documental":"en_curso";
    return(
    <>
      <ActiveServicePanel
        key={servicio.id}
        mode={panelMode}
        servicio={servicio}
        stops={stops}
        siguienteServicio={siguienteServicio}
        siguientesStops={siguientesStops}
        evidenciasByStop={evidenciasByStop}
        showToast={showToast}
        onIniciarServicio={iniciarServicio}
        marcarLlegado={marcarLlegado}
        marcarCompletado={marcarCompletado}
        recargar={recargar}
        EvidenciasStopComponent={EvidenciasStop}
        onOpenViajeModal={onOpenViajeModal}
        onEvidenciaSaved={handleEvidenciaSaved}
        onCerrarExpediente={cerrarExpediente}
        conductorNombre={conductorNombre}
        norma={norma}
      />
      {creando&&canCreateServices&&<CrearServicioModal uid={uid} conductorNombre={conductorNombre} onClose={()=>setCreando(false)} onCreado={()=>{setCreando(false);recargar();showToast("✅ Servicio creado");}}/>}
    </>
    );
  }

  return null;
});



// ─────────────────────────────────────────────────────────────
//  EMPRESA DASHBOARD — pantalla principal empresa
// ─────────────────────────────────────────────────────────────
function EmpresaDashboard({prof,showToast,onTabChange}){
  const[empresa,setEmpresa]=useState(null);
  const[conductores,setConductores]=useState([]);
  const[servicios,setServicios]=useState([]);
  const[ubicacionDashByUid,setUbicacionDashByUid]=useState({});
  const[loading,setLoading]=useState(true);
  const[viajeLocal,setViajeLocal]=useState(()=>readViajeActivoFromStorage());
  const etaVisualClockMs=useEtaVisualClockMs();
  const ubicacionDashLabelCacheRef=useRef(new Map());
  const bg=EMPRESA_UI.bg,card=EMPRESA_UI.surface,tx=EMPRESA_UI.tx,su=EMPRESA_UI.muted;

  useEffect(()=>{
    function refreshViajeLocal(){setViajeLocal(readViajeActivoFromStorage());}
    window.addEventListener("focus",refreshViajeLocal);
    window.addEventListener("storage",refreshViajeLocal);
    return()=>{
      window.removeEventListener("focus",refreshViajeLocal);
      window.removeEventListener("storage",refreshViajeLocal);
    };
  },[]);

  useEffect(()=>{
    const uid=getUserId();if(!uid)return;
    async function cargar(){
      try{
        const emps=await sbSelect("empresas",`owner_id=eq.${uid}`);
        const emp=emps[0];
        if(!emp?.id){setLoading(false);return;}
        setEmpresa(emp);
        const rels=await sbSelect("conductor_empresa",`empresa_id=eq.${emp.id}&activo=eq.true`);
        const relsWithProf=await Promise.all(rels.map(async(r)=>{
          if(!r.user_id)return r;
          const pr=await sbSelect("profiles",`id=eq.${r.user_id}`);
          return pr[0]?.is_archived?null:r;
        }));
        const relsActivos=relsWithProf.filter(Boolean);
        const uids=relsActivos.filter(r=>r.user_id).map(r=>r.user_id);
        setConductores(relsActivos);
        if(uids.length){
          const svs=await sbFetch(`/rest/v1/servicios?conductor_id=in.(${uids.join(",")})&estado=in.(asignado,en_curso)&order=created_at.desc&limit=20`).then(r=>r.json());
          setServicios(Array.isArray(svs)?svs:[]);
          void refreshDashboardUbicaciones(uids);
        }else setServicios([]);
      }catch(e){console.warn("EmpresaDashboard:",e);}
      finally{setLoading(false);}
    }
    cargar();
    window.addEventListener("cuaderno-recargar-servicio",cargar);
    const onVisible=()=>{if(document.visibilityState==="visible")cargar();};
    window.addEventListener("focus",cargar);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      window.removeEventListener("cuaderno-recargar-servicio",cargar);
      window.removeEventListener("focus",cargar);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[]);

  async function readDashboardLocation(uid){
    if(!uid)return null;
    const r=await sbFetch(`/rest/v1/ubicaciones?user_id=eq.${uid}&order=ts.desc&limit=1`);
    const j=await r.json();
    const pos=validUbicacionRow(Array.isArray(j)?j[0]:null);
    if(!pos)return{label:"Sin ubicación registrada",updatedAt:null,missing:true,recent:false};
    const key=`${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}`;
    let label=ubicacionDashLabelCacheRef.current.get(key);
    if(!label){
      label=await revGeoUbicacionLabel(pos.lat,pos.lon);
      ubicacionDashLabelCacheRef.current.set(key,label);
    }
    return{...pos,label,updatedAt:pos.ts,recent:isRecentTrackingPoint(pos)};
  }

  async function refreshDashboardUbicaciones(uids=null){
    const target=[...new Set((uids||[
      ...conductores.map(c=>c.user_id),
      ...servicios.map(s=>s.conductor_id),
    ]).filter(Boolean))];
    if(!target.length)return;
    const locs={};
    await Promise.all(target.map(async uid=>{
      try{locs[uid]=await readDashboardLocation(uid);}catch(_){}
    }));
    setUbicacionDashByUid(prev=>({...prev,...locs}));
  }

  useEffect(()=>{
    if(!empresa?.id)return;
    const tick=()=>{
      if(document.visibilityState==="hidden")return;
      void refreshDashboardUbicaciones();
    };
    tick();
    const id=setInterval(tick,75*1000);
    return()=>clearInterval(id);
  },[empresa?.id,conductores,servicios]);

  const primerCurso=servicios.find(s=>s.estado==="en_curso");
  const primerCursoRuta=primerCurso?(()=>{const e=resolveServiceRouteEndpoints(primerCurso,null);return`${e.origen} → ${e.destino}`;})():null;
  const primerUbic=primerCurso?.conductor_id?ubicacionDashByUid[primerCurso.conductor_id]:null;
  const primerNorma=primerCurso?.conductor_id?conductores.find(c=>c.user_id===primerCurso.conductor_id)?.norma:null;
  const localPreviewHeadline=!primerCurso&&viajeLocal?getUnifiedTripPresentation({viajeActivo:viajeLocal,servicio:null,norma:null,etaSlot:null,etaLoading:false}).rutaHeadline:null;

  if(loading)return<div style={{padding:60,textAlign:"center",color:su}}>Cargando...</div>;

  if(import.meta.env.DEV){
    console.log("[AUDIT PR-22B] RENDER EmpresaDashboard (cuenta tipo empresa → EmpresaLayout tab dashboard)");
  }

  const enCurso=servicios.filter(s=>s.estado==="en_curso").length;
  const asignados=servicios.filter(s=>s.estado==="asignado").length;

  return(
    <div style={{padding:"24px 24px 60px",maxWidth:1200,margin:"0 auto"}}>

      <div style={{background:card,borderRadius:14,padding:"16px 18px",marginBottom:16,border:`1px solid ${EMPRESA_UI.border}`,boxShadow:EMPRESA_UI.shadow}}>
        <div style={{fontSize:11,fontWeight:600,color:su,letterSpacing:.4,marginBottom:10}}>Resumen operacional</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",fontSize:13,color:tx,lineHeight:1.5}}>
          <span><strong style={{color:EMPRESA_UI.accent,fontSize:17,fontWeight:650}}>{enCurso}</strong> <span style={{color:su}}>en curso</span></span>
          <span style={{color:EMPRESA_UI.borderStrong}}>·</span>
          <span><strong style={{color:EMPRESA_UI.subtle,fontSize:17,fontWeight:650}}>{asignados}</strong> <span style={{color:su}}>pendientes</span></span>
          <span style={{color:EMPRESA_UI.borderStrong}}>·</span>
          {(viajeLocal||primerCurso)&&(
            <span style={{width:"100%",fontSize:12,color:su,marginTop:4,lineHeight:1.45}}>
              {(primerCursoRuta||localPreviewHeadline)&&(
                <div>
                  <strong style={{color:tx}}>{primerCursoRuta||localPreviewHeadline}</strong>
                </div>
              )}
              {primerCurso&&(
                <div style={{marginTop:6}}>
                  <OperationalEtaSnapshotBlock
                    servicio={primerCurso}
                    nowMs={etaVisualClockMs}
                    tx={tx}
                    su={su}
                    subtle={EMPRESA_UI.subtle}
                    layout="empresa"
                    latestLocation={primerUbic && !primerUbic.missing && !primerUbic.fetchError ? primerUbic : null}
                    tacografoEstado={
                      primerNorma
                        ? {
                            isDriving: !!primerNorma.isDriving,
                            crType: primerNorma.crType || "",
                            crDur: Number(primerNorma.crDur),
                          }
                        : null
                    }
                    activeStop={null}
                  />
                </div>
              )}
              {viajeLocal&&<span style={{display:"block",marginTop:4,fontSize:11,color:"#475569"}}>Ruta guardada en este navegador (vista previa)</span>}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onTabChange("documentos");
            showToast?.("Expedientes y correo: pestaña Documentos");
          }}
          style={{
            marginTop: 12,
            width: "100%",
            background: "#1e293b",
            color: "#f8fafc",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Documentación y envío por correo →
        </button>
      </div>
      <div style={{fontSize:12,color:su,marginBottom:18}}>
        {new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:24}}>
        {[
          {l:"En curso",  v:enCurso,     c:EMPRESA_UI.accent, icon:"▱", action:()=>onTabChange("servicios")},
          {l:"Pendientes salida",  v:asignados,   c:EMPRESA_UI.subtle, icon:"○", action:()=>onTabChange("servicios")},
          {l:"Conductores activos",v:conductores.filter(c=>c.user_id).length, c:EMPRESA_UI.green, icon:"◇", action:()=>onTabChange("conductores")},
          {l:"Total servicios hoy",v:servicios.length, c:"#475569", icon:"▤", action:null},
        ].map(({l,v,c,icon,action})=>(
          <button key={l} onClick={action||undefined}
            style={{background:card,border:`1px solid ${EMPRESA_UI.border}`,borderRadius:14,padding:"16px 18px",textAlign:"left",cursor:action?"pointer":"default",transition:"border-color .15s",boxShadow:EMPRESA_UI.shadow}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <span style={{fontSize:18,color:"#94a3b8"}}>{icon}</span>
              <span style={{fontSize:11,color:empresaTone(c).fg,background:empresaTone(c).bg,border:`1px solid ${empresaTone(c).border}`,borderRadius:999,padding:"2px 8px",fontWeight:600}}>Hoy</span>
            </div>
            <div style={{fontSize:30,fontWeight:650,color:c,fontFamily:"monospace",lineHeight:1,marginBottom:5}}>{v}</div>
            <div style={{fontSize:12,color:su,fontWeight:500}}>{l}</div>
          </button>
        ))}
      </div>

      {/* Servicios en curso */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div style={{background:card,borderRadius:16,padding:"18px",border:`1px solid ${EMPRESA_UI.border}`,boxShadow:EMPRESA_UI.shadow}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:650,color:tx}}>En curso</div>
            <button onClick={()=>onTabChange("servicios")} style={{background:"transparent",border:"none",color:EMPRESA_UI.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>Ver todos →</button>
          </div>
          {servicios.filter(s=>s.estado==="en_curso").length===0?(
            <div style={{textAlign:"center",padding:"24px 0",color:su,fontSize:13}}>Sin servicios en curso ahora mismo</div>
          ):servicios.filter(s=>s.estado==="en_curso").slice(0,5).map(sv=>{
            const operationalStatus=getOperationalStatus({service:sv,stops:[],evidencias:[]});
            const operationalMeta=OPERATIONAL_STATUS_META[operationalStatus];
            const lastActivity=getLastServiceActivity({service:sv,stops:[],evidencias:[]});
            const attention=needsAttention({service:sv,stops:[],evidencias:[],lastActivity});
            const attentionReason=attention?getAttentionReason({service:sv,stops:[],evidencias:[],lastActivity}):"";
            const refVisible=getServiceNumber(sv);
            const clienteVisible=getServiceClient(sv);
            const {origen:routeFrom,destino:routeTo}=resolveServiceRouteEndpoints(sv,null);
            const ubic=sv.conductor_id?ubicacionDashByUid[sv.conductor_id]:null;
            const ubicUpdated=fmtUbicacionActualizada(ubic);
            return(
            <div key={sv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"11px 0",borderBottom:`1px solid ${EMPRESA_UI.border}`,boxShadow:attention?`inset 3px 0 0 ${EMPRESA_UI.amber}`:"none",paddingLeft:attention?8:0}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{routeFrom} → {routeTo}</div>
                <div style={{marginTop:4}}>
                  <OperationalEtaSnapshotBlock
                    servicio={sv}
                    nowMs={etaVisualClockMs}
                    tx={tx}
                    su={su}
                    subtle={EMPRESA_UI.subtle}
                    layout="empresa"
                    latestLocation={ubic && !ubic.missing && !ubic.fetchError ? ubic : null}
                    tacografoEstado={null}
                    activeStop={null}
                  />
                </div>
                <div style={{fontSize:10.5,color:su,marginTop:3,lineHeight:1.35}}>
                  Última ubicación · <span style={{color:EMPRESA_UI.subtle,fontWeight:600}}>{fmtUbicacionConductorEmpresa(ubic)}</span>
                </div>
                <div style={{fontSize:10.5,color:su,marginTop:2,lineHeight:1.35,fontWeight:600}}>
                  {ubicUpdated}
                </div>
                {attention&&(
                  <div style={{marginTop:4}}>
                    <span style={{background:EMPRESA_UI.amberSoft,color:EMPRESA_UI.amber,border:"1px solid #fed7aa",borderRadius:999,padding:"2px 7px",fontSize:9,fontWeight:600}}>Atención requerida</span>
                    {attentionReason&&<div style={{fontSize:9,color:su,marginTop:2,lineHeight:1.3}}>{attentionReason}</div>}
                  </div>
                )}
                {refVisible&&<div style={{fontSize:11,color:EMPRESA_UI.subtle,marginTop:1}}>{refVisible}{clienteVisible?` · Cliente: ${clienteVisible}`:""}</div>}
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:6,flexShrink:0,marginLeft:10}}>
                <span style={{background:empresaTone(ESTADO_COLOR[sv.estado]).bg,color:empresaTone(ESTADO_COLOR[sv.estado]).fg,border:`1px solid ${empresaTone(ESTADO_COLOR[sv.estado]).border}`,borderRadius:999,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                  ● {ESTADO_LABEL[sv.estado]}
                </span>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                  <span style={{background:empresaTone(operationalMeta.color).bg,color:empresaTone(operationalMeta.color).fg,border:`1px solid ${empresaTone(operationalMeta.color).border}`,borderRadius:999,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                    ● {operationalMeta.label}
                  </span>
                  <span style={{fontSize:10,color:su,lineHeight:1.2}}>{lastActivity.label}</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Conductores */}
        <div style={{background:card,borderRadius:16,padding:"18px",border:`1px solid ${EMPRESA_UI.border}`,boxShadow:EMPRESA_UI.shadow}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:650,color:tx}}>Conductores</div>
            <button onClick={()=>onTabChange("conductores")} style={{background:"transparent",border:"none",color:EMPRESA_UI.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>Gestionar →</button>
          </div>
          {conductores.length===0?(
            <div style={{textAlign:"center",padding:"24px 0",color:su,fontSize:13}}>
              Sin conductores vinculados
              {empresa&&(
                <div style={{marginTop:10,fontSize:11,color:"#475569"}}>
                  Código equipo:{" "}
                  <span style={{fontFamily:"monospace",color:tx}}>{getEmpresaCodigoEquipoDisplay(empresa)}</span>
                </div>
              )}
            </div>
          ):conductores.filter(c=>c.user_id).map(c=>{
            const ubic=ubicacionDashByUid[c.user_id];
            const ubicUpdated=fmtUbicacionActualizada(ubic);
            return(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${EMPRESA_UI.border}`}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:tx}}>{c.nombre||"Conductor"}</div>
                  {c.matricula&&<div style={{fontSize:11,color:su,marginTop:1}}>Unidad {c.matricula}</div>}
                  <div style={{fontSize:10.5,color:su,marginTop:2,lineHeight:1.3}}>
                    Última ubicación · {fmtUbicacionConductorEmpresa(ubic)}
                  </div>
                  <div style={{fontSize:10.5,color:su,marginTop:2,lineHeight:1.3,fontWeight:600}}>
                    {ubicUpdated}
                  </div>
                </div>
                <span style={{width:8,height:8,borderRadius:"50%",background:EMPRESA_UI.green,flexShrink:0}}/>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  EMPRESA PANEL SECCION — reutiliza EmpresaPanel por sección
// ─────────────────────────────────────────────────────────────
function EmpresaPanelSeccion({seccion,prof,showToast}){
  return(
    <div style={{padding:"20px 24px 60px",maxWidth:1200,margin:"0 auto",background:EMPRESA_UI.bg}}>
      <EmpresaPanel
        prof={prof}
        dark={false}
        onRoleChange={()=>{}}
        initialTab={seccion}
      />
    </div>
  );
}

export default function App(){
  useEffect(()=>{
    let last=0;
    function handleClick(e){
      const now=Date.now();
      if(now-last<80)return;
      last=now;
      if(e.target.closest("button"))playClick();
    }
    document.addEventListener("pointerdown",handleClick,{passive:true});
    return()=>document.removeEventListener("pointerdown",handleClick);
  },[]);

  // Elegir shell según modo activo (revalidado contra backend)
  const[activeMode,setActiveMode]=useState(null);
  const[checking,setChecking]=useState(true);
  const[pendingBlocked,setPendingBlocked]=useState(false);
  const[pendingStatus,setPendingStatus]=useState(null);

  useEffect(()=>{
    const uid=getUserId();
    if(!uid){setChecking(false);return;}
    bootstrapAuthSession(uid,sbSelect)
      .then(({activeMode:mode,account,capabilities})=>{
        const shells={conductor:!!capabilities?.conductor,empresa:!!capabilities?.empresa};
        setPendingBlocked(isEmpresaPendingBlocked(account,shells));
        setPendingStatus(account?.empresaStatus||null);
        setActiveMode(mode);
        setChecking(false);
      })
      .catch(()=>{
        setActiveMode("conductor");
        setChecking(false);
      });
  },[]);

  if(checking)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9"}}>
      <div style={{fontSize:14,color:"#64748B"}}>Cargando...</div>
    </div>
  );

  if(pendingBlocked){
    return (
      <EmpresaPendingScreen
        empresaStatus={pendingStatus}
        onSignOut={async()=>{await sbSignOut();window.location.reload();}}
      />
    );
  }

  if(import.meta.env.DEV){
    const session=getStoredAuthSession(getUserId());
    console.log("[PRODUCT-1] App shell",{
      activeMode,
      capabilities:session?.capabilities||null,
      renderiza:activeMode==="empresa"?"EmpresaLayout":"AppInner",
    });
  }

  if(activeMode==="empresa")return <ErrorBoundary><EmpresaLayout PROF0={PROF0} getUserId={getUserId} sbSelect={sbSelect} sbUpsert={sbUpsert} sbSignOut={sbSignOut} EmpresaDashboard={EmpresaDashboard} EmpresaPanelSeccion={EmpresaPanelSeccion} ProfView={ProfView}/></ErrorBoundary>;
  return <ErrorBoundary><AppInner/></ErrorBoundary>;
}
