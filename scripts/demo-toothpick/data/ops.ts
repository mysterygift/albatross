/**
 * Toothpick operations data: tasks, equipment (+ pack lists), music and clearances, deliverables,
 * key contacts and custom hazard templates.
 */
import type { EquipmentCategory } from '@/lib/db/types'
import type { VendorKey } from './vendors'

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskSectionKey = 'pre' | 'sup' | 'shoot' | 'post'
export const TASK_SECTIONS: Array<{ key: TaskSectionKey; name: string }> = [
  { key: 'pre', name: 'Pre-production' },
  { key: 'sup', name: 'Script supervision & continuity' },
  { key: 'shoot', name: 'Principal photography' },
  { key: 'post', name: 'Post-production & delivery' },
]

export type TaskDef = {
  key: string; section: TaskSectionKey; description: string; done: boolean
  due: string | null; dept: string; priority: number; notes?: string; parent?: string
}

export const TASKS: TaskDef[] = [
  { key: 'budget', section: 'pre', description: 'Lock budget and approve working revision', done: true, due: '2026-09-18', dept: 'Producers', priority: 1, notes: 'Working budget approved by the EP.' },
  { key: 'budgetAtl', section: 'pre', description: 'Confirm above-the-line assumptions', done: true, due: '2026-09-16', dept: 'Producers', priority: 2, parent: 'budget' },
  { key: 'budgetBtl', section: 'pre', description: 'Confirm below-the-line assumptions', done: true, due: '2026-09-16', dept: 'Producers', priority: 2, parent: 'budget' },
  { key: 'locations', section: 'pre', description: 'Secure all key locations', done: false, due: '2026-10-16', dept: 'Locations', priority: 1, notes: 'Pub and park confirmed; café, bar, club and Albert Hall still on hold.' },
  { key: 'locPark', section: 'pre', description: 'Park filming permit via Screen Manchester (days 1 and 6)', done: true, due: '2026-09-25', dept: 'Locations', priority: 1, parent: 'locations', notes: 'PLI evidence (min. £5m) and the risk assessment submitted.' },
  { key: 'locPub', section: 'pre', description: 'Sign location agreement: The Goose and Gander (day 3)', done: true, due: '2026-09-23', dept: 'Locations', priority: 1, parent: 'locations' },
  { key: 'locCafe', section: 'pre', description: 'Café: agree before-opening hire and bathroom access', done: false, due: '2026-10-09', dept: 'Locations', priority: 1, parent: 'locations' },
  { key: 'locClub', section: 'pre', description: 'Club exterior: written notice to neighbours and bar staff', done: false, due: '2026-10-23', dept: 'Locations', priority: 2, parent: 'locations' },
  { key: 'locFlats', section: 'pre', description: 'Householder agreements for the four private flats', done: false, due: '2026-10-16', dept: 'Locations', priority: 1, parent: 'locations' },
  { key: 'locMontage', section: 'pre', description: 'Book montage venues (degree show, Albert Hall dock)', done: false, due: '2026-10-23', dept: 'Locations', priority: 2, parent: 'locations' },
  { key: 'cast', section: 'pre', description: 'Confirm remaining cast (cottage-core girl, three montage women)', done: false, due: '2026-10-23', dept: 'Cast', priority: 1, notes: 'Offer out to Chiara Bellandi; waiting on Zainab Bello’s other booking.' },
  { key: 'forms', section: 'pre', description: 'Chase contributor forms: Rose and Customer', done: false, due: '2026-10-14', dept: 'Production', priority: 2 },
  { key: 'insurance', section: 'pre', description: 'Send insurance certificate to venues and Screen Manchester', done: true, due: '2026-09-24', dept: 'Production', priority: 1 },
  { key: 'rams', section: 'pre', description: 'Write and approve a risk assessment for each shoot day', done: false, due: '2026-10-28', dept: 'Production', priority: 1, notes: 'Days 1–3 approved; 4–7 drafted.' },
  { key: 'cameraTest', section: 'pre', description: 'Camera and lens test day (LUTs, handheld, flares)', done: false, due: '2026-10-27', dept: 'Camera', priority: 2 },
  { key: 'recce', section: 'pre', description: 'Tech recce of all locations', done: false, due: '2026-10-29', dept: 'Direction', priority: 1, notes: 'Director, DoP, 1st AD, gaffer, key grip, script supervisor, sound.' },
  { key: 'fittings', section: 'pre', description: 'Wardrobe fittings for principals', done: false, due: '2026-10-28', dept: 'Wardrobe', priority: 2 },
  { key: 'musicQuote', section: 'pre', description: 'Music clearance: quote for "Free Bird" (composition only, a cappella chorus)', done: false, due: '2026-10-23', dept: 'Legal', priority: 1, notes: 'Quote requested 28 Sep via Tib Street Music Clearance.' },
  { key: 'pos', section: 'pre', description: 'Approve open purchase orders (bus, medic, edit suite)', done: false, due: '2026-10-09', dept: 'Accounts', priority: 2 },
  { key: 'catering', section: 'pre', description: 'Catering numbers and dietary requirements to Mancunian Unit Catering', done: false, due: '2026-10-30', dept: 'Production', priority: 3 },
  { key: 'callsheet1', section: 'pre', description: 'Issue day 1 call sheet by 18:00 on Sunday 1 Nov', done: false, due: '2026-11-01', dept: 'Production', priority: 1 },
  // Script supervision & continuity
  { key: 'printScript', section: 'sup', description: 'Print and distribute the colour-revision script sets', done: true, due: '2026-10-02', dept: 'Production', priority: 2, notes: 'Printed by Spinningfields Print & Copy (SPC-2210).' },
  { key: 'scriptImport', section: 'sup', description: 'Import the script into Albatross and review the parse (sluglines, day/night, locations)', done: true, due: '2026-09-30', dept: 'Direction', priority: 1, notes: 'Done in this demo: 18 scenes, script version "V1", sections and shot coverage links. En-dash sluglines and EVENING/MORNING headings needed manual correction.' },
  { key: 'continuityBible', section: 'sup', description: 'Build the continuity breakdown: wardrobe, props and hair by scene', done: false, due: '2026-10-28', dept: 'Other', priority: 1, notes: 'Hugh’s hangover progression (3 → 6); Maisie’s hair change between 14 and 15 (a year later).' },
  { key: 'slating', section: 'sup', description: 'Confirm slating: UK consecutive numbering, prefix X for Second Unit (days 2 and 7)', done: false, due: '2026-10-30', dept: 'Camera', priority: 1, notes: 'Settings → Script supervisor → Slating. Locks once the first slate exists.' },
  { key: 'photoProtocol', section: 'sup', description: 'Agree the continuity-photo protocol with Costume, Props and Make-up (tags: wardrobe, props, make-up, hair, set)', done: false, due: '2026-10-30', dept: 'Art Department', priority: 2 },
  { key: 'logFormat', section: 'sup', description: 'Agree the editor’s log (CSV) and continuity sheets with the Editor', done: false, due: '2026-10-30', dept: 'Post Production', priority: 2 },
  { key: 'tabletTest', section: 'sup', description: 'Test the tablet layout and Apple Pencil lining at video village before day 1', done: false, due: '2026-11-02', dept: 'Camera', priority: 2 },
  { key: 'dprRoutine', section: 'sup', description: 'Daily progress report to Producer and Line Producer by 20:00 each shoot day', done: false, due: '2026-11-10', dept: 'Production', priority: 1 },
  // Principal photography
  { key: 'day1', section: 'shoot', description: 'Day 1: Maisie’s flat (3, 4, 5) → Platt Fields (16)', done: false, due: '2026-11-02', dept: 'Direction', priority: 1 },
  { key: 'day2', section: 'shoot', description: 'Day 2: Hugh’s flat (9, 15) + Second Unit inserts', done: false, due: '2026-11-03', dept: 'Direction', priority: 1 },
  { key: 'day3', section: 'shoot', description: 'Day 3: The Goose and Gander (14, 10, 18)', done: false, due: '2026-11-04', dept: 'Direction', priority: 1 },
  { key: 'day4', section: 'shoot', description: 'Day 4: Café (6, 7) → Minty’s flat (12): resolve the cast clash first', done: false, due: '2026-11-05', dept: 'Direction', priority: 1, notes: 'Noor Haddad unavailable 5 Nov.' },
  { key: 'day5', section: 'shoot', description: 'Day 5: Bar (2) → Club exterior at night (11)', done: false, due: '2026-11-06', dept: 'Direction', priority: 1 },
  { key: 'day6', section: 'shoot', description: 'Day 6: Don’s flat (1, 7) → Platt Fields (17) → bus (1)', done: false, due: '2026-11-09', dept: 'Direction', priority: 1 },
  { key: 'day7', section: 'shoot', description: 'Day 7: Montage and pickups + Second Unit degree show', done: false, due: '2026-11-10', dept: 'Direction', priority: 1 },
  { key: 'returnKit', section: 'shoot', description: 'Return all hire kit by 12 Nov and sign off damage reports', done: false, due: '2026-11-12', dept: 'Production', priority: 2 },
  { key: 'refundDeposits', section: 'shoot', description: 'Refund householder damage deposits after inspection', done: false, due: '2026-11-20', dept: 'Locations', priority: 3 },
  // Post
  { key: 'assembly', section: 'post', description: 'Assembly cut', done: false, due: '2026-11-27', dept: 'Post Production', priority: 2 },
  { key: 'lock', section: 'post', description: 'Picture lock', done: false, due: '2026-12-11', dept: 'Post Production', priority: 1 },
  { key: 'grade', section: 'post', description: 'Colour grade (7–11 Dec)', done: false, due: '2026-12-11', dept: 'Post Production', priority: 2 },
  { key: 'soundPost', section: 'post', description: 'Dialogue edit, ADR and mix', done: false, due: '2027-01-15', dept: 'Post Production', priority: 2 },
  { key: 'cueSheet', section: 'post', description: 'Final music cue sheet and licences filed', done: false, due: '2027-01-29', dept: 'Legal', priority: 2 },
  { key: 'masters', section: 'post', description: 'Deliver festival master, DCP and subtitles', done: false, due: '2027-02-26', dept: 'Post Production', priority: 1 },
]

