-- Store the full ordered item list used in each assessment.
-- Makes each assessment record self-contained so historical results
-- render correctly even if item sets rotate or update.
-- Nullable: existing letter assessments fall back to getLetterSetById().

ALTER TABLE assessments ADD COLUMN items_tested JSONB;
