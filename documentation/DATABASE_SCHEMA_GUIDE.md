# Database Schema Design - A Learning Guide
### Understanding Relational Databases Through the Masi App Schema

---

## Welcome to Database Design 101

This guide teaches you fundamental database design principles by walking through a real-world schema. Whether you're new to databases or want to understand why we make certain design decisions, you'll learn the **why** behind database architecture, not just the **what**.

By the end, you'll understand:
- How relational databases organize data
- When to use different relationship types
- Why we need "helper" tables (junction tables)
- How to design for data integrity and performance
- Real-world trade-offs in schema design

---

## Part 1: The Foundation - What is a Relational Database?

### The Big Picture

Imagine you're organizing a library. You could write everything in one giant ledger:

```
Book: "Harry Potter" | Author: "J.K. Rowling" | Member: "John Doe" |
Member Address: "123 Main St" | Checkout Date: "2026-01-15" | ...
```

But what happens when:
- John moves? You'd update his address in every row he appears in
- A book has multiple authors? You'd duplicate the book information
- You want to find all books by an author? You'd scan every row

**This is messy, error-prone, and inefficient.**

### The Relational Model Solution

Instead, we break data into **entities** (things) and define **relationships** between them:

```
Books Table:
- Book ID: 1
- Title: "Harry Potter"
- Author ID: 42

Authors Table:
- Author ID: 42
- Name: "J.K. Rowling"

Members Table:
- Member ID: 7
- Name: "John Doe"
- Address: "123 Main St"

Checkouts Table:
- Book ID: 1
- Member ID: 7
- Date: "2026-01-15"
```

Now:
- John's address appears **once** - update it once, reflects everywhere
- Books and authors are separate - no duplication
- Finding an author's books is efficient - just look up Author ID 42

**This is the power of relational databases: organizing data into related tables.**

---

## Part 2: The Three Types of Relationships

Every relationship between tables falls into one of three categories. Understanding these is **fundamental** to database design.

### 1. One-to-Many (Most Common)

**Definition**: One record in Table A relates to multiple records in Table B, but each record in Table B relates to only one record in Table A.

**Real-world examples**:
- One author writes many books (but each book has one primary author)
- One customer places many orders (but each order belongs to one customer)
- One parent has many children (but each child has one biological mother)

**In the Masi App**:
- One **staff member** (user) has many **time entries**
- One **staff member** has many **children** assigned to them
- One **staff member** records many **sessions**

**How it works**:
```sql
-- Users table (the "one" side)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT
);

-- Time entries table (the "many" side)
CREATE TABLE time_entries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),  -- Foreign key pointing to users
  sign_in_time TIMESTAMP
);
```

**The foreign key (`user_id`) is the glue** that connects the tables. It says: "This time entry belongs to the user with this ID."

