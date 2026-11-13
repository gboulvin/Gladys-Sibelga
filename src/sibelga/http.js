// -----------------------------------------------------------------------------
// Small HTTP helpers on top of the native `fetch` (Node 22+): a timeout, a
// typed error, and the minimal cookie jar the sign-in flow needs.
// -----------------------------------------------------------------------------

import { REQUEST_TIMEOUT_MS, USER_AGENT } from './constants.js';

/**
 * Error raised by the Sibelga clients. `code` tells the callers what to say
 * to the user without parsing a message:
 *   - 'credentials'  : Sibelga refused the e-mail address or the password;
 *   - 'unauthorized' : the session is no longer accepted (sign in again);
 *   - 'blocked'      : the site answered with an anti-bot check;
 *   - 'unexpected'   : the answer is not the one the integration knows;
 *   - 'http'         : any other HTTP error (`status` holds the code);
 *   - 'network'      : the request did not reach Sibelga.
 */
export class SibelgaError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'SibelgaError';
    this.code = code;
    this.status = status;
  }
}

/** `fetch` with a timeout and a network failure turned into a SibelgaError. */
export async function request(url, { fetchImpl = fetch, headers = {}, ...options } = {}) {
  try {
    return await fetchImpl(url, {
      ...options,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const host = new URL(url).host;
    throw new SibelgaError('network', `Request to ${host} failed: ${err.message}`, { cause: err });
  }
}

/** Cookies of one sign-in: names and values only, sent back on every request. */
export class CookieJar {
  #cookies = new Map();

  store(response) {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0) {
        this.#cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}
