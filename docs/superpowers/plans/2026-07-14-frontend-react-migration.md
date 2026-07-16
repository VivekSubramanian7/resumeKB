# Frontend React Migration — resumeKB

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vanilla HTML/JS static frontend with a React + Vite + shadcn/ui app matching the dark/light mode mocks, with IconPark hover icons, 2-view architecture (Capture + Knowledge), and in-place probe overlay.

**Architecture:** Single-page React app built with Vite + TypeScript. Two main views (Capture, Knowledge) managed by a bottom tab nav. A probe card appears in-place on Capture when a question is pending. The app consumes the existing FastAPI backend unchanged via `/api/*` endpoints. The build output replaces `apps/server/src/resume_kb_server/static/`.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CSS v4, shadcn/ui (Radix primitives), @icon-park/react, @supabase/supabase-js

## Global Constraints

- OKLCH color tokens exactly as defined in `docs/frontend-migration-plan.md` (dark + light palettes)
- 4-step type scale: 0.75rem / 1rem / 1.25rem / 1.5rem only — no in-between sizes
- Fonts: Bricolage Grotesque (body, --font-body), Instrument Serif (display, --font-display)
- Icons: @icon-park/react, outline theme, size 20, strokeWidth 3 — hover state animates fill or color to accent
- All components use shadcn/ui primitives; no custom UI primitives from scratch
- Mobile-first, max-width 640px Knowledge / 520px Capture (matches mocks)
- The build output must be production-static (no SSR) — `vite build` → `dist/` → copied to server static dir
- Existing API contract unchanged: `/api/notes`, `/api/documents`, `/api/notes/text`, `/api/sources/github`, `/api/sources/linkedin`, `/api/kb/entries`, `/api/kb/search`, `/api/config`, `/api/me`
- Auth: Supabase via `@supabase/supabase-js`; when `auth_required=false` (from `/api/config`), skip auth entirely

---

## File Structure

```
apps/web/                         # New React frontend app
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
├── index.html
├── postcss.config.js
├── components.json               # shadcn/ui config
├── src/
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Shell + tab router
│   ├── index.css                 # Tailwind + OKLCH tokens + font imports
│   ├── lib/
│   │   ├── utils.ts              # cn() helper
│   │   └── api.ts                # Fetch wrapper for /api/*
│   ├── hooks/
│   │   ├── use-auth.ts           # Supabase session + token
│   │   └── use-recorder.ts       # MediaRecorder + timer logic
│   ├── components/
│   │   ├── ui/                   # shadcn/ui generated components
│   │   ├── Header.tsx            # Brand + probe trigger + user pill
│   │   ├── BottomNav.tsx         # Tab navigation (Capture / Knowledge)
│   │   ├── ProbeCard.tsx         # Question card with textarea + actions
│   │   ├── RecordButton.tsx      # Record ring + button + timer
│   │   └── SourcePills.tsx       # Upload CV / GitHub / LinkedIn / Text
│   └── views/
│       ├── CaptureView.tsx       # Compose: ProbeCard + RecordButton + Sources
│       └── KnowledgeView.tsx     # Search + filter chips + entry list
└── public/
    └── (empty — fonts via Google CDN)
```

---

### Task 1: Scaffold Vite + React + TypeScript app

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/vite-env.d.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `npm run dev` starts dev server at localhost:5173 proxying `/api` to localhost:8000

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@resume-kb/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "typescript": "~5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

- [ ] **Step 3: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

- [ ] **Step 5: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>resumeKB</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create src/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Create src/App.tsx**

```tsx
export function App() {
  return <div>resumeKB</div>;
}
```

- [ ] **Step 9: Install dependencies and verify dev server starts**

```bash
cd apps/web && npm install && npm run dev -- --host 0.0.0.0 &
sleep 3 && curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML containing `<div id="root">` returned.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Vite + React + TypeScript app"
```

---

### Task 2: Install Tailwind CSS v4 + OKLCH design tokens

**Files:**
- Modify: `apps/web/package.json` (add tailwindcss, @tailwindcss/vite)
- Modify: `apps/web/vite.config.ts` (add tailwind plugin)
- Create: `apps/web/src/index.css` (tokens + tailwind imports + font-face)
- Modify: `apps/web/src/main.tsx` (import index.css)

**Interfaces:**
- Consumes: Vite app from Task 1
- Produces: CSS custom properties available globally; Tailwind utility classes work; dark/light mode toggles via `prefers-color-scheme`

- [ ] **Step 1: Install Tailwind CSS v4**

```bash
cd apps/web && npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add Tailwind plugin to vite.config.ts**

Replace vite.config.ts:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

- [ ] **Step 3: Create src/index.css with OKLCH tokens and Tailwind**

```css
@import "tailwindcss";

