import { describe, expect, it } from 'vitest'
import { DEFAULT_UI_THEME, isUiThemeId, resolveUiTheme } from './uiThemes'

describe('uiThemes', () => {
  it('keeps Albatross Mint as the default', () => {
    expect(DEFAULT_UI_THEME).toBe('albatross-mint')
  })

  it('recognises only the known theme ids', () => {
    expect(isUiThemeId('albatross-mint')).toBe(true)
    expect(isUiThemeId('bold')).toBe(true)
    expect(isUiThemeId('yuzu')).toBe(true)
    expect(isUiThemeId('sunset')).toBe(true)
    expect(isUiThemeId('signal')).toBe(true)
    expect(isUiThemeId('ledger')).toBe(true)
    expect(isUiThemeId('clay')).toBe(true)
    expect(isUiThemeId('night')).toBe(true)
    expect(isUiThemeId('neon')).toBe(false)
    expect(isUiThemeId(null)).toBe(false)
  })

  it('falls back to the default for missing or unknown stored values', () => {
    expect(resolveUiTheme(null)).toBe('albatross-mint')
    expect(resolveUiTheme(undefined)).toBe('albatross-mint')
    expect(resolveUiTheme('')).toBe('albatross-mint')
    expect(resolveUiTheme('not-a-theme')).toBe('albatross-mint')
  })

  it('returns a stored known theme unchanged', () => {
    expect(resolveUiTheme('yuzu')).toBe('yuzu')
    expect(resolveUiTheme('sunset')).toBe('sunset')
  })

  it('maps the retired albatross-bold value to the new Bold theme', () => {
    expect(resolveUiTheme('albatross-bold')).toBe('bold')
  })
})
