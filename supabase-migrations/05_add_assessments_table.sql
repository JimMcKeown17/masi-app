-- EGRA Letter Sound Assessment table
-- No FK on child_id to avoid offline sync cascade issues (see CLAUDE.md).
-- user_id is the single ownership field — no separate created_by needed.
-- date_assessed is TEXT YYYY-MM-DD to avoid timezone day-shift bugs.

CREATE TABLE assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  child_id UUID NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'letter_egra',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  letter_set_id TEXT NOT NULL,
  letter_language TEXT NOT NULL,
  completion_time INTEGER NOT NULL,
  letters_attempted INTEGER NOT NULL,
  correct_responses INTEGER NOT NULL,
  accuracy INTEGER NOT NULL,
  correct_letters JSONB NOT NULL DEFAULT '[]',
  incorrect_letters JSONB NOT NULL DEFAULT '[]',
  last_letter_attempted JSONB,
  date_assessed TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_own ON assessments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY insert_own ON assessments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY update_own ON assessments FOR UPDATE USING (user_id = auth.uid());

CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_child_id ON assessments(child_id);
CREATE INDEX idx_assessments_synced ON assessments(synced);
