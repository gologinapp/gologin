const puppeteer = require('puppeteer-core');
const GoLogin = require('./gologin');

(async () => {
  const GL = new GoLogin({
    token: 'yU0token',
    profile_id: 'yU0Pr0f1leiD',
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
