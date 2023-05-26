import requestretry from 'requestretry';

import { API_URL } from '../utils/common.js';

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} resolution
*/
export const updateProfileResolution = (profileId, ACCESS_TOKEN, resolution) =>
  requestretry.patch(`${API_URL}/browser/${profileId}/resolution`, {
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

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} userAgent
*/
export const updateProfileUserAgent = (profileId, ACCESS_TOKEN, userAgent) =>
  requestretry.patch(`${API_URL}/browser/${profileId}/ua`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: { userAgent },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {Object} browserProxyData
  * @param {'http' | 'socks4' | 'socks5' | 'none'} browserProxyData.mode
  * @param {string} [browserProxyData.host]
  * @param {string} [browserProxyData.port]
  * @param {string} [browserProxyData.username]
  * @param {string} [browserProxyData.password]
*/
export const updateProfileProxy = (profileId, ACCESS_TOKEN, browserProxyData) =>
  requestretry.patch(`${API_URL}/browser/${profileId}/proxy`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: browserProxyData,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {Object} bookmarks
*/
export const updateProfileBookmarks = async (profileIds, ACCESS_TOKEN, bookmarks) => {
  const params = {
    profileIds,
    bookmarks,
  };

  return requestretry.patch(`${API_URL}/browser/bookmarks/many`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: params,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((error) => console.log(error));
};

