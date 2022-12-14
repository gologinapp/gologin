import requestretry from 'requestretry';

import { API_URL } from '../utils/common.js';

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} resolution
*/
export const updateProfileResolution = async (profileId, ACCESS_TOKEN, resolution) => {
  await requestretry.patch(`${API_URL}/browser/${profileId}/resolution`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: { resolution },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });
};

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {Object} browserData
  * @param {string} [browserData._id]
  * @param {'gologin' | 'http' | 'socks4' | 'socks5' | 'possh' | 'tor' | 'geolocation' | 'none'} browserData.mode
  * @param {string} [browserData.host]
  * @param {string} [browserData.port]
  * @param {string} [browserData.username]
  * @param {string} [browserData.password]
  * @param {string} [browserData.changeIpUrl]
  * @param {'us' | 'ca' | 'uk' | 'de' | 'in'} [browserData.autoProxyRegion]
  * @param {'us' | 'uk' | 'de' | 'fr' | 'eu'} [browserData.torProxyRegion]
*/
export const updateProfileProxy = async (profileId, ACCESS_TOKEN, browserData) => {
  await requestretry.patch(`${API_URL}/browser/${profileId}/proxy`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: browserData,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });
};

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {Object} data
  * @param {string} data.userAgent
  * @param {string} [data.updateUALastChosenBrowserV]
*/
export const updateProfileUserAgent = async (profileId, ACCESS_TOKEN, data) => {
  await requestretry.patch(`${API_URL}/browser/${profileId}/ua`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: data,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });
};
