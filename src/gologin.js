import * as Sentry from '@sentry/node';
import { execFile, spawn } from 'child_process';
import debugDefault from 'debug';
import decompress from 'decompress';
import decompressUnzip from 'decompress-unzip';
import { existsSync, mkdirSync, promises as _promises } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve as _resolve, sep } from 'path';
import rimraf from 'rimraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { fileURLToPath } from 'url';

import { fontsCollection } from '../fonts.js';
import { getCurrentProfileBookmarks } from './bookmarks/utils.js';
import { updateProfileBookmarks, updateProfileProxy, updateProfileResolution, updateProfileUserAgent } from './browser/browser-api.js';
import BrowserChecker from './browser/browser-checker.js';
import {
  composeFonts, downloadCookies, setExtPathsAndRemoveDeleted, setOriginalExtPaths, uploadCookies,
} from './browser/browser-user-data-manager.js';
import {
  createDBFile,
  getChunckedInsertValues,
  getCookiesFilePath,
  getDB,
  getUniqueCookies,
  loadCookiesFromFile,
} from './cookies/cookies-manager.js';
import ExtensionsManager from './extensions/extensions-manager.js';
import { archiveProfile } from './profile/profile-archiver.js';
import { checkAutoLang, getIntlProfileConfig } from './utils/browser.js';
import { API_URL, ensureDirectoryExists, FALLBACK_API_URL, getOsAdvanced } from './utils/common.js';
import { STORAGE_GATEWAY_BASE_URL } from './utils/constants.js';
import { get, isPortReachable } from './utils/utils.js';
export { exitAll, GologinApi } from './gologin-api.js';
import { checkSocksProxy, makeRequest } from './utils/http.js';
import { zeroProfileBookmarks } from './utils/zero-profile-bookmarks.js';
import { zeroProfilePreferences } from './utils/zero-profile-preferences.js';
const { access, unlink, writeFile, readFile, mkdir, copyFile } = _promises;

const SEPARATOR = sep;
const OS_PLATFORM = process.platform;
const TIMEZONE_URL = 'https://geo.myip.link';
const PROXY_NONE = 'none';

const debug = debugDefault('gologin');
const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

