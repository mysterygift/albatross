// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FloorPlanCanvas, type FloorPlanTool } from './FloorPlanCanvas'
import type { FloorPlanLayout, FloorPlanMarker } from '@/lib/floor-plans/model'

// The SVG is drawn 1200 x 800 px from the page origin, so client pixels equal plan units.
beforeEach(() => {
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1200,
    height: 800,
    right: 1200,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function LayoutHarness({
  initial = { shapes: [] },
  tool: initialTool,
  snap = true,
  onChange,
}: {
  initial?: FloorPlanLayout
  tool: FloorPlanTool
  snap?: boolean
  onChange: (layout: FloorPlanLayout, transient: boolean) => void
}) {
  const [layout, setLayout] = useState(initial)
  const [tool, setTool] = useState(initialTool)
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <FloorPlanCanvas
      layout={layout}
      onLayoutChange={(next, transient) => {
        setLayout(next)
        onChange(next, transient)
      }}
      tool={tool}
      onToolChange={setTool}
      snap={snap}
      selectedId={selected}
      onSelect={setSelected}
      onUndo={() => {}}
      onRedo={() => {}}
    />
  )
}

const background = () => screen.getByTestId('floor-plan-background')
const svg = () => screen.getByTestId('floor-plan-canvas')
const at = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0, pointerId: 1 })

