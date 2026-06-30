import { createHash } from 'crypto';
import { promises as _promises } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';

import { FALLBACK_API_URL } from '../utils/common.js';
import { makeRequest } from '../utils/http.js';

const { readFile, readdir, rename } = _promises;

const DEFAULT_ORBITA_EXTENSIONS_NAMES = ['Google Hangouts', 'Chromium PDF Viewer', 'CryptoTokenExtension', 'Web Store'];
const GOLOGIN_BASE_FOLDER_NAME = '.gologin';
const GOLOGIN_TEST_FOLDER_NAME = '.gologin_test';
const osPlatform = process.platform;

export const downloadCookies = ({ profileId, ACCESS_TOKEN, API_BASE_URL }) =>
  makeRequest(`${API_BASE_URL}/browser/${profileId}/cookies`, {
    json: true,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
    method: 'GET',
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/cookies`,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });

export const uploadCookies = ({ cookies = [], profileId, ACCESS_TOKEN, API_BASE_URL }) =>
  makeRequest(`${API_BASE_URL}/browser/${profileId}/cookies?encrypted=true`, {
    json: cookies,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 20 * 1000,
    method: 'POST',
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/cookies?encrypted=true`,
  }).catch((e) => {
    console.log(e);

    return e;
  });

export const setExtPathsAndRemoveDeleted = (settings = {}, profileExtensionsCheckRes = [], profileId = '') => {
  const formattedLocalExtArray = profileExtensionsCheckRes.map((el) => {
    const [extFolderName = ''] = el.split(sep).reverse();
    const [originalId] = extFolderName.split('@');
    if (!originalId) {
      return null;
    }

    return {
      path: el,
      originalId,
    };
  }).filter(Boolean);

  const extensionsSettings = settings.extensions?.settings || {};
  const extensionsEntries = Object.entries(extensionsSettings);

  const promises = extensionsEntries.map(async (extensionObj) => {
    let [extensionId, currentExtSettings = {}] = extensionObj;
    const extName = currentExtSettings.manifest?.name || '';
    let extPath = currentExtSettings.path || '';
    let originalId = '';

    const isExtensionToBeDeleted = ['resources', 'passwords-ext', 'cookies-ext'].some(substring => extPath.includes(substring))
      && [GOLOGIN_BASE_FOLDER_NAME, GOLOGIN_TEST_FOLDER_NAME].some(substring => extPath.includes(substring))
      || DEFAULT_ORBITA_EXTENSIONS_NAMES.includes(extName)
      && [GOLOGIN_BASE_FOLDER_NAME, GOLOGIN_TEST_FOLDER_NAME].some(substring => extPath.includes(substring));

    if (isExtensionToBeDeleted) {
      delete extensionsSettings[extensionId];

      return;
    }

    if (osPlatform === 'win32') {
      extPath = extPath.replace(/\//g, '\\');
    } else {
      extPath = extPath.replace(/\\/g, '/');
    }

    extensionsSettings[extensionId].path = extPath;

    const splittedPath = extPath.split(sep);
    const isExtensionManageable = ['chrome-extensions', 'user-extensions'].some(substring => extPath.includes(substring))
      && [GOLOGIN_BASE_FOLDER_NAME, GOLOGIN_TEST_FOLDER_NAME].some(substring => extPath.includes(substring));

    if (isExtensionManageable) {
      const [extFolderName] = extPath.split(sep).reverse();
      [originalId] = extFolderName.split('@');
    } else if (splittedPath.length === 2) {
      [originalId] = splittedPath;
    }

    if (isExtensionManageable || splittedPath.length === 2) {
      const isExtensionInProfileSettings = formattedLocalExtArray.find(el => el.path.includes(originalId));
      if (!isExtensionInProfileSettings) {
        delete extensionsSettings[extensionId];

        return;
      }
    }

    const localExtObj = originalId && formattedLocalExtArray.find(el => el.path.includes(originalId));
    if (!localExtObj) {
      return;
    }

    const initialExtName = extensionId;

    extensionId = await recalculateId({
      localExtObj, extensionId, extensionsSettings, currentExtSettings,
    });

    if (initialExtName !== extensionId) {
      const profilePath = join(tmpdir(), `gologin_profile_${profileId}`);
      const extSyncFolder = join(profilePath, 'Default', 'Sync Extension Settings', initialExtName);
      const newSyncFolder = join(profilePath, 'Default', 'Sync Extension Settings', extensionId);

      await rename(extSyncFolder, newSyncFolder).catch(() => null);
    }

    if (localExtObj.path.endsWith('.zip')) {
      localExtObj.path = localExtObj.path.replace('.zip', '');
    }

    extensionsSettings[extensionId].path = localExtObj.path || '';
  });

  return Promise.all(promises).then(() => extensionsSettings);
};

export const setOriginalExtPaths = async (settings = {}, originalExtensionsFolder = '') => {
  if (!originalExtensionsFolder) {
    return null;
  }

  const extensionsSettings = settings.extensions?.settings || {};
  const extensionsEntries = Object.entries(extensionsSettings);

  const originalExtensionsList = await readdir(originalExtensionsFolder).catch(() => []);
  if (!originalExtensionsList.length) {
    return null;
  }

  const promises = originalExtensionsList.map(async (originalId) => {
    const extFolderPath = join(originalExtensionsFolder, originalId);
    const extFolderContent = await readdir(extFolderPath);
    if (!extFolderPath.length) {
      return {};
    }

    if (extFolderContent.includes('manifest.json')) {
      return {
        originalId,
        path: join(originalExtensionsFolder, originalId),
      };
    }

    const [version] = extFolderContent;

    return {
      originalId,
      path: join(originalExtensionsFolder, originalId, version),
    };
  });

  const originalExtPaths = await Promise.all(promises);

  extensionsEntries.forEach((extensionObj) => {
    const [extensionsId] = extensionObj;
    const extPath = extensionsSettings[extensionsId].path;
    if (!/chrome-extensions/.test(extPath)) {
      return;
    }

    const originalExtPath = originalExtPaths.find(el => el.originalId === extensionsId);
    if (!originalExtPath) {
      return;
    }

    extensionsSettings[extensionsId].path = originalExtPath.path || '';
  });

  return extensionsSettings;
};

export const recalculateId = async ({ localExtObj, extensionId, extensionsSettings, currentExtSettings }) => {
  if (currentExtSettings.manifest?.key) {
    return extensionId;
  }

  const manifestFilePath = join(localExtObj.path, 'manifest.json');
  const manifestString = await readFile(manifestFilePath, { encoding: 'utf8' }).catch(() => ({}));

  if (!manifestString) {
    return extensionId;
  }

  let manifestObject;
  try {
    manifestObject = JSON.parse(manifestString);
  } catch {
    return extensionId;
  }

  if (manifestObject.key) {
    return extensionId;
  }

  let encoding = 'utf8';
  if (osPlatform === 'win32') {
    encoding = 'utf16le';
  }

  const extPathToEncode = Buffer.from(localExtObj.path, encoding);

  const hexEncodedPath = createHash('sha256').update(extPathToEncode).digest('hex');
  const newId = hexEncodedPath.split('').slice(0, 32).map(symbol => extIdEncoding[symbol]).join('');
  if (extensionId !== newId) {
    delete extensionsSettings[extensionId];

    extensionsSettings[newId] = currentExtSettings;
    extensionId = newId;
  }

  return extensionId;
};

const extIdEncoding = {
  0: 'a',
  1: 'b',
  2: 'c',
  3: 'd',
  4: 'e',
  5: 'f',
  6: 'g',
  7: 'h',
  8: 'i',
  9: 'j',
  a: 'k',
  b: 'l',
  c: 'm',
  d: 'n',
  e: 'o',
  f: 'p',
};
