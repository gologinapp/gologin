const path = require('path');
const request = require('requestretry').defaults({ timeout: 60000 });
const fs = require('fs');
const { mkdir, readdir, rmdir } = require('fs').promises;
const os = require('os');

const  ExtensionsExtractor = require('./extensions-extractor');

const HOMEDIR = os.homedir();
const CHROME_EXT_DIR_NAME = 'chrome-extensions';
const EXTENSIONS_PATH = path.join(HOMEDIR, '.gologin', 'extensions');
const CHROME_EXTENSIONS_PATH = path.join(EXTENSIONS_PATH, CHROME_EXT_DIR_NAME);
const EXTENSION_URL = 'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D{ext_id}%26uc&prodversion=97.0.4692.71';

class ExtensionsManager {
  #USER_AGENT = '';
  #API_BASE_URL = '';
  #ACCESS_TOKEN = '';
  #existedChromeExtensions = [];
  #inited = false;
  #useLocalExtStorage = false;
  #deleteProfileExtFolders = false;
  #deleteWidevineCdmFolder = false;

  constructor() {
    if (!ExtensionsManager.instance) {
      ExtensionsManager.instance = this;
    }

    return ExtensionsManager.instance;
  }

  get isInited() { return this.#inited }
  get useLocalExtStorage() { return this.#useLocalExtStorage }
  get deleteProfileExtFolders() { return this.#deleteProfileExtFolders }
  get deleteWidevineCdmFolder() { return this.#deleteWidevineCdmFolder }

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

  set apiUrl(apiUrl) {
    if (!apiUrl) {
      return;
    }

    this.#API_BASE_URL = apiUrl;
  }

  init() {
    if (this.#inited) {
      return Promise.resolve();
    }

    return mkdir(CHROME_EXTENSIONS_PATH, { recursive: true })
      .then(() => readdir(CHROME_EXTENSIONS_PATH))
      .then(filesList => {
        this.#existedChromeExtensions = filesList;
        this.#inited = true;
      })
      .catch((e) => console.log('ExtensionsManager init error:', e));
  }

  get existedChromeExtensionsList() {
    return this.#existedChromeExtensions;
  }

  async checkChromeExtensions(profileExtensions = []) {
    if (!(Array.isArray(profileExtensions) && profileExtensions.length)) {
      return [];
    }

    const extensionsToDownload = this.#getExtensionsToDownload(profileExtensions);
    if (!extensionsToDownload) {
      return [];
    }

    const downloadedArchives = await this.downloadChromeExtensions(extensionsToDownload);
    const filteredArchives = downloadedArchives.filter(Boolean);
    const promises = composeExtractionPromises(filteredArchives);

    await Promise.all(promises);
    return this.getExtensionsStrToIncludeAsOrbitaParam(profileExtensions);
  }

  #getExtensionsToDownload(profileExtensions) {
    const existedOriginalIds = this.#existedChromeExtensions.map((val) => {
      const [originalId] = val.split('@');
      return originalId;
    });

    return profileExtensions.reduce((res, val) => {
      const [originalId] = val.split('@');
      const extensionExists = existedOriginalIds.includes(originalId);
      if (!extensionExists) {
        res.push(val);
      }

      return res;
    }, []);
  }

  async downloadChromeExtensions(idsToDownload = []) {
    if (!(Array.isArray(idsToDownload) && idsToDownload.length)) {
      return [];
    }

    const promises = idsToDownload.map(async (id) => {
      const [originalId] = id.split('@');
      const extUrl = EXTENSION_URL.replace('{ext_id}', originalId);

      const uploadedProfileMetadata = await getExtMetadata(extUrl);

      const reqPath = uploadedProfileMetadata.req.path;
      const extVer = getExtVersion(reqPath);

      const buffer = await new Promise((res) => {
        const chunks = []
        request.get(extUrl, {
          maxAttempts: 3,
          retryDelay: 1000,
          timeout: 8 * 1000,
          fullResponse: false,
        })
          .on('data', (data) => chunks.push(data))
          .on('end', () => res(Buffer.concat(chunks)));
      });

      let zipExt;
      try {
        zipExt = crxToZip(buffer);
      } catch (e) {
        console.log(e);
        return '';
      }

      const archiveZipPath = path.join(CHROME_EXTENSIONS_PATH, originalId + '@' + extVer + '.zip');

      const archiveZip = fs.createWriteStream(archiveZipPath);
      archiveZip.write(zipExt);
      archiveZip.close();

      return new Promise(r => archiveZip.on('close', () => r(archiveZipPath)));
    });

    return Promise.all(promises);
  }

  async getExtensionsPolicies() {
    const globalExtConfig = await request.get(`${this.#API_BASE_URL}/gologin-settings/chrome_ext_policies`, {
      headers: {
        Authorization: `Bearer ${this.#ACCESS_TOKEN}`,
        'user-agent': this.#USER_AGENT,
      },
      json: true,
      maxAttempts: 2,
      retryDelay: 1000,
      timeout: 10 * 1000,
      fullResponse: false,
    });

    const chromeExtPolicies = globalExtConfig?.chromeExtPolicies || {};
    const {
      useLocalExtStorage = false,
      deleteProfileExtFolders = false,
      deleteWidevineCdmFolder = false,
    } = chromeExtPolicies;

    this.#useLocalExtStorage = useLocalExtStorage;
    this.#deleteProfileExtFolders = deleteProfileExtFolders;
    this.#deleteWidevineCdmFolder = deleteWidevineCdmFolder;
  }

  async getExtensionsStrToIncludeAsOrbitaParam(profileExtensions = []) {
    if (!(Array.isArray(profileExtensions) && profileExtensions.length)) {
      return [];
    }

    const chromeExtList = await readdir(CHROME_EXTENSIONS_PATH);
    if (!chromeExtList) {
      return [];
    }

    const formattedIdsList = chromeExtList.map((el) => {
      const [originalId] = el.split('@');
      return {
        originalId,
        folderName: el,
      };
    });

    return profileExtensions.map((el) => {
      const extExisted = formattedIdsList.find(chromeExtPathElem => chromeExtPathElem.originalId === el);
      if (!extExisted) {
        return '';
      }

      return path.join(CHROME_EXTENSIONS_PATH, extExisted.folderName);
    }).filter(Boolean);
  }

  async updateExtensions() {
    const fileList = await readdir(CHROME_EXTENSIONS_PATH).catch(() => []);
    if (!fileList.length) {
      return;
    }

    const oldFolders = [];

    const versionCheckPromises = fileList.map(async (extension) => {
      if (!extension.includes('@')) {
        return '';
      }

      const [originalId, currentVersion] = extension.split('@');
      const extUrl = EXTENSION_URL.replace('{ext_id}', originalId);
      const uploadedProfileMetadata = await getExtMetadata(extUrl);
      const reqPath = uploadedProfileMetadata.req.path;
      const availableVersion = getExtVersion(reqPath);

      if (currentVersion === availableVersion) {
        return '';
      }

      oldFolders.push(path.join(CHROME_EXTENSIONS_PATH, extension));
      return originalId;
    });

    const extensionsNames = (await Promise.all(versionCheckPromises)).filter(Boolean);
    const archivesPaths = (await this.downloadChromeExtensions(extensionsNames)).filter(Boolean);
    const extractionPromises = composeExtractionPromises(archivesPaths);
    await Promise.all(extractionPromises);

    const removeFoldersPromises = oldFolders.map(folder => (
      rmdir(folder, { recursive: true, maxRetries: 3 }).catch(() => {})
    ));

    return Promise.all(removeFoldersPromises);
  }
}

const crxToZip = (buf) => {
  if (buf[0] === 80 && buf[1] === 75 && buf[2] === 3 && buf[3] === 4) {
    return buf;
  }

  if (!(buf[0] === 67 || buf[1] === 114 || buf[2] === 50 || buf[3] === 52)) {
    throw new Error('Invalid header: Does not start with Cr24');
  }

  const isV3 = buf[4] === 3;
  const isV2 = buf[4] === 2;

  if (!(isV2 || isV3) || buf[5] || buf[6] || buf[7]) {
    throw new Error('Unexpected crx format version number.');
  }

  if (isV2) {
    const publicKeyLength = calcLength(buf[8], buf[9], buf[10], buf[11]);
    const signatureLength = calcLength(buf[12], buf[13], buf[14], buf[15]);

    const zipStartOffset = 16 + publicKeyLength + signatureLength;
    return buf.slice(zipStartOffset, buf.length);
  }

  const headerSize = calcLength(buf[8], buf[9], buf[10], buf[11]);
  const zipStartOffset = 12 + headerSize;

  return buf.slice(zipStartOffset, buf.length);
}

const calcLength = (a, b, c, d) => {
  let length = 0;

  length += a << 0;
  length += b << 8;
  length += c << 16;
  length += d << 24 >>> 0;
  return length;
}

const getExtMetadata = (extUrl) => (
  request.head(extUrl, {
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 2 * 1000,
    fullResponse: true,
  })
);

const getExtVersion = (metadata) => {
  const [extFullName = ''] = metadata.split('/').reverse();
  const [extName = ''] = extFullName.split('.');
  const splitExtName = extName.split('_');
  splitExtName.shift();
  return splitExtName.join('_');
};

const composeExtractionPromises = (filteredArchives) => (
  filteredArchives.map((extArchivePath) => {
    const [archiveName = ''] = extArchivePath.split(path.sep).reverse();
    const [destFolder] = archiveName.split('.');
    return ExtensionsExtractor.extractExtension(extArchivePath, path.join(CHROME_EXTENSIONS_PATH, destFolder))
      .then(() => ExtensionsExtractor.deleteExtensionArchive(extArchivePath))
  })
);

module.exports = ExtensionsManager;


