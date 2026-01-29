-- ============================================================
-- Masi App - Add Time Entries Table
-- ============================================================
-- This migration adds the time_entries table for time tracking
-- Safe to run even if other tables/policies already exist
-- ============================================================

-- Create time_entries table
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  sign_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
  sign_in_lat DECIMAL(9, 6) NOT NULL,
  sign_in_lon DECIMAL(9, 6) NOT NULL,
  sign_out_time TIMESTAMP WITH TIME ZONE,
  sign_out_lat DECIMAL(9, 6),
  sign_out_lon DECIMAL(9, 6),
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (will error if already exist, but that's safe to ignore)
CREATE POLICY "Users can view own time entries" ON time_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own time entries" ON time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own time entries" ON time_entries
  FOR UPDATE USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_sign_in_time ON time_entries(sign_in_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_synced ON time_entries(synced);

-- ============================================================
-- Migration Complete!
-- ============================================================
-- The time_entries table is now ready for time tracking sync.
-- Restart your app and test pull-to-refresh.
-- ============================================================
