import puppeteer from 'puppeteer-core';

import GoLogin from './gologin.js';
import { API_URL, FALLBACK_API_URL, getOsAdvanced } from './utils/common.js';
import { makeRequest } from './utils/http.js';

const trafficLimitMessage =
  'You dont have free traffic to use the proxy. Please go to app https://app.gologin.com/ and buy some traffic if you want to use the proxy';

export const getDefaultParams = () => ({
  token: process.env.GOLOGIN_API_TOKEN,
  profile_id: process.env.GOLOGIN_PROFILE_ID,
  executablePath: process.env.GOLOGIN_EXECUTABLE_PATH,
});

const createGologinProfileManager = ({ profileId, ...params }) => {
  const defaults = getDefaultParams();
  const mergedParams = {
    ...defaults,
    ...params,
  };

  mergedParams.profile_id = profileId ?? mergedParams.profile_id;

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
      defaultViewport: null,
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
      if (params.cloud) {
        return launchCloudProfile(params);
      }

      return launchLocal(params);
    },

    async createProfileWithCustomParams(options) {
      const response = await makeRequest(`${API_URL}/browser/custom`, {
        method: 'POST',
        json: options,
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/custom` });

      return response.id;
    },

    async refreshProfilesFingerprint(profileIds) {
      if (!profileIds) {
        throw new Error('Profile ID is required');
      }

      const response = await makeRequest(`${API_URL}/browser/fingerprints`, {
        method: 'PATCH',
        json: { browsersIds: profileIds },
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/fingerprints` });

      return response;
    },

    async createProfileRandomFingerprint(name = '') {
      const osInfo = await getOsAdvanced();
      const { os, osSpec } = osInfo;
      const resultName = name || 'api-generated';

      const response = await makeRequest(`${API_URL}/browser/quick`, {
        method: 'POST',
        json: {
          os,
          osSpec,
          name: resultName,
        },
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/quick` });

      return response;
    },

    async updateUserAgentToLatestBrowser(profileIds, workspaceId = '') {
      let url = `${API_URL}/browser/update_ua_to_new_browser_v`;
      if (workspaceId) {
        url += `?currentWorkspace=${workspaceId}`;
      }

      const response = await makeRequest(url, {
        method: 'PATCH',
        json: { browserIds: profileIds, updateUaToNewBrowserV: true, updateAllProfiles: false, testOrbita: false },
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/update_ua_to_new_browser_v` });

      return response;
    },

    async changeProfileProxy(profileId, proxyData) {
      const response = await makeRequest(`${API_URL}/browser/${profileId}/proxy`, {
        method: 'PATCH',
        json: proxyData,
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/proxy` });

      return response;
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
        const availableTraffic = await makeRequest(`${API_URL}/users-proxies/geolocation/traffic`, {
          method: 'GET',
        }, { token, fallbackUrl: `${FALLBACK_API_URL}/users-proxies/geolocation/traffic` });

        const availableTrafficData = availableTraffic;
        const availableType = this.getAvailableType(availableTrafficData);
        if (availableType === 'none') {
          throw new Error(trafficLimitMessage);
        }

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

      const proxyResponse = await makeRequest(`${API_URL}/users-proxies/mobile-proxy`, {
        method: 'POST',
        json: {
          countryCode,
          isDc,
          isMobile,
          profileIdToLink: profileId,
        },
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/users-proxies/mobile-proxy` });

      const proxy = proxyResponse;
      if (proxy.trafficLimitBytes < proxy.trafficUsedBytes) {
        throw new Error(trafficLimitMessage);
      }

      return proxy;
    },

    async addCookiesToProfile(profileId, cookies) {
      const response = await makeRequest(`${API_URL}/browser/${profileId}/cookies?fromUser=true`, {
        method: 'POST',
        json: cookies,
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/cookies?fromUser=true` });

      return response.status;
    },

    async deleteProfile(profileId) {
      const response = await makeRequest(`${API_URL}/browser/${profileId}`, {
        method: 'DELETE',
      }, { token, fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}` });

      return response.status;
    },

    async exit() {
      await Promise.allSettled(browsers.map((browser) => browser.close()));
      await Promise.allSettled(
        legacyGls.map((gl) => gl.stopLocal({ posting: true })),
      );
      await Promise.allSettled(
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
