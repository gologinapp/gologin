import { execFile, spawn } from 'child_process';
import debug from 'debug';
import decompress from 'decompress';
import decompressUnzip from 'decompress-unzip';
import { existsSync, mkdirSync, promises as _promises } from 'fs';
import { get as _get } from 'https';
import { tmpdir } from 'os';
import { join, resolve as _resolve,sep } from 'path';
import requests from 'requestretry';
import rimraf from 'rimraf';
import ProxyAgent from 'simple-proxy-agent';

import { fontsCollection } from '../fonts.js';
import { getCurrentProfileBookmarks } from './bookmarks/utils.js';
import { updateProfileBookmarks, updateProfileProxy, updateProfileResolution, updateProfileUserAgent } from './browser/browser-api.js';
import BrowserChecker from './browser/browser-checker.js';
import { composeFonts, downloadCookies, setExtPathsAndRemoveDeleted, 
  setOriginalExtPaths, uploadCookies } from './browser/browser-user-data-manager.js';
import { getChunckedInsertValues, getDB, loadCookiesFromFile } from './cookies/cookies-manager.js';
import ExtensionsManager from './extensions/extensions-manager.js';
import { archiveProfile } from './profile/profile-archiver.js';
import { API_URL } from './utils/common.js';
import { get, isPortReachable } from './utils/utils.js';

const { access, unlink, writeFile, readFile } = _promises;

const SEPARATOR = sep;
const OS_PLATFORM = process.platform;

// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

