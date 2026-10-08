import { Fragment, useMemo } from 'react'

import {
  SCREENPLAY_LAYOUT,
  formatSceneForScreenplay,
  screenplayIndentChars,
  type ScreenplayRow,
} from '@/lib/script/screenplayFormat'

/** Blank margin either side of the 60-character script column, holding the scene numbers. */
const GUTTER_CH = 6

function PreviewRow({ row }: { row: ScreenplayRow }) {
  if (row.type === 'blank') return <div aria-hidden="true">&nbsp;</div>
  if (row.type === 'transition') return <div className="text-right">{row.text}</div>
  if (row.type === 'scene_heading') {
    return (
      <div className="relative" data-row="scene_heading">
        {row.sceneNumber && (
          <span className="absolute" style={{ left: `-${GUTTER_CH}ch` }}>
            {row.sceneNumber}
          </span>
        )}
        {row.text}
        {row.sceneNumber && (
          <span className="absolute" style={{ right: `-${GUTTER_CH}ch` }}>
            {row.sceneNumber}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="whitespace-pre" style={{ marginLeft: `${screenplayIndentChars(row.type)}ch` }}>
      {row.text}
    </div>
  )
}

/**
 * On-screen sides preview in standard screenplay format, laid out from the same element model and
 * column table as the sides PDF.
 */
export function SidesScreenplayPreview({
  sceneNumber,
  heading,
  text,
}: {
  sceneNumber: string
  heading: string | null
  text: string
}) {
  const blocks = useMemo(() => formatSceneForScreenplay({ sceneNumber, heading, text }), [sceneNumber, heading, text])
  const width = SCREENPLAY_LAYOUT.columns.action.width
  return (
    <div className="max-h-64 overflow-auto rounded border border-border/30 bg-muted/20 py-2 font-mono text-[11px] leading-snug text-foreground">
      <div className="relative" style={{ width: `${width}ch`, marginLeft: `${GUTTER_CH}ch`, marginRight: `${GUTTER_CH}ch` }}>
        {blocks.map((block, b) => (
          <Fragment key={b}>
            {b > 0 &&
              Array.from({ length: block.spaceBefore }, (_, s) => <PreviewRow key={`s${s}`} row={{ type: 'blank', text: '' }} />)}
            {block.rows.map((row, r) => (
              <PreviewRow key={r} row={row} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
