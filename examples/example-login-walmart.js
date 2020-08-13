const puppeteer = require('puppeteer-core');
const GoLogin = require('../gologin');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () =>{
    const GL = new GoLogin({
        profile_id: '5eef762508f527445e8f0f5f',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZTFjOWIwZTc5MmEyMDQ5MjhhZDU3ZDAiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI1ZTkwZDViYTZiNmE5YTRjZGI2ODc1YTgifQ.jbQ-iuojv6Vijt82i7LrOBy46b4Kpxir5-E9sXntrqY',
        executablePath: '/usr/bin/orbita-browser/chrome',
    });

    const wsUrl = await GL.start(); 
    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl, 
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto('https://www.walmart.com/account/profile'); 
    if( await page.evaluate((e)=>document.querySelector('#email')) ){
        // need login
        await page.type('#email', 'mixolap@gmail.com');
        await page.type('#password', '1q2w3e');
        await page.click('[type=submit]');
    } 
    
    await page.goto('https://www.walmart.com/account/wmpurchasehistory');
    await page.screenshot({path: 'screenshot.jpg'});
    await browser.close();
    await GL.stop();
})();
