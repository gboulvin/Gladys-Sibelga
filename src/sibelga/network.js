// -----------------------------------------------------------------------------
// Status of the Sibelga grid: the ongoing outages.
//
// Sibelga publishes them on a public web page only (no API, no feed): one link
// per outage, to a page whose address ends with `current-power-cut/<id>`. This
// module reads that listing and keeps what is stable in it — the identifier of
// each outage, the text of its link and the municipalities that text names.
//
// The site sits behind an anti-bot check that can refuse automated readers.
// The integration never tries to get around it: a refused request is reported
// as a `blocked` SibelgaError and the status simply reads "unknown".
// -----------------------------------------------------------------------------

import { MUNICIPALITIES, OUTAGES_ORIGIN, OUTAGES_URL } from './constants.js';
import { SibelgaError, request } from './http.js';

const OUTAGE_LINK =
  /<a\b[^>]*?href\s*=\s*["']([^"']*\/current-power-cut\/([0-9a-f]{8}-[0-9a-f-]{27}))["'][^>]*>([\s\S]*?)<\/a>/gi;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text of an HTML fragment: tags dropped, entities decoded, spaces collapsed. */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

const normalize = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const MUNICIPALITY_MATCHERS = MUNICIPALITIES.map(({ key, names }) => ({
  key,
  patterns: names.map((name) => new RegExp(`(^| )${normalize(name)}( |$)`)),
}));

/** Keys of the municipalities a text names (see MUNICIPALITIES). */
export function findMunicipalities(text) {
  const normalized = normalize(text);
  return MUNICIPALITY_MATCHERS.filter(({ patterns }) =>
    patterns.some((pattern) => pattern.test(normalized)),
  ).map(({ key }) => key);
}

/**
 * Municipalities of the configuration (`"Ixelles, Uccle"`) as keys. A name
 * that is not a Brussels municipality is ignored.
 */
export function parseWatchedMunicipalities(setting) {
  return [
    ...new Set(
      String(setting ?? '')
        .split(/[,;\n]/)
        .flatMap(findMunicipalities),
    ),
  ];
}

/**
 * @typedef {object} Outage
 * @property {string} id               identifier Sibelga gives the outage
 * @property {string} title            text of its link, e.g. "Ixelles - Rue du Bailli"
 * @property {string} url              its page on sibelga.be
 * @property {string[]} municipalities keys of the municipalities it names
 */

/** @returns {Outage[]} the outages a listing page links to, in page order */
export function parseOutages(html) {
  const outages = new Map();
  for (const [, href, id, inner] of String(html).matchAll(OUTAGE_LINK)) {
    const title = htmlToText(inner).slice(0, 200);
    const known = outages.get(id);
    // The same outage can be linked twice (a title and a "details" link):
    // keep the richest text.
    if (!known || title.length > known.title.length) {
      outages.set(id, {
        id,
        title,
        url: new URL(href, OUTAGES_ORIGIN).href,
        municipalities: findMunicipalities(title),
      });
    }
  }
  return [...outages.values()];
}

/** True when the answer is the anti-bot check rather than the page. */
function isBotCheck(response, body) {
  return (
    response.headers.get('cf-mitigated') !== null ||
    ((response.status === 403 || response.status === 503) &&
      /just a moment|challenge-platform|captcha/i.test(body))
  );
}

/**
 * Read the ongoing outages.
 * @returns {Promise<Outage[]>}
 */
export async function fetchOutages({ fetchImpl } = {}) {
  const response = await request(OUTAGES_URL, {
    fetchImpl,
    headers: { Accept: 'text/html', 'Accept-Language': 'en' },
  });
  const body = await response.text();
  if (isBotCheck(response, body)) {
    throw new SibelgaError('blocked', 'sibelga.be answered with an anti-bot check.', {
      status: response.status,
    });
  }
  if (!response.ok) {
    throw new SibelgaError('http', `Sibelga outage page: HTTP ${response.status}`, {
      status: response.status,
    });
  }
  // A page that names no outage section at all is not the listing: saying
  // "no outage" from it would be a guess.
  if (!/outage|power.?cut/i.test(body)) {
    throw new SibelgaError('unexpected', 'The Sibelga outage page has changed.');
  }
  return parseOutages(body);
}
