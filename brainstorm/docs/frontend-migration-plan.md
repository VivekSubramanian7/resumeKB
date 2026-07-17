# Frontend Migration Plan — resumeKB

## Architecture

Two views + in-place probe overlay:

| View | Purpose |
|------|---------|
| **Capture** | Voice recorder + upload sources (CV, GitHub, LinkedIn, Text). Feed your brain. |
| **Knowledge** | Browse KB entries, search, filter chips, wikilink counts. See what you know. |
| **Probe (in-place)** | Pulsing trigger in header → question card appears above recorder. Text + voice answers saved as Q&A pairs. |

## Design Tokens (OKLCH)

### Dark mode
```
--bg: oklch(0.13 0.01 260)
--surface: oklch(0.17 0.012 260)
--surface-raised: oklch(0.20 0.014 260)
--border: oklch(0.26 0.015 260)
--border-subtle: oklch(0.22 0.012 260)
--ink: oklch(0.92 0.01 260)
--ink-muted: oklch(0.62 0.02 260)
--ink-dim: oklch(0.45 0.015 260)
--accent: oklch(0.72 0.15 290)
--accent-soft: oklch(0.25 0.06 290)
--accent-glow: oklch(0.72 0.15 290 / 0.2)
```

### Light mode
```
--bg: oklch(0.97 0.005 270)
--surface: oklch(0.94 0.008 270)
--surface-raised: oklch(1.0 0 0)
--border: oklch(0.85 0.01 270)
--border-subtle: oklch(0.90 0.008 270)
--ink: oklch(0.18 0.02 270)
--ink-muted: oklch(0.45 0.02 270)
--ink-dim: oklch(0.60 0.015 270)
--accent: oklch(0.50 0.22 290)
--accent-soft: oklch(0.92 0.06 290)
--accent-glow: oklch(0.50 0.22 290 / 0.15)
```

## Typography

- Display/questions: Instrument Serif (italic)
- Body: Bricolage Grotesque
- Type scale (4-step): 0.75rem → 1rem → 1.25rem → 1.5rem (1.25 ratio)

## Icons — IconPark (ByteDance)

**Package:** `@icon-park/react`
**Install:** `npm install @icon-park/react`
**Stylesheet:** `import '@icon-park/react/styles/index.css'`

### Usage
```tsx
import { Voice, Brain, Upload, Github } from '@icon-park/react';

<Voice theme="outline" size={20} strokeWidth={3} />
```

**Props:** `theme` (outline|filled|two-tone|multi-color), `size`, `fill`, `strokeWidth`, `strokeLinecap`, `strokeLinejoin`

### Icon Mapping

| UI Element | IconPark Name | Theme |
|------------|---------------|-------|
| Record button | `Microphone` | outline |
| Probe trigger (header) | `Brain` | outline |
| Upload CV source | `Upload` | outline |
| GitHub source | `Github` | outline |
| LinkedIn source | `LinkIn` | outline |
| Text file source | `FileText` | outline |
| KB search | `DocSearch` | outline |
| Nav: Capture | `Voice` | outline |
| Nav: Knowledge | `BookOpen` | outline |
| Wikilinks count | `Link` | outline |
| Skip action | `SkipNext` or none | — |

## shadcn/ui Components

**Install all at once:**
```bash
npx shadcn@latest add card button input textarea badge toggle-group tabs scroll-area skeleton sonner progress tooltip input-group
```

### Component Mapping by View

#### Capture View

| UI Element | shadcn Component | Notes |
|------------|-----------------|-------|
| Probe card | `Card` (CardHeader, CardContent, CardFooter) | Question + context + textarea + actions |
| Probe text input | `Textarea` | Auto-resize, placeholder "Type or tap record..." |
| Save answer button | `Button` | Primary variant |
| Skip button | `Button` variant="ghost" | Secondary action |
| Timer display | Custom + `Progress` | Circular progress around record button |
| Source pills (Upload/GitHub/etc) | `Button` variant="outline" | With IconPark icons inline |
| Upload file trigger | `Button` variant="outline" + hidden `<input type="file">` | Native file picker |
| Section divider | `Separator` or custom styled `<div>` | "or import from" text |
| Loading state (transcription) | `Skeleton` | While voice is being processed |
| Success toast | `Sonner` (toast) | "Answer saved to KB" confirmation |

#### Knowledge View

| UI Element | shadcn Component | Notes |
|------------|-----------------|-------|
| Search input | `Input` or `InputGroup` with search icon addon | InputGroup preferred — icon + input + results count |
| Filter chips (All/Skills/Projects/...) | `ToggleGroup` type="single" | Each chip is a `ToggleGroupItem` |
| KB entry list | `ScrollArea` + custom list items | Scrollable, each entry is a clickable row |
| Entry type badge | `Badge` variant="secondary" | Uppercase label (PROJECT, SKILL, EXPERIENCE) |
| Entry wikilink count | `Badge` variant="outline" | "4 links" displayed |
| Entry hover detail | `Tooltip` | Show preview on hover (desktop) |
| Empty state | `Card` with centered text | "No entries yet. Start capturing." |
| Loading entries | `Skeleton` repeated | Placeholder rows while fetching |

#### Shared (Header + Nav)

| UI Element | shadcn Component | Notes |
|------------|-----------------|-------|
| Probe trigger button | `Button` variant="ghost" size="icon" | Custom pulsing animation via CSS |
| User pill | `Badge` variant="outline" | Username display |
| Bottom nav | `Tabs` (TabsList + TabsTrigger) | Styled as bottom bar, 2 items: Capture / Knowledge |
| Notification dot | CSS pseudo-element on Button | Orange dot when probe question available |

#### Interaction Patterns

| Action | Component | Behavior |
|--------|-----------|----------|
| Answer saved | `Sonner` toast | Brief "Saved to KB" with undo option |
| Voice recording active | `Progress` (circular) | Animate around record button |
| Transcription in progress | `Skeleton` in probe card area | Pulse while processing |
| File upload success | `Sonner` toast | "CV uploaded — 12 entries extracted" |
| Search results empty | Inline empty state | "No matches" with clear filter suggestion |

### Why These Components

- **Card** — perfect for the probe question container (has header/content/footer slots)
- **InputGroup** — search with icon addon matches the KB search pattern exactly
- **ToggleGroup** — single-select filter chips with active state built in
- **Badge** — entry type labels + wikilink counts, multiple variants
- **ScrollArea** — smooth scroll for KB entry list with custom scrollbar styling
- **Sonner** — toast notifications that auto-dismiss (save confirmations)
- **Skeleton** — loading states during transcription/extraction
- **Progress** — recording timer visualization
- **Tooltip** — entry previews on hover without navigation

## Migration Steps

1. ✅ Solidify color scheme (dark + light OKLCH tokens)
2. ✅ Define IA (2 views + probe)
3. ✅ Select icon pack (IconPark)
4. ⬜ Map shadcn components to UI elements
5. ⬜ Scaffold React app (Vite + React + TypeScript)
6. ⬜ Install shadcn/ui + configure theme with OKLCH tokens
7. ⬜ Install @icon-park/react
8. ⬜ Build Capture view
9. ⬜ Build Knowledge view
10. ⬜ Build Probe overlay
11. ⬜ Wire to existing FastAPI backend
