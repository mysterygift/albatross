/**
 * Demo production equipment seed (D1).
 *
 * Fictional production context: UK TV drama / commercial-style shoot. Camera and lens
 * packages reflect typical rental configurations from Panavision/Lumen-style houses.
 * Lighting and grip link to Lumen Grip & Light invoices; camera/lenses to Panavision London.
 * Vendors and invoices are the existing demo vendors/invoices (seedDemoVendors,
 * seedDemoVendorFinance). Rental windows align with shoot schedule; return reminder tasks
 * are created for rented equipment with return_due_date.
 *
 * Quantity: Hero/unique items (cameras, lenses, key fixtures, recorders, etc.) are single-unit
 * rows (quantity 1 or omitted). Repeated support stock (batteries, stands, cables, lavs,
 * walkies, cases) uses the equipment quantity field so the demo demonstrates grouped inventory
 * and on-set counts; names are normalized to singular/base where quantity carries the count.
 * List item quantity = units to pack on a kit; registry quantity = stock on hand.
 *
 * Run only for singleton demo production (DEMO_SLUG), after seedDemoVendorFinance.
 * Uses deterministic IDs from IDS; equipment lists reference shoot days and registry items.
 */

import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import {
  buildCreateEquipmentStatements,
  type CreateEquipmentData,
} from '../repositories/equipment'
import { buildCreateTaskStatements } from '../repositories/tasks'
import type { EquipmentCategory, EquipmentStatus } from '../types'
import {
  getDefaultCrewHierarchyConfig,
  getResolvedTaskDepartmentsForCrewDepartment,
} from '@/lib/people/crewHierarchyResolver'
import { IDS } from './constants'

export type DemoEquipmentSeedIdSource = {
  equipment: (n: number) => string
  equipmentItemUuid: (n: number) => string
  vendorInvoice: (n: number) => string
  equipmentReminderTask: (n: number) => string
  shootDay: (n: number) => string
  equipmentList: (n: number) => string
  equipmentListItem: (n: number) => string
}

const LISTS_TABLE = 'equipment_lists'
const ITEMS_TABLE = 'equipment_list_items'
const FALLBACK_DEPARTMENT = 'Production'

/** Map equipment department (crew hierarchy name) to task assigned_department using default hierarchy. */
function taskDepartment(equipmentDepartment: string | null): string {
  if (!equipmentDepartment?.trim()) return FALLBACK_DEPARTMENT
  const hierarchy = getDefaultCrewHierarchyConfig()
  const labels = getResolvedTaskDepartmentsForCrewDepartment(hierarchy, equipmentDepartment.trim())
  return labels[0] ?? FALLBACK_DEPARTMENT
}

function reminderDescription(name: string): string {
  return `Return equipment — ${name}`
}

type DemoEquipmentDef = {
  name: string
  category: EquipmentCategory
  department: string
  source_type: 'rented' | 'purchased' | 'owned'
  quantity?: number
  vendorKey?: string
  invoiceIdx?: number
  rentalStartOffset?: number
  returnDueOffset?: number
  replacement_value: number
  status: EquipmentStatus
  notes?: string | null
  serial_number?: string | null
}

