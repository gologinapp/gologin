import puppeteer from 'puppeteer-core';

import GoLogin from './src/gologin.js';

const token = 'yU0token';
const profile_id = 'yU0Pr0f1leiD';

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
