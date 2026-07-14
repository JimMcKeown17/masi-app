const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Assigns Debug IDs to JavaScript bundles and source maps. The Sentry Expo
// config plugin uses these IDs to upload and match symbols during EAS builds.
module.exports = getSentryExpoConfig(__dirname);
