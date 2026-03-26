-- Letter mastery tracker: stores coach-taught letter mastery records.
-- Assessment-derived mastery is computed on-the-fly from the latest assessment,
-- so only source='taught' rows are persisted here.
-- No FK on child_id to avoid offline sync cascade issues (matches assessments pattern).
-- DELETE policy included because un-teaching a letter removes the row.

CREATE TABLE letter_mastery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  child_id UUID NOT NULL,
  letter TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'taught',
  language TEXT NOT NULL,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE letter_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own ON letter_mastery FOR SELECT USING (user_id = auth.uid());
CREATE POLICY insert_own ON letter_mastery FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY update_own ON letter_mastery FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY delete_own ON letter_mastery FOR DELETE USING (user_id = auth.uid());

CREATE UNIQUE INDEX idx_letter_mastery_unique
  ON letter_mastery(user_id, child_id, letter, language);
CREATE INDEX idx_letter_mastery_child ON letter_mastery(child_id);
CREATE INDEX idx_letter_mastery_user ON letter_mastery(user_id);
