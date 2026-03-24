import { describe, expect, it } from 'vitest'
import {
  callSheetIncludeEpisodesSettingKey,
  enrichCallSheetStripEpisodeLabel,
  shootingBlocMastheadLabelForCallSheet,
} from '@/lib/call-sheets/callSheetEpisodic'

describe('callSheetIncludeEpisodesSettingKey', () => {
  it('scopes by production id', () => {
    expect(callSheetIncludeEpisodesSettingKey('prod-1')).toBe('call_sheet_include_episodes:prod-1')
  })
})

describe('shootingBlocMastheadLabelForCallSheet', () => {
  it('returns null for non-episodic', () => {
    expect(
      shootingBlocMastheadLabelForCallSheet({
        isEpisodicProduction: false,
        shootingBlocId: 'b1',
        blocsById: new Map([['b1', { name: 'Block A' }]]),
      }),
    ).toBeNull()
  })

  it('returns null when no bloc id', () => {
    expect(
      shootingBlocMastheadLabelForCallSheet({
        isEpisodicProduction: true,
        shootingBlocId: null,
        blocsById: new Map(),
      }),
    ).toBeNull()
  })

  it('returns bloc name when episodic and bloc resolved', () => {
    expect(
      shootingBlocMastheadLabelForCallSheet({
        isEpisodicProduction: true,
        shootingBlocId: 'b1',
        blocsById: new Map([['b1', { name: 'Block A' }]]),
      }),
    ).toBe('Block A')
  })

  it('returns null when bloc id missing from map', () => {
    expect(
      shootingBlocMastheadLabelForCallSheet({
        isEpisodicProduction: true,
        shootingBlocId: 'missing',
        blocsById: new Map(),
      }),
    ).toBeNull()
  })
})

describe('enrichCallSheetStripEpisodeLabel', () => {
  const episodeById = new Map([
    ['e1', { name: '101' }],
    ['e2', { name: '102' }],
  ])
  const sceneById = new Map([
    ['sc1', { episode_id: 'e1' }],
    ['sc2', { episode_id: 'e2' }],
  ])
  const shotById = new Map([['sh1', { scene_id: 'sc2' }]])

  it('returns null episode when includeEpisodes false', () => {
    const r = enrichCallSheetStripEpisodeLabel({
      strip: { strip_type: 'SCENE', scene_id: 'sc1', shot_id: null },
      shotById,
      sceneById,
      episodeById,
      includeEpisodes: false,
    })
    expect(r.episodeLabel).toBeNull()
  })

  it('scene row uses scene episode', () => {
    const r = enrichCallSheetStripEpisodeLabel({
      strip: { strip_type: 'SCENE', scene_id: 'sc1', shot_id: null },
      shotById,
      sceneById,
      episodeById,
      includeEpisodes: true,
    })
    expect(r.episodeLabel).toBe('101')
  })

  it('shot row inherits parent scene episode', () => {
    const r = enrichCallSheetStripEpisodeLabel({
      strip: { strip_type: 'SHOT', scene_id: null, shot_id: 'sh1' },
      shotById,
      sceneById,
      episodeById,
      includeEpisodes: true,
    })
    expect(r.episodeLabel).toBe('102')
  })

  it('MOVE strip has no episode label', () => {
    const r = enrichCallSheetStripEpisodeLabel({
      strip: { strip_type: 'MOVE', scene_id: 'sc1', shot_id: null },
      shotById,
      sceneById,
      episodeById,
      includeEpisodes: true,
    })
    expect(r.episodeLabel).toBeNull()
  })
})
