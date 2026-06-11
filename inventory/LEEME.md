# Inventario Supabase — dónde van los archivos

Carpeta del proyecto:

```
cuaderno-ruta-pwa/inventory/
```

| Archivo | Qué es |
|---------|--------|
| `real.json` | Inventario de **Producción** |
| `demo.json` | Inventario de **Demo** |
| `gap-report.md` | Informe de diferencias (se genera al comparar) |
| `demo-gap-fill.sql` | SQL sugerido para alinear demo (opcional) |

**Importante:** Ejecutar `audit-supabase-inventory.sql` en el SQL Editor de Supabase **no guarda nada aquí solo**. Hay que exportar los JSON (método A o B).

---

## Método A — Automático (recomendado)

### Paso 1 — Contraseñas de base de datos

En cada proyecto Supabase → **Settings** → **Database** → **Connection string** → URI.

- Producción: ref `glyexutcypmhkndvmcxd`
- Demo: ref `fezacjtbavgdosncxlzw`

### Paso 2 — Archivo `.env.local`

En la raíz del proyecto (`cuaderno-ruta-pwa`), crea o edita `.env.local`:

```env
SUPABASE_DB_URL_REAL=postgresql://postgres.glyexutcypmhkndvmcxd:TU_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
SUPABASE_DB_URL_DEMO=postgresql://postgres.fezacjtbavgdosncxlzw:TU_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

(Sustituye `TU_PASSWORD` y la región si tu panel muestra otra URL.)

### Paso 3 — Exportar y comparar

Abre PowerShell en la carpeta del proyecto:

```powershell
cd "c:\Users\José López\Documents\GitHub\cuaderno-ruta-pwa"
node scripts/export-supabase-inventory.mjs --compare
```

### Paso 4 — Abrir el informe

```
inventory\gap-report.md
```

---

## Método B — Manual (si ya ejecutaste el SQL en el Editor)

### Paso 1 — Producción

1. Supabase → proyecto **glyexutcypmhkndvmcxd** → **SQL Editor**
2. Pega todo `scripts/audit-supabase-inventory.sql` → **Run**
3. Verás **una fila**, columna **`inventory`** con un JSON largo
4. Copia **todo** ese JSON (empieza por `{` y termina en `}`)
5. Abre el Bloc de notas → pega → **Guardar como**:

```
c:\Users\José López\Documents\GitHub\cuaderno-ruta-pwa\inventory\real.json
```

- Tipo: **Todos los archivos**
- Nombre exacto: `real.json`

### Paso 2 — Demo

Repite en proyecto **fezacjtbavgdosncxlzw** y guarda como:

```
c:\Users\José López\Documents\GitHub\cuaderno-ruta-pwa\inventory\demo.json
```

### Paso 3 — Generar informe

```powershell
cd "c:\Users\José López\Documents\GitHub\cuaderno-ruta-pwa"
node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json
```

### Paso 4 — Abrir

- `inventory\gap-report.md`
- `inventory\demo-gap-fill.sql`

---

## Comprobar que existen los archivos

```powershell
dir inventory
```

Debes ver al menos `real.json`, `demo.json` y `gap-report.md`.
