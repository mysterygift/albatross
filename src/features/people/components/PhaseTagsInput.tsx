'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PRESET_PRODUCTION_PHASES,
  addPhases,
  formatPhaseLabel,
  getCustomPhases,
  isPresetSelected,
  removePhase,
  togglePresetPhase,
} from '@/lib/people/productionPhases'
import { cn } from '@/lib/utils'

export function PhaseTagsInput({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (phases: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const customPhases = getCustomPhases(value)

  const commitDraft = () => {
    const next = addPhases(value, [draft])
    if (next.length !== value.length || draft.trim()) {
      onChange(next)
    }
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <Label>Phases</Label>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_PRODUCTION_PHASES.map((preset) => {
          const selected = isPresetSelected(value, preset.key)
          return (
            <button
              key={preset.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(togglePresetPhase(value, preset.key))}
              className={cn(disabled && 'pointer-events-none opacity-50')}
            >
              <Badge variant={selected ? 'secondary' : 'outline'}>{preset.label}</Badge>
            </button>
          )
        })}
      </div>

      {(customPhases.length > 0 || !disabled) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {customPhases.map((phase) => (
            <span
              key={phase}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {formatPhaseLabel(phase)}
              {!disabled && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onChange(removePhase(value, phase))}
                  aria-label={`Remove ${formatPhaseLabel(phase)}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}

          {!disabled && (
            <span className="inline-flex items-center gap-1">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitDraft()
                  }
                }}
                onBlur={() => {
                  if (draft.trim()) commitDraft()
                }}
                placeholder="Add phase…"
                className="h-8 w-36 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={commitDraft}
                aria-label="Add custom phase"
              >
                <Plus className="size-3" />
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
