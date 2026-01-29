# Supabase Database Migrations

This folder contains SQL migration files for the Masi App database schema.

## Migration Files

1. **00_initial_schema.sql** - Base database schema (required first)
   - Creates users, children, time_entries, sessions tables
   - Sets up Row Level Security (RLS) policies
   - Creates indexes for performance

2. **01_add_groups_feature.sql** - Groups feature (optional for Phase 3)
   - Creates groups and children_groups tables
   - Adds group_ids column to sessions table

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended for MVP)

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New query**
4. Copy and paste the contents of `00_initial_schema.sql`
5. Click **Run** or press `Cmd/Ctrl + Enter`
6. Verify success (you should see "Success. No rows returned")
7. Check **Table Editor** to confirm tables were created

### Option 2: Supabase CLI (For Production)

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push

# Or run individual migration
psql \
  -h your-db-host \
  -U postgres \
  -d postgres \
  -f supabase-migrations/00_initial_schema.sql
```

## Verification

After running migrations, verify in Supabase Dashboard:

1. **Table Editor** → Should see:
   - users
   - children
   - time_entries
   - sessions

2. **Authentication** → **Policies** → Check each table has RLS policies

3. **Database** → **Indexes** → Verify indexes were created

## Troubleshooting

### "relation already exists" error
- Tables already created, safe to ignore
- Or drop tables and re-run if you want fresh schema

### "permission denied" error
- Make sure you're using service_role key or postgres user
- RLS might be blocking, check policies

### Sync still failing after migration
1. Check that tables exist in Table Editor
2. Verify RLS policies are enabled
3. Check app logs for specific error messages
4. Ensure your Supabase URL and anon key are correct in .env

## Order of Operations

For a fresh Supabase project:

1. Create user in **Authentication** → **Users** → **Add user**
2. Run `00_initial_schema.sql` migration
3. Insert user profile in `users` table (use the auth.users UUID)
4. Test login in app
5. Create time entry in app
6. Pull to refresh → should sync to Supabase

## Schema Changes

When making schema changes:
1. Create new numbered migration file (e.g., `02_description.sql`)
2. Test migration on development database first
3. Document changes in this README
4. Run migration on production with backup

---

**Current Status**:
- ✅ Base schema (00) - Ready to run
- ✅ Groups feature (01) - Optional (for Phase 3)

**Next**: Run `00_initial_schema.sql` in Supabase SQL Editor to enable sync functionality.
