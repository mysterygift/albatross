/**
 * Toothpick cast and crew. All names are fictional; e-mail addresses use the reserved
 * ".example" TLD and phone numbers use Ofcom's drama ranges (07700 900xxx, 0161 496 0xxx,
 * 020 7946 0xxx), so nothing here can reach a real person.
 */
import type { CrewDepartmentName } from '@/lib/people/crewDepartments'

export type CastKey =
  | 'hugh' | 'don' | 'maisie' | 'rose' | 'minty' | 'bouncer' | 'customer' | 'cottagecore'
  | 'woman1' | 'woman2' | 'woman3' | 'sa1' | 'sa2' | 'sa3' | 'sa4' | 'sa5' | 'sa6'

export type CastDef = {
  key: CastKey
  name: string
  cast_number: string | null
  /** Character cue as it appears in the script (the Script Import links cues to cast by this). */
  role_name: string
  agent_name: string | null
  agent_email: string | null
  agent_phone: string | null
  contributor_form_status: 'not_requested' | 'requested' | 'signed' | 'expired'
  notes: string
}

const AG = (agency: string, contact: string, phone: string) => ({
  agent_name: `${contact} (${agency})`,
  agent_email: `${contact.toLowerCase().replace(/[^a-z]+/g, '.')}@${agency.toLowerCase().replace(/[^a-z]+/g, '')}-demo.example`,
  agent_phone: phone,
})

