import { useEffect, useState } from 'react'

import { isPhoneViewport, PHONE_MAX_WIDTH } from '@/lib/platform'

/** Phone-sized viewport (iPhone portrait or landscape); follows rotation. See `isPhoneViewport`. */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(isPhoneViewport)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px), (max-height: 500px)`)
    const onChange = () => setIsPhone(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isPhone
}
