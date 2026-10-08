/**
 * Background for text covered by one or more highlights, in the tint the section editor uses. Several
 * colours split the highlight into equal horizontal bands, stacked top to bottom within the line.
 */
export function stackedHighlightBackground(colours: readonly string[], tint = 40): string {
  const mixed = colours.map((c) => (tint >= 100 ? c : `color-mix(in oklch, ${c} ${tint}%, transparent)`))
  if (mixed.length === 0) return 'transparent'
  if (mixed.length === 1) return mixed[0]!
  const step = 100 / mixed.length
  const stops = mixed.map((c, i) => `${c} ${+(i * step).toFixed(3)}% ${+((i + 1) * step).toFixed(3)}%`)
  return `linear-gradient(180deg, ${stops.join(', ')})`
}
