import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  applyColumnMapping,
  matchRegistryImportRows,
  parseCsvRaw,
  registryRowToCreateData,
  registryRowToUpdatePatch,
  suggestColumnMapping,
  type ColumnMapping,
  type EquipmentRegistryCsvField,
  type RegistryImportMatchResult,
} from '@/lib/equipment/csv'
import { pickCsvFileForImport } from '@/lib/files'
import {
  createEquipmentWithReminderTask,
  updateEquipmentWithReminderTask,
} from '@/lib/db/equipmentReturnReminderService'
import type { Equipment } from '@/lib/db/types'

const NOT_MAPPED = '__not_mapped__'

const FIELD_LABELS: Record<EquipmentRegistryCsvField, string> = {
  name: 'Name',
  quantity: 'Quantity',
  serial_number: 'Serial number',
  replacement_value: 'Replacement value',
}

const REGISTRY_FIELDS: EquipmentRegistryCsvField[] = [
  'name',
  'quantity',
  'serial_number',
  'replacement_value',
]

type Step = 'mapping' | 'confirm'

type RawParse = {
  headers: string[]
  rows: string[][]
}

export type ImportEquipmentRegistryCsvDialogProps = {
  productionId: string
  existingEquipment: Equipment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  rawParse: RawParse | null
  initialMapping: ColumnMapping
  parseErrors: string[]
}

