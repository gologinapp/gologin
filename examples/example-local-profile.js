import puppeteer from 'puppeteer-core';

import GoLogin from '../src/gologin.js';

const { connect } = puppeteer;

(async () => {
  const GL = new GoLogin({
    token: 'yU0token',
    profile_id: 'yU0Pr0f1leiD',
    executablePath: '/usr/bin/orbita-browser/chrome',
    tmpdir: '/my/tmp/dir',
  });

  const wsUrl = await GL.startLocal();
  const browser = await connect({
    browserWSEndpoint: wsUrl.toString(),
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.goto('https://myip.link');
  console.log(await page.content());
  await browser.close();
  await GL.stopLocal({ posting: false });
})();
