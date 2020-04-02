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
