import requests from 'requestretry';

export const makeRequest = async (url, options, internalOptions) => {
  if (internalOptions?.token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${internalOptions.token}`,
    };
  }

  return requests(url, options);
};
