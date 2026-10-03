import { describe, it, expect } from 'vitest'
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  parseSettingsSection,
  sectionFromSearchParams,
  visibleSettingsSections,
} from './settingsSections'

describe('parseSettingsSection', () => {
  it('accepts valid ids', () => {
    expect(parseSettingsSection('integrations')).toBe('integrations')
    expect(parseSettingsSection('budget-accounts')).toBe('budget-accounts')
  })
  it('falls back to production for missing/invalid', () => {
    expect(parseSettingsSection(null)).toBe('production')
    expect(parseSettingsSection('')).toBe('production')
    expect(parseSettingsSection('nope')).toBe('production')
  })
  it('gates developer on developer mode', () => {
    expect(parseSettingsSection('developer', false)).toBe('production')
    expect(parseSettingsSection('developer', true)).toBe('developer')
  })
})

describe('sectionFromSearchParams', () => {
  it('prefers section over legacy tab', () => {
    expect(sectionFromSearchParams(new URLSearchParams('section=appearance&tab=apis'))).toBe('appearance')
  })
  it('maps legacy tabs', () => {
    expect(sectionFromSearchParams(new URLSearchParams('tab=budget'))).toBe('production')
    expect(sectionFromSearchParams(new URLSearchParams('tab=people'))).toBe('people')
    expect(sectionFromSearchParams(new URLSearchParams('tab=apis'))).toBe('integrations')
    expect(sectionFromSearchParams(new URLSearchParams('tab=developer_tools'))).toBe('production')
    expect(sectionFromSearchParams(new URLSearchParams('tab=developer_tools'), true)).toBe('developer')
    expect(sectionFromSearchParams(new URLSearchParams('tab=zzz'))).toBe('production')
  })
})

describe('section registry', () => {
  it('has unique ids and every section belongs to a known group', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const groups = new Set(SETTINGS_GROUPS.map((g) => g.id))
    for (const s of SETTINGS_SECTIONS) expect(groups.has(s.group)).toBe(true)
  })
  it('every group has at least one section', () => {
    for (const g of SETTINGS_GROUPS) {
      expect(SETTINGS_SECTIONS.some((s) => s.group === g.id)).toBe(true)
    }
  })
  it('hides developer section when developer mode is off', () => {
    expect(visibleSettingsSections(false).some((s) => s.id === 'developer')).toBe(false)
    expect(visibleSettingsSections(true).some((s) => s.id === 'developer')).toBe(true)
  })
})
