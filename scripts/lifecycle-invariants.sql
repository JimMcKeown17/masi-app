-- Daily lifecycle invariant check (lifecycle-safety plan step H1; run by the /bug-sync sweep).
-- Read-only: one SELECT, no psql variables, so the staging query helper can run it as a string:
--   npm run sqlite:staging:query -- "$(cat scripts/lifecycle-invariants.sql)"
-- Each row is one hit. check_name says which invariant failed, entity_table/entity_id name the
-- row to look at, and detail holds the evidence. Zero rows means every check passed.
-- "Held" uses the same three arms as private.current_user_can_write_for_child: an active
-- delivery assignment; an active class assignment plus an open class membership; an active
-- group assignment plus an open group membership. archived_at grants nothing and removes nothing.
-- Proven on disposable PostgreSQL by npm run verify:ho-lifecycle:postgres (one hit per check).
WITH child_holders AS (
  SELECT cea.child_id, cea.user_id AS ea_user_id, 'direct' AS path, cea.id AS assignment_id
  FROM public.child_ea_assignments cea
  WHERE cea.unassigned_at IS NULL
  UNION ALL
  SELECT ccm.child_id, cls.ea_user_id, 'class', cls.id
  FROM public.class_ea_assignments cls
  JOIN public.child_class_memberships ccm ON ccm.class_id = cls.class_id AND ccm.exited_at IS NULL
  WHERE cls.unassigned_at IS NULL
  UNION ALL
  SELECT cgm.child_id, grp.ea_user_id, 'group', grp.id
  FROM public.group_ea_assignments grp
  JOIN public.child_group_memberships cgm ON cgm.group_id = grp.group_id AND cgm.removed_at IS NULL
  WHERE grp.unassigned_at IS NULL
),
-- The newest receipt that carries a delivery block (schema 2) per reporter; its outbox summary
-- is what the phone held when it last reported. Phone-supplied JSON: only numbers are counted.
latest_receipt AS (
  SELECT DISTINCT ON (r.reporter_id) r.reporter_id, r.kind, r.received_at,
    CASE WHEN pg_catalog.jsonb_typeof(r.delivery #> '{outboxSummary,byStatus}') = 'object'
      THEN r.delivery #> '{outboxSummary,byStatus}' ELSE '{}'::jsonb END AS by_status
  FROM public.mobile_support_incidents r
  WHERE r.delivery IS NOT NULL
  ORDER BY r.reporter_id, r.received_at DESC, r.id DESC
),
backlog AS (
  SELECT l.reporter_id, l.kind, l.received_at,
    coalesce(sum(s.value::text::numeric) FILTER (WHERE s.key IN ('pending', 'in_flight', 'failed')), 0) AS waiting,
    coalesce(sum(s.value::text::numeric) FILTER (WHERE s.key = 'terminal'), 0) AS needs_attention
  FROM latest_receipt l
  LEFT JOIN LATERAL pg_catalog.jsonb_each(l.by_status) s ON pg_catalog.jsonb_typeof(s.value) = 'number'
  GROUP BY l.reporter_id, l.kind, l.received_at
),
hits AS (
  -- Archived children, classes or groups that someone can still write for.
  SELECT 'archived_child_still_held'::text AS check_name, 'children'::text AS entity_table, c.id AS entity_id,
    pg_catalog.jsonb_build_object('archived_at', c.archived_at, 'holders', pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('ea_user_id', h.ea_user_id, 'path', h.path, 'assignment_id', h.assignment_id)
      ORDER BY h.path, h.ea_user_id, h.assignment_id)) AS detail
  FROM public.children c
  JOIN child_holders h ON h.child_id = c.id
  WHERE c.archived_at IS NOT NULL
  GROUP BY c.id, c.archived_at
  UNION ALL
  SELECT 'archived_class_still_assigned', 'classes', cl.id,
    pg_catalog.jsonb_build_object('archived_at', cl.archived_at, 'assignments', pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', a.id, 'ea_user_id', a.ea_user_id, 'programme_id', a.programme_id) ORDER BY a.id))
  FROM public.classes cl
  JOIN public.class_ea_assignments a ON a.class_id = cl.id AND a.unassigned_at IS NULL
  WHERE cl.archived_at IS NOT NULL
  GROUP BY cl.id, cl.archived_at
  UNION ALL
  SELECT 'archived_group_still_assigned', 'groups', g.id,
    pg_catalog.jsonb_build_object('archived_at', g.archived_at, 'assignments', pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', a.id, 'ea_user_id', a.ea_user_id) ORDER BY a.id))
  FROM public.groups g
  JOIN public.group_ea_assignments a ON a.group_id = g.id AND a.unassigned_at IS NULL
  WHERE g.archived_at IS NOT NULL
  GROUP BY g.id, g.archived_at
  UNION ALL
  -- Live groups whose class is archived.
  SELECT 'live_group_in_archived_class', 'groups', g.id,
    pg_catalog.jsonb_build_object('class_id', cl.id, 'class_archived_at', cl.archived_at)
  FROM public.groups g
  JOIN public.classes cl ON cl.id = g.class_id
  WHERE g.archived_at IS NULL AND cl.archived_at IS NOT NULL
  UNION ALL
  -- Unarchived children and classes with no active holder.
  SELECT 'unheld_live_child', 'children', c.id,
    pg_catalog.jsonb_build_object('created_by', c.created_by, 'created_at', c.created_at)
  FROM public.children c
  WHERE c.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM child_holders h WHERE h.child_id = c.id)
  UNION ALL
  SELECT 'unheld_live_class', 'classes', cl.id,
    pg_catalog.jsonb_build_object('name', cl.name, 'created_by', cl.created_by, 'created_at', cl.created_at)
  FROM public.classes cl
  WHERE cl.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.class_ea_assignments a WHERE a.class_id = cl.id AND a.unassigned_at IS NULL)
  UNION ALL
  -- Unarchived delivery children with no open membership in a non-archived class: they drop
  -- out of My Children (MA-BUG-20261104-014, -015).
  SELECT 'delivery_child_without_live_class', 'children', c.id,
    pg_catalog.jsonb_build_object('deliverers', (SELECT pg_catalog.jsonb_agg(cea.user_id ORDER BY cea.user_id)
      FROM public.child_ea_assignments cea WHERE cea.child_id = c.id AND cea.unassigned_at IS NULL))
  FROM public.children c
  WHERE c.archived_at IS NULL
    AND EXISTS (SELECT 1 FROM public.child_ea_assignments cea WHERE cea.child_id = c.id AND cea.unassigned_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.child_class_memberships ccm
      JOIN public.classes cl ON cl.id = ccm.class_id
      WHERE ccm.child_id = c.id AND ccm.exited_at IS NULL AND cl.archived_at IS NULL)
  UNION ALL
  -- Duplicate active (child_id, group_id) memberships (MA-BUG-20261104-017).
  SELECT 'duplicate_active_group_membership', 'children', cgm.child_id,
    pg_catalog.jsonb_build_object('group_id', cgm.group_id, 'membership_ids',
      pg_catalog.jsonb_agg(cgm.id ORDER BY cgm.id))
  FROM public.child_group_memberships cgm
  WHERE cgm.removed_at IS NULL
  GROUP BY cgm.child_id, cgm.group_id
  HAVING count(*) > 1
  UNION ALL
  -- upload_terminal receipts by table and code (the receipt ledger is immutable).
  SELECT 'upload_terminal_receipts', r.payload ->> 'table', NULL::uuid,
    pg_catalog.jsonb_build_object('error_code', r.payload ->> 'errorCode',
      'error_classes', pg_catalog.jsonb_agg(DISTINCT r.payload ->> 'errorClass'),
      'receipts', count(*), 'reporters', count(DISTINCT r.reporter_id),
      'first_received_at', min(r.received_at), 'latest_received_at', max(r.received_at))
  FROM public.mobile_support_incidents r
  WHERE r.kind = 'upload_terminal'
  GROUP BY r.payload ->> 'table', r.payload ->> 'errorCode'
  UNION ALL
  -- Suspended EAs whose newest receipt shows work still waiting, or who never sent one. A
  -- suspended login cannot upload: restore, let the phone upload, then suspend again.
  SELECT 'suspended_ea_with_backlog', 'users', a.id,
    pg_catalog.jsonb_build_object('email', a.email, 'banned_until', a.banned_until,
      'latest_receipt_at', b.received_at, 'latest_receipt_kind', b.kind,
      'waiting', b.waiting, 'needs_attention', b.needs_attention,
      'backlog', CASE WHEN b.reporter_id IS NULL THEN 'unknown, no receipt' ELSE 'waiting' END)
  FROM auth.users a
  JOIN public.users u ON u.id = a.id
  LEFT JOIN backlog b ON b.reporter_id = a.id
  WHERE a.banned_until > pg_catalog.now()
    AND (b.reporter_id IS NULL OR b.waiting > 0)
)
SELECT check_name, entity_table, entity_id, detail
FROM hits
ORDER BY check_name, entity_table, entity_id;
