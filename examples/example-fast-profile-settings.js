import puppeteer from 'puppeteer-core';

import { updateProfileProxy, updateProfileResolution, updateProfileUserAgent } from '../src/browser/browser-api.js';
import GoLogin from '../src/gologin.js';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzRkNTM4ZjAyYTBlOTEyMWIzMTNiMzEiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2Mzk4OGE2MjcwN2UzM2IxYTQwOTVmY2EifQ.Tj7GG63CCLWOhHnQB3uUnIV_fE3hBf6JFooq--7zpWw';
const profile_id = '63986ec929ed7c73f0020ef5';

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
  const updatedRes = await updateProfileProxy(profile_id, token, { mode: 'tor', torProxyRegion: 'us' });
  console.log(updatedRes);

  await page.goto('https://myip.link/mini');
  console.log(await page.content());

  /**
   * @see updateProfileProxy
   */
  const proxyData = {
    mode: 'none',
  };

  await GL.changeProfileProxy(proxyData);

  await GL.changeProfileResolution('1920x1080');

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.71 Safari/537.36';
  await GL.changeProfileUserAgent(userAgent);

  await browser.close();
  await GL.stop();
})();

(async () => {

  /**
   * @see updateProfileProxy
   */
  const proxyData = {
    mode: 'none',
  };

  await updateProfileProxy(profile_id, token, proxyData);

  await updateProfileResolution(profile_id, token, '1920x1080');

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.71 Safari/537.36';
  await updateProfileUserAgent(profile_id, token, userAgent);
})();
