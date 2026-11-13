// -----------------------------------------------------------------------------
// A fake Sibelga for the tests: a `fetch` that plays the sign-in pages, the
// portal API and the public outage page from an editable in-memory state.
// The tests never touch the network.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { Store } from '../src/store.js';

export const EMAIL = 'user@example.com';
export const PASSWORD = 'correct horse';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** A metering point as `/sdps/overview` returns it. */
export function sdp({
  id = 'sdp-1',
  ean = '541449000000000011',
  division = 'ELECTRICITY',
  nickname = 'Home',
  type = 'SMART',
  direction = 'CONS',
  lastAvailableDay = '2026-11-11T23:00:00.000Z',
  lastDayConsumption = 7.5,
  lastMonthConsumption = 210.4,
  status = 'ACTIVE',
} = {}) {
  return {
    id,
    division,
    direction,
    userHasAccessNickname: nickname,
    userHasAccessStatus: status,
    headpoint: {
      ean,
      physicalMeters: [
        // A replaced meter stays listed with an end date.
        { type: 'CLASSICAL', serialNumber: 'OLD', headpointHasMeterEnd: '2024-01-01T00:00:00Z' },
        {
          type,
          serialNumber: '1SAG1100000001',
          headpointHasMeterEnd: null,
          lastAvailableDay,
          lastDayConsumption,
          lastMonthConsumption,
        },
      ],
    },
  };
}

/** Daily volume rows as `/consumptions/{id}` returns them (Brussels midnights, winter time). */
export function volumes(days) {
  return Object.entries(days).flatMap(([date, { consumption, injection }]) => {
    const time = new Date(Date.parse(`${date}T00:00:00Z`) - 60 * 60 * 1000).toISOString();
    const rows = [
      {
        time,
        volumeType: 'CONSUMPTION_DAY,CONSUMPTION_NIGHT',
        total: consumption,
        day: consumption * 0.6,
        night: consumption * 0.4,
      },
    ];
    if (injection !== undefined) {
      rows.push({ time, volumeType: 'INJECTION_DAY,INJECTION_NIGHT', total: injection });
    }
    return rows;
  });
}

/** The outage listing page, one link per outage. */
export function outagePage(outages) {
  const links = outages
    .map(
      ({ id, title }) =>
        `<li class="outage"><a class="card" href="/en/outages-streetworks/power-outages/actual-power-outages/current-power-cut/${id}">
           <h3>Power outages in ${title}</h3></a></li>`,
    )
    .join('\n');
  return `<!doctype html><html><head><title>Power outages - Sibelga</title></head>
    <body><h1>Actual power outages</h1><ul>${links}</ul>
    <a href="/en/outages-streetworks/power-outages/solved-outages">Solved outages</a></body></html>`;
}

/** Houses as Gladys returns them. */
export const HOME_IXELLES = {
  id: 'h1',
  name: 'Home',
  selector: 'home',
  latitude: 50.8275,
  longitude: 4.3722,
};
export const HOME_LEUVEN = {
  id: 'h2',
  name: 'Kot',
  selector: 'kot',
  latitude: 50.8798,
  longitude: 4.7005,
};
export const HOME_UNLOCATED = {
  id: 'h3',
  name: 'Cabin',
  selector: 'cabin',
  latitude: null,
  longitude: null,
};

export const OUTAGE_A = { id: '983a0e4d-47ac-401f-adbc-3cc496dd1ac3', title: 'Ixelles' };
export const OUTAGE_B = { id: '8cac933c-5312-4875-90a5-0227275e161d', title: 'Anderlecht' };

/**
 * @returns {{ fetch: typeof fetch, state: object, calls: {method: string, url: string}[] }}
 * `state` is editable between two reads.
 */
