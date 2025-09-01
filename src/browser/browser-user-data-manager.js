import { createHash } from 'crypto';
import { createWriteStream, promises as _promises, rmdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

import { fontsCollection } from '../../fonts.js';
import { FALLBACK_API_URL } from '../utils/common.js';
import { makeRequest } from '../utils/http.js';

const { access, readFile, writeFile, mkdir, readdir, copyFile, rename } = _promises;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FONTS_URL = 'https://fonts.gologin.com/';
const FONTS_DIR_NAME = 'fonts';

const HOMEDIR = homedir();
const BROWSER_PATH = join(HOMEDIR, '.gologin', 'browser');
const OS_PLATFORM = process.platform;
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

export const downloadFonts = async (fontsList = [], profilePath) => {
  if (!fontsList.length) {
    return;
  }

  const browserFontsPath = join(BROWSER_PATH, FONTS_DIR_NAME);
  await mkdir(browserFontsPath, { recursive: true });

  const files = await readdir(browserFontsPath);
  const fontsToDownload = fontsList.filter(font => !files.includes(font));

  let promises = fontsToDownload.map(async font => {
    const body = await makeRequest(FONTS_URL + font, {
      maxAttempts: 5,
      retryDelay: 2000,
      timeout: 30 * 1000,
    });

    await writeFile(join(browserFontsPath, font), body);
  });

  if (promises.length) {
    await Promise.all(promises);
  }

  promises = fontsList.map((font) =>
    copyFile(join(browserFontsPath, font), join(profilePath, FONTS_DIR_NAME, font)));

  await Promise.all(promises);
};

export const composeFonts = async (fontsList = [], profilePath, differentOs = false) => {
  if (!(fontsList.length && profilePath)) {
    return;
  }

  const fontsToDownload = fontsCollection
    .filter(elem => fontsList.includes(elem.value))
    .reduce((res, elem) => res.concat(elem.fileNames || []), []);

  if (differentOs && !fontsToDownload.length) {
    throw new Error('No fonts to download found. Use getAvailableFonts() method and set some fonts from this list');
  }

  fontsToDownload.push('LICENSE.txt');
  fontsToDownload.push('OFL.txt');

  const pathToFontsDir = join(profilePath, FONTS_DIR_NAME);
  const fontsDirExists = await access(pathToFontsDir).then(() => true, () => false);
  if (fontsDirExists) {
    rmdirSync(pathToFontsDir, { recursive: true });
  }

  await mkdir(pathToFontsDir, { recursive: true });
  await downloadFonts(fontsToDownload, profilePath);

  if (OS_PLATFORM === 'linux') {
    await copyFontsConfigFile(profilePath);
  }
};

export const copyFontsConfigFile = async (profilePath) => {
  if (!profilePath) {
    return;
  }

  const fileContent = await readFile(resolve(__dirname, '..', '..', 'fonts_config'), 'utf-8');
  const result = fileContent.replace(/\$\$GOLOGIN_FONTS\$\$/g, join(profilePath, FONTS_DIR_NAME));

  const defaultFolderPath = join(profilePath, 'Default');
  await mkdir(defaultFolderPath, { recursive: true });
  await writeFile(join(defaultFolderPath, 'fonts_config'), result);
};

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