@theme {
  --font-display: "Instrument Serif", Georgia, serif;
  --font-body: "Bricolage Grotesque", system-ui, sans-serif;
  --radius-sm: 8px;
  --radius-md: 12px;
  --color-bg: oklch(0.13 0.01 260);
  --color-surface: oklch(0.17 0.012 260);
  --color-surface-raised: oklch(0.20 0.014 260);
  --color-border: oklch(0.26 0.015 260);
  --color-border-subtle: oklch(0.22 0.012 260);
  --color-ink: oklch(0.92 0.01 260);
  --color-ink-muted: oklch(0.62 0.02 260);
  --color-ink-dim: oklch(0.45 0.015 260);
  --color-accent: oklch(0.72 0.15 290);
  --color-accent-soft: oklch(0.25 0.06 290);
  --color-accent-glow: oklch(0.72 0.15 290 / 0.2);
  --color-warm: oklch(0.75 0.12 55);
  --color-success: oklch(0.72 0.14 155);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

@layer base {
  :root {
    --bg: oklch(0.13 0.01 260);
    --surface: oklch(0.17 0.012 260);
    --surface-raised: oklch(0.20 0.014 260);
    --border: oklch(0.26 0.015 260);
    --border-subtle: oklch(0.22 0.012 260);
    --ink: oklch(0.92 0.01 260);
    --ink-muted: oklch(0.62 0.02 260);
    --ink-dim: oklch(0.45 0.015 260);
    --accent: oklch(0.72 0.15 290);
    --accent-soft: oklch(0.25 0.06 290);
    --accent-glow: oklch(0.72 0.15 290 / 0.2);
    --warm: oklch(0.75 0.12 55);
    --success: oklch(0.72 0.14 155);
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: oklch(0.97 0.005 270);
      --surface: oklch(0.94 0.008 270);
      --surface-raised: oklch(1.0 0 0);
      --border: oklch(0.85 0.01 270);
      --border-subtle: oklch(0.90 0.008 270);
      --ink: oklch(0.18 0.02 270);
      --ink-muted: oklch(0.45 0.02 270);
      --ink-dim: oklch(0.60 0.015 270);
      --accent: oklch(0.50 0.22 290);
      --accent-soft: oklch(0.92 0.06 290);
      --accent-glow: oklch(0.50 0.22 290 / 0.15);
      --warm: oklch(0.55 0.15 55);
      --success: oklch(0.45 0.14 155);
    }
  }

  html {
    font-size: 16px;
  }

  body {
    margin: 0;
    min-height: 100dvh;
    font-family: var(--font-body);
    color: var(--ink);
    background: var(--bg);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
}

@layer components {
  .ambient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.35;
    animation: drift 20s ease-in-out infinite alternate;
  }

  @keyframes drift {
    0% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(20px, -15px) scale(1.03); }
    100% { transform: translate(-10px, 8px) scale(0.98); }
  }

  @keyframes probe-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  @keyframes probe-enter {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Add Google Fonts to index.html**

Add to `<head>` in `apps/web/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

- [ ] **Step 5: Import CSS in main.tsx**

Add at top of `src/main.tsx`:

```tsx
import "./index.css";
```

- [ ] **Step 6: Verify Tailwind works**

Update App.tsx temporarily:

```tsx
export function App() {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)] flex items-center justify-center">
      <h1 className="font-[var(--font-display)] text-[1.5rem]">resumeKB</h1>
    </div>
  );
}
```

Run: `cd apps/web && npm run dev`
Expected: Dark background with light text "resumeKB" centered, switches to light on system theme change.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Tailwind v4 with OKLCH design tokens"
```

---

### Task 3: Install shadcn/ui + utility helpers

**Files:**
- Modify: `apps/web/package.json` (add dependencies: tailwind-merge, clsx, class-variance-authority)
- Create: `apps/web/components.json` (shadcn config)
- Create: `apps/web/src/lib/utils.ts` (cn helper)
- Create: `apps/web/postcss.config.js`

**Interfaces:**
- Consumes: Tailwind setup from Task 2
- Produces: `cn()` utility available at `@/lib/utils`; shadcn CLI can generate components into `src/components/ui/`

- [ ] **Step 1: Install shadcn dependencies**

```bash
cd apps/web && npm install tailwind-merge clsx class-variance-authority lucide-react
```

Note: lucide-react is a shadcn peer dep even though we use IconPark for our own icons.

- [ ] **Step 2: Create postcss.config.js**

```js
export default {};
```

- [ ] **Step 3: Create src/lib/utils.ts**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 5: Add shadcn components**

```bash
cd apps/web && npx shadcn@latest add button card input textarea badge toggle-group tabs scroll-area skeleton sonner progress tooltip separator
```

- [ ] **Step 6: Verify components installed**

```bash
ls apps/web/src/components/ui/
```

