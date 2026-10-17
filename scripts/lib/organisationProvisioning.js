const PROVISIONING_USAGE = 'Usage: node scripts/createTesters.js [--dry-run] --organization <slug> <path-to-csv>';

function parseOrganisationArg(argv) {
  const flagIndex = argv.indexOf('--organization');
  const slug = argv[flagIndex + 1];
  if (
    flagIndex < 0
    || flagIndex !== argv.lastIndexOf('--organization')
    || typeof slug !== 'string'
    || !/^[a-z0-9-]{2,40}$/.test(slug)
    || slug.startsWith('--')
    || slug.trim() !== slug
  ) {
    throw new Error(PROVISIONING_USAGE);
  }
  return slug;
}

async function resolveOrganisationId(admin, slug) {
  const { data, error } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Unknown organisation "${slug}"`);
  return data.id;
}

function checkExistingOrganisation(existingProfile, organisationId) {
  if (existingProfile && existingProfile.organization_id !== organisationId) {
    return { ok: false, reason: 'organisation_conflict' };
  }
  return { ok: true };
}

function buildProfile(row, lookupMaps, userId, organisationId) {
  const jobTitle = lookupMaps.jobTitlesByCode.get(row.job_title_code);
  const school = lookupMaps.schoolsByUid.get(row.school_uid);
  return {
    id: userId,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    job_title_id: jobTitle.id,
    school_id: school.id,
    organization_id: organisationId,
  };
}

module.exports = {
  PROVISIONING_USAGE,
  parseOrganisationArg,
  resolveOrganisationId,
  checkExistingOrganisation,
  buildProfile,
};
