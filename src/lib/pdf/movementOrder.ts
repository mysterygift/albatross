import {
  COLOR_ALERT,
  COLOR_MUTED,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  formatLongDate,
  type NumberedRow,
  type StatCell,
  type TableCell,
  type TextBlock,
} from '@/lib/pdf/layoutKit'
import {
  formatDriveDistance,
  formatDriveDuration,
  summariseMovementDriving,
} from '@/lib/movement-orders/movementOrderInputs'
import type {
  MovementOrderData,
  MovementOrderLocation,
  MovementOrderMovementLeg,
  MovementOrderPdfOptions,
} from '@/lib/movement-orders/types'

const SEP = ' | '
/** Shown in table cells with nothing to say, so a gap reads as a gap rather than a layout error. */
const EMPTY_CELL = '-'

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function dayLabel(data: MovementOrderData): string | null {
  if (data.dayNumber == null) return null
  return data.totalShootDays != null && data.totalShootDays >= data.dayNumber
    ? `Day ${data.dayNumber} of ${data.totalShootDays}`
    : `Day ${data.dayNumber}`
}

/** `14 min | 5.2 km`, `14 min`, `5.2 km`, or null when the leg has neither. */
function travelText(minutes: number | null, distance: string | null): string | null {
  const parts = [minutes != null ? formatDriveDuration(minutes) : null, present(distance)]
  const text = parts.filter(Boolean).join(SEP)
  return text || null
}

