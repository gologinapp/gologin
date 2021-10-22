const debug = require('debug')('gologin');
const _ = require('lodash');
const requests = require('requestretry').defaults({ timeout: 60000 });
const fs = require('fs');
const os = require('os');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const exec = util.promisify(require('child_process').exec);
const { spawn, execFile } = require('child_process');
const FormData = require('form-data');
const socks5Http = require('socks5-https-client');
const decompress = require('decompress');
const decompressUnzip = require('decompress-unzip');
const path = require('path');
const shell = require('shelljs');

const BrowserChecker = require('./browser-checker');
const { BrowserUserDataManager } = require('./browser-user-data-manager');
const { CookiesManager } = require('./cookies-manager');
const fontsCollection = require('./fonts');

const SEPARATOR = path.sep;
const API_URL = 'https://api.gologin.com';
const OS_PLATFORM = process.platform;

// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

class GoLogin {
  constructor(options) {
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
    this.tmpdir = os.tmpdir();
    this.autoUpdateBrowser = !!options.autoUpdateBrowser;
    this.browserChecker = new BrowserChecker();
    this.uploadCookiesToServer = options.uploadCookiesToServer || false;
    this.writeCookesFromServer = options.writeCookesFromServer || true;
    this.cookiesFilePath = path.join(os.tmpdir(), `gologin_profile_${this.profile_id}`, 'Default', 'Cookies');
    this.remote_debugging_port = options.remote_debugging_port || 0;
    this.timezone = options.timezone;

    if (options.tmpdir) {
      this.tmpdir = options.tmpdir;
      if (!fs.existsSync(this.tmpdir)) {
        debug('making tmpdir', this.tmpdir);
        shell.mkdir('-p', this.tmpdir);
      }
    }

    this.profile_zip_path = path.join(this.tmpdir, `gologin_${this.profile_id}.zip`);
    debug('INIT GOLOGIN', this.profile_id);
  }
  
  async checkBrowser() { return this.browserChecker.checkBrowser(this.autoUpdateBrowser) }

  async setProfileId(profile_id) {
    this.profile_id = profile_id;
    this.profile_zip_path = path.join(this.tmpdir, `gologin_${this.profile_id}.zip`);
  }

  async getToken(username, password) {
  	let data = await requests.post(`${API_URL}/user/login`, {
  		json: {
  			username: username,
  			password: password
  		}
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
      }
    })

