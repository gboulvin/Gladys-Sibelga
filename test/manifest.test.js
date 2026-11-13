// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/scenes.js';
import { MUNICIPALITIES } from '../src/sibelga/constants.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

/** Every multi-language text of the manifest, with its path for the messages. */
function collectTexts(node, path = 'manifest', texts = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectTexts(item, `${path}[${index}]`, texts));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      texts.push({ path, text: node });
    } else {
      for (const [key, value] of Object.entries(node)) {
        collectTexts(value, `${path}.${key}`, texts);
      }
    }
  }
  return texts;
}

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene_actions key has an onSceneAction handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every scene trigger the code fires is declared in scene_triggers, and vice versa', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const key of keysOf(manifest.widgets)) {
    assert.equal(typeof WIDGETS[key].get, 'function');
  }
});

test('the capability fields and the categories require Gladys >= 5.1.0', () => {
  // Older cores reject unknown manifest fields: `widgets`, `scene_triggers`
  // and `scene_actions` need 5.1.0 (`categories`: 4.86.0).
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(
    isAtLeast(minGladysVersion(), [5, 1, 0]),
    `gladys_version must start at 5.1.0 or later, got "${manifest.gladys_version}"`,
  );
});

test('the integration is tagged cloud: Sibelga is only reachable over the internet', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('every text of the manifest exists in English, French, German and Spanish', () => {
  const texts = collectTexts(manifest);
  assert.ok(texts.length > 50);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), path);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('labels, descriptions and placeholders are never plain strings', () => {
  const check = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => check(item, `${path}[${index}]`));
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (['label', 'description', 'placeholder'].includes(key)) {
          assert.equal(typeof value, 'object', `${path}.${key} must be a multi-language object`);
        }
        check(value, `${path}.${key}`);
      }
    }
  };
  check(manifest, 'manifest');
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(keysOf(stored).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    if (field.default !== undefined) {
      assert.deepEqual(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('the numeric bounds of the form are the ones the code applies', () => {
  for (const field of manifest.config_schema.filter((f) => f.type === 'number')) {
    assert.equal(normalizeConfig({ [field.key]: field.min - 1 })[field.key], field.min, field.key);
    assert.equal(normalizeConfig({ [field.key]: field.max + 1 })[field.key], field.max, field.key);
  }
});

test('the password is a secret field', () => {
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
  assert.equal(password.default, undefined);
});

test('the municipalities offered are the ones the code recognizes', () => {
  const field = manifest.config_schema.find((f) => f.key === 'municipalities');
  assert.deepEqual(
    field.options.map((option) => option.value),
    MUNICIPALITIES.map((municipality) => municipality.key),
  );
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest.
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const language of LANGUAGES) {
      assert.ok(section.description[language].length <= 1000, `${section.key}.${language}`);
    }
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
  assert.equal(manifest.docker_image, manifest.docker_image.toLowerCase(), 'ghcr.io is lowercase');
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});