export class GoLogin {
  constructor(options = {}) {
    this.browserLang = 'en-US';
    this.access_token = options.token;
    this.profile_id = options.profile_id;
    this.password = options.password;
    this.extra_params = options.extra_params;
    this.executablePath = options.executablePath;
    this.vnc_port = options.vncPort;
    this.fontsMasking = false;
    this.is_active = false;
    this.is_stopping = false;
    this.differentOs = false;
    this.profileOs = 'lin';
    this.waitWebsocket = options.waitWebsocket ?? true;
    this.isEmptyFonts = false;
    this.isFirstSession = false;
    this.isCloudHeadless = options.isCloudHeadless ?? true;
    this.storageGatewayUrl = `${STORAGE_GATEWAY_BASE_URL}/upload`;

    this.tmpdir = tmpdir();
    this.autoUpdateBrowser = !!options.autoUpdateBrowser;
    this.checkBrowserUpdate = options.checkBrowserUpdate ?? true;
    this.browserChecker = new BrowserChecker(options.skipOrbitaHashChecking);
    this.uploadCookiesToServer = options.uploadCookiesToServer || false;
    this.writeCookiesFromServer = options.writeCookiesFromServer ?? true;
    this.remote_debugging_port = options.remote_debugging_port || 0;
    this.timezone = options.timezone;
    this.extensionPathsToInstall = [];
    this.customArgs = options.args || [];
    this.restoreLastSession = options.restoreLastSession || true;
    this.processSpawned = null;
    this.processKillTimeout = 1 * 1000;
    this.browserMajorVersion = 0;
    this.newProxyOrbbitaMajorVersion = 135;
    this.proxyCheckTimeout = options.proxyCheckTimeout || 13 * 1000;
    this.proxyCheckAttempts = options.proxyCheckAttempts || 3;
    this.browserLatestMajorVersion = 137;

    if (process.env.DISABLE_TELEMETRY !== 'true') {
      Sentry.init({
        dsn: 'https://a13d5939a60ae4f6583e228597f1f2a0@sentry-new.amzn.pro/24',
        tracesSampleRate: 1.0,
        defaultIntegrations: false,
        release: process.env.npm_package_version || '2.1.24',
      });
    }

    if (options.tmpdir) {
      this.tmpdir = options.tmpdir;
      if (!existsSync(this.tmpdir)) {
        debug('making tmpdir', this.tmpdir);
        mkdirSync(this.tmpdir, { recursive: true });
      }
    }

    this.profile_zip_path = join(this.tmpdir, `gologin_${this.profile_id}.zip`);
    this.bookmarksFilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`, 'Default', 'Bookmarks');
    debug('INIT GOLOGIN', this.profile_id);
  }

  async checkBrowser(majorVersion) {
    this.executablePath = await this.browserChecker.checkBrowser({
      autoUpdateBrowser: this.autoUpdateBrowser,
      checkBrowserUpdate: this.checkBrowserUpdate,
      majorVersion,
    });
  }

  async checkAndDownloadBrowserByOpts(opts = {}) {
    const { majorVersions = [], lastActualCount = 5 } = opts;

    let versionsToDownload = majorVersions;
    if (!(Array.isArray(versionsToDownload) && versionsToDownload.length)) {
      versionsToDownload = [];

      const latestVersionNumber = await this.getLatestBrowserVersion();

      for (let i = latestVersionNumber; i > latestVersionNumber - lastActualCount; i--) {
        versionsToDownload.push(i.toString());
      }
    }

    for (const majorVersion of versionsToDownload) {
      await this.browserChecker.checkBrowser({
        autoUpdateBrowser: true,
        checkBrowserUpdate: true,
        majorVersion,
      }).catch((error) => {
        console.log('Error Downloading Browser version', majorVersion, error);
      });
    }
  }

  async getLatestBrowserVersion() {
    const { latestVersion: browserLatestVersion } = await this.browserChecker.getLatestBrowserVersion();
    const [latestBrowserMajorVersion] = browserLatestVersion.split('.');
    const latestVersionNumber = Number(latestBrowserMajorVersion);
    this.latestBrowserMajorVersion = latestVersionNumber;

    return latestVersionNumber;
  }

  async setProfileId(profile_id) {
    this.profile_id = profile_id;
    this.cookiesFilePath = await getCookiesFilePath(profile_id, this.tmpdir);
    this.profile_zip_path = join(this.tmpdir, `gologin_${this.profile_id}.zip`);
    this.bookmarksFilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`, 'Default', 'Bookmarks');
  }

  async getProfile(profile_id) {
    const id = profile_id || this.profile_id;
    debug('getProfile', this.access_token, id);
    const profileResponse = await makeRequest(`${API_URL}/browser/features/${id}/info-for-run`, {
      method: 'GET',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/features/${id}/info-for-run` });

    return JSON.parse(profileResponse);
  }

  async getProfileS3() {
    const token = this.access_token;
    debug('getProfileS3 token=', token, 'profile=', this.profile_id);
    const downloadURL = `${STORAGE_GATEWAY_BASE_URL}/download`;
    debug('loading profile from public s3 bucket, url=', downloadURL);

    const profileResponse = await fetch(downloadURL, {
      headers: {
        Authorization: `Bearer ${token}`,
        browserId: this.profile_id,
      },
    });

    const profileResponseBody = await profileResponse.arrayBuffer();

    if (profileResponse.status !== 200) {
      debug(`Gologin S3 BUCKET ${downloadURL} response error ${profileResponse.statusCode}  - use empty`);

      return '';
    }

    return Buffer.from(profileResponseBody);
  }

  async postFile(fileName, fileBuff) {
    debug('POSTING FILE', fileBuff.length);
    debug('Getting signed URL for S3');

    const bodyBufferBiteLength = Buffer.byteLength(fileBuff);

    await makeRequest(this.storageGatewayUrl, {
      headers: {
        browserId: this.profile_id,
        'Content-Type': 'application/zip',
        'Content-Length': bodyBufferBiteLength,
      },
      method: 'PUT',
      body: fileBuff,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 30 * 1000,
    }, { token: this.access_token });

    console.log('Profile has been uploaded to S3 successfully');
  }

  async emptyProfileFolder() {
    debug('get emptyProfileFolder');
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const zeroProfilePath = join(currentDir, '..', 'zero_profile.zip');
    const profile = await readFile(_resolve(zeroProfilePath));
    debug('emptyProfileFolder LENGTH ::', profile.length);

    return profile;
  }

  getGologinPreferences(profileData) {
    const os = profileData.os || '';
    const osSpec = profileData.osSpec || '';
    const isM1 = profileData.isM1 || false;
    const isArm = (os === 'mac' && osSpec && osSpec.includes('M')) || isM1;
    const resolution = (profileData.navigator && profileData.navigator.resolution) || '1920x1080';
    const [screenWidth, screenHeight] = resolution.split('x').map(Number);
    const langHeader = (profileData.navigator && profileData.navigator.language) || '';
    const splittedLangs = langHeader ? langHeader.split(',')[0] : 'en-US';

    const startupUrl = (profileData.startUrl || '').trim().split(',')[0];
    const startupUrls = (profileData.startUrl || '').split(',')
      .map(url => url.trim())
      .filter(url => url);

    const preferences = {
      profile_id: profileData.id,
      name: profileData.name,
      is_m1: isArm,
      navigator: {
        platform: (profileData.navigator?.platform) || '',
        max_touch_points: (profileData.navigator?.maxTouchPoints) || 0,
      },
      dns: profileData.dns || {},
      proxy: {
        username: (profileData.proxy?.username) || '',
        password: (profileData.proxy?.password) || '',
      },
      webRTC: profileData.webRTC || {},
      screenHeight,
      screenWidth,
      userAgent: (profileData.navigator?.userAgent) || '',
      webGl: {
        vendor: (profileData.webGLMetadata?.vendor) || '',
        renderer: (profileData.webGLMetadata?.renderer) || '',
        mode: (profileData.webGLMetadata?.mode) === 'mask',
      },
      webgl: {
        metadata: {
          vendor: (profileData.webGLMetadata?.vendor) || '',
          renderer: (profileData.webGLMetadata?.renderer) || '',
          mode: (profileData.webGLMetadata?.mode) === 'mask',
        },
      },
      mobile: {
        enable: profileData.os === 'android',
        width: profileData.screenWidth || 1920,
        height: profileData.screenHeight || 1080,
        device_scale_factor: profileData.devicePixelRatio || 1,
      },
      webglParams: profileData.webglParams || {},
      webGpu: profileData.webGpu || {},
      webgl_noice_enable: (profileData.webGL?.mode) === 'noise',
      webglNoiceEnable: (profileData.webGL?.mode) === 'noise',
      webgl_noise_enable: (profileData.webGL?.mode) === 'noise',
      webgl_noise_value: profileData.webGL?.noise,
      webglNoiseValue: profileData.webGL?.noise,
      getClientRectsNoice: (profileData.clientRects?.noise) || (profileData.webGL?.getClientRectsNoise),
      client_rects_noise_enable: (profileData.clientRects?.mode) === 'noise',
      media_devices: {
        enable: profileData.mediaDevices?.enableMasking,
        uid: (profileData.mediaDevices?.uid) || '',
        audioInputs: (profileData.mediaDevices?.audioInputs) || 1,
        audioOutputs: (profileData.mediaDevices?.audioOutputs) || 1,
        videoInputs: (profileData.mediaDevices?.videoInputs) || 1,
      },
      doNotTrack: (profileData.navigator?.doNotTrack) || false,
      plugins: {
        all_enable: profileData.plugins?.enableVulnerable,
        flash_enable: profileData.plugins?.enableFlash,
      },
      storage: {
        enable: profileData.storage?.local,
      },
      audioContext: {
        enable: (profileData.audioContext?.mode) !== 'off',
        noiseValue: (profileData.audioContext?.noise) || '',
      },
      canvas: {
        mode: (profileData.canvas?.mode) || '',
      },
      languages: splittedLangs,
      langHeader,
      canvasMode: (profileData.canvas?.mode) || '',
      canvasNoise: (profileData.canvas?.noise) || '',
      deviceMemory: ((profileData.navigator?.deviceMemory) || 2) * 1024,
      hardwareConcurrency: (profileData.navigator?.hardwareConcurrency) || 2,
      startupUrl,
      startup_urls: startupUrls,
      geolocation: {
        mode: (profileData.geolocation?.mode) || 'prompt',
        latitude: parseFloat((this._tz && this._tz.ll && this._tz.ll[0]) || 0),
        longitude: parseFloat((this._tz && this._tz.ll && this._tz.ll[1]) || 0),
        accuracy: parseFloat((this._tz && this._tz.accuracy) || 0),
      },
      timezone: {
        id: (this._tz && this._tz.timezone) || '',
      },
    };

    if (this.browserMajorVersion >= this.newProxyOrbbitaMajorVersion && profileData.proxy?.mode !== 'none') {
      let proxyServer = `${profileData.proxy.mode}://`;
      if (profileData.proxy.username) {
        const encodedUsername = encodeURIComponent(profileData.proxy.username || '');
        const encodedPassword = encodeURIComponent(profileData.proxy.password || '');

        proxyServer += encodedPassword
          ? `${encodedUsername}:${encodedPassword}@`
          : `${encodedUsername}@`;
      }

      proxyServer += `${profileData.proxy.host}:${profileData.proxy.port}`;

      if (profileData.proxy.mode === 'gologin') {
        proxyServer = profileData.autoProxyServer;
      }

      preferences.proxy = {
        ...preferences.proxy,
        mode: 'fixed_servers',
        schema: profileData.proxy.mode,
        server: proxyServer,
      };
    }

    return preferences;
  }

  async createBrowserExtension() {
    const that = this;
    debug('start createBrowserExtension');
    await rimraf(this.orbitaExtensionPath(), () => null);
    const extPath = this.orbitaExtensionPath();
    debug('extension folder sanitized');
    const extension_source = _resolve(__dirname, 'gologin-browser-ext.zip');
    await decompress(extension_source, extPath,
      {
        plugins: [decompressUnzip()],
        filter: file => !file.path.endsWith('/'),
      },
    )
      .then(() => {
        debug('extraction done');
        debug('create uid.json');

        return writeFile(join(extPath, 'uid.json'), JSON.stringify({ uid: that.profile_id }, null, 2))
          .then(() => extPath);
      })
      .catch(async (e) => {
        debug('orbita extension error', e);
      });

    debug('createBrowserExtension done');
  }

  extractProfile(path, zipfile) {
    debug(`extactProfile ${zipfile}, ${path}`);

    return decompress(zipfile, path,
      {
        plugins: [decompressUnzip()],
        filter: file => !file.path.endsWith('/'),
      },
    );
  }

  async downloadProfileAndExtract(profile, local) {
    let profile_folder;
    const profilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`);
    const profileZipExists = await access(this.profile_zip_path).then(() => true).catch(() => false);

    if (!(local && profileZipExists)) {
      try {
        profile_folder = await this.getProfileS3();
      } catch (e) {
        debug('Cannot get profile - using empty', e);
      }

      debug('FILE READY', this.profile_zip_path);

      await writeFile(this.profile_zip_path, profile_folder);

      debug('PROFILE LENGTH', profile_folder.length);
    } else {
      debug('PROFILE LOCAL HAVING', this.profile_zip_path);
    }

    debug('Cleaning up..', profilePath);

    try {
      await this.extractProfile(profilePath, this.profile_zip_path);
      debug('extraction done');
    } catch (e) {
      console.trace(e);
      profile_folder = await this.emptyProfileFolder();
      await writeFile(this.profile_zip_path, profile_folder);
      await this.extractProfile(profilePath, this.profile_zip_path);
    }

    const singletonLockPath = join(profilePath, 'SingletonLock');
    const singletonLockExists = await access(singletonLockPath).then(() => true).catch(() => false);
    if (singletonLockExists) {
      debug('removing SingletonLock');
      await unlink(singletonLockPath);
      debug('SingletonLock removed');
    }
  }

  async createZeroProfile(createCookiesTableQuery) {
    const profilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`);
    const defaultFilePath = _resolve(profilePath, 'Default');
    const preferencesFilePath = _resolve(defaultFilePath, 'Preferences');
    const bookmarksFilePath = _resolve(defaultFilePath, 'Bookmarks');
    const cookiesFilePath = _resolve(defaultFilePath, 'Network', 'Cookies');
    const cookiesFileSecondPath = _resolve(defaultFilePath, 'Cookies');

    await mkdir(_resolve(defaultFilePath, 'Network'), { recursive: true }).catch(console.log);

    await Promise.all([
      writeFile(preferencesFilePath, JSON.stringify(zeroProfilePreferences), { mode: 0o666 }),
      writeFile(bookmarksFilePath, JSON.stringify(zeroProfileBookmarks), { mode: 0o666 }),
      createDBFile({
        cookiesFilePath,
        cookiesFileSecondPath,
        createCookiesTableQuery,
      }),
    ]);
  }

  async createStartup(local = false) {
    const profilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`);
    await rimraf(profilePath, () => null);
    debug('-', profilePath, 'dropped');
    const profile = await this.getProfile();
    if (!profile) {
      throw new Error('Error fetching profile data');
    }

    if (!this.executablePath) {
      const { userAgent } = profile.navigator;
      try {
        const [browserMajorVersion] = userAgent.split('Chrome/')[1].split('.');
        this.browserMajorVersion = Number(browserMajorVersion);
        await this.checkBrowser(browserMajorVersion);
      } catch (e) {
        const latestVersionNumber = await this.getLatestBrowserVersion();
        this.browserMajorVersion = latestVersionNumber;
        await this.checkBrowser(latestVersionNumber);
      }
    }

    const { navigator = {}, fonts, os: profileOs } = profile;
    this.fontsMasking = fonts?.enableMasking;
    this.profileOs = profileOs;
    this.differentOs =
      profileOs !== 'android' && (
        OS_PLATFORM === 'win32' && profileOs !== 'win' ||
        OS_PLATFORM === 'darwin' && profileOs !== 'mac' ||
        OS_PLATFORM === 'linux' && profileOs !== 'lin'
      );

    const {
      resolution = '1920x1080',
      language = 'en-US,en;q=0.9',
    } = navigator;

    this.language = language;
    const [screenWidth, screenHeight] = resolution.split('x');
    this.resolution = {
      width: parseInt(screenWidth, 10),
      height: parseInt(screenHeight, 10),
    };

    this.createCookiesTableQuery = profile.createCookiesTableQuery;
    if (profile.storageInfo.isNewProfile) {
      this.isFirstSession = true;
      await this.createZeroProfile(profile.createCookiesTableQuery);
    } else {
      this.isFirstSession = false;
      await this.downloadProfileAndExtract(profile, local);
    }

    await _promises.rm(join(profilePath, 'Default', 'Sync Data'), { recursive: true }).catch(() => null);
    const pref_file_name = join(profilePath, 'Default', 'Preferences');
    debug('reading', pref_file_name);

    const prefFileExists = await access(pref_file_name).then(() => true).catch(() => false);
    if (!prefFileExists) {
      debug('Preferences file not exists waiting', pref_file_name, '. Using empty profile');
      await mkdir(join(profilePath, 'Default'), { recursive: true });
      await writeFile(pref_file_name, '{}');
    }

    const preferences_raw = await readFile(pref_file_name);
    const preferences = JSON.parse(preferences_raw.toString());
    let proxy = get(profile, 'proxy');
    const chromeExtensions = get(profile, 'chromeExtensions') || [];
    const userChromeExtensions = get(profile, 'userChromeExtensions') || [];
    const allExtensions = [...chromeExtensions, ...userChromeExtensions];

    if (allExtensions.length) {
      const ExtensionsManagerInst = new ExtensionsManager();
      ExtensionsManagerInst.apiUrl = API_URL;
      await ExtensionsManagerInst.init()
        .then(() => ExtensionsManagerInst.updateExtensions())
        .catch(() => {});
      ExtensionsManagerInst.accessToken = this.access_token;

      await ExtensionsManagerInst.getExtensionsPolicies();
      let profileExtensionsCheckRes = [];

      if (ExtensionsManagerInst.useLocalExtStorage) {
        const promises = [
          ExtensionsManagerInst.checkChromeExtensions(allExtensions)
            .then(res => ({ profileExtensionsCheckRes: res }))
            .catch((e) => {
              console.log('checkChromeExtensions error: ', e);

              return { profileExtensionsCheckRes: [] };
            }),
          ExtensionsManagerInst.checkLocalUserChromeExtensions(userChromeExtensions, this.profile_id)
            .then(res => ({ profileUserExtensionsCheckRes: res }))
            .catch((error) => {
              console.log('checkUserChromeExtensions error: ', error);

              return null;
            }),
        ];

        const extensionsResult = await Promise.all(promises);

        const profileExtensionPathRes = extensionsResult.find(el => 'profileExtensionsCheckRes' in el) || {};
        const profileUserExtensionPathRes = extensionsResult.find(el => 'profileUserExtensionsCheckRes' in el);
        profileExtensionsCheckRes =
          (profileExtensionPathRes?.profileExtensionsCheckRes || []).concat(profileUserExtensionPathRes?.profileUserExtensionsCheckRes || []);
      }

      let extSettings;
      if (ExtensionsManagerInst.useLocalExtStorage) {
        extSettings = await setExtPathsAndRemoveDeleted(preferences, profileExtensionsCheckRes, this.profile_id);
      } else {
        const originalExtensionsFolder = join(profilePath, 'Default', 'Extensions');
        extSettings = await setOriginalExtPaths(preferences, originalExtensionsFolder);
      }

      this.extensionPathsToInstall =
        ExtensionsManagerInst.getExtensionsToInstall(extSettings, profileExtensionsCheckRes);

      if (extSettings) {
        const currentExtSettings = preferences.extensions || {};
        currentExtSettings.settings = extSettings;
        preferences.extensions = currentExtSettings;
      }
    }

    if (proxy.mode === 'gologin' || proxy.mode === 'tor') {
      const autoProxyServer = get(profile, 'autoProxyServer');
      const splittedAutoProxyServer = autoProxyServer.split('://');
      const splittedProxyAddress = splittedAutoProxyServer[1].split(':');
      const port = splittedProxyAddress[1];

      proxy = {
        'mode': splittedAutoProxyServer[0],
        'host': splittedProxyAddress[0],
        port,
        'username': get(profile, 'autoProxyUsername'),
        'password': get(profile, 'autoProxyPassword'),
      };

      profile.proxy.username = get(profile, 'autoProxyUsername');
      profile.proxy.password = get(profile, 'autoProxyPassword');
    }

    if (proxy.mode === 'geolocation') {
      proxy.mode = 'http';
    }

    if (proxy.mode === PROXY_NONE) {
      proxy = null;
    }

    this.proxy = proxy;

    await this.getTimeZone(proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw new Error(`Proxy Error. ${e.message}`);
    });

    const gologin = this.getGologinPreferences(profile);

    debug(`Writing profile for screenWidth ${profilePath}`, JSON.stringify(gologin));
    gologin.screenWidth = this.resolution.width;
    gologin.screenHeight = this.resolution.height;
    debug('writeCookiesFromServer', this.writeCookiesFromServer);
    this.cookiesFilePath = await getCookiesFilePath(this.profile_id, this.tmpdir);

    if (this.writeCookiesFromServer) {
      await this.writeCookiesToFile(profile.cookies?.cookies);
    }

    if (this.fontsMasking) {
      const families = fonts?.families || [];
      if (!families.length) {
        this.isEmptyFonts = true;
      }

      try {
        await composeFonts(families, profilePath, this.differentOs);
      } catch (e) {
        console.trace(e);
      }
    }

    if (preferences.gologin == null) {
      preferences.gologin = {};
    }

    const isMAC = OS_PLATFORM === 'darwin';
    const checkAutoLangResult = checkAutoLang(gologin, this._tz, profile.autoLang);
    const intlConfig = getIntlProfileConfig(profile, this._tz, profile.autoLang);

    await writeFile(join(profilePath, 'orbita.config'), JSON.stringify({ intl: intlConfig }, null, '\t'), { encoding: 'utf-8' }).catch(console.log);

    this.browserLang = isMAC ? 'en-US' : checkAutoLangResult;
    const prefsToWrite = Object.assign(preferences, { gologin });
    if (this.browserMajorVersion >= this.newProxyOrbbitaMajorVersion && this.proxy?.mode !== 'none') {
      prefsToWrite.proxy = {
        mode: 'fixed_servers',
        server: gologin.proxy.server,
      };
    }

    await writeFile(join(profilePath, 'Default', 'Preferences'), JSON.stringify(prefsToWrite));

    const bookmarksParsedData = await getCurrentProfileBookmarks(this.bookmarksFilePath);
    const bookmarksFromDb = profile.bookmarks?.bookmark_bar;
    bookmarksParsedData.roots = bookmarksFromDb ? profile.bookmarks : bookmarksParsedData.roots;
    await writeFile(this.bookmarksFilePath, JSON.stringify(bookmarksParsedData));

    debug('Profile ready. Path: ', profilePath, 'PROXY', JSON.stringify(get(preferences, 'gologin.proxy')));

    return profilePath;
  }

  async commitProfile() {
    // wait for orbita to finish working with files
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const dataBuff = await this.getProfileDataToUpdate().catch(console.log);
    debug('begin updating', dataBuff.length);
    if (!dataBuff.length) {
      debug('WARN: profile zip data empty - SKIPPING PROFILE COMMIT');

      return;
    }

    try {
      debug('Patching profile');
      await this.postFile('profile', dataBuff);
    } catch (e) {
      debug('CANNOT COMMIT PROFILE', e);
    }

    debug('COMMIT COMPLETED');
  }

  profilePath() {
    return join(this.tmpdir, `gologin_profile_${this.profile_id}`);
  }

  orbitaExtensionPath() {
    return join(this.tmpdir, `orbita_extension_${this.profile_id}`);
  }

  getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async checkPortAvailable(port) {
    debug('CHECKING PORT AVAILABLE', port);

    try {
      const portAvailable = await isPortReachable(port, { host: 'localhost' });
      if (portAvailable) {
        debug(`PORT ${port} IS OPEN`);

        return true;
      }
    } catch (e) {
      console.log(e);
    }

    debug(`PORT ${port} IS BUSY`);

    return false;
  }

  async getRandomPort() {
    let port = this.getRandomInt(20000, 40000);
    let portAvailable = await this.checkPortAvailable(port);
    while (!portAvailable) {
      port = this.getRandomInt(20000, 40000);
      portAvailable = await this.checkPortAvailable(port);
    }

    return port;
  }

  async getTimeZone(proxy) {
    debug('getting timeZone proxy=', proxy);

    if (this.timezone) {
      debug('getTimeZone from options', this.timezone);
      this._tz = this.timezone;

      return this._tz.timezone;
    }

    let data = null;
    if (proxy && proxy.mode !== PROXY_NONE) {
      if (proxy.mode.includes('socks')) {
        for (let i = 0; i < 5; i++) {
          try {
            debug('getting timeZone socks try', i + 1);

            return this.getTimezoneWithSocks(proxy);
          } catch (e) {
            console.log(e.message);
          }
        }
        throw new Error('Socks proxy connection timed out');
      }

      const proxyUrl = `${proxy.mode}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
      debug(`getTimeZone start ${TIMEZONE_URL}`, proxyUrl);

      data = await makeRequest(TIMEZONE_URL, {
        proxy: proxyUrl,
        timeout: this.proxyCheckTimeout,
        maxAttempts: this.proxyCheckAttempts,
        method: 'GET',
      });
    } else {
      data = await makeRequest(TIMEZONE_URL, { timeout: this.proxyCheckTimeout, maxAttempts: this.proxyCheckAttempts, method: 'GET' });
    }

    debug('getTimeZone finish', data);
    this._tz = JSON.parse(data);

    if (proxy?.id) {
      const statusBody = {
        proxies: [
          {
            id: proxy.id,
            status: true,
            country: this._tz.country,
            city: this._tz.city,
            lastIp: this._tz.ip,
            timezone: this._tz.timezone,
            checkDate: Math.floor(Date.now() / 1000),
          },
        ],
      };

      await makeRequest(
        `${API_URL}/proxy/set_proxy_statuses`,
        { timeout: 13 * 1000, maxAttempts: 3, method: 'POST', json: statusBody },
        { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/proxy/set_proxy_statuses` },
      ).catch();
    }

    return this._tz.timezone;
  }

  async getTimezoneWithSocks(params) {
    const { host, port, username = '', password = '' } = params;

    let proxy = 'socks://';
    if (username) {
      const resultPassword = password ? ':' + password + '@' : '@';
      proxy += username + resultPassword;
    }

    proxy += host + ':' + port;
    const agent = new SocksProxyAgent(proxy);

    const checkData = await checkSocksProxy(agent);

    const body = checkData.body || {};
    if (!body.ip && checkData.statusCode.toString().startsWith('4')) {
      throw checkData;
    }

    debug('getTimeZone finish', body.body);
    this._tz = body;

    if (proxy.id) {
      const statusBody = {
        proxies: [
          {
            id: proxy.id,
            status: true,
            country: this._tz.country,
            city: this._tz.city,
            lastIp: this._tz.ip,
            timezone: this._tz.timezone,
            checkDate: Math.floor(Date.now() / 1000),
          },
        ],
      };

      await makeRequest(
        `${API_URL}/proxy/set_proxy_statuses`,
        { timeout: this.proxyCheckTimeout, maxAttempts: this.proxyCheckAttempts, method: 'POST', json: statusBody },
        { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/proxy/set_proxy_statuses` },
      ).catch();
    }

    return this._tz.timezone;
  }

  async spawnArguments() {
    const profile_path = this.profilePath();

    let { proxy } = this;
    proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;

    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });

    const tz = await this.getTimeZone(this.proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw e;
    });

    env.TZ = tz;

    let params = [`--proxy-server=${proxy}`, `--user-data-dir=${profile_path}`, '--password-store=basic', `--tz=${tz}`, '--lang=en'];
    if (Array.isArray(this.extra_params) && this.extra_params.length) {
      params = params.concat(this.extra_params);
    }

    if (this.remote_debugging_port) {
      params.push(`--remote-debugging-port=${this.remote_debugging_port}`);
    }

    return params;
  }

  async spawnBrowser() {
    let { remote_debugging_port, customArgs } = this;
    if (!remote_debugging_port) {
      remote_debugging_port = await this.getRandomPort();
    }

    const profile_path = this.profilePath();

    let { proxy } = this;
    let proxy_host = '';
    if (proxy) {
      proxy_host = this.proxy.host;
      proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;
    }

    this.port = remote_debugging_port;

    const ORBITA_BROWSER = this.executablePath || this.browserChecker.getOrbitaPath;
    debug(`ORBITA_BROWSER=${ORBITA_BROWSER}`);
    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });

    const tz = await this.getTimeZone(this.proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw e;
    });

    env.TZ = tz;

    if (this.vnc_port) {
      const script_path = _resolve(__dirname, './run.sh');
      debug('RUNNING', script_path, ORBITA_BROWSER, remote_debugging_port, proxy, profile_path, this.vnc_port);
      execFile(
        script_path,
        [ORBITA_BROWSER, remote_debugging_port, proxy, profile_path, this.vnc_port, tz],
        { env },
      );
    } else {
      let params = [
        `--remote-debugging-port=${remote_debugging_port}`,
        '--password-store=basic',
        `--tz=${tz}`,
        `--lang=${this.browserLang}`,
        `--window-size=${this.resolution.width},${this.resolution.height}`,
        '--window-position=0,0',
        `--user-data-dir=${profile_path}`,
      ];
      if (this.extensionPathsToInstall.length) {
        if (Array.isArray(this.extra_params) && this.extra_params.length) {
          this.extra_params.forEach((param, index) => {
            if (!param.includes('--load-extension=')) {
              return;
            }

            const [_, extPathsString] = param.split('=');
            const extPathsArray = extPathsString.split(',');
            this.extensionPathsToInstall = [...this.extensionPathsToInstall, ...extPathsArray];
            this.extra_params.splice(index, 1);
          });
        }

        params.push(`--load-extension=${this.extensionPathsToInstall.join(',')}`);
      }

      if (this.fontsMasking) {
        let arg = '--font-masking-mode=2';
        if (this.differentOs) {
          arg = '--font-masking-mode=3';
        }

        if (this.profileOs === 'android' || this.isEmptyFonts) {
          arg = '--font-masking-mode=1';
        }

        params.push(arg);
      }

      if (proxy) {
        const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host}"`;
        params.push(`--host-resolver-rules=${hr_rules}`);
      }

      if (proxy && Number(this.browserMajorVersion) < this.newProxyOrbbitaMajorVersion) {
        params.push(`--proxy-server=${proxy}`);
      }

      if (Array.isArray(this.extra_params) && this.extra_params.length) {
        params = params.concat(this.extra_params);
      }

      if (!this.isFirstSession && this.restoreLastSession) {
        params.push('--restore-last-session');
      }

      params.push(...new Set(customArgs));
      console.log('params', params);
      const child = execFile(ORBITA_BROWSER, params, { env });
      this.processSpawned = child;
      // child.stdout.on('error', (data) => console.log(data.toString()));
      // child.stderr.on('data', (data) => console.log(data.toString()));
      debug('SPAWN CMD', ORBITA_BROWSER, params.join(' '));
    }

    if (this.waitWebsocket) {
      debug('GETTING WS URL FROM BROWSER');
      const data = await makeRequest(
        `http://127.0.0.1:${remote_debugging_port}/json/version`,
        { json: true, maxAttempts: 30, retryDelay: 1000, method: 'GET' },
      );

      debug('WS IS', get(data, 'webSocketDebuggerUrl', ''));
      this.is_active = true;

      return { wsUrl: get(data, 'webSocketDebuggerUrl', ''), resolution: this.resolution };
    }

    return '';
  }

  async clearProfileFiles() {
    await rimraf(join(this.tmpdir, `gologin_profile_${this.profile_id}`), () => null);
    await rimraf(join(this.tmpdir, `gologin_${this.profile_id}_upload.zip`), () => null);
  }

  async stopAndCommit(options, local = false) {
    if (this.is_stopping) {
      return true;
    }

    const is_posting = options.posting ||
      options.postings || // backward compability
      false;

    if (this.uploadCookiesToServer) {
      const updateResult = await this.uploadProfileDataToServer();
      this.storageGatewayUrl = updateResult.storageGateway.url;
    }

    this.is_stopping = true;
    await this.sanitizeProfile();

    if (is_posting) {
      await this.commitProfile();
    }

    this.is_stopping = false;
    this.is_active = false;
    await delay(3000);
    await this.clearProfileFiles();

    if (!local) {
      await rimraf(join(this.tmpdir, `gologin_${this.profile_id}.zip`), () => null);
    }

    debug(`PROFILE ${this.profile_id} STOPPED AND CLEAR`);

    return false;
  }

  async uploadProfileDataToServer() {
    const cookies = await loadCookiesFromFile(this.cookiesFilePath, false, this.profile_id, this.tmpdir);
    const bookmarks = await getCurrentProfileBookmarks(this.bookmarksFilePath);

    const body = {
      cookies,
      bookmarks,
      isCookiesEncrypted: true,
      isStorageGateway: true,
    };

    const updateResult = await makeRequest(`${API_URL}/browser/features/profile/${this.profile_id}/update_after_close`, {
      json: body,
      method: 'POST',
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 20 * 1000,
    }, {
      token: this.access_token,
      fallbackUrl: `${FALLBACK_API_URL}/browser/features/profile/${this.profile_id}/update_after_close`,
    }).catch((e) => {
      console.log(e);

      return e;
    });

    return updateResult;
  }

  async stopBrowser() {
    if (!this.port) {
      throw new Error('Empty GoLogin port');
    }

    const ls = await spawn('fuser',
      [
        '-k TERM',
        `-n tcp ${this.port}`,
      ],
      {
        shell: true,
      },
    );

    debug('browser killed');
  }

  killBrowser() {
    if (!this.processSpawned.pid) {
      return;
    }

    try {
      this.processSpawned.kill();
      debug('browser killed');
    } catch (error) {
      console.error(error);
    }
  }

  async killAndCommit(options, local = false) {
    this.killBrowser();
    await delay(this.processKillTimeout);
    await this.stopAndCommit(options, local).catch(console.error);
  }

  async sanitizeProfile() {
    const remove_dirs = [
      `${SEPARATOR}Default${SEPARATOR}Cache`,
      `${SEPARATOR}Default${SEPARATOR}Service Worker`,
      `${SEPARATOR}Default${SEPARATOR}Code Cache`,
      `${SEPARATOR}Default${SEPARATOR}GPUCache`,
      `${SEPARATOR}Default${SEPARATOR}Extensions`,
      `${SEPARATOR}Default${SEPARATOR}IndexedDB`,
      `${SEPARATOR}Default${SEPARATOR}GPUCache`,
      `${SEPARATOR}Default${SEPARATOR}DawnCache`,
      `${SEPARATOR}Default${SEPARATOR}fonts_config`,
      `${SEPARATOR}Default${SEPARATOR}Sync Data`,
      `${SEPARATOR}GrShaderCache`,
      `${SEPARATOR}ShaderCache`,
      `${SEPARATOR}biahpgbdmdkfgndcmfiipgcebobojjkp`,
      `${SEPARATOR}afalakplffnnnlkncjhbmahjfjhmlkal`,
      `${SEPARATOR}cffkpbalmllkdoenhmdmpbkajipdjfam`,
      `${SEPARATOR}Dictionaries`,
      `${SEPARATOR}enkheaiicpeffbfgjiklngbpkilnbkoi`,
      `${SEPARATOR}oofiananboodjbbmdelgdommihjbkfag`,
      `${SEPARATOR}SafetyTips`,
      `${SEPARATOR}fonts`,
      `${SEPARATOR}BrowserMetrics`,
      `${SEPARATOR}BrowserMetrics-spare.pma`,
    ];

    const that = this;

    await Promise.all(remove_dirs.map(d => {
      const path_to_remove = `${that.profilePath()}${d}`;

      return new Promise(resolve => {
        debug('DROPPING', path_to_remove);
        rimraf(path_to_remove, { maxBusyTries: 100 }, (e) => {
          // debug('DROPPING RESULT', e);
          resolve();
        });
      });
    }));
  }

  async getProfileDataToUpdate() {
    const zipPath = join(this.tmpdir, `gologin_${this.profile_id}_upload.zip`);
    const zipExists = await access(zipPath).then(() => true).catch(() => false);
    if (zipExists) {
      await unlink(zipPath);
    }

    await this.sanitizeProfile();
    debug('profile sanitized');

    const profilePath = this.profilePath();
    const fileBuff = await archiveProfile(profilePath);

    debug('PROFILE ZIP CREATED', profilePath, zipPath);

    return fileBuff;
  }

  async getRandomFingerprint(options) {
    let os = 'lin';

    if (options.os) {
      os = options.os;
    }

    let url = `${API_URL}/browser/fingerprint?os=${os}`;
    if (options.isM1) {
      url += '&isM1=true';
    }

    const fingerprint = await makeRequest(url, {
      method: 'GET',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/fingerprint?os=${os}` });

    return JSON.parse(fingerprint);
  }

  async create(options) {
    debug('createProfile', options);

    const fingerprint = await this.getRandomFingerprint(options);
    debug('fingerprint=', fingerprint);

    if (fingerprint.statusCode === 500) {
      throw new Error('no valid random fingerprint check os param');
    }

    if (fingerprint.statusCode === 401) {
      throw new Error('invalid token');
    }

    const { navigator, fonts, webGLMetadata, webRTC } = fingerprint;
    let deviceMemory = navigator.deviceMemory || 2;
    if (deviceMemory < 1) {
      deviceMemory = 1;
    }

    navigator.deviceMemory = deviceMemory * 1024;
    webGLMetadata.mode = webGLMetadata.mode === 'noise' ? 'mask' : 'off';

    const json = {
      ...fingerprint,
      navigator,
      webGLMetadata,
      browserType: 'chrome',
      name: 'default_name',
      notes: 'auto generated',
      fonts: {
        families: fonts,
      },
      webRTC: {
        ...webRTC,
        mode: 'alerted',
      },
    };

    const user_agent = options.navigator?.userAgent;
    const orig_user_agent = json.navigator.userAgent;
    Object.keys(options).forEach((key) => {
      if (typeof json[key] === 'object') {
        json[key] = { ...json[key], ...options[key] };

        return;
      }

      json[key] = options[key];
    });

    if (user_agent === 'random') {
      json.navigator.userAgent = orig_user_agent;
    }

    const response = await makeRequest(`${API_URL}/browser`, {
      method: 'POST',
      json,
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser` });

    return response.id;
  }

  async delete(pid) {
    const profile_id = pid || this.profile_id;
    await makeRequest(`${API_URL}/browser/${profile_id}`, {
      method: 'DELETE',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/${profile_id}` });
  }

  async update(options) {
    this.profile_id = options.id;
    const profile = await this.getProfile();

    if (options.navigator) {
      Object.keys(options.navigator).map((e) => {
        profile.navigator[e] = options.navigator[e];
      });
    }

    Object.keys(options).filter(el => el !== 'navigator').forEach((el) => {
      profile[el] = options[el];
    });

    debug('update profile', profile);
    const response = await makeRequest(`${API_URL}/browser/${options.id}`, {
      json: profile,
      method: 'PUT',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/${options.id}` });

    debug('response', JSON.stringify(response));

    return response;
  }

  setActive(is_active) {
    this.is_active = is_active;
  }

  getGeolocationParams(profileGeolocationParams, tzGeolocationParams) {
    if (profileGeolocationParams.fillBasedOnIp) {
      return {
        mode: profileGeolocationParams.mode,
        latitude: Number(tzGeolocationParams.latitude),
        longitude: Number(tzGeolocationParams.longitude),
        accuracy: Number(tzGeolocationParams.accuracy),
      };
    }

    return {
      mode: profileGeolocationParams.mode,
      latitude: profileGeolocationParams.latitude,
      longitude: profileGeolocationParams.longitude,
      accuracy: profileGeolocationParams.accuracy,
    };
  }

  getViewPort() {
    return { ...this.resolution };
  }

  async postCookies(profileId, cookies) {
    const formattedCookies = cookies.map(cookie => {
      if (!['no_restriction', 'lax', 'strict', 'unspecified'].includes(cookie.sameSite)) {
        cookie.sameSite = 'unspecified';
      }

      return cookie;
    });

    const response = await uploadCookies({
      profileId,
      cookies: formattedCookies,
      API_BASE_URL: API_URL,
      ACCESS_TOKEN: this.access_token,
    });

    return response;
  }

  async getCookies(profileId) {
    const response = await downloadCookies({
      profileId,
      API_BASE_URL: API_URL,
      ACCESS_TOKEN: this.access_token,
    });

    return response;
  }

  getCookiePath(defaultFilePath) {
    let primary = join(defaultFilePath, 'Cookies');
    let secondary = join(defaultFilePath, 'Network', 'Cookies');

    if (!existsSync(primary)) {
      primary = join(defaultFilePath, 'Network', 'Cookies');
      secondary = join(defaultFilePath, 'Cookies');
    }

    return { primary, secondary };
  }

  async writeCookiesToFile(cookies, isSecondTry = false) {
    if (!cookies) {
      cookies = await this.getCookies(this.profile_id);
    }

    if (!cookies?.length) {
      return;
    }

    const resultCookies = cookies.map((el) => ({ ...el, value: Buffer.from(el.value) }));
    let db;
    const profilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`);

    const defaultFilePath = _resolve(profilePath, 'Default');
    const cookiesPaths = this.getCookiePath(defaultFilePath);
    try {
      db = await getDB(cookiesPaths.primary, false);
      const cookiesToInsert = await getUniqueCookies(resultCookies, cookiesPaths.primary);
      if (cookiesToInsert.length) {
        const chunckInsertValues = getChunckedInsertValues(cookiesToInsert);
        for (const [query, queryParams] of chunckInsertValues) {
          const insertStmt = await db.prepare(query);
          await insertStmt.run(queryParams);
          await insertStmt.finalize();
        }
      }
    } catch (error) {
      if (!isSecondTry && (error.message.includes('table cookies has no column') || error.message.includes('NOT NULL constraint failed'))) {
        await _promises.rm(cookiesPaths.primary, { recursive: true, force: true });
        await createDBFile({
          cookiesFilePath: cookiesPaths.primary,
          cookiesFileSecondPath: cookiesPaths.secondary,
          createCookiesTableQuery: this.createCookiesTableQuery,
        });
        await this.writeCookiesToFile(cookies, true);

        return;
      }

      console.error(error.message);
    } finally {
      db && await db.close();
      await ensureDirectoryExists(cookiesPaths.primary);
      await ensureDirectoryExists(cookiesPaths.secondary);
      await copyFile(cookiesPaths.primary, cookiesPaths.secondary).catch((error) => {
        console.error('error in copyFile', error.message);
      });
    }
  }

  async saveBookmarksToDb() {
    const bookmarksData = await getCurrentProfileBookmarks(this.bookmarksFilePath);
    const bookmarks = bookmarksData.roots || {};
    await updateProfileBookmarks([this.profile_id], this.access_token, bookmarks);
  }

  async start() {
    try {
      await this.createStartup();
      const startResponse = await this.spawnBrowser();
      this.setActive(true);

      return { status: 'success', wsUrl: startResponse.wsUrl, resolution: startResponse.resolution };
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  }

  async startLocal() {
    await this.createStartup(true);
    // await this.createBrowserExtension();
    const startResponse = await this.spawnBrowser();
    this.setActive(true);

    return { status: 'success', wsUrl: startResponse.wsUrl };
  }

  async stop() {
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.stopAndCommit({ posting: true }, false);
  }

  async stopLocal(options) {
    const opts = options || { posting: false };
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.stopAndCommit(opts, true);
  }

  async waitDebuggingUrl(delay_ms, try_count = 0, remoteOrbitaUrl) {
    await delay(delay_ms);
    const url = `${remoteOrbitaUrl}/json/version`;
    console.log('try_count=', try_count, 'url=', url);
    const response = await makeRequest(url, {
      method: 'GET',
    });

    let wsUrl = '';

    if (!response) {
      return wsUrl;
    }

    try {
      const parsedBody = JSON.parse(response);
      wsUrl = parsedBody.webSocketDebuggerUrl;
    } catch (e) {
      if (try_count < 3) {
        return this.waitDebuggingUrl(delay_ms, try_count + 1, remoteOrbitaUrl);
      }

      return { status: 'failure', wsUrl, message: 'Check proxy settings', 'profile_id': this.profile_id };
    }

    const remoteOrbitaUrlWithoutProtocol = remoteOrbitaUrl.replace('https://', '');
    wsUrl = wsUrl.replace('ws://', 'wss://').replace('127.0.0.1', remoteOrbitaUrlWithoutProtocol);

    return wsUrl;
  }

  async stopRemote() {
    debug(`stopRemote ${this.profile_id}`);
    const profileResponse = await makeRequest(`${API_URL}/browser/${this.profile_id}/web`, {
      method: 'DELETE',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/${this.profile_id}/web` });

    if (profileResponse) {
      return JSON.parse(profileResponse);
    }
  }

  // api for users to manage their profiles
  async changeProfileProxy(proxyData) {
    return updateProfileProxy(this.profile_id, this.access_token, proxyData);
  }

  async changeProfileUserAgent(userAgent) {
    return updateProfileUserAgent(this.profile_id, this.access_token, userAgent);
  }

  async changeProfileResolution(resolution) {
    return updateProfileResolution(this.profile_id, this.access_token, resolution);
  }

  getAvailableFonts() {
    return fontsCollection
      .filter(elem => elem.fileNames)
      .map(elem => elem.name);
  }

  async quickCreateProfile(name = '') {
    const osInfo = await getOsAdvanced();
    const { os, osSpec } = osInfo;
    const resultName = name || 'api-generated';

    return makeRequest(`${API_URL}/browser/quick`, {
      method: 'POST',
      json: {
        os,
        osSpec,
        name: resultName,
      },
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/quick` });
  }

  async profiles() {
    const profilesResponse = await makeRequest(`${API_URL}/browser/v2`, {
      method: 'GET',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/v2` });

    if (profilesResponse.statusCode !== 200) {
      throw new Error('Gologin /browser response error');
    }

    return JSON.parse(profilesResponse);
  }

  async getNewFingerPrint(os) {
    debug('GETTING FINGERPRINT');

    const fpResponse = await makeRequest(`${API_URL}/browser/fingerprint?os=${os}`, {
      json: true,
      method: 'GET',
    }, { token: this.access_token, fallbackUrl: `${FALLBACK_API_URL}/browser/fingerprint?os=${os}` });

    return fpResponse || {};
  }
}

export default GoLogin;
