import { useState } from "react";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../../domain/service/serviceOperationalStatus";
import { getLastServiceActivity } from "../../../domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "../../../domain/service/serviceAttention";
import { getOperationalPlanSnapshot, stripServicioOperacionDisplay } from "../../../domain/service/serviceOperacionMeta";

function looksLikeLatLonName(value){
  return /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(value||"").trim());
}

function safePlaceName(value,fallback){
  const t=String(value||"").trim();
  if(!t||looksLikeLatLonName(t))return fallback;
  return t;
}

export function DocServicioColapsable({sv,svStops,flotaEvs,totalEvs,nombreConductor,ESTADO_COLOR,ESTADO_LABEL,TIPO_EV,TIPO_EV_COL,onVerEv,bg,card,tx,su}){
  const[abierto,setAbierto]=useState(false);
  const color=ESTADO_COLOR[sv.estado]||su;
  const stopsConEvs=svStops.filter(st=>(flotaEvs[st.id]||[]).length>0);
  const operationalStatus=getOperationalStatus({service:sv,stops:svStops,evidencias:flotaEvs});
  const operationalMeta=OPERATIONAL_STATUS_META[operationalStatus];
  const lastActivity=getLastServiceActivity({service:sv,stops:svStops,evidencias:flotaEvs});
  const attention=needsAttention({service:sv,stops:svStops,evidencias:flotaEvs,lastActivity});
  const attentionReason=attention?getAttentionReason({service:sv,stops:svStops,evidencias:flotaEvs,lastActivity}):"";
  const refVisible=stripServicioOperacionDisplay(sv.referencia);
  const planSnapshot=getOperationalPlanSnapshot(sv);
  const routeTitle=`${planSnapshot?.planned_origin||safePlaceName(sv.origen,"Ubicación actual")} → ${planSnapshot?.planned_destination||safePlaceName(sv.destino,"Destino")}`;

  function descargarServicio(){
    const fecha=sv.fecha_inicio?new Date(sv.fecha_inicio).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"}).replace(/\//g,"-"):"sin-fecha";
    const ref=(refVisible||"SRV").replace(/[^a-zA-Z0-9-_]/g,"");
    const dest=(sv.destino||"destino").replace(/[^a-zA-Z0-9-_ ]/g,"").trim().replace(/\s+/g,"-");
    const nombreArchivo=`${ref}_${dest}_${fecha}`;

    // Construir HTML del informe
    const evHtml=svStops.map(stop=>{
      const evs=flotaEvs[stop.id]||[];
      const evsHtml=evs.map(ev=>`
        <div class="ev">
          <span class="ev-tipo">${TIPO_EV[ev.tipo]||"📎"} ${ev.tipo.toUpperCase()}</span>
          ${ev.tipo==="cmr"&&ev.datos?`
            <table class="cmr">
              ${Object.entries(ev.datos).filter(([,v])=>v).map(([k,v])=>`<tr><td class="lbl">${k.replace(/_/g," ").toUpperCase()}</td><td>${v}</td></tr>`).join("")}
            </table>
          `:""}
          ${ev.tipo==="incidencia"&&ev.datos?.texto?`<p class="incidencia">⚠️ ${ev.datos.texto}</p>`:""}
          ${ev.nota?`<p class="nota">📝 ${ev.nota}</p>`:""}
          ${ev.url?`<img src="${ev.url}" class="foto"/>`:""}
          <span class="ev-fecha">${new Date(ev.created_at).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
        </div>
      `).join("");
      return`
        <div class="stop">
          <div class="stop-hdr">
            <span class="stop-num">${stop.orden}</span>
            <span class="stop-nombre">${stop.nombre}</span>
            <span class="stop-tipo">${stop.tipo.replace(/_/g," ").toUpperCase()}</span>
            ${stop.hora_llegada_real?`<span class="stop-hora">Llegada: ${new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</span>`:""}
            ${stop.hora_salida_real?`<span class="stop-hora">Salida: ${new Date(stop.hora_salida_real).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</span>`:""}
          </div>
          ${evsHtml||"<p class='sin-docs'>Sin documentos</p>"}
        </div>
      `;
    }).join("");

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <title>${nombreArchivo}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#1e293b}
      h1{font-size:20px;color:#f59e0b;margin-bottom:4px}
      .meta{font-size:13px;color:#64748b;margin-bottom:20px}
      .stop{border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:12px}
      .stop-hdr{display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
      .stop-num{background:#f59e0b;color:#0f172a;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0}
      .stop-nombre{font-weight:700;font-size:15px}
      .stop-tipo{font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:4px}
      .stop-hora{font-size:11px;color:#64748b}
      .ev{border-left:3px solid #e2e8f0;padding-left:10px;margin-bottom:10px}
      .ev-tipo{font-weight:700;font-size:12px;color:#0ea5e9;display:block;margin-bottom:4px}
      .ev-fecha{font-size:10px;color:#94a3b8;display:block;margin-top:4px}
      .cmr{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
      .cmr td{padding:3px 6px;border-bottom:1px solid #f1f5f9}
      .lbl{color:#64748b;font-weight:700;width:140px}
      .incidencia{color:#dc2626;font-size:13px;margin:4px 0}
      .nota{color:#64748b;font-size:12px;margin:4px 0}
      .foto{max-width:200px;max-height:150px;border-radius:6px;display:block;margin-top:6px}
      .sin-docs{color:#94a3b8;font-size:12px;font-style:italic}
      @media print{body{padding:10px}}
    </style>
    <script>window.onload=()=>window.print();</script>
    </head><body>
    <h1>${routeTitle}</h1>
    <div class="meta">
      ${refVisible?`<strong>Ref:</strong> ${refVisible} &nbsp;·&nbsp;`:""}
      <strong>Conductor:</strong> ${nombreConductor(sv.conductor_id)} &nbsp;·&nbsp;
      <strong>Estado:</strong> ${ESTADO_LABEL[sv.estado]||sv.estado}
      ${sv.fecha_inicio?`&nbsp;·&nbsp;<strong>Salida:</strong> ${new Date(sv.fecha_inicio).toLocaleString("es-ES",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}`:""} 
    </div>
    ${evHtml}
    </body></html>`;

    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`${nombreArchivo}.html`;
    document.body.appendChild(a);a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
  }

  return(
    <div style={{background:card,borderRadius:14,overflow:"hidden",border:`1px solid ${abierto?color+"40":"#334155"}`,boxShadow:attention?"0 0 0 1px rgba(251, 146, 60, 0.45)":"none"}}>
      {/* Cabecera colapsable */}
      <button onClick={()=>setAbierto(o=>!o)}
        style={{width:"100%",background:"transparent",border:"none",padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:800,color:tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{routeTitle}</div>
          {attention&&(
            <div style={{marginTop:6,marginBottom:2}}>
              <span style={{background:"#F59E0B22",color:"#FB923C",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700}}>⚠ Atención requerida</span>
              {attentionReason&&<div style={{fontSize:9,color:su,marginTop:3,lineHeight:1.3}}>{attentionReason}</div>}
            </div>
          )}
          <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:su}}>👷 {nombreConductor(sv.conductor_id)}</span>
            {refVisible&&<span style={{fontSize:11,color:"#F59E0B"}}>Ref: {refVisible}</span>}
            <span style={{background:color+"20",color,borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700}}>{ESTADO_LABEL[sv.estado]||sv.estado}</span>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
              <span style={{background:operationalMeta.color+"20",color:operationalMeta.color,borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700}}>
                {operationalMeta.icon} {operationalMeta.label.toUpperCase()}
              </span>
              <span style={{fontSize:9,color:su,lineHeight:1.2}}>{lastActivity.label}</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {totalEvs>0&&(
            <span style={{background:"#0EA5E920",color:"#0EA5E9",borderRadius:7,padding:"3px 9px",fontSize:12,fontWeight:700}}>
              {totalEvs} doc{totalEvs!==1?"s":""}
            </span>
          )}
          {totalEvs===0&&<span style={{fontSize:11,color:su}}>Sin docs</span>}
          <button onClick={e=>{e.stopPropagation();descargarServicio();}}
            title="Descargar informe"
            style={{background:"#1E40AF20",border:"1px solid #1E40AF50",borderRadius:7,padding:"4px 8px",fontSize:11,fontWeight:700,color:"#60A5FA",cursor:"pointer",flexShrink:0}}>
            ⬇️
          </button>
          <span style={{color:su,fontSize:16,display:"inline-block",transform:abierto?"rotate(90deg)":"none",transition:"transform .2s"}}>›</span>
        </div>
      </button>

      {/* Contenido expandido */}
      {abierto&&(
        <div style={{borderTop:"1px solid #334155",padding:"12px 14px"}}>
          {stopsConEvs.length===0?(
            <div style={{textAlign:"center",padding:"16px 0",color:su,fontSize:13}}>Sin documentos en este servicio</div>
          ):stopsConEvs.map(stop=>{
            const evs=flotaEvs[stop.id]||[];
            return(
              <div key={stop.id} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:su,fontWeight:700,marginBottom:6}}>
                  📍 {stop.nombre} · Stop {stop.orden}
                  {stop.hora_llegada_real&&<span style={{marginLeft:8,color:"#334155"}}>→ {new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {evs.map(ev=>(
                    <button key={ev.id} onClick={()=>onVerEv(ev)}
                      style={{background:bg,border:`1px solid ${TIPO_EV_COL[ev.tipo]||"#334155"}30`,borderRadius:10,padding:"9px 12px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",textAlign:"left",width:"100%"}}>
                      <span style={{fontSize:18,flexShrink:0}}>{TIPO_EV[ev.tipo]||"📎"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:TIPO_EV_COL[ev.tipo]||tx}}>
                          {ev.tipo==="cmr"&&ev.datos?.num_cmr?"CMR "+ev.datos.num_cmr:ev.tipo.toUpperCase()}
                        </div>
                        {ev.tipo==="cmr"&&ev.datos?.remitente&&<div style={{fontSize:11,color:su,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.datos.remitente} → {ev.datos.destinatario||"—"}</div>}
                        {ev.tipo==="incidencia"&&ev.datos?.texto&&<div style={{fontSize:11,color:"#FCA5A5",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.datos.texto}</div>}
                        <div style={{fontSize:10,color:"#475569",marginTop:2}}>{new Date(ev.created_at).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                      {ev.url&&(ev.tipo==="foto"||ev.tipo==="cmr")&&<img src={ev.url} style={{width:38,height:38,objectFit:"cover",borderRadius:7,flexShrink:0}} alt="thumb"/>}
                      <span style={{color:su,fontSize:14,flexShrink:0}}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
