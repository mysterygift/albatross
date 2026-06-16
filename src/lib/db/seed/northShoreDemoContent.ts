/**
 * North Shore episodic demo: Italian coastal drama story world, 30 scenes × 8 shots.
 * Used only by demoProductionSeed when seeding DEMO_EPISODIC_SLUG.
 */
import {
  CAMERA_MOVEMENT_VALUES,
  type CameraMovement,
  SHOT_SIZE_VALUES,
  type ShotSize,
} from '../types'
import type { DemoSeedIdSource } from './demoSeedContext'

export const NORTH_SHORE_SCENE_COUNT = 30
export const NORTH_SHORE_SHOTS_PER_SCENE = 8
export const NORTH_SHORE_LOCATION_COUNT = 7

/** Display name for the singleton episodic demo production (`DEMO_EPISODIC_SLUG`). */
export const NORTH_SHORE_DEMO_PRODUCTION_NAME = 'Demo: North Shore' as const

/** Scene index 1..30 → global shot id index base (runDemoContentSeed uses idSource.shot(globalIndex)). */
export function northShoreGlobalShotIndex(sceneNum1Based: number, shotNum1Based: number): number {
  return (sceneNum1Based - 1) * NORTH_SHORE_SHOTS_PER_SCENE + shotNum1Based
}

export type NorthShoreLocationSeed = {
  /** Plain location name for production records (scene headings keep INT/EXT separately). */
  name: string
  booked_status: 'unbooked' | 'hold' | 'booked' | 'wrap'
  address: string
  availability_constraints: string | null
  permit_fee: number | null
  location_fee: number | null
  notes: string | null
}

/** Seven canonical coastal Italian bases (linked from scenes via `locationIndex`). */
export const NORTH_SHORE_LOCATIONS: NorthShoreLocationSeed[] = [
  {
    name: 'Cabin',
    booked_status: 'booked',
    address: 'Località Prevo, 19016 Monterosso al Mare SP, Italy',
    availability_constraints: 'Wooden access road; tech scout before first company move. Quiet hours 22:00-07:00.',
    permit_fee: 280,
    location_fee: 1850,
    notes: 'Terraced vineyard cabin above Monterosso. Power: 32A distro from unit generator.',
  },
  {
    name: "Ship's Deck",
    booked_status: 'booked',
    address: 'Molo Piano di Sorrento, 80063 Piano di Sorrento NA, Italy',
    availability_constraints: 'Harbour master call 48h before; no drone without port authority clearance.',
    permit_fee: 640,
    location_fee: 4200,
    notes: 'Berth for 35m support yacht. Zodiac transfer for camera from floating dock.',
  },
  {
    name: 'Market',
    booked_status: 'hold',
    address: 'Mercato Annonario, Lungomare Vittorio Veneto, 17024 Finale Ligure SV, Italy',
    availability_constraints: 'Saturday market peak 08:00-13:00; background clearance via comune.',
    permit_fee: 450,
    location_fee: null,
    notes: 'Covered hall + palm-lined esplanade for exterior reverses.',
  },
  {
    name: 'Beach',
    booked_status: 'booked',
    address: 'Spiaggia del Cannone, Via Krupp, 80073 Capri NA, Italy',
    availability_constraints: 'Night shoot window approved Fri-Sun only; turtle nesting signage respected.',
    permit_fee: 520,
    location_fee: 3600,
    notes: 'Tide check D-1. Bonfire SFX cold only; marine safety RIB on standby.',
  },
  {
    name: 'Car',
    booked_status: 'booked',
    address: 'Via Aurelia Nord, 54033 Marina di Carrara MS, Italy (coastal SS1 staging / process)',
    availability_constraints: 'Process trailer base at Carrara lorry park; highway permits for tow rig.',
    permit_fee: 380,
    location_fee: 900,
    notes: 'Hero picture car: side-mount and Russian arm support from Livorno vendor.',
  },
  {
    name: 'Bathroom',
    booked_status: 'hold',
    address: 'Hotel Excelsior, Lungomare Marconi, 30126 Lido di Venezia VE, Italy',
    availability_constraints: 'Guest floor quiet corridor; wet-down after 23:00 only with hotel engineering.',
    permit_fee: null,
    location_fee: 2400,
    notes: 'Corner suite bathroom dressed as shared rental flat. Steam generator on GFI circuit.',
  },
  {
    name: 'School',
    booked_status: 'booked',
    address: 'Liceo Scientifico Galilei, Viale Italia, 57123 Livorno LI, Italy',
    availability_constraints: 'Term-time: weekends and holidays only. Minors: tutor + safeguarding on unit.',
    permit_fee: 200,
    location_fee: 3200,
    notes: 'Main corridor + science lab holding. Fire alarm bypass 09:00-18:00 signed with headteacher.',
  },
]

export type NorthShoreSceneSeed = {
  heading: string
  title: string
  description: string
  int_ext: 'INT' | 'EXT'
  day_night: 'DAY' | 'NIGHT'
  /** 1-7 index into NORTH_SHORE_LOCATIONS */
  locationIndex: number
  page_eighths: number
}

/**
 * Thirty scenes: E1 1-10 summer arrival / secret; E2 11-20 pressure / community fracture;
 * E3 21-30 reckoning / departure. Location indices rotate through the seven slugs for variety.
 */
