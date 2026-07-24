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
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import type { GlobalSearchResult, PreviewField } from '@/features/search/types'

function joinSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

/** Builds a preview field list, dropping any entries with empty values. */
function previewFields(
  entries: Array<{ label: string; value: string | number | null | undefined }>
): PreviewField[] {
  const out: PreviewField[] = []
  for (const { label, value } of entries) {
    if (value == null) continue
    const str = String(value).trim()
    if (str.length === 0) continue
    out.push({ label, value: str })
  }
  return out
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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

  const { currentProduction } = useCurrentProduction()
  const { format } = useCurrency()
  const currencyCode = currentProduction?.currency_code ?? 'GBP'
  const money = (amount: number | null | undefined): string | null =>
    amount == null ? null : format(amount, currencyCode).formatted

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
        preview: {
          heading: person.name,
          subheading: person.role_name ?? null,
          fields: previewFields([
            { label: 'Role / character', value: person.role_name },
            { label: 'Cast number', value: person.cast_number },
            { label: 'Agent', value: person.agent_name },
            { label: 'Email', value: person.email },
            { label: 'Phone', value: person.phone },
            { label: 'Contributor form', value: person.contributor_form_status },
          ]),
        },
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
        preview: {
          heading: person.name,
          subheading: subtitle || null,
          fields: previewFields([
            { label: 'Department', value: person.department },
            { label: 'Role', value: person.role_name },
            { label: 'Email', value: person.email },
            { label: 'Phone', value: person.phone },
            { label: 'Contributor form', value: person.contributor_form_status },
          ]),
        },
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
        preview: {
          heading: location.name,
          subheading: location.booked_status,
          fields: previewFields([
            { label: 'Status', value: location.booked_status },
            { label: 'Address', value: location.address },
            { label: 'what3words', value: location.what3words },
            { label: 'Parking', value: location.parking_info },
            { label: 'Permit fee', value: money(location.permit_fee) },
            { label: 'Location fee', value: money(location.location_fee) },
            { label: 'Availability', value: location.availability_constraints },
          ]),
        },
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
        preview: {
          heading: `Scene ${scene.scene_number}`,
          subheading: scene.title ?? scene.description ?? null,
          fields: previewFields([
            { label: 'Scene number', value: scene.scene_number },
            { label: 'Int / Ext', value: scene.int_ext },
            { label: 'Day / Night', value: scene.day_night },
            { label: 'Location', value: locationName },
            { label: 'Page eighths', value: scene.page_eighths },
            {
              label: 'Duration',
              value: scene.duration_minutes != null ? `${scene.duration_minutes} min` : null,
            },
          ]),
        },
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
        preview: {
          heading: item.name,
          subheading: item.category ?? null,
          fields: previewFields([
            { label: 'Category', value: item.category },
            { label: 'Status', value: item.status },
            { label: 'Department', value: item.department },
            { label: 'Quantity', value: item.quantity },
            { label: 'Source', value: item.source_type },
            { label: 'Vendor', value: item.vendor },
            { label: 'Rental start', value: formatDate(item.rental_start_date) },
            { label: 'Return due', value: formatDate(item.return_due_date) },
            { label: 'Notes', value: item.notes },
          ]),
        },
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
        preview: {
          heading: doc.file_name,
          subheading: doc.typeLabel ?? null,
          fields: previewFields([
            { label: 'Type', value: doc.typeLabel },
            { label: 'Context', value: doc.contextLabel },
            { label: 'Group', value: doc.groupTitle },
            { label: 'Added', value: formatDate(doc.created_at) },
            { label: 'File name', value: doc.file_name },
          ]),
        },
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
        preview: {
          heading: vendor.company_name,
          subheading: vendor.primary_contact_full_name ?? null,
          fields: previewFields([
            { label: 'Contact', value: vendor.primary_contact_full_name },
            { label: 'Email', value: vendor.primary_contact_email },
            { label: 'Global vendor', value: vendor.is_global ? 'Yes' : 'No' },
          ]),
        },
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
        preview: {
          heading: po.po_number,
          subheading: vendorName,
          fields: previewFields([
            { label: 'PO number', value: po.po_number },
            { label: 'Vendor', value: vendorName },
            { label: 'Status', value: po.status },
            { label: 'Amount', value: money(po.amount) },
            { label: 'Issue date', value: formatDate(po.issue_date) },
            { label: 'Due date', value: formatDate(po.due_date) },
            { label: 'Approval', value: po.approval === 1 ? 'Approved' : 'Not approved' },
            { label: 'Description', value: po.description },
          ]),
        },
      })
    }

    return out
    // `money` is derived from `format`/`currencyCode`; depend on those instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    castQuery.data,
    crewQuery.data,
    scenesQuery.data,
    locationsQuery.data,
    posQuery.data,
    vendorsQuery.data,
    equipmentQuery.data,
    documents,
    format,
    currencyCode,
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
