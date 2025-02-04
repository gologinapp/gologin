// Usage example: in the terminal enter
// node example-amazon-cloud-browser.js yU0token yU0Pr0f1leiD

// your token api (located in the settings, api)
// https://github.com/gologinapp/gologin#usage

import puppeteer from 'puppeteer-core';

const [_execPath, _filePath] = process.argv;
const GOLOGIN_API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzczNmY5N2YxZjBhMjBjNjI5NTVlYzIiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2NzkwYzQ1ZTBjNTA1NzA0MmJlYTE1ZDAifQ.YcTJy--42-FjeuWdx5tSlPiGq7LP_QPXowOmm2WVT7g';
const GOLOGIN_PROFILE_ID = '67a12a9fb20c1fdd8921a165';

(async () => {
  const browser = await puppeteer.connect({
    browserWSEndpoint: `https://cloudbrowser.gologin.com/connect?token=${GOLOGIN_API_TOKEN}&profile=${GOLOGIN_PROFILE_ID}`,
    ignoreHTTPSErrors: true,
  }).catch(console.log);

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

  await new Promise(resolve => setTimeout(resolve, 120000));
  console.log('stopping browser');
  await fetch(`https://api.gologin.com/browser/${GOLOGIN_PROFILE_ID}/web`, {
    headers: {
      'Authorization': `Bearer ${GOLOGIN_API_TOKEN}`,
    },
    method: 'DELETE',
  });

  console.log('browser stopped');
})();
