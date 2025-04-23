import puppeteer from 'puppeteer-core';

import GoLogin from './gologin.js';
import { API_URL, getOsAdvanced } from './utils/common.js';

const trafficLimitMessage =
  'You dont have free traffic to use the proxy. Please go to app https://app.gologin.com/ and buy some traffic if you want to use the proxy';

export const getDefaultParams = () => ({
  token: process.env.GOLOGIN_API_TOKEN,
  profile_id: process.env.GOLOGIN_PROFILE_ID,
  executablePath: process.env.GOLOGIN_EXECUTABLE_PATH,
  autoUpdateBrowser: true,
});

const createGologinProfileManager = ({ profileId, ...params }) => {
  console.log({ params });
  const defaults = getDefaultParams();
  const mergedParams = {
    ...defaults,
    ...params,
  };

  mergedParams.profile_id = profileId ?? mergedParams.profile_id;

  console.log({ mergedParams });

  return new GoLogin(mergedParams);
};

const createdApis = [];

export const GologinApi = ({ token }) => {
  if (!token) {
    throw new Error('GoLogin API token is missing');
  }

  const browsers = [];
  const legacyGls = [];

  const launchLocal = async (params) => {
    const legacyGologin = createGologinProfileManager({
      ...params,
      token,
    });

    if (!params.profileId) {
      const { id } = await legacyGologin.quickCreateProfile();
      await legacyGologin.setProfileId(id);
    }

    const startedProfile = await legacyGologin.start();
    const browser = await puppeteer.connect({
      browserWSEndpoint: startedProfile.wsUrl,
      ignoreHTTPSErrors: true,
    });

    browsers.push(browser);
    legacyGls.push(legacyGologin);

    return { browser };
  };

  const launchCloudProfile = async (params) => {
    const legacyGologin = createGologinProfileManager({
      ...params,
      token,
    });

    if (!params.profileId) {
      const { id } = await legacyGologin.quickCreateProfile();
      await legacyGologin.setProfileId(id);
      params.profileId = id;
    }

    legacyGls.push(legacyGologin);

    const browserWSEndpoint = `https://cloudbrowser.gologin.com/connect?token=${token}&profile=${params.profileId}`;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      ignoreHTTPSErrors: true,
    });

    browsers.push(browser);

    return { browser };
  };

  const api = {
    async launch(params = {}) {
      console.log();
      if (params.cloud) {
        return launchCloudProfile(params);
      }

      return launchLocal(params);
    },

    async createProfileWithCustomParams(options) {
      const response = await fetch(`${API_URL}/browser/custom`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'gologin-api',
        },
        body: JSON.stringify(options),
      });

      if (response.status === 400) {
        throw new Error(`gologin failed account creation with status code, ${response.status} DATA  ${JSON.stringify(await response.json())}`);
      }

      if (response.status === 500) {
        throw new Error(`gologin failed account creation with status code, ${response.status}`);
      }

      const profile = await response.json();

      return profile.id;
    },

    async refreshProfilesFingerprint(profileIds) {
      if (!profileIds) {
        throw new Error('Profile ID is required');
      }

      const response = await fetch(`${API_URL}/browser/fingerprints`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'gologin-api',
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
        body: JSON.stringify({ browsersIds: profileIds }),
      });

      return response.json();
    },

    async createProfileRandomFingerprint(name = '') {
      const osInfo = await getOsAdvanced();
      const { os, osSpec } = osInfo;
      const resultName = name || 'api-generated';

      const response = await fetch(`${API_URL}/browser/quick`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'gologin-api',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          os,
          osSpec,
          name: resultName,
        }),
      });

      return response.json();
    },

    async updateUserAgentToLatestBrowser(profileIds, workspaceId = '') {
      let url = `${API_URL}/browser/update_ua_to_new_browser_v`;
      if (workspaceId) {
        url += `?currentWorkspace=${workspaceId}`;
      }

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'gologin-api',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ browserIds: profileIds, updateUaToNewBrowserV: true, updateAllProfiles: false, testOrbita: false }),
      });

      return response.json();
    },

    async changeProfileProxy(profileId, proxyData) {
      console.log(proxyData);
      const response = await fetch(`${API_URL}/browser/${profileId}/proxy`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'user-agent': 'gologin-api',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(proxyData),
      });

      return response.status;
    },

    getAvailableType(availableTrafficData) {
      switch (true) {
        case availableTrafficData.mobileTrafficData.trafficUsedBytes > availableTrafficData.mobileTrafficData.trafficLimitBytes:
          return 'mobile';
        case availableTrafficData.residentialTrafficData.trafficUsedBytes < availableTrafficData.residentialTrafficData.trafficLimitBytes:
          return 'resident';
        case availableTrafficData.dataCenterTrafficData.trafficUsedBytes < availableTrafficData.dataCenterTrafficData.trafficLimitBytes:
          return 'dataCenter';
        default:
          return 'none';
      }
    },

    async addGologinProxyToProfile(profileId, countryCode, proxyType = '') {
      if (!proxyType) {
        const availableTraffic = await fetch(`${API_URL}/users-proxies/geolocation/traffic`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'user-agent': 'gologin-api',
            'Content-Type': 'application/json',
          },
        });

        const availableTrafficData = await availableTraffic.json();
        console.log(availableTrafficData);
        const availableType = this.getAvailableType(availableTrafficData);
        if (availableType === 'none') {
          throw new Error(trafficLimitMessage);
        }

        console.log(availableType);
        proxyType = availableType;
      }

      let isDc = false;
      let isMobile = false;

      switch (proxyType) {
        case 'mobile':
          isMobile = true;
          isDc = false;
          break;
        case 'resident':
          isMobile = false;
          isDc = false;
          break;
        case 'dataCenter':
          isMobile = false;
          isDc = true;
          break;
        default:
          throw new Error('Invalid proxy type');
      }

      const proxyResponse = await fetch(`${API_URL}/users-proxies/mobile-proxy`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'user-agent': 'gologin-api',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({
          countryCode,
          isDc,
          isMobile,
          profileIdToLink: profileId,
        }),
      });

      const proxy = await proxyResponse.json();
      if (proxy.trafficLimitBytes < proxy.trafficUsedBytes) {
        throw new Error(trafficLimitMessage);
      }

      return proxy;
    },

    async addCookiesToProfile(profileId, cookies) {
      const response = await fetch(`${API_URL}/browser/${profileId}/cookies?fromUser=true`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'user-agent': 'gologin-api',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cookies),
      });

      return response.status;
    },

    async deleteProfile(profileId) {
      const response = await fetch(`${API_URL}/browser/${profileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'user-agent': 'gologin-api',
        },
      });

      return response.status;
    },

    async exit() {
      Promise.allSettled(browsers.map((browser) => browser.close()));
      Promise.allSettled(
        legacyGls.map((gl) => gl.stopLocal({ posting: false })),
      );
      Promise.allSettled(
        legacyGls.map((gl) => gl.stopRemote({ posting: true })),
      );
    },
  };

  createdApis.push(api);

  return api;
};

export function exitAll() {
  Promise.allSettled(createdApis.map((api) => api.exit()));
}
