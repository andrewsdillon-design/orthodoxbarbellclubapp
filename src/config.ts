// App-wide settings. EXPO_PUBLIC_* variables are baked in at build time (eas.json sets them per profile;
// for Expo Go put them in .env.local or in front of `npx expo start`).

export const SITE_URL = 'https://orthodoxbarbellclub.com';

/** "mock" serves recorded sample data from src/api/fixtures.json; "live" calls the real API. */
export const API_MODE: 'mock' | 'live' = process.env.EXPO_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || `${SITE_URL}/api/v1`;

export const LINKS = {
  site: SITE_URL,
  signup: `${SITE_URL}/account/signup`,
  forgot: `${SITE_URL}/account/forgot`,
  privacy: `${SITE_URL}/privacy`,
  support: `${SITE_URL}/support`,
  clubs: `${SITE_URL}/clubs`,
  programs: `${SITE_URL}/programs`,
};

export function siteUrl(path: string): string {
  return /^https?:/.test(path) ? path : SITE_URL + (path.startsWith('/') ? path : `/${path}`);
}
