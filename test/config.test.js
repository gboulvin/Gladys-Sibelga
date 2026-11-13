// -----------------------------------------------------------------------------
// Configuration normalization (src/config.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCredentials, normalizeConfig } from '../src/config.js';

test('an empty configuration is the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
});

test('numbers typed as strings are converted, nonsense falls back to the default', () => {
  const config = normalizeConfig({
    history_days: '90',
    consumption_refresh_hours: 'often',
    network_refresh_minutes: '30',
  });
  assert.equal(config.history_days, 90);
  assert.equal(config.consumption_refresh_hours, DEFAULT_CONFIG.consumption_refresh_hours);
  assert.equal(config.network_refresh_minutes, 30);
});

test('the e-mail address is trimmed, the password is kept as typed', () => {
  const config = normalizeConfig({ email: '  me@example.com ', password: ' p w ' });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.password, ' p w ');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ email: 'me@example.com' })), false);
});

test('the grid status is on unless explicitly turned off', () => {
  assert.equal(normalizeConfig({ network_status_enabled: null }).network_status_enabled, true);
  assert.equal(normalizeConfig({ network_status_enabled: false }).network_status_enabled, false);
});

test('municipalities are kept as known keys, from a selection or a typed list', () => {
  assert.deepEqual(
    normalizeConfig({ municipalities: ['ixelles', 'atlantis', 'uccle'] }).municipalities,
    ['ixelles', 'uccle'],
  );
  assert.deepEqual(normalizeConfig({ municipalities: 'Schaarbeek, Saint-Gilles' }).municipalities, [
    'schaerbeek',
    'saint-gilles',
  ]);
  assert.deepEqual(normalizeConfig({ municipalities: null }).municipalities, []);
});

test('every municipality key selects itself', async () => {
  const { MUNICIPALITIES } = await import('../src/sibelga/constants.js');
  for (const { key } of MUNICIPALITIES) {
    assert.deepEqual(normalizeConfig({ municipalities: [key] }).municipalities, [key]);
  }
});