export const CAST: CastDef[] = [
  {
    key: 'hugh', name: 'Kofi Asante', cast_number: '1', role_name: 'Hugh',
    ...AG('Northern Lights Talent', 'Anneliese Brandt', '0161 496 0211'),
    contributor_form_status: 'signed',
    notes: 'Lead. Playing age 22, tall and lanky. Mancunian accent (native). In every shoot day; avoid back-to-back nights and 06:00 calls. Wardrobe: jacket with pockets for the cigarettes, "Birthday Boy" badge (scene 14).',
  },
  {
    key: 'don', name: 'Arjun Malhotra', cast_number: '2', role_name: 'Don',
    ...AG('Meridian Artists', 'Callum Ferreira', '020 7946 0318'),
    contributor_form_status: 'signed',
    notes: 'Playing age 23, black hair, "piddly beard" (scene 1 mirror business — keep the beard patchy, no grooming). Sings the chorus of "Free Bird" down the phone (scene 7): needs a rehearsal at the sound check.',
  },
  {
    key: 'maisie', name: 'Amara Okafor', cast_number: '3', role_name: 'Maisie',
    ...AG('Northern Lights Talent', 'Anneliese Brandt', '0161 496 0211'),
    contributor_form_status: 'signed',
    notes: 'Playing age 20, arty straight-shooter. Hair/lipstick change between scenes 14 and 15 (a year on) — see continuity photos. Pub scene with Hugh and the argument in scene 9 are the emotional spine; keep her fresh for them.',
  },
  {
    key: 'rose', name: 'Sofia Marchetti', cast_number: '4', role_name: 'Rose',
    ...AG('Meridian Artists', 'Callum Ferreira', '020 7946 0318'),
    contributor_form_status: 'requested',
    notes: 'Playing age 21, chic, always has a mad story. Pint of ale, not lager, in scene 10 (props to confirm). Contributor form chased 28 Sep.',
  },
  {
    key: 'minty', name: 'Noor Haddad', cast_number: '5', role_name: 'Minty',
    ...AG('Cobblestone Casting & Management', 'Priyanka Rao', '0161 496 0342'),
    contributor_form_status: 'signed',
    notes: 'Pale green cardigan and "crazy earrings" (Art/Costume to source). Smokes herbal cigarettes only. TENTATIVE/UNAVAILABLE Thu 5 Nov (theatre tech rehearsal) — scene 12 is currently scheduled that day, see availability.',
  },
  {
    key: 'bouncer', name: 'Tomasz Wójcik', cast_number: '6', role_name: 'Bouncer',
    ...AG('Cobblestone Casting & Management', 'Priyanka Rao', '0161 496 0342'),
    contributor_form_status: 'signed',
    notes: 'Day player, non-speaking, scene 11 (club exterior). Needs to be seen "chatted up" by Rose — plays it deadpan. SIA-style door-staff costume.',
  },
  {
    key: 'customer', name: 'Ingrid Solheim', cast_number: '7', role_name: 'Customer',
    ...AG('Meridian Artists', 'Callum Ferreira', '020 7946 0318'),
    contributor_form_status: 'requested',
    notes: 'Day player, scene 7. Queues outside the café bathroom, listening to Hugh’s call. One reaction line to be added at the director’s discretion (in which case upgrade to speaking day-player rate).',
  },
  {
    key: 'cottagecore', name: 'Chiara Bellandi', cast_number: '8', role_name: 'Cottage-core girl',
    ...AG('Cobblestone Casting & Management', 'Priyanka Rao', '0161 496 0342'),
    contributor_form_status: 'not_requested',
    notes: 'Day player, scene 18, the closing beat. Floral dress, friends have gone for a cig; she gestures Hugh over. Offer sent, awaiting reply.',
  },
  {
    key: 'woman1', name: 'Priya Venkataraman', cast_number: '9', role_name: 'Woman (hotel bar)',
    ...AG('Meridian Artists', 'Callum Ferreira', '020 7946 0318'),
    contributor_form_status: 'signed', notes: 'Montage scene 13 — one of "different women in different bars". Half-day.',
  },
  {
    key: 'woman2', name: 'Lucía Fernández', cast_number: '10', role_name: 'Woman (bar)',
    ...AG('Northern Lights Talent', 'Anneliese Brandt', '0161 496 0211'),
    contributor_form_status: 'signed', notes: 'Montage scene 13. Half-day.',
  },
  {
    key: 'woman3', name: 'Zainab Bello', cast_number: '11', role_name: 'Woman (terrace)',
    ...AG('Cobblestone Casting & Management', 'Priyanka Rao', '0161 496 0342'),
    contributor_form_status: 'requested', notes: 'Montage scene 13 — the outdoor-table beat. Half-day.',
  },
  { key: 'sa1', name: 'Yosef Cohen', cast_number: null, role_name: 'SA – bus youth', agent_name: null, agent_email: null, agent_phone: null, contributor_form_status: 'signed', notes: 'Supporting artist, scene 1 (jeering from the front of the bus). Booked via Piccadilly Casting & Extras.' },
  { key: 'sa2', name: 'Malik Johnson', cast_number: null, role_name: 'SA – bus youth', agent_name: null, agent_email: null, agent_phone: null, contributor_form_status: 'signed', notes: 'Supporting artist, scene 1. Booked via Piccadilly Casting & Extras.' },
  { key: 'sa3', name: 'Bao Nguyen', cast_number: null, role_name: 'SA – bus youth', agent_name: null, agent_email: null, agent_phone: null, contributor_form_status: 'requested', notes: 'Supporting artist, scene 1. Booked via Piccadilly Casting & Extras.' },
  { key: 'sa4', name: 'Eilidh Mackenzie', cast_number: null, role_name: 'SA – pub regular / coursemate', agent_name: null, agent_email: null, agent_phone: null, contributor_form_status: 'signed', notes: 'Supporting artist: pub regular (scenes 14, 18) and Maisie’s coursemate (montage 8, Second Unit).' },
  { key: 'sa5', name: 'Oluwaseun Adebayo', cast_number: null, role_name: 'SA – pub regular / coursemate', agent_name: null, agent_email: null, agent_phone: null, contributor_form_status: 'signed', notes: 'Supporting artist: pub regular (scenes 14, 18) and Maisie’s coursemate (montage 8, Second Unit).' },
  { key: 'sa6', name: 'Mustafa Aydin', cast_number: null, role_name: 'SA – club queue', agent_name: null, agent_email: null, agent_phone: null, contributor_form_status: 'not_requested', notes: 'Supporting artist, scene 11 (queueing outside the venue).' },
]

export type CrewDef = {
  key: string
  name: string
  department: CrewDepartmentName
  role_name: string
  phases: string
  notes: string
  /** Shoot days (1–7) the person is booked on. Defaults to every day. */
  days?: number[]
  /** Booking-level role label when it differs from the job title (e.g. 2nd unit). */
  bookingRole?: Record<number, string>
  /** Prep window (ISO) for a non-shoot-day booking. */
  prep?: [string, string]
  /** Post window (ISO) for a non-shoot-day booking. */
  post?: [string, string]
  /** Labour-company vendor name (this person invoices through a limited company). */
  labourCompany?: string
}

