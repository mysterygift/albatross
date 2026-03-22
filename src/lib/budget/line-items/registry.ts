import type { LineItemType } from '@/lib/db/types'
import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react'
import {
  parseLabourLineItemDetails,
  labourLineItemDetailsToJson,
  type LabourLineItemDetails,
} from '@/lib/budget/line-items/labour'
import {
  parsePurchaseLineItemDetails,
  purchaseLineItemDetailsToJson,
  type PurchaseLineItemDetails,
} from '@/lib/budget/line-items/purchase'
import {
  parseRentalLineItemDetails,
  rentalLineItemDetailsToJson,
  type RentalLineItemDetails,
} from '@/lib/budget/line-items/rental'
import {
  parseAllowLineItemDetails,
  allowLineItemDetailsToJson,
  type AllowLineItemDetails,
} from '@/lib/budget/line-items/allow'
import {
  parseDepositLineItemDetails,
  depositLineItemDetailsToJson,
  type DepositLineItemDetails,
} from '@/lib/budget/line-items/deposit'
import { saveBudgetItemDetails } from '@/lib/db/repositories/budgetItemDetails'
import type {
  LineItemEditProps,
  LineItemEditorRef,
  LineItemReadProps,
} from '@/features/budget/line-item-views/types'
import { LabourLineItemRead } from '@/features/budget/line-item-views/LabourLineItemRead'
import { PurchaseLineItemRead } from '@/features/budget/line-item-views/PurchaseLineItemRead'
import { RentalLineItemRead } from '@/features/budget/line-item-views/RentalLineItemRead'
import { AllowLineItemRead } from '@/features/budget/line-item-views/AllowLineItemRead'
import { DepositLineItemRead } from '@/features/budget/line-item-views/DepositLineItemRead'
import { LabourLineItemEditor } from '@/features/budget/line-item-views/LabourLineItemEditor'
import { PurchaseLineItemEditor } from '@/features/budget/line-item-views/PurchaseLineItemEditor'
import { RentalLineItemEditor } from '@/features/budget/line-item-views/RentalLineItemEditor'
import { AllowLineItemEditor } from '@/features/budget/line-item-views/AllowLineItemEditor'
import { DepositLineItemEditor } from '@/features/budget/line-item-views/DepositLineItemEditor'

type LineItemEditorForward = ForwardRefExoticComponent<
  LineItemEditProps<unknown> & RefAttributes<LineItemEditorRef>
>

export type LineItemTypeConfig = {
  type: LineItemType
  label: string
  parse: (detailsJson: string) => { ok: true; value: unknown } | { ok: false; error: string }
  /** Serializer for edit/save. */
  serialize?: (details: unknown) => string
  ReadComponent: ComponentType<LineItemReadProps>
  editable: boolean
  EditComponent?: LineItemEditorForward
  save?: (args: { budgetItemId: string; lineItemType: LineItemType; details: unknown }) => Promise<void>
}

const labourConfig: LineItemTypeConfig = {
  type: 'labour',
  label: 'Labour',
  parse: (json) => parseLabourLineItemDetails(json),
  serialize: (d) => labourLineItemDetailsToJson(d as LabourLineItemDetails),
  ReadComponent: LabourLineItemRead,
  editable: true,
  EditComponent: LabourLineItemEditor as LineItemEditorForward,
  save: async ({ budgetItemId, lineItemType, details }) => {
    await saveBudgetItemDetails({ budgetItemId, lineItemType, details })
  },
}

const purchaseConfig: LineItemTypeConfig = {
  type: 'purchase',
  label: 'Purchase',
  parse: (json) => parsePurchaseLineItemDetails(json),
  serialize: (d) => purchaseLineItemDetailsToJson(d as PurchaseLineItemDetails),
  ReadComponent: PurchaseLineItemRead,
  editable: true,
  EditComponent: PurchaseLineItemEditor as LineItemEditorForward,
  save: async ({ budgetItemId, lineItemType, details }) => {
    await saveBudgetItemDetails({ budgetItemId, lineItemType, details })
  },
}

const rentalConfig: LineItemTypeConfig = {
  type: 'rental',
  label: 'Rental',
  parse: (json) => parseRentalLineItemDetails(json),
  serialize: (d) => rentalLineItemDetailsToJson(d as RentalLineItemDetails),
  ReadComponent: RentalLineItemRead,
  editable: true,
  EditComponent: RentalLineItemEditor as LineItemEditorForward,
  save: async ({ budgetItemId, lineItemType, details }) => {
    await saveBudgetItemDetails({ budgetItemId, lineItemType, details })
  },
}

const allowConfig: LineItemTypeConfig = {
  type: 'allow',
  label: 'Allow',
  parse: (json) => parseAllowLineItemDetails(json),
  serialize: (d) => allowLineItemDetailsToJson(d as AllowLineItemDetails),
  ReadComponent: AllowLineItemRead,
  editable: true,
  EditComponent: AllowLineItemEditor as LineItemEditorForward,
  save: async ({ budgetItemId, lineItemType, details }) => {
    await saveBudgetItemDetails({ budgetItemId, lineItemType, details })
  },
}

const depositConfig: LineItemTypeConfig = {
  type: 'deposit',
  label: 'Deposit',
  parse: (json) => parseDepositLineItemDetails(json),
  serialize: (d) => depositLineItemDetailsToJson(d as DepositLineItemDetails),
  ReadComponent: DepositLineItemRead,
  editable: true,
  EditComponent: DepositLineItemEditor as LineItemEditorForward,
  save: async ({ budgetItemId, lineItemType, details }) => {
    await saveBudgetItemDetails({ budgetItemId, lineItemType, details })
  },
}

export const lineItemTypeRegistry: Record<LineItemType, LineItemTypeConfig> = {
  labour: labourConfig,
  purchase: purchaseConfig,
  rental: rentalConfig,
  allow: allowConfig,
  deposit: depositConfig,
}

export function getLineItemTypeConfig(
  type: LineItemType | null | undefined
): LineItemTypeConfig | null {
  if (type == null) return null
  const config = lineItemTypeRegistry[type]
  return config ?? null
}
