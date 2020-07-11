const debug = require('debug')('gologin');
const _ = require('lodash');
const requests = require('requestretry').defaults({timeout: 60000});
const fs = require('fs');
const child_process = require("child_process");
const util = require('util');
const rimraf = util.promisify(require("rimraf"));
const exec = util.promisify(require('child_process').exec);
const { spawn, execFile } = require('child_process');
const FormData = require("form-data");

const extract = require('extract-zip');
const path = require('path');

const API_URL = 'https://api.gologin.app';

// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

class GoLogin {
  constructor(options) {
    this.access_token = options.token;
    this.profile_id = options.profile_id;
    this.password = options.password;
    this.executablePath = options.executablePath;
    this.vnc_port = options.vncPort;
    this.is_active = false;
    this.is_stopping = false;
    debug('INIT GOLOGIN', this.profile_id);
  }

  async getToken(username, password) {
  	let data = await requests.post(`${API_URL}/user/login`, {
  		json: {
  			username: username,
  			password: password
  		}
  	});

  	if (!_.has(data, 'body.access_token')) {
  		throw new Error(`gologin auth failed with status code, ${data.statusCode} DATA  ${JSON.stringify(data)}`);
  	}

  	console.log('access_token=', data.body.access_token);
  }

  async getNewFingerPrint() {
    debug('GETTING FINGERPRINT');

    const fpResponse = await requests.get(`${API_URL}/browser/fingerprint?os=lin`, {
      json: true,
      headers: {
        'Authorization': `Bearer ${this.access_token}`
      }
    })

    return _.get(fpResponse, 'body', {});
  }

  async profiles() {
  	const profilesResponse = await requests.get(`${API_URL}/browser/`, {
  		headers: {
  			'Authorization': `Bearer ${this.access_token}`
  		}
  	})

  	if (profilesResponse.statusCode !== 200) {
  		throw new Error(`Gologin /browser response error`);
  	}

  	const profiles = JSON.parse(profilesResponse.body);

    return profiles;
  }


  async getProfile() {
    debug('getProfile', this.access_token, this.profile_id);
  	const profileResponse = await requests.get(`${API_URL}/browser/${this.profile_id}`, {
  		headers: {
  			'Authorization': `Bearer ${this.access_token}`
  		}
  	})
    debug(profileResponse.body);
  	if (profileResponse.statusCode !== 200) {
  		throw new Error(`Gologin /browser/${this.profile_id} response error ${profileResponse.statusCode}`);
  	}
  	return JSON.parse(profileResponse.body);
  }


  async emptyProfile() {
  	let b64 = fs.readFileSync('./gologin_zeroprofile.b64').toString();
  	return b64;
  }


