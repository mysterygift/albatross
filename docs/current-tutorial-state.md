# Tutorial system – current state

This document describes the onboarding and first-launch tutorial system as implemented. It is intended for developers new to the project who need to understand behaviour, state, and where to change things.

---

## Purpose and flow (high level)

- **First launch:** When the user has never completed or dismissed the tutorial, they see a **pre-tutorial entry modal** (“Welcome to Albatross”) with **Start Tutorial** and **Skip for now**.
- **Start Tutorial:** The app ensures the **demo production** exists (creates/seeds if needed), sets it as the current production, then opens **Tutorial Home** (the hub).
- **Skip for now:** The entry modal closes. The demo production is **not** created or opened. The user can still reopen the tutorial later from the top bar or Settings.
- **Tutorial Home:** A hub dialog that lists six sections (Dashboard, Schedule, Budget, Crew, Cast, Equipment). The user can start/resume/review each section. Each section has a **section tutorial** (multi-step panel) on its corresponding page.
- **Reopen:** From the **top bar** (help icon) or **Settings → Developer Tools → Open Tutorial Home**, the user opens Tutorial Home **directly** (no entry modal).
- **Reset:** From Tutorial Home or Settings, the user can reset tutorial progress. After reset, the **entry modal** can show again on the next appropriate load (e.g. next app launch).

Only **one** of the entry modal and Tutorial Home is visible at any time; they never both show.

---

## Key files and roles

| Path | Role |
|------|------|
| `src/app/layout.tsx` | Root shell. Owns entry-modal vs Tutorial Home visibility, calls `useFirstLaunchTutorial`, wires Start Tutorial and reset flows to `prepareDemoForTutorialHub` (demo ensure + query invalidation), handles location state for “open Tutorial Home” / “reset”. |
| `src/hooks/useFirstLaunchTutorial.ts` | Loads and exposes tutorial progress and flags (`showFirstLaunchTutorial`, `progress`). Exposes `skipEntryModal`, `completeFirstLaunchTutorial`, `resetFirstLaunchTutorial`, `updateProgress`. Syncs with persisted progress and legacy “seen” setting. |
| `src/features/tutorial/progress.ts` | Defines `FirstLaunchTutorialProgress` and section state types. `getFirstLaunchTutorialProgress()` / `setFirstLaunchTutorialProgress()` read/write structured JSON. `sanitizeProgress()` normalises loaded data so malformed or partial state doesn’t break the app. |
| `src/features/tutorial/TutorialEntryModal.tsx` | Pre-tutorial gate: “Welcome to Albatross”, Start Tutorial (with loading/error), Skip for now. |
| `src/features/tutorial/TutorialHome.tsx` | Hub dialog: section list (Start / Resume / Review), Skip for now, Continue later, Reset. Shows a demo-production notice and “Open demo production” when current production is not the demo. |
| `src/features/tutorial/ensureAndOpenDemoProductionForTutorial.ts` | Async helper: ensures demo production exists (via `ensureDemoData()`), then sets it as current production via optional callback. Used from layout’s `prepareDemoForTutorialHub` (Start Tutorial, reset → hub, section navigation, Open demo production). |
| `src/features/tutorial/tutorialSections.ts` | Defines `TUTORIAL_SECTION_IDS` and `TUTORIAL_SECTIONS` (id, title, description, route, icon). Single source of truth for section list and routes. |
| `src/features/tutorial/SectionTutorialPanel.tsx` | Per-section multi-step panel (steps, next/back, complete / continue later). Used on each section page (dashboard, schedule, budget, crew, cast, equipment). |
| `src/features/tutorial/sections/*.ts` | Step content for each section (e.g. `dashboardTutorial.ts`, `budgetTutorial.ts`). Export arrays of `TutorialStep` (id, title, body). |
| `src/components/top-bar.tsx` | Renders the help (tutorial) button; calls `onOpenTutorial` (from layout) so clicking opens Tutorial Home. |
| `src/lib/db/repositories/settings.ts` | `FIRST_LAUNCH_TUTORIAL_SEEN_KEY`, `getFirstLaunchTutorialSeen()`, `setFirstLaunchTutorialSeen()`. Legacy boolean kept in sync when progress is dismissed or all complete. |

---

## Persistence

- **Structured progress**  
  - Key: `first_launch_tutorial_progress` (see `progress.ts`).  
  - Stored as JSON. Contains: `seenEntryModal`, `seenIntro`, `dismissed`, `currentSection`, `sections` (per-section state), `sectionSteps` (optional step index per section).  
  - Read via `getFirstLaunchTutorialProgress()` (with sanitisation and legacy fallback). Written via `setFirstLaunchTutorialProgress()`.

