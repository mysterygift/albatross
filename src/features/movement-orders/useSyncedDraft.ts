import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Local editable copy of a value stored as JSON on the server. It reloads when `key` changes
 * (a different shoot day or unit) or the stored JSON changes while there are no unsaved local
 * edits, so a save finishing never overwrites something typed since.
 */
export function useSyncedDraft<T>(args: {
  key: string | null
  savedJson: string | null
  parse: (json: string | null) => T
  serialize: (value: T) => string | null
}): [T, Dispatch<SetStateAction<T>>] {
  const { key, savedJson, parse, serialize } = args
  const [value, setValue] = useState<T>(() => parse(savedJson))
  const valueRef = useRef(value)
  const lastSynced = useRef<{ key: string | null; json: string | null }>({ key, json: savedJson })

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    const previous = lastSynced.current
    const keyChanged = previous.key !== key
    const dirty = !keyChanged && serialize(valueRef.current) !== previous.json
    lastSynced.current = { key, json: savedJson }
    if (keyChanged || !dirty) setValue(parse(savedJson))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parse/serialize are stable module functions
  }, [key, savedJson])

  return [value, setValue]
}
