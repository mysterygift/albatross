// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FloorPlanCanvas, type FloorPlanTool } from './FloorPlanCanvas'
import { emptyLayout, type FloorPlanLayout, type FloorPlanMarker } from '@/lib/floor-plans/model'

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
  initial = emptyLayout(),
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
    const initial: FloorPlanLayout = { ...emptyLayout(), shapes: [{ id: 'r', kind: 'rect', x: 100, y: 100, width: 100, height: 100 }] }
    const { container } = render(<LayoutHarness tool="select" initial={initial} onChange={onChange} />)
    const rect = container.querySelector('[data-shape-id="r"]')!
    fireEvent.pointerDown(rect, at(150, 150))
    fireEvent.pointerMove(svg(), at(170, 190))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shapes: [expect.objectContaining({ x: 120, y: 140 })] }), true)
    fireEvent.pointerUp(svg(), at(170, 190))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shapes: [expect.objectContaining({ x: 120, y: 140 })] }), false)

    fireEvent.keyDown(screen.getByRole('application'), { key: 'Delete' })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shapes: [] }), false)
  })

  it('rotates a text label in 90 degree steps when snapping', () => {
    const onChange = vi.fn()
    const initial: FloorPlanLayout = {
      ...emptyLayout(),
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

  it('places cameras, cast and equipment, one click each, and turns them', () => {
    const onMarkers = vi.fn()
    function MarkerHarness() {
      const [markers, setMarkers] = useState<FloorPlanMarker[]>([])
      const [tool, setTool] = useState<FloorPlanTool>('select')
      const [item, setItem] = useState<string | null>(null)
      const [person, setPerson] = useState<{ personId: string | null; label: string } | null>(null)
      const [selected, setSelected] = useState<string | null>(null)
      const pick = (next: FloorPlanTool, nextItem: string | null = null, nextPerson: { personId: string | null; label: string } | null = null) => {
        setTool(next)
        setItem(nextItem)
        setPerson(nextPerson)
      }
      return (
        <>
        <button onClick={() => pick('camera')}>camera tool</button>
        <button onClick={() => pick('actor', null, { personId: 'p-marta', label: 'Marta' })}>marta tool</button>
        <button onClick={() => pick('item', 'arri-m18')}>m18 tool</button>
        <FloorPlanCanvas
          layout={emptyLayout()}
          markers={markers}
          onMarkersChange={(next, transient) => {
            setMarkers(next)
            onMarkers(next, transient)
          }}
          tool={tool}
          onToolChange={setTool}
          placingItem={item}
          placingPerson={person}
          snap={false}
          selectedId={selected}
          onSelect={setSelected}
          onUndo={() => {}}
          onRedo={() => {}}
          actorColor={(id) => (id === 'p-marta' ? '#8b5cf6' : '#64748b')}
        />
        </>
      )
    }
    const { container } = render(<MarkerHarness />)
    fireEvent.click(screen.getByText('camera tool'))
    fireEvent.pointerDown(background(), at(100, 100))
    fireEvent.click(screen.getByText('camera tool'))
    fireEvent.pointerDown(background(), at(300, 100))
    fireEvent.click(screen.getByText('marta tool'))
    fireEvent.pointerDown(background(), at(500, 300))
    fireEvent.click(screen.getByText('m18 tool'))
    fireEvent.pointerDown(background(), at(700, 500))
    // Back to selecting after each placement: a further click places nothing.
    fireEvent.pointerDown(background(), at(900, 600))
    const markers = onMarkers.mock.calls.at(-1)![0] as FloorPlanMarker[]
    expect(markers.map((m) => [m.kind, m.label])).toEqual([
      ['camera', 'A'],
      ['camera', 'B'],
      ['actor', 'Marta'],
      ['item', 'M18 | HMI'],
    ])
    expect(markers[2]).toMatchObject({ personId: 'p-marta' })
    expect(markers[3]).toMatchObject({ type: 'arri-m18', width: 0.47, depth: 0.54, rotation: 270 })

    // Colours: B camera cyan, Marta her booking colour.
    expect(container.querySelector(`[data-marker-id="${markers[1]!.id}"] circle`)?.getAttribute('fill')).toBe('#22d3ee')
    expect(container.querySelector(`[data-marker-id="${markers[2]!.id}"] circle`)?.getAttribute('fill')).toBe('#8b5cf6')
    expect(screen.getByText('M18 | HMI')).toBeTruthy()

    // Select Marta and turn her to face down-right, freely.
    fireEvent.pointerDown(container.querySelector(`[data-marker-id="${markers[2]!.id}"]`)!, at(500, 300))
    fireEvent.pointerUp(svg(), at(500, 300))
    fireEvent.pointerDown(screen.getByLabelText('Turn'), at(500, 256))
    fireEvent.pointerMove(svg(), at(600, 400))
    expect((onMarkers.mock.calls.at(-1)![0] as FloorPlanMarker[])[2]!.rotation).toBe(45)
  })

  it('resizes resizable equipment in metres along its own axes', () => {
    const onChange = vi.fn()
    const track = { id: 'track', kind: 'item' as const, type: 'track-straight', x: 600, y: 400, rotation: 0, label: 'Track', width: 0.62, depth: 3.6 }
    const { container } = render(<LayoutHarness tool="select" initial={{ ...emptyLayout(), shapes: [track] }} onChange={onChange} />)
    fireEvent.pointerDown(container.querySelector('[data-item-id="track"]')!, at(600, 400))
    fireEvent.pointerUp(svg(), at(600, 400))
    // 40 units per metre: drag the corner to 2.5 m along and 0.5 m across from the centre.
    fireEvent.pointerDown(screen.getByLabelText('Resize'), at(672, 412))
    fireEvent.pointerMove(svg(), at(700, 420))
    expect(onChange.mock.calls.at(-1)![0].shapes[0]).toMatchObject({ depth: 5, width: 1 })
  })

  it('measures a known length to set the scale', () => {
    const onMeasure = vi.fn()
    render(
      <FloorPlanCanvas
        layout={emptyLayout()}
        onLayoutChange={() => {}}
        tool="measure"
        onToolChange={() => {}}
        snap
        selectedId={null}
        onSelect={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onMeasure={onMeasure}
      />
    )
    fireEvent.pointerDown(background(), at(100, 700))
    fireEvent.pointerMove(svg(), at(500, 712))
    fireEvent.pointerUp(svg(), at(500, 712))
    // Snapped level: exactly 400 units.
    expect(onMeasure).toHaveBeenCalledWith(400)
  })

  it('drags and resizes the background, carrying the scale with it', () => {
    const onChange = vi.fn()
    const initial: FloorPlanLayout = {
      ...emptyLayout(),
      unitsPerMetre: 20,
      background: { source: 'image', x: 100, y: 100, width: 600, height: 400, opacity: 0.6, map: null },
    }
    function BackgroundHarness() {
      const [layout, setLayout] = useState(initial)
      return (
        <FloorPlanCanvas
          layout={layout}
          backgroundImage="data:image/jpeg;base64,AAAA"
          onLayoutChange={(next, transient) => {
            setLayout(next)
            onChange(next, transient)
          }}
          tool="background"
          onToolChange={() => {}}
          snap
          selectedId={null}
          onSelect={() => {}}
          onUndo={() => {}}
          onRedo={() => {}}
        />
      )
    }
    render(<BackgroundHarness />)
    expect(screen.getByTestId('floor-plan-background-image').getAttribute('href')).toBe('data:image/jpeg;base64,AAAA')
    fireEvent.pointerDown(background(), at(300, 300))
    fireEvent.pointerMove(svg(), at(350, 320))
    fireEvent.pointerUp(svg(), at(350, 320))
    expect(onChange.mock.calls.at(-1)![0].background).toMatchObject({ x: 150, y: 120 })
    // Double the width from the corner: the height and the scale double too.
    fireEvent.pointerDown(screen.getByLabelText('Resize background'), at(750, 520))
    fireEvent.pointerMove(svg(), at(1350, 900))
    const last = onChange.mock.calls.at(-1)![0] as FloorPlanLayout
    expect(last.background).toMatchObject({ width: 1200, height: 800 })
    expect(last.unitsPerMetre).toBe(40)
  })

  it('draws the sun path and where the sun is', () => {
    render(
      <FloorPlanCanvas
        layout={emptyLayout()}
        tool="select"
        onToolChange={() => {}}
        snap
        selectedId={null}
        onSelect={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        sun={{
          now: { azimuth: 225, elevation: 30, label: '15:30 | 30°' },
          path: [
            { azimuth: 90, elevation: 0, label: null },
            { azimuth: 180, elevation: 60, label: '12' },
            { azimuth: 270, elevation: 0, label: null },
          ],
        }}
      />
    )
    expect(screen.getByTestId('floor-plan-sun')).toBeTruthy()
    expect(screen.getByText('15:30 | 30°')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })
})
