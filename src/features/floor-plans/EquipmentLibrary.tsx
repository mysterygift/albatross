import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EQUIPMENT_CATEGORY_LABELS,
  searchCatalog,
  type CatalogItem,
  type EquipmentCategory,
} from '@/lib/floor-plans/catalog'
import { itemLightColor, itemPrimitives, itemRoleStyle } from '@/lib/floor-plans/itemGeometry'
import { formatItemSize } from './floorPlanDisplay'

/** The item drawn small, facing up, for the library grid. */
export function ItemPreview({ item, size = 40 }: { item: Pick<CatalogItem, 'id' | 'width' | 'depth'>; size?: number }) {
  const upm = Math.min(28 / Math.max(item.width, item.depth), 60)
  const light = itemLightColor(item.id)
  return (
    <svg width={size} height={size} viewBox="-24 -24 48 48" aria-hidden="true" className="overflow-hidden">
      <g transform="rotate(-90)">
        {itemPrimitives({ type: item.id, width: item.width, depth: item.depth }, upm).map((p, i) => {
          const style = itemRoleStyle(p.role, light)
          const common = {
            fill: style.fill ?? 'none',
            fillOpacity: style.fillOpacity,
            stroke: style.stroke ?? 'none',
            strokeWidth: style.strokeWidth * 0.6,
            strokeDasharray: style.dash?.map((v) => v * 0.5).join(' '),
          }
          if (p.shape === 'rect') return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} {...common} />
          if (p.shape === 'circle') return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} {...common} />
          const d = p.points.map((pt, j) => `${j === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + (p.closed ? ' Z' : '')
          return <path key={i} d={d} {...common} fill={p.closed ? common.fill : 'none'} />
        })}
      </g>
    </svg>
  )
}

/** Search and pick equipment to place. `categories` limits what is offered (Lights, Grip...). */
export function EquipmentLibrary({
  categories,
  onPick,
}: {
  categories: EquipmentCategory[]
  onPick: (item: CatalogItem) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<EquipmentCategory | null>(categories.length === 1 ? categories[0]! : null)
  const items = useMemo(
    () => searchCatalog(query, category).filter((item) => categories.includes(item.category)),
    [query, category, categories]
  )
  const groups = categories
    .map((c) => ({ category: c, items: items.filter((item) => item.category === c) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex max-h-[min(70vh,520px)] w-[min(92vw,460px)] flex-col gap-3">
      <label className="flex h-9 items-center gap-2 rounded-md border bg-input/30 px-2.5">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Search equipment</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      {categories.length > 1 ? (
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'h-7 rounded-full border px-3 text-xs',
                category === c ? 'border-primary bg-primary/15 font-medium' : 'hover:bg-muted'
              )}
            >
              {c ? EQUIPMENT_CATEGORY_LABELS[c] : 'All'}
            </button>
          ))}
        </div>
      ) : null}
      <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
        {groups.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches</p> : null}
        {groups.map((group) => (
          <div key={group.category} className="space-y-1.5">
            {categories.length > 1 ? <p className="text-xs text-muted-foreground">{EQUIPMENT_CATEGORY_LABELS[group.category]}</p> : null}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-center text-xs hover:border-primary/60 hover:bg-muted"
                  title={item.name}
                >
                  <ItemPreview item={item} />
                  <span className="line-clamp-2 leading-tight">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground">{formatItemSize(item.width, item.depth)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
