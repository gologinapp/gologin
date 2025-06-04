import { get as _get } from 'https';
import requests from 'requestretry';

const TIMEZONE_URL = 'https://geo.myip.link';

export const makeRequest = async (url, options, internalOptions) => {
  options.headers = {
    ...options.headers,
    'User-Agent': 'gologin-nodejs-sdk',
  };

  if (internalOptions?.token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${internalOptions.token}`,
    };
  }

  const attemptRequest = async (requestUrl) => {
    const { body } = await requests(requestUrl, options);

    if (body.statusCode >= 400) {
      throw new Error(body.body);
    }

    return body;
  };

  try {
    return await attemptRequest(url);
  } catch (error) {
    if (internalOptions?.fallbackUrl) {
      return await attemptRequest(internalOptions.fallbackUrl);
    }

    throw error;
  }
};

export const checkSocksProxy = async (agent) => new Promise((resolve, reject) => {
  _get(TIMEZONE_URL, { agent, timeout: 10000 }, (res) => {
    let resultResponse = '';
    res.on('data', (data) => {
      resultResponse += data;
    });

    res.on('end', () => {
      resolve({
        ...res,
        body: JSON.parse(resultResponse),
      });
    });
  }).on('error', (err) => reject(err));
});
