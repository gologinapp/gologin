const puppeteer = require('puppeteer');
const GoLogin = require('./gologin');

async function makeScreenshot() {
	const options = {
		username: 'username@gologin.app',
		password: 'passw0rd',
		profile_id: 'yU0Pr0f1leiD',
	}

	const GL = new GoLogin(options);
	const wsUrl = await GL.startBrowser();	

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
	await GL.stopBrowser();
}

makeScreenshot();
