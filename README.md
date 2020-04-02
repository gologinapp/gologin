# class GoLogin - class for working with gologin.app API

## Getting Started

### Installation




Requirements

Constructor available options: 

`token` - token

`profile_id` - profile id

`vnc_port` - vnc port for launching Orbita browser

`executablePath` - vnc port for launching Orbita browser


Methods:

`start`  - starting browser with profile id, returning wsUrl for puppeteer

`stop`  - stoppin browser with profile id

`create`  - create new profile

`update`  - update profile data

`delete`  - delete profile


*** example.js ***

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

