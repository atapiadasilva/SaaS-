# HILO Digital — Plataforma AWP Minería (Puerto Collahuasi)

Plataforma de gestión Advanced Work Packaging para el proyecto EIMI00417 (PG210 Área Puerto, CMDIC):
explorador CWP con visor 3D (Autodesk Forge), itemizado/MC, programa P333, módulo IWP, planos y
documentos Aconex con apertura local, estado de pago, conciliación y dashboards por departamento.

Stack: **Next.js 16 + React 19 + Supabase** (BD en la nube compartida — todos los PC apuntan a la misma base).

## Cómo correrlo en un PC nuevo

1. **Requisitos**: [Node.js 20+](https://nodejs.org) y git.

2. **Clonar e instalar**:
   ```bash
   git clone https://github.com/atapiadasilva/SaaS-.git
   cd SaaS-
   npm install
   ```

3. **Variables de entorno**: copiar `.env.example` como `.env.local` y completar los valores
   (pedirlos al dueño del proyecto por canal privado — **nunca están en GitHub**).
   Lo mínimo para partir es el bloque de Supabase.

4. **Arrancar**:
   ```bash
   npm run dev
   ```
   Abrir http://localhost:3000

5. **Acceso**: registrarse en la pantalla de login y pedir al administrador que te **invite a la
   organización** (menú Miembros). Sin membresía, la app carga pero no muestra datos (RLS).

### Notas

- **PDFs de planos/documentos**: los hipervínculos abren archivos locales de las carpetas definidas
  en `ACONEX_DOCS_DIR` (varias rutas separadas por `;`). Sin esas carpetas la app funciona igual,
  solo que sin el link de apertura.
- **Visor 3D**: requiere las credenciales de Autodesk APS en `.env.local`.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (limpia caché problemática de Windows antes de partir) |
| `npm run typecheck` | Chequeo TypeScript completo (`tsc --noEmit`) |
| `npm run smoke` | Smoke test de 11 rutas contra el servidor corriendo |
| `npm run build` | Build de producción |

## Scripts de datos (`scripts/`)

Regla de oro: ninguna tabla se edita a mano — todo entra por fuente versionada y los cruces se recalculan.

- `import-planos-aconex.mjs` — carga paquetización Aconex→CWP a `mining_planos` (con dedupe)
- `check-docs-faltantes.mjs` — cruza documentos de la BD vs PDFs locales y lista faltantes
- `extraer-codigos-eim.py` — extrae el código interno EIM de las carátulas de los PDF
- Se corren con: `node --env-file=.env.local scripts/<script>.mjs`
