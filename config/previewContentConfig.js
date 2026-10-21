const PREVIEW_CONTENT_ENV = 'MASI_PREVIEW_CONTENT';
const FIELD_BUILD_PROFILES = Object.freeze(['pilot', 'production']);
const FIELD_UPDATE_CHANNELS = Object.freeze(['preview', 'production']);

function resolvePreviewContentBuildConfig({ env = process.env } = {}) {
  const previewContent = env[PREVIEW_CONTENT_ENV] === '1';
  const profile = env.EAS_BUILD_PROFILE;
  if (previewContent && FIELD_BUILD_PROFILES.includes(profile)) {
    throw new Error(
      `MASI_PREVIEW_CONTENT=1 is refused for the "${profile}" build profile: preview content packs may hold unreviewed words (lesson-plan spec C12).`
    );
  }
  return { previewContent };
}

function isPreviewContentAllowed({ extra, channel } = {}) {
  return extra?.previewContent === true && !FIELD_UPDATE_CHANNELS.includes(channel);
}

module.exports = {
  PREVIEW_CONTENT_ENV,
  FIELD_BUILD_PROFILES,
  FIELD_UPDATE_CHANNELS,
  resolvePreviewContentBuildConfig,
  isPreviewContentAllowed,
};
