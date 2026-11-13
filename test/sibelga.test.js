// -----------------------------------------------------------------------------
// The Sibelga clients (src/sibelga/): sign-in, portal API, outage page.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SibelgaApi, normalizeDailyVolumes, normalizeMeter } from '../src/sibelga/api.js';
import {
  SibelgaSession,
  fetchAuthorizationCode,
  parseSignInSettings,
} from '../src/sibelga/auth.js';
import { endOfLocalDay, localDate, shiftDate, startOfLocalDay } from '../src/sibelga/dates.js';
import {
  fetchOutages,
  findMunicipalities,
  htmlToText,
  parseOutages,
  parseWatchedMunicipalities,
} from '../src/sibelga/network.js';
import {
  EMAIL,
  OUTAGE_A,
  OUTAGE_B,
  PASSWORD,
  createFakeSibelga,
  outagePage,
  sdp,
  volumes,
} from './helpers.js';

const credentials = { email: EMAIL, password: PASSWORD };

function createApi(sibelga, creds = credentials) {
  const options = { fetchImpl: sibelga.fetch };
  return new SibelgaApi(new SibelgaSession(creds, options), options);
}

// --- Sign-in -----------------------------------------------------------------

test('the sign-in plays the form and resolves the authorization code', async () => {
  const sibelga = createFakeSibelga();
  const code = await fetchAuthorizationCode(credentials, { fetchImpl: sibelga.fetch });
  assert.equal(code, 'auth-code');
  assert.deepEqual(
    sibelga.calls.map(({ method, url }) => `${method} ${new URL(url).pathname.split('/').pop()}`),
    ['GET authorize', 'POST SelfAsserted', 'GET confirmed'],
  );
});

test('a refused password is a "credentials" error that does not carry it', async () => {
  const sibelga = createFakeSibelga();
  await assert.rejects(
    fetchAuthorizationCode(
      { email: EMAIL, password: 'wrong-secret' },
      { fetchImpl: sibelga.fetch },
    ),
    (err) => {
      assert.equal(err.code, 'credentials');
      assert.ok(!err.message.includes('wrong-secret'));
      return true;
    },
  );
});

test('the sign-in settings are read whatever their layout', () => {
  const settings = parseSignInSettings(
    'var SETTINGS = {"csrf":"a","transId":"b","x":{"y":"}"}};var OTHER = {};',
  );
  assert.equal(settings.csrf, 'a');
  assert.throws(() => parseSignInSettings('<html>maintenance</html>'), { code: 'unexpected' });
  assert.throws(() => parseSignInSettings('var SETTINGS = {"csrf":"a"};'), { code: 'unexpected' });
});

test('the session signs in once, then renews with the refresh token', async () => {
  const sibelga = createFakeSibelga();
  const session = new SibelgaSession(credentials, { fetchImpl: sibelga.fetch });
  const [first, second] = await Promise.all([session.accessToken(), session.accessToken()]);
  assert.equal(first, 'access-1');
  assert.equal(second, 'access-1');
  assert.equal(await session.accessToken(), 'access-1');

  session.invalidate();
  // The refresh token is gone with the session: a full sign-in again.
  assert.equal(await session.accessToken(), 'access-2');
  assert.equal(sibelga.calls.filter(({ url }) => url.endsWith('/auth/token')).length, 2);
});

// --- Portal API --------------------------------------------------------------

test('the meters of the account are normalized', async () => {
  const sibelga = createFakeSibelga();
  sibelga.state.sdps = [
    sdp(),
    sdp({
      id: 'sdp-2',
      ean: '541449000000000028',
      division: 'GAS',
      nickname: ' ',
      type: 'CLASSICAL',
    }),
    sdp({ id: 'sdp-3', ean: '541449000000000035', status: 'WAITING' }),
    { id: 'broken' },
  ];
  const meters = await createApi(sibelga).getMeters();
  assert.equal(meters.length, 2, 'no EAN, or waiting for a consent: ignored');
  assert.deepEqual(
    { ...meters[0], lastAvailableInstant: undefined },
    {
      id: 'sdp-1',
      ean: '541449000000000011',
      name: 'Home',
      energy: 'electricity',
      active: true,
      smart: true,
      injects: false,
      serialNumber: '1SAG1100000001',
      lastAvailableDate: '2026-11-12',
      lastAvailableInstant: undefined,
      lastDayConsumption: 7.5,
      lastMonthConsumption: 210.4,
    },
  );
  assert.equal(meters[1].energy, 'gas');
  assert.equal(meters[1].name, '541449000000000028', 'no nickname: the EAN');
  assert.equal(meters[1].smart, false);
});

