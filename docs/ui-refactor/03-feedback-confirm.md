# 03 Feedback: ConfirmDialog and toasts

## Goal
Replace every `window.confirm` with `ConfirmDialog`/`useConfirm`, and every ad-hoc toast/banner boolean with sonner toasts (`toast.success/error/message`), adding "Undo" actions where cheap.

## Prerequisites
- Step 01 committed (`src/components/ui/confirm-dialog.tsx` with `useConfirm`, `src/components/ui/sonner.tsx` exporting `toast`, Toaster mounted in `src/app/providers.tsx`; `sonner` installed). Step 02 not required.

## Files to touch (exhaustive)
`window.confirm` call sites (re-grep `window\.confirm|\bconfirm\(` first):
- `src/features/settings/page.tsx:601` (delete group), `:804` (reset tutorial progress)
- `src/features/schedule/storyboard-page.tsx:805`, `:900`
- `src/features/admin/ProjectAccessPage.tsx:313` (remove project access)
- `src/features/readiness/task-template-ui.tsx:182` (delete template)
- `src/features/readiness/page.tsx:915-916` (delete section; message differs when tasks will be moved)
- `src/features/budget/page.tsx:3621` (delete template)
Toast/banner state to replace (grep `Toast`, `banner`):
- `src/features/schedule/stripboard-page.tsx`: states at 333-359 (`unscheduleToast`, `boneyardToast`, `newDaySuccessToast`, `addSecondUnitSuccessToast`, `removeSecondUnitSuccessToast`), setters at 514, 560, 770, 781, 1092, 1196, 1478, the auto-clear `useEffect`s at ~700-731, JSX banners at ~892-915
- `src/features/settings/page.tsx`: `colorToast` (161, 387-393), `tutorialToast` (164, 399, 806), `orsApiKeyToast` (166, 268-269) and their JSX
- `src/features/schedule/calendar-page.tsx`: `toast` (1058, 1074-1077, 1114, 1172-1174, 1813, JSX 1705-1710)
- `src/features/people/components/bookings/BookingsCalendarView.tsx`: `toast`/`notify` (133, 211-216, JSX 568-573)
- `src/features/budget/page.tsx`: `recodeToast` (267, 978-979, JSX)
- `src/app/layout.tsx`: `completionToast` (200, 231-239, JSX ~397-402)
- `src/features/productions/page.tsx`: `actionToast` (461, 482-483, 593-605, 677-725, 1317-1324, JSX)
- `src/features/productions/ApfMenuEventBridge.tsx` (`banner`, 25, JSX 273) and `ApfDesktopOpenBridge.tsx` (`banner`, 21, 107-129): convert only the success/error message banners; leave the progress-phase UI (`phase !== 'idle'`) in ApfDesktopOpenBridge alone.
- NOT touched: `src/components/dev/DevPerfHud.tsx`, `script-import-page.tsx` `spellingBannerDismissed` (persistent dismissible banner, not a toast), `dashboard` `wrapSuccess` Alert.
- Update/add tests only where existing tests reference removed banners (`grep -rn` the removed text in `*.test.tsx`).

## Reuse
- `useConfirm()` / `ConfirmDialog` from `@/components/ui/confirm-dialog`; `toast` from `@/components/ui/sonner`.
- Existing success/failure messages: keep the exact strings.
- Existing undo-capable data helpers: stripboard unschedule/boneyard handlers (~760-785) call repository updates; reuse the previous values captured in the handler.

## Concrete tasks
1. For each `window.confirm` site, call `const { confirm, dialog } = useConfirm()`, render `{dialog}` once in the component, and convert the guard to `if (!(await confirm({ title, description, confirmLabel: 'Delete', destructive: true }))) return`. Make the enclosing handler `async` (check callers). Inline `onClick` closures such as `budget/page.tsx:3621` and `task-template-ui.tsx:182` live in sub-components: call the hook in that sub-component, not the parent. `storyboard-page.tsx` two sites sit inside map callbacks: hoist `useConfirm` to the page component.
2. Stripboard: delete the five state variables, their `useEffect` timers and JSX banners; replace each setter call with `toast.success('<same text>')`. For "Shot moved to Unscheduled." and boneyard moves, add `action: { label: 'Undo', onClick }` that restores the prior schedule/boneyard state using the values captured before the mutation; if restore needs more than one repository call, skip Undo and just toast.
3. Settings, calendar, bookings calendar, budget recode, layout completion, productions page, Apf bridges: delete state/timers/JSX; use `toast.success` / `toast.error` (error type determined by `msg.type` or the catch path). In productions page keep `msg.timeoutMs` as `toast(..., { duration: msg.timeoutMs })`.
4. Remove now-unused imports (`useEffect`, `Alert`, etc.) so `lint:ci` stays under its warning cap.
5. Do not change business logic, only presentation of feedback.

## Out of scope
Page header/empty-state adoption, token cleanup, i18n, redesigning dialogs that already are real `Dialog`s, inline form-validation errors, persistent alerts.

## Acceptance checks
- `npm run build && npm test && npm run lint:ci` green.
- `grep -rnE "window\.confirm" src` returns nothing; `grep -rnE "set[A-Za-z]*Toast" src` returns nothing in the files above.
- Manual (`npm run dev`): delete a settings group, a readiness section (with tasks: message mentions moved tasks), a budget template -> styled dialog, Cancel/Escape does nothing, Confirm performs delete. Move a stripboard shot to Unscheduled -> toast with Undo that works. Change account colour in Settings -> toast. Error paths (e.g. calendar "Move failed.") show an error toast.

## Commit message
`feat(ui): replace window.confirm and ad-hoc banners with ConfirmDialog and toasts`
