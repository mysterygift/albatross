import {
  Building2,
  Clapperboard,
  FileText,
  Film,
  MapPin,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { GlobalSearchResultType } from '@/features/search/types'

/** Icon shown per result type (matches the app sidebar where applicable). */
export const SECTION_ICON: Record<GlobalSearchResultType, LucideIcon> = {
  cast: Users,
  crew: Users,
  scene: Clapperboard,
  location: MapPin,
  equipment: Film,
  document: FileText,
  vendor: Building2,
  purchase_order: Receipt,
}

/** Short badge label naming the source section of a result. */
export const SECTION_BADGE: Record<GlobalSearchResultType, string> = {
  cast: 'Cast',
  crew: 'Crew',
  scene: 'Scene',
  location: 'Location',
  equipment: 'Equipment',
  document: 'Document',
  vendor: 'Vendor',
  purchase_order: 'Purchase Order',
}