// ─── Equipment ───────────────────────────────────────────────────────────────

export type EquipmentDef = {
  key: string; name: string; category: EquipmentCategory; department: string
  source: 'rented' | 'purchased' | 'owned'; qty?: number; vendor?: VendorKey; invoice?: string
  value: number; serial?: string; notes?: string
}

export const EQUIPMENT: EquipmentDef[] = [
  // Camera (Ardwick Camera Hire, ACH-0412)
  { key: 'camA', name: 'Cinema camera body, Super 35 (A-cam)', category: 'camera', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 38000, serial: 'DEMO-CAM-A01', notes: 'Main Unit.' },
  { key: 'camB', name: 'Cinema camera body, Super 35 (B-cam / Second Unit)', category: 'camera', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 22000, serial: 'DEMO-CAM-B01', notes: 'Second Unit days 2 and 7, and B-cam on the pub day.' },
  { key: 'cage', name: 'Camera cage and top handle', category: 'camera_accessories', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 900 },
  { key: 'matte', name: 'Matte box and filter trays', category: 'camera_accessories', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 2400 },
  { key: 'nd', name: 'ND filter set 4×5.65', category: 'camera_accessories', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 3200 },
  { key: 'ff', name: 'Follow focus unit', category: 'camera_accessories', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 4200 },
  { key: 'txrx', name: 'Wireless video transmitter and receiver', category: 'wireless_systems', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 3200 },
  { key: 'monDir', name: 'Director’s monitor 17"', category: 'dit_video_village', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 1800 },
  { key: 'monCam', name: 'On-camera monitor 7"', category: 'dit_video_village', department: 'Camera', source: 'rented', qty: 2, vendor: 'camera', invoice: 'acha', value: 1600 },
  { key: 'vlock', name: 'V-lock battery', category: 'camera_accessories', department: 'Camera', source: 'rented', qty: 8, vendor: 'camera', invoice: 'acha', value: 300 },
  { key: 'charger', name: 'Four-bay battery charger', category: 'camera_accessories', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 450 },
  { key: 'primes', name: 'Prime lens set 18, 25, 35, 50, 85mm', category: 'lenses', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 60000 },
  { key: 'zoom', name: 'Zoom lens 24–70mm', category: 'lenses', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 9000 },
  { key: 'tele', name: 'Zoom lens 70–200mm', category: 'lenses', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 8500 },
  { key: 'macro', name: 'Macro lens 100mm', category: 'lenses', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 3200, notes: 'All the ECU inserts (ibuprofen, clock, cards).' },
  { key: 'vintage', name: 'Vintage-style prime set (EUR hire)', category: 'lenses', department: 'Camera', source: 'rented', vendor: 'lenses', invoice: 'rlra', value: 18000, notes: 'Rotterdam Lens Rentals. Used for the night exteriors.' },
  { key: 'tripod', name: 'Fluid-head tripod (150mm bowl)', category: 'camera_support', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 4200 },
  { key: 'shoulder', name: 'Handheld shoulder rig', category: 'camera_support', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 1800 },
  { key: 'gimbal', name: 'Three-axis gimbal', category: 'camera_support', department: 'Camera', source: 'rented', vendor: 'camera', invoice: 'acha', value: 3900, notes: 'Park walk (scene 16).' },
  { key: 'cards', name: 'CFexpress media card 512GB', category: 'consumables', department: 'Camera', source: 'purchased', qty: 6, value: 1500 },
  { key: 'reader', name: 'Card reader', category: 'camera_accessories', department: 'Camera', source: 'owned', value: 180 },
  // Lighting and grip (Salford Quays Lighting & Grip, SQL-2231)
  { key: 'panel', name: 'LED panel 60cm bi-colour', category: 'lighting', department: 'Lighting', source: 'rented', qty: 4, vendor: 'lighting', invoice: 'sqla', value: 1800 },
  { key: 'tube', name: 'LED tube 4ft RGBWW', category: 'lighting', department: 'Lighting', source: 'rented', qty: 8, vendor: 'lighting', invoice: 'sqla', value: 600 },
  { key: 'tungsten', name: '1.2k tungsten Fresnel', category: 'lighting', department: 'Lighting', source: 'rented', qty: 2, vendor: 'lighting', invoice: 'sqla', value: 1200 },
  { key: 'lantern', name: 'Lantern softbox 90cm', category: 'lighting_accessories', department: 'Lighting', source: 'rented', qty: 2, vendor: 'lighting', invoice: 'sqla', value: 420 },
  { key: 'distro', name: '63A power distribution and cable set', category: 'power_distribution', department: 'Lighting', source: 'rented', vendor: 'lighting', invoice: 'sqla', value: 2100, notes: 'Pub and club exterior: tie in at the venue, no generator.' },
  { key: 'cstand', name: 'C-stand with arm', category: 'grip', department: 'Grip', source: 'rented', qty: 8, vendor: 'lighting', invoice: 'sqla', value: 180 },
  { key: 'flags', name: 'Flags, nets and silks kit', category: 'grip', department: 'Grip', source: 'rented', vendor: 'lighting', invoice: 'sqla', value: 2200 },
  { key: 'dolly', name: 'Dolly and 20ft track', category: 'grip', department: 'Grip', source: 'rented', vendor: 'lighting', invoice: 'sqla', value: 6500 },
  { key: 'bench', name: 'Bench-mounted rig for the park walk-and-talk', category: 'grip', department: 'Grip', source: 'rented', vendor: 'lighting', invoice: 'sqla', value: 1900 },
  { key: 'sandbag', name: 'Sandbag 15lb', category: 'grip', department: 'Grip', source: 'purchased', qty: 20, value: 400 },
  // Sound (Pennine Sound Hire, PSH-0087)
  { key: 'recorder', name: 'Eight-channel sound recorder/mixer', category: 'sound', department: 'Sound', source: 'rented', vendor: 'sound', invoice: 'psh', value: 4800 },
  { key: 'radio', name: 'Radio mic kit (lav, TX/RX)', category: 'sound', department: 'Sound', source: 'rented', qty: 4, vendor: 'sound', invoice: 'psh', value: 1100 },
  { key: 'boom', name: 'Boom pole and shotgun microphone', category: 'sound', department: 'Sound', source: 'rented', qty: 2, vendor: 'sound', invoice: 'psh', value: 1900 },
  { key: 'playback', name: 'Playback speaker and sub (club techno)', category: 'sound', department: 'Sound', source: 'rented', vendor: 'sound', invoice: 'psh', value: 2600, notes: 'Scene 11: playback through the venue door.' },
  { key: 'ifb', name: 'IFB / comms set', category: 'wireless_systems', department: 'Sound', source: 'rented', qty: 4, vendor: 'sound', invoice: 'psh', value: 700 },
  // DIT, production
  { key: 'dit', name: 'DIT cart and laptop', category: 'dit_video_village', department: 'Camera', source: 'owned', value: 5200 },
  { key: 'raid', name: 'RAID drive 4TB', category: 'storage_cases', department: 'Camera', source: 'purchased', qty: 3, vendor: 'data', invoice: 'idb', value: 780 },
  { key: 'slate', name: 'Digital slate / clapperboard (UK-style)', category: 'production_logistics', department: 'Camera', source: 'owned', qty: 2, value: 650, notes: 'One per unit. X-prefixed slates for the Second Unit.' },
  { key: 'tablet', name: 'Script supervisor tablet kit (tablet, stylus, charger)', category: 'production_logistics', department: 'Production', source: 'owned', value: 1400 },
  { key: 'stills', name: 'Continuity photo camera', category: 'production_logistics', department: 'Production', source: 'owned', value: 600, notes: 'Costume, props, make-up and set photos (tags in the Supervisor).' },
  { key: 'walkie', name: 'Walkie-talkie', category: 'production_logistics', department: 'Production', source: 'owned', qty: 12, value: 90 },
  { key: 'firstaid', name: 'First-aid kit', category: 'production_logistics', department: 'Production', source: 'purchased', qty: 3, vendor: 'safety', invoice: 'sfn1', value: 60 },
  { key: 'hivis', name: 'Hi-vis vest', category: 'production_logistics', department: 'Locations', source: 'purchased', qty: 20, vendor: 'safety', invoice: 'sfn1', value: 8 },
  { key: 'gazebo', name: 'Pop-up gazebo (cast holding, park)', category: 'production_logistics', department: 'Locations', source: 'owned', qty: 3, value: 120 },
  { key: 'rails', name: 'Costume rails and steamer', category: 'production_logistics', department: 'Art Department', source: 'rented', vendor: 'costume', invoice: 'hcwa', value: 450 },
]