export const NORTH_SHORE_SCENES: NorthShoreSceneSeed[] = [
  // Episode 1
  {
    heading: 'INT. CABIN - DAY',
    title: 'Morning ledgers',
    description:
      'JADE sorts ferry tickets beside a jar of sea glass--proof her uncle still watched the water. A radio weather report cuts in; she kills it.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 1,
    page_eighths: 5,
  },
  {
    heading: "EXT. SHIP'S DECK - DAY",
    title: 'Arrival groove',
    description:
      "ARI helps tourists with bags while scanning the quay for a courier. The ship's horn masks his whispered phone call.",
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 2,
    page_eighths: 6,
  },
  {
    heading: 'EXT. MARKET - DAY',
    title: 'The wrong envelope',
    description:
      'NAOMI, plain-clothes liaison, intercepts a hand-off meant for ARI. Lemons tumble; crowd covers the switch.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 3,
    page_eighths: 7,
  },
  {
    heading: 'INT. CAR - DAY',
    title: 'Coastal road truth',
    description:
      'JADE drives; ALEX navigates. They argue about whether to involve the police--rear windshield frames passing cliffs.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 5,
    page_eighths: 5,
  },
  {
    heading: 'INT. SCHOOL - DAY',
    title: 'Corridor rumor',
    description:
      "MILO plants a rumor about Elena's family; LEAH overhears and films a thread of whispers for her piece.",
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 7,
    page_eighths: 6,
  },
  {
    heading: 'EXT. BEACH - NIGHT',
    title: 'Bioluminescence pact',
    description:
      'JADE and TOMASZ drag a dinghy; they agree on a midnight rule--no phones, no shore lights--for ten minutes.',
    int_ext: 'EXT',
    day_night: 'NIGHT',
    locationIndex: 4,
    page_eighths: 8,
  },
  {
    heading: 'INT. BATHROOM - NIGHT',
    title: 'Sick with fear',
    description:
      'EVELYN steadies herself after a threatening voice note; steam hides her face as she deletes call history.',
    int_ext: 'INT',
    day_night: 'NIGHT',
    locationIndex: 6,
    page_eighths: 4,
  },
  {
    heading: 'INT. CABIN - DAY',
    title: 'Hidden chart',
    description:
      'OWEN unfurls a nautical chart marked with pencil crosses--old smuggling routes that now match marina CCTV blind spots.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 1,
    page_eighths: 7,
  },
  {
    heading: 'EXT. MARKET - DAY',
    title: 'Second coffee',
    description:
      'PRIYA buys time with a vendor while SERENA negotiates a penalty clause on a development contract, streets noisy behind them.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 3,
    page_eighths: 5,
  },
  {
    heading: "EXT. SHIP'S DECK - DAY",
    title: "Captain's warning",
    description:
      'MARCUS gets a blunt warning from the ferry master: coast guard is asking questions; someone is feeding them.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 2,
    page_eighths: 6,
  },
  // Episode 2
  {
    heading: 'INT. SCHOOL - DAY',
    title: 'Lab ignition',
    description:
      'A failed Bunsen prank triggers a sprinkler; Nadia shields a child--telephoto parents capture the wrong angle.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 7,
    page_eighths: 6,
  },
  {
    heading: 'EXT. BEACH - NIGHT',
    title: 'Bonfire testimony',
    description:
      'BEN distributes burner phones "for safety"; JADE refuses--public split that the crowd reads as betrayal.',
    int_ext: 'EXT',
    day_night: 'NIGHT',
    locationIndex: 4,
    page_eighths: 8,
  },
  {
    heading: 'INT. CAR - DAY',
    title: 'Urgent detour',
    description:
      'DCI NAOMI (Reed) reroutes with MARCUS; they compare timestamps from two harbours--someone is duplicating manifests.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 5,
    page_eighths: 5,
  },
  {
    heading: 'INT. CABIN - DAY',
    title: 'Family crest',
    description:
      "THEO finds a crest carved under a bunk--same symbol as a crate in Owen's photos. Wind snaps the shutters.",
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 1,
    page_eighths: 4,
  },
  {
    heading: 'EXT. MARKET - DAY',
    title: 'Boycott whispers',
    description:
      "LEAH's article goes live; stallholders turn their backs on EVELYN's foundation reps. ARI films the humiliation.",
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 3,
    page_eighths: 7,
  },
  {
    heading: "EXT. SHIP'S DECK - DAY",
    title: 'Customs walkthrough',
    description:
      'Officials board; MILO stalls with a broken passport scanner routine while PRIYA swaps an SD card in the galley.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 2,
    page_eighths: 6,
  },
  {
    heading: 'INT. BATHROOM - NIGHT',
    title: 'Mirror promise',
    description:
      'JADE practices a statement she may never give; ALEX listens from the hallway--door cracked, blue night light.',
    int_ext: 'INT',
    day_night: 'NIGHT',
    locationIndex: 6,
    page_eighths: 5,
  },
  {
    heading: 'INT. SCHOOL - DAY',
    title: 'Counselor door',
    description:
      "SERENA advises suspension for Milo; DCI NAOMI arrives--school isn't neutral ground anymore.",
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 7,
    page_eighths: 6,
  },
  {
    heading: 'EXT. BEACH - NIGHT',
    title: 'Tide argument',
    description:
      'TOMASZ and BEN fight over who moves a cache; flashlight beams jitter like failing continuity.',
    int_ext: 'EXT',
    day_night: 'NIGHT',
    locationIndex: 4,
    page_eighths: 7,
  },
  {
    heading: 'INT. CAR - DAY',
    title: 'Recorded confession',
    description:
      'OWEN plays a muffled tape; Nadia realizes the voice is a loop--someone is layering old audio to bait cops.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 5,
    page_eighths: 5,
  },
  // Episode 3
  {
    heading: "EXT. SHIP'S DECK - DAY",
    title: 'Last crossing',
    description:
      'Jade boards early as the rest wake; ALEX catches the gangway as fog lifts--two timelines converge on the same manifest.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 2,
    page_eighths: 6,
  },
  {
    heading: 'INT. CABIN - DAY',
    title: 'Packed bags',
    description:
      'ALEX leaves the chart on the table--deliberately. THEO adds a ferry schedule circled in red.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 1,
    page_eighths: 5,
  },
  {
    heading: 'EXT. MARKET - DAY',
    title: 'Public witness',
    description:
      'LEAH livestreams an apology that fractures: half the crowd wants reconciliation, half demands arrests.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 3,
    page_eighths: 8,
  },
  {
    heading: 'INT. SCHOOL - DAY',
    title: 'Empty corridor',
    description:
      'MILO returns alone after hours; MARCUS waits--juvenile caution vs investigation clock.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 7,
    page_eighths: 4,
  },
  {
    heading: 'INT. BATHROOM - NIGHT',
    title: 'Final scrub',
    description:
      'EVELYN scrubs ink from her hands--contracts signed under pressure; water runs until it sounds like surf.',
    int_ext: 'INT',
    day_night: 'NIGHT',
    locationIndex: 6,
    page_eighths: 5,
  },
  {
    heading: 'EXT. BEACH - NIGHT',
    title: 'Hands in the tide',
    description:
      'JADE releases the last phone into the water; ARI stops filming--chooses to be present instead.',
    int_ext: 'EXT',
    day_night: 'NIGHT',
    locationIndex: 4,
    page_eighths: 7,
  },
  {
    heading: 'INT. CAR - DAY',
    title: 'Escort run',
    description:
      'NAOMI runs code to the dock; PRIYA rides shotgun decoding radio chatter--sirens far, seagulls near.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 5,
    page_eighths: 6,
  },
  {
    heading: 'INT. CABIN - DAY',
    title: 'Letter left behind',
    description:
      'SERENA leaves a sealed letter for the foundation board; OWEN finds it--reads one line, pockets it.',
    int_ext: 'INT',
    day_night: 'DAY',
    locationIndex: 1,
    page_eighths: 4,
  },
  {
    heading: 'EXT. MARKET - DAY',
    title: 'Bread and truce',
    description:
      'NADIA breaks bread with a vendor who spat at her yesterday--small repair before the season turns.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 3,
    page_eighths: 5,
  },
  {
    heading: "EXT. SHIP'S DECK - DAY",
    title: 'North shore open',
    description:
      'The ferry clears the headland; ensemble on rail--some faces missing, some new. Hold on Jade: she smiles, finally uncertain on purpose.',
    int_ext: 'EXT',
    day_night: 'DAY',
    locationIndex: 2,
    page_eighths: 9,
  },
]

