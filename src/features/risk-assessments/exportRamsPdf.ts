import { saveFileWithDialog } from '@/lib/files'
import { exportRiskAssessmentPdf } from '@/lib/risk-assessments/exportRiskAssessmentPdf'

/**
 * Stores the RAMS PDF in Documents, then offers a save-as copy (like call sheets). Cancelling the
 * dialog keeps the Documents copy. Returns the chosen path, or null if cancelled.
 */
export async function exportRamsPdfWithSaveDialog(riskAssessmentId: string): Promise<string | null> {
  const { bytes, fileName } = await exportRiskAssessmentPdf(riskAssessmentId)
  return saveFileWithDialog(
    {
      defaultPath: fileName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: 'Export a copy of risk assessment',
    },
    bytes
  )
}
