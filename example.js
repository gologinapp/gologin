const puppeteer = require('puppeteer');
const GoLogin = require('./gologin');

async function makeScreenshot() {
  const options = {
    token: 'yU0token',
    profile_id: 'yU0Pr0f1leiD',
    executablePath: '/usr/bin/orbita-browser/chrome',
  }

  const GL = new GoLogin(options);
  const wsUrl = await GL.start();  

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.toString(), 
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  const url = 'https://myip.gologin.app/';
  await page.goto(url.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }); 
  await page.screenshot({
    path: 'screenshot.jpg', 
    fullPage: true, 
    quality: 100, 
    type: 'jpeg',
  })
  await browser.close();
  await browser.disconnect();
  await GL.start();
}

makeScreenshot();
