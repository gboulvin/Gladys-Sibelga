// -----------------------------------------------------------------------------
// Sign-in to the Sibelga "My consumption" portal.
//
// The portal signs users in with Azure AD B2C (authorization code flow). The
// redirect URI is the portal's own, so the OAuth2 redirection of the Gladys
// SDK cannot be used: the integration plays the sign-in form instead, with the
// e-mail address and the password the user saved in the configuration.
//
//   1. GET  the authorize page  -> its SETTINGS (CSRF token, transaction id);
//   2. POST the credentials     -> { status: "200" } when they are accepted;
//   3. GET  the confirmation    -> a redirection carrying the authorization code;
//   4. POST the code to the API -> access and refresh tokens.
//
// The password never leaves this module, and nothing here is ever logged.
// -----------------------------------------------------------------------------

import {
  API_BASE_URL,
  API_KEY,
  API_SUBSCRIPTION_KEY,
  AUTH_CLIENT_ID,
  AUTH_ORIGIN,
  AUTH_POLICY,
  AUTH_REDIRECT_URI,
  AUTH_TENANT,
  TOKEN_REDIRECT_URI,
} from './constants.js';
import { CookieJar, SibelgaError, request } from './http.js';

// Renew the access token a minute before Sibelga stops accepting it.
const EXPIRY_MARGIN_MS = 60_000;

/** Headers every call to the portal API carries. */
export function apiHeaders(extra = {}) {
  return {
    'x-api-key': API_KEY,
    'Ocp-Apim-Subscription-Key': API_SUBSCRIPTION_KEY,
    'Content-Language': 'en',
    Accept: 'application/json',
    ...extra,
  };
}

function authorizeUrl() {
  const params = new URLSearchParams({
    p: AUTH_POLICY,
    client_id: AUTH_CLIENT_ID,
    nonce: 'defaultNonce',
    redirect_uri: AUTH_REDIRECT_URI,
    scope: AUTH_CLIENT_ID,
    response_type: 'code',
    response_mode: 'query',
  });
  return `${AUTH_ORIGIN}/${AUTH_TENANT}/oauth2/v2.0/authorize?${params}`;
}

/**
 * Read the `var SETTINGS = {...};` object of a B2C page. The object is JSON:
 * find its closing brace by counting, strings skipped.
 */
export function parseSignInSettings(html) {
  const marker = html.search(/var\s+SETTINGS\s*=\s*\{/);
  if (marker === -1) {
    throw new SibelgaError('unexpected', 'The Sibelga sign-in page has changed (no settings).');
  }
  const start = html.indexOf('{', marker);
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (char === '\\') {
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        let settings;
        try {
          settings = JSON.parse(html.slice(start, i + 1));
        } catch (err) {
          throw new SibelgaError('unexpected', 'The Sibelga sign-in settings are unreadable.', {
            cause: err,
          });
        }
        if (!settings.csrf || !settings.transId) {
          throw new SibelgaError('unexpected', 'The Sibelga sign-in page has changed (no token).');
        }
        return settings;
      }
    }
  }
  throw new SibelgaError('unexpected', 'The Sibelga sign-in settings are unreadable.');
}

/**
 * Play the sign-in form and resolve the authorization code.
 * @param {{ email: string, password: string }} credentials
 */