const ALL = [1, 2, 3, 4, 5, 6, 7]

export const CREW: CrewDef[] = [
  // Development
  { key: 'director', name: 'Teodora Vasile', department: 'Development', role_name: 'Director', phases: 'development,prep,shoot,post', notes: 'Wants rehearsal time with Kofi and Amara before day 2 (the argument scene). Prefers handheld, long takes; will accept coverage for the two-handers.', prep: ['2026-10-19', '2026-10-30'], post: ['2026-11-16', '2026-12-04'], labourCompany: 'Teodora Vasile Films Ltd' },
  { key: 'producer', name: 'Imani Okonkwo-Reid', department: 'Development', role_name: 'Producer', phases: 'development,prep,shoot,wrap,post', notes: 'Holds budget and festival strategy. Wants a daily progress report from the script supervisor by 20:00.', days: [1, 3, 5, 7], prep: ['2026-10-12', '2026-10-30'] },
  { key: 'execProducer', name: 'Hiroshi Nakamura', department: 'Development', role_name: 'Executive Producer', phases: 'development,prep', notes: 'Finance partner. Sign-off on any PO above £2,500.', days: [] },
  { key: 'castingDirector', name: 'Farida Rahimi', department: 'Development', role_name: 'Casting Director', phases: 'development,prep', notes: 'Cast principals and day players; still looking for the three montage women (done) and two more SAs for the pub.', days: [] },
  // Production
  { key: 'lineProducer', name: 'Priyanka Deshmukh', department: 'Production', role_name: 'Line Producer', phases: 'prep,shoot,wrap,post', notes: 'HOD Production. Owns the schedule and cost report. Wants overruns flagged by the script supervisor before the lunch strip.', days: ALL, prep: ['2026-10-12', '2026-10-30'], post: ['2026-11-16', '2026-11-27'] },
  { key: 'productionManager', name: 'Mikael Lindgren', department: 'Production', role_name: 'Production Manager', phases: 'prep,shoot,wrap', notes: 'Runs unit moves and transport between Fallowfield, the Northern Quarter and Trafford Park.', days: ALL, prep: ['2026-10-19', '2026-10-30'] },
  { key: 'coordinator', name: 'Zainab Al-Rashid', department: 'Production', role_name: 'Production Coordinator', phases: 'prep,shoot,wrap', notes: 'Paperwork, call sheets and cast travel. Sends the call sheet the evening before by 18:00.', days: ALL, prep: ['2026-10-12', '2026-10-30'], post: ['2026-11-16', '2026-11-20'] },
  { key: 'secretary', name: 'Ewa Kowalczyk', department: 'Production', role_name: 'Production Secretary', phases: 'prep,shoot', notes: 'Production office cover: contracts, deal memos and crew starter packs.', days: [1, 2, 3, 4, 5], prep: ['2026-10-19', '2026-10-30'] },
  { key: 'firstAd', name: 'Rafael Oliveira', department: 'Production', role_name: 'Assistant Director', phases: 'prep,shoot', notes: '1st AD. Needs final cast and SA counts locked by 16:00 the day before. Works hand-in-hand with the script supervisor on the daily progress report.', days: ALL, prep: ['2026-10-22', '2026-10-30'], labourCompany: 'Rafael Oliveira AD Services' },
  { key: 'floorRunner1', name: 'Tendai Moyo', department: 'Production', role_name: 'Floor Runner', phases: 'shoot', notes: 'Set runner. Driving licence, no vehicle.', days: ALL },
  { key: 'floorRunner2', name: 'Ciarán Doyle', department: 'Production', role_name: 'Floor Runner', phases: 'shoot', notes: 'Set runner and SA wrangler on days 3 and 6.', days: ALL },
  { key: 'pa', name: 'Hana Sato', department: 'Production', role_name: 'Production Assistant', phases: 'shoot,wrap', notes: 'Unit base support: catering liaison, paperwork runs, parking marshals.', days: ALL },
  { key: 'scriptSup', name: 'Mirela Kovač', department: 'Production', role_name: 'Script Supervisor', phases: 'prep,shoot,post', notes: 'Continuity and slating. UK consecutive slating; second-unit slates use the X prefix. Wants to line the script with tramlines and send the editor’s log (CSV) at wrap. Tablet in landscape; needs a quiet corner of video village.', days: ALL, prep: ['2026-10-28', '2026-10-30'], post: ['2026-11-16', '2026-11-17'], labourCompany: 'Mirela Kovač Continuity Ltd', bookingRole: { 2: 'Script Supervisor (Main + 2nd Unit inserts)', 7: 'Script Supervisor (Main Unit)' } },
  // Finance
  { key: 'accountant', name: 'Samuel Abiodun', department: 'Finance', role_name: 'Production Accountant', phases: 'prep,shoot,wrap,post', notes: 'HOD Finance. Needs PO numbers on every invoice. Weekly cost report on Fridays.', days: [1, 3, 5, 7], prep: ['2026-10-19', '2026-10-30'], post: ['2026-11-16', '2026-12-11'] },
  { key: 'cashier', name: 'Katarzyna Nowak', department: 'Finance', role_name: 'Cashier', phases: 'shoot,wrap', notes: 'Looks after floats and petty cash envelopes; receipts reconciled within 24 hours.', days: [1, 2, 3, 4, 5, 6, 7] },
  // Locations
  { key: 'locationsManager', name: "Declan O'Rourke", department: 'Locations', role_name: 'Locations Manager', phases: 'prep,shoot,wrap', notes: 'HOD Locations. Holds the Screen Manchester permit pack, resident letters and venue agreements.', days: ALL, prep: ['2026-10-05', '2026-10-30'] },
  { key: 'assistantLocations', name: 'Fatima Zahra Idrissi', department: 'Locations', role_name: 'Assistant Locations Manager', phases: 'prep,shoot', notes: 'Coordinates parking, local notices and site contacts. Drives her own vehicle.', days: ALL, prep: ['2026-10-12', '2026-10-30'] },
  { key: 'unitManager', name: 'Yusuf Demir', department: 'Locations', role_name: 'Unit Manager', phases: 'shoot', notes: 'Unit base logistics, toilets, power and crew meals on move days.', days: ALL },
  { key: 'marshal1', name: 'Bartosz Lis', department: 'Locations', role_name: 'Locations Marshall', phases: 'shoot', notes: 'Pavement and park path marshal (days 1, 5, 7).', days: [1, 5, 7] },
  { key: 'marshal2', name: 'Gwen Pritchard', department: 'Locations', role_name: 'Locations Marshall', phases: 'shoot', notes: 'Pavement marshal for the club exterior and the Albert Hall load-out.', days: [5, 7] },
  // Art
  { key: 'productionDesigner', name: 'Anouk de Vries', department: 'Art', role_name: 'Production Designer', phases: 'prep,shoot,wrap', notes: 'HOD Art. Hugh’s flat stays bare; Minty’s flat is the opposite — curated trinkets, prints, incense. Weekly invoices via her design company.', days: ALL, prep: ['2026-10-12', '2026-10-30'], labourCompany: 'Anouk de Vries Design Ltd' },
  { key: 'setDecorator', name: 'Kenji Watanabe', department: 'Art', role_name: 'Set Decorator', phases: 'prep,shoot,wrap', notes: 'Pub, café and flat dressing. Wants revised dressing lists after the tech recce.', days: ALL, prep: ['2026-10-19', '2026-10-30'] },
  { key: 'propMaster', name: 'Rhiannon Hughes', department: 'Art', role_name: 'Prop Master', phases: 'prep,shoot,wrap', notes: 'Hero props: ibuprofen packet, poker cards and chips, Wii remote, clipper lighter, cigarettes (herbal), hero slow cooker. Tracks continuity photos with the script supervisor.', days: ALL, prep: ['2026-10-19', '2026-10-30'] },
  { key: 'buyer', name: 'Lakshmi Iyer', department: 'Art', role_name: 'Production Buyer', phases: 'prep,shoot', notes: 'Emergency buys and art petty cash. Card pre-approval above £250.', days: [1, 2, 3, 4], prep: ['2026-10-19', '2026-10-30'] },
  { key: 'costumeDesigner', name: 'Esperanza Cruz', department: 'Art', role_name: 'Costume Designer', phases: 'prep,shoot,wrap', notes: 'Principal looks, plus the year-on change between scenes 14 and 15. Keeps duplicates of Hugh’s jacket (night-out scenes).', days: ALL, prep: ['2026-10-14', '2026-10-30'] },
  { key: 'makeUp', name: 'Tamsin Okoye', department: 'Art', role_name: 'Hair and Make Up Designer', phases: 'prep,shoot,wrap', notes: 'Hugh’s hangover pallor, Don’s patchy beard, Maisie’s hair colour change.', days: ALL, prep: ['2026-10-26', '2026-10-30'] },
  { key: 'costumeTrainee', name: 'Ayaan Qureshi', department: 'Art', role_name: 'Costume Trainee', phases: 'shoot', notes: 'Wardrobe runner and continuity photos for costume.', days: [1, 2, 4, 5, 6, 7] },
  { key: 'makeUpTrainee', name: 'Mei Chen', department: 'Art', role_name: 'Hair and Make Up Trainee', phases: 'shoot', notes: 'Make-up assistant; SA make-up on days 3 and 6.', days: [1, 2, 3, 5, 6, 7] },
  // Camera
  { key: 'dop', name: 'Lars Eriksson', department: 'Camera', role_name: 'Director of Photography', phases: 'prep,shoot,post', notes: 'HOD Camera. Handheld verité feel; wants lens charts circulated before the tech recce. Grades with the colourist in post.', days: ALL, prep: ['2026-10-19', '2026-10-30'], post: ['2026-12-07', '2026-12-11'], labourCompany: 'Lars Eriksson Cinematography Ltd' },
  { key: 'operator', name: 'Adaeze Nwosu', department: 'Camera', role_name: 'Camera Operator', phases: 'shoot', notes: 'Main unit operator. Also operates Second Unit on days 2 and 7.', days: ALL, bookingRole: { 2: 'Camera Operator (Second Unit)', 7: 'Camera Operator (Second Unit)' } },
  { key: 'firstAc', name: 'Rohan Kapoor', department: 'Camera', role_name: '1st Assistant Camera', phases: 'prep,shoot', notes: 'Focus puller; prep of primes and zooms.', days: ALL, prep: ['2026-10-26', '2026-10-30'] },
  { key: 'secondAc', name: 'Elif Yıldız', department: 'Camera', role_name: '2nd Assistant Camera', phases: 'shoot', notes: 'Clapper loader. Slates and camera reports; works with the script supervisor on slate numbering and camera roll IDs.', days: ALL },
  { key: 'dit', name: 'Mateusz Zielinski', department: 'Camera', role_name: 'Digital Imaging Technician', phases: 'prep,shoot,post', notes: 'LUT, backups and daily rushes. Needs the script supervisor’s print takes list at wrap.', days: ALL, prep: ['2026-10-28', '2026-10-30'] },
  { key: 'videoAssist', name: 'Colm Brennan', department: 'Camera', role_name: 'Video Assist Operator', phases: 'shoot', notes: 'Video village feed for the director and script supervisor on interior days.', days: [2, 3, 4, 5, 6] },
  { key: 'cameraTrainee', name: 'Jasmine Osei', department: 'Camera', role_name: 'Camera Trainee', phases: 'shoot', notes: 'Camera department runner; assists on both units on day 7.', days: [1, 2, 3, 5, 7] },
  // Lighting
  { key: 'gaffer', name: 'Giorgos Papadakis', department: 'Lighting', role_name: 'Gaffer', phases: 'prep,shoot,wrap', notes: 'HOD Lighting. Needs a power survey for the Peveril (pub) and the flats; no generator on the park day.', days: ALL, prep: ['2026-10-26', '2026-10-30'], labourCompany: 'Giorgos Papadakis Lighting Ltd' },
  { key: 'bestBoy', name: 'Shanice Williams', department: 'Lighting', role_name: 'Best Boy', phases: 'prep,shoot,wrap', notes: 'Lamp orders, distro maps and crew calls.', days: ALL, prep: ['2026-10-28', '2026-10-30'] },
  { key: 'spark1', name: 'Dmitri Volkov', department: 'Lighting', role_name: 'Spark', phases: 'shoot', notes: 'Rigging at the pub and the club exterior.', days: ALL },
  { key: 'spark2', name: 'Aisha Bakr', department: 'Lighting', role_name: 'Spark', phases: 'shoot', notes: 'Rigging; second unit lighting on day 7.', days: [1, 2, 3, 4, 7], bookingRole: { 7: 'Spark (Second Unit)' } },
  // Grip
  { key: 'keyGrip', name: 'Tunde Balogun', department: 'Grip', role_name: 'Key Grip', phases: 'prep,shoot,wrap', notes: 'HOD Grip. Rocks the bus for scene 1 and builds the bench rig for the park walk-and-talk.', days: ALL, prep: ['2026-10-28', '2026-10-30'] },
  { key: 'dollyGrip', name: 'Sven Larsen', department: 'Grip', role_name: 'Dolly Grip', phases: 'shoot', notes: 'Track and dolly for the park walk (day 1) and the pub (day 3).', days: [1, 3, 4, 6] },
  { key: 'grip', name: 'Mohammed Farah', department: 'Grip', role_name: 'Grip', phases: 'shoot,wrap', notes: 'Rigging and load-out at wrap.', days: ALL },
  // Sound
  { key: 'soundMixer', name: 'Helena Costa', department: 'Sound', role_name: 'Sound Mixer', phases: 'prep,shoot,post', notes: 'HOD Sound. Dialogue-heavy scenes (9, 10, 14, 15) flagged 24h ahead. Needs a wild-track slot at the end of each setup — the script supervisor logs them.', days: ALL, prep: ['2026-10-28', '2026-10-30'], labourCompany: 'Helena Costa Sound' },
  { key: 'boom', name: 'Akira Mori', department: 'Sound', role_name: 'Boom Operator', phases: 'shoot', notes: 'UNAVAILABLE 5–6 Nov (booked on a commercial) — cover boom arranged for days 4 and 5.', days: [1, 2, 3, 6, 7] },
  { key: 'boomCover', name: 'Dayo Adeyemi', department: 'Sound', role_name: 'Boom Operator', phases: 'shoot', notes: 'Day-player cover for Akira on days 4 and 5.', days: [4, 5], bookingRole: { 4: 'Boom Operator (cover)', 5: 'Boom Operator (cover)' } },
  { key: 'soundAssistant', name: 'Naledi Dlamini', department: 'Sound', role_name: 'Sound Assistant', phases: 'shoot,wrap', notes: 'Radio mic turnover, sound reports and playback (techno for the club scene).', days: ALL },
  // Post
  { key: 'editor', name: 'Valentina Rossi', department: 'Post-Production', role_name: 'Editor', phases: 'shoot,post', notes: 'HOD Post. Starts assemblies during the shoot. Needs the editor’s log (CSV) and continuity sheets from the script supervisor each day.', days: [], post: ['2026-11-09', '2026-12-18'], labourCompany: 'Valentina Rossi Editorial' },
  { key: 'assistantEditor', name: 'Kwesi Boateng', department: 'Post-Production', role_name: 'Assistant Editor', phases: 'shoot,post', notes: 'Sync, turnovers and media logs.', days: [], post: ['2026-11-09', '2026-12-04'] },
  { key: 'colourist', name: 'Ingrid Haugen', department: 'Post-Production', role_name: 'Colourist', phases: 'post', notes: 'Grading block 7–11 Dec at the post house.', days: [], post: ['2026-12-07', '2026-12-11'], labourCompany: 'Ingrid Haugen Colour' },
  { key: 'postSupervisor', name: 'Omar Haddad', department: 'Post-Production', role_name: 'Post-Production Supervisor', phases: 'prep,post', notes: 'HOD Post workflow and deliverables schedule. No relation to Noor Haddad.', days: [], prep: ['2026-10-26', '2026-10-30'], post: ['2026-11-16', '2027-02-26'] },
  { key: 'soundEditor', name: 'Pavel Novák', department: 'Post-Production', role_name: 'Supervising Sound Editor', phases: 'post', notes: 'Dialogue edit, ADR and the mix.', days: [], post: ['2026-12-14', '2027-01-15'] },
]