export class GoLogin {
  constructor(options = {}) {
    this.is_remote = options.remote || false;
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
    this.waitWebsocket = true;
    if (options.waitWebsocket === false) {
      this.waitWebsocket = false;
    }

    this.tmpdir = tmpdir();
    this.autoUpdateBrowser = !!options.autoUpdateBrowser;
    this.browserChecker = new BrowserChecker(options.skipOrbitaHashChecking);
    this.uploadCookiesToServer = options.uploadCookiesToServer || false;
    this.writeCookesFromServer = options.writeCookesFromServer;
    this.remote_debugging_port = options.remote_debugging_port || 0;
    this.timezone = options.timezone;
    this.extensionPathsToInstall = [];
    this.restoreLastSession = options.restoreLastSession || false;

    if (options.tmpdir) {
      this.tmpdir = options.tmpdir;
      if (!existsSync(this.tmpdir)) {
        debug('making tmpdir', this.tmpdir);
        mkdirSync(this.tmpdir, { recursive: true });
      }
    }

    this.cookiesFilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`, 'Default', 'Network', 'Cookies');
    this.profile_zip_path = join(this.tmpdir, `gologin_${this.profile_id}.zip`);
    this.bookmarksFilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`, 'Default', 'Bookmarks');
    debug('INIT GOLOGIN', this.profile_id);
  }

  async checkBrowser() {
    return this.browserChecker.checkBrowser(this.autoUpdateBrowser);
  }

  async setProfileId(profile_id) {
    this.profile_id = profile_id;
    this.cookiesFilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`, 'Default', 'Network', 'Cookies');
    this.profile_zip_path = join(this.tmpdir, `gologin_${this.profile_id}.zip`);
  }

  async getToken(username, password) {
    const data = await requests.post(`${API_URL}/user/login`, {
      json: {
        username,
        password,
      },
    });

    if (!Reflect.has(data, 'body.access_token')) {
      throw new Error(`gologin auth failed with status code, ${data.statusCode} DATA  ${JSON.stringify(data)}`);
    }
  }

  async getNewFingerPrint(os) {
    debug('GETTING FINGERPRINT');

    const fpResponse = await requests.get(`${API_URL}/browser/fingerprint?os=${os}`, {
      json: true,
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',
      },
    });

    return fpResponse?.body || {};
  }

  async profiles() {
    const profilesResponse = await requests.get(`${API_URL}/browser/v2`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',

      },
    });

    if (profilesResponse.statusCode !== 200) {
      throw new Error('Gologin /browser response error');
    }

    return JSON.parse(profilesResponse.body);
  }

  async getProfile(profile_id) {
    const id = profile_id || this.profile_id;
    debug('getProfile', this.access_token, id);
    const profileResponse = await requests.get(`${API_URL}/browser/${id}`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
      },
    });

    debug('profileResponse', profileResponse.statusCode, profileResponse.body);

    if (profileResponse.statusCode === 404) {
      throw new Error(JSON.parse(profileResponse.body).message);
    }

    if (profileResponse.statusCode === 403) {
      throw new Error(JSON.parse(profileResponse.body).message);
    }

    if (profileResponse.statusCode !== 200) {
      throw new Error(`Gologin /browser/${id} response error ${profileResponse.statusCode} INVALID TOKEN OR PROFILE NOT FOUND`);
    }

    if (profileResponse.statusCode === 401) {
      throw new Error('invalid token');
    }

    return JSON.parse(profileResponse.body);
  }

  async emptyProfile() {
    return readFile(_resolve(__dirname, 'gologin_zeroprofile.b64')).then(res => res.toString());
  }

  async getProfileS3(s3path) {
    if (!s3path) {
      throw new Error('s3path not found');
    }

    const token = this.access_token;
    debug('getProfileS3 token=', token, 'profile=', this.profile_id, 's3path=', s3path);

    const s3url = `https://gprofiles.gologin.com/${s3path}`.replace(/\s+/mg, '+');
    debug('loading profile from public s3 bucket, url=', s3url);
    const profileResponse = await requests.get(s3url, {
      encoding: null,
    });

    if (profileResponse.statusCode !== 200) {
      debug(`Gologin S3 BUCKET ${s3url} response error ${profileResponse.statusCode}  - use empty`);

      return '';
    }

    return Buffer.from(profileResponse.body);
  }

  async postFile(fileName, fileBuff) {
    debug('POSTING FILE', fileBuff.length);
    debug('Getting signed URL for S3');
    const apiUrl = `${API_URL}/browser/${this.profile_id}/storage-signature`;

    const signedUrl = await requests.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
        'user-agent': 'gologin-api',
      },
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
      fullResponse: false,
    });

    const [uploadedProfileUrl] = signedUrl.split('?');

    console.log('Uploading profile by signed URL to S3');
    const bodyBufferBiteLength = Buffer.byteLength(fileBuff);
    console.log('BUFFER SIZE', bodyBufferBiteLength);

    await requests.put(signedUrl, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': bodyBufferBiteLength,
      },
      body: fileBuff,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 30 * 1000,
      fullResponse: false,
    });

    const uploadedProfileMetadata = await requests.head(uploadedProfileUrl, {
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
      fullResponse: true,
    });

    const uploadedFileLength = +uploadedProfileMetadata.headers['content-length'];
    if (uploadedFileLength !== bodyBufferBiteLength) {
      console.log('Uploaded file is incorrect. Retry with China File size:', uploadedFileLength);
      throw new Error('Uploaded file is incorrect. Retry with China File size: ' + uploadedFileLength);
    }

    console.log('Profile has been uploaded to S3 successfully');
  }

  async emptyProfileFolder() {
    debug('get emptyProfileFolder');
    const profile = await readFile(_resolve(__dirname, 'zero_profile.zip'));
    debug('emptyProfileFolder LENGTH ::', profile.length);

    return profile;
  }

  convertPreferences(preferences) {
    if (get(preferences, 'navigator.userAgent')) {
      preferences.userAgent = get(preferences, 'navigator.userAgent');
    }

    if (get(preferences, 'navigator.doNotTrack')) {
      preferences.doNotTrack = get(preferences, 'navigator.doNotTrack');
    }

    if (get(preferences, 'navigator.hardwareConcurrency')) {
      preferences.hardwareConcurrency = get(preferences, 'navigator.hardwareConcurrency');
    }

    if (get(preferences, 'navigator.deviceMemory')) {
      preferences.deviceMemory = get(preferences, 'navigator.deviceMemory')*1024;
    }

    if (get(preferences, 'navigator.language')) {
      preferences.langHeader = get(preferences, 'navigator.language');
      preferences.languages = get(preferences, 'navigator.language').replace(/;|q=[\d\.]+/img, '');
    }

    if (get(preferences, 'navigator.maxTouchPoints')) {
      preferences.navigator.max_touch_points = get(preferences, 'navigator.maxTouchPoints');
    }

    if (get(preferences, 'isM1')) {
      preferences.is_m1 = get(preferences, 'isM1');
    }

    if (get(preferences, 'os') == 'android') {
      const devicePixelRatio = get(preferences, 'devicePixelRatio');
      const deviceScaleFactorCeil = Math.ceil(devicePixelRatio || 3.5);
      let deviceScaleFactor = devicePixelRatio;
      if (deviceScaleFactorCeil === devicePixelRatio) {
        deviceScaleFactor += 0.00000001;
      }

      preferences.mobile = {
        enable: true,
        width: parseInt(this.resolution.width, 10),
        height: parseInt(this.resolution.height, 10),
        device_scale_factor: deviceScaleFactor,
      };
    }

    preferences.mediaDevices = {
      enable: preferences.mediaDevices.enableMasking,
      videoInputs: preferences.mediaDevices.videoInputs,
      audioInputs: preferences.mediaDevices.audioInputs,
      audioOutputs: preferences.mediaDevices.audioOutputs,
    };

    preferences.webRtc = {
      ...preferences.webRtc,
      fill_based_on_ip: !!get(preferences, 'webRTC.fillBasedOnIp'),
      local_ip_masking: !!get(preferences, 'webRTC.local_ip_masking'),
    };

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

  async createStartup(local=false) {
    const profilePath = join(this.tmpdir, `gologin_profile_${this.profile_id}`);
    let profile;
    let profile_folder;
    await rimraf(profilePath, () => null);
    debug('-', profilePath, 'dropped');
    profile = await this.getProfile();
    const { navigator = {}, fonts, os: profileOs  } = profile;
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

    const profileZipExists = await access(this.profile_zip_path).then(() => true).catch(() => false);
    if (!(local && profileZipExists)) {
      try {
        profile_folder = await this.getProfileS3(get(profile, 's3Path', ''));
      } catch (e) {
        debug('Cannot get profile - using empty', e);
      }

      debug('FILE READY', this.profile_zip_path);
      if (!profile_folder.length) {
        profile_folder = await this.emptyProfileFolder();
      }

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

    const pref_file_name = join(profilePath, 'Default', 'Preferences');
    debug('reading', pref_file_name);

    const prefFileExists = await access(pref_file_name).then(() => true).catch(() => false);
    if (!prefFileExists) {
      debug('Preferences file not exists waiting', pref_file_name, '. Using empty profile');
      profile_folder = await this.emptyProfileFolder();
      await writeFile(this.profile_zip_path, profile_folder);
      await this.extractProfile(profilePath, this.profile_zip_path);
    }

    const preferences_raw = await readFile(pref_file_name);
    const preferences = JSON.parse(preferences_raw.toString());
    let proxy = get(profile, 'proxy');
    const name = get(profile, 'name');
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
    // console.log('proxy=', proxy);

    if (proxy.mode === 'geolocation') {
      proxy.mode = 'http';
    }

    if (proxy.mode === 'none') {
      proxy = null;
    }

    this.proxy = proxy;

    await this.getTimeZone(proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw e;
    });

    const [latitude, longitude] = this._tz.ll;
    const { accuracy } = this._tz;

    const profileGeolocation = profile.geolocation;
    const tzGeoLocation = {
      latitude,
      longitude,
      accuracy,
    };

    profile.geoLocation = this.getGeolocationParams(profileGeolocation, tzGeoLocation);
    profile.name = name;
    profile.name_base64 = Buffer.from(name).toString('base64');
    profile.profile_id = this.profile_id;

    profile.webRtc = {
      mode: get(profile, 'webRTC.mode') === 'alerted' ? 'public' : get(profile, 'webRTC.mode'),
      publicIP: get(profile, 'webRTC.fillBasedOnIp') ? this._tz.ip : get(profile, 'webRTC.publicIp'),
      localIps: get(profile, 'webRTC.localIps', []),
    };

    debug('profile.webRtc=', profile.webRtc);
    debug('profile.timezone=', profile.timezone);
    debug('profile.mediaDevices=', profile.mediaDevices);

    const audioContext = profile.audioContext || {};
    const { mode: audioCtxMode = 'off', noise: audioCtxNoise } = audioContext;
    if (profile.timezone.fillBasedOnIp==false) {
      profile.timezone = { id: profile.timezone.timezone };
    } else {
      profile.timezone = { id: this._tz.timezone };
    }

    profile.webgl_noise_value = profile.webGL.noise;
    profile.get_client_rects_noise = profile.webGL.getClientRectsNoise;
    profile.canvasMode = profile.canvas.mode;
    profile.canvasNoise = profile.canvas.noise;
    profile.audioContext = {
      enable: audioCtxMode !== 'off',
      noiseValue: audioCtxNoise,
    };
    profile.webgl = {
      metadata: {
        vendor: get(profile, 'webGLMetadata.vendor'),
        renderer: get(profile, 'webGLMetadata.renderer'),
        mode: get(profile, 'webGLMetadata.mode') === 'mask',
      },
    };

    profile.custom_fonts = {
      enable: !!fonts?.enableMasking,
    };

    const gologin = this.convertPreferences(profile);

    debug(`Writing profile for screenWidth ${profilePath}`, JSON.stringify(gologin));
    gologin.screenWidth = this.resolution.width;
    gologin.screenHeight = this.resolution.height;
    debug('writeCookesFromServer', this.writeCookesFromServer);
    if (this.writeCookesFromServer) {
      await this.writeCookiesToFile();
    }

    if (this.fontsMasking) {
      const families = fonts?.families || [];
      if (!families.length) {
        throw new Error('No fonts list provided');
      }

      try {
        await composeFonts(families, profilePath, this.differentOs);
      } catch (e) {
        console.trace(e);
      }
    }

    const languages = this.language.replace(/;|q=[\d\.]+/img, '')

    if (preferences.gologin==null) {
      preferences.gologin = {};
    }

    preferences.gologin.langHeader = gologin.language;
    preferences.gologin.language = languages;

    await writeFile(join(profilePath, 'Default', 'Preferences'), JSON.stringify(Object.assign(preferences, {
      gologin,
    })));

    const bookmarksParsedData = await getCurrentProfileBookmarks(this.bookmarksFilePath);
    const bookmarksFromDb = profile.bookmarks?.bookmark_bar;
    bookmarksParsedData.roots = bookmarksFromDb ? profile.bookmarks : bookmarksParsedData.roots;
    await writeFile(this.bookmarksFilePath, JSON.stringify(bookmarksParsedData));

    debug('Profile ready. Path: ', profilePath, 'PROXY', JSON.stringify(get(preferences, 'gologin.proxy')));

    return profilePath;
  }

  async commitProfile() {
    const dataBuff = await this.getProfileDataToUpdate();

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
    if (proxy!==null && proxy.mode !== 'none') {
      if (proxy.mode.includes('socks')) {
        for (let i=0; i<5; i++) {
          try {
            debug('getting timeZone socks try', i+1);

            return this.getTimezoneWithSocks(proxy);
          } catch (e) {
            console.log(e.message);
          }
        }
        throw new Error('Socks proxy connection timed out');
      }

      const proxyUrl = `${proxy.mode}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
      debug('getTimeZone start https://time.gologin.com/timezone', proxyUrl);
      data = await requests.get('https://time.gologin.com/timezone', { proxy: proxyUrl, timeout: 20 * 1000, maxAttempts: 5 });
    } else {
      data = await requests.get('https://time.gologin.com/timezone', { timeout: 20 * 1000, maxAttempts: 5 });
    }

    debug('getTimeZone finish', data.body);
    this._tz = JSON.parse(data.body);

    return this._tz.timezone;
  }

  async getTimezoneWithSocks(params) {
    const { mode = 'http', host, port, username = '', password = '' } = params;
    let body;

    let proxy = mode + '://';
    if (username) {
      const resultPassword = password ? ':' + password + '@' : '@';
      proxy += username + resultPassword;
    }

    proxy += host + ':' + port;

    const agent = new ProxyAgent(proxy, { tunnel: true, timeout: 10000 });

    const checkData = await new Promise((resolve, reject) => {
      _get('https://time.gologin.com/timezone', { agent }, (res) => {
        let resultResponse = '';
        res.on('data', (data) => resultResponse += data);

        res.on('end', () => {
          let parsedData;
          try {
            parsedData = JSON.parse(resultResponse);
          } catch (e) {
            reject(e);
          }

          resolve({
            ...res,
            body: parsedData,
          });
        });
      }).on('error', (err) => reject(err));
    });

    // console.log('checkData:', checkData);
    body = checkData.body || {};
    if (!body.ip && checkData.statusCode.toString().startsWith('4')) {
      throw checkData;
    }

    debug('getTimeZone finish', body.body);
    this._tz = body;

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
    let { remote_debugging_port } = this;
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
      const [splittedLangs] = this.language.split(';');
      let [browserLang] = splittedLangs.split(',');
      if (process.platform === 'darwin') {
        browserLang = 'en-US';
      }

      let params = [
        `--remote-debugging-port=${remote_debugging_port}`,
        `--user-data-dir=${profile_path}`,
        '--password-store=basic',
        `--tz=${tz}`,
        `--lang=${browserLang}`,
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

        if (this.profileOs === 'android') {
          arg = '--font-masking-mode=1';
        }

        params.push(arg);
      }

      if (proxy) {
        const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host}"`;
        params.push(`--proxy-server=${proxy}`);
        params.push(`--host-resolver-rules=${hr_rules}`);
      }

      if (Array.isArray(this.extra_params) && this.extra_params.length) {
        params = params.concat(this.extra_params);
      }

      if (this.restoreLastSession) {
        params.push('--restore-last-session');
      }

      console.log(params);
      const child = execFile(ORBITA_BROWSER, params, { env });
      // const child = spawn(ORBITA_BROWSER, params, { env, shell: true });
      child.stdout.on('data', (data) => debug(data.toString()));
      debug('SPAWN CMD', ORBITA_BROWSER, params.join(' '));
    }

    if (this.waitWebsocket) {
      debug('GETTING WS URL FROM BROWSER');
      const data = await requests.get(`http://127.0.0.1:${remote_debugging_port}/json/version`, { json: true });

      debug('WS IS', get(data, 'body.webSocketDebuggerUrl', ''));
      this.is_active = true;

      return get(data, 'body.webSocketDebuggerUrl', '');
    }

    return '';
  }

  async createStartupAndSpawnBrowser() {
    await this.createStartup();

    return this.spawnBrowser();
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
      await this.uploadProfileCookiesToServer();
    }

    await this.saveBookmarksToDb();

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

  async sanitizeProfile() {
    const remove_dirs = [
      `${SEPARATOR}Default${SEPARATOR}Cache`,
      `${SEPARATOR}Default${SEPARATOR}Service Worker${SEPARATOR}CacheStorage`,
      `${SEPARATOR}Default${SEPARATOR}Code Cache`,
      `${SEPARATOR}Default${SEPARATOR}GPUCache`,
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

  async profileExists() {
    const profileResponse = await requests.post(`${API_URL}/browser`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
      },
      json: {

      },
    });

    if (profileResponse.statusCode !== 200) {
      return false;
    }

    debug('profile is', profileResponse.body);

    return true;
  }

  async getRandomFingerprint(options) {
    let os = 'lin';

    if (options.os) {
      os = options.os;
    }

    const fingerprint = await requests.get(`${API_URL}/browser/fingerprint?os=${os}`,{
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',
      },
    });

    return JSON.parse(fingerprint.body);
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

    navigator.deviceMemory = deviceMemory*1024;
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
    Object.keys(options).map((e) => {
      json[e] = options[e];
    });
    if (user_agent === 'random') {
      json.navigator.userAgent = orig_user_agent;
    }
    // console.log('profileOptions', json);

    const response = await requests.post(`${API_URL}/browser`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',
      },
      json,
    });

    if (response.statusCode === 400) {
      throw new Error(`gologin failed account creation with status code, ${response.statusCode} DATA  ${JSON.stringify(response.body.message)}`);
    }

    if (response.statusCode === 500) {
      throw new Error(`gologin failed account creation with status code, ${response.statusCode}`);
    }

    debug(JSON.stringify(response.body));

    return response.body.id;
  }

  async delete(pid) {
    const profile_id = pid || this.profile_id;
    await requests.delete(`${API_URL}/browser/${profile_id}`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',
      },
    });
  }

  async update(options) {
    this.profile_id = options.id;
    const profile = await this.getProfile();

    if (options.navigator) {
      Object.keys(options.navigator).map((e) => {
        profile.navigator[e]=options.navigator[e];
      });
    }

    Object.keys(options).filter(e => e !== 'navigator').map((e) => {
      profile[e]=options[e];
    });

    debug('update profile', profile);
    const response = await requests.put(`https://api.gologin.com/browser/${options.id}`,{
      json: profile,
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
      },
    });

    debug('response', JSON.stringify(response.body));

    return response.body;
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

    if (response.statusCode === 200) {
      return response.body;
    }

    return { status: 'failure', status_code: response.statusCode, body: response.body };
  }

  async getCookies(profileId) {
    const response = await downloadCookies({
      profileId,
      API_BASE_URL: API_URL,
      ACCESS_TOKEN: this.access_token,
    });

    return response.body;
  }

  async writeCookiesToFile() {
    const cookies = await this.getCookies(this.profile_id);
    if (!cookies.length) {
      return;
    }

    const resultCookies = cookies.map((el) => ({ ...el, value: Buffer.from(el.value) }));

    let db;
    try {
      db = await getDB(this.cookiesFilePath, false);
      const chunckInsertValues = getChunckedInsertValues(resultCookies);

      for (const [query, queryParams] of chunckInsertValues) {
        const insertStmt = await db.prepare(query);
        await insertStmt.run(queryParams);
        await insertStmt.finalize();
      }
    } catch (error) {
      console.log(error.message);
    } finally {
      await db && db.close();
    }
  }

  async uploadProfileCookiesToServer() {
    const cookies = await loadCookiesFromFile(this.cookiesFilePath);
    if (!cookies.length) {
      return;
    }

    return this.postCookies(this.profile_id, cookies);
  }

  async saveBookmarksToDb() {
    const bookmarksData = await getCurrentProfileBookmarks(this.bookmarksFilePath);
    const bookmarks = bookmarksData.roots || {};
    await updateProfileBookmarks([this.profile_id], this.access_token, bookmarks);
  }

  async start() {
    if (this.is_remote) {
      return this.startRemote();
    }

    if (!this.executablePath) {
      await this.checkBrowser();
    }

    const ORBITA_BROWSER = this.executablePath || this.browserChecker.getOrbitaPath;

    const orbitaBrowserExists = await access(ORBITA_BROWSER).then(() => true).catch(() => false);
    if (!orbitaBrowserExists) {
      throw new Error(`Orbita browser is not exists on path ${ORBITA_BROWSER}, check executablePath param`);
    }

    await this.createStartup();
    // await this.createBrowserExtension();
    const wsUrl = await this.spawnBrowser();
    this.setActive(true);

    return { status: 'success', wsUrl };
  }

  async startLocal() {
    await this.createStartup(true);
    // await this.createBrowserExtension();
    const wsUrl = await this.spawnBrowser();
    this.setActive(true);

    return { status: 'success', wsUrl };
  }

  async stop() {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (this.is_remote) {
      return this.stopRemote();
    }

    await this.stopAndCommit({ posting: true }, false);
  }

  async stopLocal(options) {
    const opts = options || { posting: false };
    await this.stopAndCommit(opts, true);
  }

  async waitDebuggingUrl(delay_ms, try_count=0) {
    await delay(delay_ms);
    const url = `https://${this.profile_id}.orbita.gologin.com/json/version`;
    console.log('try_count=', try_count, 'url=', url);
    const response = await requests.get(url);
    let wsUrl = '';
    console.log('response', response.body);

    if (!response.body) {
      return wsUrl;
    }

    try {
      const parsedBody = JSON.parse(response.body);
      wsUrl = parsedBody.webSocketDebuggerUrl;
    } catch (e) {
      if (try_count < 3) {
        return this.waitDebuggingUrl(delay_ms, try_count+1);
      }

      return { 'status': 'failure', wsUrl, 'message': 'Check proxy settings', 'profile_id': this.profile_id };
    }

    wsUrl = wsUrl.replace('ws://', 'wss://').replace('127.0.0.1', `${this.profile_id}.orbita.gologin.com`);

    return wsUrl;
  }

  async startRemote(delay_ms = 10000) {
    debug(`startRemote ${this.profile_id}`);

    /*
    if (profileResponse.statusCode !== 202) {
      return {'status': 'failure', 'code':  profileResponse.statusCode};
    }
    */

    // if (profileResponse.body === 'ok') {
    const profile = await this.getProfile();

    const profileResponse = await requests.post(`https://api.gologin.com/browser/${this.profile_id}/web`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
      },
    });

    debug('profileResponse', profileResponse.statusCode, profileResponse.body);

    if (profileResponse.statusCode === 401) {
      throw new Error('invalid token');
    }

    const { navigator = {}, fonts, os: profileOs  } = profile;
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

    const wsUrl = await this.waitDebuggingUrl(delay_ms);
    if (wsUrl !== '') {
      return { 'status': 'success', wsUrl };
    }

    return { 'status': 'failure', 'message': profileResponse.body };
  }

  async stopRemote() {
    debug(`stopRemote ${this.profile_id}`);
    const profileResponse = await requests.delete(`https://api.gologin.com/browser/${this.profile_id}/web`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
      },
    });

    console.log(`stopRemote ${profileResponse.body}`);
    if (profileResponse.body) {
      return JSON.parse(profileResponse.body);
    }
  }

  getAvailableFonts() {
    return fontsCollection
      .filter(elem => elem.fileNames)
      .map(elem => elem.name);
  }

  async changeProfileResolution(resolution) {
    return updateProfileResolution(this.profile_id, this.access_token, resolution);
  }

  async changeProfileUserAgent(userAgent) {
    return updateProfileUserAgent(this.profile_id, this.access_token, userAgent);
  }

  async changeProfileProxy(proxyData) {
    return updateProfileProxy(this.profile_id, this.access_token, proxyData);
  }
}

export default GoLogin;
