import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import {
  STANDARD_CONTRIBUTOR_TERMS,
  STANDARD_GUARDIAN_TERMS,
  STANDARD_LOCATION_TERMS,
} from '@/lib/releaseForms/defaultTerms'

/**
 * App-wide release form settings, stored in the `settings` table. An empty or missing terms value
 * means the standard terms. Signed releases keep the terms they were signed under, because the
 * signed PDF is rendered once and never regenerated.
 */
export type ReleaseFormSettings = {
  companyName: string
  contributorTerms: string
  guardianTerms: string
  locationTerms: string
}

export const RELEASE_FORM_SETTING_KEYS = {
  companyName: 'release_forms_company_name',
  contributorTerms: 'release_forms_contributor_terms',
  guardianTerms: 'release_forms_guardian_terms',
  locationTerms: 'release_forms_location_terms',
} as const satisfies Record<keyof ReleaseFormSettings, string>

export const STANDARD_RELEASE_TERMS = {
  contributorTerms: STANDARD_CONTRIBUTOR_TERMS,
  guardianTerms: STANDARD_GUARDIAN_TERMS,
  locationTerms: STANDARD_LOCATION_TERMS,
} as const

export const RELEASE_FORM_SETTINGS_QUERY_KEY = ['settings', 'release_forms'] as const

export async function getReleaseFormSettings(): Promise<ReleaseFormSettings> {
  const [companyName, contributorTerms, guardianTerms, locationTerms] = await Promise.all([
    getSetting(RELEASE_FORM_SETTING_KEYS.companyName),
    getSetting(RELEASE_FORM_SETTING_KEYS.contributorTerms),
    getSetting(RELEASE_FORM_SETTING_KEYS.guardianTerms),
    getSetting(RELEASE_FORM_SETTING_KEYS.locationTerms),
  ])
  return {
    companyName: companyName?.trim() ?? '',
    contributorTerms: contributorTerms?.trim() || STANDARD_RELEASE_TERMS.contributorTerms,
    guardianTerms: guardianTerms?.trim() || STANDARD_RELEASE_TERMS.guardianTerms,
    locationTerms: locationTerms?.trim() || STANDARD_RELEASE_TERMS.locationTerms,
  }
}

/**
 * Saves all settings; terms identical to the standard text are stored empty so they track it. The
 * production company is required: the terms grant their rights to it.
 */
export async function saveReleaseFormSettings(settings: ReleaseFormSettings): Promise<void> {
  if (!settings.companyName.trim()) throw new Error('Enter your production company.')
  const termsValue = (key: keyof typeof STANDARD_RELEASE_TERMS) => {
    const value = settings[key].trim()
    return value === STANDARD_RELEASE_TERMS[key] ? '' : value
  }
  await setSetting(RELEASE_FORM_SETTING_KEYS.companyName, settings.companyName.trim())
  await setSetting(RELEASE_FORM_SETTING_KEYS.contributorTerms, termsValue('contributorTerms'))
  await setSetting(RELEASE_FORM_SETTING_KEYS.guardianTerms, termsValue('guardianTerms'))
  await setSetting(RELEASE_FORM_SETTING_KEYS.locationTerms, termsValue('locationTerms'))
}
