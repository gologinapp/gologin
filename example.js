import puppeteer from 'puppeteer-core';

import GoLogin from './src/gologin.js';

(async () => {
  const GL = new GoLogin({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzRkNTM4ZjAyYTBlOTEyMWIzMTNiMzEiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2Mzk3MzM5N2U4YjU4NDYwYzZkZjNkZjQifQ.COw0T6Ozo3LJ9UyBgP3UB3lykY3EYPcKA8NQGptynjs',
    profile_id: '63986ec929ed7c73f0020ef5',
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
  // await page.goto('https://myip.link/mini');
  // console.log(await page.content());
  // await browser.close();
  // await GL.stop();
})();
