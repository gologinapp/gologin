# class GoLogin - class for working with gologin.app API

## Getting Started

### Installation

`npm install https://github.com/gologinapp/gologin.git`

for running example.js install puppeteer-core

`npm install puppeteer-core`

### Methods

#### constructor

- `options` <[Object]> Options for profile
	- `token` <[string]> your API token
	- `profile_id` <[string]> profile ID
	- `executablePath` <[string]> path to Orbita browser
	- `vncPort` <[integer]> port of VNC server if you using it


![Token API in Settings](https://user-images.githubusercontent.com/62306291/78453427-53220100-769a-11ea-9465-0aae3ae602b7.jpg)

```js
const GoLogin = require('./gologin');
const GL = new GoLogin({
    token: 'yU0token',
    profile_id: 'yU0Pr0f1leiD',
    executablePath: '/usr/bin/orbita-browser/chrome',
});
```



#### start()  

- returns: string 

starting browser with profile id, returning WebSocket url for puppeteer

#### stop()  

stoppin browser with profile id

#### create(options)  

- `options` <[Object]> Options for profile
	- `name` <[string]> name of new profile

create new profile

#### update(options)  

- `options` <[Object]> Options for profile
	- `name` <[string]> profile name
{
  "name": "string",
  "notes": "string",
  "browserType": "chrome",
  "os": "lin",
  "startUrl": "string",
  "googleServicesEnabled": false,
  "lockEnabled": false,
  "navigator": {
    "userAgent": "string",
    "resolution": "string",
    "language": "string",
    "platform": "string",
    "doNotTrack": false,
    "hardwareConcurrency": 0
  },
  "storage": {
    "local": true,
    "extensions": true,
    "bookmarks": true,
    "history": true,
    "passwords": true
  },
  "proxyEnabled": false,
  "proxy": {
    "mode": "gologin",
    "host": "string",
    "port": 0,
    "username": "string",
    "password": "string",
    "autoProxyRegion": "string"
  },
  "dns": "string",
  "plugins": {
    "enableVulnerable": true,
    "enableFlash": true
  },
  "timezone": {
    "enabled": true,
    "fillBasedOnIp": true,
    "timezone": "string"
  },
  "geolocation": {
    "mode": "prompt",
    "enabled": true,
    "customize": true,
    "fillBasedOnIp": true
  },
  "audioContext": {
    "mode": "off",
    "noise": 0
  },
  "canvas": {
    "mode": "off",
    "noise": 0
  },
  "fonts": {
    "families": [
      "string"
    ],
    "enableMasking": true,
    "enableDomRect": true
  },
  "mediaDevices": {
    "videoInputs": 0,
    "audioInputs": 0,
    "audioOutputs": 0,
    "enableMasking": false
  },
  "webRTC": {
    "mode": "alerted",
    "enabled": true,
    "customize": true,
    "fillBasedOnIp": true,
    "publicIp": "string",
    "localIps": [
      "string"
    ]
  },
  "webGL": {
    "mode": "noise",
    "getClientRectsNoise": 0,
    "noise": 0
  },
  "webGLMetadata": {
    "mode": "mask",
    "vendor": "string",
    "renderer": "string"
  },
  "extensions": {
    "enabled": true,
    "preloadCustom": true,
    "names": [
      "string"
    ]
  },
  "profile": "string",
  "googleClientId": "string"
}
update profile data

#### delete()  

delete profile


### example.js 

```js
const puppeteer = require('puppeteer-core');
const GoLogin = require('./gologin');

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
        profile_id: 'yU0Pr0f1leiD',
        executablePath: '/usr/bin/orbita-browser/chrome',
    });

    const wsUrl = await GL.start(); 

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl.toString(), 
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto('https://myip.gologin.app/mini');   
    console.log(await page.content());
    await browser.close();
    await GL.stop();
})();
```

Running example:

`DEBUG=gologin* node example.js`

