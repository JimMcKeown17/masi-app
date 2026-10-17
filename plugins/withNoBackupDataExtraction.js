const fs = require('fs/promises');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

// Cover credential-protected and device-protected storage in both transfer modes.
const excludedDomains = [
  'root', 'file', 'database', 'sharedpref', 'external',
  'device_root', 'device_file', 'device_database', 'device_sharedpref',
];
const exclusions = excludedDomains
  .map(domain => `    <exclude domain="${domain}" path="." />`)
  .join('\n');
const dataExtractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${exclusions}
  </cloud-backup>
  <device-transfer>
${exclusions}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withNoBackupDataExtraction(config) {
  config = withAndroidManifest(config, config => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return config;
  });

  return withDangerousMod(config, ['android', async config => {
    const resourceDirectory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(resourceDirectory, { recursive: true });
    await fs.writeFile(path.join(resourceDirectory, 'data_extraction_rules.xml'), dataExtractionRules, 'utf8');
    return config;
  }]);
};