export type EquipmentListDef = {
  key: string; name: string; department: string; day: number | null; notes: string
  items: Array<{ equip: string; qty?: number; out?: boolean }>
}

export const EQUIPMENT_LISTS: EquipmentListDef[] = [
  { key: 'camD1', name: 'Camera pack – Day 1 (Fallowfield / Platt Fields)', department: 'Camera', day: 1, notes: 'Handheld interiors and a gimbal walk in the park.', items: [{ equip: 'camA' }, { equip: 'cage' }, { equip: 'matte' }, { equip: 'nd' }, { equip: 'ff' }, { equip: 'monCam', qty: 2 }, { equip: 'vlock', qty: 4 }, { equip: 'charger' }, { equip: 'primes' }, { equip: 'macro' }, { equip: 'zoom' }, { equip: 'tele' }, { equip: 'tripod' }, { equip: 'shoulder' }, { equip: 'gimbal' }, { equip: 'cards', qty: 4 }, { equip: 'reader' }, { equip: 'slate' }] },
  { key: 'soundD1', name: 'Sound pack – Day 1', department: 'Sound', day: 1, notes: 'Radio mics for the park walk.', items: [{ equip: 'recorder' }, { equip: 'radio', qty: 4 }, { equip: 'boom', qty: 2 }, { equip: 'ifb', qty: 4 }] },
  { key: 'gripD1', name: 'Grip pack – Day 1 (park)', department: 'Grip', day: 1, notes: 'Bench rig and dolly for the walk-and-talk.', items: [{ equip: 'dolly' }, { equip: 'bench' }, { equip: 'cstand', qty: 4 }, { equip: 'flags' }, { equip: 'sandbag', qty: 10 }] },
  { key: 'pubD3', name: 'Lighting pack – Day 3 (The Goose and Gander)', department: 'Lighting', day: 3, notes: 'Tie in at the pub; no generator.', items: [{ equip: 'panel', qty: 4 }, { equip: 'tube', qty: 8 }, { equip: 'tungsten', qty: 2 }, { equip: 'lantern', qty: 2 }, { equip: 'distro' }, { equip: 'cstand', qty: 8 }, { equip: 'sandbag', qty: 10 }] },
  { key: 'busD6', name: 'Bus day pack – Day 6', department: 'Grip', day: 6, notes: 'Static bus at Trafford Park: gels and rocking rig.', items: [{ equip: 'camB' }, { equip: 'tube', qty: 4 }, { equip: 'cstand', qty: 4 }, { equip: 'flags' }, { equip: 'shoulder' }] },
  { key: 'clubD5', name: 'Night exterior pack – Day 5 (club)', department: 'Lighting', day: 5, notes: 'Vintage primes for the night look; playback speaker and sub at the door.', items: [{ equip: 'camA' }, { equip: 'vintage' }, { equip: 'panel', qty: 4 }, { equip: 'tube', qty: 4 }, { equip: 'distro' }, { equip: 'playback' }, { equip: 'recorder' }] },
  { key: 'secondD7', name: 'Second Unit pack – Day 7', department: 'Camera', day: 7, notes: 'B-cam, light kit, one van.', items: [{ equip: 'camB' }, { equip: 'zoom' }, { equip: 'tripod' }, { equip: 'panel', qty: 2 }, { equip: 'slate' }, { equip: 'cards', qty: 2 }] },
  { key: 'supKit', name: 'Script supervisor kit', department: 'Production', day: null, notes: 'Carried every day. Slates, tablet, photo camera, continuity folders.', items: [{ equip: 'slate', qty: 2 }, { equip: 'tablet' }, { equip: 'stills' }, { equip: 'walkie' }] },
]

