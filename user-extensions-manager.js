const path = require('path');
const fs = require('fs');
const { readdir, rmdir, readFile, stat, mkdir, copyFile } = require('fs').promises;
const request = require('requestretry').defaults({ timeout: 60000 });
const zipdir = require('zip-dir');

const ExtensionsExtractor = require('./extensions-extractor');
const { composeExtractionPromises, CHROME_EXTENSIONS_PATH, USER_EXTENSIONS_PATH } = require('./common');

const MAX_FILE_SIZE = 80 * 1024 * 1024;
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / 1024 / 1024;

class UserExtensionsManager {
  #existedUserExtensions = [];
  #API_BASE_URL = '';
  #ACCESS_TOKEN = '';
  #USER_AGENT = '';
  #TWO_FA_KEY = '';

  set userAgent(userAgent) {
    if (!userAgent) {
      return;
    }

    this.#USER_AGENT = userAgent;
  }

  set accessToken(accessToken) {
    if (!accessToken) {
      return;
    }

    this.#ACCESS_TOKEN = accessToken;
  }

  set twoFaKey(twoFaKey) {
    if (!twoFaKey) {
      return;
    }

    this.#TWO_FA_KEY = twoFaKey;
  }

  set apiUrl(apiUrl) {
    if (!apiUrl) {
      return;
    }

    this.#API_BASE_URL = apiUrl;
  }

  get apiBaseUrl() {
    return this.#API_BASE_URL;
  }

  get existedUserExtensions() {
    return this.#existedUserExtensions;
  }

  get accessToken() {
    return this.#ACCESS_TOKEN;
  }

  get twoFaKey() {
    return this.#TWO_FA_KEY;
  }

  get userAgent() {
    return this.#USER_AGENT;
  }

  set existedUserExtensions(fileList) {
    if (!fileList) {
      return;
    }

    this.#existedUserExtensions = fileList;
  }

  async addCustomExtension(pathToFiles) {
    try {
      const filesSize = await checkFileSizeSync(pathToFiles);
      const isZip = pathToFiles.endsWith('.zip');

      if (filesSize > MAX_FILE_SIZE) {
        throw new Error(`The maximum file size is ${MAX_FILE_SIZE_MB}MB`);
      }

      const customId = this.generateExtensionId();

      if (isZip) {
        const pathToExtract = path.join(USER_EXTENSIONS_PATH, customId);
        await ExtensionsExtractor.extractExtension(pathToFiles, pathToExtract);
        pathToFiles = pathToExtract;
      }

      let fileList = (await readdir(pathToFiles).catch(() => ['cantReadError']))
        .filter(folderContent => folderContent !== '.DS_Store');

      if (fileList.length === 1 && !fileList.includes('cantReadError')) {
        const isFolder = (await stat(pathToFiles)).isDirectory();
        if (isFolder) {
          const [folderName] = fileList;
          pathToFiles = path.join(pathToFiles, folderName);
          fileList = await readdir(pathToFiles).catch(() => ['cantReadError']);
        }
      }

      if (fileList.includes('cantReadError')) {
        throw new Error('Can\'t access folder');
      }

      if (!fileList.includes('manifest.json')) {
        if (isZip) {
          rmdir(pathToFiles);
        }
        throw new Error('There is no manifest.json in the extension folder');
      }

      if (!isZip) {
        const destPath = path.join(USER_EXTENSIONS_PATH, customId)
        await copyFolder(pathToFiles, destPath).catch(() => {
          throw new Error('Something went wrong coping your folder');
        });
      }

      const [nameIconId] = await this.getExtensionsNameAndImage([customId], USER_EXTENSIONS_PATH);

      if (!nameIconId) {
        throw new Error('Something went wrong. Please try again later');
      }

      const dbResult = await request(`${this.#API_BASE_URL}/extensions/create_user_extension`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#ACCESS_TOKEN}`,
          'user-agent': this.#USER_AGENT,
          'x-two-factor-token': this.#TWO_FA_KEY || '',
        },
        body: {
          extensionInfo: nameIconId,
        },
        json: true,
      });
      // if success - there is no body
      if (dbResult.body) {
        throw new Error('Something went wrong inserting your data to database');
      }

