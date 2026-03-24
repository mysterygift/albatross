-- Canonical shoot-day ↔ shooting-bloc association (EP4). Nullable for non-episodic / unassigned dates.
-- Values are app-maintained from bloc date ranges; migration does not backfill.

ALTER TABLE shoot_days ADD COLUMN shooting_bloc_id TEXT REFERENCES shooting_blocs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shoot_days_shooting_bloc_id ON shoot_days(shooting_bloc_id);
