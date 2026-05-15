import fs from "fs";

const p = new URL("../src/cuaderno-ruta.jsx", import.meta.url);
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  '<motionless style={{fontSize:11,color:su,marginTop:1}}>Conductor seleccionado</motionless>',
  '<div style={{fontSize:11,color:su,marginTop:1}}>{sinConductor?"Planificación sin conductor":"Conductor seleccionado"}</div>',
);
s = s.replace(
  '<div style={{fontSize:11,color:su,marginTop:1}}>Conductor seleccionado</div>',
  '<div style={{fontSize:11,color:su,marginTop:1}}>{sinConductor?"Planificación sin conductor":"Conductor seleccionado"}</motionless>',
);
s = s.replace(/<motionless /g, "<div ").replace(/<\/motionless>/g, "</div>");

const blockOld = `          <div style={{marginTop:12,background:EMPRESA_UI.accentSoft,border:"1.5px solid #93c5fd",borderRadius:12,padding:"11px 12px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 6px 18px rgba(37,99,235,.10)"}}>
            <span style={{width:22,height:22,borderRadius:"50%",background:EMPRESA_UI.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>✓</span>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,fontWeight:650,color:"#1e3a8a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conductorNombre||"Conductor"}</div>
              <div style={{fontSize:11,color:"#475569",marginTop:1}}>Asignado a este servicio</div>
            </div>
          </div>`;

const blockNew = `          {sinConductor?(
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
          )}`;

if (s.includes(blockOld)) {
  s = s.replace(blockOld, blockNew);
  s = s.replace(/<motionless /g, "<div ").replace(/<\/motionless>/g, "</div>");
}

s = s.replace(
  '{saving?"Asignando...":"Asignar servicio"}',
  '{saving?(sinConductor?"Guardando...":"Asignando..."):(sinConductor?"Crear servicio planificado":"Asignar servicio")}',
);

fs.writeFileSync(p, s);
console.log("ok");
