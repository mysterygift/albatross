-- Scene-level episode ownership (EP3). Nullable for non-episodic productions.
-- The backfill below runs only where production_id is already episodic (is_episodic = 1).
-- Episodes use soft-delete (archived); FK row remains valid.

ALTER TABLE scenes ADD COLUMN episode_id TEXT REFERENCES episodes(id);

CREATE INDEX IF NOT EXISTS idx_scenes_production_episode ON scenes(production_id, episode_id);

-- Episodic productions: attach scenes without an episode to the first active episode (by sort_order).
UPDATE scenes
SET episode_id = (
  SELECT e.id FROM episodes e
  WHERE e.production_id = scenes.production_id
    AND e.deleted_at IS NULL
  ORDER BY e.sort_order ASC, e.id ASC
  LIMIT 1
)
WHERE episode_id IS NULL
  AND production_id IN (SELECT id FROM productions WHERE is_episodic = 1);
