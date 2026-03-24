-- Music & Archive (EP7): optional episode scope; null = project-wide for episodic productions.
-- Non-episodic rows keep episode_id NULL; app rejects non-null episode_id on non-episodic productions.

ALTER TABLE music_tracks ADD COLUMN episode_id TEXT REFERENCES episodes(id);

CREATE INDEX IF NOT EXISTS idx_music_tracks_production_episode ON music_tracks(production_id, episode_id);
