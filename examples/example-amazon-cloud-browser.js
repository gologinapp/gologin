// Usage example: in the terminal enter
// node example-amazon-cloud-browser.js yU0token yU0Pr0f1leiD

// your token api (located in the settings, api)
// https://github.com/gologinapp/gologin#usage

import GoLogin from 'gologin';
import puppeteer from 'puppeteer-core';

const [_execPath, _filePath, GOLOGIN_API_TOKEN, GOLOGIN_PROFILE_ID] = process.argv;

(async () => {
  const GL = new GoLogin({
    token: GOLOGIN_API_TOKEN,
    profile_id: GOLOGIN_PROFILE_ID,
  });

  const browser = await puppeteer.connect({
    browserWSEndpoint: `https://cloudbrowser.gologin.com/connect?token=${GOLOGIN_API_TOKEN}&profile=${GOLOGIN_PROFILE_ID}`,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();

  await page.goto('https://www.amazon.com/-/dp/B0771V1JZX');
  const content = await page.content();
  const matchData = content.match(/'initial': (.*)}/);
  if (matchData === null || matchData.length === 0){
    console.log('no images found');
  } else {
    const data = JSON.parse(matchData[1]);
    const images = data.map(e => e.hiRes);
    console.log('images=', images);
  }

  await GL.stopRemote();
})();