/** Walk time only; the distance is in Directions. Falls back to distance when there is no time. */
function walkCell(leg: MovementOrderMovementLeg): string {
  if (leg.walkingTimeMinutes != null) return formatDriveDuration(leg.walkingTimeMinutes)
  return present(leg.walkingDistanceText) ?? EMPTY_CELL
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

/** `1, 2, 4 | INT | Day` per run of scenes sharing INT/EXT and day/night, joined with `; `. */
function sceneSummary(scenes: MovementOrderLocation['scenes']): string {
  const groups: Array<{ numbers: string[]; intExt: string | null; dayNight: string | null }> = []
  for (const scene of scenes) {
    const last = groups.at(-1)
    if (last && last.intExt === scene.intExt && last.dayNight === scene.dayNight) {
      last.numbers.push(scene.sceneNumber)
    } else {
      groups.push({ numbers: [scene.sceneNumber], intExt: scene.intExt, dayNight: scene.dayNight })
    }
  }
  return groups
    .map((g) =>
      [g.numbers.join(', '), g.intExt, g.dayNight ? titleCase(g.dayNight) : null]
        .filter(Boolean)
        .join(SEP)
    )
    .join('; ')
}

function locationRow(location: MovementOrderLocation, index: number): NumberedRow {
  const left: TextBlock[] = [{ text: location.name, bold: true }]
  const address = present(location.address)
  if (address) left.push({ text: address })
  const w3w = present(location.what3words)
  if (w3w) left.push({ text: `what3words: ${w3w}`, color: COLOR_MUTED })

  const right: TextBlock[] = []
  const parking = present(location.parkingInfo)
  if (parking) right.push({ label: 'Parking', text: parking })
  if (location.scenes.length > 0) {
    right.push({ label: 'Scenes', inline: true, text: sceneSummary(location.scenes) })
  }
  return { badge: String(index + 1), columns: [left, right] }
}

function directionCell(leg: MovementOrderMovementLeg, index: number): TextBlock[] | null {
  const drive = travelText(leg.drivingTimeMinutes, leg.drivingDistanceText)
  const walk = travelText(leg.walkingTimeMinutes, leg.walkingDistanceText)
  const directions = present(leg.writtenDirections)
  const meta = [drive ? `Drive ${drive}` : null, walk ? `Walk ${walk}` : null]
    .filter(Boolean)
    .join(SEP)
  if (!meta && !directions) return null
  const blocks: TextBlock[] = [
    { text: `${index + 1}${SEP}${leg.fromLocationName} to ${leg.toLocationName}`, bold: true },
  ]
  if (meta) blocks.push({ text: meta, color: COLOR_MUTED })
  if (directions) blocks.push({ text: directions })
  return blocks
}

export async function generateMovementOrderPDF(
  data: MovementOrderData,
  options: MovementOrderPdfOptions = {}
): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: options.paperSize ?? DEFAULT_PAPER_SIZE })
  const day = dayLabel(data)

  layout.onNewPage = (l) => {
    l.runningHeader(
      ['MOVEMENT ORDER', day, data.unitName].filter(Boolean).join(SEP),
      data.productionName
    )
  }

  // Masthead: same shape as the call sheet, with the revision and issue stamp on the right.
  const issuedAt = data.issuedAt ? new Date(data.issuedAt) : new Date()
  const issued = `Issued ${formatIssuedStamp(Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt)}`
  layout.masthead({
    title: data.productionName,
    right: 'MOVEMENT ORDER',
    subLeft: [
      `Unit: ${data.unitName}`,
      present(data.shootingBlocLabel) ? `Shooting bloc: ${data.shootingBlocLabel!.trim()}` : null,
    ]
      .filter(Boolean)
      .join(SEP),
    subRight: [present(data.revisionLabel), issued].filter(Boolean).join(SEP),
  })

  // Header strip: date and day, unit base and call, the day's moves.
  const driving = summariseMovementDriving(data.movementLegs)
  const wrapDetail = present(data.wrapTime) ? `Wrap (est.) ${data.wrapTime}` : null
  const baseTime = present(data.unitBaseTime)
  const callTime = present(data.callTime)
  const strip: StatCell[] = [
    {
      label: 'Shoot date',
      weight: 1.1,
      lines: [
        { text: formatLongDate(data.shootDate), bold: true, size: 11 },
        ...(day ? [{ text: day, bold: true, size: 14 }] : []),
      ],
    },
  ]
  const callAndWrap = [callTime ? `Crew call ${callTime}` : null, wrapDetail].filter(Boolean).join(SEP)
  if (baseTime) {
    strip.push({
      label: 'Unit base opens',
      weight: 1.2,
      lines: [{ text: baseTime, bold: true, size: 20 }, ...(callAndWrap ? [{ text: callAndWrap }] : [])],
    })
  } else if (callTime) {
    strip.push({
      label: 'Crew call',
      weight: 1.2,
      lines: [{ text: callTime, bold: true, size: 20 }, ...(wrapDetail ? [{ text: wrapDetail }] : [])],
    })
  } else if (present(data.wrapTime)) {
    strip.push({ label: 'Wrap (est.)', weight: 1.2, lines: [{ text: data.wrapTime!, bold: true, size: 20 }] })
  }
  const stopCount =
    data.locations.length === 0 ? 0 : data.locations.length + (present(data.unitBaseAddress) ? 1 : 0)
  const driveDetail = [
    driving.minutes != null ? `Total drive ${formatDriveDuration(driving.minutes)}` : null,
    driving.meters != null ? formatDriveDistance(driving.meters) : null,
  ]
    .filter(Boolean)
    .join(SEP)
  strip.push({
    label: "Today's moves",
    weight: 1,
    lines: [
      { text: `${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}`, bold: true, size: 20 },
      ...(driveDetail ? [{ text: `${driveDetail}${driving.incomplete ? ' (partial)' : ''}` }] : []),
    ],
  })
  layout.statStrip(strip)

  // Journey: the day at a glance.
  if (data.movementLegs.length > 0) {
    layout.sectionBar('Journey', 60)
    const rows: TableCell[][] = data.movementLegs.map((leg, i) => [
      String(i + 1),
      leg.fromLocationName,
      leg.toLocationName,
      { text: leg.departTime ?? EMPTY_CELL, bold: leg.departTime != null },
      travelText(leg.drivingTimeMinutes, leg.drivingDistanceText) ?? EMPTY_CELL,
      walkCell(leg),
      { text: leg.arriveTime ?? EMPTY_CELL, bold: leg.arriveTime != null },
    ])
    layout.table({
      columns: [
        { header: '#', weight: 5 },
        { header: 'From', weight: 25 },
        { header: 'To', weight: 25 },
        { header: 'Depart', weight: 11 },
        { header: 'Drive', weight: 14 },
        { header: 'Walk', weight: 10 },
        { header: 'Arrive', weight: 10 },
      ],
      rows,
    })
  }

  // Locations: numbered stops.
  layout.sectionBar('Locations', 50)
  if (data.locations.length === 0) {
    layout.blockGrid([[{ text: 'No locations scheduled.', color: COLOR_MUTED }]], 1)
  } else {
    layout.numberedRows(data.locations.map(locationRow))
  }

  // Directions: numbered to match the Journey rows, two to a row.
  const directionCells = data.movementLegs
    .map(directionCell)
    .filter((cell): cell is TextBlock[] => cell !== null)
  if (directionCells.length > 0) {
    layout.sectionBar('Directions', 50)
    layout.blockGrid(directionCells, 2)
  }

  // Contacts.
  if (data.locationContacts.length > 0) {
    layout.sectionBar('Locations team contacts', 50)
    layout.table({
      columns: [
        { header: 'Name', weight: 28 },
        { header: 'Role', weight: 24 },
        { header: 'Phone', weight: 20 },
        { header: 'Email', weight: 28 },
      ],
      rows: data.locationContacts.map((contact) => [
        contact.name,
        contact.role ?? EMPTY_CELL,
        contact.phone ?? EMPTY_CELL,
        contact.email ?? EMPTY_CELL,
      ]),
    })
  }

  // Safety box beside the nearest A&E.
  const { safety } = data
  const safetyCell: TextBlock[] = []
  if (present(safety.notes)) {
    safetyCell.push({ label: 'Safety', labelColor: COLOR_ALERT, text: safety.notes!, bold: true })
  }
  const police = [present(safety.policeStationName), present(safety.policeStationAddress)]
    .filter(Boolean)
    .join(', ')
  if (police) {
    safetyCell.push({ label: 'Police', labelColor: COLOR_MUTED, text: police, inline: safetyCell.length > 0 })
  }
  const hospitalCell: TextBlock[] = []
  if (present(safety.hospitalName)) {
    hospitalCell.push({ label: 'Nearest A&E', text: safety.hospitalName!, bold: true })
  }
  if (present(safety.hospitalAddress)) {
    hospitalCell.push({
      label: present(safety.hospitalName) ? undefined : 'Nearest A&E',
      text: safety.hospitalAddress!,
    })
  }
  const safetyCells = [safetyCell, hospitalCell].filter((cell) => cell.length > 0)
  if (safetyCells.length > 0) {
    layout.gap(4)
    layout.blockGrid(safetyCells, 2)
  }

  layout.applyFooters({
    left: `${data.productionName}. CONFIDENTIAL - DO NOT SHARE.`,
  })
  return layout.doc.save()
}
