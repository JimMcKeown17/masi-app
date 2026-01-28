# Chapter 5: Authentication & Security - Layers of Protection

## Invitation System

**Decision**: Admin sends email invitations, user sets password via link

**Why?**
- **Controlled access**: Only invited users can create accounts
- **Email verification**: Built-in email confirmation
- **Professional**: Better UX than manual account creation

**Flow**:
1. Admin uses Supabase dashboard to send invite
2. User receives email with magic link
3. User clicks link, sets password
4. App auto-creates profile in `users` table (via trigger or manual insert)

## Row Level Security (RLS)

**What is RLS?**

Database-level security that filters queries automatically based on the user making the request.

**Example**:
```sql
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (assigned_staff_id = auth.uid());
```

**What this does**:
- User A queries: `SELECT * FROM children`
- Database automatically adds: `WHERE assigned_staff_id = 'user_a_id'`
- User A only sees their children, can't even write a query to see others

**Why RLS instead of app-level filtering?**
- **Defense in depth**: Even if app has a bug, database enforces security
- **Impossible to bypass**: No SQL injection or API manipulation can circumvent
- **Audit compliance**: Database logs prove data access is controlled

**Our RLS policies**:
- Users see only their own profile
- Users see only children assigned to them
- Users see only their own time entries
- Users see only their own sessions

**Development vs Production**:
- Development: Start with lenient policies for faster iteration
- Production: Lock down with strict policies before launch
- Testing: Use test accounts to verify RLS is working correctly

---

**Last Updated**: 2026-01-27
