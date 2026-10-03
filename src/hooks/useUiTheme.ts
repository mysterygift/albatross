import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import {
  DEFAULT_UI_THEME,
  UI_THEME_SETTING_KEY,
  applyUiTheme,
  resolveUiTheme,
  type UiThemeId,
} from '@/lib/uiTheme/uiThemes'

/**
 * Reads the saved UI look, applies it to <html> and exposes a setter.
 * Call once near the app root so the theme is applied on every screen.
 */
export function useUiTheme() {
  const queryClient = useQueryClient()

  const { data: uiTheme = DEFAULT_UI_THEME } = useQuery({
    queryKey: ['settings', UI_THEME_SETTING_KEY],
    queryFn: async () => resolveUiTheme(await getSetting(UI_THEME_SETTING_KEY)),
    placeholderData: DEFAULT_UI_THEME,
  })

  useEffect(() => {
    applyUiTheme(uiTheme)
  }, [uiTheme])

  const saveMutation = useMutation({
    mutationFn: (value: UiThemeId) => setSetting(UI_THEME_SETTING_KEY, value),
    onMutate: (value) => {
      // Apply immediately so the switch feels instant; the query catches up after the write.
      applyUiTheme(value)
      queryClient.setQueryData(['settings', UI_THEME_SETTING_KEY], value)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  const setUiTheme = useCallback((value: UiThemeId) => saveMutation.mutate(value), [saveMutation])

  return { uiTheme, setUiTheme, isSaving: saveMutation.isPending }
}