export type NorthShoreShotBeat = { subject: string; description: string }

/** Eight story/action beats per scene — subject = visual focus; description = what happens (not camera grammar). */
export const NORTH_SHORE_SHOT_BEATS: ReadonlyArray<ReadonlyArray<NorthShoreShotBeat>> = [
  [
    { subject: 'Jade at the cabin table', description: 'Jade sorts ferry tickets beside a jar of sea glass, weighing whether to trust the morning light through the shutters.' },
    { subject: 'The sea glass jar', description: 'She turns the jar; worn glass catches the sun—proof her uncle still watched the water.' },
    { subject: 'The weather radio', description: 'A crackling coastal forecast cuts in; she snaps the radio off mid-sentence.' },
    { subject: "Jade's hands", description: 'Her hands freeze on the tickets—thumb smoothing a crease she did not mean to make.' },
    { subject: 'The ferry stubs', description: 'Close on stamped stubs; dates refuse to line up with the story she told Naomi.' },
    { subject: 'Jade', description: 'Her jaw tightens; she stares toward the door as if someone might walk through it.' },
    { subject: 'Cabin window', description: 'Beyond lace curtains, the hillside vineyard holds still—too quiet.' },
    { subject: 'The doorway', description: 'She gathers the tickets; the cabin feels smaller as she stands.' },
  ],
  [
    { subject: 'Ari and the gangway', description: "Ari hefts a tourist's bag, smile fixed, eyes already on the quay." },
    { subject: 'The crowded deck', description: "Passengers press toward the rail; horns and gulls smother half-heard warnings." },
    { subject: "Ari's phone", description: 'He checks the burner; the screen shows a missed call from a harbour number.' },
    { subject: 'Tourist couple', description: 'An older couple thanks him; he nods without hearing the words.' },
    { subject: 'Ship rail and quay', description: 'Past shoulders, courier bikes and a plain white van sit wrong-side for a ferry day.' },
    { subject: 'Ari', description: "He pockets the phone as the ship's horn blasts—covering the exhale he didn't plan." },
    { subject: 'The approaching berth', description: 'Lines are thrown; deckhands shout timing; Ari tracks a man in a navy jacket.' },
    { subject: 'Disembarking crowd', description: 'The first wave rolls toward the gates; Ari slips sideways, hunting the hand-off.' },
  ],
  [
    { subject: 'Naomi in plain clothes', description: "Naomi slips through the market crowd, sightline locked on Ari's courier." },
    { subject: 'Ari at the hand-off', description: 'Ari reaches for the envelope; Naomi’s shoulder cuts between them.' },
    { subject: 'The envelope', description: 'Manila paper switches hands under cover of a dropped crate.' },
    { subject: 'Spilled lemons', description: 'Lemons bounce; shoppers bend; the switch vanishes in the scramble.' },
    { subject: 'Market aisle', description: 'Stall awnings flap; Naomi never breaks stride.' },
    { subject: "Ari's reaction", description: 'Ari clocks the intercept—too late to correct without starting a scene.' },
    { subject: 'Naomi retreating', description: 'Naomi melts into vegetable crates, envelope flat against her ribs.' },
    { subject: 'The market crowd', description: 'Noise swallows what just happened—only bruised fruit remains.' },
  ],
  [
    { subject: 'Jade and Alex', description: 'Jade grips the wheel; Alex shoves the map harder than the moment needs.' },
    { subject: 'Rear window and cliffs', description: 'Through the back glass, limestone blurs past—argument and coastline at once.' },
    { subject: 'Alex', description: 'Alex insists they need the police; every word tightens Jade’s jaw.' },
    { subject: 'Dashboard clutter', description: 'Toll receipts and a ferry brochure slide as the car brakes hard.' },
    { subject: 'Jade', description: 'Jade snaps that silence kept people alive last summer—don’t burn it.' },
    { subject: 'Side mirror', description: 'In the mirror, a hatchback hangs too close for comfort.' },
    { subject: 'Coastal pull-off', description: 'They swing into a gravel bay; gulls wheel; neither opens the door yet.' },
    { subject: 'Windshield two-shot', description: 'For a beat they just breathe; the sea is the only quiet witness.' },
  ],
  [
    { subject: 'Milo with students', description: 'Milo leans in, voice low, planting the rumor about Elena’s family.' },
    { subject: 'Leah at her locker', description: 'Leah freezes; her phone rises to capture the whispers without being seen.' },
    { subject: 'Passing students', description: 'Bodies cut the hallway; the rumor travels in fragments—each face a new carrier.' },
    { subject: "Milo's smile", description: "Milo enjoys the weight of it—until Leah's lens finds him." },
    { subject: 'Classroom door glass', description: "Inside a class, a teacher's silhouette turns—almost catching them." },
    { subject: "Leah's phone screen", description: 'Leah checks her thread—audio peaked; she exhales, ready to post later.' },
    { subject: "Milo's hands", description: "Milo's knuckles tighten on his strap like he's already won." },
    { subject: 'Empty corridor', description: 'The bell drills; lockers slam; the lie keeps walking when they don’t.' },
  ],
  [
    { subject: 'Jade and Tomasz', description: 'They drag the inflatable toward the bioluminescent line where surf meets dark.' },
    { subject: 'The tide edge', description: 'Cold foam climbs their boots; Tomasz checks the water like it’s a third person.' },
    { subject: 'Jade', description: 'Jade sets the rule—no phones, no shore lights—ten minutes of honest dark.' },
    { subject: 'Zip bag of handsets', description: 'Plastic digs into her pocket; she doesn’t look at the burners inside.' },
    { subject: 'Tomasz', description: 'Tomasz nods, half smile, half fear—trust measured in withheld light.' },
    { subject: 'Bioluminescent surf', description: 'Ripples bloom blue-green where they wade—secrets worth the chill.' },
    { subject: 'Distant bonfire', description: 'Far down-beach, a weaker orange pretends this coast is normal.' },
    { subject: 'The dinghy bow', description: 'They shove off shallow; wood scrapes sand—the pact holds if they don’t look back.' },
  ],
  [
    { subject: 'Evelyn at the sink', description: 'Evelyn braces both palms on porcelain; the voice note still plays in her head.' },
    { subject: 'Steam and mirror', description: "Steam climbs; her reflection smears—she can't hold her own eyes long." },
    { subject: 'Phone on the ledge', description: 'The phone vibrates again; she slaps it facedown.' },
    { subject: "Evelyn's throat", description: 'She swallows panic like seawater—no sound on the hotel floor.' },
    { subject: 'Call history', description: 'Her thumb hovers over delete; each number gone makes her safer and more alone.' },
    { subject: 'Dripping faucet', description: 'Water drips a metronome; each drop counts down to what happens at dawn.' },
    { subject: 'Fogged mirror', description: 'She wipes a circle clear—only to study the door behind her.' },
    { subject: 'Towel bundle', description: 'She buries her face in terrycloth; the world narrows to cotton and breath.' },
  ],
  [
    { subject: 'Owen at the bunk', description: 'Owen yanks a drawer; the chart crackles like something alive.' },
    { subject: 'The nautical chart', description: 'Pencil crosses mark old runs; harbours line up with blind CCTV corridors.' },
    { subject: "Owen's hand", description: 'He traces an inlet Naomi mentioned—ink matches lived memory.' },
    { subject: 'Wind and shutters', description: 'Wind snaps wood; the cabin answers the coast without needing a radio.' },
    { subject: 'Coffee ring on paper', description: 'A stain marks one corner—whoever last read this was scared.' },
    { subject: "Owen's profile", description: "Owen's mouth moves; working angles the law never taught him." },
    { subject: 'Circled harbours', description: 'Two harbours marked twice—a pattern, she realises, not coincidence.' },
    { subject: 'Rolled chart', description: 'He rolls it tight; the room feels watched by paper.' },
  ],
  [
    { subject: 'Priya at the stall', description: "Priya buys another espresso she won't drink—stalling for seconds Serena needs." },
    { subject: 'Serena with contract', description: 'Serena pins a development clause with her nail; pen hovers over the kill fee.' },
    { subject: 'Street behind them', description: 'Scooters buzz; awnings flap; the city won’t quiet for their deal.' },
    { subject: "Priya's eyes", description: 'Priya clocks a foundation logo on a passing tote—wrong people, right block.' },
    { subject: 'Contract fine print', description: 'Language doubles back; Serena underlines one brutal sentence.' },
    { subject: "Vendor's hands", description: 'Coins clink; the vendor winks—everyone here is performing normal.' },
    { subject: 'Serena', description: 'Serena signs without smiling; paper becomes evidence either way.' },
    { subject: 'Café awning', description: 'They step under shade; the noise drops half a notch—enough to plan the next move.' },
  ],
  [
    { subject: 'Marcus on deck', description: "Marcus meets the ferry master's stare—two jobs, zero patience." },
    { subject: 'The ferry master', description: 'He leans close: coast guard questions; someone is feeding them names.' },
    { subject: "Marcus's notebook", description: "Marcus doesn't flinch; his notebook stays closed—listening is leverage." },
    { subject: 'Deck traffic', description: 'Crew hauls lines; tourists stream; the warning hides in plain motion.' },
    { subject: 'Marcus', description: 'Marcus asks who; the answer is a look toward the bridge radio.' },
    { subject: 'Officials on the quay', description: 'Tiny figures point clipboards toward their hull.' },
    { subject: 'Warrant card', description: 'His credential flashes inside his coat—useless here, habit anyway.' },
    { subject: 'Ferry departure', description: 'The ferry exhales; Marcus exhales slower—clock starts anyway.' },
  ],
  [
    { subject: 'Science lab', description: 'Kids scatter; a Bunsen flares wrong; sprinkler heads cough awake.' },
    { subject: 'Nadia shielding a child', description: 'Nadia throws an arm across a smaller student—shield before thought.' },
    { subject: 'Spray across glass', description: 'Water films the door; parents’ phones rise beyond the fence like hungry birds.' },
    { subject: 'Telephoto parents', description: 'A long lens catches Nadia mid-flinch—context dies in the crop.' },
    { subject: 'Milo at the back bench', description: "Milo steps back, hands up in mock innocence—too perfect a retreat." },
    { subject: 'Teacher at gas taps', description: 'The teacher kills the supply; alarm strobe paints everyone’s guilt.' },
    { subject: 'Nadia and the child', description: 'The kid whimpers; Nadia whispers stay with me until the noise stops.' },
    { subject: 'Wet corridor', description: 'They slosh toward the exit; sirens answer a prank that became a headline.' },
  ],
  [
    { subject: 'Ben with burners', description: "Ben fans phones like playing cards—‘for safety,’ he tells the circle." },
    { subject: 'Jade refusing', description: "Jade's palm stays empty; her no lands harder than the fire crackle." },
    { subject: 'Bonfire crowd', description: 'Whispers braid into judgement; the flames become a courtroom.' },
    { subject: 'Ben', description: "Ben's smile thins; public loyalty costs him a private alliance." },
    { subject: 'Jade toward tide', description: 'Jade turns toward the surf; sparks ride the wind after her.' },
    { subject: 'Sand and handsets', description: 'Phones gleam black in the sand—unused offers sharpen the insult.' },
    { subject: 'Tomasz watching', description: 'Tomasz watches both of them; the fracture has his name on it too.' },
    { subject: 'Rising embers', description: 'Embers spiral upward; secrets usually rise slower than this.' },
  ],
  [
    { subject: 'Naomi driving', description: 'Naomi threads coastal traffic; Marcus updates timestamps beside her.' },
    { subject: 'Marcus with manifests', description: 'Two harbour manifests overlap on his knee—same crate ID, impossible hours.' },
    { subject: 'Dashboard GPS', description: 'The map reroutes hard; blue line eats minutes they don’t have.' },
    { subject: 'Naomi', description: 'Naomi says duplication means an inside hand; Marcus nods grim.' },
    { subject: 'Detour sign', description: 'A painted arrow points toward quarry service—ignored or trap, neither asks aloud.' },
    { subject: 'Rearview unease', description: 'Seatbelts strain; neither mentions the blue light winking far back.' },
    { subject: 'Matching stamps', description: 'Marcus circles identical stamps with different ink—someone signed twice.' },
    { subject: 'Coastal overlook', description: 'They crest a hill; both harbours visible— geography exposes the lie.' },
  ],
  [
    { subject: 'Theo at the bunk', description: 'Theo reaches deep; varnish scrapes his knuckle.' },
    { subject: 'Carved crest', description: "A crest gouged under the bunk matches Owen's crate photo—bloodline as logistics." },
    { subject: 'Theo', description: 'Dust motes hang; he stops breathing like sound could erase proof.' },
    { subject: 'Bunk shadow', description: 'Strip shadow crosses his face; the cabin feels suddenly older.' },
    { subject: 'Phone to woodgrain', description: 'He holds the phone to the carving—pixel to grain; the match is undeniable.' },
    { subject: 'Snapping shutters', description: 'Wind slams wood; Theo jumps; the house agrees something is wrong.' },
    { subject: 'Carving detail', description: 'Not a souvenir—tool marks too honest for tourism.' },
    { subject: 'Theo standing back', description: 'He backs out; decides who can know before sunset.' },
  ],
  [
    { subject: "Leah's article", description: 'Her piece animates a dozen phones—shares faster than apologies.' },
    { subject: 'Foundation reps', description: 'Reps wear polite faces; stallholders refuse eye contact.' },
    { subject: "Ari's camera", description: "Ari hunts humiliation—then hesitates on Evelyn's shaking hands." },
    { subject: 'Turned backs', description: 'Shoulders pivot; awnings cut harsh lines; the market enforces its verdict.' },
    { subject: 'Unsold produce', description: 'Crates sit quiet beside sharpened silence.' },
    { subject: 'Leah filming', description: 'Leah records anyway—story first, mercy later, she tells herself.' },
    { subject: 'Evelyn', description: 'Evelyn lifts her chin; dignity costs more than the fines they threaten.' },
    { subject: 'Market alley mouth', description: 'A side lane swallows Ari first—footage secured, stomach not.' },
  ],
  [
    { subject: 'Boarding officials', description: 'Uniforms hit the gangway; paperwork smiles without warmth.' },
    { subject: 'Milo at the scanner', description: "Milo sells a 'broken' passport scanner—routine stretched into theatre." },
    { subject: 'Galley tea tin', description: 'Below, Priya palms an SD card into metal—hands steadier than her pulse.' },
    { subject: 'Clipboard stamps', description: 'Ink lists discrepancies someone planned to be found.' },
    { subject: "Milo's grin", description: 'He sells confusion; the officer almost laughs despite themselves.' },
    { subject: 'Ship stairwell', description: 'Crew squeezes past; time dilates between decks.' },
    { subject: 'Priya topside', description: 'Priya slips up with innocent tea; steam hides the swap story.' },
    { subject: 'Gangway threshold', description: 'Customs steps off satisfied enough; the ferry pretends it was always clean.' },
  ],
  [
    { subject: 'Jade at mirror', description: 'Jade rehearses a confession that may never leave this bathroom.' },
    { subject: 'Fogged glass', description: 'Her words blur the mirror; truth thins if she repeats it too often.' },
    { subject: 'Cracked door', description: 'Blue night light spills—Alex listens from the hall without answering.' },
    { subject: "Jade's grip on porcelain", description: 'She grips the sink until knuckles pale—commitment without an audience.' },
    { subject: 'Alex in hallway', description: "Alex closes his eyes; pretends he didn't hear the worst line." },
    { subject: 'Soap and mug', description: 'Everyday props dwarf the stakes—ordinary objects, enormous tone.' },
    { subject: "Jade's eyes", description: 'She meets herself in the glass; survivor eyes don’t blink first.' },
    { subject: 'Light switch', description: 'She kills the light; mirror becomes wall—promise held in darkness.' },
  ],
  [
    { subject: 'Serena at desk', description: "Serena closes Milo's file—suspension ink drying." },
    { subject: 'Naomi entering', description: 'Naomi enters without knocking; school neutrality just ended.' },
    { subject: "Empty student chair", description: 'The chair sits accusatory between adults.' },
    { subject: 'Serena', description: 'Serena cites procedure; Naomi cites investigation—words stack like barriers.' },
    { subject: "Naomi's phone", description: 'She taps case numbers tied to the corridor video thread.' },
    { subject: 'Playground window', description: 'Kids sprint outside; inside, futures are traded quietly.' },
    { subject: 'Counselor nameplate', description: 'Metal letters mean less today than yesterday.' },
    { subject: 'Door closing', description: 'Naomi leaves first; Serena watches it like it might reopen.' },
  ],
  [
    { subject: 'Tomasz and Ben', description: 'Flashlight beams cross; they argue over who moves the cache.' },
    { subject: 'Duffel in wet sand', description: 'Nylon drags; the tide line inches closer.' },
    { subject: "Ben's jaw", description: 'Ben insists risk is shared; Tomasz says burden isn’t negotiable.' },
    { subject: "Tomasz's strap", description: 'Tomasz lifts the strap; Ben’s knuckles whiten on the fabric.' },
    { subject: 'Third flashlight', description: 'A third beam wobbles in—watcher or wanderer, neither names it.' },
    { subject: 'Breakers behind', description: 'Surf crashes; the fight peaks while the ocean refuses to pause.' },
    { subject: 'Compromise gesture', description: 'They settle ugly—half the haul now, half after the next sweep.' },
    { subject: 'Retreating feet', description: 'They climb the slope; water claims the argument’s edge.' },
  ],
  [
    { subject: 'Owen and the player', description: 'Owen hits play; muffled voice fills the car like smoke.' },
    { subject: 'Nadia listening', description: 'Nadia listens for tells—then stops breathing.' },
    { subject: 'Audio loop', description: 'She spots a splice Owen missed—bait audio, not testimony.' },
    { subject: 'Owen', description: 'Hope drains; someone engineered cops, not conscience.' },
    { subject: 'Rain on glass', description: 'Drizzle smears outside; revelation turns to theatre prop inside.' },
    { subject: "Nadia's pause", description: 'If they file this, they become the punchline—she won’t pretend otherwise.' },
    { subject: 'Empty back seat', description: 'Shadow suggests whoever layered the lie still rides along.' },
    { subject: 'Dashboard clock', description: 'Minutes pass; harbour curfew doesn’t wait for truth.' },
  ],
  [
    { subject: 'Jade boarding', description: 'Jade climbs early; the manifest rides in her pocket.' },
    { subject: 'Alex on the ramp', description: 'Alex sprints the gangway as fog thins—two timelines meet on one deck.' },
    { subject: 'Metal gangway', description: 'Grid clangs underfoot; mist beads the railings.' },
    { subject: 'Wake and churn', description: 'White water answers engines; plans merge in foam.' },
    { subject: 'Jade', description: 'She won’t look at him yet; boarding order is its own apology.' },
    { subject: 'Alex', description: 'He says her name once; wind steals half of it.' },
    { subject: 'Distant horn', description: 'Another vessel answers; routine noise swallows the moment.' },
    { subject: 'Passenger mass', description: 'Travellers push behind them; the finale pretends to be a commute.' },
  ],
  [
    { subject: "Alex's duffel", description: 'Alex zips a bag loud enough to wake guilt.' },
    { subject: 'Chart on table', description: 'The chart lies open—deliberate gift or dare, neither names it.' },
    { subject: 'Ferry schedule', description: 'Theo circles a sailing in red; ink bleeds through to the next day.' },
    { subject: 'Cabin silence', description: 'Salt and nylon hang in the air; leaving smells like verdict.' },
    { subject: 'Alex and Theo', description: 'Eyes meet; decade-old shorthand says what words can’t.' },
    { subject: 'Coat on hook', description: 'Fabric sways—someone will return for it or not.' },
    { subject: 'Alex in doorway', description: 'She pauses on the sill; the room already feels like memory.' },
    { subject: 'Table debris', description: 'Mug, keys, chart—domestic wreckage after a quiet war.' },
  ],
  [
    { subject: "Leah's live feed", description: 'The counter climbs; apology and accusation share one breath.' },
    { subject: 'Divided crowd', description: 'Half lean mercy; half demand arrests—bodies show the seam.' },
    { subject: 'Hand-painted sign', description: 'Placard words land blunt; dialect carries the heat.' },
    { subject: 'Leah on camera', description: 'Her voice cracks live; she doesn’t edit it out.' },
    { subject: 'Police periphery', description: 'Caps hover at the edge—presence without commitment.' },
    { subject: 'Market canopy', description: 'Cloth shadows stripe faces; everyone looks guilty in stripes.' },
    { subject: 'Child on shoulders', description: 'A kid watches adults fracture in real time.' },
    { subject: 'Phone lowered', description: 'She ends the stream; the fight keeps going without the lens.' },
  ],
  [
    { subject: 'Milo alone', description: 'Sneakers squeak; after-hours wax and fluorescent hush.' },
    { subject: 'Marcus on bench', description: "Marcus waits like furniture that's learned patience." },
    { subject: 'Exit signs', description: 'Green wash counts down corridors without saying to where.' },
    { subject: 'Milo halting', description: 'Juvenile caution and an investigation clock fight in his shoulders.' },
    { subject: 'Marcus rising', description: 'He doesn’t flash papers yet—silence is the first question.' },
    { subject: 'Locker tunnel', description: 'Metal doors march to a vanishing point—school as tunnel.' },
    { subject: "Milo's pockets", description: 'Hands buried deep hide tremor; Marcus reads both possibilities.' },
    { subject: 'Dusk window', description: 'Glass bruises purple; whoever speaks first loses something.' },
  ],
  [
    { subject: 'Evelyn scrubbing', description: 'She scrubs ink from her cuticles—contracts signed under pressure peeling away.' },
    { subject: 'Running water', description: 'Noise swells until it sounds like surf in another life.' },
    { subject: 'Hotel pen', description: 'Cheap plastic rolls toward the drain in lazy circles.' },
    { subject: "Evelyn's reflection", description: 'Tired eyes in glass; she scrubs harder as if skin holds clauses.' },
    { subject: 'Soap foam', description: 'Grey lather tunnels between fingers—evidence dissolved to nothing.' },
    { subject: 'Towel bar', description: 'She grips chrome—anchor in a room paid for by someone else’s name.' },
    { subject: 'Draining sink', description: 'The swirl pulls pigment; reversal feels possible until it isn’t.' },
    { subject: 'Dark bathroom', description: 'She kills the lamp; ocean memory rides the quiet anyway.' },
  ],
  [
    { subject: 'Jade in the shallows', description: 'She wades shin-deep; the last burner waits in her fist.' },
    { subject: "Ari's phone", description: 'Ari lifts the phone—then lowers it deliberately.' },
    { subject: 'Phone underwater', description: 'The handset slips under; the screen ghosts green, then black.' },
    { subject: "Ari's face", description: 'He swallows; chooses presence over proof.' },
    { subject: 'Jade watching Ari', description: 'She sees the choice; something loosens in her chest.' },
    { subject: 'Bioluminescent flicker', description: 'Thin light answers their steps—small mercy with no audience.' },
    { subject: 'Folding waves', description: 'Water erases footprints; argument tides withdraw.' },
    { subject: 'Two silhouettes', description: 'They stand side by side, wet hems, quieter than the sea.' },
  ],
  [
    { subject: 'Naomi driving', description: 'Naomi pushes toward docks; Priya balances a laptop on her knee.' },
    { subject: 'Priya decoding', description: 'Radio chatter resolves to names; Priya murmurs translations like prayer.' },
    { subject: 'Distant sirens', description: 'Sirens needle inland; gulls argue closer at the water.' },
    { subject: 'Harbour cranes', description: 'Steel frames stack containers like unfinished sentences.' },
    { subject: 'Naomi', description: 'She says they’re early or dead; Priya says both can be true.' },
    { subject: 'Lorry reversing', description: 'Dockworkers scatter from a reversing truck—clock in every flinch.' },
    { subject: 'Skidding stop', description: 'Rubber bites salt; spray dots glass last second.' },
    { subject: 'Manifest folder', description: 'Naomi grabs paper; evidence becomes sprint fuel.' },
  ],
  [
    { subject: 'Sealed letter', description: 'Foundation stationery waits on the table like quiet ordnance.' },
    { subject: 'Owen in doorway', description: 'He pauses; the envelope already knows his habits.' },
    { subject: "Owen's pocket", description: 'He reads one line, pockets the rest—gravity not measured in grams.' },
    { subject: "Serena's script", description: 'Ink precision betrays emotion she wouldn’t voice aloud.' },
    { subject: 'Window square', description: 'Light grids the wood; dust hangs in a sentence left unfinished.' },
    { subject: "Owen's coat", description: 'Paper ridges against lining; accountability travels by mail.' },
    { subject: "Serena's empty chair", description: 'Absence sits opposite; the board will get words, not faces.' },
    { subject: 'Coffee rings', description: 'Yesterday’s stain overlaps today—time stacking quiet indictments.' },
  ],
  [
    { subject: 'Nadia and vendor', description: 'Nadia tears bread; yesterday’s spit still stings both cheeks.' },
    { subject: 'Vendor’s hands', description: 'Callouses accept the loaf—truce measured in crumbs.' },
    { subject: 'Market din', description: 'Noise softens a notch; season turns whether they forgive or not.' },
    { subject: 'Nadia', description: 'She apologizes without script; he answers by not turning away.' },
    { subject: 'Olive oil tins', description: 'Oil gleams; ordinary kindness oils an uneasy peace.' },
    { subject: 'Running child', description: 'A kid darts between stalls—future watching adults patch things.' },
    { subject: "Nadia's eyes", description: 'She blinks hard; repair costs pride she’ll pay anyway.' },
    { subject: 'Stall awning', description: 'Canvas shadow covers them; small repair before the season breaks.' },
  ],
  [
    { subject: 'Ensemble at rail', description: 'The group leans on salt-rusted metal as the headland falls away—gaps obvious.' },
    { subject: 'Jade', description: 'She smiles, uncertain on purpose; the rail forgives her grip.' },
    { subject: 'New passengers', description: 'Strangers replace missing faces—life keeps its headcount vague.' },
    { subject: 'Alex', description: 'He finds her without trying; distance learned, not chosen.' },
    { subject: 'Wake spray', description: 'Mist dots glass and lenses; crew laughs, wipes, pretends normal.' },
    { subject: 'Bridge silhouette', description: 'Wheelhouse glass reflects sky; authority reduced to shape and glare.' },
    { subject: 'Child with paper flag', description: 'A kid waves a cheap ferry flag—innocence sold at the snack bar.' },
    { subject: 'Open horizon', description: 'Headland clears; Jade breathes like she is practicing being free.' },
  ],
]

