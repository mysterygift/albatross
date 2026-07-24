import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { listCast, listCrew } from '@/lib/db/repositories/person'
import { listScenesByProduction } from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listEquipmentByProduction } from '@/lib/db/repositories/equipment'
import { listVendorPurchaseOrdersByProduction } from '@/lib/db/repositories/vendorPurchaseOrders'
import { listVendors } from '@/lib/db/repositories/vendors'
import { useEnrichedDocuments } from '@/features/documents/useEnrichedDocuments'
import { getDocumentCategoryId } from '@/lib/documents/catalog'
import type { GlobalSearchResult } from '@/features/search/types'

function joinSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

/**
 * Assembles the global search index for the current production from existing
 * repositories/hooks. Query keys mirror the rest of the app so results share
 * cache and are typically already warm from normal navigation.
 */
export function useGlobalSearchIndex(
  productionId: string | null | undefined,
  options?: { enabled?: boolean }
): { results: GlobalSearchResult[]; isLoading: boolean } {
  const enabled = !!productionId && (options?.enabled ?? true)

  const castQuery = useQuery({
    queryKey: ['cast', productionId],
    queryFn: () => listCast(productionId ?? ''),
    enabled,
  })
  const crewQuery = useQuery({
    queryKey: ['crew', productionId],
    queryFn: () => listCrew(productionId ?? ''),
    enabled,
  })
  const scenesQuery = useQuery({
    queryKey: ['scenes', productionId],
    queryFn: () => listScenesByProduction(productionId ?? ''),
    enabled,
  })
  const locationsQuery = useQuery({
    queryKey: ['locations', productionId],
    queryFn: () => listLocationsByProduction(productionId ?? ''),
    enabled,
  })
  const posQuery = useQuery({
    queryKey: ['vendor-purchase-orders-all', productionId],
    queryFn: () => listVendorPurchaseOrdersByProduction(productionId ?? ''),
    enabled,
  })
  const equipmentQuery = useQuery({
    queryKey: ['equipment', productionId],
    queryFn: () => listEquipmentByProduction(productionId ?? ''),
    enabled,
  })
  const vendorsQuery = useQuery({
    queryKey: ['vendors', productionId],
    queryFn: () => listVendors(productionId ?? ''),
    enabled,
  })

  const { documents, isLoading: documentsLoading } = useEnrichedDocuments(
    enabled ? productionId : null
  )

  const results = useMemo<GlobalSearchResult[]>(() => {
    const out: GlobalSearchResult[] = []

    // Cast
    for (const person of castQuery.data ?? []) {
      out.push({
        id: person.id,
        type: 'cast',
        title: person.name,
        subtitle: person.role_name ?? null,
        searchText: joinSearchText([
          person.name,
          person.role_name,
          person.cast_number,
          person.agent_name,
        ]),
        to: `/people/${person.id}`,
      })
    }

    // Crew
    for (const person of crewQuery.data ?? []) {
      const subtitle = [person.department, person.role_name]
        .filter((v): v is string => !!v)
        .join(' · ')
      out.push({
        id: person.id,
        type: 'crew',
        title: person.name,
        subtitle: subtitle || null,
        searchText: joinSearchText([
          person.name,
          person.department,
          person.role_name,
          person.email,
          person.phone,
        ]),
        to: `/people/crew/${person.id}`,
      })
    }

    // Locations (also used to enrich scene subtitles)
    const locations = locationsQuery.data ?? []
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]))
    for (const location of locations) {
      out.push({
        id: location.id,
        type: 'location',
        title: location.name,
        subtitle: location.address ?? location.booked_status,
        searchText: joinSearchText([
          location.name,
          location.address,
          location.booked_status,
        ]),
        to: `/locations?highlight=${location.id}`,
      })
    }

    // Scenes
    for (const scene of scenesQuery.data ?? []) {
      const locationName = scene.location_id
        ? locationNameById.get(scene.location_id) ?? null
        : null
      const titlePart = scene.title ?? scene.description ?? null
      const title = titlePart
        ? `Scene ${scene.scene_number} — ${titlePart}`
        : `Scene ${scene.scene_number}`
      const subtitle =
        [scene.int_ext, locationName ?? 'No location', scene.day_night]
          .filter((v): v is string => !!v)
          .join(' · ') || null
      out.push({
        id: scene.id,
        type: 'scene',
        title,
        subtitle,
        searchText: joinSearchText([
          `scene ${scene.scene_number}`,
          scene.scene_number,
          scene.title,
          scene.description,
          scene.int_ext,
          scene.day_night,
          locationName,
        ]),
        to: `/schedule/shots?highlight=${scene.id}`,
      })
    }

    // Equipment
    for (const item of equipmentQuery.data ?? []) {
      out.push({
        id: item.id,
        type: 'equipment',
        title: item.name,
        subtitle:
          [item.category, item.department, item.status]
            .filter((v): v is string => !!v)
            .join(' · ') || null,
        searchText: joinSearchText([
          item.name,
          item.category,
          item.department,
          item.vendor,
          item.notes,
        ]),
        to: `/equipment?highlight=${item.id}`,
      })
    }

    // Documents
    for (const doc of documents) {
      const categoryId = getDocumentCategoryId(doc.entity_type)
      out.push({
        id: doc.id,
        type: 'document',
        title: doc.file_name,
        subtitle:
          [doc.typeLabel, doc.contextLabel]
            .filter((v): v is string => !!v)
            .join(' · ') || null,
        searchText: joinSearchText([
          doc.file_name,
          doc.typeLabel,
          doc.contextLabel,
          doc.groupTitle,
        ]),
        to: `/documents/${categoryId}?highlight=${doc.id}`,
      })
    }

    // Vendors
    const vendors = vendorsQuery.data ?? []
    for (const vendor of vendors) {
      out.push({
        id: vendor.id,
        type: 'vendor',
        title: vendor.company_name,
        subtitle:
          [vendor.primary_contact_full_name, vendor.primary_contact_email]
            .filter((v): v is string => !!v)
            .join(' · ') || null,
        searchText: joinSearchText([
          vendor.company_name,
          vendor.primary_contact_full_name,
          vendor.primary_contact_email,
        ]),
        to: `/budget/vendors/${vendor.id}`,
      })
    }

    // Purchase orders
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.company_name]))
    for (const po of posQuery.data ?? []) {
      const vendorName = vendorNameById.get(po.vendor_id) ?? null
      out.push({
        id: po.id,
        type: 'purchase_order',
        title: po.po_number,
        subtitle:
          [vendorName, po.status]
            .filter((v): v is string => !!v)
            .join(' · ') || null,
        searchText: joinSearchText([
          po.po_number,
          po.description,
          po.status,
          vendorName,
        ]),
        to: `/budget/vendors/${po.vendor_id}?highlight=${po.id}`,
      })
    }

    return out
  }, [
    castQuery.data,
    crewQuery.data,
    scenesQuery.data,
    locationsQuery.data,
    posQuery.data,
    vendorsQuery.data,
    equipmentQuery.data,
    documents,
  ])

  const isLoading =
    enabled &&
    (castQuery.isLoading ||
      crewQuery.isLoading ||
      scenesQuery.isLoading ||
      locationsQuery.isLoading ||
      posQuery.isLoading ||
      vendorsQuery.isLoading ||
      equipmentQuery.isLoading ||
      documentsLoading)

  return { results, isLoading }
}
