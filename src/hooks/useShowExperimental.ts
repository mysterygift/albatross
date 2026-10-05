import { SHOW_EXPERIMENTAL_SETTING_KEY } from '@/lib/db/repositories/settings'
import { useBooleanSetting } from '@/hooks/useBooleanSetting'

/**
 * Whether experimental features (nav entries marked `experimental`) are shown in the sidebar and
 * search. Persisted in the `settings` table, default off; toggled in Settings → Developer.
 */
export function useShowExperimental() {
  const [showExperimental, setShowExperimental] = useBooleanSetting(SHOW_EXPERIMENTAL_SETTING_KEY)
  return { showExperimental, setShowExperimental }
}
