import { AlertTriangle } from 'lucide-react'

export const SB_REMOTE_UNSUPPORTED_MESSAGE =
  'Script sections and sides require local data. This production is linked to a remote server, which does not support script versions, sections, or sides export yet.'

type SbRemoteNoticeProps = {
  className?: string
}

/** Banner shown on Script Sections & Sides surfaces for remote-server productions. */
export function SbRemoteNotice({ className }: SbRemoteNoticeProps) {
  return (
    <div
      role="status"
      className={
        className ??
        'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 flex gap-2 items-start'
      }
    >
      <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
      <span>{SB_REMOTE_UNSUPPORTED_MESSAGE}</span>
    </div>
  )
}
