/**
 * BBC-style chart of accounts, laid out the way a BBC finance reviewer reads a commissioned budget:
 *
 *   100  Above the line: development, story & script, producers, directors, principal cast
 *   200  Production management: line producer, PM, locations, ADs, office and admin
 *   300  Technical departments: camera, lighting and sound (crew and kit split), art, costume & make-up
 *   400  Locations & facilities, including Foreign Unit Crew & Equipment
 *   500  Travel, transport, hotel & living
 *   600  Post production & delivery, including BBC TX Deliverables and the BFI Archive Copy
 *
 * Codes: series `100` → section `110` → lines `1101`, `1102`, … (up to `1199`).
 *
 * Employer's NI is set up as fringe rules by category (Producer NI, Artists NI, Camera Crew NI, …). Each rule
 * is scoped to the pay lines of that category only, so kit hire and expenses in the same department never
 * attract NI.
 */
import type { ChartTemplate, ChartTemplateAccount, ChartTemplateFringe } from './chartTemplates'

/** UK employer's secondary Class 1 NI rate from 6 April 2025. */
export const UK_EMPLOYER_NI_RATE = 0.15

const NI_RULES = {
  producer: 'Producer NI',
  director: 'Director NI',
  artists: 'Artists NI',
  production: 'Production Staff NI',
  camera: 'Camera Crew NI',
  lighting: 'Lighting Crew NI',
  sound: 'Sound Crew NI',
  art: 'Art Department NI',
  costume: 'Costume, Make-up & Hair NI',
  post: 'Post Production Crew NI',
} as const

type NiCategory = keyof typeof NI_RULES

/** A line that is not pay, inside a section whose pay lines attract NI. */
type Line = string | { name: string; noNi: true }
const noNi = (name: string): Line => ({ name, noNi: true })

type Section = { code: string; name: string; ni?: NiCategory; lines: Line[] }
type Series = { code: string; name: string; sections: Section[] }

