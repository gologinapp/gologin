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

