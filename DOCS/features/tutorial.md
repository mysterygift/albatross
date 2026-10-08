# Tutorial and onboarding

A guided, interactive tutorial that runs in the user's own "Tutorial project", a "Get started" checklist on the Dashboard, and the demo productions used for exploring and testing.

## Code map
| Area | Location |
|---|---|
| Engine (state machine, validation, navigation) | `src/features/tutorial/engine/TutorialProvider.tsx`, mounted in `src/app/layout.tsx` around the shell |
| Overlay (spotlight + instruction card) | `src/features/tutorial/engine/TutorialOverlay.tsx` |
| Step/flow types | `src/features/tutorial/engine/types.ts`, context in `engine/context.ts` |
| Domain event bus | `src/features/tutorial/engine/events.ts` |
| Section list and routes | `src/features/tutorial/tutorialSections.ts` |
| Step content (one flow per section) | `src/features/tutorial/sections/*Tutorial.ts`, registered in `src/features/tutorial/flows.ts` |
| Entry modal, section picker, top-bar menu | `TutorialEntryModal.tsx`, `TutorialHome.tsx`, `TutorialMenu.tsx` |
| Progress persistence | `src/features/tutorial/progress.ts` |
| Tutorial project | `src/features/tutorial/tutorialProject.ts`, `src/lib/db/createProductionFromTemplate.ts` (`'tutorial'` template) |
| Prerequisite records | `src/features/tutorial/prerequisites.ts` |
| Checklist and demo banner | `src/features/onboarding/` |
| Demo seed | `src/lib/db/seed/` |
| Tests | `src/features/tutorial/**/*.test.ts(x)`, `src/features/onboarding/*.test.ts(x)` |

## Tutorial engine
- **Sections**: Dashboard, Schedule, Budget, Crew, Cast, Equipment, Locations, Call Sheets, Movement Orders, Tasks, Deliverables, Music & Archive (`TUTORIAL_SECTION_IDS`). Each has a `TutorialFlow` of steps.
- **Starting**: on first launch the `TutorialEntryModal` offers **Start Tutorial** or **Skip for now**. After that, the graduation-cap menu in the top bar (`TutorialMenu`) offers start/continue, pause/resume, restart, per-page tutorial, **Choose a section…** (`TutorialHome`) and **Skip tutorial**. Settings → Demo & tutorial opens the picker or resets progress via router state (`openTutorialHome`, `resetTutorial`). Escape pauses.
- **Run scope**: `all` continues into the next incomplete section when one finishes; `section` stops after one.
- **Tutorial project**: starting any section calls `ensureTutorialProject`, which creates (or reuses) a production named "Tutorial project" from the `tutorial` template (default structure plus a small starter budget) and makes it current. It stays an ordinary production after the tutorial and is never reset or deleted by it.
- **Step anatomy** (`TutorialStep`): `target` matches a `data-tutorial="..."` attribute on the page (the overlay unions all visible matches); optional `route` and `view` (URL param the engine sets, e.g. the stripboard view); `needs` (records that must already exist: scene, shot, shootDay, castMember); `optional`; `passthrough`.
- **Validation** (`requires`):
  - `view`: Next enables once the step's page (and target) is on screen.
  - `click`: the user clicks the target; a click followed by an `event` step advances immediately so the form step is showing when the dialog opens.
  - `event`: a repository write for the tutorial project succeeds and calls `emitTutorialEvent` / `tutorialEmitted` (events listed in `TutorialEventName`). Events for any other production are ignored. Steps never fill or submit forms for the user.
- **Hints**: shown after 20 s idle or when the user goes off-step. While a dialog is open the overlay stops blocking so the form can be completed.

## Progress storage
`first_launch_tutorial_progress` in the `settings` table holds a JSON `FirstLaunchTutorialProgress` (version 2): `seenEntryModal`, `dismissed`, `tutorialProductionId`, `run` (status, section, step, scope), per-section state, and completed step ids per section (ids, not indices, so reordering steps is safe). `sanitizeTutorialProgress` repairs bad data. The legacy boolean `first_launch_tutorial_seen` is kept in sync (`true` when dismissed or all sections complete); it is only read when no structured progress exists. The dev-tools button **Trigger First-Launch Tutorial on Next Load** clears only this flag, so it has no effect once progress is stored (use **Reset tutorial progress** instead). See [settings.md](settings.md).

## Get started checklist
`GetStartedChecklist` on the Dashboard shows five items: create a production (always done), import a script, add cast, build a shoot day, set a budget. Done-ness is derived from counts of script versions, cast, shoot days and budget items for the current production (`deriveChecklist`). **Hide** stores `onboarding_checklist_hidden = 'true'` in `settings`; when everything is done it collapses to "You're set up."

## Demo productions
- Two deterministic demos, matched only by slug (`src/lib/db/seed/constants.ts`): `demo-production-albatross` (Mint Heist, non-episodic) and `demo-episodic-north-shore` (episodic: 3 episodes, shooting blocs).
- They are created on demand from Settings → Demo & tutorial (**Create Demo Production**, **Reset Demo Data**, **Open Demo Production**); nothing seeds them automatically. `ensureDemoData()` creates both if missing; `resetDemoData()` hard-deletes both (and their attachment files), removes the demo exchange rate, and re-seeds. User productions and settings are never touched.
- Seed version and last-seeded time live in `seed_meta` (`src/lib/db/seed/seedMeta.ts`); `SEED_VERSION` is in `constants.ts`.
- `DemoProductionBanner` shows "You're viewing the Demo production" while the Mint Heist demo is current.
- The Productions page can also create a production from the `demo` or `default` template (`createProductionFromTemplate`); `demo` copies demo-style content into a new production without using the demo slug.

## Gotchas
- Seed IDs are fixed UUID-like strings; changing seed content means bumping `SEED_VERSION` and updating the seed tests (`demoBudgetSeed.test.ts`, `northShoreDemoSeed.integration.test.ts`).
- Adding a tutorial step that waits on an event requires the repository write to emit it; otherwise the step can never complete.
- A tutorial target must exist in the DOM as `data-tutorial`; renaming one silently leaves the step waiting.
