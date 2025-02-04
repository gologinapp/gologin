// import { spawn } from 'child_process';
import os from 'os';

// import { connect } from 'puppeteer-core';
import GoLogin from './src/gologin.js';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzczNmY5N2YxZjBhMjBjNjI5NTVlYzIiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2NzkwYzQ1ZTBjNTA1NzA0MmJlYTE1ZDAifQ.YcTJy--42-FjeuWdx5tSlPiGq7LP_QPXowOmm2WVT7g';
const profile_id = '67a1f8fa6b01ccb71bd14563';

(async () => {
  const GL = new GoLogin({
    token,
  });

  // const profile_id = await GL.create({
  //   name: 'profile_gmail',
  //   os: 'win',
  //   navigator: {
  //     userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  //     resolution: '1280x720',
  //     language: 'en-GB,en-US;q=0.9,en;q=0.8',
  //     hardwareConcurrency: 8,
  //     deviceMemory: 8,
  //     maxTouchPoints: 5,
  //   },
  //   proxy: {
  //     mode: 'http',
  //     host: '',
  //     port: '',
  //     username: '',
  //     password: '',
  //   },
  // });

  console.log('profile id=', profile_id);
  GL.setProfileId(profile_id);

  const { status, wsUrl } = await GL.start();
  // const browser = await connect({
  //   browserWSEndpoint: wsUrl.toString(),
  //   ignoreHTTPSErrors: true,
  // });

  // if (status !== 'success') {
  //   console.error('Failed to start GoLogin profile');

  //   return;
  // }

  // const page = await browser.newPage();

  // Step 1: Log in to the site
  // const LOGIN_URL = 'https://the-internet.herokuapp.com/login';
  // const USERNAME = 'tomsmith'; // Provided by the test site
  // const PASSWORD = 'SuperSecretPassword!'; // Provided by the test site

  // await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });

  // // Automate filling in the username and password fields
  // await page.type('#username', USERNAME);
  // await page.type('#password', PASSWORD);

  // // Submit the login form
  // await page.click('button[type="submit"]');
  // await new Promise(r => setTimeout(r, 2000));
  // // Confirm login success by checking for a specific element or text
  // const loginSuccess = await page.evaluate(() =>
  //   document.body.textContent.includes('You logged into a secure area!'),
  // );

  // console.log('Login successful:', loginSuccess);

  // Save cookies after login
  // const cookies = await page.cookies();
  // console.log('Cookies after login:', cookies);
  await new Promise(r => setTimeout(r, 120000));

  // await browser.close();
  await GL.stop();
})();

console.log(os.version());
