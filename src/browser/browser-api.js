import { API_URL, FALLBACK_API_URL } from '../utils/common.js';
import { makeRequest } from '../utils/http.js';

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} resolution
*/
export const updateProfileResolution = (profileId, ACCESS_TOKEN, resolution) =>
  makeRequest(`${API_URL}/browser/${profileId}/resolution`, {
    method: 'PATCH',
    json: { resolution },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/resolution`,
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
  makeRequest(`${API_URL}/browser/${profileId}/ua`, {
    method: 'PATCH',
    json: { userAgent },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/ua`,
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
  makeRequest(`${API_URL}/browser/${profileId}/proxy`, {
    method: 'PATCH',
    json: browserProxyData,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/proxy`,
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

  return makeRequest(`${API_URL}/browser/bookmarks/many`, {
    method: 'PATCH',
    json: params,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/bookmarks/many`,
  }).catch((error) => console.log(error));
};