Expected: `button.tsx`, `card.tsx`, `input.tsx`, etc.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): install shadcn/ui components and cn() utility"
```

---

### Task 4: Install IconPark + build icon wrapper with hover

**Files:**
- Modify: `apps/web/package.json` (add @icon-park/react)
- Create: `apps/web/src/components/Icon.tsx` (hover-aware icon wrapper)

**Interfaces:**
- Consumes: Tailwind CSS tokens (--accent)
- Produces: `<Icon name="Microphone" />` component that renders an IconPark icon with hover transition to accent color

- [ ] **Step 1: Install @icon-park/react**

```bash
cd apps/web && npm install @icon-park/react
```

- [ ] **Step 2: Create src/components/Icon.tsx**

```tsx
import { type CSSProperties } from "react";
import {
  Microphone,
  Brain,
  Upload,
  Github,
  FileText,
  DocSearch,
  Voice,
  BookOpen,
  LinkOne,
} from "@icon-park/react";

const iconMap = {
  Microphone,
  Brain,
  Upload,
  Github,
  FileText,
  DocSearch,
  Voice,
  BookOpen,
  LinkOne,
} as const;

type IconName = keyof typeof iconMap;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, className = "", style }: IconProps) {
  const Component = iconMap[name];
  return (
    <span
      className={`inline-flex transition-colors duration-200 text-[var(--ink-muted)] hover:text-[var(--accent)] ${className}`}
      style={style}
    >
      <Component theme="outline" size={size} strokeWidth={3} />
    </span>
  );
}
```

- [ ] **Step 3: Verify icon renders**

Update App.tsx temporarily:

```tsx
import { Icon } from "./components/Icon";

export function App() {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)] flex items-center justify-center gap-4">
      <Icon name="Microphone" />
      <Icon name="Brain" />
      <Icon name="Voice" />
      <Icon name="BookOpen" />
    </div>
  );
}
```

Run dev server, verify 4 icons render in muted color, each turns accent on hover.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add IconPark with hover-to-accent wrapper"
```

---

### Task 5: API client + auth hook

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/hooks/use-auth.ts`
- Modify: `apps/web/package.json` (add @supabase/supabase-js)

**Interfaces:**
- Consumes: `/api/config` endpoint shape `{ auth_required, supabase_url, supabase_anon_key, max_note_seconds }`
- Produces: `api.get(path)`, `api.post(path, body)`, `api.upload(path, file)` functions with auth token injection; `useAuth()` hook returning `{ user, loading, signIn, signUp, signOut }`

- [ ] **Step 1: Install Supabase client**

```bash
cd apps/web && npm install @supabase/supabase-js
```

- [ ] **Step 2: Create src/lib/api.ts**

```ts
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function headers(): HeadersInit {
  const h: HeadersInit = {};
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

export async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { headers: headers() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function upload<T = unknown>(path: string, file: File, fieldName = "audio"): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  const res = await fetch(path, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

- [ ] **Step 3: Create src/hooks/use-auth.ts**

```ts
import { useCallback, useEffect, useState } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { get, setAccessToken } from "@/lib/api";

interface AppConfig {
  auth_required: boolean;
  supabase_url: string;
  supabase_anon_key: string;
  max_note_seconds: number;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authRequired: boolean;
  maxNoteSeconds: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

let supabase: SupabaseClient | null = null;

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [maxNoteSeconds, setMaxNoteSeconds] = useState(120);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      const config = await get<AppConfig>("/api/config");
      setAuthRequired(config.auth_required);
      setMaxNoteSeconds(config.max_note_seconds);

      if (!config.auth_required) {
        setLoading(false);
        return;
      }

      supabase = createClient(config.supabase_url, config.supabase_anon_key, {
        auth: { persistSession: true, autoRefreshToken: true },
      });

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setAccessToken(data.session.access_token);
        setUser(data.session.user);
      }
      setLoading(false);

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setAccessToken(session?.access_token ?? null);
        setUser(session?.user ?? null);
      });
      sub = listener.subscription;
    })();

    return () => { sub?.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAccessToken(null);
    setUser(null);
  }, []);

  return { user, loading, authRequired, maxNoteSeconds, signIn, signUp, signOut };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/hooks/use-auth.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat(web): add API client and Supabase auth hook"
```

---

### Task 6: App shell — Header + BottomNav + Ambient background

**Files:**
- Create: `apps/web/src/components/Header.tsx`
- Create: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/App.tsx` (compose shell)

**Interfaces:**
- Consumes: `Icon` component (Task 4), `useAuth()` hook (Task 5), CSS tokens (Task 2)
- Produces: `<Header />` with brand + probe trigger + user pill; `<BottomNav activeTab={} onTabChange={} />`; `<App />` renders full shell with ambient orbs + view switching

- [ ] **Step 1: Create src/components/Header.tsx**

```tsx
import { Icon } from "./Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  username: string;
  hasProbeQuestion: boolean;
  onProbeTrigger: () => void;
}

export function Header({ username, hasProbeQuestion, onProbeTrigger }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <h1 className="font-[var(--font-display)] text-[1.25rem] font-normal tracking-tight">
        resumeKB
      </h1>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="relative w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface-raised)]"
          onClick={onProbeTrigger}
          aria-label="Answer a probe question"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-[probe-pulse_2.5s_ease-in-out_infinite]" />
          {hasProbeQuestion && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--warm)] border-2 border-[var(--bg)]" />
          )}
        </Button>
        <Badge variant="outline" className="text-xs text-[var(--ink-muted)] border-[var(--border)] rounded-full px-3 py-1">
          {username}
        </Badge>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create src/components/BottomNav.tsx**

