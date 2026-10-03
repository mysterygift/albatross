import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TUTORIAL_FLOWS, resolveTutorialSection } from './flows'
import { TUTORIAL_SECTION_IDS } from './tutorialSections'
import { getDefaultTutorialProgress, sanitizeTutorialProgress } from './progress'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|ts)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('tutorial flows', () => {
  it('defines a flow for every section, with unique step ids', () => {
    for (const id of TUTORIAL_SECTION_IDS) {
      const flow = TUTORIAL_FLOWS[id]
      expect(flow.sectionId).toBe(id)
      const ids = flow.steps.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(flow.steps.length).toBeGreaterThan(0)
    }
  })

  it('points every spotlight target at a data-tutorial attribute that exists in the app source', () => {
    const src = join(process.cwd(), 'src')
    const haystack = sourceFiles(src).map((f) => readFileSync(f, 'utf8')).join('\n')
    const missing: string[] = []
    for (const flow of Object.values(TUTORIAL_FLOWS)) {
      for (const step of flow.steps) {
        if (step.target && !haystack.includes(`data-tutorial="${step.target}"`)) {
          missing.push(`${flow.sectionId}/${step.id} -> ${step.target}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('maps routes to sections, including the stripboard and tasks', () => {
    expect(resolveTutorialSection('/')).toBe('dashboard')
    expect(resolveTutorialSection('/schedule/stripboard')).toBe('schedule')
    expect(resolveTutorialSection('/people/crew-manager')).toBe('crew')
    expect(resolveTutorialSection('/tasks')).toBe('tasks')
    expect(resolveTutorialSection('/readiness')).toBe('tasks')
    expect(resolveTutorialSection('/settings')).toBeNull()
  })
})

describe('tutorial progress', () => {
  it('upgrades v1 progress: completed sections survive, the in-flight run starts again', () => {
    const v1 = {
      seenEntryModal: true,
      seenIntro: true,
      dismissed: false,
      currentSection: 'budget',
      sections: { ...getDefaultTutorialProgress().sections, dashboard: 'complete', budget: 'in_progress' },
      sectionSteps: { budget: 2 },
    }
    const upgraded = sanitizeTutorialProgress(v1 as never)
    expect(upgraded.version).toBe(2)
    expect(upgraded.sections.dashboard).toBe('complete')
    expect(upgraded.sections.budget).toBe('in_progress')
    expect(upgraded.run.status).toBe('idle')
    expect(upgraded.tutorialProductionId).toBeNull()
  })

  it('drops invalid values rather than trusting stored data', () => {
    const cleaned = sanitizeTutorialProgress({
      run: { status: 'boom', sectionId: 'not-a-section', stepId: 3, scope: 'x' },
      sections: { dashboard: 'bogus' },
    } as never)
    expect(cleaned.run).toEqual({ status: 'idle', sectionId: null, stepId: null, scope: 'all' })
    expect(cleaned.sections.dashboard).toBe('not_started')
  })
})
