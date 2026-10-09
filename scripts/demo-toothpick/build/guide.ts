/** The "Demo guide" PDF stored in the project's Documents hub. */
import { renderPdf, type PdfBlock } from '../lib/pdf'
import { SCENES } from '../data/scenes'
import { DAYS } from '../data/schedule'
import { weekday } from '../lib/util'

export type GuideStats = {
  scriptPages: number
  scenes: number
  shots: number
  sections: number
  versionLabel: string
  vendors: number
  pos: number
  invoices: number
  cast: number
  crew: number
  budgetEstimated: number
  floorPlans: number
  floorPlanSetups: number
}

const p = (text: string): PdfBlock => ({ kind: 'p', text })
const li = (text: string): PdfBlock => ({ kind: 'li', text })
const h1 = (text: string): PdfBlock => ({ kind: 'h1', text })

export async function buildGuide(s: GuideStats): Promise<Uint8Array> {
  const days: PdfBlock[] = DAYS.flatMap((d) => [
    li(`Day ${d.n} — ${weekday(d.date)} ${Number(d.date.slice(8))} Nov, call ${d.call}, wrap ${d.wrap}: ${d.headline}${d.units.length > 1 ? ' (Main + Second Unit)' : ''}.`),
  ])
  const parse: PdfBlock[] = [
    { kind: 'row', cols: ['Scene', 'Parser said', 'Reviewed as'], widths: [40, 230, 210], bold: true },
    ...SCENES.map<PdfBlock>((sc) => ({
      kind: 'row',
      cols: [String(sc.n), `${sc.parsedLocation} / ${sc.parsedDayNight ?? '(none)'}`, `${sc.title} / ${sc.day_night}`],
      widths: [40, 230, 210],
    })),
  ]
  return renderPdf({
    title: 'Toothpick (Manchester): demo guide',
    banner: 'DEMO PROJECT — fictional people, companies and money. Script by Aran Davies (V1, 04/12/2025).',
    blocks: [
      h1('What this project is'),
      p('A short film shot over 7 days in Manchester (2–10 November 2026), built to exercise Albatross end to end: script, schedule, cast and crew, finance, equipment, safety paperwork and the Script Supervisor. Cast, crew, vendors, invoices and contact details are made up (e-mails use the reserved .example domain; phone numbers are Ofcom drama ranges). Locations are real public venues with verified addresses; private homes are area-level only.'),
      p(`${s.scenes} scenes, ${s.scriptPages} script pages, ${s.shots} planned shots, script version "${s.versionLabel}" with ${s.sections} generated script sections. ${s.cast} cast and ${s.crew} crew, ${s.vendors} vendors, ${s.pos} purchase orders, ${s.invoices} invoices. Working budget about £${Math.round(s.budgetEstimated).toLocaleString('en-GB')} before contingency.`),
      h1('The shoot'),
      ...days,
      h1('Script Supervisor: where to start'),
      li('Schedule → Script Supervisor. Pick a shoot day: Day 1 (Mon 2 Nov) lists scenes 3, 4, 5 and 16 in stripboard order. Nothing has been slated yet, so the log is a clean slate on every day.'),
      li('Slating: the project uses UK consecutive numbering (Settings → Script supervisor). The setting locks after the first slate. Days 2 and 7 have a Second Unit: use prefix X for those slates.'),
      li('New slate (N), then Roll / Cut (Space) to time a take, then mark it Print / Hold / NG (P / H / G). A slate can be linked to a planned shot from the shot list.'),
      li('Line & log → Script: the marked-up script for the selected slate. Draw a tramline down the lane, tap segments to switch on camera / off camera / not covered, add line-change and ad-lib notes, and photograph continuity (wardrobe, props, make-up, hair, set).'),
      li('Review: pages shot, scenes complete, setups and takes; per-day Daily Progress Report; exports: continuity sheets (PDF), editor’s log (CSV) and marked-up script (PDF).'),
      li('Good scenes to try: 9 (long two-hander, 4 pages), 7 (split across Day 4 and Day 6: part-shot credit), 8 (two units on Day 7), 11 (night exterior with whip pan), 17 (needs the late-afternoon light window).'),
      h1('Things to explore in the rest of the project'),
      li('Cast clash: Minty (Noor Haddad) is unavailable on Thu 5 Nov, but scene 12 is scheduled that day. Day Out of Days shows the CLASH; options are in the Day 4 note strip.'),
      li('Crew cover: the boom operator is unavailable on days 4 and 5; a cover boom is booked. The dolly grip is TENTATIVE on day 6. The editor, colourist and sound editor have post bookings.'),
      li('Finance: deposits and prep labour are invoiced; hire balances are draft invoices dated after wrap. Overdue: CCL-0307 (lodging) and GPL-007 (gaffer recce). RPD-0075 is an invoice against a purchase order that is still a draft. PO-MUC-001 was amended upwards. PO-ORV-001 was cancelled and replaced. PO-RLR-001 is in EUR with a locked rate. PPS-3345 and the recce travel have no budget-line match.'),
      li('Floats and receipts: the art and production floats have petty-cash expenses with receipt PDFs. VAT tracking is on at 20%; one legal invoice has its VAT reclaimed.'),
      li('Safety: risk assessments for each day with built-in and project hazards. Days 1–3 are approved, 4–7 are drafts. Hospital and police fields use real Manchester addresses.'),
      li('Music: "Free Bird" (scene 7, a cappella chorus) is pending clearance; the library tracks for scenes 9, 11 and 12 are cleared.'),
      li(`Floor Plans (experimental; turn on Settings → Developer → Show experimental features, then Schedule → Floor Plans): ${s.floorPlans} plans with ${s.floorPlanSetups} setups. Set plans for the café, the pub, Hugh’s and Maisie’s flats, the park, the club pavement, the bus, the bar and the load-out, with cameras, cast, lights and grip placed for key shots (try the Fisher 11 on track in the pub, scene 14 shot 8, or the 12 m of track in the park, scene 16 shot 2). Unit base plans for the Wilmslow Road and Church Street car parks, the bus yard and the pub’s loading lane. The park, café, pub and club plans know where they are: turn on Sun for Day 6 to see the light on the bench in scene 17. Send Day Pack can include each unit’s floor plans.`),
      li('Equipment: hire kit is out from 30 Oct to 12 Nov with return reminders; per-day pack lists exist for camera, sound, grip, lighting, the bus day, the night exterior, the Second Unit and the script supervisor’s kit.'),
      h1('What the script parser did'),
      p('The script was run through Albatross’s own PDF parser. It found all 18 scenes and their lengths in eighths. A reviewer then corrected what the parser can’t read: sluglines using an en dash ("BAR – EVENING" is read as a location), times of day like EVENING / MORNING / EARLY MORNING, and the "DAY/NIGHT" montage headings.'),
      p('Line types are a separate story. For this A4 script the parser labelled every body line "dialogue" (no action, no character cues), which would collapse each scene to a few lines in the lined script. The script version in this project was therefore built with a layout classifier calibrated to this PDF (action, dialogue, cues, parentheticals and directives), with pages numbered as printed (the title page is not counted). Pages, sections, characters and shot links were then generated by the app’s own script-section generator. Re-importing the PDF through Script Import will currently give the collapsed version.'),
      ...parse,
      h1('Notes and limits'),
      li('No slates, takes, tramlines or notes are pre-logged by design, so you can test from a clean log.'),
      li('Scenes 1, 7 and 8 are split by unit or day. The Day Out of Days works at scene level, so it will treat both halves of scene 7 as the same scene.'),
      li('Real venues (Platt Fields Park, Peveril of the Peak, Koffee Pot, SOUP, Sandbar, Albert Hall, Benzie Building, Manchester Royal Infirmary, Longsight police station) are used for location planning only. Nothing here implies those venues have agreed to anything; the permits and agreements in Documents are placeholders.'),
    ],
  })
}