**Why it's powerful**:
- Retrieve all time entries for a user: `SELECT * FROM time_entries WHERE user_id = 'user_123'`
- User data (name, email) lives in one place
- Deleting a user can cascade delete their time entries (we'll discuss later)

### 2. One-to-One (Rare)

**Definition**: One record in Table A relates to exactly one record in Table B.

**Real-world examples**:
- One person has one passport (in most countries)
- One employee has one desk assignment

**In the Masi App**:
We have a one-to-one between `users` and `auth.users` (Supabase's authentication table):
```sql
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,  -- Same ID as auth user
  first_name TEXT,
  job_title TEXT
);
```

**Why separate tables?**
- `auth.users` is Supabase's system table (authentication data)
- `users` is our custom profile data (job title, school assignment)
- Separation of concerns: auth logic vs business logic

**When to use one-to-one**:
- Rarely! Usually you'd just add columns to one table
- Use when: separating concerns, optional data, or extending a system table you don't control

### 3. Many-to-Many (Requires Junction Table)

**Definition**: Multiple records in Table A relate to multiple records in Table B.

**Real-world examples**:
- Students enroll in many courses; each course has many students
- Books have many authors; authors write many books
- Actors appear in many movies; movies have many actors

**In the Masi App**:
- Children can belong to many groups
- Each group contains many children

**The Problem**: You can't directly represent this with foreign keys alone!

Let's explore why...

---

## Part 3: The Many-to-Many Problem (And Why We Need Junction Tables)

### The Problem Illustrated

Imagine we're tracking which children belong to which groups. Let's try to avoid junction tables:

**❌ Attempt 1: Add a foreign key to `children` table**
```sql
CREATE TABLE children (
  id UUID PRIMARY KEY,
  name TEXT,
  group_id UUID  -- Which group is this child in?
);
```

**Problem**: A child can only be in ONE group. What if they're in both "Advanced Reading" and "Math Group 2"?

**❌ Attempt 2: Use an array in `children` table**
```sql
CREATE TABLE children (
  id UUID PRIMARY KEY,
  name TEXT,
  group_ids UUID[]  -- Array of group IDs
);
```

**Problems**:
1. **Hard to query**: "Find all children in Group 2" requires scanning every row and checking arrays
2. **No referential integrity**: Database can't ensure group IDs are valid
3. **Awkward updates**: Adding/removing a child from a group means updating arrays
4. **No metadata**: Can't store when a child joined a group or their role in it

**❌ Attempt 3: Add comma-separated IDs**
```sql
CREATE TABLE children (
  id UUID PRIMARY KEY,
  name TEXT,
  group_ids TEXT  -- "uuid1,uuid2,uuid3"
);
```

**This is even worse!** Now you can't even use SQL to query properly. This violates **First Normal Form** (we'll discuss normalization later).

### ✅ The Solution: Junction Table (Bridge Table, Join Table)

**The insight**: The relationship itself is an entity that deserves its own table.

```sql
-- Children table (just child data)
CREATE TABLE children (
  id UUID PRIMARY KEY,
  first_name TEXT,
  last_name TEXT
);

-- Groups table (just group data)
CREATE TABLE groups (
  id UUID PRIMARY KEY,
  name TEXT,
  staff_id UUID REFERENCES users(id)
);

-- Junction table (just the relationships)
CREATE TABLE children_groups (
  id UUID PRIMARY KEY,
  child_id UUID REFERENCES children(id),
  group_id UUID REFERENCES groups(id),
  UNIQUE(child_id, group_id)  -- Can't add same child to same group twice
);
```

### How It Works

Let's walk through an example:

**Children**:
```
id: c1, name: "Alice"
id: c2, name: "Bob"
id: c3, name: "Carol"
```

**Groups**:
```
id: g1, name: "Group 2"
id: g2, name: "Advanced Reading"
```

**Children_Groups (the relationships)**:
```
child_id: c1, group_id: g1  -- Alice is in Group 2
child_id: c1, group_id: g2  -- Alice is ALSO in Advanced Reading
child_id: c2, group_id: g1  -- Bob is in Group 2
child_id: c3, group_id: g2  -- Carol is in Advanced Reading
```

**Now we can answer questions easily**:

**Q: Which children are in Group 2?**
```sql
SELECT c.first_name
FROM children c
JOIN children_groups cg ON c.id = cg.child_id
WHERE cg.group_id = 'g1';

-- Result: Alice, Bob
```

**Q: Which groups is Alice in?**
```sql
SELECT g.name
FROM groups g
JOIN children_groups cg ON g.id = cg.group_id
WHERE cg.child_id = 'c1';

-- Result: Group 2, Advanced Reading
```

**Q: How many children are in each group?**
```sql
SELECT g.name, COUNT(cg.child_id) as child_count
FROM groups g
LEFT JOIN children_groups cg ON g.id = cg.group_id
GROUP BY g.id, g.name;

-- Result:
-- Group 2: 2 children
-- Advanced Reading: 2 children
```

### The Power of Junction Tables

Junction tables enable:

1. **Flexibility**: Children can be in 0, 1, or many groups
2. **Efficient queries**: Database indexes make lookups fast
3. **Referential integrity**: Foreign keys ensure IDs are valid
4. **Metadata storage**: Can add columns like `joined_date`, `role`, `is_active`
5. **Easy updates**: Add/remove relationships without touching other tables

**This is why junction tables are the standard solution for many-to-many relationships.**

---

## Part 4: The Masi App Schema - Complete Walkthrough

Now let's explore our actual schema, understanding **why** each table exists and how they relate.

### The Entity-Relationship Diagram (Conceptual)

```
┌─────────────┐
│  auth.users │  (Supabase authentication)
└──────┬──────┘
       │ 1:1
       ▼
┌─────────────┐
│    users    │  (Staff profiles)
└──────┬──────┘
       │
       ├─── 1:many ───▶ ┌──────────────┐
       │                │ time_entries │
       │                └──────────────┘
       │
       ├─── 1:many ───▶ ┌──────────┐
       │                │ children │
       │                └────┬─────┘
       │                     │
       │                     │ many:many (via children_groups)
       │                     │
       │                ┌────▼─────┐
       ├─── 1:many ───▶│  groups  │
       │                └──────────┘
       │
       └─── 1:many ───▶ ┌──────────┐
                        │ sessions │
                        └──────────┘
```

### Table 1: `users` (Staff Profiles)

**Purpose**: Store information about field staff members.

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

**Design Decisions Explained**:

**Why extend `auth.users` instead of storing everything there?**
- `auth.users` is Supabase's system table for authentication (email, password hash, session tokens)
- We don't control its schema
- Separation of concerns: auth data vs profile data
- Our `users.id` references `auth.users.id` (one-to-one relationship)

**Why UUID instead of auto-incrementing integer?**
```sql
-- Could have used:
id SERIAL PRIMARY KEY  -- Auto-incrementing: 1, 2, 3, 4...

-- But we use:
id UUID PRIMARY KEY  -- Random: "550e8400-e29b-41d4-a716-446655440000"
```

**Advantages of UUIDs**:
- **Offline generation**: Staff can create records offline without worrying about ID conflicts
- **Distributed systems**: Multiple devices can generate IDs without coordination
- **Security**: Can't guess user IDs (no enumeration attacks)
- **Merging**: If two databases merge, no ID collisions

**Trade-offs**:
- Larger storage (16 bytes vs 4 bytes for integers)
- Slightly slower lookups (but indexes mitigate this)
- Not human-readable

**For offline-first apps like ours, UUIDs are the right choice.**

**Why CHECK constraint on job_title?**
```sql
CHECK (job_title IN ('Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer'))
```

This is **database-level validation**. Even if our app has a bug, the database prevents invalid data:
- Can't insert `job_title = 'Hacker'`
- Ensures session forms always have valid types
- Self-documenting: shows allowed values in schema

**Why timestamps (created_at, updated_at)?**
- **Auditing**: When was this user created?
- **Sync logic**: Has this record changed since last sync?
- **Debugging**: Timeline of data changes
- **Business logic**: "Users created in last month"

### Table 2: `children` (Students/Kids)

**Purpose**: Track information about children that staff work with.

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

**Design Decisions**:

**UPDATE (2026-01-30): Migrated to Many-to-Many Relationship**

**Original design** used `assigned_staff_id`:
```sql
assigned_staff_id UUID REFERENCES users(id)  -- One-to-many
```

This created a **one-to-many relationship**: one staff member has many assigned children, but **each child could only have ONE coach**.

**Problem discovered**: In real-world usage, children often need multiple coaches:
- A child might work with both a **Literacy Coach** and a **Numeracy Coach**
- A child might transition between coaches but historical records need to show who worked with them

**New design** uses a **junction table** for **many-to-many**:
```sql
-- The staff_children junction table
CREATE TABLE staff_children (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(staff_id, child_id)  -- Can't assign same child twice to same staff
);
```

**Benefits of many-to-many approach**:
1. **Flexibility**: One child can have multiple coaches (literacy + numeracy)
2. **Historical accuracy**: When a coach leaves, sessions still show which children they worked with
3. **Better queries**: "Show all coaches for this child" is now a simple join
4. **Less data duplication**: One child record shared across multiple coaches

**Migration strategy**:
1. Created new `staff_children` table
2. Migrated existing `assigned_staff_id` data to junction table
3. Updated RLS policies to query via junction table
4. **Did NOT delete** `assigned_staff_id` column yet (backward compatibility during transition)

**What `REFERENCES` does**:
1. **Referential integrity**: Can't assign a child to a non-existent user or child
2. **Cascade options**: `ON DELETE CASCADE` removes assignments when user/child deleted
3. **Index**: Database creates indexes for efficient lookups
4. **Documentation**: Schema shows the many-to-many relationship

**Why are teacher, class, age, school nullable?**

Notice these fields don't have `NOT NULL`:
```sql
teacher TEXT,      -- Can be NULL
class TEXT,        -- Can be NULL
age INTEGER,       -- Can be NULL
```

**Real-world reason**: Field staff may not have complete information when adding a child:
- They meet a child in the field
- Need to record a session with them immediately
- Can fill in details later

**Database design principle**: Don't make fields `NOT NULL` unless truly required for data integrity.

**Alternative approach we rejected**:
```sql
teacher TEXT NOT NULL DEFAULT 'Unknown',
age INTEGER NOT NULL DEFAULT 0,
```

**Why this is worse**:
- `DEFAULT 'Unknown'` vs `NULL` - both mean "we don't know," but `NULL` is explicit
- You can't distinguish "age is actually 0" vs "we don't know age"
- Querying for incomplete records: `WHERE age IS NULL` is clearer than `WHERE age = 0`

**Database wisdom**: Use `NULL` to represent missing data, not placeholder values.

### Table 3: `groups` (Child Groupings)

**Purpose**: Allow staff to organize children into named groups for easier session recording.

```sql
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  staff_id UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  UNIQUE(staff_id, name)  -- Each staff member's group names must be unique
);
```

**Design Decisions**:

**Why link groups to staff (`staff_id`)?**

Groups are **owned** by staff members:
- Different staff can have groups with the same name ("Group 2")
- Staff only see their own groups
- Deleting a staff member can delete their groups

**Why `UNIQUE(staff_id, name)`?**

This is a **composite unique constraint**:
```sql
UNIQUE(staff_id, name)
```

**What it prevents**:
```sql
-- ✅ Allowed: Different staff, same name
INSERT INTO groups (staff_id, name) VALUES ('staff1', 'Group 2');
INSERT INTO groups (staff_id, name) VALUES ('staff2', 'Group 2');

-- ❌ Prevented: Same staff, duplicate name
INSERT INTO groups (staff_id, name) VALUES ('staff1', 'Group 2');
INSERT INTO groups (staff_id, name) VALUES ('staff1', 'Group 2');  -- ERROR!
```

**Why this matters**:
- User interface can assume group names are unique per staff
- Prevents accidental duplicates
- Simplifies "select Group 2" logic (no ambiguity)

**Database principle**: Use unique constraints to enforce business rules at the database level.

**Why `synced BOOLEAN DEFAULT FALSE`?**

This field supports **offline-first architecture**:
- Record created offline: `synced = false`
- Successfully uploaded to server: `synced = true`
- Query unsynced items: `SELECT * FROM groups WHERE synced = false`

**This pattern appears in all tables that need offline sync.**

### Table 4: `children_groups` (Junction Table)

**Purpose**: Connect children to groups (many-to-many relationship).

```sql
CREATE TABLE children_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(child_id, group_id)
);
```

**Design Decisions**:

**Why does this table exist?** (Review from Part 3)

Without it, we couldn't represent:
- Alice is in both "Group 2" and "Advanced Reading"
- "Group 2" contains Alice, Bob, and Carol

**The junction table** is the **only clean way** to model many-to-many relationships in SQL.

**Why `ON DELETE CASCADE`?**
```sql
child_id UUID REFERENCES children(id) ON DELETE CASCADE
```

**What this means**:
- If a child is deleted from the `children` table...
- Automatically delete all their entries in `children_groups`

**Why this is good**:
- **Data integrity**: No orphaned references (group memberships for deleted children)
- **Automatic cleanup**: Don't need application logic to handle it
- **Consistency**: Database maintains consistency

**The cascade options**:
```sql
ON DELETE CASCADE    -- Delete related rows
ON DELETE SET NULL   -- Set foreign key to NULL
ON DELETE RESTRICT   -- Prevent deletion if references exist
ON DELETE NO ACTION  -- Similar to RESTRICT (default)
```

**For junction tables, CASCADE is almost always correct** because the relationship has no meaning without both entities.

**Why `UNIQUE(child_id, group_id)`?**

Prevents duplicate memberships:
```sql
-- ❌ Can't do this twice:
INSERT INTO children_groups (child_id, group_id) VALUES ('alice', 'group2');
INSERT INTO children_groups (child_id, group_id) VALUES ('alice', 'group2');  -- ERROR!
```

**Why this matters**:
- A child can't be in the same group twice (meaningless)
- UI can safely "add to group" without checking existence first
- Counting group members is accurate

**Why does the junction table have its own `id` column?**

Some developers debate this:
```sql
-- Option 1: Surrogate key (what we use)
CREATE TABLE children_groups (
  id UUID PRIMARY KEY,
  child_id UUID,
  group_id UUID,
  UNIQUE(child_id, group_id)
);

-- Option 2: Composite primary key
CREATE TABLE children_groups (
  child_id UUID,
  group_id UUID,
  PRIMARY KEY(child_id, group_id)
);
```

**Arguments for surrogate key (our choice)**:
- **Consistency**: All tables have an `id` column
- **Extensibility**: If we add metadata (role, joined_date), we might want to reference this row
- **ORM-friendly**: Many ORMs expect every table to have a single-column primary key
- **Simpler joins**: Some queries are easier with a single-column key

**Arguments for composite primary key**:
- **Smaller**: No extra UUID column
- **Explicit**: The composite key IS the uniqueness constraint (no separate UNIQUE needed)
- **Purity**: Reflects that the relationship itself is the identity

**There's no "wrong" answer** - we chose surrogate keys for consistency and flexibility.

### Table 5: `time_entries` (Clock In/Out Records)

**Purpose**: Track when staff sign in and sign out, with location data.

```sql
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  sign_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
  sign_in_lat DECIMAL,
  sign_in_lon DECIMAL,
  sign_out_time TIMESTAMP WITH TIME ZONE,
  sign_out_lat DECIMAL,
  sign_out_lon DECIMAL,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Design Decisions**:

**Why are sign-out fields nullable?**
```sql
sign_out_time TIMESTAMP WITH TIME ZONE,  -- Can be NULL
sign_out_lat DECIMAL,                     -- Can be NULL
sign_out_lon DECIMAL,                     -- Can be NULL
```

**Real-world workflow**:
1. Staff signs in → Create time entry with sign-in data
2. **Record exists with sign-out = NULL** (they're currently signed in)
3. Staff signs out → UPDATE the same record with sign-out data

**Query for "currently signed in"**:
```sql
SELECT * FROM time_entries
WHERE user_id = 'current_user'
AND sign_out_time IS NULL;
```

**Alternative approach we rejected**:
```sql
-- Create two separate records
INSERT INTO events (user_id, type, time) VALUES ('user1', 'sign_in', NOW());
INSERT INTO events (user_id, type, time) VALUES ('user1', 'sign_out', NOW());
```

**Why our approach is better**:
- **Atomicity**: One time entry = one work session (clear data model)
- **Easy reporting**: "Hours worked" is a single row: `sign_out_time - sign_in_time`
- **Constraint enforcement**: Can add `CHECK (sign_out_time > sign_in_time)`
- **Simpler queries**: Don't need to JOIN sign-in with sign-out events

**Database principle**: Model your tables to match your domain concepts (a "work session" is one thing, not two events).

**Why DECIMAL for lat/lon instead of FLOAT?**
```sql
sign_in_lat DECIMAL,  -- Not FLOAT
```

**The precision problem with floating point**:
```sql
-- FLOAT (approximate):
37.7749295  might be stored as  37.77492950000001

-- DECIMAL (exact):
37.7749295  is stored exactly as  37.7749295
```

For geographic coordinates:
- **DECIMAL**: Exact representation (good for lat/lon)
- **FLOAT/DOUBLE**: Approximation (faster for calculations, but imprecise)

**However**, modern PostGIS (PostgreSQL extension) recommends using `geography` type:
```sql
-- Even better for future:
location GEOGRAPHY(POINT, 4326)  -- WGS 84 coordinate system
```

But for our needs (simple lat/lon storage), DECIMAL is fine.

**Why `TIMESTAMP WITH TIME ZONE`?**
```sql
sign_in_time TIMESTAMP WITH TIME ZONE
```

**Always use `WITH TIME ZONE` for timestamps** (in most cases).

**Why?**
- Stores absolute point in time (UTC internally)
- Displays in user's timezone
- Handles daylight saving time correctly
- Avoids "is this local time or UTC?" confusion

**Example**:
```sql
-- User in New York signs in at 9 AM EST
sign_in_time = '2026-01-20 09:00:00-05'

-- Stored internally as:
'2026-01-20 14:00:00 UTC'

-- User in California queries → displays:
'2026-01-20 06:00:00-08'  (6 AM PST, same moment in time)
```

**Database wisdom**: Unless you have a specific reason not to, always use `TIMESTAMP WITH TIME ZONE`.

### Table 6: `sessions` (Educational Session Records)

**Purpose**: Record details of educational sessions staff conduct with children.

```sql
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  session_type TEXT NOT NULL,
  session_date DATE NOT NULL,
  children_ids UUID[] NOT NULL,
  group_ids UUID[],
  activities JSONB,
  notes TEXT,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Design Decisions**:

**Why store `children_ids` as an array?**
```sql
children_ids UUID[] NOT NULL
```

**Wait, didn't we say arrays are bad?** (See Part 3)

**When arrays are okay**:
- ✅ **Immutable relationships**: Session happened with these children (never changes)
- ✅ **Denormalized for performance**: Avoids join for simple queries
- ✅ **Order matters**: Array preserves order
- ✅ **Historical snapshot**: These specific children, at this moment

**When arrays are bad**:
- ❌ **Mutable relationships**: Children's group memberships change → use junction table
- ❌ **Need to query efficiently**: "All sessions for child X" → harder with arrays
- ❌ **Need referential integrity**: Arrays don't enforce foreign keys

**For sessions, we're storing a historical snapshot**: "On Jan 20, 2026, this session involved children A, B, and C." Even if those children are deleted later, we want the historical record.

**Alternative approach**:
```sql
-- Junction table for sessions
CREATE TABLE session_children (
  session_id UUID REFERENCES sessions(id),
  child_id UUID REFERENCES children(id),
  PRIMARY KEY(session_id, child_id)
);
```

**Why we chose array instead**:
- **Simpler queries**: `SELECT * FROM sessions WHERE 'child_id' = ANY(children_ids)`
- **Historical integrity**: Child deletions don't affect session history
- **Atomic updates**: Session and children are one write
- **Denormalized**: Faster reads (no join needed)

**Trade-off**: Harder to query "all sessions for child X" efficiently. We accept this because:
- Sessions are read for display (not frequent filtering by child)
- We can add an index: `CREATE INDEX ON sessions USING GIN(children_ids)`
- Offline-first: Arrays are easier to sync

**Why `group_ids UUID[]` in addition to `children_ids`?**
```sql
children_ids UUID[] NOT NULL,  -- The actual children in this session
group_ids UUID[],              -- Which groups were selected (optional)
```

**This stores both**:
1. **children_ids**: The resolved list of children (what actually happened)
2. **group_ids**: The groups that were selected (how it was recorded)

**Why both?**
- **Future-proof**: If group membership changes, we know the session was "Group 2"
- **Reporting**: "Sessions by group" even if group membership changes
- **Audit trail**: "User selected Group 2, which contained Alice and Bob at that time"

**Example**:
```json
{
  "session_id": "s1",
  "group_ids": ["g2"],           // "Group 2" was selected
  "children_ids": ["c1", "c2"]   // Which resolved to Alice and Bob
}
```

Later, if Carol joins Group 2:
- This session still shows Alice and Bob (accurate history)
- But we know it was a "Group 2 session" (useful for reporting)

**Why JSONB for activities?**
```sql
activities JSONB
```

**What is JSONB?**
- PostgreSQL's binary JSON storage format
- Stores structured data without a fixed schema
- Can query into JSON structure with SQL

**Why use it?**

Different session types have different fields:
```json
// Literacy Coach session
{
  "letters_worked_on": ["A", "B", "C"],
  "reading_level": "Level 2",
  "books_read": ["Cat in the Hat"]
}

// Numeracy Coach session
{
  "numbers_practiced": [1, 2, 3, 4, 5],
  "concepts": ["addition", "counting"],
  "problems_solved": 12
}
```

**Alternatives we rejected**:

**Option 1: Separate tables for each session type**
```sql
CREATE TABLE literacy_sessions (
  session_id UUID REFERENCES sessions(id),
  letters_worked_on TEXT[],
  reading_level TEXT
);

CREATE TABLE numeracy_sessions (
  session_id UUID REFERENCES sessions(id),
  numbers_practiced INTEGER[],
  concepts TEXT[]
);
```

**Problems**:
- **Schema rigidity**: Adding a field requires migration
- **Offline complexity**: More tables to sync
- **Overhead**: 4 extra tables for something rarely queried

**Option 2: EAV (Entity-Attribute-Value) model**
```sql
CREATE TABLE session_attributes (
  session_id UUID,
  attribute_name TEXT,
  attribute_value TEXT
);

-- Represents:
-- session_1, "letters_worked_on", "A,B,C"
-- session_1, "reading_level", "Level 2"
```

**Problems**:
- **Query nightmare**: Need to pivot/join to reassemble data
- **Type safety**: Everything is TEXT
- **Performance**: Terrible for any real queries

**Why JSONB wins**:
- ✅ **Flexible schema**: Each session type can have different fields
- ✅ **Easy to extend**: Add new fields without migrations
- ✅ **Queryable**: Can still query into JSON: `activities->>'reading_level'`
- ✅ **Indexes**: Can index JSON paths for performance
- ✅ **Type safe (enough)**: JSON has types (strings, numbers, arrays, objects)
- ✅ **Offline-friendly**: Easy to sync as a blob

**Trade-offs**:
- ❌ No schema validation in database (but we validate in app)
- ❌ Slightly harder queries than columns
- ❌ Can't enforce foreign keys on values inside JSON

**For flexible, evolving data that doesn't need complex querying, JSONB is excellent.**

---

## Part 5: Advanced Concepts

### Referential Integrity and Cascading Deletes

**What is referential integrity?**

The database ensures foreign keys point to valid records:
```sql
child_id UUID REFERENCES children(id)
```

**Guarantees**:
- Can't insert a `child_id` that doesn't exist in `children`
- Can't delete a child if they're referenced (unless CASCADE)

**What happens when you delete a referenced record?**

```sql
-- We have:
user_id = 'u1' in users table
time_entry with user_id = 'u1'

-- What happens if we DELETE user 'u1'?
```

**Options**:

```sql
-- RESTRICT (default) - Prevent deletion
user_id UUID REFERENCES users(id) ON DELETE RESTRICT
-- Deletion fails with error

-- CASCADE - Delete related rows
user_id UUID REFERENCES users(id) ON DELETE CASCADE
-- All time entries for user 'u1' are deleted

-- SET NULL - Set foreign key to NULL
user_id UUID REFERENCES users(id) ON DELETE SET NULL
-- Time entries remain, but user_id becomes NULL

-- NO ACTION - Similar to RESTRICT
user_id UUID REFERENCES users(id) ON DELETE NO ACTION
```

**When to use each**:

**CASCADE**: Relationship is dependent
- Example: Deleting a group should delete its memberships
- "If the parent is gone, the children are meaningless"

**RESTRICT**: Relationship is important to preserve
- Example: Can't delete a staff member who has recorded sessions
- "History must be preserved"

**SET NULL**: Relationship is optional
- Example: Deleting a teacher sets `teacher_id` to NULL in students
- "The reference is helpful but not essential"

**In Masi app**:
```sql
-- Time entries: CASCADE (no user → no time entries make sense)
user_id REFERENCES users(id) ON DELETE CASCADE

-- Sessions: RESTRICT (preserve historical records)
user_id REFERENCES users(id) ON DELETE RESTRICT

-- Children groups: CASCADE (no group → memberships are meaningless)
group_id REFERENCES groups(id) ON DELETE CASCADE
```

### Indexes and Performance

**What is an index?**

Think of a book index:
- Book: "Harry Potter" appears on pages 5, 47, 203
- Without index: Read entire book to find "Harry Potter"
- With index: Jump directly to pages 5, 47, 203

**Database indexes work similarly**:
```sql
-- Without index
SELECT * FROM sessions WHERE user_id = 'u1';
-- Database scans all rows (slow for millions of rows)

-- With index
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
-- Database jumps directly to matching rows (fast)
```

**PostgreSQL automatically creates indexes for**:
- Primary keys
- Unique constraints
- Foreign keys (sometimes)

**We manually create indexes for**:
```sql
-- Frequently queried columns
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_children_assigned_staff_id ON children(assigned_staff_id);

-- Array queries
CREATE INDEX idx_sessions_children_ids ON sessions USING GIN(children_ids);
CREATE INDEX idx_sessions_group_ids ON sessions USING GIN(group_ids);
```

**GIN indexes** (Generalized Inverted Index):
- Special index type for arrays, JSONB, full-text search
- Enables fast `ANY` queries: `WHERE 'child_id' = ANY(children_ids)`

**Trade-offs**:
- ✅ **Faster reads**: Queries are much faster
- ❌ **Slower writes**: Inserts/updates must update indexes
- ❌ **Storage**: Indexes take disk space

**Rule of thumb**: Index columns you frequently filter/join on, but don't over-index.

### Normalization

**What is normalization?**

A series of rules (normal forms) for organizing data to reduce redundancy.

**First Normal Form (1NF)**:
- Each column contains atomic (indivisible) values
- No repeating groups

**❌ Violates 1NF**:
```sql
CREATE TABLE students (
  id INT,
  name TEXT,
  courses TEXT  -- "Math,Science,History" (comma-separated)
);
```

**✅ Satisfies 1NF**:
```sql
CREATE TABLE students (
  id INT,
  name TEXT
);

CREATE TABLE enrollments (
  student_id INT,
  course TEXT
);
```

**Second Normal Form (2NF)**:
- Must be in 1NF
- All non-key columns depend on the entire primary key

**❌ Violates 2NF**:
```sql
CREATE TABLE session_children (
  session_id UUID,
  child_id UUID,
  child_name TEXT,  -- Depends only on child_id, not on (session_id, child_id)
  PRIMARY KEY(session_id, child_id)
);
```

Child name should be in the `children` table, not duplicated here.

**✅ Satisfies 2NF**:
```sql
CREATE TABLE session_children (
  session_id UUID,
  child_id UUID,  -- Look up child_name from children table
  PRIMARY KEY(session_id, child_id)
);
```

**Third Normal Form (3NF)**:
- Must be in 2NF
- No transitive dependencies (non-key columns depend only on primary key)

**❌ Violates 3NF**:
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID,
  user_name TEXT,  -- Transitively depends on id (via user_id)
  user_school TEXT
);
```

User name and school should be in `users` table.

**✅ Satisfies 3NF**:
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id)  -- Join to get user details
);
```

