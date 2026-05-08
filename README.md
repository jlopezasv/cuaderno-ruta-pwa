# 📋 Cuaderno de Ruta — Tacógrafo Digital PWA

App web progresiva para conductores profesionales.  
Cumple EU 561/2006 · Funciona offline · Instala como app nativa.

---

## 🚀 Deploy en Vercel (gratis, 5 minutos)

### Paso 1 — Preparar los archivos

```
cuaderno-pwa/
├── public/
│   ├── manifest.json   ✓
│   ├── sw.js           ✓
│   ├── favicon.svg     ✓
│   └── icons/          ✓ (SVGs generados)
├── src/
│   ├── main.jsx        ✓
│   ├── App.jsx         ✓
│   ├── storage.js      ✓
│   └── cuaderno-ruta.jsx  ← COPIAR AQUÍ el componente del artifact
├── index.html          ✓
├── package.json        ✓
└── vite.config.js      ✓
```

**Acción necesaria:** Copiar `cuaderno-ruta.jsx` (el componente del artifact de Claude)
dentro de la carpeta `src/`.

### Paso 2 — Instalar dependencias

```bash
npm install
```

### Paso 3 — Probar en local

```bash
npm run dev
```
Abre http://localhost:3000 en el móvil (misma red WiFi) para probar la PWA.

### Paso 4 — Deploy en Vercel

**Opción A — Interfaz web (más fácil):**
1. Sube la carpeta a GitHub
2. Ve a https://vercel.com → "Import Project"
3. Selecciona el repositorio → Deploy
4. En 2 minutos tienes la URL

**Opción B — CLI:**
```bash
npm install -g vercel
vercel --prod
```

---

## 📱 Instalar como app en el móvil

Una vez desplegada en Vercel:

### Android (Chrome)
1. Abre la URL en Chrome
2. Menú (⋮) → "Añadir a pantalla de inicio"
3. Confirma → icono en pantalla de inicio

### iPhone (Safari)
1. Abre la URL en Safari (obligatorio, no Chrome)
2. Botón compartir (□↑) → "Añadir a pantalla de inicio"
3. Confirma → icono en pantalla de inicio

Una vez instalada:
- Se abre sin barra de navegador (pantalla completa)
- Funciona offline con los datos del día
- Los registros se guardan en el dispositivo

---

## 💾 Almacenamiento

### Versión actual (localStorage)
- **Datos del cuaderno**: guardados en el dispositivo del conductor
- **Mapa de parkings**: guardado localmente (solo visible en ese dispositivo)

### Próximo paso (Supabase) — para datos comunitarios reales
Para que el mapa de parkings sea compartido entre TODOS los conductores,
migrar a Supabase. Ver sección "Roadmap" abajo.

---

## 🔧 Personalización antes del deploy

### API Key de Anthropic (asistente IA)

El asistente IA usa la API de Anthropic. En producción, **nunca expongas
la API key en el frontend**. Opciones:

**Opción A — Vercel Edge Function (recomendado):**
```
/api/chat.js  ← Función serverless que hace la llamada a Anthropic
```
La app llama a `/api/chat` en lugar de directamente a `api.anthropic.com`.

**Opción B — Para uso personal/piloto:**
El artifact actual llama directamente a la API desde el navegador.
Funciona para pruebas pero no es seguro para producción pública.

### Variables de entorno en Vercel
```bash
# En el dashboard de Vercel → Settings → Environment Variables
VITE_ANTHROPIC_KEY=sk-ant-...
```

---

## 🗺️ Roadmap

| Fase | Qué | Herramienta | Coste |
|------|-----|-------------|-------|
| ✅ Ahora | PWA + deploy | Vercel | Gratis |
| 2 | Login + datos en nube | Supabase Auth | Gratis hasta 50k usuarios |
| 3 | Mapa comunitario real | Supabase DB | Gratis hasta 500MB |
| 4 | Notificaciones push | Web Push + Supabase | Gratis |
| 5 | Suscripción | Stripe | 2.9% + 0.30€/transacción |

---

## 📋 Funcionalidades incluidas

- ✅ Cuaderno de ruta con motor EU 561/2006 completo
- ✅ Alertas en tiempo real (conducción continua, diaria, semanal, bisemanal)
- ✅ Art. 12 — Excepción de fuerza mayor
- ✅ Descansos por país (España vs. fuera de base)
- ✅ Compensación descanso semanal reducido
- ✅ Timeline del día + vista semanal con gráficas
- ✅ Planificador de ruta con todas las paradas obligatorias
- ✅ Estimador "¿dónde pararé?" en tiempo real
- ✅ Asistente IA normativo con contexto del conductor
- ✅ Mapa comunitario de parkings y puntos negros
- ✅ Perfil del conductor
- ✅ Exportar PDF por día y semana
- ✅ Plantillas de documentos (accidente, avería, control...)
- ✅ Historial buscable
- ✅ Offline parcial (datos locales, mapa en caché)
- ✅ Responsive: móvil, tablet, desktop

---

## 🛟 Soporte

Normativa aplicada: **Reglamento UE 561/2006 · UE 165/2014 · 2022/1012**  
Documento orientativo — siempre consultar con la DGT/MITMA para dudas legales.
