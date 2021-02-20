import json
import time
import os
import stat
import sys
import shutil
import requests
import zipfile
import subprocess
import pathlib

API_URL = 'https://api.gologin.app';

class GoLogin(object):
    def __init__(self, options):
        self.access_token = options.get('token')
        self.tmpdir = options.get('tmpdir', '/tmp')
        self.address = options.get('address', '127.0.0.1')
        self.extra_params = options.get('extra_params', [])
        self.port = options.get('port', 3500)
        home = str(pathlib.Path.home())
        self.executablePath = options.get('executablePath', os.path.join(home, '.gologin/browser/orbita-browser/chrome'))
        print('executablePath', self.executablePath)
        if self.extra_params:
            print('extra_params', self.extra_params)
        self.setProfileId(options.get('profile_id')) 

    def setProfileId(self, profile_id):
        self.profile_id = profile_id
        self.profile_path = os.path.join(self.tmpdir, 'gologin_'+self.profile_id)
        self.profile_zip_path = os.path.join(self.tmpdir, 'gologin_'+self.profile_id+'.zip')
        self.profile_zip_path_upload = os.path.join(self.tmpdir, 'gologin_'+self.profile_id+'_upload.zip')
    
    def spawnBrowser(self):
        proxy = self.proxy
        proxy_host = ''
        if proxy:
            proxy_host = proxy.get('host')
            proxy = proxy['mode']+'://'+proxy['host']+':'+str(proxy['port'])
        tz = self.getTimeZone()
        params = [
        self.executablePath,
        '--remote-debugging-port='+str(self.port),
        '--user-data-dir='+self.profile_path, 
        '--password-store=basic', 
        '--tz='+tz, 
        '--gologin-profile='+self.profile_name, 
        '--lang=en', 
        ]    
        if proxy:
            hr_rules = '"MAP * 0.0.0.0 , EXCLUDE %s"'%(proxy_host);
            params.append('--proxy-server='+proxy);
            params.append('--host-resolver-rules='+hr_rules);

        for param in self.extra_params:
            params.append(param)

        if sys.platform == "darwin":
        	subprocess.Popen(params)
        else:
        	subprocess.Popen(params, start_new_session=True)

        try_count = 1
        url = str(self.address) + ':' + str(self.port)
        while try_count<100:
            try:
                data = requests.get('http://'+url+'/json').content
                break
            except:
                try_count += 1
                time.sleep(1)
        
        return url

    def start(self):
        self.createStartup()
        return self.spawnBrowser()

    def zipdir(self, path, ziph):
        for root, dirs, files in os.walk(path):
            for file in files:
                path = os.path.join(root, file)
                if not os.path.exists(path):
                    continue
                if stat.S_ISSOCK(os.stat(path).st_mode):
                    continue
                ziph.write(path, path.replace(self.profile_path, ''))

    def stop(self):
        self.sanitizeProfile()
        self.commitProfile()
        os.remove(self.profile_zip_path_upload)
        shutil.rmtree(self.profile_path)

    def commitProfile(self):
        zipf = zipfile.ZipFile(self.profile_zip_path_upload, 'w', zipfile.ZIP_DEFLATED)
        self.zipdir(self.profile_path, zipf)
        zipf.close()
        
        headers = {
            'Authorization': 'Bearer ' + self.access_token,
            'User-Agent': 'Selenium-API'
        }
        print('profile size=', os.stat(self.profile_zip_path_upload).st_size)

        signedUrl = requests.get(API_URL + '/browser/' + self.profile_id + '/storage-signature', headers=headers).content.decode('utf-8')

        # files = {
        #     'profile': open(self.profile_zip_path_upload, 'rb'),
        # }

        requests.put(signedUrl, data=open(self.profile_zip_path_upload, 'rb'))

        print('commit profile complete')



    def sanitizeProfile(self):
        remove_dirs = [
            'Default/Cache',
            'biahpgbdmdkfgndcmfiipgcebobojjkp',
            'afalakplffnnnlkncjhbmahjfjhmlkal',
            'cffkpbalmllkdoenhmdmpbkajipdjfam',
            'Dictionaries',
            'enkheaiicpeffbfgjiklngbpkilnbkoi',
            'oofiananboodjbbmdelgdommihjbkfag',
            'SingletonCookie',
            'SingletonLock',
            'SingletonSocket',
            'SafetyTips',
            'Default/Service Worker/CacheStorage',
            'Default/Code Cache',
            'Default/.org.chromium.Chromium.*'
        ]

        for d in remove_dirs:
            fpath = os.path.join(self.profile_path, d)
            if os.path.exists(fpath):
                try:
                    shutil.rmtree(fpath)
                except:
                    continue

    def getTimeZone(self):
        proxy = self.proxy
        if proxy:
            proxies = {proxy.get('mode'): proxy['mode']+'://'+proxy['host']+':'+str(proxy['port'])}
            data = requests.get('https://time.gologin.app', proxies=proxies)
        else:
            data = requests.get('https://time.gologin.app')
        return json.loads(data.content.decode('utf-8')).get('timezone')

    def downloadProfile(self):
        headers = {
            'Authorization': 'Bearer ' + self.access_token,
            'User-Agent': 'Selenium-API'
        }
        return json.loads(requests.get(API_URL + '/browser/'+self.profile_id, headers=headers).content.decode('utf-8'))

    def downloadProfileZip(self):
        s3path = self.profile.get('s3Path', '')
        data = ''
        if s3path=='':
            # print('downloading profile direct')
            headers = {
                'Authorization': 'Bearer ' + self.access_token,
                'User-Agent': 'Selenium-API'
            }
            data = requests.get(API_URL + '/browser/'+self.profile_id, headers=headers).content
        else:
            # print('downloading profile s3')
            s3url = 'https://s3.eu-central-1.amazonaws.com/gprofiles.gologin/' + s3path.replace(' ', '+');
            data = requests.get(s3url).content

        if len(data)==0:
            self.createEmptyProfile()            
        else:
            with open(self.profile_zip_path, 'wb') as f:
                f.write(data)
        
        try:
            self.extractProfileZip()
        except:
            self.createEmptyProfile()   
            self.extractProfileZip()

        if not os.path.exists(os.path.join(self.profile_path, 'Default/Preferences')):
            self.createEmptyProfile()   
            self.extractProfileZip()


    def createEmptyProfile(self):
        print('createEmptyProfile')
        empty_profile = '../gologin_zeroprofile.zip'
        if not os.path.exists(empty_profile):
            empty_profile = 'gologin_zeroprofile.zip'
        shutil.copy(empty_profile, self.profile_zip_path)

    def extractProfileZip(self):
        with zipfile.ZipFile(self.profile_zip_path, 'r') as zip_ref:
            zip_ref.extractall(self.profile_path)       
        os.remove(self.profile_zip_path)

    def convertPreferences(self, preferences):
        if preferences.get('navigator', {}).get('userAgent'):
            preferences['userAgent'] = preferences.get('navigator', {}).get('userAgent')

        if preferences.get('navigator', {}).get('doNotTrack'):
            preferences['doNotTrack'] = preferences.get('navigator', {}).get('doNotTrack')
        
        if preferences.get('navigator', {}).get('hardwareConcurrency'):
            preferences['hardwareConcurrency'] = preferences.get('navigator', {}).get('hardwareConcurrency')

        if preferences.get('navigator', {}).get('language'):
            preferences['language'] = preferences.get('navigator', {}).get('language')

        return preferences


    def updatePreferences(self):
        pref_file = os.path.join(self.profile_path, 'Default/Preferences')
        pfile = open(pref_file, 'r')
        preferences = json.load(pfile)    
        pfile.close()  
        profile = self.profile
        proxy = self.profile.get('proxy')
        # print('proxy=', proxy)
        if proxy and proxy.get('mode')=='gologin':
            autoProxyServer = profile.get('autoProxyServer')
            splittedAutoProxyServer = autoProxyServer.split('://')
            splittedProxyAddress = splittedAutoProxyServer[1].split(':')
            port = splittedProxyAddress[1];

            proxy = {
              'mode': 'http',
              'host': splittedProxyAddress[0],
              'port': port,
              'username': profile.get('autoProxyUsername'),
              'password': profile.get('autoProxyPassword'),
              'timezone': profile.get('autoProxyTimezone', 'us'),
            }
            
            profile['proxy']['username'] = profile.get('autoProxyUsername')
            profile['proxy']['password'] = profile.get('autoProxyPassword')
        
        if not proxy or proxy.get('mode')=='none':
            print('no proxy')
            proxy = None

        self.proxy = proxy
        self.profile_name = profile.get('name')
        if self.profile_name==None:
            print('empty profile name')
            print('profile=', profile)
            exit()
        gologin = self.convertPreferences(profile)
        preferences['gologin'] = gologin
        pfile = open(pref_file, 'w')
        json.dump(preferences, pfile)

    def createStartup(self):
        if os.path.exists(self.profile_path):
            shutil.rmtree(self.profile_path)
        self.profile = self.downloadProfile()
        self.downloadProfileZip()
        self.updatePreferences()
