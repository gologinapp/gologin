import { get as _get } from 'https';
import requests from 'requestretry';

const TIMEZONE_URL = 'https://geo.myip.link';

const createTimeoutPromise = (timeoutMs) => new Promise((_, reject) => {
  setTimeout(() => {
    reject(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);
});

const attemptRequest = async (requestUrl, options) => {
  const requestPromise = requests(requestUrl, options);

  let req;
  if (options.proxy) {
    const timeoutPromise = createTimeoutPromise(options.timeout || 30000);
    req = await Promise.race([requestPromise, timeoutPromise]);
  } else {
    req = await requestPromise;
  }

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
  _get(TIMEZONE_URL, { agent, timeout: 8000 }, (res) => {
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