```tsx
import { Icon } from "./Icon";

type Tab = "capture" | "knowledge";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 flex justify-center gap-8 px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg)]/90 backdrop-blur-xl">
      <button
        onClick={() => onTabChange("capture")}
        className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-lg text-xs transition-colors ${
          activeTab === "capture" ? "text-[var(--accent)]" : "text-[var(--ink-dim)]"
        }`}
      >
        <Icon name="Voice" size={20} className={activeTab === "capture" ? "!text-[var(--accent)]" : ""} />
        Capture
      </button>
      <button
        onClick={() => onTabChange("knowledge")}
        className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-lg text-xs transition-colors ${
          activeTab === "knowledge" ? "text-[var(--accent)]" : "text-[var(--ink-dim)]"
        }`}
      >
        <Icon name="BookOpen" size={20} className={activeTab === "knowledge" ? "!text-[var(--accent)]" : ""} />
        Knowledge
      </button>
    </nav>
  );
}
```

- [ ] **Step 3: Update src/App.tsx with shell**

```tsx
import { useState } from "react";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import "./index.css";

type Tab = "capture" | "knowledge";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [probeVisible, setProbeVisible] = useState(false);

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="ambient-orb w-[500px] h-[500px] bg-[oklch(0.35_0.12_290)] -top-[150px] -right-[100px] absolute" style={{ animationDelay: "-5s" }} />
        <div className="ambient-orb w-[350px] h-[350px] bg-[oklch(0.3_0.08_55)] -bottom-[80px] -left-[50px] absolute" style={{ animationDelay: "-10s", animationDuration: "25s" }} />
      </div>

      <div className="relative z-[1] flex flex-col min-h-dvh">
        <Header
          username="praful"
          hasProbeQuestion={!probeVisible}
          onProbeTrigger={() => setProbeVisible(true)}
        />

        <main className="flex-1 w-full max-w-[520px] mx-auto px-6 pt-12 pb-28">
          {activeTab === "capture" && <div>Capture View</div>}
          {activeTab === "knowledge" && <div>Knowledge View</div>}
        </main>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify shell renders**

Run dev server. Expected: Header with "resumeKB" + pulsing probe button + "praful" badge, bottom nav with Capture/Knowledge tabs, ambient gradient orbs behind content.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add app shell with Header, BottomNav, ambient orbs"
```

---

### Task 7: Capture View — ProbeCard + RecordButton + SourcePills

**Files:**
- Create: `apps/web/src/components/ProbeCard.tsx`
- Create: `apps/web/src/components/RecordButton.tsx`
- Create: `apps/web/src/components/SourcePills.tsx`
- Create: `apps/web/src/views/CaptureView.tsx`
- Modify: `apps/web/src/App.tsx` (import CaptureView)

**Interfaces:**
- Consumes: shadcn Card, Button, Textarea, Separator, Skeleton, Sonner; Icon component; useAuth().maxNoteSeconds
- Produces: `<CaptureView probeVisible onProbeDismiss />` rendering the full Capture screen matching mock-capture.html

- [ ] **Step 1: Create src/components/ProbeCard.tsx**

```tsx
import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ProbeCardProps {
  question: string;
  context: string;
  onSave: (answer: string) => void;
  onSkip: () => void;
}

export function ProbeCard({ question, context, onSave, onSkip }: ProbeCardProps) {
  const [answer, setAnswer] = useState("");

  return (
    <Card className="w-full border-[var(--border-subtle)] bg-[var(--surface)] animate-[probe-enter_0.4s_var(--ease-out-expo)]">
      <CardHeader className="pb-0">
        <p className="font-[var(--font-display)] text-[1.5rem] font-normal italic leading-[1.35] text-[var(--ink)]">
          {question}
        </p>
        <p className="text-[0.75rem] text-[var(--ink-muted)] mt-2">
          {context}
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type or tap record to answer with voice..."
          className="min-h-16 bg-[var(--bg)] border-[var(--border)] text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus-visible:ring-[var(--accent-glow)] focus-visible:border-[var(--accent)]"
        />
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={onSkip} className="text-[0.75rem] text-[var(--ink-muted)]">
          Skip
        </Button>
        <Button
          onClick={() => onSave(answer)}
          disabled={!answer.trim()}
          className="text-[0.75rem] bg-[var(--accent)] text-[var(--bg)] hover:shadow-[0_4px_16px_var(--accent-glow)]"
        >
          Save answer
        </Button>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Create src/components/RecordButton.tsx**

```tsx
import { Icon } from "./Icon";