// ─── Music and clearances ───────────────────────────────────────────────────

export type MusicDef = { key: string; title: string; artist: string; label: string; notes: string; clearance: 'pending' | 'granted' | 'requested'; requested?: string; granted?: string }
export const MUSIC: MusicDef[] = [
  { key: 'freebird', title: 'Free Bird', artist: 'Lynyrd Skynyrd', label: 'Rights holder to be confirmed (quote requested)', notes: 'Scene 7: Don sings the chorus a cappella down the phone. Composition only; no master use. Keep to the chorus.', clearance: 'requested', requested: '2026-09-28' },
  { key: 'techno', title: 'Basement Pressure', artist: 'Kasimir Wolde', label: 'Demo Sound Library', notes: 'Scene 11: hard techno booming from the basement venue. Library track, 120 seconds of playback.', clearance: 'granted', requested: '2026-09-20', granted: '2026-09-22' },
  { key: 'lofi', title: 'Slow Cooker Sessions', artist: 'Marisol & The Tapes', label: 'Demo Sound Library', notes: 'Scene 9: lo-fi hip-hop from the speaker in the corner of Hugh’s flat.', clearance: 'granted', requested: '2026-09-20', granted: '2026-09-22' },
  { key: 'chimes', title: 'Windchimes and Incense (ambience)', artist: 'Field Recordings Collective', label: 'Demo Sound Library', notes: 'Scene 12: windchimes and street ambience for Minty’s flat.', clearance: 'granted', requested: '2026-09-20', granted: '2026-09-21' },
  { key: 'score', title: 'Toothpick – Main Title', artist: 'Selin Aksoy', label: 'Commissioned (work for hire)', notes: 'Original score; composer deal memo with Legal.', clearance: 'pending', requested: '2026-10-01' },
  { key: 'credits', title: 'Look After Yourself (end credits)', artist: 'Selin Aksoy', label: 'Commissioned (work for hire)', notes: 'Original song over the end credits, building on Maisie’s line in scene 17.', clearance: 'pending', requested: '2026-10-01' },
]

