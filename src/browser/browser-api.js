import { API_URL, FALLBACK_API_URL } from '../utils/common.js';
import { makeRequest } from '../utils/http.js';

// Minimum interval (ms) enforced between identical profile update calls to
// prevent the SDK's built-in retries from amplifying request volume.
const RATE_LIMIT_WINDOW_MS = 1000;
const lastRequestAtByKey = new Map();

const throttle = (key) => {
  const now = Date.now();
  const nextAllowedAt = (lastRequestAtByKey.get(key) || 0) + RATE_LIMIT_WINDOW_MS;
  const waitMs = Math.max(0, nextAllowedAt - now);
  lastRequestAtByKey.set(key, now + waitMs);

  return new Promise((resolve) => setTimeout(resolve, waitMs));
};

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} resolution
*/
export const updateProfileResolution = (profileId, ACCESS_TOKEN, resolution) =>
  throttle(`resolution:${profileId}`).then(() => makeRequest(`${API_URL}/browser/${profileId}/resolution`, {
    method: 'PATCH',
    json: { resolution },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/resolution`,
  })).catch((e) => {
    console.log(e);

    return { body: [] };
  });

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} userAgent
*/
export const updateProfileUserAgent = (profileId, ACCESS_TOKEN, userAgent) =>
  throttle(`ua:${profileId}`).then(() => makeRequest(`${API_URL}/browser/${profileId}/ua`, {
    method: 'PATCH',
    json: { userAgent },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/ua`,
  })).catch((e) => {
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
  throttle(`proxy:${profileId}`).then(() => makeRequest(`${API_URL}/browser/${profileId}/proxy`, {
    method: 'PATCH',
    json: browserProxyData,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }, {
    token: ACCESS_TOKEN,
    fallbackUrl: `${FALLBACK_API_URL}/browser/${profileId}/proxy`,
  })).catch((e) => {
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

  await throttle(`bookmarks:${[].concat(profileIds).join(',')}`);

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

