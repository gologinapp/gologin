import puppeteer from 'puppeteer-core';

import GoLogin from './src/gologin.js';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NmNlYmRmZTZiMjRjN2Q3NDE0MmU4NDIiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2NmNlYmUxYjI4ODY5MzhmNGNhOWMxZjIifQ.cqTFBtIuyC8QVQwb3d-VgzJObYu7BB7uS_n-enNxWw4';
const profile_id = 'damp-snowflake';

(async () => {
  const GL = new GoLogin({
    token,
    profile_id,
  });

  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);

    return { status: 'failure' };
  });

  if (status !== 'success') {
    console.log('Invalid status');

    return;
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.toString(),
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.goto('https://myip.link/mini');
  console.log(await page.content());
  await browser.close();
  await GL.stop();
})();