const BBC_SERIES: Series[] = [
  {
    code: '100',
    name: 'ABOVE THE LINE',
    sections: [
      {
        code: '110',
        name: 'Development',
        lines: [
          'Development Fees',
          'Development Research',
          'Treatment & Pitch Materials',
          'Taster Tape',
          'Development Travel & Expenses',
        ],
      },
      {
        code: '120',
        name: 'Story & Script',
        lines: [
          'Rights & Options',
          "Writers' Fees",
          'Script Editor',
          'Script Consultants & Advisers',
          'Script Research',
          'Script Clearances & Legal Read',
          'Script Printing & Distribution',
        ],
      },
      {
        code: '130',
        name: 'Producers',
        ni: 'producer',
        lines: [
          'Executive Producer',
          'Series Producer',
          'Producer',
          'Co-Producer',
          'Associate Producer',
          'Assistant Producer',
          'Researchers',
        ],
      },
      {
        code: '140',
        name: 'Directors',
        ni: 'director',
        lines: ['Series Director', 'Director', 'Producer / Director', 'Second Unit Director', "Director's Assistant"],
      },
      {
        code: '150',
        name: 'Principal Cast',
        ni: 'artists',
        lines: [
          'Lead Artists',
          'Supporting Artists',
          'Day Players',
          'Presenters & Contributors',
          'Narrator / Voice-Over',
          'Stunt Coordinator & Performers',
          'Rehearsals',
          'Artists Overtime',
          'Artists Use & Repeat Fees',
        ],
      },
      {
        code: '160',
        name: 'Casting',
        lines: ['Casting Director', 'Casting Assistant', 'Casting Sessions & Studio Hire', 'Self-Tape & Casting Platforms'],
      },
    ],
  },
  {
    code: '200',
    name: 'PRODUCTION MANAGEMENT',
    sections: [
      {
        code: '210',
        name: 'Production Management',
        ni: 'production',
        lines: [
          'Line Producer',
          'Production Manager',
          'Production Coordinator',
          'Production Secretary',
          'Production Assistant',
          'Runners',
          'Production Accountant',
          'Assistant Accountant',
        ],
      },
      {
        code: '220',
        name: 'Location Management',
        ni: 'production',
        lines: [
          'Location Manager',
          'Assistant Location Manager',
          'Unit Manager',
          'Location Assistants',
          'Location Marshals',
        ],
      },
      {
        code: '230',
        name: 'Assistant Directors & Floor Staff',
        ni: 'production',
        lines: [
          '1st Assistant Director',
          '2nd Assistant Director',
          '3rd Assistant Director',
          'Floor Runners',
          'Script Supervisor',
        ],
      },
      {
        code: '240',
        name: 'Production Office',
        lines: [
          'Office Rent',
          'Office Equipment & Furniture',
          'IT & Software',
          'Telephones & Mobiles',
          'Internet & Data',
          'Stationery & Printing',
          'Postage & Couriers',
          'Radios & Comms',
        ],
      },
      {
        code: '250',
        name: 'Production Administration',
        lines: [
          'Production Insurance',
          'Legal Fees',
          'Audit & Accountancy',
          'Payroll Services',
          'Bank Charges',
          'albert Carbon Footprint & Certification',
        ],
      },
      {
        code: '260',
        name: 'Health & Safety',
        lines: [
          'Health & Safety Adviser',
          'Risk Assessments',
          'Unit Medic',
          'Safety Equipment & PPE',
          'Specialist Safety Cover',
          'Security & Hostile Environment Advice',
        ],
      },
    ],
  },
  {
    code: '300',
    name: 'TECHNICAL DEPARTMENTS',
    sections: [
      {
        code: '310',
        name: 'Camera Crew',
        ni: 'camera',
        lines: [
          'Director of Photography',
          'Camera Operator',
          'Focus Puller',
          'Clapper Loader',
          'Camera Trainee',
          'DIT / Data Wrangler',
          'Key Grip',
          'Grips',
          'Drone Pilot',
        ],
      },
      {
        code: '320',
        name: 'Camera Equipment',
        lines: [
          'Camera Package',
          'Lenses',
          'Grip Equipment',
          'Specialist Camera & Rigs',
          'Camera Accessories & Consumables',
          'Recording Media & Storage',
          'DIT Cart & Data Backup',
        ],
      },
      {
        code: '330',
        name: 'Lighting Crew',
        ni: 'lighting',
        lines: ['Gaffer', 'Best Boy', 'Electricians', 'Lighting Desk Operator', 'Generator Operator'],
      },
      {
        code: '340',
        name: 'Lighting Equipment',
        lines: ['Lighting Package', 'Generators & Fuel', 'Power Distribution', 'Lighting Consumables'],
      },
      {
        code: '350',
        name: 'Sound Crew',
        ni: 'sound',
        lines: ['Production Sound Recordist', 'Boom Operator', 'Sound Assistant'],
      },
      {
        code: '360',
        name: 'Sound Equipment',
        lines: ['Sound Package', 'Radio Microphones', 'Timecode & Playback', 'Sound Consumables & Batteries'],
      },
      {
        code: '370',
        name: 'Art Department',
        ni: 'art',
        lines: [
          'Production Designer',
          'Art Director',
          'Set Decorator',
          'Props Master',
          'Standby Props',
          'Art Department Assistants',
          noNi('Set Construction'),
          noNi('Set Dressing & Props Purchase'),
          noNi('Props Hire'),
        ],
      },
      {
        code: '380',
        name: 'Costume, Make-up & Hair',
        ni: 'costume',
        lines: [
          'Costume Designer',
          'Costume Supervisor',
          'Costume Assistants',
          'Make-up & Hair Designer',
          'Make-up & Hair Artists',
          noNi('Costume Purchase & Hire'),
          noNi('Make-up & Hair Materials'),
          noNi('Laundry & Maintenance'),
        ],
      },
    ],
  },
  {
    code: '400',
    name: 'LOCATIONS & FACILITIES',
    sections: [
      {
        code: '410',
        name: 'Location Fees & Permits',
        lines: [
          'Location Fees',
          'Recce Costs',
          'Filming Permits & Licences',
          'Parking & Suspensions',
          'Police & Traffic Management',
          'Location Reinstatement & Cleaning',
        ],
      },
      {
        code: '420',
        name: 'Location Facilities',
        lines: [
          'Unit Base & Facilities Vehicles',
          'Honeywagons & Toilets',
          'Dressing Rooms & Make-up Trucks',
          'Location Catering',
          'Location Security',
          'Weather Cover & Heating',
          'Waste & Recycling',
        ],
      },
      {
        code: '430',
        name: 'Studio & Stage',
        lines: ['Studio / Stage Hire', 'Studio Facilities & Services', 'Workshop & Build Space'],
      },
      {
        code: '440',
        name: 'Foreign Unit Crew & Equipment',
        lines: [
          'Fixers & Local Producers',
          'Foreign Unit Crew',
          'Interpreters & Translators',
          'Local Drivers',
          'Foreign Unit Equipment Hire',
          'Carnets & Customs',
          'Foreign Location Fees & Permits',
        ],
      },
    ],
  },
  {
    code: '500',
    name: 'TRAVEL, TRANSPORT & LIVING',
    sections: [
      {
        code: '510',
        name: 'Travel',
        lines: ['Flights', 'Rail', 'Excess Baggage & Freight', 'Visas & Vaccinations', 'Taxis & Transfers'],
      },
      {
        code: '520',
        name: 'Transport',
        lines: ['Unit Vehicle Hire', 'Drivers', 'Fuel', 'Mileage Allowances', 'Parking & Tolls', 'Equipment Transport'],
      },
      {
        code: '530',
        name: 'Hotel & Living',
        lines: ['Hotels & Accommodation', 'Per Diems & Subsistence', 'Location Meals', 'Overnight Allowances'],
      },
    ],
  },
  {
    code: '600',
    name: 'POST PRODUCTION & DELIVERY',
    sections: [
      {
        code: '610',
        name: 'Post Production Crew',
        ni: 'post',
        lines: [
          'Editor',
          'Assistant Editor',
          'Edit Producer',
          'Post Production Supervisor',
          'Post Production Coordinator',
          'Logger / Transcriber',
        ],
      },
      {
        code: '620',
        name: 'Picture Edit Facilities',
        lines: [
          'Non-Linear Edit Facilities (Offline)',
          'Online Edit & Conform',
          'Colour Grade',
          'Graphics & Titles',
          'Media Management & Storage',
          'Viewing Copies & Review Links',
        ],
      },
      {
        code: '630',
        name: 'Sound Edit Facilities',
        lines: [
          'Sound Edit Facilities',
          'Dubbing & Final Mix',
          'Foley Recording',
          'ADR & Voice-Over Recording',
          'Sound Effects & Libraries',
        ],
      },
      {
        code: '640',
        name: 'Music',
        lines: [
          'Composer',
          'Musicians & Recording Sessions',
          'Music Supervisor',
          'Commercial Music Licences',
          'Library / Production Music',
        ],
      },
      {
        code: '650',
        name: 'CGI & VFX',
        lines: ['CGI Packages', 'VFX Shots', 'VFX Supervisor', 'Motion Graphics & Animation'],
      },
      {
        code: '660',
        name: 'Archive & Clearances',
        lines: ['Archive Footage Licences', 'Stills & Photographs', 'Archive Research', 'Copyright Clearances'],
      },
      {
        code: '670',
        name: 'BBC TX Deliverables',
        lines: [
          'TX Master (AS-11 DPP)',
          'Quality Assessment Reviews',
          'Textless Title Prints',
          'WGBH Deliverables',
          'Closed Captions & Subtitles',
          'Audio Description',
          'Compliance Viewing & Reports',
          'Music Cue Sheets & PasB',
          'Publicity Stills',
          'BFI Archive Copy',
          'Delivery Media & Shipping',
        ],
      },
    ],
  },
]