export type CastAvailabilityDef = { cast: CastKey; start: string; end: string; availability: 'AVAILABLE' | 'UNAVAILABLE' | 'TENTATIVE'; notes: string }
export const CAST_AVAILABILITY: CastAvailabilityDef[] = [
  { cast: 'hugh', start: '2026-10-19', end: '2026-11-13', availability: 'AVAILABLE', notes: 'Full prep and shoot window, no clashes. Wardrobe fitting 28 Oct.' },
  { cast: 'don', start: '2026-11-04', end: '2026-11-04', availability: 'AVAILABLE', notes: 'Confirmed for the pub day.' },
  { cast: 'don', start: '2026-11-09', end: '2026-11-09', availability: 'AVAILABLE', notes: 'Confirmed for Don’s flat and bus (day 6).' },
  { cast: 'don', start: '2026-11-06', end: '2026-11-06', availability: 'UNAVAILABLE', notes: 'Voiceover session in London. Not scheduled this day.' },
  { cast: 'maisie', start: '2026-11-02', end: '2026-11-10', availability: 'AVAILABLE', notes: 'Available across the shoot.' },
  { cast: 'maisie', start: '2026-11-10', end: '2026-11-10', availability: 'TENTATIVE', notes: 'Holding for a commercial callback; confirm by 30 Oct. Second Unit degree-show montage depends on this.' },
  { cast: 'rose', start: '2026-11-04', end: '2026-11-06', availability: 'AVAILABLE', notes: 'Confirmed for the pub (4th) and club exterior (6th).' },
  { cast: 'rose', start: '2026-11-09', end: '2026-11-13', availability: 'UNAVAILABLE', notes: 'Away — theatre tour. Not needed after day 5.' },
  { cast: 'minty', start: '2026-11-05', end: '2026-11-05', availability: 'UNAVAILABLE', notes: 'Theatre tech rehearsal all day. CLASH: scene 12 (Minty’s flat) is scheduled on day 4 — move it to day 5 or day 7.' },
  { cast: 'minty', start: '2026-11-06', end: '2026-11-06', availability: 'AVAILABLE', notes: 'Free from 12:00 for the club exterior (scene 11).' },
  { cast: 'bouncer', start: '2026-11-06', end: '2026-11-06', availability: 'AVAILABLE', notes: 'Evening only.' },
  { cast: 'cottagecore', start: '2026-11-04', end: '2026-11-04', availability: 'TENTATIVE', notes: 'Offer out; awaiting agent confirmation. Only 1 scene (the closing beat).' },
  { cast: 'woman3', start: '2026-11-10', end: '2026-11-10', availability: 'TENTATIVE', notes: 'Waiting on a conflicting booking; confirm by 3 Nov.' },
]