**Why normalize?**
- **Reduce redundancy**: Data stored once
- **Update anomalies**: Change in one place reflects everywhere
- **Data integrity**: Constraints ensure consistency

**When to denormalize** (intentionally violate normal forms):
- **Performance**: Avoid expensive joins
- **Historical snapshots**: Store state at a point in time
- **Read-heavy systems**: Optimize for reads over writes

**Example in Masi app** (denormalization):
```sql
-- We store children_ids in sessions (denormalized)
-- Instead of a junction table (normalized)
-- Because: Historical snapshot, read performance
```

**Database wisdom**: Normalize until it hurts, denormalize until it works.

---

## Part 6: The Big Picture - Lessons Learned

### 1. **Entities vs Relationships**

**Entities** (things that exist independently):
- Users, Children, Groups

**Relationships** (connections between entities):
- "User works with Child" → `children.assigned_staff_id`
- "Child belongs to Group" → `children_groups` junction table

**Design principle**: Identify your entities first, then model their relationships.

### 2. **One-to-Many vs Many-to-Many**

**One-to-Many**: Use a foreign key in the "many" table
```sql
CREATE TABLE children (
  assigned_staff_id UUID REFERENCES users(id)  -- Many children, one staff
);
```

**Many-to-Many**: Use a junction table
```sql
CREATE TABLE children_groups (
  child_id UUID REFERENCES children(id),
  group_id UUID REFERENCES groups(id)
);
```