function buildBbcTemplate(): Pick<ChartTemplate, 'accounts' | 'fringes'> {
  const accounts: ChartTemplateAccount[] = []
  const niCodes = new Map<NiCategory, string[]>()
  for (const series of BBC_SERIES) {
    accounts.push({ code: series.code, name: series.name, parentCode: null, isPostable: false })
    for (const section of series.sections) {
      accounts.push({ code: section.code, name: section.name, parentCode: series.code, isPostable: false })
      section.lines.forEach((line, i) => {
        const code = String(Number(section.code) * 10 + i + 1)
        const name = typeof line === 'string' ? line : line.name
        accounts.push({ code, name, parentCode: section.code, isPostable: true })
        if (section.ni && typeof line === 'string') {
          niCodes.set(section.ni, [...(niCodes.get(section.ni) ?? []), code])
        }
      })
    }
  }
  const fringes: ChartTemplateFringe[] = [...niCodes].map(([category, accountCodes]) => ({
    name: NI_RULES[category],
    rate: UK_EMPLOYER_NI_RATE,
    accountCodes,
  }))
  return { accounts, fringes }
}

export const BBC_CHART_TEMPLATE: ChartTemplate = {
  id: 'bbc',
  name: 'BBC',
  description:
    'Structured the way BBC finance reviews a commissioned budget: 100 above the line, 200 production management, 300 technical departments, 400–500 locations, travel and living, 600 post and BBC TX Deliverables. Adds employer’s NI fringes per crew category.',
  ...buildBbcTemplate(),
  totals: [
    { name: 'Above the Line', headerCodes: ['100'] },
    { name: 'Below the Line', headerCodes: ['200', '300', '400', '500'] },
    { name: 'Post Production & Delivery', headerCodes: ['600'] },
  ],
}