export type CrewAvailabilityDef = { crew: string; start: string; end: string; availability: 'AVAILABLE' | 'UNAVAILABLE' | 'TENTATIVE'; notes: string }
export const CREW_AVAILABILITY: CrewAvailabilityDef[] = [
  { crew: 'boom', start: '2026-11-05', end: '2026-11-06', availability: 'UNAVAILABLE', notes: 'On a commercial shoot — Dayo Adeyemi booked as cover on days 4 and 5.' },
  { crew: 'dollyGrip', start: '2026-11-09', end: '2026-11-09', availability: 'TENTATIVE', notes: 'Pencilled on another job; confirm by 2 Nov. If lost, Mohammed Farah pushes the dolly (no track needed on the static bus).' },
  { crew: 'costumeTrainee', start: '2026-11-03', end: '2026-11-03', availability: 'UNAVAILABLE', notes: 'College day.' },
  { crew: 'colourist', start: '2026-12-07', end: '2026-12-11', availability: 'AVAILABLE', notes: 'Grading block reserved.' },
  { crew: 'editor', start: '2026-11-09', end: '2026-12-18', availability: 'AVAILABLE', notes: 'Available for assembly and director’s cut.' },
  { crew: 'spark2', start: '2026-11-06', end: '2026-11-06', availability: 'UNAVAILABLE', notes: 'Family event. Not booked on day 5.' },
]

/** Contact details are derived from position/name so every table agrees (key contacts, RAMS, people). */
export function crewPhone(key: string): string {
  const i = CREW.findIndex((c) => c.key === key)
  if (i < 0) throw new Error(`No crew ${key}`)
  return `07700 900${300 + i}`
}
export function crewEmailLocal(key: string): string {
  return crewByKey(key).name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[’']/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
}

export function crewByKey(key: string): CrewDef {
  const c = CREW.find((x) => x.key === key)
  if (!c) throw new Error(`No crew ${key}`)
  return c
}
export function castByKey(key: CastKey): CastDef {
  const c = CAST.find((x) => x.key === key)
  if (!c) throw new Error(`No cast ${key}`)
  return c
}
