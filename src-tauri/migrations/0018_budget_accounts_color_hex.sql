-- Optional custom band colour for rollup (non-postable) accounts. UI-only; does not affect calculations.

ALTER TABLE budget_accounts ADD COLUMN color_hex TEXT NULL;
