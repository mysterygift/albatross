/**
 * Demo production task sections and tasks seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds: production_task_sections (Pre-Production, Principal Photography, Post-Production),
 * production_tasks with subtasks. Deterministic and demo-only.
 */
import { PRODUCTION_DEPARTMENTS } from '@/lib/productions/departments'
import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import { IDS } from './constants'

const TABLE_SECTIONS = 'production_task_sections'
const TABLE_TASKS = 'production_tasks'

type TaskRow = {
  id: string
  section_id: string
  parent_task_id: string | null
  description: string
  is_complete: number
  notes: string | null
  due_date: string | null
  assigned_department: string | null
  priority: number | null
}

/**
 * Seed demo production task sections and tasks. Call after seedDemoBudget.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
export async function seedDemoTasks(
  pid: string,
  startDate: string,
  ts: string,
  addDaysLocal: (yyyyMmDd: string, days: number) => string
): Promise<void> {
  const preProd = IDS.taskSection(1)
  const principal = IDS.taskSection(2)
  const postProd = IDS.taskSection(3)

  const tasks: TaskRow[] = [
    // Pre-Production
    {
      id: IDS.task(1),
      section_id: preProd,
      parent_task_id: null,
      description: 'Lock budget',
      is_complete: 1,
      notes: 'ATL and BTL assumptions confirmed',
      due_date: addDaysLocal(startDate, -14),
      assigned_department: PRODUCTION_DEPARTMENTS[1], // Producers
      priority: 1,
    },
    {
      id: IDS.task(2),
      section_id: preProd,
      parent_task_id: IDS.task(1),
      description: 'Confirm ATL assumptions',
      is_complete: 1,
      notes: null,
      due_date: addDaysLocal(startDate, -14),
      assigned_department: PRODUCTION_DEPARTMENTS[1],
      priority: 2,
    },
    {
      id: IDS.task(3),
      section_id: preProd,
      parent_task_id: IDS.task(1),
      description: 'Confirm BTL assumptions',
      is_complete: 1,
      notes: null,
      due_date: addDaysLocal(startDate, -14),
      assigned_department: PRODUCTION_DEPARTMENTS[1],
      priority: 2,
    },
    {
      id: IDS.task(4),
      section_id: preProd,
      parent_task_id: null,
      description: 'Secure key locations',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, -3),
      assigned_department: PRODUCTION_DEPARTMENTS[8], // Locations
      priority: 1,
    },
    {
      id: IDS.task(5),
      section_id: preProd,
      parent_task_id: IDS.task(4),
      description: 'Trafalgar Square permit',
      is_complete: 0,
      notes: 'Council application in progress',
      due_date: addDaysLocal(startDate, 2),
      assigned_department: PRODUCTION_DEPARTMENTS[8],
      priority: 1,
    },
    {
      id: IDS.task(6),
      section_id: preProd,
      parent_task_id: IDS.task(4),
      description: 'Bank interior agreement',
      is_complete: 1,
      notes: null,
      due_date: addDaysLocal(startDate, -7),
      assigned_department: PRODUCTION_DEPARTMENTS[8],
      priority: 2,
    },
    {
      id: IDS.task(7),
      section_id: preProd,
      parent_task_id: null,
      description: 'Confirm camera package',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 5),
      assigned_department: PRODUCTION_DEPARTMENTS[3], // Camera
      priority: 2,
    },
    {
      id: IDS.task(8),
      section_id: preProd,
      parent_task_id: IDS.task(7),
      description: 'Finalise lens list',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 4),
      assigned_department: PRODUCTION_DEPARTMENTS[3],
      priority: null,
    },
    {
      id: IDS.task(9),
      section_id: preProd,
      parent_task_id: IDS.task(7),
      description: 'Schedule camera prep day',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 1),
      assigned_department: PRODUCTION_DEPARTMENTS[3],
      priority: 1,
    },
    {
      id: IDS.task(10),
      section_id: preProd,
      parent_task_id: null,
      description: 'Issue cast contracts',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, -5),
      assigned_department: PRODUCTION_DEPARTMENTS[18], // Cast
      priority: 1,
    },
    // Principal Photography
    {
      id: IDS.task(11),
      section_id: principal,
      parent_task_id: null,
      description: 'Day 1 readiness',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 0),
      assigned_department: PRODUCTION_DEPARTMENTS[17], // AD Department
      priority: 1,
    },
    {
      id: IDS.task(12),
      section_id: principal,
      parent_task_id: IDS.task(11),
      description: 'Confirm call sheet issued',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 0),
      assigned_department: PRODUCTION_DEPARTMENTS[17],
      priority: 1,
    },
    {
      id: IDS.task(13),
      section_id: principal,
      parent_task_id: IDS.task(11),
      description: 'Confirm transport call times',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 0),
      assigned_department: PRODUCTION_DEPARTMENTS[16], // Transport
      priority: 2,
    },
    {
      id: IDS.task(14),
      section_id: principal,
      parent_task_id: IDS.task(11),
      description: 'Confirm catering numbers',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 0),
      assigned_department: PRODUCTION_DEPARTMENTS[0], // Production
      priority: 2,
    },
    {
      id: IDS.task(15),
      section_id: principal,
      parent_task_id: null,
      description: 'Stunt day prep',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 8),
      assigned_department: PRODUCTION_DEPARTMENTS[11], // Special Effects
      priority: 1,
    },
    {
      id: IDS.task(16),
      section_id: principal,
      parent_task_id: IDS.task(15),
      description: 'Confirm stunt coordinator',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 7),
      assigned_department: PRODUCTION_DEPARTMENTS[11],
      priority: 1,
    },
    {
      id: IDS.task(17),
      section_id: principal,
      parent_task_id: IDS.task(15),
      description: 'Confirm medic booked',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 7),
      assigned_department: PRODUCTION_DEPARTMENTS[0],
      priority: 2,
    },
    {
      id: IDS.task(18),
      section_id: principal,
      parent_task_id: null,
      description: 'Daily camera media workflow',
      is_complete: 0,
      notes: 'DIT handoff and backup protocol',
      due_date: null,
      assigned_department: PRODUCTION_DEPARTMENTS[3],
      priority: 2,
    },
    // Post-Production
    {
      id: IDS.task(19),
      section_id: postProd,
      parent_task_id: null,
      description: 'Picture lock prep',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 42),
      assigned_department: PRODUCTION_DEPARTMENTS[12], // Post Production
      priority: 2,
    },
    {
      id: IDS.task(20),
      section_id: postProd,
      parent_task_id: IDS.task(19),
      description: 'Confirm editor handoff',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 41),
      assigned_department: PRODUCTION_DEPARTMENTS[12],
      priority: null,
    },
    {
      id: IDS.task(21),
      section_id: postProd,
      parent_task_id: IDS.task(19),
      description: 'Confirm turnover notes',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 43),
      assigned_department: PRODUCTION_DEPARTMENTS[12],
      priority: null,
    },
    {
      id: IDS.task(22),
      section_id: postProd,
      parent_task_id: null,
      description: 'Music clearance review',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 50),
      assigned_department: PRODUCTION_DEPARTMENTS[14], // Legal
      priority: 2,
    },
    {
      id: IDS.task(23),
      section_id: postProd,
      parent_task_id: null,
      description: 'Delivery prep',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 90),
      assigned_department: PRODUCTION_DEPARTMENTS[12],
      priority: 1,
    },
    {
      id: IDS.task(24),
      section_id: postProd,
      parent_task_id: IDS.task(23),
      description: 'Confirm broadcaster specs',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 85),
      assigned_department: PRODUCTION_DEPARTMENTS[12],
      priority: 2,
    },
    {
      id: IDS.task(25),
      section_id: postProd,
      parent_task_id: IDS.task(23),
      description: 'QC deliverables checklist',
      is_complete: 0,
      notes: null,
      due_date: addDaysLocal(startDate, 88),
      assigned_department: PRODUCTION_DEPARTMENTS[12],
      priority: 2,
    },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    // Sections
    statements.push({
      sql: `INSERT INTO ${TABLE_SECTIONS} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12), ($13, $14, $15, $16, $17, $18)`,
      bindValues: [
        preProd,
        pid,
        'Pre-Production',
        0,
        ts,
        ts,
        principal,
        pid,
        'Principal Photography',
        1,
        ts,
        ts,
        postProd,
        pid,
        'Post-Production',
        2,
        ts,
        ts,
      ],
    })

    // Tasks (parents before children is already satisfied by task order)
    for (const t of tasks) {
      statements.push({
        sql: `INSERT INTO ${TABLE_TASKS} (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, parent_task_id, section_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        bindValues: [
          t.id,
          pid,
          t.description,
          t.is_complete,
          t.notes,
          t.due_date,
          t.assigned_department,
          t.priority,
          t.parent_task_id,
          t.section_id,
          ts,
          ts,
        ],
      })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