    return fpResponse?.body || {};
  }

  async profiles() {
  	const profilesResponse = await requests.get(`${API_URL}/browser/`, {
  		headers: {
  			'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',

  		}
  	})

  	if (profilesResponse.statusCode !== 200) {
  		throw new Error(`Gologin /browser response error`);
  	}

    return JSON.parse(profilesResponse.body);
  }

  async getProfile(profile_id) {
    const id = profile_id || this.profile_id;
    debug('getProfile', this.access_token, id);
  	const profileResponse = await requests.get(`${API_URL}/browser/${id}`, {
  		headers: {
  			'Authorization': `Bearer ${this.access_token}`
  		}
  	})
    debug(profileResponse.body);
  	if (profileResponse.statusCode !== 200) {
  		throw new Error(`Gologin /browser/${id} response error ${profileResponse.statusCode}`);
  	}

    if(profileResponse.statusCode == 401){
      throw new Error("invalid token");
    }    

  	return JSON.parse(profileResponse.body);
  }

  async emptyProfile() {
  	return fs.readFileSync(path.resolve(__dirname, 'gologin_zeroprofile.b64')).toString();
  }

  async getProfileS3(s3path) {
    const token = this.access_token;
    debug('getProfileS3 token=', token, 'profile=', this.profile_id, 's3path=', s3path);
    if (s3path) { //загрузка профиля из публичного бакета s3 быстрее
      const s3url = `https://gprofiles.gologin.com/${s3path}`.replace(/\s+/mg, '+');
      debug('loading profile from public s3 bucket, url=', s3url);
      const profileResponse = await requests.get(s3url, {
        encoding: null
      });
      if (profileResponse.statusCode !== 200) {
        debug(`Gologin S3 BUCKET ${s3url} response error ${profileResponse.statusCode}  - use empty`);
        return '';
      }
      return Buffer.from(profileResponse.body);
    }

    debug('old-way loading profile');
    const profileResponse = await requests.get(`${API_URL}/browser/${this.profile_id}/profile-s3`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      encoding: null
    });
    if (profileResponse.statusCode !== 200) {
      debug(`Gologin /browser/${this.profile_id} response error ${profileResponse.statusCode}  - use empty`);
      return '';
    }
    return Buffer.from(profileResponse.body);
  }

  async postFile(fileName, fileBody) {
    debug('POSTING FILE', fileBody.length);
    const fd = new FormData();
    const boundary = fd.getBoundary();
    const body = Buffer.concat([
      Buffer.from('--'),
      Buffer.from(boundary),
      Buffer.from('\r\n'),
      Buffer.from(`Content-Disposition: form-data; name="profile"; filename="${fileName}"`),
      Buffer.from('\r\n'),
      Buffer.from('\r\n'),
      Buffer.from(fileBody),
      Buffer.from('\r\n'),
      Buffer.from('--'),
      Buffer.from(boundary),
      Buffer.from('--'),
      Buffer.from('\r\n')
    ]);
    await new Promise((resolve) => {
      let options = {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.access_token}`,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': body.length
        },
        body: body,
        url: `${API_URL}/browser/${this.profile_id}/profile-s3`,
      };
      requests(_.merge(options, {}), () => {
        resolve();
      });
    });
  }

  async emptyProfileFolder() {
    debug('get emptyProfileFolder');
    const profile = fs.readFileSync(path.resolve(__dirname, 'gologin_zeroprofile.zip'));
    debug('emptyProfileFolder LENGTH ::', profile.length);
    return profile;
  }

  convertPreferences(preferences) {
    if (_.get(preferences, 'navigator.userAgent')) {
      preferences.userAgent = _.get(preferences, 'navigator.userAgent');
    }

    if (_.get(preferences, 'navigator.doNotTrack')) {
      preferences.doNotTrack = _.get(preferences, 'navigator.doNotTrack');
    }

    if (_.get(preferences, 'navigator.hardwareConcurrency')) {
      preferences.hardwareConcurrency = _.get(preferences, 'navigator.hardwareConcurrency');
    }

    if (_.get(preferences, 'navigator.language')) {
      preferences.language = _.get(preferences, 'navigator.language');
    }

    return preferences;
  }

  async createBrowserExtension() {
    const that = this;
    debug('start createBrowserExtension')
    await rimraf(this.orbitaExtensionPath());
    const extPath = this.orbitaExtensionPath();
    debug('extension folder sanitized');
    const extension_source = path.resolve(__dirname, `gologin-browser-ext.zip`);
    await decompress(extension_source, extPath,
      {
        plugins: [decompressUnzip()],
        filter: file => !file.path.endsWith('/'),
      }
    )
      .then(() => {
        debug('extraction done');
        debug('create uid.json');
        fs.writeFileSync(path.join(extPath, 'uid.json'), JSON.stringify({uid: that.profile_id}, null, 2))
        debug('uid.json created', fs.readFileSync(path.join(extPath, 'uid.json')).toString())
        return extPath;
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
      }
    );
  }

  async checkLocalProfile() {

  }

  async createStartup(local=false) {
    const profilePath = path.join(this.tmpdir, `gologin_profile_${this.profile_id}`);
    let profile;
    let profile_folder;
    await rimraf(profilePath);
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

    if (!(local && fs.existsSync(this.profile_zip_path))) {
      try {
        profile_folder = await this.getProfileS3(_.get(profile, 's3Path', ''));
      }
      catch (e) {
        debug('Cannot get profile - using empty', e);
      }
      debug('FILE READY', this.profile_zip_path);
      if (!profile_folder.length) {
        profile_folder = await this.emptyProfileFolder();
      }
        
      fs.writeFileSync(this.profile_zip_path, profile_folder);

      debug('PROFILE LENGTH', profile_folder.length);
    } else {
      debug('PROFILE LOCAL HAVING', this.profile_zip_path);
    }

    debug('Cleaning up..', profilePath);

    await this.extractProfile(profilePath, this.profile_zip_path);
    debug('extraction done');

    if (fs.existsSync(path.join(profilePath, 'SingletonLock'))) {
      debug('removing SingletonLock');
      fs.unlinkSync(path.join(profilePath, 'SingletonLock'));
      debug('SingletonLock removed');
    }

    const pref_file_name = path.join(profilePath, 'Default', 'Preferences');
    debug('reading', pref_file_name);

    if (!fs.existsSync(pref_file_name)) {
      debug('Preferences file not exists waiting', pref_file_name);
    }

    const preferences_raw = fs.readFileSync(pref_file_name);
    let preferences = JSON.parse(preferences_raw.toString());
    let proxy = _.get(profile, 'proxy');
    let name = _.get(profile, 'name');

    if (proxy.mode === 'gologin' || proxy.mode === 'tor') {
      const autoProxyServer = _.get(profile, 'autoProxyServer');
      const splittedAutoProxyServer = autoProxyServer.split('://');
      const splittedProxyAddress = splittedAutoProxyServer[1].split(':');
      const port = splittedProxyAddress[1];

      proxy = {
        'mode': splittedAutoProxyServer[0],
        'host': splittedProxyAddress[0],
        port,
        'username': _.get(profile, 'autoProxyUsername'),
        'password': _.get(profile, 'autoProxyPassword'),
      }
        
      profile.proxy.username = _.get(profile, 'autoProxyUsername');
      profile.proxy.password = _.get(profile, 'autoProxyPassword');
    }
    // console.log('proxy=', proxy);
    if (proxy.mode === 'none') {
      proxy = null;
    }
    this.proxy = proxy;

    await this.getTimeZone(proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw e;
    });

    const [latitude, longitude] = this._tz.ll;
    const accuracy = this._tz.accuracy;

    const profileGeolocation = profile.geolocation;
    const tzGeoLocation = {
      latitude,
      longitude,
      accuracy
    };
    profile.geoLocation = this.getGeolocationParams(profileGeolocation, tzGeoLocation);
    profile.name = name;

    profile.webRtc = {
      mode: _.get(profile, 'webRTC.mode') === 'alerted' ? 'public' : _.get(profile, 'webRTC.mode'),
      publicIP: _.get(profile, 'webRTC.fillBasedOnIp') ? this._tz.ip : _.get(profile, 'webRTC.publicIp'),
      localIps: _.get(profile, 'webRTC.localIps', []),
    };

    const audioContext = profile.audioContext || {};
    const { mode: audioCtxMode = 'off', noise: audioCtxNoise } = audioContext;
    profile.timezone = { id: this._tz.timezone };
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
        vendor: _.get(profile, 'webGLMetadata.vendor'),
        renderer: _.get(profile, 'webGLMetadata.renderer'),
        mode: _.get(profile, 'webGLMetadata.mode') === 'mask',
      }
    };

    profile.custom_fonts = {
      enable: !!fonts?.enableMasking,
    }

    const gologin = this.convertPreferences(profile);

    debug(`Writing profile for screenWidth ${profilePath}`, JSON.stringify(profile));
    gologin.screenWidth = this.resolution.width;
    gologin.screenHeight = this.resolution.height;

    if (this.writeCookesFromServer) {
      await this.writeCookiesToFile();
    }

    if (this.fontsMasking) {
      const families = fonts?.families || [];
      if (!families.length) {
        throw new Error('No fonts list provided');
      }

      await BrowserUserDataManager.composeFonts(families, profilePath, this.differentOs);
    }

    fs.writeFileSync(path.join(profilePath, 'Default', 'Preferences'), JSON.stringify(_.merge(preferences, {
      gologin
    })));

    // console.log('gologin=', _.merge(preferences, {
    //   gologin
    // }));

    debug('Profile ready. Path: ', profilePath, 'PROXY', JSON.stringify(_.get(preferences, 'gologin.proxy')));
    return profilePath;
  }

  async commitProfile() {
    const data = await this.getProfileDataToUpdate();
    debug('begin updating', data.length);
    if (!data.length) {
      debug('WARN: profile zip data empty - SKIPPING PROFILE COMMIT');

      return;
    }
    try {
      debug('Patching profile');
      await this.postFile('profile', data);
    }
    catch (e) {
      debug('CANNOT COMMIT PROFILE', e);
    }
    debug('COMMIT COMPLETED');
  }

  profilePath() {
    return path.join(this.tmpdir, `gologin_profile_${this.profile_id}`);
  }

  orbitaExtensionPath() {
    return path.join(this.tmpdir, `orbita_extension_${this.profile_id}`);
  }

  getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async checkPortAvailable(port) {
    debug('CHECKING PORT AVAILABLE', port);
    try {
      const { stdout, stderr } = await exec(`lsof -i:${port}`);
      if (
        stdout && stdout.match(/LISTEN/gmi)
      ) {
        debug(`PORT ${port} IS BUSY`)
        return false;
      }
    } catch (e) { }
    debug(`PORT ${port} IS OPEN`);
    return true;
  }

  async getRandomPort() {
    let port = this.getRandomInt(20000, 40000);
    let port_available = this.checkPortAvailable(port);
    while (!port_available) {
      port = this.getRandomInt(20000, 40000);
      port_available = await this.checkPortAvailable(port);
    }
    return port;
  }

  async getTimeZone(proxy) {
    if(this.timezone){
      debug('getTimeZone from options', this.timezone);
      this._tz = this.timezone;
      return this._tz.timezone;
    }

    let data = null;
    if (proxy) {
      if (proxy.mode.includes('socks')) {
        return this.getTimezoneWithSocks(proxy);
      }

      const proxyUrl = `${proxy.mode}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
      debug('getTimeZone start https://time.gologin.com', proxyUrl);
      data = await requests.get('https://time.gologin.com', { proxy: proxyUrl, timeout: 10 * 1000, maxAttempts: 2 });
    } else {
      data = await requests.get('https://time.gologin.com', { timeout: 10 * 1000, maxAttempts: 2 });
    }
    debug('getTimeZone finish', data.body);
    this._tz = JSON.parse(data.body);
    return this._tz.timezone;
  }

  async getTimezoneWithSocks(proxy) {
    const { host, port, username, password } = proxy;
    let body;

    const checkData = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.abort();
        reject(new Error('Timeout exceeded'));
      }, 10000);

      const req = socks5Http.get({
        hostname: 'time.gologin.com',
        path: '/timezone',
        socksHost: host,
        socksPort: port,
        socksUsername: username || '',
        socksPassword: password || '',
      }, (res) => {
        res.setEncoding('utf8');

        let resultResponse = '';
        res.on('data', (data) => resultResponse += data);

        res.on('end', () => {
          clearTimeout(timer);
          let parsedData;
          try {
            parsedData = JSON.parse(resultResponse);
          } catch (e) {}

          resolve({
            ...res,
            body: parsedData,
          });
        });
      }).on('error', (err) => reject(err));
    });

    console.log('checkData:', checkData);
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
    
    let proxy = this.proxy;
    proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;

    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });
    const tz = await this.getTimeZone(this.proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw e;
    });
    env['TZ'] = tz;

    let params = [`--proxy-server=${proxy}`, `--user-data-dir=${profile_path}`, `--password-store=basic`, `--tz=${tz}`, `--lang=en`]
    if (Array.isArray(this.extra_params) && this.extra_params.length) {
      params = params.concat(this.extra_params);
    }

    if (this.remote_debugging_port) {
      params.push(`--remote-debugging-port=${remote_debugging_port}`);
    }

    return params;
  }

  async spawnBrowser() {
    let remote_debugging_port = this.remote_debugging_port;
    if(!remote_debugging_port){
      remote_debugging_port = await this.getRandomPort();
    } 
    
    const profile_path = this.profilePath();
    
    let proxy = this.proxy;
    let proxy_host = '';
    if (proxy) {
      proxy_host = this.proxy.host;
      proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;
    }

    this.port = remote_debugging_port;
    
    const ORBITA_BROWSER = this.executablePath || this.browserChecker.getOrbitaPath;

    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });
    const tz = await this.getTimeZone(this.proxy).catch((e) => {
      console.error('Proxy Error. Check it and try again.');
      throw e;
    });
    env['TZ'] = tz;

    if (this.vnc_port) {
      const script_path = path.resolve(__dirname, './run.sh');
      debug('RUNNING', script_path, ORBITA_BROWSER, remote_debugging_port, proxy, profile_path, this.vnc_port);
      execFile(
        script_path,
        [ORBITA_BROWSER, remote_debugging_port, proxy, profile_path, this.vnc_port, tz],
        { env }
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
        `--password-store=basic`, 
        `--tz=${tz}`,
        `--lang=${browserLang}`,
      ];

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

      const child = execFile(ORBITA_BROWSER, params, {env});
      // const child = spawn(ORBITA_BROWSER, params, { env, shell: true });
      child.stdout.on('data', (data) => debug(data.toString()));
      debug('SPAWN CMD', ORBITA_BROWSER, params.join(" "));      
    }

    debug('GETTING WS URL FROM BROWSER');

    let data = await requests.get(`http://127.0.0.1:${remote_debugging_port}/json/version`, {json: true});
    
    debug('WS IS', _.get(data, 'body.webSocketDebuggerUrl', ''))
    this.is_active = true;

    return _.get(data, 'body.webSocketDebuggerUrl', '');
  }

  async createStartupAndSpawnBrowser() {
    await this.createStartup();
    return this.spawnBrowser();
  }

  async clearProfileFiles() {
    await rimraf(path.join(this.tmpdir, `gologin_profile_${this.profile_id}`));
    await rimraf(path.join(this.tmpdir, `gologin_${this.profile_id}_upload.zip`));
  }

  async stopAndCommit(options, local= false) {
    if (this.is_stopping) {
      return true;
    }
    const is_posting = options.postings || false;

    if (this.uploadCookiesToServer) {
      await this.uploadProfileCookiesToServer();
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
      await rimraf(path.join(this.tmpdir, `gologin_${this.profile_id}.zip`));
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
        `-n tcp ${this.port}`
      ],
      {
          shell: true
      }
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
    ];
    const that = this;

    await Promise.all(remove_dirs.map(d => {
      const path_to_remove = `${that.profilePath()}${d}`
      return new Promise(resolve => {
        debug('DROPPING', path_to_remove);        
        rimraf(path_to_remove, { maxBusyTries: 100 }, (e) => {
          // debug('DROPPING RESULT', e);
          resolve();
        });
      });
    }))
  }

  async getProfileDataToUpdate() {
    const zipPath = path.join(this.tmpdir, `gologin_${this.profile_id}_upload.zip`);
    try {
      fs.unlinkSync(zipPath);
    }
    catch (e) {
    }
    await this.sanitizeProfile();
    debug('profile sanitized');
    await new Promise(resolve => {
      debug('begin zipping');
      execFile(`cd ${this.profilePath()}; /usr/bin/zip`, [
        `-r ${zipPath}`,
        '*'
      ], {
        shell: true
      }, () => {
        debug('zipping done');
        resolve();
      });
    });
    debug('PROFILE ZIP CREATED', this.profilePath(), zipPath);
    try {
      const data = fs.readFileSync(zipPath);
      return data;
    }
    catch (e) {
      debug('saveprofile error', e);
      return '';
    }
  }

  async profileExists() {
  	const profileResponse = await requests.post(`${API_URL}/browser`, {
  		headers: {
  			'Authorization': `Bearer ${this.access_token}`
  		},
  		json: {

  		}
  	})

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

    let fingerprint = await requests.get(`https://api.gologin.com/browser/fingerprint?os=${os}`,{
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',
      }
    });    

    return JSON.parse(fingerprint.body);    
  }

  async create(options) {
    debug('createProfile', options);

    const fingerprint = await this.getRandomFingerprint(options);
    debug("fingerprint=", fingerprint)
    
    if(fingerprint.statusCode == 500){
      throw new Error("no valid random fingerprint check os param");
    }

    if(fingerprint.statusCode == 401){
      throw new Error("invalid token");
    }

    const { navigator, fonts, webGLMetadata, webRTC } = fingerprint;
    let deviceMemory = navigator.deviceMemory || 2;
    if (deviceMemory < 1) {
      deviceMemory = 1;
    }
    navigator.deviceMemory = deviceMemory;
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

    Object.keys(options).map((e)=>{ json[e] = options[e] });

    // console.log('profileOptions', json);

    const response = await requests.post(`${API_URL}/browser`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`,
        'User-Agent': 'gologin-api',
      },
      json,
    });
    // console.log(JSON.stringify(response.body));
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
      Object.keys(options.navigator).map((e)=>{profile.navigator[e]=options.navigator[e]});
    }

    Object.keys(options).filter(e => e !== 'navigator').map((e)=>{profile[e]=options[e]});

    debug('update profile', profile);
    const response = await requests.put(`https://api.gologin.com/browser/${options.id}`,{
      json: profile,
      headers: {
        'Authorization': `Bearer ${this.access_token}`
      }
    });    
    debug('response', JSON.stringify(response.body));
    return response.body
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
    }
  };
  
  getViewPort() {
    return { ...this.resolution };
  };

  async postCookies(profileId, cookies) {
    const formattedCookies = cookies.map(cookie => {
      if (!['no_restriction', 'lax', 'strict', 'unspecified'].includes(cookie.sameSite)) {
        cookie.sameSite = 'unspecified';
      }

      return cookie;
    });

    const response = await BrowserUserDataManager.uploadCookies({
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
    const response = await BrowserUserDataManager.downloadCookies({
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
      db = await CookiesManager.getDB(this.cookiesFilePath, false);
      const chunckInsertValues = CookiesManager.getChunckedInsertValues(resultCookies);

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
    const cookies = await CookiesManager.loadCookiesFromFile(this.cookiesFilePath);
    if (!cookies.length) {
      return;
    }

    return this.postCookies(this.profile_id, cookies);
  }

  async start() {
    if (this.is_remote) {
      return this.startRemote()
    }

    if (!this.executablePath) {
     await this.checkBrowser();
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

    await this.stopAndCommit(false, {});
  }

  async stopLocal(options) {
    const opts = options || {posting: false};
    await this.stopAndCommit(true, opts.posting);
  }

  async waitDebuggingUrl(delay_ms, try_count=0) {
    await delay(delay_ms);
    const url = `https://${this.profile_id}.orbita.gologin.com/json/version`;
    console.log('try_count=', try_count, 'url=', url);
    const response = await requests.get(url)
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
      return { 'status': 'failure', wsUrl }
    }

    wsUrl = wsUrl.replace('ws://', `wss://`).replace('127.0.0.1', `${this.profile_id}.orbita.gologin.com`)
    return wsUrl;
  }

  async startRemote(delay_ms = 10000) {
    debug(`startRemote ${this.profile_id}`);
    const profileResponse = await requests.post(`https://api.gologin.com/browser/${this.profile_id}/web`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`
      }
    });

    if(profileResponse.statusCode == 401){
      throw new Error("invalid token");
    }

    debug('profileResponse', profileResponse.statusCode, profileResponse.body);
    if (profileResponse.statusCode !== 202) {
      return {'status': 'failure', 'code':  profileResponse.statusCode};
    }
    
    if (profileResponse.body === 'ok') {
      let wsUrl = await this.waitDebuggingUrl(delay_ms);
      // const wsUrl = `wss://${this.profile_id}.orbita.gologin.app`
      // const wsUrl = `wss://${this.profile_id}.orbita.gologin.com`
      return { 'status': 'success', wsUrl }
    }

    return { 'status': 'failure', 'message': profileResponse.body };
  }

  async stopRemote() {
    debug(`stopRemote ${this.profile_id}`);
    const profileResponse = await requests.delete(`https://api.gologin.com/browser/${this.profile_id}/web`, {
      headers: {
        'Authorization': `Bearer ${this.access_token}`
      }
    });
    console.log(`stopRemote ${profileResponse.body}`);
    if (profileResponse.body) {
      return JSON.parse(profileResponse.body);
    }
  }

  getAvailableFonts() {
    return fontsCollection
      .filter(elem => elem.fileNames)
      .map(elem => elem.name)
  }
}

module.exports = GoLogin;
