---
name: CampoConecta Project Instructions
description: "React 19 + Vite + Tailwind CSS v4 + Supabase project. Use when: writing React components, building screens, organizing TypeScript code, styling with Tailwind, or working on CampoConecta features."
applyTo: ["**/*.tsx", "**/*.ts", "src/**"]
---

# CampoConecta Development Guide

This project is a React 19 + Vite + Tailwind CSS v4 application backed by Supabase. Follow these conventions to maintain consistency and quality.

## React & TypeScript Patterns

### Component Structure
- **Export as default**: All React components must be default exports
- **Functional components only**: Use modern React 19 with hooks; avoid class components
- **File naming**: Use PascalCase for component files (e.g., `PaymentModal.tsx`, `HomeScreen.tsx`)
- **Props typing**: Always explicitly type component props with interfaces or types
  ```typescript
  interface ButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }
  
  export default function Button({ label, onClick, disabled = false }: ButtonProps) {
    return <button onClick={onClick} disabled={disabled}>{label}</button>;
  }
  ```

### TypeScript Best Practices
- Use strict types; avoid `any`
- Prefer interfaces for component props, use types for utility types
- Import types explicitly: `import type { ComponentType } from 'react'`
- Keep types colocated with components unless they're shared across multiple files

### Hooks & State Management
- Use `useState` for local component state
- Use `useEffect` only when side effects are necessary; watch your dependencies carefully
- Prefer compound components or context over prop drilling for complex data flows
- For global state (auth, user data), use context via `src/lib/` utilities if not already in place

## Project Structure & Organization

### File Organization
**Screens** (`src/screens/`): Full-page components representing distinct views
- `HomeScreen.tsx`, `LoginScreen.tsx`, `ProfileScreen.tsx`, etc.
- Each screen handles its own routing and high-level layout
- Screens import reusable components from `src/components/`

**Components** (`src/components/`): Reusable UI elements
- Modular, single-responsibility components
- Examples: `PaymentModal.tsx`, `ScreenShell.tsx`, `SuccessToast.tsx`
- Components should NOT contain business logic; accept data and callbacks as props

**Libraries** (`src/lib/`): Utilities and client initialization
- `supabase.ts`: Database/auth client setup
- Shared utilities, helpers, or API clients
- Keep business logic separate from UI

### Naming Conventions
- Components: PascalCase (`PaymentModal`, `ProfileScreen`)
- Functions/variables: camelCase (`handleSubmit`, `userEmail`)
- Constants: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RETRIES`)
- Directories: kebab-case when using multi-word names (e.g., `payment-hooks/`)

## Tailwind CSS v4 Styling

### Configuration & Imports
- Tailwind is configured via `@tailwindcss/vite` plugin in `vite.config.ts`
- Global styles imported in `src/index.css` with `@import 'tailwindcss';`
- No separate `tailwind.config.js` needed unless custom theme is required
- Font definitions belong in `src/index.css`, applied via CSS custom properties or `font-family` defaults

### Utility-First Approach
- Use Tailwind utility classes directly in JSX
- Avoid writing custom CSS unless absolutely necessary
- For component-scoped styles, use Tailwind's `@apply` directive sparingly in `src/index.css`
- Example: `<button className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-white">`

### Dark Mode & Responsive
- Use Tailwind's responsive prefixes: `md:`, `lg:`, `xl:` for breakpoints
- If dark mode is needed, enable via `vite.config.ts` and use `dark:` prefix
- Always test on multiple screen sizes

## Code Quality

### String Handling
- Use **double quotes** for strings containing apostrophes: `"We're here to help"`
- Single quotes for simple strings: `'Hello world'`
- Escape apostrophes in single-quoted strings if needed: `'We\'re here'`
- This ensures the build does not break due to unescaped characters

### JSX Syntax
- Always close JSX tags: `<Component />` (self-closing) or `<Component>...</Component>`
- Balance braces: check that all `{` have matching `}`
- Use fragments `<>...</>` when you don't need a wrapper element

### Imports & Dependencies
- Group imports: React first, then third-party, then local
  ```typescript
  import React, { useState } from 'react';
  import HomeScreen from '@/screens/HomeScreen';
  import { supabase } from '@/lib/supabase';
  ```
- Use the `@` alias for `src/` imports (configured in `vite.config.ts`)
- Tree-shake unused imports

## Build & Preview

- Run `pnpm dev` for the local dev server
- Run `pnpm build` to create the production bundle
- Run `pnpm preview` to test the production build locally

## Testing & Validation

Before committing:
1. Ensure all components export as defaults
2. Verify all JSX is properly closed and balanced
3. Check that no `any` types are used
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`

## When in Doubt

- Refer to existing screens in `src/screens/` for layout patterns
- Check `src/components/` for common component implementations
- See `AGENTS.md` for detailed project structure and dependencies
- Keep components small and focused; extract reusable logic to `src/lib/`