// ─── Deliverables ────────────────────────────────────────────────────────────

export type DeliverableDef = {
  key: string; name: string; due: string; status: string; approval: string | null; recipient: string
  method: string | null
  spec: { resolution?: string; codec?: string; audio?: string; captions?: string; aspect?: string; platform?: string; bitrate?: string; subtitles?: string; graphics?: string; language?: string; audioMix?: string; notes: string }
}
export const DELIVERABLES: DeliverableDef[] = [
  { key: 'master', name: 'Festival master (ProRes)', due: '2027-02-26', status: 'not_started', approval: 'pending', recipient: 'Festival programmers', method: 'Download link', spec: { resolution: '3840x2160', codec: 'ProRes 422 HQ', aspect: '16:9', bitrate: '~700 Mbps', graphics: 'Full graphics', language: 'English', audioMix: 'Stereo', notes: 'Textless head and tail on separate tracks.' } },
  { key: 'dcp', name: 'DCP (2K Flat, SMPTE)', due: '2027-02-26', status: 'not_started', approval: 'pending', recipient: 'Festival projection', method: 'Hard drive and download', spec: { resolution: '2048x858', codec: 'JPEG 2000', aspect: '2.39:1', audioMix: 'Stereo', language: 'English', notes: 'Medlock DCP & Deliverables; QC report included.' } },
  { key: 'stereo', name: 'Stereo mix (-23 LUFS)', due: '2027-01-29', status: 'not_started', approval: 'pending', recipient: 'Festival / sales', method: 'Download link', spec: { audio: 'Stereo', audioMix: 'Stereo', language: 'English', notes: 'EBU R128 loudness.' } },
  { key: 'me', name: 'Music and effects (M&E) stems', due: '2027-01-29', status: 'not_started', approval: null, recipient: 'Sales agent', method: 'Download link', spec: { audio: 'M&E', audioMix: 'Stereo', notes: 'For dubbing and international sales.' } },
  { key: 'subs', name: 'English SDH subtitles', due: '2027-02-12', status: 'not_started', approval: 'pending', recipient: 'Festival programmers', method: 'Email', spec: { captions: 'SDH', subtitles: 'English', language: 'English', notes: 'SRT and STL. Check the Mancunian slang spelling list.' } },
  { key: 'cue', name: 'Music cue sheet', due: '2027-01-29', status: 'preparing', approval: null, recipient: 'Producer / PRS', method: 'Email', spec: { notes: 'Generated from Music & Archive once clearances are final.' } },
  { key: 'trailer', name: 'Trailer (60s)', due: '2027-02-12', status: 'not_started', approval: null, recipient: 'Festival / social', method: 'Download link', spec: { resolution: '1920x1080', codec: 'H.264', aspect: '16:9', notes: 'Cut from the locked picture; no spoilers.' } },
  { key: 'stills', name: 'Poster, key art and stills pack', due: '2027-02-12', status: 'not_started', approval: null, recipient: 'Festival publicists', method: 'Download link', spec: { notes: '10 stills from the shoot plus one-sheet; the park bench image is the hero.' } },
  { key: 'chain', name: 'Chain of title and licences pack', due: '2027-02-12', status: 'preparing', approval: null, recipient: 'Sales agent', method: 'Download link', spec: { notes: 'Script assignment, cast and crew releases, music licences, location releases.' } },
]