export async function fetchAuthorizationCode({ email, password }, { fetchImpl } = {}) {
  const jar = new CookieJar();

  // 1) The sign-in page: cookies, CSRF token and transaction id.
  const page = await request(authorizeUrl(), { fetchImpl, redirect: 'manual' });
  if (!page.ok) {
    throw new SibelgaError('http', `Sibelga sign-in page: HTTP ${page.status}`, {
      status: page.status,
    });
  }
  jar.store(page);
  const settings = parseSignInSettings(await page.text());
  const tenantPath = settings.hosts?.tenant ?? `/${AUTH_TENANT}/${AUTH_POLICY}`;
  const policy = settings.hosts?.policy ?? AUTH_POLICY;
  const query = new URLSearchParams({ tx: settings.transId, p: policy });

  // 2) The credentials, as the form posts them.
  const form = await request(`${AUTH_ORIGIN}${tenantPath}/SelfAsserted?${query}`, {
    fetchImpl,
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-CSRF-TOKEN': settings.csrf,
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: jar.header(),
    },
    body: new URLSearchParams({ request_type: 'RESPONSE', signInName: email, password }),
  });
  jar.store(form);
  // B2C answers 200 with the outcome in the body: "400" is a refused sign-in.
  const outcome = await form.json().catch(() => ({}));
  if (!form.ok || String(outcome.status) !== '200') {
    throw new SibelgaError('credentials', 'Sibelga refused the e-mail address or the password.');
  }

  // 3) The confirmation redirects to the portal with the code.
  const confirmQuery = new URLSearchParams({
    rememberMe: 'false',
    csrf_token: settings.csrf,
    tx: settings.transId,
    p: policy,
  });
  const api = settings.api ?? 'CombinedSigninAndSignup';
  const confirmed = await request(
    `${AUTH_ORIGIN}${tenantPath}/api/${api}/confirmed?${confirmQuery}`,
    { fetchImpl, redirect: 'manual', headers: { Cookie: jar.header() } },
  );
  const location = confirmed.headers.get('location');
  const code = location ? new URL(location, AUTH_ORIGIN).searchParams.get('code') : null;
  if (!code) {
    // An account that must first accept new terms or verify its address ends
    // on another page: the user has to finish that step on the portal.
    throw new SibelgaError(
      'unexpected',
      'Sibelga did not complete the sign-in: sign in once on conso.sibelga.be, then retry.',
    );
  }
  return code;
}

async function postToken(path, body, { fetchImpl } = {}) {
  const response = await request(`${API_BASE_URL}${path}`, {
    fetchImpl,
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      redirectUri: TOKEN_REDIRECT_URI,
      isSignUp: false,
      isEditProfile: false,
      isChangePassword: false,
      clientId: AUTH_CLIENT_ID,
      ...body,
    }),
  });
  if (!response.ok) {
    throw new SibelgaError('http', `Sibelga token request: HTTP ${response.status}`, {
      status: response.status,
    });
  }
  const tokens = await response.json();
  if (!tokens.access_token) {
    throw new SibelgaError('unexpected', 'Sibelga answered without an access token.');
  }
  return tokens;
}

/**
 * Session to the portal API: signs in when needed, renews the access token
 * with the refresh token, and signs in again when that one is refused.
 */
export class SibelgaSession {
  #credentials;
  #fetchImpl;
  #tokens = null;
  #expiresAt = 0;
  #pending = null;

  constructor(credentials, { fetchImpl } = {}) {
    this.#credentials = credentials;
    this.#fetchImpl = fetchImpl;
  }

  /** Resolve a valid access token. Concurrent callers share one sign-in. */
  async accessToken() {
    if (this.#tokens && Date.now() < this.#expiresAt) {
      return this.#tokens.access_token;
    }
    this.#pending ??= this.#renew().finally(() => {
      this.#pending = null;
    });
    return this.#pending;
  }

  /** Forget the tokens: the next call signs in again. */
  invalidate() {
    this.#tokens = null;
    this.#expiresAt = 0;
  }

  async #renew() {
    const options = { fetchImpl: this.#fetchImpl };
    let tokens = null;
    if (this.#tokens?.refresh_token) {
      tokens = await postToken(
        '/auth/token/refresh',
        { refreshToken: this.#tokens.refresh_token },
        options,
      ).catch(() => null);
    }
    if (!tokens) {
      const authorizationCode = await fetchAuthorizationCode(this.#credentials, options);
      tokens = await postToken('/auth/token', { authorizationCode }, options);
    }
    this.#tokens = tokens;
    const lifetimeMs = Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) * 1000 : 300_000;
    this.#expiresAt = Date.now() + Math.max(lifetimeMs - EXPIRY_MARGIN_MS, 30_000);
    return tokens.access_token;
  }
}
