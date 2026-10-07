// Expo app config. Store identity, icons, splash and the URLs the stores ask for.
import { withStringsXml, type ConfigPlugin } from 'expo/config-plugins';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const SITE = 'https://orthodoxbarbellclub.com';
const PURPLE = '#4A1942';
const PURPLE_DARK = '#2E0C28';

// Paste the ID `eas init` prints here (one time). It links this app to your Expo account for EAS builds.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || 'ba2647d7-14a7-4929-9655-bfad3af42af0';

/** Android launchers show the app_name string under the icon; keep it short there, as on iOS. */
const withShortLauncherName: ConfigPlugin<string> = (config, label) =>
  withStringsXml(config, (c) => {
    const strings = c.modResults.resources.string ?? [];
    const appName = strings.find((s) => s.$.name === 'app_name');
    if (appName) appName._ = label;
    else strings.push({ $: { name: 'app_name' }, _: label });
    c.modResults.resources.string = strings;
    return c;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  const expo: ExpoConfig = {
    ...config,
    name: 'Orthodox Barbell Club',
    slug: 'orthodox-barbell-club',
    scheme: 'obc',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    backgroundColor: PURPLE_DARK,
    ios: {
      bundleIdentifier: 'com.orthodoxbarbellclub.app',
      appleTeamId: 'GA9A5J9A44', // Dillon REA Andrews (Individual)
      supportsTablet: false,
      infoPlist: {
        CFBundleDisplayName: 'OBC',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.orthodoxbarbellclub.app',
      adaptiveIcon: {
        backgroundColor: PURPLE,
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
      name: 'Orthodox Barbell Club',
      shortName: 'OBC',
      backgroundColor: PURPLE_DARK,
      themeColor: PURPLE,
      output: 'single',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-font',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 220,
          resizeMode: 'contain',
          backgroundColor: PURPLE_DARK,
          dark: { image: './assets/splash-icon.png', backgroundColor: '#170613' },
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      privacyPolicyUrl: `${SITE}/privacy`,
      supportUrl: `${SITE}/support`,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
  return withShortLauncherName(expo, 'OBC') as ExpoConfig;
};
