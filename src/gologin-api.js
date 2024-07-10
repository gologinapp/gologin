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
  const browsers = [];
  const legacyGls = [];

  const launchLocal = async (params) => {
    const legacyGologin = createLegacyGologin(params);
    const started = await legacyGologin.startLocal();
    const browser = await puppeteer.connect({
      browserWSEndpoint: started.wsUrl,
      ignoreHTTPSErrors: true,
    });
    browsers.push(browser);
    legacyGls.push(legacyGologin);
    return { browser };
  };

  const launchCloudProfile = async (params) => {
    const profileParam = params.profile_id
      ? `&profile=${params.profile_id}`
      : '';
    const geolocationParam = params.geolocation
      ? `&geolocation=${params.geolocation}`
      : '';
    const browserWSEndpoint = `https://cloud.gologin.com/connect?token=${token}${profileParam}${geolocationParam}`;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      ignoreHTTPSErrors: true,
    });
    browsers.push(browser);
    return { browser };
  };

  return {
    async launch(params = {}) {
      if (params.cloud) {
        return await launchCloudProfile(params);
      }
      if (params.profile_id || params.geolocation) {
        return await launchLocal(params);
      }
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