- **Legacy “seen” flag**  
  - Key: `first_launch_tutorial_seen` in settings.  
  - Set to `'true'` when the user dismisses Tutorial Home or completes all sections; set to `'false'` on reset.  
  - Used together with structured progress to decide whether to show first-launch onboarding.

---

## State model: `FirstLaunchTutorialProgress`

- **`seenEntryModal`** – `true` once the user has either skipped or started from the entry modal. Prevents the entry modal from showing again on subsequent loads.
- **`seenIntro`** – Set when the user has seen the Tutorial Home intro (e.g. after opening the hub).
- **`dismissed`** – `true` when the user clicks “Skip for now” in Tutorial Home (dismisses the hub; section progress is preserved).
- **`currentSection`** – Section id when a section tutorial is active (e.g. `'budget'`); `null` when none.
- **`sections`** – `Record<TutorialSectionId, TutorialSectionState>` where state is `'not_started' | 'in_progress' | 'complete'`.
- **`sectionSteps`** – Optional `Partial<Record<TutorialSectionId, number>>` for the current step index per section.

Default shape is from `getDefaultTutorialProgress()`. After load, `sanitizeProgress()` ensures only valid section ids and states are used so bad or migrated data doesn’t crash the app.

---

## Hook: `useFirstLaunchTutorial`

**Location:** `src/hooks/useFirstLaunchTutorial.ts`

**Returns:**

- `isLoading` – `true` until progress (and legacy seen) has been loaded.
- `showFirstLaunchTutorial` – `true` when the user is in “first-launch” mode: not dismissed, not all complete, and legacy seen is false.
- `progress` – `FirstLaunchTutorialProgress | null` (null until load completes).
- `completeFirstLaunchTutorial()` – Marks the tutorial as dismissed (sets `dismissed` and `seenIntro`, syncs legacy seen). Used when the user clicks “Skip for now” in Tutorial Home.
- `resetFirstLaunchTutorial()` – Resets progress to default (including `seenEntryModal: false`) and sets legacy seen to false. Does **not** touch demo production or other app data.
- `skipEntryModal()` – Sets `seenEntryModal: true` and persists. Used when the user clicks “Skip for now” on the **entry** modal. Does not create/open demo or mark tutorial complete.
- `updateProgress(updater)` – Applies an updater to `progress`, persists, and dispatches a custom event so other subscribers stay in sync.

Progress changes are also broadcast via the custom event `first_launch_tutorial_progress_changed` so multiple consumers see updates.

---

## When the entry modal is shown

In `AppLayout`, the entry modal is shown only when **all** of the following hold:

- Tutorial has finished loading (`!tutorialLoading`).
- `progress` is non-null (avoids showing before state is ready).
- `showFirstLaunchTutorial` is true (user not dismissed, not all complete, legacy seen false).
- `progress.seenEntryModal` is false (user has not yet skipped or started from the entry modal).

So: first-time users see the entry modal once; after they skip or start, `seenEntryModal` is set and they won’t see it again until a full reset.

---

## Start Tutorial flow (entry modal → Tutorial Home)

1. User clicks **Start Tutorial** in the entry modal.
2. Layout sets loading state (disables buttons, shows “Preparing tutorial…”).
3. `prepareDemoForTutorialHub()` runs: `ensureAndOpenDemoProductionForTutorial({ setCurrentProductionId })`, then invalidates `productions`, `crew`, `people`, and `deliverables` queries and refetches the production list (same idea as Settings → Create Demo Production).
4. On success: `updateProgress(prev => ({ ...prev, seenEntryModal: true }))`, entry modal closes, Tutorial Home opens.
5. On failure: error message is shown in the modal (`role="alert"`); user can retry. Loading is cleared.

No navigation or extra UI is done inside the seed helper; layout owns query refresh after the demo row exists and current production is set.

---

## Demo production and Tutorial Home

- The **canonical demo production** is identified by slug `DEMO_SLUG` (`'demo-production-albatross'` in `src/lib/db/seed/constants.ts`). Creation/seeding is via `ensureDemoData()` in `src/lib/db/seed/demoProductionSeed.ts`.
- **Tutorial Home** receives `isDemoProductionCurrent` (derived from `currentProduction?.slug === DEMO_SLUG`) and an `onOpenDemoProduction` callback that runs the same `prepareDemoForTutorialHub()` path as Start Tutorial (idempotent if the demo already exists).
- After **tutorial reset** (from Tutorial Home or Settings with reset), layout runs `prepareDemoForTutorialHub()` before the user continues, so the demo production is created again if it was missing (e.g. user reset or deleted demo data earlier).
- Starting a **section** from the hub (Start / Resume / Review) also runs `prepareDemoForTutorialHub()` first so navigation never assumes a demo that is not there.
- If demo preparation fails, Tutorial Home shows an alert (`role="alert"`) with **Dismiss**; **Open demo production** retries the same prepare path.
- If the user has switched away from the demo production while in the hub, Tutorial Home shows a short notice: “This tutorial is designed for the demo production” and an **Open demo production** button. The app does not hard-fail if the wrong production is selected.

