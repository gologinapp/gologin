import puppeteer from 'puppeteer-core';
import GoLogin from './gologin.js';

export function getDefaultParams() {
  return {
    token: process.env.GL_API_TOKEN,
    profile_id: process.env.GL_PROFILE_ID,
    executablePath: process.env.GL_EXECUTABLE_PATH,
  };
}

const createLegacyGologin = (params) => {
  const defaults = getDefaultParams();
  return new GoLogin({
    ...defaults,
    ...params,
  });
};

export const delay = (ms = 250) => new Promise((res) => setTimeout(res, ms));

export function GologinApi({ token }) {
  if (!token) {
    throw new Error('GoLogin API token is missing');
  }
  let browsers = [];
  let legacyGls = [];

  const launchLocal = async (params) => {
    console.log('launchExistingProfile', params);
    const legacyGologin = createLegacyGologin(params);
    const started = await legacyGologin.startLocal();
    console.debug({ started });
    const browser = await puppeteer.connect({
      browserWSEndpoint: started.wsUrl,
      ignoreHTTPSErrors: true,
    });
    browsers.push(browser);
    return browser;
  };

  const launchCloudProfile = async (params) => {
    console.log('launchCloudProfile', params);
    const profileParam = params.profile_id
      ? `&profile=${params.profile_id}`
      : '';
    const geolocationParam = params.geolocation
      ? `&geolocation=${params.geolocation}`
      : '';
    const browserWSEndpoint = `https://cloud.gologin.com/connect?token=${token}${profileParam}${geolocationParam}`;
    console.debug(browserWSEndpoint);
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      ignoreHTTPSErrors: true,
    });
    browsers.push(browser);
    return browser;
  };

  return {
    /**
     * @param params
     * @param {boolean} params.headless default false
     * @param {boolean} params.cloud default false
     * @returns browser
     */
    async launch(params = {}) {
      console.log('launch', params);
      if (params.cloud) {
        return await launchCloudProfile(params);
      }
      if (params.profile_id) {
        return await launchLocal(params);
      }
      if (params.geolocation) {
        return await launchLocal(params);
      }
    },

    async page(url, params) {
      let browser = await this.launch();
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2' });
      return { page, browser, session };
    },

    async exit(status = 0) {
      Promise.allSettled(browsers.map((browser) => browser.close()));
      Promise.allSettled(
        legacyGls.map((gl) => gl.stopLocal({ posting: false })),
      );
      process.exit(status);
    },

    delay,
  };
}
