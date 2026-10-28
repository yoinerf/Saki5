# Saki5 · El Campo Nos Une

Marketplace de productos del campo colombiano y turismo comunitario. React 19 + Vite + Tailwind CSS v4 en el
frontend; toda la lógica de servidor vive en Supabase (RLS, RPCs, Edge Functions).

## Comandos

- `pnpm dev` - servidor de desarrollo de Vite
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` - lo mismo que corre el CI antes de desplegar

## Estructura

- `src/main.tsx` - punto de entrada; importa `src/index.css` y monta `src/App.tsx`
- `src/App.tsx` - componente principal y navegación entre pantallas
- `src/screens/` - pantallas; `src/components/` - componentes compartidos; `src/lib/` - lógica, tipos y acceso a Supabase
- `src/index.css` - CSS global e import de Tailwind CSS v4
- `index.html` - HTML base con metadatos SEO
- `public/staticwebapp.config.json` - rutas y cabeceras de seguridad (CSP) de Azure Static Web Apps
- `supabase/migrations/` - migraciones SQL; `supabase/functions/` - Edge Functions (Deno)
- `vite.config.ts` - React, Tailwind CSS v4 y el alias `@` para `src`

## Despliegue

Azure Static Web Apps (`.github/workflows/`). El CI instala con pnpm (`pnpm-lock.yaml`) y Azure (Oryx) con npm
(`package-lock.json`): al cambiar dependencias hay que actualizar los dos lockfiles.

## Estilo de código

- Strings con apóstrofo entre comillas dobles (`"We're here"`), o escapado en comillas simples.
- Los componentes se exportan como `export default`.
- Código, comentarios y textos de la interfaz en español.