export function ImportEquipmentRegistryCsvDialog({
  productionId,
  existingEquipment,
  open,
  onOpenChange,
  rawParse,
  initialMapping,
  parseErrors,
}: ImportEquipmentRegistryCsvDialogProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('mapping')
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(initialMapping)
  const [applyErrors, setApplyErrors] = useState<string[]>([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [matchResult, setMatchResult] = useState<RegistryImportMatchResult | null>(null)

  const previewRows = useMemo(
    () => (rawParse?.rows ?? []).slice(0, 5),
    [rawParse?.rows]
  )

  useEffect(() => {
    if (open) {
      setColumnMapping(initialMapping)
      setStep('mapping')
      setApplyErrors([])
      setSkippedCount(0)
      setMatchResult(null)
    }
  }, [open, initialMapping])

  const resetState = () => {
    setStep('mapping')
    setColumnMapping({})
    setApplyErrors([])
    setSkippedCount(0)
    setMatchResult(null)
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  const serialMapped = columnMapping.serial_number !== undefined

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!matchResult) return
      for (const row of matchResult.toCreate) {
        await createEquipmentWithReminderTask(registryRowToCreateData(row, productionId))
      }
      for (const { row, equipment } of matchResult.toUpdate) {
        await updateEquipmentWithReminderTask(
          equipment.id,
          registryRowToUpdatePatch(row),
          equipment
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', productionId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', productionId] })
      handleClose(false)
    },
  })

  const setFieldMapping = (field: EquipmentRegistryCsvField, value: string) => {
    setColumnMapping((prev) => {
      const next = { ...prev }
      if (value === NOT_MAPPED) {
        delete next[field]
      } else {
        next[field] = Number(value)
      }
      return next
    })
  }

  const handleContinue = () => {
    if (!rawParse) return
    setApplyErrors([])
    const applied = applyColumnMapping(rawParse.rows, columnMapping)
    if (applied.errors.length > 0) {
      setApplyErrors(applied.errors)
      return
    }
    setSkippedCount(applied.skipped)
    const matched = matchRegistryImportRows(
      applied.rows,
      existingEquipment,
      serialMapped
    )
    setMatchResult(matched)
    setStep('confirm')
  }

  const totalImportCount =
    (matchResult?.toCreate.length ?? 0) + (matchResult?.toUpdate.length ?? 0)

  return (
    <>
      <Dialog open={open && parseErrors.length > 0 && !rawParse} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import failed</DialogTitle>
          </DialogHeader>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => handleClose(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open && !!rawParse} onOpenChange={handleClose}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {step === 'mapping' ? 'Import CSV — map columns' : 'Import CSV — confirm'}
            </DialogTitle>
          </DialogHeader>

          {step === 'mapping' && rawParse && (
            <div className="flex-1 overflow-auto space-y-4 min-h-0">
              <p className="text-sm text-muted-foreground">
                Preview of the first {previewRows.length} row{previewRows.length === 1 ? '' : 's'}.
                Map CSV columns to registry fields. Name is required.
              </p>

              <div className="rounded-md border overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {rawParse.headers.map((h, i) => (
                        <TableHead key={i} className="whitespace-nowrap text-xs">
                          {h || `Column ${i + 1}`}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={rawParse.headers.length}
                          className="text-muted-foreground text-sm"
                        >
                          No preview rows.
                        </TableCell>
                      </TableRow>
                    ) : (
                      previewRows.map((row, ri) => (
                        <TableRow key={ri}>
                          {rawParse.headers.map((_, ci) => (
                            <TableCell key={ci} className="text-xs whitespace-nowrap max-w-[160px] truncate">
                              {row[ci] ?? ''}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {REGISTRY_FIELDS.map((field) => (
                  <div key={field}>
                    <Label>
                      {FIELD_LABELS[field]}
                      {field === 'name' ? ' (required)' : ''}
                    </Label>
                    <Select
                      value={
                        columnMapping[field] !== undefined
                          ? String(columnMapping[field])
                          : NOT_MAPPED
                      }
                      onValueChange={(v) => setFieldMapping(field, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_MAPPED}>— Not mapped —</SelectItem>
                        {rawParse.headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {applyErrors.length > 0 && (
                <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                  {applyErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 'confirm' && matchResult && (
            <div className="flex-1 overflow-auto space-y-3 min-h-0 text-sm">
              <p>
                <strong>{matchResult.toCreate.length}</strong> new item
                {matchResult.toCreate.length === 1 ? '' : 's'} will be created.
              </p>
              {serialMapped && (
                <p>
                  <strong>{matchResult.toUpdate.length}</strong> existing item
                  {matchResult.toUpdate.length === 1 ? '' : 's'} will be updated (matched by name and serial).
                </p>
              )}
              {skippedCount > 0 && (
                <p className="text-muted-foreground">
                  <strong>{skippedCount}</strong> row{skippedCount === 1 ? '' : 's'} skipped (blank name).
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Unmapped fields use defaults: category Other, source Owned, status Planned.
                Quantity defaults to 1 when not mapped.
              </p>
              <ul className="border rounded-md p-2 bg-muted/30 max-h-40 overflow-auto space-y-0.5">
                {[...matchResult.toCreate, ...matchResult.toUpdate.map((u) => u.row)]
                  .slice(0, 20)
                  .map((row, i) => (
                    <li key={i} className="truncate">
                      {row.name}
                      {row.serial_number ? ` · ${row.serial_number}` : ''}
                      {row.quantity > 1 ? ` · qty ${row.quantity}` : ''}
                    </li>
                  ))}
              </ul>
              {(matchResult.toCreate.length + matchResult.toUpdate.length) > 20 && (
                <p className="text-xs text-muted-foreground">…and more</p>
              )}
            </div>
          )}

          <DialogFooter>
            {step === 'mapping' ? (
              <>
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleContinue}
                  disabled={columnMapping.name === undefined}
                >
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  Back
                </Button>
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || totalImportCount === 0}
                >
                  {importMutation.isPending
                    ? 'Importing…'
                    : `Import ${totalImportCount} item${totalImportCount === 1 ? '' : 's'}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Pick a CSV file, parse it, and return state for the import dialog. */
export async function loadRegistryCsvFromPicker(): Promise<
  | { ok: true; raw: RawParse; suggestedMapping: ColumnMapping }
  | { ok: false; errors: string[] }
> {
  const path = await pickCsvFileForImport()
  if (path == null) return { ok: false, errors: [] }

  const text = await readTextFile(path)
  const parsed = parseCsvRaw(text)
  if (parsed.errors.length > 0) {
    return { ok: false, errors: parsed.errors }
  }
  return {
    ok: true,
    raw: { headers: parsed.headers, rows: parsed.rows },
    suggestedMapping: suggestColumnMapping(parsed.headers),
  }
}