// ─── Key contacts ───────────────────────────────────────────────────────────

export const KEY_CONTACTS: Array<{ department: string; crewKey: string | null; name?: string; phone?: string; email?: string; notes?: string }> = [
  { department: 'Director', crewKey: 'director' },
  { department: '1st AD', crewKey: 'firstAd' },
  { department: 'Script Supervisor', crewKey: 'scriptSup', notes: 'Daily progress report and editor’s log.' },
  { department: 'DoP', crewKey: 'dop' },
  { department: 'Sound', crewKey: 'soundMixer' },
  { department: 'Gaffer', crewKey: 'gaffer' },
  { department: 'Production Designer', crewKey: 'productionDesigner' },
  { department: 'Locations', crewKey: 'locationsManager' },
  { department: 'Line Producer', crewKey: 'lineProducer' },
  { department: 'Set Medic', crewKey: null, name: 'Set medic (name TBC)', phone: '07700 900210', email: 'medic@safesetnw-demo.example', notes: 'PO-SFN-002 awaiting approval.' },
]

// ─── Hazard templates (project library) ──────────────────────────────────────

export type HazardTemplateDef = {
  name: string; description: string; risks: string; outcomes: string; controls: string
  crew: 0 | 1; cast: 0 | 1; public: 0 | 1; sb: number; pb: number; sa: number; pa: number
}
export const HAZARD_TEMPLATES: HazardTemplateDef[] = [
  { name: 'Filming in a public park', description: 'Filming on public paths and open grass at Platt Fields Park while the park stays open.', risks: 'Members of the public walking into shot or tripping over cables and stands.\nUneven ground, wet leaves and mud.\nDogs and cyclists on the path.', outcomes: 'Trips and falls, collisions, minor injuries to the public or crew.', controls: 'Locations marshals on both ends of the path; hold the shot for pedestrians.\nCable ramps and sandbags on every stand; keep kit off the path edges.\nSafety briefing at unit base; footwear suitable for wet ground.\nPermit conditions from Screen Manchester posted at unit base.', crew: 1, cast: 1, public: 1, sb: 3, pb: 3, sa: 2, pa: 2 },
  { name: 'Night exterior on a public pavement', description: 'Night filming on a Northern Quarter pavement outside a live music venue.', risks: 'Intoxicated passers-by, vehicles on Spear Street.\nCables and stands on a busy pavement.\nLow light and wet surfaces.\nNoise complaints from residents.', outcomes: 'Collisions, trips, confrontation, noise complaints.', controls: 'Locations marshals and hi-vis on both pavements; keep a 1.5m clear route for the public.\nCable ramps; lights and stands flagged and weighted.\nVenue, bar staff and residents informed in writing; wrap by 23:30.\nPlayback level agreed with the venue and checked with a meter.', crew: 1, cast: 1, public: 1, sb: 4, pb: 3, sa: 3, pa: 2 },
  { name: 'Working in licensed premises (pub, bar, café)', description: 'Filming inside a working pub, bar or café under a location hire agreement.', risks: 'Slippery floors and tight spaces behind the bar.\nFire exits blocked by kit.\nElectrical load on the venue’s circuits.\nHerbal smoking props indoors.', outcomes: 'Slips, blocked exits in an emergency, tripped breakers, smoke alarm activation.', controls: 'Walk the fire plan with the duty manager at the start of the day; keep exits and corridors clear.\nProtect floors; use mats in wet areas.\nPower survey by the gaffer; tie in via a qualified electrician only.\nSmoking props only with agreed herbal cigarettes and extinguished between takes.', crew: 1, cast: 1, public: 0, sb: 3, pb: 3, sa: 2, pa: 2 },
  { name: 'Static vehicle rig (bus)', description: 'Filming inside a parked bus; grips rock the body for movement.', risks: 'Crew and cast falling while the bus is rocked.\nTrapped fingers in doors.\nCarbon monoxide if the engine is left running in the yard.\nHeat and low light inside.', outcomes: 'Falls, crush injuries, fainting.', controls: 'Engine off and keys held by the 1st AD; wheels chocked.\nRocking only by trained grips on cue; cast braced and briefed.\nDoors secured open between takes.\nCrew limited to essential personnel inside; regular breaks.', crew: 1, cast: 1, public: 0, sb: 3, pb: 2, sa: 2, pa: 1 },
]

export const BUILT_IN_HAZARD_KEYS_BY_DAY: Record<number, string[]> = {
  1: ['manual-handling', 'trip-hazards', 'lighting', 'fatigue'],
  2: ['manual-handling', 'trip-hazards', 'electrical-equipment', 'lighting'],
  3: ['manual-handling', 'trip-hazards', 'electrical-equipment', 'lighting', 'smoking'],
  4: ['manual-handling', 'trip-hazards', 'access-egress-blocking'],
  5: ['manual-handling', 'trip-hazards', 'personal-security', 'fatigue', 'electrical-equipment'],
  6: ['manual-handling', 'trip-hazards', 'vehicles', 'fatigue'],
  7: ['manual-handling', 'trip-hazards', 'personal-security', 'vehicles'],
}