interface RecordButtonProps {
  isRecording: boolean;
  elapsed: number;
  maxSeconds: number;
  onToggle: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordButton({ isRecording, elapsed, maxSeconds, onToggle }: RecordButtonProps) {
  return (
    <section className="flex flex-col items-center gap-5">
      <div className="relative w-[120px] h-[120px] flex items-center justify-center">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border border-[var(--border)]" />
        {/* Inner dashed ring */}
        <div className="absolute inset-2 rounded-full border border-dashed border-[var(--border-subtle)]" />
        {/* Button */}
        <button
          onClick={onToggle}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className="w-[68px] h-[68px] rounded-full bg-[var(--surface-raised)] flex items-center justify-center shadow-[0_4px_20px_oklch(0_0_0/0.3)] transition-transform duration-300 hover:scale-[1.06]"
        >
          {isRecording ? (
            <span className="w-5 h-5 rounded-sm bg-[var(--warm)]" />
          ) : (
            <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" />
          )}
        </button>
      </div>

      <div className="text-center">
        <span className="text-[1rem] font-medium text-[var(--ink)]">{formatTime(elapsed)}</span>
        <span className="text-[0.75rem] text-[var(--ink-dim)] ml-1">/ {formatTime(maxSeconds)}</span>
      </div>

      <p className="text-[0.75rem] text-[var(--ink-dim)] text-center max-w-[28ch]">
        Speak freely — skills, projects, and connections are extracted automatically.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Create src/components/SourcePills.tsx**

```tsx
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";

interface SourcePillsProps {
  onUploadCV: (file: File) => void;
  onGitHub: () => void;
  onLinkedIn: (file: File) => void;
  onTextFile: (file: File) => void;
}

export function SourcePills({ onUploadCV, onGitHub, onLinkedIn, onTextFile }: SourcePillsProps) {
  const cvRef = useRef<HTMLInputElement>(null);
  const linkedInRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="w-full flex items-center gap-4 text-[0.75rem] text-[var(--ink-dim)] tracking-wider">
        <span className="flex-1 h-px bg-[var(--border-subtle)]" />
        or import from
        <span className="flex-1 h-px bg-[var(--border-subtle)]" />
      </div>

      <div className="w-full grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={() => cvRef.current?.click()}
        >
          <Icon name="Upload" size={14} />
          Upload CV
        </Button>
        <input ref={cvRef} type="file" accept=".pdf,.docx" hidden onChange={(e) => e.target.files?.[0] && onUploadCV(e.target.files[0])} />

        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={onGitHub}
        >
          <Icon name="Github" size={14} />
          GitHub
        </Button>

        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={() => linkedInRef.current?.click()}
        >
          <Icon name="LinkOne" size={14} />
          LinkedIn
        </Button>
        <input ref={linkedInRef} type="file" accept=".zip" hidden onChange={(e) => e.target.files?.[0] && onLinkedIn(e.target.files[0])} />

        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={() => textRef.current?.click()}
        >
          <Icon name="FileText" size={14} />
          Text file
        </Button>
        <input ref={textRef} type="file" accept=".txt" hidden onChange={(e) => e.target.files?.[0] && onTextFile(e.target.files[0])} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Create src/views/CaptureView.tsx**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { ProbeCard } from "@/components/ProbeCard";
import { RecordButton } from "@/components/RecordButton";
import { SourcePills } from "@/components/SourcePills";
import * as api from "@/lib/api";

interface CaptureViewProps {
  probeVisible: boolean;
  onProbeDismiss: () => void;
  maxNoteSeconds: number;
}

export function CaptureView({ probeVisible, onProbeDismiss, maxNoteSeconds }: CaptureViewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const handleSaveProbe = (answer: string) => {
    toast.success("Answer saved to KB");
    onProbeDismiss();
  };

  const handleRecord = () => {
    setIsRecording(!isRecording);
  };

  const handleUploadCV = async (file: File) => {
    try {
      const result = await api.upload("/api/documents", file, "document");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const handleGitHub = () => {
    const username = prompt("GitHub username:");
    if (!username) return;
    api.post("/api/sources/github", { username })
      .then((r) => toast.success((r as { message: string }).message))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Import failed"));
  };

  const handleLinkedIn = async (file: File) => {
    try {
      const result = await api.upload("/api/sources/linkedin", file, "export");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const handleTextFile = async (file: File) => {
    try {
      const result = await api.upload("/api/notes/text", file, "document");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="flex flex-col items-center gap-10">
      {probeVisible && (
        <ProbeCard
          question="What made you choose FastAPI over Django or Flask for this project?"
          context='This connects your "resumeKB" project with "Python" and "API Design" skills.'
          onSave={handleSaveProbe}
          onSkip={onProbeDismiss}
        />
      )}

      <RecordButton
        isRecording={isRecording}
        elapsed={elapsed}
        maxSeconds={maxNoteSeconds}
        onToggle={handleRecord}
      />

      <SourcePills
        onUploadCV={handleUploadCV}
        onGitHub={handleGitHub}
        onLinkedIn={handleLinkedIn}
        onTextFile={handleTextFile}
      />
    </div>
  );
}
```

- [ ] **Step 5: Update App.tsx to use CaptureView**

Replace the Capture placeholder in App.tsx:

```tsx
import { CaptureView } from "./views/CaptureView";

// Inside the render, replace {activeTab === "capture" && <div>Capture View</div>}:
{activeTab === "capture" && (
  <CaptureView
    probeVisible={probeVisible}
    onProbeDismiss={() => setProbeVisible(false)}
    maxNoteSeconds={120}
  />
)}
```

- [ ] **Step 6: Add Sonner Toaster to App.tsx**

Add at end of shell (inside the z-1 div):

```tsx
import { Toaster } from "@/components/ui/sonner";

// Inside render, before closing </div>:
<Toaster position="bottom-center" />
```

- [ ] **Step 7: Verify Capture view matches mock**

Run dev server. Compare to `mock-capture.html`: probe card with italic Instrument Serif question, record button with concentric rings, source pills in 2-column grid, divider text.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): build Capture view with ProbeCard, RecordButton, SourcePills"
```

---

### Task 8: Knowledge View — search, filter chips, entry list

**Files:**
- Create: `apps/web/src/views/KnowledgeView.tsx`
- Modify: `apps/web/src/App.tsx` (import KnowledgeView)

**Interfaces:**
- Consumes: shadcn Input, Badge, ToggleGroup, ScrollArea, Skeleton; Icon component; `api.get("/api/kb/entries")` returning `Array<{ slug, title, entry_type, tags }>`; `api.get("/api/kb/search?q=...")` returning `Array<{ slug, title, snippet }>`
- Produces: `<KnowledgeView />` rendering the full Knowledge screen matching mock-knowledge.html

- [ ] **Step 1: Create src/views/KnowledgeView.tsx**

```tsx
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import * as api from "@/lib/api";

interface KBEntry {
  slug: string;
  title: string;
  entry_type: string;
  tags: string[];
}

const ENTRY_TYPES = ["all", "skill", "project", "experience", "person", "organization"];

export function KnowledgeView() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const type = filter === "all" ? undefined : filter;
      const path = type ? `/api/kb/entries?type=${type}` : "/api/kb/entries";
      const data = await api.get<KBEntry[]>(path);
      setEntries(data);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (!q.trim()) {
      fetchEntries();
      return;
    }
    setLoading(true);
    try {
      const results = await api.get<Array<{ slug: string; title: string; snippet: string }>>(`/api/kb/search?q=${encodeURIComponent(q)}`);
      setEntries(results.map((r) => ({ slug: r.slug, title: r.title, entry_type: "", tags: [] })));
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [fetchEntries]);

  return (
    <div className="flex flex-col gap-6 max-w-[640px] w-full mx-auto">
      <div className="flex items-baseline justify-between">
        <h2 className="font-[var(--font-display)] text-[1.5rem] font-normal">Knowledge base</h2>
        <span className="text-[0.75rem] text-[var(--ink-dim)]">{entries.length} entries</span>
      </div>

      <Input
        type="search"
        placeholder="Search entries..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus-visible:ring-[var(--accent-glow)] focus-visible:border-[var(--accent)]"
      />

      <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v)} className="flex flex-wrap gap-1.5 justify-start">
        {ENTRY_TYPES.map((type) => (
          <ToggleGroupItem
            key={type}
            value={type}
            className="px-3 py-1.5 text-[0.75rem] font-medium rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--ink-muted)] data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--accent)] data-[state=on]:border-[var(--accent-soft)]"
          >
            {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1) + "s"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg bg-[var(--surface)]" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-[var(--ink-dim)]">
            <p className="font-[var(--font-display)] text-[1.25rem] italic text-[var(--ink-muted)]">
              No entries yet
            </p>
            <p className="text-[0.75rem] mt-2">Start capturing to build your knowledge base.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.slug}
                className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg cursor-pointer transition-all duration-300 hover:border-[var(--border)] hover:bg-[var(--surface-raised)]"
              >
                {entry.entry_type && (
                  <Badge variant="secondary" className="text-[0.75rem] uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] border-none">
                    {entry.entry_type}
                  </Badge>
                )}
                <span className="text-[1rem] text-[var(--ink)]">{entry.title}</span>
                <span className="ml-auto text-[0.75rem] text-[var(--ink-dim)] flex items-center gap-1">
                  <Icon name="LinkOne" size={12} className="!text-[var(--ink-dim)]" />
                  {entry.tags.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to use KnowledgeView**

```tsx
import { KnowledgeView } from "./views/KnowledgeView";

// Replace {activeTab === "knowledge" && <div>Knowledge View</div>}:
{activeTab === "knowledge" && <KnowledgeView />}
```

Also update main `<main>` max-width to be conditional:

```tsx
<main className={`flex-1 w-full mx-auto px-6 pt-8 pb-28 ${activeTab === "capture" ? "max-w-[520px] pt-12" : "max-w-[640px]"}`}>
```

- [ ] **Step 3: Verify Knowledge view matches mock**

Run dev server. Compare to `mock-knowledge.html`: title + count header, search input, filter chips row, entry list with type badges + titles + link counts. Since API may not be running, verify layout with loading skeletons and empty state.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): build Knowledge view with search, filters, entry list"
```

---

### Task 9: Voice recording hook (MediaRecorder + timer)

**Files:**
- Create: `apps/web/src/hooks/use-recorder.ts`
- Modify: `apps/web/src/views/CaptureView.tsx` (wire hook)
- Modify: `apps/web/src/components/RecordButton.tsx` (no changes needed, already props-driven)

**Interfaces:**
- Consumes: `api.upload("/api/notes", blob, "audio")` — backend expects multipart form with `audio` field
- Produces: `useRecorder(maxSeconds)` returning `{ isRecording, elapsed, start, stop, blob }`

- [ ] **Step 1: Create src/hooks/use-recorder.ts**

```ts
import { useCallback, useEffect, useRef, useState } from "react";

interface RecorderState {
  isRecording: boolean;
  elapsed: number;
  start: () => void;
  stop: () => Promise<Blob | null>;
}

export function useRecorder(maxSeconds: number): RecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const resolveStop = useRef<((blob: Blob | null) => void) | null>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= maxSeconds) {
            mediaRecorder.current?.stop();
            return maxSeconds;
          }
          return e + 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, maxSeconds]);

  const start = useCallback(async () => {
    chunks.current = [];
    setElapsed(0);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      resolveStop.current?.(blob);
      resolveStop.current = null;
    };
    mediaRecorder.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorder.current || mediaRecorder.current.state !== "recording") {
        resolve(null);
        return;
      }
      resolveStop.current = resolve;
      mediaRecorder.current.stop();
    });
  }, []);

  return { isRecording, elapsed, start, stop };
}
```

- [ ] **Step 2: Wire recorder into CaptureView**

Update `CaptureView.tsx`:

```tsx
import { useRecorder } from "@/hooks/use-recorder";

