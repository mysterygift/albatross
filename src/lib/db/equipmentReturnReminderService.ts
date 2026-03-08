/**
 * Equipment return reminder task orchestration.
 *
 * Rented equipment with a return_due_date gets a single production task reminder. The task is
 * created/updated in sync with equipment lifecycle. No separate reminders table; we use
 * production_tasks with equipment_id link.
 *
 * Rules:
 * - Equipment is reminder-eligible when: source_type === 'rented', return_due_date is set,
 *   status !== 'returned', and not soft-deleted.
 * - When eligible: create or maintain a linked task (description "Return equipment — {name}",
 *   due_date = return_due_date, assigned_department from equipment department or "Production").
 * - When status becomes 'returned' or returned_at is set: mark linked task complete (is_complete = 1).
 * - When no longer eligible (e.g. source_type changed away from rented, or return_due_date cleared):
 *   soft-delete the linked task.
 * - When equipment is soft-deleted: soft-delete the linked task in the same transaction.
 * - One equipment item → at most one active reminder task (enforced by DB unique index on equipment_id).
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import {
  buildCreateEquipmentStatements,
  buildSoftDeleteEquipmentStatements,
  buildUpdateEquipmentStatements,
  createEquipment,
  getEquipmentById,
  type CreateEquipmentData,
  type UpdateEquipmentPatch,
} from './repositories/equipment'
import {
  buildCreateTaskStatements,
  buildSoftDeleteTaskStatements,
  buildUpdateTaskStatements,
  getTaskByEquipmentId,
  type CreateTaskData,
  type UpdateTaskPatch,
} from './repositories/tasks'
import type { Equipment } from './types'
import { PRODUCTION_DEPARTMENTS } from '@/lib/productions/departments'

const FALLBACK_DEPARTMENT = 'Production'

function reminderDescription(equipmentName: string): string {
  return `Return equipment — ${equipmentName}`
}

function taskNotesFromEquipment(e: Equipment): string | null {
  const parts: string[] = []
  if (e.item_uuid) parts.push(`UUID: ${e.item_uuid}`)
  if (e.vendor_id || e.vendor?.trim()) {
    const v = e.vendor?.trim() || '(vendor linked)'
    parts.push(`Vendor: ${v}`)
  }
  if (e.rental_start_date && e.return_due_date) {
    parts.push(`Rental: ${e.rental_start_date} → ${e.return_due_date}`)
  } else if (e.return_due_date) parts.push(`Due: ${e.return_due_date}`)
  if (e.serial_number?.trim()) parts.push(`Serial: ${e.serial_number.trim()}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Map equipment department to a task assigned_department. Uses PRODUCTION_DEPARTMENTS;
 * falls back to Production if no match.
 */
function departmentForTask(equipment: Pick<Equipment, 'department'>): string {
  const d = equipment.department?.trim()
  if (!d) return FALLBACK_DEPARTMENT
  const match = PRODUCTION_DEPARTMENTS.find(
    (dept) => dept.toLowerCase() === d.toLowerCase()
  )
  return match ?? FALLBACK_DEPARTMENT
}

export function isReminderEligible(equipment: Pick<Equipment, 'source_type' | 'return_due_date' | 'status'>): boolean {
  return (
    equipment.source_type === 'rented' &&
    !!equipment.return_due_date?.trim() &&
    equipment.status !== 'returned'
  )
}

function isReturned(equipment: Pick<Equipment, 'status' | 'returned_at'>): boolean {
  return equipment.status === 'returned' || !!equipment.returned_at?.trim()
}

/**
 * Create equipment and, if reminder-eligible, a linked return reminder task in one transaction.
 */
export async function createEquipmentWithReminderTask(data: CreateEquipmentData): Promise<Equipment> {
  const id = uuid()
  const itemUuid = uuid()
  const ts = now()

  const eligible =
    data.source_type === 'rented' &&
    !!data.return_due_date?.trim() &&
    data.status !== 'returned'

  if (!eligible) {
    return createEquipment({ ...data, production_id: data.production_id })
  }

  const taskId = uuid()
  const taskData: CreateTaskData = {
    production_id: data.production_id,
    description: reminderDescription(data.name),
    due_date: data.return_due_date ?? null,
    assigned_department: data.department?.trim()
      ? (PRODUCTION_DEPARTMENTS.find(
          (d) => d.toLowerCase() === data.department!.trim().toLowerCase()
        ) ?? FALLBACK_DEPARTMENT)
      : FALLBACK_DEPARTMENT,
    equipment_id: id,
    is_complete: 0,
    notes: null,
  }
  const notes = [
    `UUID: ${itemUuid}`,
    data.vendor_id ? '(vendor linked)' : data.vendor?.trim() || null,
    data.rental_start_date && data.return_due_date
      ? `Rental: ${data.rental_start_date} → ${data.return_due_date}`
      : null,
    data.serial_number?.trim() ? `Serial: ${data.serial_number.trim()}` : null,
  ].filter(Boolean)
  if (notes.length > 0) taskData.notes = notes.join(' · ')

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateEquipmentStatements(id, itemUuid, ts, data),
    ...buildCreateTaskStatements(taskId, taskData, ts),
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  const created = await getEquipmentById(id)
  if (!created) throw new Error('Equipment not found after create')
  return created
}