/** ~110 items: camera, lenses, lighting, grip, sound, DIT, production. Hero gear single-unit; support stock uses quantity. */
const DEMO_EQUIPMENT: DemoEquipmentDef[] = [
  // ----- Camera (base package) -----
  { name: 'ARRI Alexa Mini Camera Body', category: 'camera', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 45000, status: 'active', notes: 'Principal camera', serial_number: 'AM-2041' },
  { name: 'ARRI MVF-1 Viewfinder', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 4200, status: 'active' },
  { name: 'ARRI Top Handle', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 380, status: 'active' },
  { name: 'ARRI Baseplate', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1200, status: 'active' },
  { name: 'ARRI Shoulder Rig', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  { name: 'ARRI Rod Set 15mm', category: 'camera_accessories', department: 'Camera', source_type: 'rented', quantity: 2, vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 280, status: 'active' },
  { name: 'ARRI Rod Set 19mm', category: 'camera_accessories', department: 'Camera', source_type: 'rented', quantity: 2, vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 320, status: 'active' },
  { name: 'Wooden Camera A-Box', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 450, status: 'active' },
  { name: 'ARRI Bridge Plate', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 680, status: 'active' },
  { name: 'ARRI Wireless Video Transmitter', category: 'wireless_systems', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3200, status: 'active' },
  { name: 'Teradek Bolt 4K RX', category: 'wireless_systems', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2800, status: 'active' },
  { name: 'SmallHD Cine 7 Monitor', category: 'dit_video_village', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1600, status: 'active' },
  { name: 'ARRI Camera Cage', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 890, status: 'active' },
  { name: 'ARRI Follow Focus Unit', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 4200, status: 'active' },
  { name: 'Tilta Wireless FIZ System', category: 'wireless_systems', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3800, status: 'active' },
  { name: 'ARRI Hi-5 Wireless Hand Unit', category: 'wireless_systems', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2100, status: 'active' },
  { name: '256GB CFast Card', category: 'consumables', department: 'Camera', source_type: 'purchased', quantity: 4, replacement_value: 1200, status: 'active', notes: 'Media' },
  { name: 'CFast Card Reader', category: 'camera_accessories', department: 'Camera', source_type: 'owned', replacement_value: 180, status: 'active' },
  { name: 'V-Lock Battery', category: 'camera_accessories', department: 'Camera', source_type: 'rented', quantity: 4, vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2400, status: 'active' },
  { name: 'Quad Battery Charger', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 450, status: 'active' },
  { name: 'OConnor 2575 Tripod System', category: 'camera_support', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 18500, status: 'active' },
  { name: 'Sachtler Flowtech 100 Tripod', category: 'camera_support', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 4200, status: 'active' },
  { name: 'Dana Dolly Kit', category: 'grip', department: 'Camera', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3200, status: 'active' },
  { name: 'Slider Kit', category: 'grip', department: 'Camera', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  // ----- Lenses (Cooke S4/i + zooms) -----
  { name: 'Cooke S4/i 18mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Cooke S4/i 25mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Cooke S4/i 32mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Cooke S4/i 40mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Cooke S4/i 50mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Cooke S4/i 75mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Cooke S4/i 100mm T2', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 22000, status: 'active' },
  { name: 'Angenieux Optimo 24-290', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 2, rentalStartOffset: 7, returnDueOffset: 21, replacement_value: 95000, status: 'active' },
  { name: 'Angenieux Optimo 45-120', category: 'lenses', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 2, rentalStartOffset: 7, returnDueOffset: 21, replacement_value: 42000, status: 'active' },
  // ----- Camera accessories (filters, matte box, etc.) -----
  { name: 'ARRI Cine Tape Measure', category: 'camera_accessories', department: 'Camera', source_type: 'owned', replacement_value: 1200, status: 'active' },
  { name: 'ARRI LDS Lens Encoder', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  { name: 'Camera Matte Box (ARRI LMB-25)', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2400, status: 'active' },
  { name: '4×5.65 Filter Set', category: 'camera_accessories', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3200, status: 'active' },
  { name: 'ND Filter Set', category: 'camera_accessories', department: 'Camera', source_type: 'purchased', replacement_value: 850, status: 'active' },
  { name: 'Polarizer Filter', category: 'camera_accessories', department: 'Camera', source_type: 'owned', replacement_value: 420, status: 'active' },
  { name: 'Camera Rain Cover', category: 'camera_accessories', department: 'Camera', source_type: 'owned', replacement_value: 180, status: 'active' },
  { name: 'Lens Support Bracket', category: 'camera_accessories', department: 'Camera', source_type: 'rented', quantity: 2, vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 380, status: 'active' },
  { name: 'Focus Chart Kit', category: 'camera_accessories', department: 'Camera', source_type: 'owned', replacement_value: 120, status: 'active' },
  { name: 'Color Checker Chart', category: 'camera_accessories', department: 'Camera', source_type: 'owned', replacement_value: 95, status: 'active' },
  // ----- Lighting -----
  { name: 'ARRI SkyPanel S60', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3200, status: 'active' },
  { name: 'ARRI SkyPanel S120', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 4800, status: 'active' },
  { name: 'Aputure 600D Pro', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  { name: 'Aputure 300X', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 950, status: 'active' },
  { name: 'Astera Titan Tube', category: 'lighting', department: 'Lighting', source_type: 'rented', quantity: 8, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 4200, status: 'active' },
  { name: 'LiteMat 4', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 680, status: 'active' },
  { name: 'Dedolight DLH4 Kit', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2400, status: 'active' },
  { name: 'ARRI 650W Fresnel', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1200, status: 'active' },
  { name: 'ARRI 2K Fresnel', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  { name: 'ARRI Orbiter LED Fixture', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 5200, status: 'active' },
  { name: 'ARRI L7-C LED Fresnel', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2800, status: 'active' },
  { name: 'ARRI L10-C LED Fresnel', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3500, status: 'active' },
  { name: 'Nanlux Evoke 2400B', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 4200, status: 'active' },
  { name: 'Creamsource Vortex8 Panel', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 3800, status: 'active' },
  { name: 'Litepanels Gemini 2x1', category: 'lighting', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1600, status: 'active' },
  { name: 'Astera Helios Tube', category: 'lighting', department: 'Lighting', source_type: 'rented', quantity: 8, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 2800, status: 'active' },
  { name: 'Quasar Science Rainbow Tube', category: 'lighting', department: 'Lighting', source_type: 'rented', quantity: 4, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1200, status: 'active' },
  { name: 'Nanlite Pavotube II 30C', category: 'lighting', department: 'Lighting', source_type: 'purchased', quantity: 4, replacement_value: 650, status: 'active' },
  { name: 'Lantern Softbox 90cm', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 420, status: 'active' },
  { name: 'Aputure Light Dome II', category: 'lighting_accessories', department: 'Lighting', source_type: 'purchased', quantity: 2, replacement_value: 280, status: 'active' },
  { name: 'Aputure Fresnel 2X', category: 'lighting_accessories', department: 'Lighting', source_type: 'purchased', quantity: 2, replacement_value: 180, status: 'active' },
  { name: 'Light Grid Kit', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 380, status: 'active' },
  { name: 'Eggcrate Grid Kit', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 220, status: 'active' },
  { name: 'C-Stand', category: 'grip', department: 'Lighting', source_type: 'rented', quantity: 8, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 180, status: 'active' },
  { name: 'Junior Stand', category: 'grip', department: 'Lighting', source_type: 'rented', quantity: 4, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 120, status: 'active' },
  { name: 'Combo Stand', category: 'grip', department: 'Lighting', source_type: 'rented', quantity: 4, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 95, status: 'active' },
  { name: 'Sandbags', category: 'grip', department: 'Lighting', source_type: 'rented', quantity: 12, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 45, status: 'active' },
  { name: 'Flags and Nets Kit', category: 'grip', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 520, status: 'active' },
  { name: 'Diffusion Frames', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', quantity: 4, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 680, status: 'active' },
  { name: 'Softboxes', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', quantity: 3, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 380, status: 'active' },
  { name: 'Junior Boom Arm', category: 'grip', department: 'Lighting', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 420, status: 'active' },
  { name: 'Mega Boom Arm', category: 'grip', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 1200, status: 'active' },
  { name: 'DMX Control Desk', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2800, status: 'active' },
  { name: 'DMX Wireless Transmitter', category: 'lighting_accessories', department: 'Lighting', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 650, status: 'active' },
  // ----- Power -----
  { name: 'Power Distro Box 63A', category: 'power_distribution', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2200, status: 'active' },
  { name: 'Power Distro Box 32A', category: 'power_distribution', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1200, status: 'active' },
  { name: 'Socapex Cable Set', category: 'power_distribution', department: 'Lighting', source_type: 'rented', quantity: 6, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  { name: 'Extension Cable Kit', category: 'power_distribution', department: 'Lighting', source_type: 'owned', quantity: 8, replacement_value: 420, status: 'active' },
  { name: 'Cable Ramp Kit', category: 'grip', department: 'Lighting', source_type: 'rented', quantity: 4, vendorKey: 'Lumen Grip & Light', invoiceIdx: 3, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 380, status: 'active' },
  { name: 'Generator (Towable Film Generator)', category: 'power_distribution', department: 'Lighting', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 8500, status: 'active' },
  // ----- Grip -----
  { name: 'Apple Boxes Full', category: 'grip', department: 'Grip', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 280, status: 'active' },
  { name: 'Apple Boxes Half', category: 'grip', department: 'Grip', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 180, status: 'active' },
  { name: 'Apple Boxes Quarter', category: 'grip', department: 'Grip', source_type: 'rented', quantity: 2, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 120, status: 'active' },
  { name: 'Hi-Hat', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 420, status: 'active' },
  { name: 'Low-Hat', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 380, status: 'active' },
  { name: 'Speed Rail Kit', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 1200, status: 'active' },
  { name: 'Matthews Slider', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 1800, status: 'active' },
  { name: 'Dana Dolly Track', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 2400, status: 'active' },
  { name: 'Camera Crane', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 12000, status: 'active' },
  { name: 'Remote Head', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 8500, status: 'active' },
  { name: 'Camera Slider 1.2m', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 950, status: 'active' },
  { name: 'Camera Slider 2m', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 1200, status: 'active' },
  { name: 'Skateboard Dolly', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 2800, status: 'active' },
  { name: 'Doorway Dolly', category: 'grip', department: 'Grip', source_type: 'rented', vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 1800, status: 'active' },
  { name: 'Grip Head Kit', category: 'grip', department: 'Grip', source_type: 'rented', quantity: 8, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 680, status: 'active' },
  { name: 'Cardellini Clamp Kit', category: 'grip', department: 'Grip', source_type: 'rented', quantity: 6, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 420, status: 'active' },
  { name: 'Suction Mount Rig', category: 'grip', department: 'Grip', source_type: 'rented', quantity: 4, vendorKey: 'Lumen Grip & Light', invoiceIdx: 4, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 3200, status: 'active' },
  // ----- Sound -----
  { name: 'Sound Devices 888 Recorder', category: 'sound', department: 'Sound', source_type: 'rented', vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 8500, status: 'active', notes: 'No invoice in demo; vendor linked' },
  { name: 'Sound Devices MixPre-10', category: 'sound', department: 'Sound', source_type: 'owned', replacement_value: 2200, status: 'active' },
  { name: 'Boom Pole Carbon', category: 'sound', department: 'Sound', source_type: 'rented', vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 680, status: 'active' },
  { name: 'Sennheiser MKH416 Shotgun Mic', category: 'sound', department: 'Sound', source_type: 'rented', vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 950, status: 'active' },
  { name: 'Sanken COS-11 Lavalier', category: 'sound', department: 'Sound', source_type: 'rented', quantity: 4, vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1200, status: 'active' },
  { name: 'Lectrosonics Wireless Channel', category: 'sound', department: 'Sound', source_type: 'rented', quantity: 4, vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 4200, status: 'active' },
  { name: 'Tentacle Sync Timecode Kit', category: 'sound', department: 'Sound', source_type: 'purchased', replacement_value: 580, status: 'active' },
  { name: 'IFB Monitor System', category: 'sound', department: 'Sound', source_type: 'rented', quantity: 4, vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1800, status: 'active' },
  { name: 'IFB Transmitter System', category: 'sound', department: 'Sound', source_type: 'rented', quantity: 1, vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2200, status: 'active' },
  { name: 'Timecode Slate', category: 'sound', department: 'Sound', source_type: 'owned', replacement_value: 1200, status: 'active' },
  { name: 'Windshield Blimp Kit', category: 'sound', department: 'Sound', source_type: 'rented', quantity: 2, vendorKey: 'Signal Sound Services', rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 380, status: 'active' },
  { name: 'Audio Cable Kit', category: 'sound', department: 'Sound', source_type: 'purchased', quantity: 1, replacement_value: 220, status: 'active' },
  // ----- DIT / Video -----
  { name: 'DIT Cart', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 2800, status: 'active' },
  { name: 'MacBook Pro DIT Workstation', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 3200, status: 'active' },
  { name: 'DIT RAID Storage', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 4200, status: 'active' },
  { name: 'Teradek Serv Pro', category: 'dit_video_village', department: 'Camera', source_type: 'rented', vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 2800, status: 'active' },
  { name: 'SmallHD Production Monitor', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 1800, status: 'active' },
  { name: 'Wireless Video Receiver', category: 'wireless_systems', department: 'Camera', source_type: 'rented', quantity: 4, vendorKey: 'Panavision London', invoiceIdx: 1, rentalStartOffset: 0, returnDueOffset: 14, replacement_value: 1200, status: 'active' },
  { name: 'Video Router', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 950, status: 'active' },
  { name: 'DIT Backup RAID Array', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 2800, status: 'active' },
  { name: 'DIT UPS Battery Backup', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 420, status: 'active' },
  { name: 'Color Calibration Probe', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 1200, status: 'active' },
  { name: 'Video Assist Monitor', category: 'dit_video_village', department: 'Camera', source_type: 'owned', replacement_value: 650, status: 'active' },
  { name: 'Director Monitor 24"', category: 'dit_video_village', department: 'Camera', source_type: 'owned', quantity: 2, replacement_value: 480, status: 'active' },
  // ----- Production / logistics -----
  { name: 'Motorola DP4400 Walkie Talkie', category: 'production_logistics', department: 'Production', source_type: 'purchased', quantity: 10, replacement_value: 1200, status: 'active' },
  { name: 'Walkie Headsets', category: 'production_logistics', department: 'Production', source_type: 'purchased', quantity: 10, replacement_value: 380, status: 'active' },
  { name: 'Base Station Radio', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 420, status: 'active' },
  { name: 'Production Van', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 32000, status: 'active' },
  { name: 'Crew Van', category: 'production_logistics', department: 'Production', source_type: 'rented', vendorKey: 'Keystone Transport', invoiceIdx: 15, rentalStartOffset: 8, returnDueOffset: 22, replacement_value: 28000, status: 'active' },
  { name: 'Pop-Up Tent', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 450, status: 'active' },
  { name: 'Craft Table Kit', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 280, status: 'active' },
  { name: 'Location Lighting Kit', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 380, status: 'active' },
  { name: 'Walkie Talkie Charging Station', category: 'production_logistics', department: 'Production', source_type: 'purchased', replacement_value: 180, status: 'active' },
  { name: 'Camera Cart', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 650, status: 'active' },
  { name: 'Magliner Equipment Cart', category: 'production_logistics', department: 'Production', source_type: 'owned', replacement_value: 420, status: 'active' },
  { name: 'Pelican Equipment Case', category: 'storage_cases', department: 'Production', source_type: 'purchased', quantity: 6, replacement_value: 850, status: 'active' },
]

function isReminderEligible(def: DemoEquipmentDef): boolean {
  return (
    def.source_type === 'rented' &&
    def.returnDueOffset != null &&
    def.status !== 'returned'
  )
}

type DemoListItemDef = {
  equipmentIndex: number
  quantity?: number
  checked_out?: 0 | 1
  checked_back_in?: 0 | 1
}

type DemoListDef = {
  name: string
  shootDayIdx?: number
  department?: string | null
  notes?: string | null
  items: DemoListItemDef[]
}

const DEMO_LISTS: DemoListDef[] = [
  {
    name: 'Camera Package – Shoot Day 1',
    shootDayIdx: 1,
    department: 'Camera',
    notes: 'Main unit camera package',
    items: [
      { equipmentIndex: 0, checked_out: 1, checked_back_in: 0 },   // Alexa Mini OUT
      { equipmentIndex: 1 },   { equipmentIndex: 2 },   { equipmentIndex: 3 },   { equipmentIndex: 4 },   { equipmentIndex: 5 },   { equipmentIndex: 6 },   { equipmentIndex: 7 },   { equipmentIndex: 8 },   { equipmentIndex: 9 },
      { equipmentIndex: 10 },  { equipmentIndex: 11 },  { equipmentIndex: 12 },  { equipmentIndex: 13 },  { equipmentIndex: 14 },  { equipmentIndex: 15 },
      { equipmentIndex: 16, quantity: 2 },  { equipmentIndex: 17 },  { equipmentIndex: 18, quantity: 3, checked_out: 1, checked_back_in: 0 },  { equipmentIndex: 19 },  // V-Lock OUT
      { equipmentIndex: 20 },  { equipmentIndex: 21 },  { equipmentIndex: 22 },  { equipmentIndex: 23 },
      { equipmentIndex: 24 },  { equipmentIndex: 25, checked_out: 1, checked_back_in: 1 },  { equipmentIndex: 26 },  { equipmentIndex: 27 },  { equipmentIndex: 28, checked_out: 1, checked_back_in: 1 },  { equipmentIndex: 29 },  { equipmentIndex: 30 },  { equipmentIndex: 31 },  { equipmentIndex: 32 },
      { equipmentIndex: 36 },  { equipmentIndex: 37 },
    ],
  },
  {
    name: 'Lighting Package – Night Exterior',
    shootDayIdx: 3,
    department: 'Lighting',
    notes: 'Night exterior lighting package',
    items: [
      { equipmentIndex: 41 },  { equipmentIndex: 42 },  { equipmentIndex: 43 },  { equipmentIndex: 44 },  { equipmentIndex: 45 },  { equipmentIndex: 46 },  { equipmentIndex: 47, quantity: 6 },  { equipmentIndex: 48 },  { equipmentIndex: 49 },
      { equipmentIndex: 50 },  { equipmentIndex: 51 },  { equipmentIndex: 52 },  { equipmentIndex: 53 },  { equipmentIndex: 54 },  { equipmentIndex: 55 },  { equipmentIndex: 56 },  { equipmentIndex: 57 },
      { equipmentIndex: 58 },  { equipmentIndex: 59, quantity: 6 },  { equipmentIndex: 60 },  { equipmentIndex: 61 },  { equipmentIndex: 62 },  { equipmentIndex: 63 },  { equipmentIndex: 64 },  { equipmentIndex: 65 },
      { equipmentIndex: 66 },  { equipmentIndex: 67 },  { equipmentIndex: 68 },  { equipmentIndex: 69 },  { equipmentIndex: 70 },  { equipmentIndex: 71 },  { equipmentIndex: 72 },  { equipmentIndex: 73 },
      { equipmentIndex: 74 },  { equipmentIndex: 75 },  { equipmentIndex: 76 },  { equipmentIndex: 77 },
    ],
  },
  {
    name: 'Grip Package – Car Rig Day',
    shootDayIdx: 5,
    department: 'Grip',
    notes: 'Car rig and movement',
    items: [
      { equipmentIndex: 22 },  { equipmentIndex: 23 },  { equipmentIndex: 78 },  { equipmentIndex: 79 },  { equipmentIndex: 80 },  { equipmentIndex: 81 },  { equipmentIndex: 82 },
      { equipmentIndex: 83 },  { equipmentIndex: 84 },  { equipmentIndex: 85 },  { equipmentIndex: 86 },  { equipmentIndex: 87 },  { equipmentIndex: 88 },  { equipmentIndex: 89 },
      { equipmentIndex: 90 },  { equipmentIndex: 91 },  { equipmentIndex: 92 },  { equipmentIndex: 93 },  { equipmentIndex: 94 },  { equipmentIndex: 95 },  { equipmentIndex: 96 },  { equipmentIndex: 97, quantity: 10 },
    ],
  },
  {
    name: 'Sound Kit – Unit Package',
    shootDayIdx: 1,
    department: 'Sound',
    notes: 'Main unit sound package',
    items: [
      { equipmentIndex: 98 },  { equipmentIndex: 99 },  { equipmentIndex: 100 },  { equipmentIndex: 101 },  { equipmentIndex: 102 },  { equipmentIndex: 103 },  { equipmentIndex: 104, quantity: 5 },
      { equipmentIndex: 105 },  { equipmentIndex: 106 },  { equipmentIndex: 107 },  { equipmentIndex: 108 },  { equipmentIndex: 109 },  { equipmentIndex: 110 },
    ],
  },
  {
    name: 'DIT Cart – Main Unit',
    shootDayIdx: 1,
    department: 'Camera',
    notes: 'DIT and video village',
    items: [
      { equipmentIndex: 111 },  { equipmentIndex: 112 },  { equipmentIndex: 113 },  { equipmentIndex: 114 },  { equipmentIndex: 115 },  { equipmentIndex: 116 },  { equipmentIndex: 117 },
      { equipmentIndex: 118 },  { equipmentIndex: 119 },  { equipmentIndex: 120 },  { equipmentIndex: 121 },  { equipmentIndex: 122 },
    ],
  },
]

/**
 * Seed equipment registry, return reminder tasks, equipment lists, and list items.
 * Only for singleton demo production. Requires seedDemoVendors and seedDemoVendorFinance.
 */
export async function seedDemoEquipment(
  productionId: string,
  startDate: string,
  ts: string,
  addDaysLocal: (yyyyMmDd: string, days: number) => string,
  vendorIdByCompanyName: Record<string, string>,
  ids: DemoEquipmentSeedIdSource = IDS
): Promise<void> {
  const db = await getDb()
  let reminderTaskIdx = 0

  await runInSerializedTransaction(async () => {
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (let i = 0; i < DEMO_EQUIPMENT.length; i++) {
      const def = DEMO_EQUIPMENT[i]!
      const id = ids.equipment(i + 1)
      const itemUuid = ids.equipmentItemUuid(i + 1)
      const vendorId = def.vendorKey ? vendorIdByCompanyName[def.vendorKey] ?? null : null
      const invoiceId = def.invoiceIdx != null ? ids.vendorInvoice(def.invoiceIdx) : null
      const rentalStart = def.rentalStartOffset != null ? addDaysLocal(startDate, def.rentalStartOffset) : null
      const returnDue = def.returnDueOffset != null ? addDaysLocal(startDate, def.returnDueOffset) : null

      const data: CreateEquipmentData = {
        production_id: productionId,
        name: def.name,
        quantity: def.quantity ?? 1,
        source_type: def.source_type,
        category: def.category,
        status: def.status,
        department: def.department,
        vendor_id: vendorId ?? undefined,
        invoice_id: invoiceId ?? undefined,
        vendor: null,
        rental_start_date: rentalStart ?? undefined,
        return_due_date: returnDue ?? undefined,
        replacement_value: def.replacement_value,
        notes: def.notes ?? undefined,
        serial_number: def.serial_number ?? undefined,
      }

      statements.push(...buildCreateEquipmentStatements(id, itemUuid, ts, data))

      if (isReminderEligible(def) && returnDue) {
        const taskId = ids.equipmentReminderTask(reminderTaskIdx + 1)
        reminderTaskIdx++
        const taskDept = taskDepartment(def.department)
        const taskStatements = buildCreateTaskStatements(
          taskId,
          {
            production_id: productionId,
            description: reminderDescription(def.name),
            due_date: returnDue,
            assigned_department: taskDept,
            equipment_id: id,
            is_complete: 0,
            notes: [
              `UUID: ${itemUuid}`,
              vendorId ? '(vendor linked)' : null,
              rentalStart && returnDue ? `Rental: ${rentalStart} → ${returnDue}` : null,
            ].filter(Boolean).join(' · ') || null,
          },
          ts
        )
        statements.push(...taskStatements)
      }
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })

  // Equipment lists and list items (no outbox for demo)
  const shootDayIds = new Map<number, string>()
  for (let d = 1; d <= 12; d++) {
    shootDayIds.set(d, ids.shootDay(d))
  }

  for (let listIdx = 0; listIdx < DEMO_LISTS.length; listIdx++) {
    const listDef = DEMO_LISTS[listIdx]!
    const listId = ids.equipmentList(listIdx + 1)
    const shootDayId = listDef.shootDayIdx != null ? shootDayIds.get(listDef.shootDayIdx) ?? null : null

    await db.execute(
      `INSERT INTO ${LISTS_TABLE} (id, production_id, shoot_day_id, name, department, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        listId,
        productionId,
        shootDayId,
        listDef.name,
        listDef.department ?? null,
        listDef.notes ?? null,
        ts,
        ts,
      ]
    )

    for (let itemIdx = 0; itemIdx < listDef.items.length; itemIdx++) {
      const listItemDef = listDef.items[itemIdx]!
      const equipmentId = ids.equipment(listItemDef.equipmentIndex + 1)
      const listItemId = ids.equipmentListItem(
        listIdx * 200 + itemIdx + 1
      )
      const listItemQty = listItemDef.quantity ?? 1
      await db.execute(
        `INSERT INTO ${ITEMS_TABLE} (id, equipment_list_id, equipment_id, sort_order, quantity, checked_out, checked_back_in, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          listItemId,
          listId,
          equipmentId,
          itemIdx,
          listItemQty,
          listItemDef.checked_out ?? 0,
          listItemDef.checked_back_in ?? 0,
          null,
          ts,
          ts,
        ]
      )
    }
  }
}
