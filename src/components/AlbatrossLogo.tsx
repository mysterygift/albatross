import { cn } from '@/lib/utils'

import albatrossLogoSrc from '../../src-tauri/icons/128x128.png'

type AlbatrossLogoProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'size-12',
  md: 'size-20',
  lg: 'size-28',
} as const

export function AlbatrossLogo({ className, size = 'md' }: AlbatrossLogoProps) {
  return (
    <img
      src={albatrossLogoSrc}
      alt=""
      aria-hidden
      className={cn('object-contain', sizeClasses[size], className)}
      data-testid="albatross-logo"
    />
  )
}
