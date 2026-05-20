#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * loadTestUsers.js
 *
 * Bulk-onboard field testers: creates Supabase auth users and matching
 * public.users rows from a simple CSV.
 *
 * Expected CSV columns:
 *   first_name,surname,email,device,job_title,school
 *
 * - `device` is informational only (Android/iOS) and is not stored anywhere.
 * - `job_title` is the display name from public.job_titles (e.g. "Literacy Coach").
 *   Lookup is case-insensitive against job_titles.name.
 * - `school` is the school name (e.g. "Aaron Gqadu"). Matching uses the same
 *   canonical-name normalizer as seedSchools.js, so casing / punctuation /
 *   trailing whitespace differences are tolerated.
 *   You can use `school_uid` (e.g. "SCH-00276") instead if you prefer
 *   explicit ids — if both columns are present, school_uid wins.
 *
 * Idempotency:
 *   - If the auth user already exists, we reuse their id (we DO NOT change
 *     their password).
 *   - public.users is upserted by id, so re-running updates the profile.
 *
 * Transition-window note:
 *   We populate BOTH legacy text columns (users.job_title, users.assigned_school)
 *   AND the FK columns (job_title_id, school_id). The legacy columns are still
 *   NOT NULL in prod and the running app still reads them. Once all field
 *   devices are on the post-migration build, drop the legacy fields from
 *   buildProfile() below.
 *
 * Usage:
 *   node scripts/loadTestUsers.js [--dry-run] [--password=...] <path-to-csv>
 *   node scripts/loadTestUsers.js --list-schools
 *   node scripts/loadTestUsers.js --list-job-titles
 *
 * Env vars (read from process.env; load via `env $(grep -v '^#' .env.local | xargs)` or your shell):
 *   MASI_SUPABASE_URL              (or SUPABASE_URL, or EXPO_PUBLIC_SUPABASE_URL)
 *   MASI_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCsvFile } = require('./lib/parseCsv');
const { canonicalSchoolName } = require('./lib/canonicalSchoolName');

const SUPABASE_URL =
  process.env.MASI_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.MASI_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_PASSWORD = 'MasiTest123!';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const listSchools = args.includes('--list-schools');
