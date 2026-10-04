// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { layoutLinedScript, type LiningElement, type LiningTramline } from '@/lib/script-supervisor/lining'
import { LinedScript } from './LinedScript'

const el = (sort_index: number, element_type: LiningElement['element_type'], page_number: string, text: string, character_name: string | null = null): LiningElement => ({
  id: `e${sort_index}`, scene_id: 's23', sort_index, element_type, character_name, text, page_number,
})

const elements = [
  el(0, 'scene_heading', '31', 'INT. EDIT SUITE - NIGHT'),
  el(1, 'action', '31', 'Monitors glow.'),
  el(2, 'dialogue', '31', 'Since lunch.', 'MARCUS'),
  el(3, 'dialogue', '32', 'Every take but one.', 'ELENA'),
]

const tramline: LiningTramline = {
  id: 't1', slateId: 'sl1', slateLabel: '212', slateCreatedAt: '2026-10-07T10:00', shotType: 'master', shotCode: 'WS',
  description: null, camera: '', printTakeNumbers: [4], startSortIndex: 1, endSortIndex: 3, segments: new Map(),
}

function renderLined(props: Partial<Parameters<typeof LinedScript>[0]> = {}) {
  return render(
    <MemoryRouter>
      <LinedScript
        layout={layoutLinedScript(elements, [tramline])}
        isLoading={false}
        hasScript
        sceneNumber="23"
        currentSlateId="sl1"
        touch={false}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('LinedScript (SS6)', () => {
  afterEach(() => cleanup())

  it('shows tramline labels, script text and the page break', () => {
    renderLined()
    const lanes = screen.getByRole('list', { name: 'Tramlines' })
    expect(within(lanes).getByText('212/4 WS')).toBeTruthy()
    expect(screen.getByText('INT. EDIT SUITE - NIGHT')).toBeTruthy()
    expect(screen.getByText('ELENA')).toBeTruthy()
    expect(screen.getByLabelText('Page 32')).toBeTruthy()
    expect(screen.getByText(/3 blocks have fewer than two/)).toBeTruthy()
  })

  it('explains when the scene is not in an imported script', () => {
    renderLined({ hasScript: false, layout: null })
    expect(screen.getByRole('link', { name: 'Import the script' })).toBeTruthy()
  })
})
