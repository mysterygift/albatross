-- Deliverables (EP8): optional episode scope; null = project-wide for episodic productions.
-- Non-episodic rows keep episode_id NULL; app rejects non-null episode_id on non-episodic productions.

ALTER TABLE deliverables ADD COLUMN episode_id TEXT REFERENCES episodes(id);

CREATE INDEX IF NOT EXISTS idx_deliverables_production_episode ON deliverables(production_id, episode_id);
