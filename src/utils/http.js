import { get as _get } from 'https';
import requests from 'requestretry';

const TIMEZONE_URL = 'https://geo.myip.link';

const attemptRequest = async (requestUrl, options) => {
  const req = await requests(requestUrl, options);
  if (req.statusCode >= 400) {
    const error = new Error(req.body);
    error.statusCode = req.statusCode;
    throw error;
  }

  return req.body;
};

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

  try {
    return await attemptRequest(url, options);
  } catch (error) {
    if (internalOptions?.fallbackUrl && !error.statusCode) {
      return attemptRequest(internalOptions.fallbackUrl, options);
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
