-- Time to get the shot in practice (minutes). Used for stripboard day duration, not on-screen duration.
-- NULL = unknown (treated as 0 when summing).
ALTER TABLE shots ADD COLUMN estimated_shoot_minutes INTEGER;
