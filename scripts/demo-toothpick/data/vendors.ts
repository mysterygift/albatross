/**
 * Toothpick vendors. Companies are fictional (Manchester-flavoured names); contact e-mails use
 * the reserved ".example" TLD. The nine "labour companies" are crew who invoice through their own
 * limited company, the way the existing demos model freelance labour.
 */
export type VendorKey =
  | 'camera' | 'lighting' | 'sound' | 'catering' | 'vehicles' | 'bus' | 'lodging' | 'insurance'
  | 'legal' | 'payroll' | 'costume' | 'props' | 'post' | 'dcp' | 'safety' | 'extras' | 'print'
  | 'venues' | 'permits' | 'office' | 'data' | 'music' | 'hosts' | 'lenses'
  | 'coDirector' | 'coAd' | 'coScript' | 'coDesign' | 'coDop' | 'coGaffer' | 'coSound' | 'coEditor' | 'coColour'

export type VendorDef = { key: VendorKey; company_name: string; contact: string; email: string }

const e = (domain: string, local: string) => `${local}@${domain}-demo.example`

export const VENDORS: VendorDef[] = [
  { key: 'camera', company_name: 'Ardwick Camera Hire', contact: 'Joel Whitaker', email: e('ardwickcamera', 'joel.whitaker') },
  { key: 'lighting', company_name: 'Salford Quays Lighting & Grip', contact: 'Nadia Petrović', email: e('sqlightgrip', 'nadia.petrovic') },
  { key: 'sound', company_name: 'Pennine Sound Hire', contact: 'Ravi Chandran', email: e('pennisound', 'ravi.chandran') },
  { key: 'catering', company_name: 'Mancunian Unit Catering', contact: 'Beatriz Almeida', email: e('mancunianunit', 'beatriz.almeida') },
  { key: 'vehicles', company_name: 'Oldham Road Vehicle Hire', contact: 'Gareth Morgan', email: e('oldhamroadvehicles', 'gareth.morgan') },
  { key: 'bus', company_name: 'Trafford Coach & Bus Hire', contact: 'Ifeanyi Obi', email: e('trafford-coach', 'ifeanyi.obi') },
  { key: 'lodging', company_name: 'Castlefield Crew Lodgings', contact: 'Anita Kapoor', email: e('castlefieldlodgings', 'anita.kapoor') },
  { key: 'insurance', company_name: 'Northern Screen Insurance Brokers', contact: 'Marcus Hale', email: e('northernscreeninsure', 'marcus.hale') },
  { key: 'legal', company_name: 'Ancoats Legal LLP', contact: 'Sana Qureshi', email: e('ancoatslegal', 'sana.qureshi') },
  { key: 'payroll', company_name: 'Piccadilly Payroll Services', contact: 'Hannah Lindqvist', email: e('piccadillypayroll', 'hannah.lindqvist') },
  { key: 'costume', company_name: 'Hulme Costume & Wardrobe Hire', contact: 'Ottilie Brandt', email: e('hulmecostume', 'ottilie.brandt') },
  { key: 'props', company_name: 'Rusholme Props & Dressing', contact: 'Idris Rahman', email: e('rusholmeprops', 'idris.rahman') },
  { key: 'post', company_name: 'Chorlton Post House', contact: 'Yara Mansour', email: e('chorltonpost', 'yara.mansour') },
  { key: 'dcp', company_name: 'Medlock DCP & Deliverables', contact: 'Felix Åberg', email: e('medlockdcp', 'felix.aberg') },
  { key: 'safety', company_name: 'SafeSet North West', contact: 'Chidi Nwankwo', email: e('safesetnw', 'chidi.nwankwo') },
  { key: 'extras', company_name: 'Piccadilly Casting & Extras', contact: 'Thandiwe Mokoena', email: e('piccadillyextras', 'thandiwe.mokoena') },
  { key: 'print', company_name: 'Spinningfields Print & Copy', contact: 'Luca Ferrari', email: e('spinningfieldsprint', 'luca.ferrari') },
  { key: 'venues', company_name: 'Great Bridgewater Venues Ltd', contact: 'Róisín Walsh', email: e('greatbridgewatervenues', 'roisin.walsh') },
  { key: 'permits', company_name: 'Northern Permits & Parks Liaison', contact: 'Ahmed Siddiqui', email: e('northernpermits', 'ahmed.siddiqui') },
  { key: 'office', company_name: 'Ancoats Production Office Hire', contact: 'Greta Johansson', email: e('ancoatsoffice', 'greta.johansson') },
  { key: 'data', company_name: 'Irwell Data & Backup', contact: 'Kareem Nasser', email: e('irwelldata', 'kareem.nasser') },
  { key: 'music', company_name: 'Tib Street Music Clearance', contact: 'Elena Petrova', email: e('tibstreetmusic', 'elena.petrova') },
  { key: 'hosts', company_name: 'Northern Location Hosts', contact: 'Daniel Okoro', email: e('northernlocationhosts', 'daniel.okoro') },
  { key: 'lenses', company_name: 'Rotterdam Lens Rentals B.V.', contact: 'Sanne de Boer', email: e('rotterdamlenses', 'sanne.deboer') },
  { key: 'coDirector', company_name: 'Teodora Vasile Films Ltd', contact: 'Teodora Vasile', email: e('toothpick', 'teodora.vasile') },
  { key: 'coAd', company_name: 'Rafael Oliveira AD Services', contact: 'Rafael Oliveira', email: e('toothpick', 'rafael.oliveira') },
  { key: 'coScript', company_name: 'Mirela Kovač Continuity Ltd', contact: 'Mirela Kovač', email: e('toothpick', 'mirela.kovac') },
  { key: 'coDesign', company_name: 'Anouk de Vries Design Ltd', contact: 'Anouk de Vries', email: e('toothpick', 'anouk.devries') },
  { key: 'coDop', company_name: 'Lars Eriksson Cinematography Ltd', contact: 'Lars Eriksson', email: e('toothpick', 'lars.eriksson') },
  { key: 'coGaffer', company_name: 'Giorgos Papadakis Lighting Ltd', contact: 'Giorgos Papadakis', email: e('toothpick', 'giorgos.papadakis') },
  { key: 'coSound', company_name: 'Helena Costa Sound', contact: 'Helena Costa', email: e('toothpick', 'helena.costa') },
  { key: 'coEditor', company_name: 'Valentina Rossi Editorial', contact: 'Valentina Rossi', email: e('toothpick', 'valentina.rossi') },
  { key: 'coColour', company_name: 'Ingrid Haugen Colour', contact: 'Ingrid Haugen', email: e('toothpick', 'ingrid.haugen') },
]

export function vendorByKey(key: VendorKey): VendorDef {
  const v = VENDORS.find((x) => x.key === key)
  if (!v) throw new Error(`No vendor ${key}`)
  return v
}

/** Labour company vendor keyed by the crew member's `labourCompany` name. */
export function vendorKeyForCompany(company: string): VendorKey {
  const v = VENDORS.find((x) => x.company_name === company)
  if (!v) throw new Error(`No vendor for company ${company}`)
  return v.key
}