      const fileBuffer = await zipdir(pathToFiles).catch(() => null);
      if (!fileBuffer) {
        throw new Error('Something went wrong. Please try again later');
      }

      const signedUrl = await request.get(`${this.#API_BASE_URL}/extensions/upload_url?extId=${customId}`, {
        headers: {
          Authorization: `Bearer ${this.#ACCESS_TOKEN}`,
          'user-agent': this.#USER_AGENT,
          'x-two-factor-token': this.#TWO_FA_KEY || '',
        },
        maxAttempts: 3,
        retryDelay: 2000,
        timeout: 10 * 1000,
        fullResponse: false,
      });

      const uploadResponse = await request.put(signedUrl, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': Buffer.byteLength(fileBuffer),
        },
        body: fileBuffer,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        maxAttempts: 3,
        retryDelay: 2000,
        timeout: 30 * 1000,
        fullResponse: true,
      });
      // if success - there is no body, in case of error - there will be an error in the body
      if (uploadResponse.body) {
        throw new Error('Your extension is added locally but we couldn\'t upload it to the cloud');
      }

      return {
        status: 'success',
        message: nameIconId,
      }
    } catch (e) {
      return {
        status: 'error',
        message: e.message,
      }
    }
  }

  checkLocalUserChromeExtensions = async (userChromeExtensions) => {
    if (!userChromeExtensions.length) {
      return;
    }

    const extensionsToDownloadPaths = await request.post(`${this.#API_BASE_URL}/extensions/user_chrome_extensions_paths`, {
      json: true,
      fullResponse: false,
      headers: {
        Authorization: `Bearer ${this.#ACCESS_TOKEN}`,
        'user-agent': this.#USER_AGENT,
        'x-two-factor-token': this.#TWO_FA_KEY || '',
      },
      body: {
        existedUserChromeExtensions: this.#existedUserExtensions,
      }
    }) || [];

    const extensionsToDownloadPathsFiltered =
      extensionsToDownloadPaths.filter(extPath => userChromeExtensions.some(extId => extPath.includes(extId)));

    if (!extensionsToDownloadPathsFiltered.length) {
      return this.getExtensionsStrToIncludeAsOrbitaParam(userChromeExtensions, USER_EXTENSIONS_PATH);
    }

    const promises = extensionsToDownloadPathsFiltered.map(async awsPath => {
      const [basePath] = awsPath.split('?');
      const [extId] = basePath.split('/').reverse();
      const zipPath = `${path.join(USER_EXTENSIONS_PATH, extId)}.zip`;
      const archiveZip = fs.createWriteStream(zipPath);

      await request(awsPath, {
        retryDelay: 2 * 1000,
        maxAttempts: 3,
      }).pipe(archiveZip);

      await new Promise(r => archiveZip.on('close', () => r()));
      return zipPath;
    });

    const zipPaths = await Promise.all(promises).catch(() => []);

    if (!zipPaths) {
      return this.getExtensionsStrToIncludeAsOrbitaParam(userChromeExtensions, USER_EXTENSIONS_PATH);
    }

    const extractionPromises = composeExtractionPromises(zipPaths, USER_EXTENSIONS_PATH);
    const isExtensionsExtracted = await Promise.all(extractionPromises).catch(() => 'error');

    if (isExtensionsExtracted !== 'error') {
      const [downloadedFolders] = zipPaths.map(archivePath => archivePath.split(path.sep).reverse());
      this.#existedUserExtensions = [...this.#existedUserExtensions, ...downloadedFolders];
    }

    return this.getExtensionsStrToIncludeAsOrbitaParam(userChromeExtensions, USER_EXTENSIONS_PATH);
  }

  async getExtensionsStrToIncludeAsOrbitaParam(profileExtensions = [], folderPath = CHROME_EXTENSIONS_PATH) {
    if (!(Array.isArray(profileExtensions) && profileExtensions.length)) {
      return [];
    }

    const folders = await readdir(folderPath).then(folderNames => folderNames.map(folderName => path.join(folderPath, folderName)));

    if (!folders.length) {
      return [];
    }

    const formattedIdsList = folders.map((el) => {
      const [folderName] = el.split(path.sep).reverse();
      const [originalId] = folderName.split('@');
      return {
        originalId,
        path: el,
      };
    });

    return profileExtensions.map((el) => {
      const extExisted = formattedIdsList.find(chromeExtPathElem => chromeExtPathElem.originalId === el);

      if (!extExisted) {
        return '';
      }

      return extExisted.path;
    }).filter(Boolean);
  }

  async getExtensionsNameAndImage(extensionsIds, pathToExtensions) {
    const isCheckLocalFiles = [CHROME_EXTENSIONS_PATH, USER_EXTENSIONS_PATH].includes(pathToExtensions);
    const extensionFolderNames = await readdir(pathToExtensions).catch(() => {});
    const filteredExtensionFolderNames = extensionFolderNames.filter(extensionFolder => extensionsIds.some(extensionId => !extensionFolder.includes('.zip') && extensionFolder.includes(extensionId)));

    if (!filteredExtensionFolderNames.length) {
      return;
    }

    const namesPromise = extensionsIds.map(async (extensionsId) => {
      const folderName = filteredExtensionFolderNames.find(folderName => folderName.includes(extensionsId));

      if (!folderName) {
        return;
      }

      let pathToExtensionsFolder = [pathToExtensions, folderName];
      if (!isCheckLocalFiles) {
        const [extensionVersion] = await readdir(path.join(pathToExtensions, folderName));
        pathToExtensionsFolder = [pathToExtensions, folderName, extensionVersion];
      }

      const manifestPath = path.join(...pathToExtensionsFolder, 'manifest.json');
      const manifestString = await readFile(manifestPath, 'utf8').catch(() => '');
      if (!manifestString) {
        return;
      }

      const manifestObject = JSON.parse(manifestString);
      let name;
      if (manifestObject.name.includes('__MSG')) {
        const manifestName = manifestObject.name || '';
        const fieldNameInLocale = manifestName.replace(/__/g, '').split('MSG_')[1];
        const localePath = path.join(...pathToExtensionsFolder, '_locales', manifestObject.default_locale, 'messages.json');
        const localeString = await readFile(localePath, 'utf8').catch(() => {});

        try {
          const parsedLocale = JSON.parse(localeString.trim());
          name = parsedLocale[fieldNameInLocale].message;
        } catch (e) {}
      } else {
        name = manifestObject.name;
      }

      if (!name) {
        return;
      }

      const iconObject = manifestObject.icons;
      let iconPath = manifestObject.browser_action?.default_icon;
      if (iconObject) {
        iconPath = iconObject['128'];
      }

      let iconBSON = '';
      if (iconPath) {
        const iconPathFull = path.join(...pathToExtensionsFolder, iconPath);
        iconBSON = await readFile(iconPathFull, 'base64').catch(() => {});
      }

      return {
        name,
        extId: extensionsId,
        iconBinary: iconBSON,
      };
    });

    const extensionsArray = await Promise.all(namesPromise);
    return extensionsArray.filter(Boolean);
  }

  generateExtensionId() {
    let result = '';
    let extensionIdLength = 32;
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    const charactersLength = characters.length;
    while (extensionIdLength--) {
      result += characters.charAt(Math.floor(Math.random() *
        charactersLength));
    }
    return result;
  }
}

const checkFileSizeSync = async (pathToFile) => {
  try {
    const [fileName] = pathToFile.split(path.sep).reverse();
    if (fileName === '.DS_Store') {
      return 0;
    }

    const fileStats = await stat(pathToFile);
    if (!fileStats.isDirectory()) {
      return fileStats.size;
    }

    const files = await readdir(pathToFile);
    const promises = files.map(async file => checkFileSizeSync(path.join(pathToFile, file)));

    return (await Promise.all(promises)).reduce((result, value) => result + value, 0);
  } catch {
    return -1;
  }
};

const copyFolder = async (fromPath, destPath) => {
  const stats = await stat(fromPath);

  if (!stats.isDirectory()) {
    return copyFile(fromPath, destPath);
  }

  await mkdir(destPath, { recursive: true }).catch(() => null);
  const files = await readdir(fromPath);
  const promises = files.map(async file => {
    await mkdir(destPath, { recursive: true }).catch(() => null);

    return copyFolder(path.join(fromPath, file), path.join(destPath, file));
  });

  return Promise.all(promises);
};

module.exports = UserExtensionsManager;
