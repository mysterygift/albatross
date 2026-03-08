'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getResolvedCrewDepartmentNames, getResolvedHodRoleForDepartment } from '@/lib/people/crewHierarchyResolver'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import type { CrewFormValues } from '@/features/people/components/CrewForm'

type HodRow = {
  department: string
  name: string
  role: string
  email: string
  phone: string
}

export function CrewSetupWizard({
  hierarchy,
  open,
  onOpenChange,
  onCreateCrew,
}: {
  hierarchy: CrewHierarchyConfig
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateCrew: (values: CrewFormValues) => Promise<void>
}) {
  const [step, setStep] = useState<'intro' | 'setup'>('intro')
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set())
  const [hodRows, setHodRows] = useState<Map<string, HodRow>>(new Map())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const departmentNames = useMemo(
    () => getResolvedCrewDepartmentNames(hierarchy),
    [hierarchy]
  )

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) {
        next.delete(dept)
        setHodRows((rows) => {
          const m = new Map(rows)
          m.delete(dept)
          return m
        })
      } else {
        next.add(dept)
        setHodRows((rows) => {
          const m = new Map(rows)
          m.set(dept, {
            department: dept,
            name: '',
            role: getResolvedHodRoleForDepartment(hierarchy, dept),
            email: '',
            phone: '',
          })
          return m
        })
      }
      return next
    })
  }

  const updateHodRow = (dept: string, field: keyof HodRow, value: string) => {
    setHodRows((prev) => {
      const m = new Map(prev)
      const row = m.get(dept) ?? {
        department: dept,
        name: '',
        role: getResolvedHodRoleForDepartment(hierarchy, dept),
        email: '',
        phone: '',
      }
      m.set(dept, { ...row, [field]: value })
      return m
    })
  }

  const rowsToCreate = useMemo(() => {
    return Array.from(hodRows.entries())
      .filter(([, row]) => row.name.trim() !== '')
      .map(([, row]) => row)
  }, [hodRows])

  const handleAddHods = async () => {
    if (rowsToCreate.length === 0) return
    setIsSubmitting(true)
    try {
      for (const row of rowsToCreate) {
        await onCreateCrew({
          name: row.name.trim(),
          department: row.department,
          role_name: row.role.trim() || getResolvedHodRoleForDepartment(hierarchy, row.department),
          email: row.email || '',
          phone: row.phone || '',
          phases: '',
          notes: '',
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinish = () => {
    setStep('intro')
    setSelectedDepartments(new Set())
    setHodRows(new Map())
    onOpenChange(false)
  }

  const handleSkip = () => {
    setStep('intro')
    setSelectedDepartments(new Set())
    setHodRows(new Map())
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setStep('intro')
      setSelectedDepartments(new Set())
      setHodRows(new Map())
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg border-zinc-700 bg-zinc-900 text-foreground shadow-xl">
        {step === 'intro' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl text-foreground">Set up your crew</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
                Crew Manager helps you organise crew by department, assign Heads of Department,
                manage contact details, and support tasks and call sheets. Set up departments and
                HODs here to get started.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleSkip} className="border-zinc-600">
                Skip for now
              </Button>
              <Button
                onClick={() => setStep('setup')}
                className="bg-primary/90 hover:bg-primary"
              >
                Start setup
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'setup' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg text-foreground">
                Departments and Heads of Department
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Choose departments to set up and add the Head of Department for each. Role defaults
                to the canonical HOD role; you can add more crew from Crew Manager later.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {departmentNames.map((dept) => {
                const checked = selectedDepartments.has(dept)
                const row = hodRows.get(dept)
                const hodRole = getResolvedHodRoleForDepartment(hierarchy, dept)
                return (
                  <div
                    key={dept}
                    className="rounded-lg border border-zinc-700 bg-zinc-800/80 p-3 space-y-3"
                  >
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDepartment(dept)}
                        className="rounded border-zinc-600 bg-zinc-800 text-primary focus:ring-primary/50"
                      />
                      <span className="font-medium text-sm text-foreground">{dept}</span>
                      <span className="text-muted-foreground text-xs">({hodRole})</span>
                    </label>
                    {checked && row && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                        <div className="sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Name</Label>
                          <Input
                            value={row.name}
                            onChange={(e) => updateHodRow(dept, 'name', e.target.value)}
                            placeholder="Full name"
                            className="mt-1 bg-zinc-800 border-zinc-600 text-foreground placeholder:text-muted-foreground"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Role</Label>
                          <Input
                            value={row.role}
                            onChange={(e) => updateHodRow(dept, 'role', e.target.value)}
                            placeholder={hodRole}
                            className="mt-1 bg-zinc-800 border-zinc-600 text-foreground"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Email</Label>
                          <Input
                            type="email"
                            value={row.email}
                            onChange={(e) => updateHodRow(dept, 'email', e.target.value)}
                            placeholder="email@example.com"
                            className="mt-1 bg-zinc-800 border-zinc-600 text-foreground"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Phone</Label>
                          <Input
                            value={row.phone}
                            onChange={(e) => updateHodRow(dept, 'phone', e.target.value)}
                            placeholder="Phone"
                            className="mt-1 bg-zinc-800 border-zinc-600 text-foreground"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
              <Button
                variant="outline"
                onClick={handleSkip}
                className="border-zinc-600"
              >
                Skip for now
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('intro')}
                className="border-zinc-600"
              >
                Back
              </Button>
              {rowsToCreate.length > 0 && (
                <Button
                  onClick={handleAddHods}
                  disabled={isSubmitting}
                  className="bg-primary/90 hover:bg-primary"
                >
                  {isSubmitting ? 'Adding…' : 'Add selected HODs'}
                </Button>
              )}
              <Button
                onClick={handleFinish}
                disabled={isSubmitting}
                className="bg-primary/90 hover:bg-primary"
              >
                Finish
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
