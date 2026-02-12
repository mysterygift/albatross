-- Override for time to cover this scene on the strip (minutes). When NULL, use sum of shot estimated_shoot_minutes.
ALTER TABLE stripboard_strips ADD COLUMN estimated_minutes INTEGER;
