# 01 Foundations: shared UI primitives

## Goal
Add new shared primitives only: `PageHeader`, `EmptyState`, `ConfirmDialog`, a sonner toast host, `RequireProduction`, `DashboardCard`. **No page adoption** (steps 02-09 do that). Each primitive ships with a unit test.

## Prerequisites
- Branch `ui-experimental`, base commit 737f7db. No earlier steps.
- **New dependency needed: `sonner`** (not in `package.json`, not in `node_modules`). The executor/orchestrator must run `npm install sonner` in the worktree; `node_modules` is a symlink here, so do not install from inside this step. If it cannot be installed, stop and report.

## Files to touch (exhaustive)
New:
- `src/components/page-header.tsx` + `page-header.test.tsx`
- `src/components/empty-state.tsx` + `empty-state.test.tsx`
- `src/components/ui/confirm-dialog.tsx` + `confirm-dialog.test.tsx`
- `src/components/ui/sonner.tsx` (Toaster wrapper) + `sonner.test.tsx`
- `src/components/require-production.tsx` + `require-production.test.tsx`
- `src/components/dashboard-card.tsx` + `dashboard-card.test.tsx`
Edit:
- `src/app/providers.tsx` (mount `<Toaster />` inside `TooltipProvider`, as sibling after `ProductionProvider`)
- `package.json` / `package-lock.json` (sonner, via the executor)

## Reuse
- `src/components/ui/dialog.tsx`: exports `Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription`. `DialogContent` has `showCloseButton`, `dismissOnOutsideInteraction` (default false; keep default for confirms so a stray click cannot dismiss).
- `src/components/ui/button.tsx` (`variant="destructive"` / `outline`), `card.tsx`, `skeleton.tsx`, `alert.tsx`, `tabs.tsx`, `src/lib/utils.ts` (`cn`).
- `src/features/productions/context.tsx`: `useCurrentProduction()` returns `{ currentProductionId, currentProduction, productions, ... }`.
- Test style: `src/components/ui/dialog.test.tsx` (`// @vitest-environment jsdom`, `@testing-library/react`, `userEvent`, `cleanup()`).
- Use semantic tokens only (`bg-card`, `text-muted-foreground`, `border-border`), never `zinc-*` (themes).

## Concrete tasks
1. `PageHeader` (`src/components/page-header.tsx`):
   ```ts
   export type PageHeaderProps = {
     title: string
     description?: ReactNode
     actions?: ReactNode          // right-aligned, wraps on narrow widths
     tabs?: ReactNode             // rendered under the title row (caller passes <Tabs>/SegmentedControl)
     className?: string
   }
   ```
   Renders `<header data-slot="page-header">` with exactly one `<h1 className="text-2xl font-semibold">`; description as `<p className="text-muted-foreground text-sm">`.
2. `EmptyState` (`src/components/empty-state.tsx`):
   ```ts
   export type EmptyStateProps = {
     icon?: LucideIcon
     title: string
     description?: ReactNode
     action?: ReactNode           // usually a <Button>
     className?: string
   }
   ```
   Centered dashed-border card, `role="status"`, `data-slot="empty-state"`.
3. `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`), built on Dialog:
   ```ts
   export type ConfirmDialogProps = {
     open: boolean
     onOpenChange: (open: boolean) => void
     title: string
     description?: ReactNode
     confirmLabel?: string        // default 'Confirm'
     cancelLabel?: string         // default 'Cancel'
     destructive?: boolean        // confirm button variant="destructive"
     onConfirm: () => void | Promise<void>
   }
   ```
   Confirm click awaits `onConfirm`, disables both buttons while pending, then calls `onOpenChange(false)`. If `onConfirm` throws, keep dialog open and rethrow nothing (caller toasts). Cancel/Escape call `onOpenChange(false)`.
   Also export a hook `useConfirm()` returning `{ confirm(opts): Promise<boolean>, dialog: ReactNode }` for call sites that were imperative `window.confirm(...)` (render `{dialog}` once in the component). Step 03 relies on this.
4. Toaster (`src/components/ui/sonner.tsx`): wrap `Toaster` from `sonner` with `theme="system"`, `position="bottom-right"`, `richColors`, `closeButton`, and `toastOptions.classNames` using semantic tokens so UI themes apply. Re-export `toast` from sonner (`export { Toaster, toast }`) so pages import from `@/components/ui/sonner`. Mount `<Toaster />` in `providers.tsx`.
5. `RequireProduction` (`src/components/require-production.tsx`):
   ```ts
   export type RequireProductionProps = {
     title?: string               // page title shown above the empty state; omitted = no heading
     children: ReactNode
   }
   ```
   If `currentProductionId` is null, render `PageHeader` (when `title`) + `EmptyState` (title "No production selected", description "Choose a production to continue.", actions: Button linking to `/productions` ("Manage productions")). Otherwise render `children`. Step 02 extends the empty action with the switcher; keep the empty-state action a single internal constant so 02 can edit it.
6. `DashboardCard` (`src/components/dashboard-card.tsx`):
   ```ts
   export type DashboardCardProps = {
     title: string
     icon?: LucideIcon
     status: 'loading' | 'error' | 'empty' | 'ready'
     emptyMessage?: string
     errorMessage?: string
     onRetry?: () => void
     action?: ReactNode           // header-right link/button
     children?: ReactNode         // shown only when status === 'ready'
   }
   ```
   Built on `Card/CardHeader/CardTitle/CardContent`; loading shows 3 `Skeleton` rows; error shows message + retry Button.
7. Tests (one file per component, jsdom): header renders single h1/actions/tabs; empty-state action click; confirm-dialog confirm/cancel/destructive/pending/throws/`useConfirm` resolves true/false; sonner `toast('x')` text appears after rendering `<Toaster />`; require-production with `ProductionContext` mocked (`vi.mock('@/features/productions/context')` for `useCurrentProduction`) renders children vs empty state (wrap in `MemoryRouter`); dashboard-card four statuses.

## Out of scope
Adopting any primitive in a page, router/sidebar/top-bar edits, replacing `window.confirm` or toast booleans, token migration of existing pages.

## Acceptance checks
- `npm run build && npm test && npm run lint:ci` all green (no new lint warnings; baseline cap is 60).
- Manual: temporarily none required; optionally `npm run dev` and confirm app boots with Toaster mounted and no console errors.
- `git diff --stat` shows only the files listed above.

## Commit message
`feat(ui): add shared foundations (PageHeader, EmptyState, ConfirmDialog, toasts, RequireProduction, DashboardCard)`