test('a wrapped list and missing fields do not break the normalization', () => {
  assert.equal(normalizeMeter(null), null);
  const meter = normalizeMeter({ id: 7, headpoint: { ean: 54 } });
  assert.equal(meter.id, '7');
  assert.equal(meter.lastDayConsumption, null);
  assert.equal(meter.smart, false);
});

test('daily volumes are grouped by Brussels day', async () => {
  const sibelga = createFakeSibelga();
  const api = createApi(sibelga);
  const [meter] = await api.getMeters();
  const days = await api.getDailyVolumes(meter, '2026-11-01', '2026-11-12');
  assert.deepEqual(days, [
    { date: '2026-11-10', consumption: 6.2, injection: null },
    { date: '2026-11-11', consumption: 7.5, injection: null },
  ]);
  const { searchParams } = new URL(sibelga.calls.at(-1).url);
  assert.equal(searchParams.get('period'), 'DAILY');
  assert.equal(searchParams.get('startDate'), '2026-10-31T23:00:00.000Z');
  assert.equal(searchParams.get('endDate'), '2026-11-12T22:59:59.999Z');
});

test('injection, split rows and community volumes are handled', () => {
  const rows = [
    ...volumes({ '2026-07-01': { consumption: 3, injection: 5.5 } }),
    { time: '2026-07-01T22:00:00Z', volumeType: 'CONSUMPTION_DAY', total: 1.25 },
    { time: '2026-07-01T22:00:00Z', volumeType: 'CONSUMPTION_NIGHT', total: 0.75 },
    { time: '2026-07-01T22:00:00Z', volumeType: 'CONSUMPTION_SHARED', total: 9 },
    { time: 'not a date', volumeType: 'CONSUMPTION_DAY', total: 1 },
    { time: '2026-07-03T22:00:00Z', volumeType: 'CONSUMPTION_DAY', total: null },
  ];
  assert.deepEqual(normalizeDailyVolumes(rows), [
    { date: '2026-07-01', consumption: 3, injection: 5.5 },
    { date: '2026-07-02', consumption: 2, injection: null },
  ]);
  assert.deepEqual(normalizeDailyVolumes(undefined), []);
});

test('the last indexes of a meter are read', async () => {
  const sibelga = createFakeSibelga();
  const api = createApi(sibelga);
  const [meter] = await api.getMeters();
  assert.deepEqual(await api.getIndexes(meter), {
    date: '2026-11-12',
    consumption: { day: 1234.5, night: 987.6 },
    injection: { day: null, night: null },
  });
  sibelga.state.indexes = {};
  assert.equal(await api.getIndexes(meter), null);
});

test('a revoked token triggers one new sign-in, a refusal is "unauthorized"', async () => {
  const sibelga = createFakeSibelga();
  const api = createApi(sibelga);
  await api.getMeters();
  sibelga.state.revokedTokens.add('access-1');
  assert.equal((await api.getMeters()).length, 1);

  sibelga.state.revokedTokens.add('access-2').add('access-3');
  await assert.rejects(api.getMeters(), { code: 'unauthorized' });
});

test('an API error is an "http" error with its status', async () => {
  const sibelga = createFakeSibelga({ apiStatus: 500 });
  await assert.rejects(createApi(sibelga).getMeters(), { code: 'http', status: 500 });
});

test('a request that does not reach Sibelga is a "network" error', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(fetchOutages({ fetchImpl }), { code: 'network' });
});