---

## Reopen and reset

- **Reopen (top bar or Settings):**  
  - Top bar help button calls `onOpenTutorial` from layout, which closes the entry modal (if it were open), clears any startup error, and opens Tutorial Home.  
  - Settings → Developer Tools → **Open Tutorial Home** navigates with `state: { openTutorialHome: true }`. Layout’s effect sees this, closes the entry modal, and opens Tutorial Home. So reopening **always** goes straight to Tutorial Home, not the entry modal.

- **Reset:**  
  - **Tutorial Home:** “Reset tutorial” button → confirmation “Reset tutorial progress?” → `resetFirstLaunchTutorial()` then `prepareDemoForTutorialHub()` (with a short “Preparing demo production…” overlay on the hub). The hub stays open with fresh progress; the demo production is ensured if absent.  
  - **Settings:** “Reset tutorial progress” → same confirmation → navigate with `state: { openTutorialHome: true, resetTutorial: true }`. Layout runs `resetFirstLaunchTutorial()`, then `prepareDemoForTutorialHub()`, then opens Tutorial Home (same ensure-if-missing behaviour).  
  - Reset clears all tutorial progress (including `seenEntryModal: false`) and the legacy seen flag. It does **not** delete or reset the demo production or other app/settings by itself; immediately after reset, **prepare** recreates the canonical demo if it does not exist. After reset, the **entry modal** can show again on the next appropriate onboarding trigger (e.g. next app load when `showFirstLaunchTutorial` is true).

---

## Section tutorials (per-page panels)

- Each of the six sections has a **section tutorial** (multi-step panel) defined in `src/features/tutorial/sections/<section>Tutorial.ts` (e.g. `dashboardTutorial.ts`, `budgetTutorial.ts`). Each exports an array of steps (`TutorialStep`: id, title, body).
- The **Dashboard**, **Schedule**, **Budget**, **Crew**, **Cast**, and **Equipment** pages each:
  - Use `useFirstLaunchTutorial()` for `progress` and `updateProgress`.
  - Render `SectionTutorialPanel` with the appropriate `sectionId`, steps, and handlers. The panel’s open state is driven by `progress?.currentSection === sectionId` (and similar) so it appears when the user has started or resumed that section from Tutorial Home.
  - On “Complete” they mark the section complete and clear `currentSection`; on “Continue later” they just close the panel (section stays `in_progress`).

Section progress and step index are stored in `progress.sections` and `progress.sectionSteps` and persisted by the hook.

---

## Developer testing (Settings)

- **Settings → Developer Tools** (Developer build):
  - **Open Tutorial Home** – Opens the hub (via location state).
  - **Reset tutorial progress** – Resets progress and opens Tutorial Home (with confirmation).
  - **Trigger First-Launch Tutorial on Next Load** – Sets `first_launch_tutorial_seen` to false so that on the **next app load** the first-launch logic can show the entry modal again (if progress also indicates eligibility).

---

## Modal and UI rules

- **Entry modal and Tutorial Home** are mutually exclusive: opening one closes the other (handled in `AppLayout`).
- **Section tutorial panels** are non-modal and only shown on the matching route when `currentSection` is that section; closing a panel does not open Tutorial Home automatically.
- **Resilience:** Loaded progress is sanitised (`sanitizeProgress()`). Missing or invalid settings/defaults are handled so the app falls back to a safe default progress instead of throwing.

---

## Summary

- **First launch:** Entry modal → Start (prepare demo, open Tutorial Home) or Skip (close modal, set `seenEntryModal`; no demo).
- **Tutorial Home:** Hub for six sections; can be opened from entry (after Start) or from top bar / Settings (reopen). Dismissing the hub sets `dismissed` and legacy seen; progress is kept.
- **Reset:** Clears progress (including `seenEntryModal`) and legacy seen; then ensures the demo production exists and selects it (if missing) via `prepareDemoForTutorialHub`; entry modal can show again on next eligible load.
- **Demo:** Start Tutorial, reset → hub, section picks from the hub, and **Open demo production** all use `prepareDemoForTutorialHub` so the canonical demo exists and queries refresh; Tutorial Home can still prompt to open the demo if the user switched production.

All behaviour is driven by the persisted progress and legacy seen flag, with layout and hook implementing the above rules.