// Inside component, replace the simple state:
const { isRecording, elapsed, start, stop } = useRecorder(maxNoteSeconds);

const handleRecord = async () => {
  if (isRecording) {
    const blob = await stop();
    if (blob) {
      const file = new File([blob], "recording.webm", { type: "audio/webm" });
      try {
        const result = await api.upload("/api/notes", file, "audio");
        toast.success((result as { message: string }).message);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Processing failed");
      }
    }
  } else {
    start();
  }
};
```

Remove the old `const [isRecording, setIsRecording] = useState(false)` and `const [elapsed, setElapsed] = useState(0)` lines.

- [ ] **Step 3: Verify recording flow**

Run dev server. Click record → mic permission prompt → button changes to stop square → timer counts up → click stop → blob sent to /api/notes (will 5xx without backend, but network tab shows the request).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add MediaRecorder hook and wire to Capture view"
```

---

### Task 10: Auth gate + build pipeline

**Files:**
- Modify: `apps/web/src/App.tsx` (add auth gate using useAuth)
- Create: `apps/web/src/components/AuthCard.tsx`
- Modify: `apps/web/vite.config.ts` (add build output to server static)
- Create: `scripts/build-web.sh` (build + copy to server static)

**Interfaces:**
- Consumes: `useAuth()` hook (Task 5)
- Produces: When `auth_required=true`, shows sign-in card before main app; `npm run build` produces `apps/web/dist/` ready to serve as static files

