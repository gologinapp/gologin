import { request as httpRequest } from 'http';
import { get as _get, request as httpsRequest } from 'https';

import packageJson from '../../package.json' with { type: 'json' };
import { loadHttpsProxyAgent } from './lazy-deps.js';

const { version } = packageJson;

const TIMEZONE_URL = 'https://geo.myip.link';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 1;
const DEFAULT_RETRY_DELAY_MS = 1000;

const delay = (timeMs) => new Promise((resolve) => setTimeout(resolve, timeMs));

const shouldRetryRequest = ({ error, attempt, maxAttempts }) => {
  if (attempt >= maxAttempts) {
    return false;
  }

  if (error.statusCode) {
    return error.statusCode >= 500;
  }

  return true;
};

const createRequestSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
};

const parseJsonBody = (text) => {
  if (!text) {
    return null;
  }

  return JSON.parse(text);
};

const readResponseBody = async (response, options) => {
  const shouldParseJson = options.json === true || (options.json && typeof options.json === 'object');

  if (shouldParseJson) {
    const text = await response.text();

    return parseJsonBody(text);
  }

  return response.text();
};

const buildRequestHeaders = ({ options, internalOptions }) => {
  const headers = {
    ...options.headers,
    'User-Agent': options.headers?.['User-Agent'] || `gologin-nodejs-sdk/${version}`,
  };

  if (internalOptions?.token) {
    headers.Authorization = `Bearer ${internalOptions.token}`;
  }

  return headers;
};

const buildRequestBody = (options) => {
  if (options.json !== undefined && options.json !== true) {
    return JSON.stringify(options.json);
  }

  return options.body;
};

const buildFetchInit = ({ options, internalOptions }) => {
  const headers = buildRequestHeaders({ options, internalOptions });
  const body = buildRequestBody(options);

  if (options.json !== undefined && options.json !== true) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  return {
    method: options.method || 'GET',
    headers,
    body: body ?? undefined,
  };
};

const parseProxyResponseBody = (text, options) => {
  const shouldParseJson = options.json === true || (options.json && typeof options.json === 'object');

  if (shouldParseJson) {
    return parseJsonBody(text);
  }

  return text;
};

const normalizeProxyUrl = (proxyUrl) => {
  const parsed = new URL(proxyUrl);

  if (parsed.protocol === 'https:') {
    parsed.protocol = 'http:';
  }

  return parsed.toString();
};

const executeProxyRequest = async (url, options, internalOptions) => {
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const HttpsProxyAgent = await loadHttpsProxyAgent();
  const agent = new HttpsProxyAgent(normalizeProxyUrl(options.proxy), {
    timeout: timeoutMs,
  });
  const headers = buildRequestHeaders({ options, internalOptions });
  const body = buildRequestBody(options);
  const method = options.method || 'GET';
  const parsedUrl = new URL(url);
  const requestFn = parsedUrl.protocol === 'http:' ? httpRequest : httpsRequest;

  if (options.json !== undefined && options.json !== true) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const requestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method,
    headers,
    agent,
    timeout: timeoutMs,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;

    const settle = (handler) => (value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      handler(value);
    };

    const req = requestFn(requestOptions, (response) => {
      let responseText = '';

      response.on('data', (chunk) => {
        responseText += chunk;
      });

      response.on('end', () => {
        if (response.statusCode >= 400) {
          const error = new Error(responseText);
          error.statusCode = response.statusCode;

          settle(reject)(error);

          return;
        }

        settle(resolve)(parseProxyResponseBody(responseText, options));
      });

      response.on('error', settle(reject));
    });

    timeoutId = setTimeout(() => {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
      settle(reject)(timeoutError);
      req.destroy(timeoutError);
    }, timeoutMs);

    req.on('error', settle(reject));
    req.on('timeout', () => {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
      settle(reject)(timeoutError);
      req.destroy(timeoutError);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
};

const executeFetch = async (url, options = {}, internalOptions) => {
  if (options.proxy) {
    const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
    const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    const retryDelayMs = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await executeProxyRequest(url, options, internalOptions);
      } catch (error) {
        lastError = error;

        if (!shouldRetryRequest({ error, attempt, maxAttempts })) {
          throw error;
        }

        await delay(retryDelayMs);
      }
    }

    throw lastError;
  }

  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { signal, clear } = createRequestSignal(timeoutMs);

    try {
      const init = buildFetchInit({ options, internalOptions });
      init.signal = signal;

      const response = await fetch(url, init);
      clear();

      const body = await readResponseBody(response, options);

      if (response.status >= 400) {
        const errorMessage = typeof body === 'string' ? body : JSON.stringify(body);
        const error = new Error(errorMessage);
        error.statusCode = response.status;

        throw error;
      }

      return body;
    } catch (error) {
      clear();
      lastError = error;

      if (!shouldRetryRequest({ error, attempt, maxAttempts })) {
        throw error;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError;
};

export const makeRequest = async (url, options = {}, internalOptions) => {
  try {
    return await executeFetch(url, options, internalOptions);
  } catch (error) {
    console.log('makeRequest error', error);
    if (internalOptions?.fallbackUrl && !error.statusCode) {
      return executeFetch(internalOptions.fallbackUrl, options, internalOptions);
    }

    throw error;
  }
};

export const fetchHeadWithRetry = async (url, options = {}) => {
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { signal, clear } = createRequestSignal(timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal,
      });

      clear();

      if (response.status >= 400) {
        const error = new Error(`HEAD request failed with status ${response.status}`);
        error.statusCode = response.status;

        throw error;
      }

      const responseUrl = new URL(response.url);

      return {
        req: { path: `${responseUrl.pathname}${responseUrl.search}` },
        statusCode: response.status,
      };
    } catch (error) {
      clear();
      lastError = error;

      if (!shouldRetryRequest({ error, attempt, maxAttempts })) {
        throw error;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError;
};

export const fetchBufferWithRetry = async (url, options = {}) => {
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { signal, clear } = createRequestSignal(timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal,
      });

      clear();

      if (response.status >= 400) {
        const error = new Error(`GET request failed with status ${response.status}`);
        error.statusCode = response.status;

        throw error;
      }

      const arrayBuffer = await response.arrayBuffer();

      return Buffer.from(arrayBuffer);
    } catch (error) {
      clear();
      lastError = error;

      if (!shouldRetryRequest({ error, attempt, maxAttempts })) {
        throw error;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError;
};

export const fetchToWriteStream = async (url, writeStream, options = {}) => {
  const buffer = await fetchBufferWithRetry(url, options);

  await new Promise((resolve, reject) => {
    writeStream.write(buffer, (error) => {
      if (error) {
        reject(error);

        return;
      }

      writeStream.end(resolve);
    });
  });
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