const SHOT_SIZES: ShotSize[] = [...SHOT_SIZE_VALUES]
const MOVEMENTS: CameraMovement[] = [...CAMERA_MOVEMENT_VALUES]

type ShotRow = {
  id: string
  scene_id: string
  shot_number: string
  shot_description: string | null
  subject: string | null
  shot_size: ShotSize | null
  support: string | null
  lens: string | null
  duration_seconds: number | null
  estimated_shoot_minutes: number | null
  camera_movement: CameraMovement | null
  notes: string | null
}

/**
 * Eight varied shots per scene: coverage ladder + inserts, production notes for AD/camera.
 */
export function buildNorthShoreShotRows(args: {
  idSource: DemoSeedIdSource
  ts: string
}): ShotRow[] {
  const { idSource, ts: _ts } = args
  if (NORTH_SHORE_SHOT_BEATS.length !== NORTH_SHORE_SCENES.length) {
    throw new Error('NORTH_SHORE_SHOT_BEATS length must match NORTH_SHORE_SCENES')
  }
  for (let i = 0; i < NORTH_SHORE_SHOT_BEATS.length; i++) {
    if (NORTH_SHORE_SHOT_BEATS[i]!.length !== NORTH_SHORE_SHOTS_PER_SCENE) {
      throw new Error(`NORTH_SHORE_SHOT_BEATS[${i}] must have ${NORTH_SHORE_SHOTS_PER_SCENE} shot beats`)
    }
  }

  const rows: ShotRow[] = []
  const supports = ['Tripod', 'Handheld', 'Gimbal', 'Dolly', 'Slider', 'Steadicam', 'Shoulder', 'Crane'] as const
  const lenses = ['18mm', '24mm', '35mm', '40mm', '50mm', '75mm', '85mm', '100mm Macro', '24-70mm', '70-200mm'] as const

  for (let sceneIdx = 0; sceneIdx < NORTH_SHORE_SCENES.length; sceneIdx++) {
    const sceneNum = sceneIdx + 1
    const sceneId = idSource.scene(sceneNum)
    const beats = NORTH_SHORE_SHOT_BEATS[sceneIdx]!

    for (let si = 0; si < NORTH_SHORE_SHOTS_PER_SCENE; si++) {
      const g = northShoreGlobalShotIndex(sceneNum, si + 1)
      const shotId = idSource.shot(g)
      const shotNumber = String(si + 1)

      const shot_size = SHOT_SIZES[(sceneIdx + si) % SHOT_SIZES.length]!
      const camera_movement = MOVEMENTS[(sceneIdx * 3 + si) % MOVEMENTS.length]!
      const support = supports[(g + si) % supports.length]!
      const lens = lenses[(g + sceneIdx) % lenses.length]!
      const duration_seconds = 4 + ((g + si * 5) % 22)
      const estimated_shoot_minutes = 3 + ((g + si * 2) % 12)

      const { subject, description: actionLine } = beats[si]!
      const shot_description = actionLine

      const notesPool = [
        'Mirror driver orientation on car INTs.',
        'ND rotation for deck sparkle; polarizer optional.',
        'Quiet sticks between takes near school classrooms.',
        'Wet-down only after hotel walkie from engineering.',
        'Harbour BG: coordinate horn timings with bridge.',
        'Beach NIGHT: sodium balance; keep skin in lantern key.',
        'Market: lock stroller lanes; steadicam vest swap at :20.',
        'Cabin: watch flag shadows across faces on wides.',
      ]
      const notes = notesPool[(sceneIdx + si) % notesPool.length]!

      rows.push({
        id: shotId,
        scene_id: sceneId,
        shot_number: shotNumber,
        shot_description,
        subject,
        shot_size,
        support,
        lens,
        duration_seconds,
        estimated_shoot_minutes,
        camera_movement,
        notes,
      })
    }
  }

  return rows
}
