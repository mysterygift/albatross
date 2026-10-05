import { DEVELOPER_MODE_SETTING_KEY } from '@/lib/db/repositories/settings'
import { useBooleanSetting } from '@/hooks/useBooleanSetting'

/** Developer-mode flag persisted in the `settings` table (default off). */
export function useDeveloperMode() {
  const [developerMode, setDeveloperMode] = useBooleanSetting(DEVELOPER_MODE_SETTING_KEY)
  return { developerMode, setDeveloperMode }
}
