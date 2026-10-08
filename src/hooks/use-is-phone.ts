import { useEffect, useState } from 'react'

import { isPhoneViewport, PHONE_MAX_WIDTH, PHONE_VIEWPORT_QUERY } from '@/lib/platform'

/**
 * Phone-sized viewport (iPhone portrait or landscape); follows rotation. The single phone/not-phone switch:
 * the tab bar, the sidebar's sheet mode and the page layouts all use it. See `PHONE_VIEWPORT_QUERY`.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(isPhoneViewport)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(PHONE_VIEWPORT_QUERY)
    const onChange = () => setIsPhone(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isPhone
}

/**
 * Narrower than Tailwind's `md` (an iPhone held upright), following rotation. For width-only decisions
 * such as how a dialog or toolbar wraps; use `useIsPhone` to choose phone navigation and layouts. It
 * tolerates environments without `matchMedia` (tests), where it reports false.
 */
export function usePhoneWidth(): boolean {
  const query = `(max-width: ${PHONE_MAX_WIDTH}px)`
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
