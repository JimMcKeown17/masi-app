global.__MASI_NO_DEFAULT_HANDLE__ = true;
const fs = require('fs');
const path = require('path');
const appConfig = require('../app.config');
const {
  BRAND_RED, ICON_OUTPUTS, markMaxRadius, markTransform, readPng, renderIcon,
} = require('../scripts/lib/appIcon.cjs');

const root = path.join(__dirname, '..');
const outputFor = (file) => ICON_OUTPUTS.find((output) => output.file === file);

// How far the mark reaches from the image centre, in pixels (its own centre is lifted slightly).
function reachFromImageCentre(output) {
  const { scale, ty } = markTransform(output);
  const markCentreY = ty + 60.5 * scale;
  return markMaxRadius() * scale + Math.abs(output.size / 2 - markCentreY);
}

describe('app icon files', () => {
  test.each(ICON_OUTPUTS.map((output) => [output.file, output]))(
    '%s matches the mark geometry (rerun scripts/render-app-icons.cjs after changing it)',
    (file, output) => {
      const onDisk = readPng(path.join(root, file));
      const expected = renderIcon(output);
      expect({ width: onDisk.width, height: onDisk.height, channels: onDisk.channels })
        .toEqual({ width: expected.width, height: expected.height, channels: expected.channels });
      expect(onDisk.data.equals(expected.data)).toBe(true);
    },
  );

  test('full-bleed icons are opaque, so iOS never paints a white frame around the logo', () => {
    for (const file of ['assets/app-icon/icon.png', 'assets/app-icon/play-store.png']) {
      expect(readPng(path.join(root, file)).channels).toBe(3);
    }
  });

  test('the Android adaptive foreground keeps the mark inside the 66dp-of-108dp safe circle', () => {
    const output = outputFor('assets/app-icon/android-foreground.png');
    expect(reachFromImageCentre(output)).toBeLessThanOrEqual((output.size / 2) * (66 / 108));
  });

  test('the splash mark stays inside the circle Android 12+ crops the splash icon to', () => {
    const output = outputFor('assets/app-icon/splash.png');
    expect(reachFromImageCentre(output)).toBeLessThanOrEqual(output.size / 3);
  });
});

describe('app config icon wiring', () => {
  const { expo } = appConfig();
  const splashPlugin = expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');

  test('iOS and Android use the red icon files', () => {
    expect(expo.icon).toBe('./assets/app-icon/icon.png');
    expect(expo.ios.icon).toBe('./assets/app-icon/icon.png');
    expect(expo.android.adaptiveIcon).toEqual({
      foregroundImage: './assets/app-icon/android-foreground.png',
      monochromeImage: './assets/app-icon/android-foreground.png',
      backgroundColor: BRAND_RED,
    });
  });

  test('the splash is the white mark on brand red', () => {
    expect(expo.splash).toBeUndefined();
    expect(splashPlugin?.[1]).toEqual(expect.objectContaining({
      image: './assets/app-icon/splash.png',
      backgroundColor: BRAND_RED,
    }));
  });

  test('every icon and splash file the config names exists', () => {
    const files = [
      expo.icon, expo.ios.icon, expo.android.adaptiveIcon.foregroundImage,
      expo.android.adaptiveIcon.monochromeImage, splashPlugin[1].image, expo.web.favicon,
    ];
    for (const file of files) expect(fs.existsSync(path.join(root, file))).toBe(true);
  });
});
