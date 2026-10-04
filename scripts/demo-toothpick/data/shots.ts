/**
 * Shot list for Toothpick, authored from the script. One tuple per shot:
 *   [size, description, lens, support, movement, minutes, castLetters, notes?]
 * Cast letters: H Hugh · M Maisie · D Don · R Rose · N Minty · B Bouncer · C Customer · G Cottage-core girl
 *   W/V/U montage women 1–3 · digits 1–6 supporting artists (see people.ts)
 */
import type { CameraMovement, ShotSize } from '@/lib/db/types'
import type { CastKey } from './people'

export type ShotTuple = [ShotSize, string, string | null, string | null, CameraMovement | null, number, string, string?]

export const CAST_LETTER: Record<string, CastKey> = {
  H: 'hugh', M: 'maisie', D: 'don', R: 'rose', N: 'minty', B: 'bouncer', C: 'customer', G: 'cottagecore',
  W: 'woman1', V: 'woman2', U: 'woman3',
  '1': 'sa1', '2': 'sa2', '3': 'sa3', '4': 'sa4', '5': 'sa5', '6': 'sa6',
}

const S = 'Static' as const

export const SHOTS: Record<number, ShotTuple[]> = {
  1: [
    ['MS', 'Hugh crammed in the back seat of the bus, phone pressed to his ear', '35mm', 'Handheld', null, 20, 'H', 'Grips rock the bus. Hugh’s "turbulent" energy comes from the rig, not the camera.'],
    ['CU', 'Hugh: "-Huh?" as Don’s news lands', '50mm', 'Handheld', null, 15, 'H'],
    ['MS', 'Don at his bedroom mirror, yelling into a phone (split-screen, left)', '35mm', 'Tripod', S, 20, 'D', 'Shot at Don’s flat on day 6, locked off for the split.'],
    ['CU', 'Don fussing with his piddly beard', '50mm', 'Tripod', S, 15, 'D', 'Keep the beard patchy: no grooming between takes.'],
    ['LS', 'Rowdy youths jeering from the front of the bus', '24mm', 'Handheld', null, 20, 'H123', '3 supporting artists.'],
    ['CU', 'Hugh sticks a finger in his other ear', '85mm', 'Handheld', null, 10, 'H'],
  ],
  2: [
    ['LS', 'Quiet bar: Hugh and Maisie across a sticky table in the fringe of the room', '24mm', 'Tripod', S, 25, 'HM'],
    ['MS', 'Hugh single: flat pint, "Clearly we need to get better friends."', '50mm', 'Tripod', S, 20, 'H'],
    ['MS', 'Maisie single: cold cider, "Graphics design is my passion."', '50mm', 'Tripod', S, 20, 'M'],
    ['CU', 'Hugh takes a big glug of beer, scanning the room', '85mm', 'Tripod', S, 15, 'H'],
    ['CU', 'Maisie: "Right, you DO need better friends. Another one?"', '85mm', 'Tripod', S, 15, 'M'],
    ['MCU', 'Round after round: pints stacking up on the table', '35mm', 'Slider', 'Track Right', 10, 'HM'],
  ],
  3: [
    ['LS', 'Blue early-morning light through green curtains; Hugh’s eyes creak open', '24mm', 'Tripod', S, 20, 'H'],
    ['MCU', 'Hugh leans over the bed edge: two phones plugged in to charge', '35mm', 'Handheld', null, 15, 'H'],
    ['ECU', 'Condom wrapper on the floor', '100mm Macro', 'Tripod', S, 10, ''],
    ['MS', 'Hugh peels the covers off, nearly falls out of bed, drapes his shirt on', '35mm', 'Handheld', null, 20, 'H'],
    ['ECU', 'Belt buckle clinks as he pulls up his jeans', '100mm Macro', 'Tripod', S, 10, 'H'],
    ['MS', 'Maisie stirs: "...mmmm..Morning.." — Hugh mid-escape', '50mm', 'Tripod', S, 25, 'HM'],
  ],
  4: [
    ['MS', 'Hugh drinks straight from the cold tap', '35mm', 'Handheld', null, 15, 'H'],
    ['CU', 'He splashes his face with water', '50mm', 'Handheld', null, 10, 'H'],
    ['ECU', 'Half-empty box of ibuprofen above the sink; he pockets it', '100mm Macro', 'Tripod', S, 10, 'H'],
  ],
  5: [
    ['LS', 'Kitchen two-shot: Maisie by the cafetière, Hugh in the doorway', '24mm', 'Tripod', S, 25, 'HM'],
    ['ECU', 'Cafetière and two mugs of black coffee', '100mm Macro', 'Tripod', S, 10, ''],
    ['CU', 'Hugh pops four pills from the blister pack', '85mm', 'Tripod', S, 10, 'H'],
    ['MS', 'Maisie: "Ta – if you want milk I’ve only got oat milk."', '50mm', 'Tripod', S, 20, 'M'],
    ['CU', 'Hugh holds up his pills: "Bottoms up."', '85mm', 'Tripod', S, 15, 'H'],
    ['MS', 'Hugh jeers, cockney: "Oi oi!" — Maisie sticks two fingers up', '35mm', 'Handheld', null, 15, 'HM'],
  ],
  6: [
    ['LS', 'Café booth: Hugh has finished his fry-up, Maisie’s halfway through her oats', '24mm', 'Tripod', S, 25, 'HM'],
    ['CU', 'Hugh: "I’m usually not but I felt like if I didn’t get something down me it’d be..unpleasant."', '85mm', 'Tripod', S, 15, 'H'],
    ['CU', 'Maisie: "God you’re a fast eater. Couldn’t be me."', '85mm', 'Tripod', S, 15, 'M'],
    ['ECU', 'Maisie puts her hand over his', '100mm Macro', 'Tripod', S, 10, 'HM'],
  ],
  7: [
    ['MS', 'Hugh yanks his phone out in the tiny café bathroom and dials', '24mm', 'Handheld', null, 25, 'H', 'Hugh’s side: shot at the café on day 4.'],
    ['CU', 'Hugh: "I ended up staying out las-"', '50mm', 'Handheld', null, 20, 'H'],
    ['MS', 'Don picks up in his living room, turning down the drab telly', '35mm', 'Tripod', S, 25, 'D', 'Don’s side: shot at Don’s flat on day 6.'],
    ['CU', 'Don: "MATE what have you done?"', '50mm', 'Tripod', S, 20, 'D'],
    ['LS', 'A customer queues outside the bathroom door, listening in', '35mm', 'Tripod', S, 15, 'C', 'Day 4.'],
    ['MCU', 'Don sings the chorus of "Free Bird" down the phone', '50mm', 'Tripod', S, 15, 'D', 'Clearance pending — keep to the chorus.'],
  ],
  8: [
    ['LS', 'Hugh shunts stage kit onto a truck in the middle of the night outside a venue', '24mm', 'Handheld', null, 30, 'H', 'Main Unit, Albert Hall load-out.'],
    ['MS', 'Maisie clips photographs to a metal grid for her graduation show', '35mm', 'Tripod', S, 20, 'M', 'Second Unit, degree-show space.'],
    ['MS', 'Hugh sits alone in a cheap hotel bar', '35mm', 'Tripod', S, 20, 'H', 'Main Unit.'],
    ['MS', 'Maisie in a pub with her coursemates', '35mm', 'Tripod', S, 20, 'M45', 'Second Unit. 2 SAs.'],
    ['CU', 'Hugh’s phone: he doesn’t call', '85mm', 'Handheld', null, 10, 'H'],
  ],
  9: [
    ['LS', 'Hugh’s flat: dinner in the slow cooker, lo-fi hip-hop humming, poker table set', '24mm', 'Tripod', S, 30, 'HM'],
    ['ECU', 'Slow cooker lid, speaker in the corner', '100mm Macro', 'Tripod', S, 10, ''],
    ['MS', 'Two-shot at the poker table: three chips pushed into the centre', '35mm', 'Tripod', S, 40, 'HM'],
    ['CU', 'Hugh eyeballs his cards', '85mm', 'Tripod', S, 20, 'H'],
    ['CU', 'Maisie neatly plops another four chips on her bet', '85mm', 'Tripod', S, 20, 'M'],
    ['MS', 'OTS Maisie, Hugh’s POV: "You were fine though!"', '50mm', 'Tripod', S, 30, 'HM'],
    ['ECU', 'Face-down flop cards on the table; Maisie lifts the fourth', '100mm Macro', 'Tripod', S, 15, 'M'],
    ['MCU', 'Maisie stands and steps away: "Fucking excuse me?"', '50mm', 'Handheld', null, 25, 'M'],
    ['MS', 'She grabs her coat and keys and slams the door; the slow cooker beeps', '35mm', 'Tripod', S, 25, 'HM'],
    ['CU', 'Hugh remains at the table', '85mm', 'Tripod', 'Track In', 20, 'H'],
  ],
  10: [
    ['LS', 'Round table: Hugh slumped, Don and Rose, the pub nearly dead', '24mm', 'Tripod', S, 35, 'HDR'],
    ['CU', 'Rose: "You brought that on yourself mate."', '85mm', 'Tripod', S, 20, 'R'],
    ['CU', 'Don closes his eyes, bracing: "Don’t-"', '85mm', 'Tripod', S, 20, 'D'],
    ['CU', 'Hugh: "Sorry have I missed something here?"', '85mm', 'Tripod', S, 20, 'H'],
    ['MCU', 'Rose swirls the remains of her pint of ale', '100mm Macro', 'Tripod', S, 10, 'R'],
    ['MS', 'OTS Hugh favouring Rose: "Say you’d come back from a show early morning..."', '50mm', 'Tripod', S, 25, 'HR'],
    ['LS', 'The bell rings for last orders; the gang neck the rest of their pints', '24mm', 'Handheld', null, 15, 'HDR'],
  ],
  11: [
    ['LS', 'Hugh stands with his back to a brick wall; hard techno booms from the basement behind him', '24mm', 'Tripod', S, 25, 'H6', 'Playback via sub-woofer at the door.'],
    ['MS', 'Hugh fumbles for a straight from his jacket pocket', '35mm', 'Handheld', null, 20, 'H'],
    ['MS', 'OTS: "Hii, can I bum a fag?" — the woman in the pale green cardigan slides in', '50mm', 'Handheld', null, 20, 'HN'],
    ['ECU', 'Clipper lighter flares; she takes a deep first breath', '100mm Macro', 'Tripod', S, 10, 'N'],
    ['MS', 'WHIP PAN TO Rose chatting up a bouncer, twirling her hair', '35mm', 'Handheld', 'Pan Right', 20, 'RB'],
    ['MS', 'Two-shot Hugh and Minty: "Oh I came to see Signal."', '50mm', 'Tripod', S, 30, 'HN'],
    ['CU', 'Minty: "Imagine being sat next to some neek for thirteen hours."', '85mm', 'Tripod', S, 15, 'N'],
    ['LS', 'They both step into the venue; the music gets heavier until SMASH CUT', '24mm', 'Tripod', S, 15, 'HN'],
  ],
  12: [
    ['LS', 'Windchimes clink in a gentle breeze through Minty’s apartment', '24mm', 'Tripod', S, 25, 'N'],
    ['MS', 'Minty leans over the balcony bars, tapping a fag over the edge', '35mm', 'Tripod', S, 20, 'N'],
    ['MCU', 'Hugh stumbles into the living room, dressed', '50mm', 'Handheld', null, 15, 'H'],
    ['MS', 'Hugh leans in to hug her; before he can reach her, she turns', '35mm', 'Handheld', null, 20, 'HN'],
    ['ECU', 'Instant coffee, mug, kettle', '100mm Macro', 'Tripod', S, 10, ''],
    ['CU', 'Minty: "...but you need to get home."', '85mm', 'Tripod', S, 20, 'N'],
  ],
  13: [
    ['MS', 'Hugh with a woman in a hotel bar', '35mm', 'Tripod', S, 10, 'HW'],
    ['MS', 'Hugh with a different woman, inside a bar', '35mm', 'Tripod', S, 10, 'HV'],
    ['MS', 'Hugh at an outdoor table with a third', '35mm', 'Tripod', S, 10, 'HU'],
    ['CU', 'Hugh looking more and more checked out', '85mm', 'Tripod', S, 10, 'H', 'Three setups, one per bar.'],
  ],
  14: [
    ['LS', 'Pub, daytime: Hugh, Rose and Don at a table, three glasses stacked beside it', '24mm', 'Tripod', S, 35, 'HDR45'],
    ['ECU', '"Birthday Boy" badge pinned to Hugh’s jumper', '100mm Macro', 'Tripod', S, 10, 'H'],
    ['CU', 'Don: "...this Greek unit of a man picks up this guy..."', '85mm', 'Tripod', S, 20, 'D'],
    ['CU', 'Rose: "Things that never happened."', '85mm', 'Tripod', S, 20, 'R'],
    ['CU', 'Hugh, resolute: "Yeah I’m class."', '85mm', 'Tripod', S, 20, 'H'],
    ['MS', 'OTS Rose and Don: "How’ve you made this about your bloody club night?"', '50mm', 'Tripod', S, 25, 'DR'],
    ['MCU', 'Don tenses his shoulders and sinks his neck: "Bars."', '50mm', 'Tripod', S, 15, 'D'],
    ['MCU', 'Hugh: "I feel like the last two years have slipped through my hands."', '85mm', 'Tripod', 'Track In', 25, 'H'],
  ],
  15: [
    ['MS', 'Hugh slumped on the sofa, rotating a Wii remote like a sword', '35mm', 'Tripod', S, 20, 'H'],
    ['ECU', 'Kit-cat clock ticking on the wall between them', '100mm Macro', 'Tripod', S, 10, ''],
    ['MS', 'Hugh opens the door, double-taking: Maisie’s changed her hair', '35mm', 'Handheld', null, 20, 'HM'],
    ['LS', 'Two-shot on opposite ends of the sofa with tea and coffee', '24mm', 'Tripod', S, 30, 'HM'],
    ['CU', 'Hugh: "I’ve just..not thought about it. Been busy."', '85mm', 'Tripod', S, 20, 'H'],
    ['CU', 'Maisie: "Yeah, Alice is just really sweet."', '85mm', 'Tripod', S, 20, 'M'],
  ],
  16: [
    ['LS', 'Hugh and Maisie amble down a leafy park path', '35mm', 'Gimbal', 'Track In', 40, 'HM', 'Walking tracking shot, gimbal.'],
    ['MS', 'Walk-and-talk two-shot: "Work to live not live to work."', '50mm', 'Dolly', 'Track In', 40, 'HM'],
    ['CU', 'Maisie: "You’re burning your candle at both ends mate."', '85mm', 'Tripod', S, 20, 'M'],
    ['CU', 'Hugh: "That helps."', '85mm', 'Tripod', S, 20, 'H'],
    ['MCU', 'A bird flies overhead; tilt up to the branches', '70–200mm', 'Tripod', 'Tilt Up', 10, ''],
    ['MS', 'Maisie steps out in front of Hugh: "driver’s seat of your own life."', '50mm', 'Dolly', 'Track Out', 25, 'HM'],
    ['LS', 'They hug; Hugh sinks his head into her shoulder', '85mm', 'Tripod', S, 20, 'HM'],
  ],
  17: [
    ['LS', 'Park bench as the autumn sun dips behind the trees', '35mm', 'Tripod', S, 30, 'HM', 'Late-afternoon light window: about 15:00–16:15.'],
    ['MS', 'Two-shot on the bench: "I look back on that naive teenager..."', '50mm', 'Tripod', S, 30, 'HM'],
    ['CU', 'Maisie: "And are you happy?"', '85mm', 'Tripod', S, 20, 'M'],
    ['CU', 'Hugh looks through her', '85mm', 'Tripod', S, 20, 'H'],
    ['MS', 'They both stand; Maisie kisses him on the cheek; Hugh looks into the distance', '50mm', 'Tripod', S, 25, 'HM'],
    ['CU', 'Hugh looks into the distance behind her', '85mm', 'Tripod', 'Track In', 15, 'H'],
  ],
  18: [
    ['LS', 'Pub, a few months on: Hugh in t-shirt and chinos, Rose mingling at the bar', '24mm', 'Tripod', S, 25, 'HR45G'],
    ['CU', 'Cottage-core girl frowns to hide a laugh as Hugh wipes beer froth from his moustache', '85mm', 'Tripod', S, 15, 'HG'],
    ['MS', 'Hugh looks to Rose, then to the cottage-core girl', '50mm', 'Tripod', S, 20, 'HRG'],
    ['CU', 'Hugh looks down the camera. CUT TO BLACK.', '50mm', 'Tripod', S, 20, 'H'],
  ],
}

export function totalShotCount(): number {
  return Object.values(SHOTS).reduce((s, a) => s + a.length, 0)
}
