import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { getRate } from '@/lib/money/exchangeRates'
import { formatMoney } from '@/lib/money/formatMoney'

export type ConversionStatus = 'disabled' | 'idle' | 'loading' | 'success' | 'fallback'

export function useCurrency() {
  const queryClient = useQueryClient()
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus>('idle')
  const [displayRate, setDisplayRate] = useState<number | null>(null)

  const { data: displayCurrency = 'GBP' } = useQuery({
    queryKey: ['settings', 'display_currency'],
    queryFn: () => getSetting('display_currency'),
    placeholderData: 'GBP',
  })

  const { data: conversionApiEnabled = false } = useQuery({
    queryKey: ['settings', 'enable_currency_conversion_api'],
    queryFn: async () => (await getSetting('enable_currency_conversion_api')) === 'true',
    placeholderData: false,
  })

  const setDisplayCurrencyMutation = useMutation({
    mutationFn: (value: string) => setSetting('display_currency', value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  const setConversionApiEnabledMutation = useMutation({
    mutationFn: (value: boolean) => setSetting('enable_currency_conversion_api', value ? 'true' : 'false'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setDisplayRate(null)
      setConversionStatus('idle')
    },
  })

  const setDisplayCurrency = useCallback(
    (value: string) => setDisplayCurrencyMutation.mutate(value),
    [setDisplayCurrencyMutation]
  )

  const setConversionApiEnabled = useCallback(
    (value: boolean) => setConversionApiEnabledMutation.mutate(value),
    [setConversionApiEnabledMutation]
  )

  const ensureRate = useCallback(
    async (productionCurrency: string) => {
      const base = (productionCurrency || 'GBP').toLowerCase()
      const display = (displayCurrency || 'GBP').toLowerCase()
      if (base === display) {
        setDisplayRate(1)
        setConversionStatus('idle')
        return
      }
      if (!conversionApiEnabled) {
        setDisplayRate(null)
        setConversionStatus('disabled')
        return
      }
      setConversionStatus('loading')
      const rate = await getRate(base, display)
      if (rate != null) {
        setDisplayRate(rate)
        setConversionStatus('success')
      } else {
        setDisplayRate(null)
        setConversionStatus('fallback')
      }
    },
    [displayCurrency, conversionApiEnabled]
  )

  const effectiveDisplayCurrency = useMemo(() => {
    if (displayRate != null) return displayCurrency ?? 'GBP'
    return null
  }, [displayRate, displayCurrency])

  const format = useCallback(
    (amount: number, productionCurrency: string): { formatted: string; currency: string; converted: boolean } => {
      const base = productionCurrency || 'GBP'
      const display = displayCurrency || 'GBP'
      if (base === display) {
        return { formatted: formatMoney(amount, base), currency: base, converted: false }
      }
      if (!conversionApiEnabled || displayRate == null) {
        return { formatted: formatMoney(amount, base), currency: base, converted: false }
      }
      return {
        formatted: formatMoney(amount * displayRate, display),
        currency: display,
        converted: true,
      }
    },
    [displayCurrency, conversionApiEnabled, displayRate]
  )

  const conversionBanner = useMemo((): string | null => {
    if (!conversionApiEnabled && (displayCurrency ?? 'GBP') !== 'GBP') {
      return "Conversion disabled. Values are shown in the production's base currency."
    }
    if (!conversionApiEnabled) return null
    if (conversionStatus === 'fallback') {
      return 'Exchange rate unavailable offline; showing base currency values.'
    }
    return null
  }, [displayCurrency, conversionApiEnabled, conversionStatus])

  return {
    displayCurrency: displayCurrency ?? 'GBP',
    setDisplayCurrency,
    conversionApiEnabled: conversionApiEnabled ?? false,
    setConversionApiEnabled,
    conversionStatus,
    format,
    formatMoney: (amount: number, currency: string) => formatMoney(amount, currency),
    conversionBanner,
    ensureRate,
    effectiveDisplayCurrency,
  }
}