// --- Dates -------------------------------------------------------------------

test('local days follow Brussels time, in winter and in summer', () => {
  assert.equal(localDate('2026-11-11T23:00:00Z'), '2026-11-12');
  assert.equal(localDate('2026-07-01T21:59:59Z'), '2026-07-01');
  assert.equal(localDate('nope'), null);
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(startOfLocalDay('2026-01-15').toISOString(), '2026-01-14T23:00:00.000Z');
  assert.equal(startOfLocalDay('2026-07-15').toISOString(), '2026-07-14T22:00:00.000Z');
  // The day summer time starts lasts 23 hours.
  assert.equal(startOfLocalDay('2026-03-29').toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(endOfLocalDay('2026-03-29').toISOString(), '2026-03-29T21:59:59.999Z');
});

// --- Outage page -------------------------------------------------------------

test('the outages of the listing page are read once each', () => {
  const html = outagePage([
    OUTAGE_A,
    { ...OUTAGE_B, title: 'Anderlecht &amp; Saint-Gilles' },
  ]).replace(
    '</ul>',
    `<li><a href="https://www.sibelga.be/fr/x/current-power-cut/${OUTAGE_A.id}">Details</a></li>
     <li><a href="/en/outages-streetworks/power-outages/solved-outages/solved-power-cut/acb12386-61de-11ed-b56e-005056970ffd">Solved</a></li></ul>`,
  );
  assert.deepEqual(parseOutages(html), [
    {
      id: OUTAGE_A.id,
      title: 'Power outages in Ixelles',
      url: `https://www.sibelga.be/en/outages-streetworks/power-outages/actual-power-outages/current-power-cut/${OUTAGE_A.id}`,
      municipalities: ['ixelles'],
    },
    {
      id: OUTAGE_B.id,
      title: 'Power outages in Anderlecht & Saint-Gilles',
      url: `https://www.sibelga.be/en/outages-streetworks/power-outages/actual-power-outages/current-power-cut/${OUTAGE_B.id}`,
      municipalities: ['anderlecht', 'saint-gilles'],
    },
  ]);
  assert.deepEqual(parseOutages(outagePage([])), []);
});

test('municipalities are recognized in French and in Dutch, whatever the accents', () => {
  assert.deepEqual(findMunicipalities('Bruxelles (Laeken), Evere, Schaerbeek'), [
    'bruxelles',
    'evere',
    'schaerbeek',
  ]);
  assert.deepEqual(findMunicipalities('Sint-Gillis / Elsene'), ['ixelles', 'saint-gilles']);
  assert.deepEqual(findMunicipalities('Rue de la Forestière'), [], 'a street is not Forest');
  assert.deepEqual(parseWatchedMunicipalities('ixelles, Uccle ;saint-gilles\nParis'), [
    'ixelles',
    'uccle',
    'saint-gilles',
  ]);
  assert.deepEqual(parseWatchedMunicipalities(undefined), []);
  assert.equal(htmlToText('<b>A&nbsp;&amp;&#233;</b>\n <i>B</i>'), 'A &é B');
});

test('the anti-bot check is reported as "blocked", never bypassed', async () => {
  const sibelga = createFakeSibelga({ outagePageMode: 'blocked' });
  await assert.rejects(fetchOutages({ fetchImpl: sibelga.fetch }), { code: 'blocked' });
  assert.equal(sibelga.calls.length, 1, 'a single request, no retry');
});

test('an error page or an unknown page is not read as "no outage"', async () => {
  const sibelga = createFakeSibelga({ outagePageMode: 'error' });
  await assert.rejects(fetchOutages({ fetchImpl: sibelga.fetch }), { code: 'http', status: 502 });
  const fetchImpl = async () => new Response('<html><h1>Welcome</h1></html>');
  await assert.rejects(fetchOutages({ fetchImpl }), { code: 'unexpected' });

  sibelga.state.outagePageMode = 'ok';
  sibelga.state.outages = [OUTAGE_A];
  assert.equal((await fetchOutages({ fetchImpl: sibelga.fetch })).length, 1);
});
