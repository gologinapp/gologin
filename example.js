import pkg from 'puppeteer-core';

import GoLogin from './gologin.js';

const { connect } = pkg;

(async () => {
  const GL = new GoLogin({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzhkZjYwMzEyMWNiM2JjNTU2NWU4OWQiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzkyZWM0OTIxOWU2NzViODNmZGE1NDgifQ._Gw5KO7JGO5Fdh5B0UelM9ggR-hYg6ORvHIyZx1OBN8',
    profile_id: '638f5cdb47572bd46afc0478',
  });

  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);

    return { status: 'failure' };
  });

  if (status !== 'success') {
    console.log('Invalid status');

    return;
  }

  const browser = await connect({
    browserWSEndpoint: wsUrl.toString(),
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.goto('https://myip.link/mini');
  console.log(await page.content());
  await browser.close();
  await GL.stop();
})();
