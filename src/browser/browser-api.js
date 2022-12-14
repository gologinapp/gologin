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