- [ ] **Step 1: Create src/components/AuthCard.tsx**

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AuthCardProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

export function AuthCard({ onSignIn, onSignUp }: AuthCardProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (action: "signin" | "signup") => {
    setError("");
    setLoading(true);
    try {
      if (action === "signin") await onSignIn(email, password);
      else await onSignUp(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 bg-[var(--bg)]">
      <Card className="w-full max-w-sm border-[var(--border-subtle)] bg-[var(--surface)]">
        <CardHeader>
          <h2 className="font-[var(--font-display)] text-[1.5rem] text-[var(--ink)]">
            Sign in to your knowledge base
          </h2>
          <p className="text-[0.75rem] text-[var(--ink-muted)]">Each account has its own private KB.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[var(--bg)] border-[var(--border)] text-[var(--ink)]"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[var(--bg)] border-[var(--border)] text-[var(--ink)]"
          />
          {error && <p className="text-[0.75rem] text-red-400">{error}</p>}
          <div className="flex gap-2 mt-2">
            <Button
              onClick={() => handle("signin")}
              disabled={loading}
              className="flex-1 bg-[var(--accent)] text-[var(--bg)]"
            >
              Sign in
            </Button>
            <Button
              variant="outline"
              onClick={() => handle("signup")}
              disabled={loading}
              className="flex-1 border-[var(--border)] text-[var(--ink-muted)]"
            >
              Sign up
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add auth gate to App.tsx**

Wrap the shell in an auth check:

```tsx
import { useAuth } from "@/hooks/use-auth";
import { AuthCard } from "./components/AuthCard";

export function App() {
  const { user, loading, authRequired, maxNoteSeconds, signIn, signUp, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [probeVisible, setProbeVisible] = useState(false);

  if (loading) {
    return <div className="min-h-dvh bg-[var(--bg)]" />;
  }

  if (authRequired && !user) {
    return <AuthCard onSignIn={signIn} onSignUp={signUp} />;
  }

  // ... rest of shell
}
```

Update the Header username to use `user?.email?.split("@")[0] ?? "local"`.

- [ ] **Step 3: Update vite.config.ts build output**

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

- [ ] **Step 4: Create scripts/build-web.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
npm run build
rm -rf ../server/src/resume_kb_server/static/*
cp -r dist/* ../server/src/resume_kb_server/static/
echo "Built and deployed to server static dir"
```

- [ ] **Step 5: Verify build**

```bash
cd apps/web && npm run build
ls dist/
```

Expected: `index.html`, `assets/` with JS/CSS bundles.

- [ ] **Step 6: Commit**

```bash
git add apps/web scripts/build-web.sh
git commit -m "feat(web): add auth gate and production build pipeline"
```

---

### Task 11: Polish — light/dark ambient orbs + final styling pass

**Files:**
- Modify: `apps/web/src/App.tsx` (conditional ambient orb colors for light mode)
- Modify: `apps/web/src/index.css` (light mode ambient orb overrides, scrollbar styling)

**Interfaces:**
- Consumes: All prior tasks
- Produces: Visual parity with mock HTML files in both dark and light modes; proper scrollbar styling in ScrollArea

- [ ] **Step 1: Add light-mode ambient orb colors**

In App.tsx, the ambient orbs should have different colors per theme. Use CSS classes:

Add to `src/index.css`:

```css
@layer components {
  .orb-primary {
    background: oklch(0.35 0.12 290);
  }
  .orb-secondary {
    background: oklch(0.3 0.08 55);
  }

  @media (prefers-color-scheme: light) {
    .orb-primary {
      background: oklch(0.85 0.12 290);
      opacity: 0.5;
    }
    .orb-secondary {
      background: oklch(0.88 0.08 200);
      opacity: 0.4;
    }
  }
}
```

Update App.tsx orbs to use these classes instead of inline bg colors:

```tsx
<div className="ambient-orb orb-primary w-[500px] h-[500px] -top-[150px] -right-[100px] absolute" ... />
<div className="ambient-orb orb-secondary w-[350px] h-[350px] -bottom-[80px] -left-[50px] absolute" ... />
```

- [ ] **Step 2: Add entry hover glow for light mode**

In KnowledgeView.tsx, update entry `li` hover class:

```
hover:border-[var(--accent)] hover:shadow-[0_2px_8px_var(--accent-glow)]
```

(Replace the existing `hover:border-[var(--border)] hover:bg-[var(--surface-raised)]`)

- [ ] **Step 3: Verify both modes match mocks**

Toggle system dark/light mode. Compare:
- Dark: `mock-capture.html` and `mock-knowledge.html`
- Light: `mock-capture-light.html` and `mock-knowledge-light.html`

Check: orb colors, header bg opacity, entry hover glow, button colors, type badge colors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): polish light/dark ambient orbs and entry hover states"
```

---

## Summary

| Task | Deliverable | ~Lines |
|------|-------------|--------|
| 1 | Vite + React + TS scaffold | 60 |
| 2 | Tailwind v4 + OKLCH tokens | 100 |
| 3 | shadcn/ui + cn() | 30 |
| 4 | IconPark + hover wrapper | 50 |
| 5 | API client + auth hook | 100 |
| 6 | App shell (Header + Nav + Ambient) | 100 |
| 7 | Capture view (Probe + Record + Sources) | 200 |
| 8 | Knowledge view (Search + Filters + List) | 120 |
| 9 | Voice recorder hook | 80 |
| 10 | Auth gate + build | 100 |
| 11 | Light/dark polish | 30 |

Total: ~970 lines of app code across 11 tasks.
