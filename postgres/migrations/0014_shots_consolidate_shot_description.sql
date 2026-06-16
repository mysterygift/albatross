-- Consolidate shot description, action_description into shot_description.
UPDATE shots
SET shot_description = COALESCE(
  NULLIF(TRIM(shot_description), ''),
  NULLIF(TRIM(description), ''),
  NULLIF(TRIM(action_description), '')
);

ALTER TABLE shots DROP COLUMN description;
ALTER TABLE shots DROP COLUMN action_description;