**Never store comma-separated IDs or use arrays for active relationships.**

### 3. **Constraints are Your Friend**

Use database constraints to enforce business rules:
- `NOT NULL`: Required fields
- `UNIQUE`: No duplicates
- `CHECK`: Value validation
- `FOREIGN KEY`: Referential integrity

**Benefits**:
- **Defense in depth**: Even if app has bugs, database enforces rules
- **Documentation**: Schema shows rules
- **Performance**: Database optimizes with knowledge of constraints

### 4. **NULL vs Default Values**

**Use NULL for missing data**:
```sql
age INTEGER  -- NULL means "we don't know"
```

**Use DEFAULT for actual default values**:
```sql
synced BOOLEAN DEFAULT FALSE  -- FALSE is the actual initial state
created_at TIMESTAMP DEFAULT NOW()  -- NOW() is the actual creation time
```

**Don't use placeholders** like `DEFAULT 'Unknown'` or `DEFAULT 0`.

### 5. **UUIDs for Distributed Systems**

For offline-first apps:
- ✅ Use UUIDs (can generate offline)
- ❌ Avoid auto-increment (requires server coordination)

### 6. **Timestamps are Essential**

Always include:
```sql
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

**Benefits**: Auditing, debugging, sync logic, business queries.

### 7. **JSONB for Flexible Data**

When schema varies by type or evolves frequently:
- ✅ Use JSONB (queryable, flexible)
- ❌ Avoid separate tables for small differences
- ❌ Avoid EAV model (query nightmare)

### 8. **Denormalization is a Tool**

Sometimes violating normal forms is correct:
- **Historical snapshots**: Store state at a point in time
- **Performance**: Avoid expensive joins
- **Read optimization**: Optimize for your query patterns

**But**: Default to normalized, denormalize intentionally.

### 9. **Indexes for Performance**

Index columns you frequently:
- Filter on (`WHERE user_id = 'x'`)
- Join on (`JOIN children ON children.assigned_staff_id = users.id`)
- Sort by (`ORDER BY created_at`)

**But**: Don't over-index (slows writes, wastes space).

### 10. **Cascading Deletes**

Think carefully about `ON DELETE`:
- **CASCADE**: Dependent data (junction tables, owned entities)
- **RESTRICT**: Important historical data (sessions, time entries)
- **SET NULL**: Optional relationships

---

## Part 7: Exercises for Deeper Understanding

### Exercise 1: Design a Many-to-Many

**Scenario**: Add a feature where staff can tag children with multiple skills ("reading", "math", "creative"), and each skill can be applied to multiple children.

**Design questions**:
1. What tables do you need?
2. What are the foreign keys?
3. What constraints should you add?
4. What indexes would help performance?

<details>
<summary>Solution</summary>

```sql
-- Option 1: Predefined skills
CREATE TABLE skills (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE children_skills (
  id UUID PRIMARY KEY,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level TEXT,  -- Metadata: "beginner", "intermediate", "advanced"
  assessed_date DATE,
  UNIQUE(child_id, skill_id)
);

-- Indexes
CREATE INDEX idx_children_skills_child_id ON children_skills(child_id);
CREATE INDEX idx_children_skills_skill_id ON children_skills(skill_id);

-- Option 2: Freeform tags (simpler, less rigid)
ALTER TABLE children ADD COLUMN skills TEXT[];
CREATE INDEX idx_children_skills ON children USING GIN(skills);
```

**Trade-offs**:
- Option 1: Normalized, referential integrity, can add metadata
- Option 2: Simpler, flexible, but no skill validation
</details>

### Exercise 2: Query Practice

Given our schema, write SQL for:
1. Find all children in "Group 2"
2. Count how many sessions each staff member recorded
3. Find children not in any group
4. Get all time entries for a user in January 2026

<details>
<summary>Solutions</summary>

```sql
-- 1. All children in "Group 2"
SELECT c.*
FROM children c
JOIN children_groups cg ON c.id = cg.child_id
JOIN groups g ON cg.group_id = g.id
WHERE g.name = 'Group 2';

-- 2. Session count per staff
SELECT u.first_name, u.last_name, COUNT(s.id) as session_count
FROM users u
LEFT JOIN sessions s ON u.id = s.user_id
GROUP BY u.id, u.first_name, u.last_name
ORDER BY session_count DESC;

-- 3. Children not in any group
SELECT c.*
FROM children c
LEFT JOIN children_groups cg ON c.id = cg.child_id
WHERE cg.child_id IS NULL;

-- 4. Time entries for user in January 2026
SELECT *
FROM time_entries
WHERE user_id = 'target_user_id'
AND sign_in_time >= '2026-01-01'
AND sign_in_time < '2026-02-01';
```
</details>

### Exercise 3: Schema Evolution

**Scenario**: The nonprofit wants to track attendance for each session (which children actually showed up vs were planned).

**Design questions**:
1. How would you modify the schema?
2. What are the trade-offs of different approaches?

<details>
<summary>Discussion</summary>

**Option 1**: Add attendance array to sessions
```sql
ALTER TABLE sessions ADD COLUMN attended_children_ids UUID[];
```

**Pros**: Simple, keeps all session data together
**Cons**: Redundancy with children_ids, array queries

**Option 2**: Junction table with attendance flag
```sql
CREATE TABLE session_attendance (
  session_id UUID REFERENCES sessions(id),
  child_id UUID,
  planned BOOLEAN,
  attended BOOLEAN,
  PRIMARY KEY(session_id, child_id)
);
```

**Pros**: Normalized, flexible, can add notes/reasons
**Cons**: More complex queries, more tables to sync

**Option 3**: Keep children_ids, add JSONB attendance details
```sql
ALTER TABLE sessions ADD COLUMN attendance JSONB;
-- Example: {"planned": ["c1", "c2"], "attended": ["c1"], "absent": ["c2"]}
```

**Pros**: Flexible, all session data together
**Cons**: Less queryable than separate table

**Best choice depends on**:
- How often you query attendance separately
- How complex attendance tracking becomes
- Offline sync complexity considerations
</details>

---

## Conclusion: Database Design is Design

Database schema is not just "storage" - it's a fundamental design decision that affects:
- **Performance**: Query speed, index strategy
- **Data integrity**: What the database guarantees
- **Application complexity**: How hard is the app code?
- **Maintainability**: How easy to evolve?
- **Correctness**: Can invalid states exist?

**Good database design**:
- Models the domain clearly
- Enforces business rules
- Balances normalization with performance
- Uses constraints to prevent bugs
- Evolves gracefully

**The Masi app schema demonstrates**:
- One-to-many relationships (users → children)
- Many-to-many relationships (children ↔ groups)
- Appropriate use of constraints
- Thoughtful use of NULL vs NOT NULL
- Strategic denormalization (arrays in sessions)
- Offline-first design patterns

**Keep learning**:
- Practice designing schemas for real problems
- Study existing schemas (open source projects)
- Understand query performance (EXPLAIN ANALYZE)
- Learn about migrations and schema evolution

**Final wisdom**: The best schema is the one that makes your application simple, correct, and fast - in that order.

---

**Last Updated**: 2026-01-20
**Author**: Claude, your database professor 🎓
