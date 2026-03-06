import type { Vendor } from '@/lib/db/types'

type ExpenseVendorSummaryProps = {
  vendor: Vendor | null
  legacyVendorString: string | null
}

export function ExpenseVendorSummary({ vendor, legacyVendorString }: ExpenseVendorSummaryProps) {
  if (vendor) {
    return (
      <div className="text-sm space-y-1">
        <p className="font-medium">{vendor.company_name}</p>
        {vendor.primary_contact_full_name && (
          <p className="text-muted-foreground">{vendor.primary_contact_full_name}</p>
        )}
        {vendor.primary_contact_email && (
          <p className="text-muted-foreground">{vendor.primary_contact_email}</p>
        )}
      </div>
    )
  }
  if (legacyVendorString) {
    return <p className="text-sm">{legacyVendorString}</p>
  }
  return <p className="text-sm text-muted-foreground">—</p>
}
