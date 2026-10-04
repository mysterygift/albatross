-- SS5: Daily Progress Report inputs. Local SQLite only.
--
-- shoot_days.call_time / wrap_time / meal_times_json hold the PLANNED schedule (call sheet, stripboard).
-- The script supervisor records what ACTUALLY happened here, so actuals never overwrite the plan.
-- Times are HH:MM text, as elsewhere in the schedule.

CREATE TABLE IF NOT EXISTS script_supervisor_day_logs (
  shoot_day_id TEXT PRIMARY KEY REFERENCES shoot_days(id) ON DELETE CASCADE,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  call_time TEXT,
  first_shot_time TEXT,
  lunch_start_time TEXT,
  lunch_end_time TEXT,
  first_shot_after_lunch_time TEXT,
  camera_wrap_time TEXT,
  wrap_time TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_script_supervisor_day_logs_production_id
  ON script_supervisor_day_logs(production_id);

-- Screen time the script supervisor timed for a completed scene, in seconds (DPR "minutes" row).
ALTER TABLE script_supervisor_scene_progress ADD COLUMN timed_seconds INTEGER
  CHECK (timed_seconds IS NULL OR timed_seconds >= 0);