/**
 * Update equipment and its linked reminder task in one transaction when both need changes.
 * - If name changes, task description is updated.
 * - If return_due_date changes, task due_date is updated.
 * - If department changes, task assigned_department is updated.
 * - If status becomes 'returned' or returned_at is set, task is marked complete.
 * - If no longer eligible (e.g. not rented or no return_due_date), linked task is soft-deleted.
 * - If previously not eligible and now eligible, a new task is created.
 */
export async function updateEquipmentWithReminderTask(
  equipmentId: string,
  patch: UpdateEquipmentPatch,
  current: Equipment
): Promise<Equipment> {
  const task = await getTaskByEquipmentId(equipmentId)
  const ts = now()

  const equipmentStatements = buildUpdateEquipmentStatements(equipmentId, patch, ts)
  const merged = { ...current, ...patch } as Equipment
  const stillEligible = isReminderEligible(merged)
  const nowReturned = isReturned(merged)

  if (equipmentStatements.length === 0 && !task) {
    const { updateEquipment } = await import('./repositories/equipment')
    return updateEquipment(equipmentId, patch)
  }

  if (equipmentStatements.length === 0 && task) {
    const taskPatch = buildEquipmentReminderTaskPatch(merged, patch, task)
    if (taskPatch === null) {
      const { updateEquipment } = await import('./repositories/equipment')
      return updateEquipment(equipmentId, patch)
    }
    const taskStatements = buildUpdateTaskStatements(task.id, taskPatch, ts)
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN', bindValues: [] },
        ...taskStatements,
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
    const updated = await getEquipmentById(equipmentId)
    if (!updated) throw new Error(`Equipment not found: ${equipmentId}`)
    return updated
  }

  let createTaskStatements: Array<{ sql: string; bindValues: unknown[] }> = []
  let updateTaskStatements: Array<{ sql: string; bindValues: unknown[] }> = []
  let softDeleteTaskStatements: Array<{ sql: string; bindValues: unknown[] }> = []

  if (task) {
    if (!stillEligible) {
      softDeleteTaskStatements = buildSoftDeleteTaskStatements(task.id, ts)
    } else {
      const taskPatch = buildEquipmentReminderTaskPatch(merged, patch, task)
      if (taskPatch) updateTaskStatements = buildUpdateTaskStatements(task.id, taskPatch, ts)
    }
  } else if (stillEligible) {
    const taskId = uuid()
    createTaskStatements = buildCreateTaskStatements(
      taskId,
      {
        production_id: current.production_id,
        description: reminderDescription(merged.name),
        due_date: merged.return_due_date ?? null,
        assigned_department: departmentForTask(merged),
        equipment_id: equipmentId,
        notes: taskNotesFromEquipment(merged),
      },
      ts
    )
  }

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...equipmentStatements,
    ...updateTaskStatements,
    ...createTaskStatements,
    ...softDeleteTaskStatements,
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  const updated = await getEquipmentById(equipmentId)
  if (!updated) throw new Error(`Equipment not found: ${equipmentId}`)
  return updated
}

function buildEquipmentReminderTaskPatch(
  merged: Equipment,
  patch: UpdateEquipmentPatch,
  _task: { id: string }
): UpdateTaskPatch | null {
  const descriptionChanged = patch.name !== undefined
  const dueDateChanged = patch.return_due_date !== undefined
  const departmentChanged = patch.department !== undefined
  const returned = isReturned(merged)

  const taskPatch: UpdateTaskPatch = {}
  if (descriptionChanged) taskPatch.description = reminderDescription(merged.name)
  if (dueDateChanged) taskPatch.due_date = merged.return_due_date ?? null
  if (departmentChanged) taskPatch.assigned_department = departmentForTask(merged)
  if (returned) taskPatch.is_complete = 1
  if (Object.keys(taskPatch).length === 0) return null
  return taskPatch
}

/**
 * Soft-delete equipment and its linked reminder task in one transaction.
 */
export async function archiveEquipmentWithReminderTask(equipmentId: string): Promise<void> {
  const task = await getTaskByEquipmentId(equipmentId)
  const ts = now()

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildSoftDeleteEquipmentStatements(equipmentId, ts),
    ...(task ? buildSoftDeleteTaskStatements(task.id, ts) : []),
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}
