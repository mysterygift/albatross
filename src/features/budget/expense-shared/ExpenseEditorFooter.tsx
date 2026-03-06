import { Button } from '@/components/ui/button'

type ExpenseEditorFooterProps = {
  onCancel: () => void
  isSaving: boolean
  saveLabel?: string
  cancelLabel?: string
}

export function ExpenseEditorFooter({
  onCancel,
  isSaving,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
}: ExpenseEditorFooterProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving…' : saveLabel}
      </Button>
    </div>
  )
}
