// -----------------------------------------------------------------------------
// Endpoints of the Sibelga services the integration reads.
//
// Sibelga publishes NO documented public API. The consumption data comes from
// the API behind the official "My consumption" web portal
// (https://conso.sibelga.be), reached with the user's own account. The
// identifiers below are the ones of that public web client, as served to every
// browser in its JavaScript bundle: they identify the application, not a user.
// They can change without notice; the environment variables let a user follow
// such a change without waiting for a release.
// -----------------------------------------------------------------------------

const env = process.env;

export const API_BASE_URL =
  env.SIBELGA_API_BASE_URL ?? 'https://api-gateway.datahub.sibelga.be/api/prod/mobile/v1/api';
export const API_KEY = env.SIBELGA_API_KEY ?? '89929811ce9645d496a0aca5bc4ca5a1';
export const API_SUBSCRIPTION_KEY =
  env.SIBELGA_API_SUBSCRIPTION_KEY ?? '3efdec646ba442d39029be3f50b2a2ca';

// Azure AD B2C sign-in of the portal (authorization code flow).
export const AUTH_CLIENT_ID = env.SIBELGA_AUTH_CLIENT_ID ?? '1e981c5a-43d5-4bc6-838d-0756c67cb6ad';
export const AUTH_ORIGIN = 'https://auth.conso.sibelga.be';
export const AUTH_TENANT = 'sibelgab2cprod.onmicrosoft.com';
export const AUTH_POLICY = 'B2C_1A_SignIn';
export const AUTH_REDIRECT_URI = 'https://sbg-portal-prod-webapp.azurewebsites.net';
// The portal sends this value, already URL-encoded, when it trades the
// authorization code for tokens: the API expects it as is.
export const TOKEN_REDIRECT_URI = 'https%3A%2F%2Foauth.pstmn.io%2Fv1%2Fcallback';

// Public page listing the ongoing outages of the Brussels grid.
export const OUTAGES_ORIGIN = 'https://www.sibelga.be';
export const OUTAGES_URL =
  env.SIBELGA_OUTAGES_URL ??
  `${OUTAGES_ORIGIN}/en/outages-streetworks/power-outages/actual-power-outages`;

export const USER_AGENT =
  'Gladys-Sibelga-Integration (+https://github.com/gboulvin/Gladys-Sibelga)';
export const REQUEST_TIMEOUT_MS = 20_000;
export const TIMEZONE = 'Europe/Brussels';

// The 19 municipalities of the Brussels-Capital Region, with the names Sibelga
// uses on its pages (French, Dutch when it differs). `key` is stable: it is
// what scenes filter on.
export const MUNICIPALITIES = [
  { key: 'anderlecht', names: ['Anderlecht'] },
  { key: 'auderghem', names: ['Auderghem', 'Oudergem'] },
  { key: 'berchem-sainte-agathe', names: ['Berchem-Sainte-Agathe', 'Sint-Agatha-Berchem'] },
  { key: 'bruxelles', names: ['Bruxelles', 'Brussel', 'Brussels', 'Laeken', 'Haren', 'Haeren'] },
  { key: 'etterbeek', names: ['Etterbeek'] },
  { key: 'evere', names: ['Evere'] },
  { key: 'forest', names: ['Forest', 'Vorst'] },
  { key: 'ganshoren', names: ['Ganshoren'] },
  { key: 'ixelles', names: ['Ixelles', 'Elsene'] },
  { key: 'jette', names: ['Jette'] },
  { key: 'koekelberg', names: ['Koekelberg'] },
  { key: 'molenbeek-saint-jean', names: ['Molenbeek-Saint-Jean', 'Sint-Jans-Molenbeek'] },
  { key: 'saint-gilles', names: ['Saint-Gilles', 'Sint-Gillis'] },
  {
    key: 'saint-josse-ten-noode',
    names: ['Saint-Josse-ten-Noode', 'Sint-Joost-ten-Node', 'Saint-Josse'],
  },
  { key: 'schaerbeek', names: ['Schaerbeek', 'Schaarbeek'] },
  { key: 'uccle', names: ['Uccle', 'Ukkel'] },
  { key: 'watermael-boitsfort', names: ['Watermael-Boitsfort', 'Watermaal-Bosvoorde'] },
  { key: 'woluwe-saint-lambert', names: ['Woluwe-Saint-Lambert', 'Sint-Lambrechts-Woluwe'] },
  { key: 'woluwe-saint-pierre', names: ['Woluwe-Saint-Pierre', 'Sint-Pieters-Woluwe'] },
];
