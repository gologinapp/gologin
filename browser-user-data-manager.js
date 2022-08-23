const path = require('path');
const os = require('os');
const request = require('requestretry');
const { rmdirSync, createWriteStream } = require('fs');
const { access, readFile, writeFile, mkdir, readdir, copyFile, rename } = require('fs').promises;
const crypto = require('crypto');

const fontsCollection = require('./fonts');

const FONTS_URL = 'https://fonts.gologin.com/';
const FONTS_DIR_NAME = 'fonts';

const HOMEDIR = os.homedir();
const BROWSER_PATH = path.join(HOMEDIR, '.gologin', 'browser');
const OS_PLATFORM = process.platform;
const DEFAULT_ORBITA_EXTENSIONS_NAMES = ['Google Hangouts', 'Chromium PDF Viewer', 'CryptoTokenExtension', 'Web Store'];
const GOLOGIN_BASE_FOLDER_NAME = '.gologin';
const GOLOGIN_TEST_FOLDER_NAME = '.gologin_test';
const osPlatform = process.platform;

class BrowserUserDataManager {
  static downloadCookies({ profileId, ACCESS_TOKEN, API_BASE_URL }) {
    return request.get(`${API_BASE_URL}/browser/${profileId}/cookies?encrypted=true`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'user-agent': 'gologin-api',
      },
      json: true,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
    }).catch((e) => {
      console.log(e);
      return { body: [] };
    });
  }

  static uploadCookies({ cookies = [], profileId, ACCESS_TOKEN, API_BASE_URL }) {
    return request.post(`${API_BASE_URL}/browser/${profileId}/cookies?encrypted=true`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'User-Agent': 'gologin-api',
      },
      json: cookies,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 20 * 1000,
    }).catch((e) => {
      console.log(e);
      return e;
    });
  }

  static async downloadFonts(fontsList = [], profilePath) {
    if (!fontsList.length) {
      return;
    }

    const browserFontsPath = path.join(BROWSER_PATH, FONTS_DIR_NAME);
    await mkdir(browserFontsPath, { recursive: true });

    const files = await readdir(browserFontsPath);
    const fontsToDownload = fontsList.filter(font => !files.includes(font));

    let promises = fontsToDownload.map(font => request.get(FONTS_URL + font, {
      maxAttempts: 5,
      retryDelay: 2000,
      timeout: 30 * 1000,
    })
      .pipe(createWriteStream(path.join(browserFontsPath, font)))
    );

    if (promises.length) {
      await Promise.all(promises);
    }

    promises = fontsList.map((font) =>
      copyFile(path.join(browserFontsPath, font), path.join(profilePath, FONTS_DIR_NAME, font)));

    await Promise.all(promises);
  }

  static async composeFonts(fontsList = [], profilePath, differentOs = false) {
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

    const pathToFontsDir = path.join(profilePath, FONTS_DIR_NAME);
    const fontsDirExists = await access(pathToFontsDir).then(() => true, () => false);
    if (fontsDirExists) {
      rmdirSync(pathToFontsDir, { recursive: true });
    }

    await mkdir(pathToFontsDir, { recursive: true });
    await this.downloadFonts(fontsToDownload, profilePath);

    if (OS_PLATFORM === 'linux') {
      await this.copyFontsConfigFile(profilePath);
    }
  }

  static async copyFontsConfigFile(profilePath) {
    if (!profilePath) {
      return;
    }

    const fileContent = await readFile(path.resolve(__dirname, 'fonts_config'), 'utf-8');
    const result = fileContent.replace(/\$\$GOLOGIN_FONTS\$\$/g, path.join(profilePath, FONTS_DIR_NAME));

    const defaultFolderPath = path.join(profilePath, 'Default');
    await mkdir(defaultFolderPath, { recursive: true });
    await writeFile(path.join(defaultFolderPath, 'fonts_config'), result);
  }

  static setExtPathsAndRemoveDeleted(settings = {}, profileExtensionsCheckRes = [], profileId = '') {
    const formattedLocalExtArray = profileExtensionsCheckRes.map((el) => {
      const [extFolderName = ''] = el.split(path.sep).reverse();
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

      const splittedPath = extPath.split(path.sep);
      const isExtensionManageable = ['chrome-extensions', 'user-extensions'].some(substring => extPath.includes(substring))
        && [GOLOGIN_BASE_FOLDER_NAME, GOLOGIN_TEST_FOLDER_NAME].some(substring => extPath.includes(substring));

      if (isExtensionManageable) {
        const [extFolderName] = extPath.split(path.sep).reverse();
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

      extensionId = await this.recalculateId({
        localExtObj, extensionId, extensionsSettings, currentExtSettings,
      });

      if (initialExtName !== extensionId) {
        const profilePath = path.join(os.tmpdir(), `gologin_profile_${profileId}`);
        const extSyncFolder = path.join(profilePath, 'Default', 'Sync Extension Settings', initialExtName);
        const newSyncFolder = path.join(profilePath, 'Default', 'Sync Extension Settings', extensionId);

        await rename(extSyncFolder, newSyncFolder).catch(() => null);
      }

      if (localExtObj.path.endsWith('.zip')) {
        localExtObj.path = localExtObj.path.replace('.zip', '');
      }

      extensionsSettings[extensionId].path = localExtObj.path || '';
    });

    return Promise.all(promises).then(() => extensionsSettings);
  }

  static async setOriginalExtPaths(settings = {}, originalExtensionsFolder = '') {
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
      const extFolderPath = path.join(originalExtensionsFolder, originalId);
      const extFolderContent = await readdir(extFolderPath);
      if (!extFolderPath.length) {
        return {};
      }

      if (extFolderContent.includes('manifest.json')) {
        return {
          originalId,
          path: path.join(originalExtensionsFolder, originalId),
        };
      }

      const [version] = extFolderContent;
      return {
        originalId,
        path: path.join(originalExtensionsFolder, originalId, version),
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
  }

  static async recalculateId({ localExtObj, extensionId, extensionsSettings, currentExtSettings }) {
    if (currentExtSettings.manifest?.key) {
      return extensionId;
    }

    const manifestFilePath = path.join(localExtObj.path, 'manifest.json');
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

    const hexEncodedPath = crypto.createHash('sha256').update(extPathToEncode).digest('hex');
    const newId = hexEncodedPath.split('').slice(0, 32).map(symbol => extIdEncoding[symbol]).join('');
    if (extensionId !== newId) {
      delete extensionsSettings[extensionId];

      extensionsSettings[newId] = currentExtSettings;
      extensionId = newId;
    }

    return extensionId;
  }
}

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

module.exports = {
  BrowserUserDataManager,
}
