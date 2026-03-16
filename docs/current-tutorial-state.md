### Tutorial state – developer overview

**Purpose:**  
Show a one‑time “first launch” tutorial overlay when the app shell first loads, persisted via the settings repo so it doesn’t reappear after completion (unless explicitly reset).

---

### Persistence model

- **Settings key**
  - Key: **`first_launch_tutorial_seen`**
  - Constant: `FIRST_LAUNCH_TUTORIAL_SEEN_KEY` in `src/lib/db/repositories/settings.ts`.
- **Helpers**

  ```12:26:src/lib/db/repositories/settings.ts
  export const FIRST_LAUNCH_TUTORIAL_SEEN_KEY = 'first_launch_tutorial_seen'

  export async function getFirstLaunchTutorialSeen(): Promise<boolean> {
    try {
      const value = await getSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY)
      if (value === null) return false
      return value === 'true'
    } catch {
      return false
    }
  }

  export async function setFirstLaunchTutorialSeen(seen: boolean): Promise<void> {
    try {
      await setSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY, seen ? 'true' : 'false')
    } catch {
    }
  }
  ```

- **Semantics**
  - `null` / missing / any error ⇒ treated as **not seen** ⇒ tutorial should show.
  - `'true'` ⇒ tutorial completed / skipped.
  - `'false'` ⇒ tutorial should show.

---

### Hook: `useFirstLaunchTutorial`

- **Location:** `src/hooks/useFirstLaunchTutorial.ts`
- **API:**

  ```1:40:src/hooks/useFirstLaunchTutorial.ts
  type FirstLaunchTutorialState = {
    isLoading: boolean
    showFirstLaunchTutorial: boolean
    completeFirstLaunchTutorial: () => void
    resetFirstLaunchTutorial: () => void
  }
  ```

- **Behavior:**
  - On mount:
    - Calls `getFirstLaunchTutorialSeen()` asynchronously.
    - Sets `showFirstLaunchTutorial` to `!seen`.
    - Sets `isLoading` to `false` when finished.
  - `completeFirstLaunchTutorial()`:
    - Immediately hides the tutorial (`showFirstLaunchTutorial = false`).
    - Writes setting to `'true'` (fire‑and‑forget).
  - `resetFirstLaunchTutorial()`:
    - Sets `showFirstLaunchTutorial = true`.
    - Writes setting to `'false'`.

---

### UI: `FirstLaunchTutorial` component

- **Location:** `src/components/FirstLaunchTutorial.tsx`
- **Props:**

  ```1:12:src/components/FirstLaunchTutorial.tsx
  type FirstLaunchTutorialProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onComplete: () => void
  }
  ```

- **Behavior:**
  - Uses shared `Dialog` primitives for an overlay over the app shell.
  - Simple one‑screen intro highlighting Dashboard, Schedule, and Budget/People.
  - Both **“Get started”** and **“Skip for now”**:
    - Call `onComplete()` (mark as seen).
    - Then close the dialog via `onOpenChange(false)`.

---

### Integration point: `AppLayout` (first app “window”)

- **Location:** `src/app/layout.tsx`
- **Role:** Root app shell (sidebar + top bar + `Outlet`) – effectively your first window.
- **Logic:**

  ```12:35:src/app/layout.tsx
  export function AppLayout() {
    const [tutorialOpen, setTutorialOpen] = useState(false)
    const { isLoading: tutorialLoading, showFirstLaunchTutorial, completeFirstLaunchTutorial } =
      useFirstLaunchTutorial()

    useEffect(() => {
      if (!import.meta.env.DEV) return
      getSetting(DB_PERF_SETTING_KEY)
        .then((v) => setPerfLoggingEnabled(v !== 'false'))
        .catch(() => {})
    }, [])

    useEffect(() => {
      if (!tutorialLoading && showFirstLaunchTutorial) {
        setTutorialOpen(true)
      }
    }, [tutorialLoading, showFirstLaunchTutorial])

    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar />
          <main className="flex-1 overflow-auto p-4">
            <Outlet />
          </main>
        </SidebarInset>
        <DevPerfHud />
        <FirstLaunchTutorial
          open={tutorialOpen}
          onOpenChange={setTutorialOpen}
          onComplete={completeFirstLaunchTutorial}
        />
      </SidebarProvider>
    )
  }
  ```

- **Flow:**
  - On first shell mount, the hook loads the setting.
  - When `isLoading` is false and `showFirstLaunchTutorial` is true, `tutorialOpen` is set true.
  - `FirstLaunchTutorial` is rendered within the shell so it overlays any route.

---

### Developer controls: Triggering the tutorial via Settings

- **Location:** `src/features/settings/page.tsx`, Developer Tools tab.
- **Imports:**

  ```69:76:src/features/settings/page.tsx
  import { getSetting, setSetting, FIRST_LAUNCH_TUTORIAL_SEEN_KEY, setFirstLaunchTutorialSeen } from '@/lib/db/repositories/settings'
  ```

- **Button:**

  ```579:610:src/features/settings/page.tsx
  <Button
    variant="outline"
    size="sm"
    onClick={async () => {
      await setFirstLaunchTutorialSeen(false)
      queryClient.invalidateQueries({ queryKey: ['settings', FIRST_LAUNCH_TUTORIAL_SEEN_KEY] })
      // The tutorial will appear on next app load when AppLayout reads the setting.
    }}
  >
    Trigger First-Launch Tutorial on Next Load
  </Button>
  ```

- **Usage:**
  - Click this button in **Settings → Developer Tools** to reset the flag.
  - On the **next app load**, `AppLayout` will treat the tutorial as unseen and open the overlay again.

---

### Summary of behavior

- **First time / flag missing or false**:  
  On initial shell mount, once settings load, the first‑launch dialog opens and blocks/overlays the main content. Completing or skipping marks the setting as seen and prevents it from showing again.

- **Subsequent loads**:  
  If `first_launch_tutorial_seen === 'true'`, the hook never opens the dialog.

- **Manual testing / re‑trigger**:  
  Use the Developer Tools button, or call `resetFirstLaunchTutorial()` if you need to drive it from other code.