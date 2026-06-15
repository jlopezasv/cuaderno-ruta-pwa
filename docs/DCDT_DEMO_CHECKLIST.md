# Checklist — DCDT (solo DEMO)

**Entorno:** https://cuaderno-demo-ab.vercel.app · Supabase `fezacjtbavgdosncxlzw`  
**Acceso UI:** Empresa → Servicios → expandir fila → botón **DCDT**  
**SQL:** `npm run deploy:demo:dcdt` (solo `SUPABASE_DB_URL_DEMO`; nunca producción)

---

## Preparación

- [ ] `VITE_DECA_PUBLIC_BASE_URL=https://cuaderno-demo-ab.vercel.app` en Vercel demo (DeCA / QR en PDF)
- [ ] Migraciones DCDT aplicadas en DEMO (`master_partes_transporte`, `dcdt_servicio`, `deca_public_id`)
- [ ] Usuario tráfico o jefe de flota
- [ ] Conductor con servicio de prueba
- [ ] Frontend demo desplegado con módulo DCDT

---

## 1. Servicio nacional con datos completos

| Paso | Acción | Esperado |
|------|--------|----------|
| 1.1 | Crear servicio carga + descarga, asignar conductor | Sin obligar peso/bultos al crear |
| 1.2 | En paradas, seleccionar cargador y destinatario del catálogo | Vinculado en meta parada |
| 1.3 | Empresa con CIF y domicilio en configuración | Transportista efectivo autorrellenado |
| 1.4 | Abrir **DCDT** en servicio expandido | Modal con datos encontrados |
| 1.5 | Completar mercancía y peso (manual u OCR) | Sin campos pendientes críticos |
| 1.6 | **Validar DCDT** | Estado `validado` |
| 1.7 | **Generar PDF DCDT** | PDF título «Documento de Control del Transporte», subtítulo FOM/2861/2012 |

---

## 2. Servicio con datos faltantes

| Paso | Acción | Esperado |
|------|--------|----------|
| 2.1 | Servicio sin parte cargador ni CIF empresa | Banner «Pendientes» con lista de campos |
| 2.2 | Estado automático | `incompleto` o `pendiente_ocr` según CMR |
| 2.3 | **Validar DCDT** con pendientes | Bloqueado + toast |

---

## 3. OCR CMR / albarán

| Paso | Acción | Esperado |
|------|--------|----------|
| 3.1 | Conductor sube CMR/albarán (evidencia tipo `cmr`) | Solo foto/documento, sin formularios legales |
| 3.2 | Tráfico: **Completar desde OCR** | Rellena mercancía, peso, matrícula si existen en OCR |
| 3.3 | Estado tras OCR | Pasa a `pendiente_validacion` si datos completos |

---

## 4. Conductor (mínimo)

| Paso | Acción | Esperado |
|------|--------|----------|
| 4.1 | Conductor NO rellena NIF, domicilio, precio ni contrato | Sin formularios DCDT en app conductor |
| 4.2 | Solo sube CMR/foto y confirma operación en muelle | Flujo operativo habitual |

---

## 5. Expediente operacional

| Paso | Acción | Esperado |
|------|--------|----------|
| 5.1 | Con DCDT validado, abrir expediente operacional lite | Bloque DCDT como primera sección |
| 5.2 | Generar PDF expediente | DCDT antes de portada operacional; anexos CMR/evidencias después |
| 5.3 | Estado DCDT tras incluir en expediente | `incluido_en_expediente` |

---

## 6. No debe aparecer (pausado)

- [ ] Botones «Carta de Porte» / «Generar Carta de Porte»
- [ ] Carta de Porte Nacional 10 bis
- [ ] Contrato mercantil, porte pagado/debido, precio transporte
- [ ] Tab dedicado DCDT en menú empresa (solo desde servicio expandido)

---

## SQL verificación

```sql
SELECT servicio_id, estado, validado_at FROM dcdt_servicio ORDER BY updated_at DESC LIMIT 5;
```

---

## Registro

| Fecha | Tester | Ref. servicio | Resultado | Notas |
|-------|--------|---------------|-----------|-------|
| | | | ☐ OK / ☐ KO | |
