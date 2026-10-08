/**
 * Day pack email: subject and body templates with `{placeholder}` fields filled per recipient.
 * Unknown placeholders are left as typed, so a stray `{` never eats text.
 */
import { formatLongDate } from '@/lib/pdf/layoutKit'

export const DAY_PACK_PLACEHOLDERS = ['firstName', 'name', 'production', 'date', 'day', 'unit'] as const
export type DayPackPlaceholder = (typeof DAY_PACK_PLACEHOLDERS)[number]
export type DayPackTemplateVars = Record<DayPackPlaceholder, string>

export const DEFAULT_DAY_PACK_SUBJECT = '{production} – Call sheet & docs – {day}, {date} ({unit})'

export const DEFAULT_DAY_PACK_BODY = `Hi {firstName},

Here is the call sheet + relevant docs for the shoot for {production} on {date}. Please ensure you read all info carefully and if you have any questions please get in touch.

Thanks`

/** Per-production setting key for a custom email body. */
export function dayPackEmailBodySettingKey(productionId: string): string {
  return `day_pack_email_body:${productionId}`
}

/** Per-production setting key for a custom email subject. */
export function dayPackEmailSubjectSettingKey(productionId: string): string {
  return `day_pack_email_subject:${productionId}`
}

export function dayPackTemplateVars(args: {
  fullName: string
  productionName: string
  shootDate: string
  dayNumber: number | null
  unitName: string
}): DayPackTemplateVars {
  const name = args.fullName.trim().replace(/\s+/g, ' ')
  return {
    firstName: name.split(/\s+/)[0] || name,
    name,
    production: args.productionName,
    date: formatLongDate(args.shootDate),
    day: args.dayNumber != null ? `Day ${args.dayNumber}` : 'Shoot day',
    unit: args.unitName,
  }
}

export function renderDayPackTemplate(template: string, vars: DayPackTemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    (DAY_PACK_PLACEHOLDERS as readonly string[]).includes(key) ? vars[key as DayPackPlaceholder] : match
  )
}
