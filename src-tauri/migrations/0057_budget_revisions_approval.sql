ALTER TABLE budget_revisions
ADD COLUMN approval TEXT NOT NULL DEFAULT 'unapproved' CHECK (approval IN ('unapproved', 'pending', 'approved'));