const listJobTitles = args.includes('--list-job-titles');
const passwordArg = args.find(a => a.startsWith('--password='));
const password = passwordArg ? passwordArg.split('=').slice(1).join('=') : DEFAULT_PASSWORD;
const csvArg = args.find(a => !a.startsWith('--') && a !== '--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars.');
  console.error('  Need: MASI_SUPABASE_URL (or SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL)');
  console.error('  Need: MASI_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  console.error('');
  console.error('Quick way to source .env.local in zsh:');
  console.error('  set -a && source .env.local && set +a');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function usage() {
  console.error('Usage:');
  console.error('  node scripts/loadTestUsers.js [--dry-run] [--password=Foo123!] <path-to-csv>');
  console.error('  node scripts/loadTestUsers.js --list-schools');
  console.error('  node scripts/loadTestUsers.js --list-job-titles');
  console.error('');
  console.error('CSV columns: first_name,surname,email,device,job_title,school');
  console.error('  (school can be the school name OR you can use school_uid instead)');
}

if (!listSchools && !listJobTitles && !csvArg) {
  usage();
  process.exit(1);
}

function required(value, field, rowNumber) {
  if (!value || !String(value).trim()) {
    throw new Error(`Line ${rowNumber}: missing ${field}`);
  }
}

function normalizeRows(rows) {
  return rows.map((row, index) => {
    const lineNumber = index + 2; // +1 for header, +1 for 1-indexed
    const schoolUid = row.school_uid?.trim();
    const schoolName = (row.school || row.school_name)?.trim();
    const normalized = {
      first_name: row.first_name?.trim(),
      last_name: (row.last_name || row.surname)?.trim(),
      email: row.email?.trim().toLowerCase(),
      job_title_name: row.job_title?.trim(),
      school_uid: schoolUid || null,
      school_name: schoolName || null,
      __line: lineNumber,
    };

    required(normalized.first_name, 'first_name', lineNumber);
    required(normalized.last_name, 'surname (or last_name)', lineNumber);
    required(normalized.email, 'email', lineNumber);
    required(normalized.job_title_name, 'job_title', lineNumber);
    if (!normalized.school_uid && !normalized.school_name) {
      throw new Error(`Line ${lineNumber}: need either school or school_uid`);
    }
    return normalized;
  });
}

async function loadLookups(rows) {
  // Case-insensitive job title lookup against public.job_titles.name
  const { data: jobTitles, error: jobError } = await admin
    .from('job_titles')
    .select('id,code,name,is_active');
  if (jobError) throw jobError;

  const jobTitleByLowerName = new Map(
    (jobTitles || []).map(jt => [jt.name.toLowerCase(), jt])
  );

  // Pull every school once; map by school_uid AND by canonical name.
  // (Cheaper and simpler than two queries; schools table is small.)
  const { data: schools, error: schoolError } = await admin
    .from('schools')
    .select('id,school_uid,name');
  if (schoolError) throw schoolError;

  const schoolsByUid = new Map();
  const schoolsByCanonical = new Map();
  const canonicalDupes = new Map();

  (schools || []).forEach(s => {
    if (s.school_uid) schoolsByUid.set(s.school_uid, s);
    const canonical = canonicalSchoolName(s.name);
    if (!canonical) return;
    if (schoolsByCanonical.has(canonical)) {
      const list = canonicalDupes.get(canonical) || [schoolsByCanonical.get(canonical)];
      list.push(s);
      canonicalDupes.set(canonical, list);
    } else {
      schoolsByCanonical.set(canonical, s);
    }
  });

  function resolveSchool(row) {
    if (row.school_uid) return schoolsByUid.get(row.school_uid) || null;
    const canonical = canonicalSchoolName(row.school_name);
    if (canonicalDupes.has(canonical)) {
      // Ambiguous: refuse to guess.
      throw new Error(
        `Line ${row.__line}: school name "${row.school_name}" matches multiple ` +
        `schools (${canonicalDupes.get(canonical).map(s => s.school_uid).join(', ')}). ` +
        `Use school_uid instead.`
      );
    }
    return schoolsByCanonical.get(canonical) || null;
  }

  const missingJob = [];
  const missingSchools = [];
  const resolvedByLine = new Map();

  rows.forEach(row => {
    if (!jobTitleByLowerName.has(row.job_title_name.toLowerCase())) {
      missingJob.push(`line ${row.__line}: "${row.job_title_name}"`);
    }
    const school = resolveSchool(row);
    if (!school) {
      const key = row.school_uid ? `school_uid="${row.school_uid}"` : `school="${row.school_name}"`;
      missingSchools.push(`line ${row.__line}: ${key}`);
    } else {
      resolvedByLine.set(row.__line, school);
    }
  });

  if (missingJob.length > 0 || missingSchools.length > 0) {
    const messages = [];
    if (missingJob.length > 0) {
      messages.push(
        `Unknown job_title value(s):\n  ${missingJob.join('\n  ')}\n  ` +
        `Valid names: ${[...jobTitleByLowerName.values()].map(j => j.name).join(', ')}`
      );
    }
    if (missingSchools.length > 0) {
      messages.push(
        `Unknown school(s):\n  ${missingSchools.join('\n  ')}\n  ` +
        `Tip: run \`node scripts/loadTestUsers.js --list-schools\` to see valid names + uids.`
      );
    }
    throw new Error(messages.join('\n\n'));
  }

  return { jobTitleByLowerName, resolvedByLine };
}

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  // listUsers paginates; large projects need to walk pages.
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find(u => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

function buildProfile(row, lookups, userId) {
  const jobTitle = lookups.jobTitleByLowerName.get(row.job_title_name.toLowerCase());
  const school = lookups.resolvedByLine.get(row.__line);

  // Transition-window dual-write. Drop job_title and assigned_school once
  // every field device is on the post-migration build.
  return {
    id: userId,
    first_name: row.first_name,
    last_name: row.last_name,
    job_title: jobTitle.name,
    job_title_id: jobTitle.id,
    assigned_school: school.name,
    school_id: school.id,
  };
}

async function processRow(row, lookups) {
  if (dryRun) {
    return { status: 'dry-run', userId: '(not created)' };
  }

  let userId;
  let createdNow = false;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: row.email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    const alreadyExists =
      /already.*registered|already exists|duplicate/i.test(createErr.message);
    if (!alreadyExists) {
      return { status: 'error', reason: `auth create failed: ${createErr.message}` };
    }
    const existing = await findUserByEmail(row.email);
    if (!existing) {
      return { status: 'error', reason: 'create said duplicate but listUsers did not find them' };
    }
    userId = existing.id;
  } else {
    userId = created.user.id;
    createdNow = true;
  }

  const { error: profileErr } = await admin
    .from('users')
    .upsert(buildProfile(row, lookups, userId), { onConflict: 'id' });

  if (profileErr) {
    return { status: 'error', reason: `profile upsert failed: ${profileErr.message}`, userId };
  }

  return { status: createdNow ? 'created' : 'reused', userId };
}

async function printLookup(table, columns, orderBy) {
  const { data, error } = await admin.from(table).select(columns).order(orderBy);
  if (error) throw error;
  console.table(data);
}

(async () => {
  if (listSchools) {
    await printLookup('schools', 'school_uid,name,suburb', 'name');
    return;
  }
  if (listJobTitles) {
    await printLookup('job_titles', 'code,name,is_active', 'name');
    return;
  }

  const csvPath = path.resolve(process.cwd(), csvArg);
  const rows = normalizeRows(parseCsvFile(csvPath));
  const lookups = await loadLookups(rows);

  console.log(`Processing ${rows.length} row(s) from ${csvPath}`);
  console.log(`Mode: ${dryRun ? 'dry run' : 'live'}`);
  console.log(`Password for new users: ${password}`);
  console.log('');

  const summary = { created: 0, reused: 0, 'dry-run': 0, error: 0 };
  for (const row of rows) {
    const result = await processRow(row, lookups);
    summary[result.status] += 1;
    const tag = result.status.toUpperCase();
    const line = `line ${row.__line} ${row.email}`;
    if (result.status === 'error') {
      console.log(`[${tag}] ${line} :: ${result.reason}`);
    } else {
      console.log(`[${tag}] ${line} -> ${result.userId}`);
    }
  }

  console.log('\nDone.');
  Object.entries(summary).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  process.exit(summary.error > 0 ? 1 : 0);
})().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
