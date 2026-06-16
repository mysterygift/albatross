import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type ValidatedFieldProps = {
  label?: React.ReactNode
  error?: string
  description?: React.ReactNode
  required?: boolean
  htmlFor?: string
  className?: string
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean }>
}

export function ValidatedField({
  label,
  error,
  description,
  required,
  htmlFor,
  className,
  children,
}: ValidatedFieldProps) {
  const childId = htmlFor ?? children.props.id
  const invalid = !!error

  return (
    <div className={cn('space-y-1', className)}>
      {label != null && (
        <Label htmlFor={childId} className={cn(invalid && 'text-destructive')}>
          {label}
          {required ? ' *' : null}
        </Label>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {React.cloneElement(children, {
        id: childId,
        'aria-invalid': invalid || children.props['aria-invalid'],
      })}
      {description != null && !error && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
  )
}
