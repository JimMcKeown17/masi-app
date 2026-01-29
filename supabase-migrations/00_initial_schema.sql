-- ============================================================
-- Masi App - Initial Database Schema
-- ============================================================
-- This migration creates the core database schema for the Masi App:
-- - users table (extends auth.users)
-- - children table
-- - time_entries table
-- - sessions table
--
-- Run this in Supabase SQL Editor to set up your database
-- ============================================================

-- Create job_title enum
CREATE TYPE job_title AS ENUM ('Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer');

-- ============================================================
-- USERS TABLE
-- ============================================================
-- Extends auth.users with additional profile information
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  job_title job_title NOT NULL,
  assigned_school TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- CHILDREN TABLE
-- ============================================================
-- Stores information about children that staff work with
CREATE TABLE IF NOT EXISTS children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  teacher TEXT NOT NULL,
  class TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age > 0 AND age < 18),
  school TEXT NOT NULL,
  group_name TEXT,
  assigned_staff_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE
);

-- Enable RLS
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (assigned_staff_id = auth.uid());

CREATE POLICY "Users can insert own children" ON children
  FOR INSERT WITH CHECK (assigned_staff_id = auth.uid());

CREATE POLICY "Users can update assigned children" ON children
  FOR UPDATE USING (assigned_staff_id = auth.uid());

CREATE POLICY "Users can delete assigned children" ON children
  FOR DELETE USING (assigned_staff_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_children_assigned_staff ON children(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_children_school ON children(school);

-- ============================================================
-- TIME ENTRIES TABLE
-- ============================================================
-- Tracks staff sign-in/sign-out times with GPS coordinates
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

-- RLS Policies
CREATE POLICY "Users can view own time entries" ON time_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own time entries" ON time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own time entries" ON time_entries
  FOR UPDATE USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_sign_in_time ON time_entries(sign_in_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_synced ON time_entries(synced);

-- ============================================================
-- SESSIONS TABLE
-- ============================================================
-- Records educational sessions with children
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  session_type TEXT NOT NULL,
  session_date DATE NOT NULL,
  children_ids UUID[] NOT NULL,
  activities JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions(synced);
CREATE INDEX IF NOT EXISTS idx_sessions_children_ids ON sessions USING GIN(children_ids);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update updated_at timestamp for users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- Update updated_at timestamp for children
CREATE OR REPLACE FUNCTION update_children_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER children_updated_at_trigger
  BEFORE UPDATE ON children
  FOR EACH ROW
  EXECUTE FUNCTION update_children_updated_at();

-- Update updated_at timestamp for sessions
CREATE OR REPLACE FUNCTION update_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at_trigger
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sessions_updated_at();

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Your database now has:
-- ✓ users table for staff profiles
-- ✓ children table for child records
-- ✓ time_entries table for time tracking
-- ✓ sessions table for educational sessions
-- ✓ Row-level security enabled on all tables
-- ✓ Indexes for optimal query performance
--
-- Next steps:
-- 1. Create your first user in Supabase Auth
-- 2. Add corresponding profile in users table
-- 3. Start using the app!
-- ============================================================