  async getProfileS3(s3path) {
      const token = this.access_token;
      debug('getProfileS3 token=', token, 'profile=', this.profile_id, 's3path=', s3path);
      if (s3path) { //загрузка профиля из публичного бакета s3 быстрее
        const s3url = `https://s3.eu-central-1.amazonaws.com/gprofiles.gologin/${s3path}`.replace(/\s+/mg, '+');
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
    debug('emptyProfileFolder')
    const zipname = path.resolve(__dirname, './gologin_zeroprofile.zip');
    const outdir = `/tmp/gologin_profile_${this.profile_id}`;
    await new Promise((resolve, reject) => {
        extract(zipname, { dir: outdir }, function (err) {
            if (err) {
                debug('GOLOGIN CREATE STARTUP ERROR', err);
                reject(`GoLogin create startup error`);
            }
            
            require('child_process').execFile('/bin/chmod', ['777', '-R', outdir]); 
            
            try {
            }
            finally {
                debug('extraction done');
            }
            resolve();
        });
    })

    debug('get emptyProfileFolder');
    let profile = fs.readFileSync(path.resolve(__dirname, './gologin_zeroprofile.zip'));
    debug('emptyProfileFolder LENGTH ::', profile.length);
    return profile;
  }


  convertPreferences(preferences) {
    if(_.get(preferences, 'navigator.userAgent')){
      preferences.userAgent = _.get(preferences, 'navigator.userAgent');
    }

    if(_.get(preferences, 'navigator.doNotTrack')){
      preferences.doNotTrack = _.get(preferences, 'navigator.doNotTrack');
    }

    if(_.get(preferences, 'navigator.hardwareConcurrency')){
      preferences.hardwareConcurrency = _.get(preferences, 'navigator.hardwareConcurrency');
    }

    if(_.get(preferences, 'navigator.language')){
      preferences.language = _.get(preferences, 'navigator.language');
    }

    if(_.get(preferences, 'navigator.language')){
      preferences.language = _.get(preferences, 'navigator.language');
    }

    return preferences;
  }


  async createBrowserExtension() {
    const that = this;
    debug('start createBrowserExtension')
    await rimraf(this.orbitaExtensionPath());
    debug('extension folder sanitized');
    const extension_source = path.resolve(__dirname, `gologin-browser-ext.zip`);
    const extension_path = await new Promise((resolve, reject) => {
        extract(extension_source, { dir: that.orbitaExtensionPath() }, function (err) {
            if (err) {
                debug('CREATE ORBITA EXTENSION ERROR', err);
                reject(`GoLogin create orbita extension error`);
            }
            try {
            }
            finally {
                debug('extraction done');
            }
            resolve(that.orbitaExtensionPath());
        });
    })
        .then((path) => {
          debug('create uid.json');
          fs.writeFileSync(`${path}/uid.json`, JSON.stringify({uid: that.profile_id}, null, 2))
          debug('uid.json created', fs.readFileSync(`${path}/uid.json`).toString())
        return path;
    })
        .catch(async (e) => {
        debug('orbita extension error', e);
    });    
    debug('createBrowserExtension done');
  } 

  extractProfile(path, zipfile) {
    debug(`extactProfile ${path}`);
    const promise = new Promise(function(resolve, reject) {
        // resolve(path);
          extract(zipfile, { dir: path }, function (err) {
              if (err) {
                  debug('GOLOGIN CREATE STARTUP ERROR', err);
                  reject(`GoLogin create startup error`);
              }
              debug('extraction done');
              resolve(path);
          });
      });
    return promise;  
  }

  async createStartup() {
      let profile;
      let profile_folder;
      await rimraf(`/tmp/gologin_profile_${this.profile_id}`);
      debug('-', `/tmp/gologin_profile_${this.profile_id}`, 'dropped');

      profile = await this.getProfile();
      try {
          profile_folder = await this.getProfileS3(_.get(profile, 's3Path', ''));
      }
      catch (e) {
          debug('Cannot get profile - using empty', e);
      }

      if (profile_folder.length == 0) {
          profile_folder = await this.emptyProfileFolder();
      }

      debug('PROFILE LENGTH', profile_folder.length);
      debug('Cleaning up..', `/tmp/gologin_profile_${this.profile_id}`);

      fs.writeFileSync(`/tmp/gologin_${this.profile_id}.zip`, profile_folder);
      debug('FILE READY', `/tmp/gologin_${this.profile_id}.zip`);

      const path = `/tmp/gologin_profile_${this.profile_id}`;
      // const that = this;
      await this.extractProfile(path, `/tmp/gologin_${this.profile_id}.zip`);
      debug('extraction done');
      // .then(async(path) => 
      // {
          const pref_file_name = `${path}/Default/Preferences`;
          debug('reading', pref_file_name);

          if(!fs.existsSync(pref_file_name)) {
            debug('Preferences file not exists waiting', pref_file_name);
          }

          const preferences_raw = fs.readFileSync(pref_file_name);
          let preferences = JSON.parse(preferences_raw.toString());
          let proxy = _.get(profile, 'proxy');
          let name = _.get(profile, 'name');

          if(proxy.mode=='gologin'){
            const autoProxyServer = _.get(profile, 'autoProxyServer');
            const splittedAutoProxyServer = autoProxyServer.split('://');
            const splittedProxyAddress = splittedAutoProxyServer[1].split(':');
            const port = splittedProxyAddress[1];

            proxy = {
              'mode': 'gologin',
              'host': splittedProxyAddress[0],
              port,
              'username': _.get(profile, 'autoProxyUsername'),
              'password': _.get(profile, 'autoProxyPassword'),
              'timezone': _.get(profile, 'autoProxyTimezone', 'us'),
            }
            
            profile.proxy.username = _.get(profile, 'autoProxyUsername');
            profile.proxy.password = _.get(profile, 'autoProxyPassword');
          }

          this.proxy = proxy;
          this.profile_name = name;

          await this.getTimeZone(proxy)

          if (_.get(profile, 'webRTC.enabled') && _.get(profile, 'webRTC.enabled')) {
            debug('using tz ip for webRTC');
            profile.webRTC.publicIP = this._tz.ip;
          }
          
          let gologin = this.convertPreferences(profile); 
          console.log('gologin=', JSON.stringify(gologin))
          fs.writeFileSync(`/tmp/gologin_profile_${this.profile_id}/Default/Preferences`, JSON.stringify(_.merge(preferences, {
              gologin
          })));

          if(!_.get(preferences, 'gologin.screenWidth') && _.get(profile, 'navigator.resolution', '').split('x').length>1){
            debug(`Writing profile for screenWidth ${path}`, JSON.stringify(profile));
            gologin.screenWidth = _.get(profile, 'navigator.resolution').split('x')[0];
            gologin.screenHeight = _.get(profile, 'navigator.resolution').split('x')[1];
            
            fs.writeFileSync(`${path}/Default/Preferences`, JSON.stringify(_.merge(preferences, {
                gologin
            })));
          }

          // fs.writeFileSync(`/tmp/gologin_profile_${that.profile_id}/Default/Preferences`, fs.readFileSync('/opt/profiles/Preferences'));

          debug('Profile ready. Path: ', path, 'PROXY', JSON.stringify(_.get(preferences, 'gologin.proxy')));
          return path;
      /*}).catch(async (e) => {
          debug('gologin error', e);

          await that.createProfile(profile);

          return `/tmp/gologin_profile_${that.profile_id}`;
      });*/
      // return profile_path;
  }


  async commitProfile() {
      const data = await this.getProfileDataToUpdate();
      debug('begin updating', data.length);
      if (data.length == 0) {
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
    return `/tmp/gologin_profile_${this.profile_id}`;
  }


  orbitaExtensionPath() {
    return `/tmp/orbita_extension_${this.profile_id}`;
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


  async getTimeZone(proxy){
    const proxyUrl = `${proxy.mode}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    debug('getTimeZone start https://time.gologin.app', proxyUrl);
    const data = await requests.get('https://time.gologin.app', {proxy: proxyUrl});
    debug('getTimeZone finish', data.body);
    return JSON.parse(data.body).timezone;
  }

  async spawnArguments() {
    const profile_path = this.profilePath();
    
    let proxy = this.proxy;
    let profile_name = this.profile_name;
    proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;

    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });
    const tz = await this.getTimeZone(this.proxy);
    env['TZ'] = tz;

    const params = [`--remote-debugging-port=${remote_debugging_port}`,`--proxy-server=${proxy}`, `--user-data-dir=${profile_path}`, `--password-store=basic`, `--tz=${tz}`, `--gologin-profile=${profile_name}`, `--lang=en`, `--load-extension=${this.orbitaExtensionPath()}`]    
    return params;
  }

  async spawnBrowser() {
    const remote_debugging_port = await this.getRandomPort();
    const profile_path = this.profilePath();
    
    let proxy = this.proxy;
    let profile_name = this.profile_name;
    proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;

    this.port = remote_debugging_port;
    
    const ORBITA_BROWSER = this.executablePath || '/usr/bin/orbita-browser/chrome';

    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });
    const tz = await this.getTimeZone(this.proxy);
    env['TZ'] = tz;

    if (this.vnc_port) {
      const script_path = path.resolve(__dirname, './run.sh');
      debug('RUNNING', script_path, ORBITA_BROWSER, remote_debugging_port, proxy, profile_path, this.vnc_port);
      var child = require('child_process').execFile(script_path, [ORBITA_BROWSER, remote_debugging_port, proxy, profile_path, this.vnc_port, tz, profile_name, this.orbitaExtensionPath()], {env});
    } else {
      const params = [`--remote-debugging-port=${remote_debugging_port}`,`--proxy-server=${proxy}`, `--user-data-dir=${profile_path}`, `--password-store=basic`, `--tz=${tz}`, `--gologin-profile=${profile_name}`, `--lang=en`, `--load-extension=${this.orbitaExtensionPath()}`]    
      var child = require('child_process').execFile(ORBITA_BROWSER, params, {env}); 
      child.stdout.on('data', function(data) {
          debug(data.toString()); 
      });      
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
    const ws = await this.spawnBrowser();
    return ws;
  }


  async clearProfileFiles(){
    await rimraf(`/tmp/gologin_profile_${this.profile_id}`);
    await rimraf(`/tmp/gologin_${this.profile_id}.zip`);
    await rimraf(`/tmp/gologin_${this.profile_id}_upload.zip`);
  }


  async stopAndCommit() {    
    if(this.is_stopping==true){
      return true;
    }

    this.is_stopping = true;
    // await this.stopBrowser();
    await this.sanitizeProfile();
    await this.commitProfile();
    this.is_stopping = false;
    this.is_active = false;
    await this.clearProfileFiles();
    debug(`PROFILE ${this.profile_id} STOPPED AND CLEAR`);
    return false;
  }


  async stopBrowser() {
    if (!this.port) throw new Error('Empty GoLogin port');
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
        '/Default/Cache',
        '/biahpgbdmdkfgndcmfiipgcebobojjkp',
        '/afalakplffnnnlkncjhbmahjfjhmlkal',
        '/cffkpbalmllkdoenhmdmpbkajipdjfam',
        '/Dictionaries',
        '/enkheaiicpeffbfgjiklngbpkilnbkoi',
        '/oofiananboodjbbmdelgdommihjbkfag',
        '/SafetyTips'
      ];
    const that = this;

    await Promise.all(remove_dirs.map(d => {
      const path_to_remove = `${that.profilePath()}${d}`
      return new Promise(resolve => {
        debug('DROPPING', path_to_remove);        
        rimraf.sync(path_to_remove);
        resolve();
      });
    }))
  }


  async getProfileDataToUpdate() {
      const zipPath = `/tmp/gologin_${this.profile_id}_upload.zip`;
      try {
          fs.unlinkSync(zipPath);
      }
      catch (e) {
      }
      await this.sanitizeProfile();
      debug('profile sanitized');
      await new Promise(resolve => {
          debug('begin zipping');
          child_process.execFile(`cd ${this.profilePath()}; /usr/bin/zip`, [
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

  async createProfile(options) {
    debug('createProfile', options);

    const empty_profile = await this.emptyProfileFolder();
    const json = options;
    this.proxy = options.proxy;
    json.profile = empty_profile;
    debug('patching profile', `/tmp/gologin_profile_${this.profile_id}/Default/Preferences`);
    const preferences_raw = fs.readFileSync(`/tmp/gologin_profile_${this.profile_id}/Default/Preferences`);
    let preferences = JSON.parse(preferences_raw.toString());


    fs.writeFileSync(`/tmp/gologin_profile_${this.profile_id}/Default/Preferences`, JSON.stringify(_.merge(preferences, {
        gologin: options
    })));    

    debug('JSON created');
    const profileResponse = await requests.post(`${API_URL}/browser`, {
        headers: {
            'Authorization': `Bearer ${this.access_token}`
        },
        json
    });
    debug('POST complete', profileResponse.statusCode);
  }


  setActive(is_active){
    this.is_active = is_active;
  }


  async postCookies(profile_id, json) {
    const response = await requests.post(`${API_URL}/browser/${profile_id}/cookies`, {
        headers: {
            'Authorization': `Bearer ${this.access_token}`
        },
        json
    });    

    if(response.statusCode==200){
      return response.body;
    }

    return {"status": "failure", "status_code": response.statusCode, "body": response.body};
  }


  async getCookies(profile_id) {
    const response = await requests.get(`${API_URL}/browser/${profile_id}/cookies`, {
        headers: {
            'Authorization': `Bearer ${this.access_token}`
        }
    });    
    return response.body;
  }


  async start() {
    await this.createStartup();
    await this.createBrowserExtension();
    const url = await this.spawnBrowser();
    this.setActive(true);
    return url;
  }


  async stop() {
    await this.stopAndCommit();
  }
}


module.exports = GoLogin;
