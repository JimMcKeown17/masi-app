# Chapter 4: Database Design - Schema as Contract

## Core Principle: The Database Enforces Truth

We use PostgreSQL (via Supabase) with careful schema design to ensure data integrity.

## The Users Table

```sql
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  job_title TEXT NOT NULL CHECK (job_title IN ('Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer')),
  assigned_school TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Key decisions**:
- `id` references `auth.users`: One source of truth for authentication
- `job_title` has CHECK constraint: Database prevents invalid values (no app bug can violate this)
- `NOT NULL` on critical fields: No partial user records
- `updated_at`: Enables sync conflict detection if needed later

## The Children Table (Original)

```sql
CREATE TABLE children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  teacher TEXT,
  class TEXT,
  age INTEGER,
  school TEXT,
  assigned_staff_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Design note**: `teacher`, `class`, `age`, `school` are nullable because staff may not have all info when adding a child in the field.

## The Groups Feature - Schema Evolution

**New requirement**: Staff need to group children (e.g., "Group 2") and select entire groups for sessions.

**Initial thought**: Add `group_name TEXT` column to `children` table.

**Problem**: What if a child is in multiple groups? Or groups change frequently?

**Better design**: Many-to-many relationship via junction table.

```sql
-- Groups table
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  staff_id UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE
);

-- Junction table for many-to-many
CREATE TABLE children_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(child_id, group_id)  -- Prevent duplicate relationships
);
```

**Why this design?**
- **Flexibility**: Child can be in multiple groups
- **Normalization**: Group names stored once, not duplicated per child
- **Cascading deletes**: If group deleted, relationships auto-removed
- **UNIQUE constraint**: Can't accidentally add child to same group twice
- **Staff ownership**: Each group belongs to a staff member (groups aren't shared across staff)

**Sessions table update**:
```sql
ALTER TABLE sessions
ADD COLUMN group_ids UUID[];  -- Array of group IDs used in this session
```

**Why track group IDs in sessions?**
- Historical record: "Session was with Group 2" even if group membership changes later
- Audit trail: Know which groups were active at time of session
- Reporting: "How many sessions did Group 2 have this month?"

---

**Last Updated**: 2026-01-27