export function createFakeSibelga(overrides = {}) {
  const state = {
    email: EMAIL,
    password: PASSWORD,
    sdps: [sdp()],
    volumes: {
      'sdp-1': volumes({ '2026-11-10': { consumption: 6.2 }, '2026-11-11': { consumption: 7.5 } }),
    },
    indexes: {
      'sdp-1': [{ period: '2026-11-11T23:00:00.000Z', consumption: { day: 1234.5, night: 987.6 } }],
    },
    outages: [],
    // 'ok' | 'blocked' | 'error'
    outagePageMode: 'ok',
    apiStatus: 200,
    revokedTokens: new Set(),
    ...overrides,
  };
  const calls = [];
  let issued = 0;

  async function fakeFetch(input, init = {}) {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    calls.push({ method, url: url.href });
    const headers = new Headers(init.headers);

    // --- Azure AD B2C sign-in ---------------------------------------------
    if (url.host === 'auth.conso.sibelga.be') {
      if (url.pathname.endsWith('/oauth2/v2.0/authorize')) {
        const settings = {
          csrf: 'csrf-token',
          transId: 'StateProperties=abc',
          api: 'CombinedSigninAndSignup',
          hosts: {
            tenant: '/sibelgab2cprod.onmicrosoft.com/B2C_1A_SignIn',
            policy: 'B2C_1A_SignIn',
          },
          config: { note: 'a } brace in a "string" must not end the object' },
        };
        return new Response(
          `<html><script>var CONTENT = {};\nvar SETTINGS = ${JSON.stringify(settings, null, 1)};</script></html>`,
          { status: 200, headers: { 'Set-Cookie': 'x-ms-cpim-csrf=cookie-value; path=/; secure' } },
        );
      }
      if (url.pathname.endsWith('/SelfAsserted')) {
        const form = new URLSearchParams(String(init.body));
        const accepted =
          headers.get('X-CSRF-TOKEN') === 'csrf-token' &&
          headers.get('Cookie')?.includes('x-ms-cpim-csrf=cookie-value') &&
          form.get('signInName') === state.email &&
          form.get('password') === state.password;
        return json(accepted ? { status: '200' } : { status: '400', message: 'Invalid' });
      }
      if (url.pathname.endsWith('/confirmed')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://sbg-portal-prod-webapp.azurewebsites.net/?code=auth-code' },
        });
      }
    }

    // --- Portal API --------------------------------------------------------
    if (url.host === 'api-gateway.datahub.sibelga.be') {
      const path = url.pathname.replace('/api/prod/mobile/v1/api', '');
      if (!headers.get('x-api-key') || !headers.get('Ocp-Apim-Subscription-Key')) {
        return json({ message: 'missing key' }, 401);
      }
      if (path === '/auth/token' || path === '/auth/token/refresh') {
        const body = JSON.parse(init.body);
        const valid =
          path === '/auth/token'
            ? body.authorizationCode === 'auth-code'
            : String(body.refreshToken).startsWith('refresh-');
        if (!valid) {
          return json({ message: 'bad grant' }, 400);
        }
        issued += 1;
        return json({
          access_token: `access-${issued}`,
          refresh_token: `refresh-${issued}`,
          expires_in: 3600,
          expires_on: 0,
          refresh_token_expires_in: 86400,
        });
      }
      const token = headers.get('Authorization')?.replace('Bearer ', '');
      if (!token?.startsWith('access-') || state.revokedTokens.has(token)) {
        return json({ message: 'unauthorized' }, 401);
      }
      if (state.apiStatus !== 200) {
        return json({ message: 'error' }, state.apiStatus);
      }
      if (path === '/sdps/overview') {
        return json(state.sdps);
      }
      const consumption = path.match(/^\/consumptions\/([^/]+)$/);
      if (consumption) {
        return json(state.volumes[consumption[1]] ?? []);
      }
      const indexes = path.match(/^\/meters\/([^/]+)\/index-view\/volumes$/);
      if (indexes) {
        return json(state.indexes[indexes[1]] ?? []);
      }
      return json({ message: 'not found' }, 404);
    }

    // --- Public outage page --------------------------------------------------
    if (url.host === 'www.sibelga.be') {
      if (state.outagePageMode === 'blocked') {
        return new Response('<html><title>Just a moment...</title></html>', {
          status: 403,
          headers: { 'cf-mitigated': 'challenge' },
        });
      }
      if (state.outagePageMode === 'error') {
        return new Response('Bad gateway', { status: 502 });
      }
      return new Response(outagePage(state.outages), { status: 200 });
    }

    throw new Error(`Unexpected request in a test: ${method} ${url.href}`);
  }

  return { fetch: fakeFetch, state, calls };
}

/** "Now" of the tests: the morning after the last day of readings. */
export const NOW = new Date('2026-11-12T08:00:00Z');

/**
 * A fake Gladys wired like index.js does, on a fake Sibelga.
 * @param {{ config?: object, houses?: object[], sibelga?: object, connect?: boolean }} [options]
 */
export async function createApp({
  config,
  houses = [],
  sibelga = createFakeSibelga(),
  connect = true,
} = {}) {
  const gladys = createFakeGladys({
    config: config ?? { email: EMAIL, password: PASSWORD },
    houses,
  });
  let now = NOW;
  const service = registerHandlers(gladys, {
    fetchImpl: sibelga.fetch,
    store: new Store(null),
    now: () => now,
  });
  if (connect) {
    await gladys.connect();
    // Timers are the production pace; the tests trigger the reads themselves.
    service.stop();
  }
  return {
    gladys,
    service,
    sibelga,
    setNow(date) {
      now = new Date(date);
    },
    /** Make the fake Gladys consider every discovered device created by the user. */
    createDevices() {
      gladys.fake.devices = structuredClone(gladys.fake.discoveredDevices);
    },
  };
}
