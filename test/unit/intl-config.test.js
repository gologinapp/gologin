import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getIntlProfileConfig, getLinuxLocaleEnv } from '../../src/utils/browser.js';

test('linux gets LANGUAGE from browser language', () => {
  assert.deepEqual(getLinuxLocaleEnv('id-ID', 'linux'), { LANGUAGE: 'id_ID' });
  assert.deepEqual(getLinuxLocaleEnv('ru', 'linux'), { LANGUAGE: 'ru' });
});

test('locale env is not set on other platforms or without language', () => {
  assert.deepEqual(getLinuxLocaleEnv('id-ID', 'darwin'), {});
  assert.deepEqual(getLinuxLocaleEnv('id-ID', 'win32'), {});
  assert.deepEqual(getLinuxLocaleEnv('', 'linux'), {});
  assert.deepEqual(getLinuxLocaleEnv(undefined, 'linux'), {});
});

const EN_US_INTL = {
  accept_languages: 'en-US,en',
  selected_languages: 'en-US,en',
  app_locale: 'en-US',
  forced_languages: ['en-US'],
};

test('manual language is written to intl config', () => {
  const language = 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7';
  const profile = { autoLang: false, navigator: { language } };

  const intl = getIntlProfileConfig(profile, { country: 'US', languages: 'en' }, false);

  assert.deepEqual(intl, {
    accept_languages: 'id-ID,id,en-US,en',
    selected_languages: 'id-ID,id,en-US,en',
    app_locale: 'id',
    forced_languages: ['id'],
  });
  assert.equal(profile.navigator.language, language);
});

test('manual language without value falls back to en-US object', () => {
  const profile = { autoLang: false, navigator: { language: '' } };

  assert.deepEqual(getIntlProfileConfig(profile, {}, false), EN_US_INTL);
});

test('auto language uses timezone check result', () => {
  const profile = { autoLang: true, navigator: { language: 'en-US' } };

  assert.deepEqual(getIntlProfileConfig(profile, { country: 'ID', languages: 'id' }, true), {
    accept_languages: 'id-ID,id,en-US,en',
    selected_languages: 'id-ID,id,en-US,en',
    app_locale: 'id',
    forced_languages: ['id'],
  });
});

test('auto language without detected languages falls back to en-US object', () => {
  const profile = { autoLang: true, navigator: { language: 'id-ID' } };

  assert.deepEqual(getIntlProfileConfig(profile, { country: '', languages: '' }, true), EN_US_INTL);
  assert.equal(profile.navigator.language, 'id-ID');
});