describe('FloorPlanCanvas', () => {
  it('draws a rectangle by click and drag, in any direction', () => {
    const onChange = vi.fn()
    render(<LayoutHarness tool="rect" onChange={onChange} />)
    fireEvent.pointerDown(background(), at(300, 400))
    fireEvent.pointerMove(svg(), at(200, 250))
    fireEvent.pointerUp(svg(), at(100, 200))
    const [layout, transient] = onChange.mock.calls.at(-1)!
    expect(transient).toBe(false)
    expect(layout.shapes).toEqual([{ id: expect.any(String), kind: 'rect', x: 100, y: 200, width: 200, height: 200 }])
  })

  it('ignores a click without a drag', () => {
    const onChange = vi.fn()
    render(<LayoutHarness tool="rect" onChange={onChange} />)
    fireEvent.pointerDown(background(), at(300, 400))
    fireEvent.pointerUp(svg(), at(301, 401))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('draws point to point, snapping each segment to 90 degrees', () => {
    const onChange = vi.fn()
    render(<LayoutHarness tool="path" onChange={onChange} />)
    fireEvent.pointerDown(background(), at(100, 100))
    fireEvent.pointerDown(background(), at(400, 130))
    fireEvent.pointerDown(background(), at(410, 500))
    fireEvent.keyDown(screen.getByRole('application'), { key: 'Enter' })
    const layout = onChange.mock.calls.at(-1)![0] as FloorPlanLayout
    expect(layout.shapes[0]).toMatchObject({
      kind: 'path',
      closed: false,
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
        { x: 400, y: 500 },
      ],
    })
  })

  it('a double-click finishes a line without adding a stray point', () => {
    const onChange = vi.fn()
    render(<LayoutHarness tool="path" onChange={onChange} />)
    // Events fire back to back, so the repeat click on the same spot counts as a double-click.
    fireEvent.pointerDown(background(), at(200, 680))
    fireEvent.pointerDown(background(), at(510, 760))
    fireEvent.pointerDown(background(), at(510, 760))
    fireEvent.doubleClick(svg())
    const layout = onChange.mock.calls.at(-1)![0] as FloorPlanLayout
    expect(layout.shapes[0]).toMatchObject({ points: [{ x: 200, y: 680 }, { x: 510, y: 680 }] })
  })

  it('draws freely with snapping off, and closes a shape on its first point', () => {
    const onChange = vi.fn()
    render(<LayoutHarness tool="path" snap={false} onChange={onChange} />)
    fireEvent.pointerDown(background(), at(100, 100))
    fireEvent.pointerDown(background(), at(400, 130))
    fireEvent.pointerDown(background(), at(250, 400))
    fireEvent.pointerDown(background(), at(104, 103))
    const layout = onChange.mock.calls.at(-1)![0] as FloorPlanLayout
    expect(layout.shapes[0]).toMatchObject({
      closed: true,
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 130 },
        { x: 250, y: 400 },
      ],
    })
  })

  it('places a text label and goes back to selecting', () => {
    const onChange = vi.fn()
    render(<LayoutHarness tool="text" onChange={onChange} />)
    fireEvent.pointerDown(background(), at(600, 400))
    const layout = onChange.mock.calls.at(-1)![0] as FloorPlanLayout
    expect(layout.shapes[0]).toMatchObject({ kind: 'text', text: 'Label', x: 520, y: 380, rotation: 0 })
    expect(screen.getByText('Label')).toBeTruthy()
  })

  it('moves a shape as one change, and deletes it with the keyboard', () => {
    const onChange = vi.fn()
    const initial: FloorPlanLayout = { shapes: [{ id: 'r', kind: 'rect', x: 100, y: 100, width: 100, height: 100 }] }
    const { container } = render(<LayoutHarness tool="select" initial={initial} onChange={onChange} />)
    const rect = container.querySelector('[data-shape-id="r"]')!
    fireEvent.pointerDown(rect, at(150, 150))
    fireEvent.pointerMove(svg(), at(170, 190))
    expect(onChange).toHaveBeenLastCalledWith({ shapes: [expect.objectContaining({ x: 120, y: 140 })] }, true)
    fireEvent.pointerUp(svg(), at(170, 190))
    expect(onChange).toHaveBeenLastCalledWith({ shapes: [expect.objectContaining({ x: 120, y: 140 })] }, false)

    fireEvent.keyDown(screen.getByRole('application'), { key: 'Delete' })
    expect(onChange).toHaveBeenLastCalledWith({ shapes: [] }, false)
  })

  it('rotates a text label in 90 degree steps when snapping', () => {
    const onChange = vi.fn()
    const initial: FloorPlanLayout = {
      shapes: [{ id: 't', kind: 'text', x: 500, y: 380, width: 200, height: 40, rotation: 0, text: 'Bar', fontSize: 18 }],
    }
    const { container } = render(<LayoutHarness tool="select" initial={initial} onChange={onChange} />)
    fireEvent.pointerDown(container.querySelector('[data-shape-id="t"]')!, at(600, 400))
    fireEvent.pointerUp(svg(), at(600, 400))
    fireEvent.pointerDown(screen.getByLabelText('Rotate'), at(600, 352))
    // Pointer to the right of the centre, a little low: about 100°, snapped to 90°.
    fireEvent.pointerMove(svg(), at(700, 420))
    expect(onChange.mock.calls.at(-1)![0].shapes[0].rotation).toBe(90)
  })

  it('places cameras and actors with the next free label, and turns them', () => {
    const onMarkers = vi.fn()
    function MarkerHarness() {
      const [markers, setMarkers] = useState<FloorPlanMarker[]>([])
      const [tool, setTool] = useState<FloorPlanTool>('camera')
      const [selected, setSelected] = useState<string | null>(null)
      return (
        <>
          <button onClick={() => setTool('actor')}>actor tool</button>
          <FloorPlanCanvas
            layout={{ shapes: [] }}
            markers={markers}
            onMarkersChange={(next, transient) => {
              setMarkers(next)
              onMarkers(next, transient)
            }}
            tool={tool}
            onToolChange={setTool}
            snap={false}
            selectedId={selected}
            onSelect={setSelected}
            onUndo={() => {}}
            onRedo={() => {}}
          />
        </>
      )
    }
    render(<MarkerHarness />)
    fireEvent.pointerDown(background(), at(100, 100))
    fireEvent.pointerDown(background(), at(300, 100))
    fireEvent.click(screen.getByText('actor tool'))
    fireEvent.pointerDown(background(), at(500, 300))
    const markers = onMarkers.mock.calls.at(-1)![0] as FloorPlanMarker[]
    expect(markers.map((m) => [m.kind, m.label])).toEqual([
      ['camera', 'A'],
      ['camera', 'B'],
      ['actor', '1'],
    ])

    // The last marker placed is selected: drag its handle to face down-right, freely.
    fireEvent.pointerDown(screen.getByLabelText('Turn'), at(500, 256))
    fireEvent.pointerMove(svg(), at(600, 400))
    expect((onMarkers.mock.calls.at(-1)![0] as FloorPlanMarker[])[2]!.rotation).toBe(45)
  })
})
